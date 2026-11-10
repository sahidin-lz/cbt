import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  CsvQuestionRow,
  CsvStudentRow,
  parseQuestionsCsv,
  parseStudentsCsv,
  splitCsvLine,
  detectCsvDelimiter,
  normalizeAnswerKeys,
} from './cbtLogic';

export interface ParsedQuestionsOutcome {
  rows: CsvQuestionRow[];
  errors: string[];
  formatDetected: string;
  csvRepresentation: string;
}

export interface ParsedStudentsOutcome {
  rows: CsvStudentRow[];
  errors: string[];
  formatDetected: string;
  csvRepresentation: string;
}

/**
 * Normalizes header names for flexible column matching in Excel/Word/CSV
 */
function normalizeColHeader(raw: string): string {
  return (raw || '')
    .toString()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses a 2D grid of cell values (from XLSX, HTML tables, etc.) into CsvQuestionRow[]
 */
export function parseGridToQuestionRows(grid: (string | number | boolean | null | undefined)[][]): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!grid || grid.length === 0) {
    return { rows: [], errors: ['Tabel data kosong.'] };
  }

  // Convert each cell to string
  const strGrid = grid.map((row) =>
    (row || []).map((cell) => {
      if (cell === null || cell === undefined) return '';
      return String(cell).trim();
    })
  );

  // Look for header row in the first 15 rows
  let headerIdx = -1;
  const colMap: Record<string, number> = {};

  const HEADER_PATTERNS: Record<string, string[]> = {
    id_soal: ['id_soal', 'id', 'no', 'nomor', 'no_soal', 'nomor_soal', 'kode', 'kode_soal'],
    jenis_soal: ['jenis_soal', 'tipe_soal', 'jenis', 'tipe', 'bentuk_soal', 'model_soal', 'kategori'],
    wacana: ['wacana', 'stimulus', 'bacaan', 'teks_bacaan', 'pengantar', 'cerita', 'narasi', 'kasus'],
    teks_soal: ['teks_soal', 'soal', 'pertanyaan', 'butir_soal', 'pokok_soal', 'question', 'text', 'stem'],
    opsi_a: ['opsi_a', 'pilihan_a', 'option_a', 'jawaban_a', 'jawab_a', 'a'],
    opsi_b: ['opsi_b', 'pilihan_b', 'option_b', 'jawaban_b', 'jawab_b', 'b'],
    opsi_c: ['opsi_c', 'pilihan_c', 'option_c', 'jawaban_c', 'jawab_c', 'c'],
    opsi_d: ['opsi_d', 'pilihan_d', 'option_d', 'jawaban_d', 'jawab_d', 'd'],
    opsi_e: ['opsi_e', 'pilihan_e', 'option_e', 'jawaban_e', 'jawab_e', 'e'],
    kunci_jawaban: ['kunci_jawaban', 'kunci', 'jawaban', 'jawaban_benar', 'kunci_jawab', 'answer', 'key', 'correct'],
    bobot: ['bobot', 'poin', 'skor', 'nilai', 'bobot_nilai', 'score', 'points', 'weight'],
  };

  for (let r = 0; r < Math.min(strGrid.length, 15); r++) {
    const row = strGrid[r];
    const normTokens = row.map(normalizeColHeader);
    const hasSoal = normTokens.some((t) => HEADER_PATTERNS.teks_soal.includes(t));
    const hasKunci = normTokens.some((t) => HEADER_PATTERNS.kunci_jawaban.includes(t));
    const hasOpsi = normTokens.some((t) =>
      HEADER_PATTERNS.opsi_a.includes(t) ||
      HEADER_PATTERNS.opsi_b.includes(t) ||
      t.includes('opsi') ||
      t.includes('pilihan')
    );

    if (hasSoal || (hasKunci && hasOpsi)) {
      headerIdx = r;
      normTokens.forEach((tok, idx) => {
        for (const [key, aliases] of Object.entries(HEADER_PATTERNS)) {
          if (aliases.includes(tok) && colMap[key] === undefined) {
            colMap[key] = idx;
          }
        }
      });
      break;
    }
  }

  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  const parsedRows: CsvQuestionRow[] = [];

  for (let r = startRow; r < strGrid.length; r++) {
    const cells = strGrid[r];
    // Filter completely blank rows
    if (cells.every((c) => !c)) continue;

    let id_soal = '';
    let jenis_soal: 'PG' | 'Kompleks' = 'PG';
    let wacana = '';
    let teks_soal = '';
    let opsi_a = '';
    let opsi_b = '';
    let opsi_c = '';
    let opsi_d = '';
    let opsi_e = '';
    let rawKunci = '';
    let bobot = 2;

    if (headerIdx >= 0 && colMap.teks_soal !== undefined) {
      id_soal = colMap.id_soal !== undefined ? cells[colMap.id_soal] || '' : '';
      const rawJenis = colMap.jenis_soal !== undefined ? cells[colMap.jenis_soal] || '' : '';
      wacana = colMap.wacana !== undefined ? cells[colMap.wacana] || '' : '';
      teks_soal = cells[colMap.teks_soal] || '';
      opsi_a = colMap.opsi_a !== undefined ? cells[colMap.opsi_a] || '' : '';
      opsi_b = colMap.opsi_b !== undefined ? cells[colMap.opsi_b] || '' : '';
      opsi_c = colMap.opsi_c !== undefined ? cells[colMap.opsi_c] || '' : '';
      opsi_d = colMap.opsi_d !== undefined ? cells[colMap.opsi_d] || '' : '';
      opsi_e = colMap.opsi_e !== undefined ? cells[colMap.opsi_e] || '' : '';
      rawKunci = colMap.kunci_jawaban !== undefined ? cells[colMap.kunci_jawaban] || '' : '';
      const rawBobot = colMap.bobot !== undefined ? cells[colMap.bobot] || '' : '';

      if (rawJenis.toLowerCase().includes('kompleks')) {
        jenis_soal = 'Kompleks';
      }
      if (rawBobot) {
        const num = Number(rawBobot);
        if (!isNaN(num) && num > 0) bobot = num;
      }
    } else {
      // Positional fallback for tables without recognized header
      // If 11 columns: id, jenis, wacana, teks, a, b, c, d, e, kunci, bobot
      if (cells.length >= 10) {
        id_soal = cells[0];
        const rawJenis = cells[1];
        if (rawJenis.toLowerCase().includes('kompleks')) jenis_soal = 'Kompleks';
        wacana = cells[2];
        teks_soal = cells[3];
        opsi_a = cells[4];
        opsi_b = cells[5];
        opsi_c = cells[6];
        opsi_d = cells[7];
        opsi_e = cells[8];
        rawKunci = cells[9];
        if (cells[10]) bobot = Number(cells[10]) || (jenis_soal === 'Kompleks' ? 3 : 2);
      } else if (cells.length >= 7) {
        // 7-8 columns: no/soal, a, b, c, d, (e), kunci, (bobot)
        if (cells.length >= 8 && !/^[A-E]$/i.test(cells[6])) {
          id_soal = cells[0];
          teks_soal = cells[1];
          opsi_a = cells[2];
          opsi_b = cells[3];
          opsi_c = cells[4];
          opsi_d = cells[5];
          opsi_e = cells[6];
          rawKunci = cells[7];
        } else {
          teks_soal = cells[0];
          opsi_a = cells[1];
          opsi_b = cells[2];
          opsi_c = cells[3];
          opsi_d = cells[4];
          opsi_e = cells[5];
          rawKunci = cells[6];
        }
      } else if (cells.length >= 6) {
        teks_soal = cells[0];
        opsi_a = cells[1];
        opsi_b = cells[2];
        opsi_c = cells[3];
        opsi_d = cells[4];
        rawKunci = cells[5];
      }
    }

    // Skip if question text or options are completely missing
    if (!teks_soal || (!opsi_a && !opsi_b)) {
      continue;
    }

    const kunci_jawaban = normalizeAnswerKeys(rawKunci);
    if (kunci_jawaban.length > 1) {
      jenis_soal = 'Kompleks';
      if (bobot <= 2) bobot = 3;
    } else if (jenis_soal === 'Kompleks' && bobot <= 2) {
      bobot = 3;
    }

    parsedRows.push({
      id_soal: id_soal || `SOAL-${String(parsedRows.length + 1).padStart(2, '0')}`,
      jenis_soal,
      wacana,
      teks_soal,
      opsi_a,
      opsi_b,
      opsi_c,
      opsi_d,
      opsi_e,
      kunci_jawaban: kunci_jawaban.length > 0 ? kunci_jawaban : ['A'],
      bobot,
    });
  }

  if (parsedRows.length === 0) {
    errors.push('Tidak ada butir soal yang berhasil diekstrak dari tabel.');
  }

  return { rows: parsedRows, errors };
}

/**
 * Parses Word (.docx / .doc) or plain text formatted questions:
 * E.g.:
 * 1. Pertanyaan...
 * A. Opsi A
 * B. Opsi B
 * C. Opsi C
 * D. Opsi D
 * E. Opsi E
 * Kunci: A
 */
export function parseTextDocumentQuestions(rawText: string): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ['Dokumen teks kosong.'] };
  }

  const rows: CsvQuestionRow[] = [];
  let currentWacana = '';
  let currentId = '';
  let currentQuestionText = '';
  let currentOpsi: Record<'A' | 'B' | 'C' | 'D' | 'E', string> = {
    A: '',
    B: '',
    C: '',
    D: '',
    E: '',
  };
  let currentKunci: string[] = [];
  let currentBobot = 2;
  let currentTipe: 'PG' | 'Kompleks' = 'PG';
  let activeOpsiKey: 'A' | 'B' | 'C' | 'D' | 'E' | null = null;

  const pushCurrentQuestion = () => {
    if (currentQuestionText.trim() && (currentOpsi.A || currentOpsi.B)) {
      const keys = currentKunci.length > 0 ? currentKunci : ['A'];
      const isKompleks = currentTipe === 'Kompleks' || keys.length > 1;
      rows.push({
        id_soal: currentId || `SOAL-${String(rows.length + 1).padStart(2, '0')}`,
        jenis_soal: isKompleks ? 'Kompleks' : 'PG',
        wacana: currentWacana,
        teks_soal: currentQuestionText.trim(),
        opsi_a: currentOpsi.A.trim(),
        opsi_b: currentOpsi.B.trim(),
        opsi_c: currentOpsi.C.trim(),
        opsi_d: currentOpsi.D.trim(),
        opsi_e: currentOpsi.E.trim(),
        kunci_jawaban: keys,
        bobot: currentBobot || (isKompleks ? 3 : 2),
      });
    }

    currentId = '';
    currentQuestionText = '';
    currentOpsi = { A: '', B: '', C: '', D: '', E: '' };
    currentKunci = [];
    currentBobot = 2;
    currentTipe = 'PG';
    activeOpsiKey = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect stimulus / wacana header
    const wacanaMatch = line.match(/^(?:wacana|stimulus|bacaan|teks\s+bacaan)\s*[:=-]\s*(.*)$/i);
    if (wacanaMatch) {
      currentWacana = wacanaMatch[1].trim();
      continue;
    }

    // Detect Question number like: "1.", "1)", "[1]", "No. 1", "Soal 1:"
    const qNumMatch = line.match(/^(?:no\.?|soal)?\s*([0-9]{1,3})[\s.)\]:-]+\s*(.+)$/i);
    if (qNumMatch && !line.match(/^[A-Ea-e][\s.)\]:-]/)) {
      pushCurrentQuestion();
      currentId = `SOAL-${qNumMatch[1].padStart(2, '0')}`;
      currentQuestionText = qNumMatch[2].trim();
      continue;
    }

    // Detect Answer Key like: "Kunci: A", "Kunci Jawaban: B, C", "Jawaban: D", "Key: A"
    const keyMatch = line.match(/^(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|key|ans)\s*[:=-]\s*([A-Ea-e,\s]+)/i);
    if (keyMatch) {
      currentKunci = normalizeAnswerKeys(keyMatch[1]);
      if (currentKunci.length > 1) {
        currentTipe = 'Kompleks';
        currentBobot = 3;
      }
      activeOpsiKey = null;
      continue;
    }

    // Detect Bobot like: "Bobot: 3", "Skor: 2", "Poin: 3"
    const bobotMatch = line.match(/^(?:bobot|skor|poin|nilai|points?)\s*[:=-]\s*([0-9]+)/i);
    if (bobotMatch) {
      currentBobot = Number(bobotMatch[1]) || 2;
      continue;
    }

    // Detect Options like: "A. ...", "A) ...", "[A] ...", "*A. ..."
    const optMatch = line.match(/^[*]?\s*([A-Ea-e])[\s.)\]:-]\s*(.*)$/);
    if (optMatch) {
      const optLetter = optMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      activeOpsiKey = optLetter;
      currentOpsi[optLetter] = optMatch[2].trim();
      if (line.startsWith('*')) {
        currentKunci.push(optLetter);
      }
      continue;
    }

    // Continuation line
    if (activeOpsiKey) {
      currentOpsi[activeOpsiKey] += ' ' + line;
    } else if (currentQuestionText) {
      currentQuestionText += ' ' + line;
    } else if (!currentWacana) {
      currentWacana = line;
    }
  }

  pushCurrentQuestion();

  return {
    rows,
    errors: rows.length > 0 ? [] : ['Tidak ada format butir soal teks yang terbaca.'],
  };
}

/**
 * Builds standard clean semicolon CSV representation from CsvQuestionRow[]
 */
export function buildQuestionsCsvText(rows: CsvQuestionRow[]): string {
  const header = 'id_soal;jenis_soal;wacana;teks_soal;opsi_a;opsi_b;opsi_c;opsi_d;opsi_e;kunci_jawaban;bobot';
  const csvLines = rows.map((r) => {
    const escapeField = (val: string | number) => {
      const s = String(val || '');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    return [
      escapeField(r.id_soal),
      escapeField(r.jenis_soal),
      escapeField(r.wacana || ''),
      escapeField(r.teks_soal),
      escapeField(r.opsi_a || ''),
      escapeField(r.opsi_b || ''),
      escapeField(r.opsi_c || ''),
      escapeField(r.opsi_d || ''),
      escapeField(r.opsi_e || ''),
      escapeField(r.kunci_jawaban.join(',')),
      escapeField(r.bobot || 2),
    ].join(';');
  });

  return [header, ...csvLines].join('\n');
}

/**
 * Universal Question File Parser:
 * Supports:
 * - Excel (.xlsx, .xls, .xlsm, .xlsb, .ods)
 * - Word (.docx, .doc)
 * - CSV (.csv, .tsv)
 * - Plain Text (.txt)
 */
export async function parseQuestionsFromFile(
  file: File | { name: string; buffer: ArrayBuffer }
): Promise<ParsedQuestionsOutcome> {
  const fileName = file.name || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let buffer: ArrayBuffer;
  if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer();
  } else {
    buffer = (file as { buffer: ArrayBuffer }).buffer;
  }

  // 1. Excel Formats (.xlsx, .xls, .ods, .csv, .tsv)
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return {
          rows: [],
          errors: ['File Excel tidak memiliki lembar kerja (worksheet).'],
          formatDetected: `Excel (.${ext})`,
          csvRepresentation: '',
        };
      }

      const worksheet = workbook.Sheets[firstSheetName];
      // Convert worksheet to 2D array of string/numbers
      const grid = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
        header: 1,
        defval: '',
        raw: false,
      });

      const { rows, errors } = parseGridToQuestionRows(grid);
      const csvRep = rows.length > 0 ? buildQuestionsCsvText(rows) : '';
      return {
        rows,
        errors,
        formatDetected: `Excel Spreadsheet (.${ext})`,
        csvRepresentation: csvRep,
      };
    } catch (err: any) {
      return {
        rows: [],
        errors: [`Gagal membaca file Excel (.${ext}): ${err.message || 'Format tidak valid'}`],
        formatDetected: `Excel (.${ext})`,
        csvRepresentation: '',
      };
    }
  }

  // 2. Word Formats (.docx)
  if (ext === 'docx') {
    try {
      // First try extracting HTML to see if there are <table> tables
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const htmlText = htmlResult.value || '';

      if (/<table[\s>]/i.test(htmlText)) {
        // Table found in Word document! Parse table cells into grid
        const trMatches = htmlText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
        const grid: string[][] = [];
        for (const tr of trMatches) {
          const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
          const rowCells = cellMatches.map((c) =>
            c
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&lt;/gi, '<')
              .replace(/&gt;/gi, '>')
              .replace(/&quot;/gi, '"')
              .trim()
          );
          if (rowCells.some(Boolean)) grid.push(rowCells);
        }

        const gridResult = parseGridToQuestionRows(grid);
        if (gridResult.rows.length > 0) {
          return {
            rows: gridResult.rows,
            errors: gridResult.errors,
            formatDetected: 'Word Document (.docx) - Tabel',
            csvRepresentation: buildQuestionsCsvText(gridResult.rows),
          };
        }
      }

      // If no table or table parse yielded 0 rows, parse as structured text
      const rawTextResult = await mammoth.extractRawText({ arrayBuffer: buffer });
      const docText = rawTextResult.value || '';
      const textResult = parseTextDocumentQuestions(docText);

      return {
        rows: textResult.rows,
        errors: textResult.errors,
        formatDetected: 'Word Document (.docx) - Teks Soal',
        csvRepresentation: textResult.rows.length > 0 ? buildQuestionsCsvText(textResult.rows) : '',
      };
    } catch (err: any) {
      return {
        rows: [],
        errors: [`Gagal membaca file Word (.docx): ${err.message || 'Format rusak'}`],
        formatDetected: 'Word Document (.docx)',
        csvRepresentation: '',
      };
    }
  }

  // 3. Plain Text / CSV / TSV / HTML-based .xls
  const decoder = new TextDecoder('utf-8');
  const textContent = decoder.decode(buffer);

  // Check if it's an HTML-based table (.xls from older export)
  if (/<table[\s>]/i.test(textContent) && /<tr[\s>]/i.test(textContent)) {
    const trMatches = textContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const grid: string[][] = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      const rowCells = cellMatches.map((c) =>
        c
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .trim()
      );
      if (rowCells.some(Boolean)) grid.push(rowCells);
    }
    const gridResult = parseGridToQuestionRows(grid);
    if (gridResult.rows.length > 0) {
      return {
        rows: gridResult.rows,
        errors: gridResult.errors,
        formatDetected: 'HTML Table / Excel (.xls)',
        csvRepresentation: buildQuestionsCsvText(gridResult.rows),
      };
    }
  }

  // Try standard CSV parser
  const csvParsed = parseQuestionsCsv(textContent);
  if (csvParsed.rows.length > 0) {
    return {
      rows: csvParsed.rows,
      errors: csvParsed.errors,
      formatDetected: `File CSV/TSV (.${ext || 'csv'})`,
      csvRepresentation: buildQuestionsCsvText(csvParsed.rows),
    };
  }

  // Try text question parser as fallback
  const textParsed = parseTextDocumentQuestions(textContent);
  if (textParsed.rows.length > 0) {
    return {
      rows: textParsed.rows,
      errors: textParsed.errors,
      formatDetected: 'Dokumen Teks Soal (.txt)',
      csvRepresentation: buildQuestionsCsvText(textParsed.rows),
    };
  }

  return {
    rows: [],
    errors: csvParsed.errors.concat(textParsed.errors),
    formatDetected: `File .${ext}`,
    csvRepresentation: '',
  };
}

/**
 * Universal Student File Parser:
 * Supports Excel (.xlsx, .xls, .ods) and CSV (.csv, .tsv, .txt)
 */
export async function parseStudentsFromFile(
  file: File | { name: string; buffer: ArrayBuffer }
): Promise<ParsedStudentsOutcome> {
  const fileName = file.name || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let buffer: ArrayBuffer;
  if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer();
  } else {
    buffer = (file as { buffer: ArrayBuffer }).buffer;
  }

  // 1. Excel Formats (.xlsx, .xls, .ods)
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return {
          rows: [],
          errors: ['File Excel tidak memiliki lembar kerja (worksheet).'],
          formatDetected: `Excel (.${ext})`,
          csvRepresentation: '',
        };
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const grid = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
        header: 1,
        defval: '',
        raw: false,
      });

      // Find Nama & Kelas columns
      const strGrid = grid.map((row) => (row || []).map((c) => String(c || '').trim()));
      let headerIdx = -1;
      let namaCol = -1;
      let kelasCol = -1;
      let tokenCol = -1;

      for (let r = 0; r < Math.min(strGrid.length, 10); r++) {
        const row = strGrid[r].map(normalizeColHeader);
        const nIdx = row.findIndex((t) => ['nama', 'nama_siswa', 'nama_lengkap', 'siswa'].includes(t));
        const kIdx = row.findIndex((t) => ['kelas', 'rombel', 'kelas_rombel'].includes(t));
        if (nIdx >= 0 && kIdx >= 0) {
          headerIdx = r;
          namaCol = nIdx;
          kelasCol = kIdx;
          tokenCol = row.findIndex((t) => ['token', 'token_ujian', 'kode'].includes(t));
          break;
        }
      }

      const studentRows: CsvStudentRow[] = [];
      const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;

      for (let r = startRow; r < strGrid.length; r++) {
        const cells = strGrid[r];
        if (cells.every((c) => !c)) continue;

        let nama = '';
        let kelas = '';
        let token: string | undefined = undefined;

        if (namaCol >= 0 && kelasCol >= 0) {
          nama = cells[namaCol] || '';
          kelas = cells[kelasCol] || '';
          if (tokenCol >= 0 && cells[tokenCol]) {
            token = cells[tokenCol].trim().toUpperCase();
          }
        } else if (cells.length >= 2) {
          nama = cells[0];
          kelas = cells[1];
          if (cells[2]) token = cells[2].trim().toUpperCase();
        }

        if (nama && kelas) {
          studentRows.push({
            nama: nama.trim(),
            kelas: kelas.trim(),
            tingkat: '10',
            token_ujian: token && token.length === 6 ? token : undefined,
          });
        }
      }

      const csvRep = studentRows.map((s) => `${s.nama};${s.kelas}${s.token_ujian ? ';' + s.token_ujian : ''}`).join('\n');
      return {
        rows: studentRows,
        errors: studentRows.length > 0 ? [] : ['Tidak ada baris siswa yang valid di file Excel.'],
        formatDetected: `Excel Spreadsheet (.${ext})`,
        csvRepresentation: csvRep,
      };
    } catch (err: any) {
      return {
        rows: [],
        errors: [`Gagal membaca Excel siswa: ${err.message || 'Format tidak valid'}`],
        formatDetected: `Excel (.${ext})`,
        csvRepresentation: '',
      };
    }
  }

  // 2. CSV / TXT / HTML
  const decoder = new TextDecoder('utf-8');
  const textContent = decoder.decode(buffer);
  const parsed = parseStudentsCsv(textContent);

  return {
    rows: parsed.rows,
    errors: parsed.errors,
    formatDetected: `CSV / File Teks (.${ext || 'csv'})`,
    csvRepresentation: textContent,
  };
}
