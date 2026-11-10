export interface CsvQuestionRow {
  id_soal: string;
  jenis_soal: 'PG' | 'Kompleks';
  wacana: string;
  teks_soal: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  opsi_e: string;
  kunci_jawaban: string[];
  bobot: number;
}

export interface CsvStudentRow {
  nama: string;
  kelas: string;
  tingkat: '10' | '11' | '12' | 'LAINNYA';
  token_ujian?: string;
}

export interface ScoredQuestionItem {
  id: number | string;
  tipe_soal: 'PG' | 'Kompleks' | string;
  kunci_jawaban: string[];
  bobot?: number;
}

export interface QuestionScoreBreakdown {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  status: 'Benar Penuh' | 'Benar Sebagian' | 'Salah';
}

export interface ExamScoreSummary {
  rawEarned: number;
  rawMax: number;
  normalizedScore: number; // 0 - 100
  kategoriNilai:
    | 'Sangat Baik (A)'
    | 'Baik (B)'
    | 'Cukup (C)'
    | 'Perlu Bimbingan (D)';
  breakdown: QuestionScoreBreakdown[];
}

/**
 * Generates a unique 6-character alphanumeric uppercase token (excluding ambiguous O/0/I/1)
 */
export function generateExamToken(seed?: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    const randIndex =
      seed !== undefined
        ? (seed * (i + 13) + i * 7) % chars.length
        : Math.floor(Math.random() * chars.length);
    token += chars[randIndex];
  }
  return token;
}

/**
 * Detects grade level (Tingkat 10 / 11 / 12) from a class name string
 */
export function extractTingkatFromKelas(
  kelas: string
): '10' | '11' | '12' | 'LAINNYA' {
  const upper = (kelas || '').toUpperCase().trim();
  if (/^(XII|12)\b/.test(upper) || /\b(XII|12)\b/.test(upper)) {
    return '12';
  }
  if (/^(XI|11)\b/.test(upper) || /\b(XI|11)\b/.test(upper)) {
    return '11';
  }
  if (/^(X|10)\b/.test(upper) || /\b(X|10)\b/.test(upper)) {
    return '10';
  }
  return 'LAINNYA';
}

/**
 * Checks whether an exam distributed to (target_tingkat, target_kelas) applies to a student's class
 */
export function isExamMatchedForStudentClass(
  exam: { target_tingkat?: string; target_kelas?: string },
  studentKelas: string
): boolean {
  const cleanTargetKelas = (exam.target_kelas || 'SEMUA').toUpperCase().trim();
  const cleanStudentKelas = (studentKelas || '').toUpperCase().trim();

  if (cleanTargetKelas !== 'SEMUA' && cleanTargetKelas !== '') {
    return cleanTargetKelas === cleanStudentKelas;
  }

  const cleanTargetTingkat = (
    exam.target_tingkat || 'SEMUA'
  ).toUpperCase().trim();
  if (cleanTargetTingkat === 'SEMUA' || cleanTargetTingkat === '') {
    return true;
  }

  const studentTingkat = extractTingkatFromKelas(studentKelas);
  return cleanTargetTingkat === studentTingkat;
}

/**
 * Normalizes answer arrays into sorted uppercase single-letter keys (['A', 'C'])
 */
export function normalizeAnswerKeys(
  keys: string[] | string | undefined | null
): string[] {
  if (!keys) return [];
  const rawString = Array.isArray(keys) ? keys.join(',') : String(keys);
  // Strip common Indonesian/English label prefixes so words like "Jawaban" or "Pilihan" don't contribute A/B/E letters
  const cleanedPrefix = rawString
    .replace(/\b(kunci|jawaban|pilihan|opsi|option|answer|key|benar| dan | atau )\b/gi, ' ')
    .trim();

  const rawList = cleanedPrefix
    .split(/[,;|/+\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const validSet = new Set<string>();
  for (const item of rawList) {
    const clean = item.toUpperCase().replace(/[^A-E]/g, '');
    if (clean.length === 1 && ['A', 'B', 'C', 'D', 'E'].includes(clean)) {
      validSet.add(clean);
    } else if (clean.length > 1 && /^[A-E]+$/i.test(item.replace(/[^a-zA-Z]/g, ''))) {
      for (const ch of clean.split('')) {
        if (['A', 'B', 'C', 'D', 'E'].includes(ch)) {
          validSet.add(ch);
        }
      }
    }
  }
  return Array.from(validSet).sort();
}

/**
 * Resolves answer keys from a CSV cell, supporting letter keys ("B", "B,D,E", "Jawaban: C")
 * as well as full option text matching if the teacher pasted the answer text instead of A-E.
 */
export function resolveQuestionAnswerKeys(
  rawKunci: string,
  opsi: { A: string; B: string; C: string; D: string; E: string }
): string[] {
  const trimmed = (rawKunci || '').trim();
  if (!trimmed) return [];

  // First check if the raw value directly matches one of the option texts
  const lowerTrimmed = trimmed.toLowerCase();
  for (const letter of ['A', 'B', 'C', 'D', 'E'] as const) {
    const optText = (opsi[letter] || '').trim().toLowerCase();
    if (optText.length > 1 && optText === lowerTrimmed) {
      return [letter];
    }
  }

  // Also check if leading letter pattern like "A. Teks..." or "B) Teks..."
  const leadingMatch = trimmed.match(/^([A-Ea-e])\s*[.)\]:-]\s+.+$/);
  if (leadingMatch) {
    return [leadingMatch[1].toUpperCase()];
  }

  return normalizeAnswerKeys(trimmed);
}

/**
 * Calculates deterministic CBT score according to the specification:
 * - PG Biasa: 2 Poin (or custom bobot) if exact match, 0 if wrong.
 * - PG Kompleks:
 *    - Benar Semua: 3 Poin (or custom bobot)
 *    - Benar Sebagian: 1 - 2 Poin
 *    - Salah: 0 Poin
 */
export function calculateExamScore(
  questionsList: ScoredQuestionItem[],
  studentAnswers: Record<string, string[]>
): ExamScoreSummary {
  let rawEarned = 0;
  let rawMax = 0;
  const breakdown: QuestionScoreBreakdown[] = [];

  for (const q of questionsList) {
    const qId = String(q.id);
    const isKompleks =
      q.tipe_soal.toLowerCase().includes('kompleks') ||
      q.kunci_jawaban.length > 1;
    const defaultMax = isKompleks ? 3 : 2;
    const maxPoints = q.bobot && q.bobot > 0 ? q.bobot : defaultMax;
    rawMax += maxPoints;

    const correctKeys = normalizeAnswerKeys(q.kunci_jawaban);
    const chosenKeys = normalizeAnswerKeys(studentAnswers[qId] || []);

    if (chosenKeys.length === 0 || correctKeys.length === 0) {
      breakdown.push({
        questionId: qId,
        earnedPoints: 0,
        maxPoints,
        status: 'Salah',
      });
      continue;
    }

    if (!isKompleks) {
      const isCorrect =
        chosenKeys.length === 1 && chosenKeys[0] === correctKeys[0];
      const earned = isCorrect ? maxPoints : 0;
      rawEarned += earned;
      breakdown.push({
        questionId: qId,
        earnedPoints: earned,
        maxPoints,
        status: isCorrect ? 'Benar Penuh' : 'Salah',
      });
    } else {
      const matchedCount = chosenKeys.filter((k) =>
        correctKeys.includes(k)
      ).length;
      const wrongCount = chosenKeys.filter(
        (k) => !correctKeys.includes(k)
      ).length;

      if (matchedCount === correctKeys.length && wrongCount === 0) {
        rawEarned += maxPoints;
        breakdown.push({
          questionId: qId,
          earnedPoints: maxPoints,
          maxPoints,
          status: 'Benar Penuh',
        });
      } else if (matchedCount > 0 && matchedCount > wrongCount) {
        const netRatio = (matchedCount - wrongCount) / correctKeys.length;
        const partialPoints = netRatio >= 0.6 ? Math.min(2, maxPoints - 1) : 1;
        const safePartial = Math.max(1, partialPoints);
        rawEarned += safePartial;
        breakdown.push({
          questionId: qId,
          earnedPoints: safePartial,
          maxPoints,
          status: 'Benar Sebagian',
        });
      } else {
        breakdown.push({
          questionId: qId,
          earnedPoints: 0,
          maxPoints,
          status: 'Salah',
        });
      }
    }
  }

  const normalizedScore =
    rawMax > 0 ? Math.round((rawEarned / rawMax) * 100) : 0;

  let kategoriNilai: ExamScoreSummary['kategoriNilai'] = 'Perlu Bimbingan (D)';
  if (normalizedScore >= 85) kategoriNilai = 'Sangat Baik (A)';
  else if (normalizedScore >= 70) kategoriNilai = 'Baik (B)';
  else if (normalizedScore >= 55) kategoriNilai = 'Cukup (C)';

  return {
    rawEarned,
    rawMax,
    normalizedScore,
    kategoriNilai,
    breakdown,
  };
}

/**
 * Automatically detects the column delimiter (';', '\t', or ',') used in a CSV/TSV line
 * so commas inside Indonesian sentences never break semicolon-separated Excel files.
 */
export function detectCsvDelimiter(line: string): ',' | ';' | '\t' {
  let inQuotes = false;
  let countComma = 0;
  let countSemi = 0;
  let countTab = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === ';') countSemi++;
      else if (ch === '\t') countTab++;
      else if (ch === ',') countComma++;
    }
  }

  if (countTab > 0 && countTab >= countSemi && countTab >= countComma) {
    return '\t';
  }
  // If there are multiple semicolons (e.g. >= 4 in a question row), prefer ';' even if unquoted prose has commas
  if (countSemi > 0 && (countSemi >= countComma || countSemi >= 4)) {
    return ';';
  }
  return ',';
}

/**
 * Splits raw CSV text into row records while respecting double-quoted multiline cells.
 * Internal newlines inside quoted fields are converted to spaces so each record is a single clean line.
 */
export function splitCsvRecords(rawText: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && rawText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && rawText[i + 1] === '\n') {
        i++;
      }
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        records.push(trimmed);
      }
      current = '';
    } else if ((ch === '\n' || ch === '\r') && inQuotes) {
      if (ch === '\r' && rawText[i + 1] === '\n') {
        i++;
      }
      current += ' ';
    } else {
      current += ch;
    }
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed.length > 0) {
    records.push(finalTrimmed);
  }

  return records;
}

/**
 * Parses a single CSV/TSV line handling double-quoted fields and a specific delimiter
 */
export function splitCsvLine(
  line: string,
  forcedDelimiter?: ',' | ';' | '\t'
): string[] {
  const delimiter = forcedDelimiter || detectCsvDelimiter(line);
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Converts HTML <table> (.xls) or raw CSV/TSV text into clean lines, removing BOM and 'sep=' directives
 */
export function normalizeSpreadsheetLines(rawInput: string): {
  lines: string[];
  delimiter: ',' | ';' | '\t';
} {
  const cleanText = (rawInput || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim();

  // Support importing HTML-based .xls files ONLY if the file starts with HTML document tags
  const isHtmlDocument = /^<(?:!DOCTYPE\s+html|html|table|xml|meta)[\s>]/i.test(cleanText);
  if (isHtmlDocument && /<table[\s>]/i.test(cleanText) && /<tr[\s>]/i.test(cleanText)) {
    const trMatches = cleanText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const extractedLines: string[] = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      if (cellMatches.length === 0) continue;
      const cells = cellMatches.map((cell) =>
        cell
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/\r?\n/g, ' ')
          .trim()
      );
      if (cells.some(Boolean)) {
        extractedLines.push(cells.join('\t'));
      }
    }
    return { lines: extractedLines, delimiter: '\t' };
  }

  let forcedDelimiter: ',' | ';' | '\t' | undefined;
  const rawRecords = splitCsvRecords(cleanText);

  const filteredLines: string[] = [];
  for (const line of rawRecords) {
    if (/^["']?sep\s*=\s*(.|\\t)["']?[;,\t]*$/i.test(line)) {
      const m = line.match(/^["']?sep\s*=\s*(.|\\t)["']?/i);
      if (m) {
        if (m[1] === ';') forcedDelimiter = ';';
        else if (m[1] === ',') forcedDelimiter = ',';
        else if (m[1] === '\t' || m[1] === '\\t') forcedDelimiter = '\t';
      }
      continue;
    }
    // Skip instructional comment lines starting with #
    if (line.startsWith('#')) continue;
    filteredLines.push(line);
  }

  const detected =
    forcedDelimiter ||
    (filteredLines.length > 0 ? detectCsvDelimiter(filteredLines[0]) : ';');

  return { lines: filteredLines, delimiter: detected };
}

/**
 * Parses Bulk Student CSV / Excel content.
 * Supports headers: nama (or nama_siswa), kelas, and optional token_ujian
 * Also supports headerless 2-column lines: "Nama Siswa;Kelas" or "Nama Siswa,Kelas"
 */
export function parseStudentsCsv(csvText: string): {
  rows: CsvStudentRow[];
  errors: string[];
} {
  const { lines, delimiter } = normalizeSpreadsheetLines(csvText);

  if (lines.length === 0) {
    return {
      rows: [],
      errors: ['File CSV/Excel atau daftar siswa kosong.'],
    };
  }

  const firstCells = splitCsvLine(lines[0], delimiter).map((c) =>
    c.toLowerCase().replace(/^["']|["']$/g, '').trim()
  );

  const hasHeader = firstCells.some((c) =>
    [
      'nama',
      'nama_siswa',
      'nama lengkap',
      'nama siswa',
      'kelas',
      'kelas / rombel',
      'rombel',
    ].includes(c)
  );

  let namaIdx = 0;
  let kelasIdx = 1;
  let tokenIdx = -1;

  if (hasHeader) {
    namaIdx = firstCells.findIndex((c) =>
      ['nama', 'nama_siswa', 'nama lengkap', 'nama siswa'].includes(c)
    );
    kelasIdx = firstCells.findIndex((c) =>
      ['kelas', 'kelas / rombel', 'rombel', 'tingkat_kelas'].includes(c)
    );
    tokenIdx = firstCells.findIndex((c) =>
      ['token', 'token_ujian', 'token ujian (6 karakter)'].includes(c)
    );
    if (namaIdx === -1) namaIdx = 0;
    if (kelasIdx === -1) kelasIdx = 1;
  }

  const startRow = hasHeader ? 1 : 0;
  const rows: CsvStudentRow[] = [];
  const errors: string[] = [];

  for (let i = startRow; i < lines.length; i++) {
    let cells = splitCsvLine(lines[i], delimiter);
    if (cells.length <= 1) {
      cells = splitCsvLine(lines[i], detectCsvDelimiter(lines[i]));
    }
    const cleanCells = cells.map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cleanCells.every((c) => !c)) continue;

    const nama = cleanCells[namaIdx] || '';
    const kelas = cleanCells[kelasIdx] || '';
    const rawToken =
      tokenIdx >= 0 ? (cleanCells[tokenIdx] || '').toUpperCase().trim() : '';

    if (!nama || !kelas) {
      errors.push(
        `Baris ${i + 1}: Kolom Nama Siswa dan Kelas wajib terisi.`
      );
      continue;
    }

    rows.push({
      nama,
      kelas,
      tingkat: extractTingkatFromKelas(kelas),
      token_ujian: rawToken.length === 6 ? rawToken : undefined,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Tidak ada baris data siswa yang valid ditemukan.');
  }

  return { rows, errors };
}

const QUESTION_HEADER_ALIASES: Record<string, string[]> = {
  id_soal: [
    'id_soal',
    'id',
    'no',
    'nomor',
    'no_soal',
    'nomor_soal',
    'kode',
    'kode_soal',
  ],
  jenis_soal: [
    'jenis_soal',
    'tipe_soal',
    'jenis',
    'tipe',
    'kategori',
    'bentuk_soal',
    'model_soal',
  ],
  wacana: [
    'wacana',
    'stimulus',
    'bacaan',
    'teks_bacaan',
    'pengantar',
    'cerita',
    'narasi',
    'kasus',
    'deskripsi',
  ],
  teks_soal: [
    'teks_soal',
    'soal',
    'pertanyaan',
    'butir_soal',
    'pokok_soal',
    'kalimat_soal',
    'question',
    'text',
    'stem',
  ],
  opsi_a: ['opsi_a', 'pilihan_a', 'option_a', 'jawaban_a', 'jawab_a', 'a'],
  opsi_b: ['opsi_b', 'pilihan_b', 'option_b', 'jawaban_b', 'jawab_b', 'b'],
  opsi_c: ['opsi_c', 'pilihan_c', 'option_c', 'jawaban_c', 'jawab_c', 'c'],
  opsi_d: ['opsi_d', 'pilihan_d', 'option_d', 'jawaban_d', 'jawab_d', 'd'],
  opsi_e: ['opsi_e', 'pilihan_e', 'option_e', 'jawaban_e', 'jawab_e', 'e'],
  kunci_jawaban: [
    'kunci_jawaban',
    'kunci',
    'jawaban',
    'jawaban_benar',
    'kunci_jawab',
    'answer',
    'key',
    'correct_answer',
  ],
  bobot: [
    'bobot',
    'poin',
    'skor',
    'nilai',
    'bobot_nilai',
    'bobot_soal',
    'weight',
    'score',
    'point',
    'points',
  ],
};

function normalizeHeaderToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses Question Bank CSV / Excel content.
 * Supports:
 * - Standard 11-column template (id_soal, jenis_soal, wacana, teks_soal, opsi_a..opsi_e, kunci_jawaban, bobot)
 * - Flexible header names (e.g., no, soal, a, b, c, d, e, kunci, skor)
 * - Multiline quoted wacana/questions
 * - Headerless CSV rows (positional mapping for 6 to 11+ columns)
 * - Optional trailing columns (bobot, opsi_e, wacana, jenis_soal, id_soal)
 */
export function parseQuestionsCsv(csvText: string): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const { lines, delimiter: initialDelimiter } =
    normalizeSpreadsheetLines(csvText);

  if (lines.length === 0) {
    return {
      rows: [],
      errors: ['File CSV/Excel kosong atau tidak memiliki baris data soal.'],
    };
  }

  // Scan the first up to 10 lines to find a header row (in case there are title rows above the table)
  let headerRowIdx = -1;
  let activeDelimiter = initialDelimiter;
  const colIndex: Record<string, number> = {};

  for (let scanIdx = 0; scanIdx < Math.min(lines.length, 10); scanIdx++) {
    const candidateDelim = detectCsvDelimiter(lines[scanIdx]) || initialDelimiter;
    const candidateCells = splitCsvLine(lines[scanIdx], candidateDelim).map(
      normalizeHeaderToken
    );

    const matchedCols: Record<string, number> = {};
    candidateCells.forEach((cellToken, idx) => {
      if (!cellToken) return;
      for (const [canonical, aliases] of Object.entries(
        QUESTION_HEADER_ALIASES
      )) {
        if (
          matchedCols[canonical] === undefined &&
          aliases.includes(cellToken)
        ) {
          matchedCols[canonical] = idx;
        }
      }
    });

    // If it matches teks_soal (or opsi_a + opsi_b) and at least 3 known columns, treat as header row
    const matchCount = Object.keys(matchedCols).length;
    if (
      matchCount >= 3 &&
      (matchedCols.teks_soal !== undefined ||
        (matchedCols.opsi_a !== undefined && matchedCols.opsi_b !== undefined))
    ) {
      headerRowIdx = scanIdx;
      activeDelimiter = candidateDelim;
      Object.assign(colIndex, matchedCols);
      break;
    }
  }

  let startRow = 0;

  if (headerRowIdx >= 0) {
    startRow = headerRowIdx + 1;
    // If header had opsi_a..d and kunci_jawaban but used an unrecognized header name for teks_soal, infer teks_soal
    if (colIndex.teks_soal === undefined && colIndex.opsi_a !== undefined && colIndex.opsi_a > 0) {
      colIndex.teks_soal = colIndex.opsi_a - 1;
    }
  } else {
    // Check if row 0 looks like a malformed header row (contains words like "soal" or "opsi" without valid options/keys)
    const firstTokens = splitCsvLine(lines[0], activeDelimiter).map(
      normalizeHeaderToken
    );
    if (
      lines.length === 1 &&
      firstTokens.some((t) =>
        ['id_soal', 'teks_soal', 'pertanyaan', 'kunci_jawaban'].includes(t)
      )
    ) {
      return {
        rows: [],
        errors: ['File CSV/Excel hanya berisi baris judul kolom tanpa data soal.'],
      };
    }

    // Positional mapping for headerless CSVs based on column count
    const sampleCells = splitCsvLine(lines[0], activeDelimiter);
    const colCount = sampleCells.length;
    if (colCount >= 10) {
      colIndex.id_soal = 0;
      colIndex.jenis_soal = 1;
      colIndex.wacana = 2;
      colIndex.teks_soal = 3;
      colIndex.opsi_a = 4;
      colIndex.opsi_b = 5;
      colIndex.opsi_c = 6;
      colIndex.opsi_d = 7;
      colIndex.opsi_e = 8;
      colIndex.kunci_jawaban = 9;
      colIndex.bobot = 10;
    } else if (colCount === 9) {
      colIndex.id_soal = 0;
      colIndex.wacana = 1;
      colIndex.teks_soal = 2;
      colIndex.opsi_a = 3;
      colIndex.opsi_b = 4;
      colIndex.opsi_c = 5;
      colIndex.opsi_d = 6;
      colIndex.opsi_e = 7;
      colIndex.kunci_jawaban = 8;
    } else if (colCount === 8) {
      colIndex.id_soal = 0;
      colIndex.teks_soal = 1;
      colIndex.opsi_a = 2;
      colIndex.opsi_b = 3;
      colIndex.opsi_c = 4;
      colIndex.opsi_d = 5;
      colIndex.opsi_e = 6;
      colIndex.kunci_jawaban = 7;
    } else if (colCount === 7) {
      colIndex.teks_soal = 0;
      colIndex.opsi_a = 1;
      colIndex.opsi_b = 2;
      colIndex.opsi_c = 3;
      colIndex.opsi_d = 4;
      colIndex.opsi_e = 5;
      colIndex.kunci_jawaban = 6;
    } else if (colCount === 6) {
      colIndex.teks_soal = 0;
      colIndex.opsi_a = 1;
      colIndex.opsi_b = 2;
      colIndex.opsi_c = 3;
      colIndex.opsi_d = 4;
      colIndex.kunci_jawaban = 5;
    } else {
      return {
        rows: [],
        errors: [
          'Format kolom CSV soal tidak dikenali. Pastikan minimal terdapat kolom: teks_soal, opsi_a, opsi_b, opsi_c, opsi_d, dan kunci_jawaban.',
        ],
      };
    }
  }

  const rows: CsvQuestionRow[] = [];
  const errors: string[] = [];

  for (let i = startRow; i < lines.length; i++) {
    let cells = splitCsvLine(lines[i], activeDelimiter);
    if (cells.length <= 2) {
      const altDelim = detectCsvDelimiter(lines[i]);
      if (altDelim !== activeDelimiter) {
        const altCells = splitCsvLine(lines[i], altDelim);
        if (altCells.length > cells.length) {
          cells = altCells;
        }
      }
    }

    const cleanCells = cells.map((c) => c.replace(/^["']|["']$/g, '').trim());
    // Skip completely empty rows
    if (cleanCells.every((c) => !c)) continue;

    const getVal = (col: string): string => {
      const idx = colIndex[col];
      if (idx === undefined || idx < 0 || idx >= cleanCells.length) return '';
      return cleanCells[idx] || '';
    };

    const seqNum = rows.length + 1;
    const id_soal =
      getVal('id_soal') || `SOAL-${String(seqNum).padStart(2, '0')}`;
    const wacana = getVal('wacana');
    const teks_soal = getVal('teks_soal');
    const opsi_a = getVal('opsi_a');
    const opsi_b = getVal('opsi_b');
    const opsi_c = getVal('opsi_c');
    const opsi_d = getVal('opsi_d');
    const opsi_e = getVal('opsi_e');

    if (!teks_soal) {
      errors.push(`Baris ${i + 1} (${id_soal}): Teks pertanyaan soal kosong.`);
      continue;
    }

    const kunci_jawaban = resolveQuestionAnswerKeys(getVal('kunci_jawaban'), {
      A: opsi_a,
      B: opsi_b,
      C: opsi_c,
      D: opsi_d,
      E: opsi_e,
    });

    if (kunci_jawaban.length === 0) {
      errors.push(
        `Baris ${i + 1} (${id_soal}): Kunci jawaban tidak valid ("${getVal(
          'kunci_jawaban'
        )}"). Gunakan huruf A-E (misal "B" atau "B,D,E").`
      );
      continue;
    }

    const rawJenis = getVal('jenis_soal').toUpperCase();
    const jenis_soal: 'PG' | 'Kompleks' =
      rawJenis.includes('KOMPLEKS') ||
      rawJenis === 'PGK' ||
      rawJenis.includes('MULTI') ||
      kunci_jawaban.length > 1
        ? 'Kompleks'
        : 'PG';

    const rawBobot = parseInt(getVal('bobot'), 10);
    const bobot =
      !isNaN(rawBobot) && rawBobot > 0
        ? rawBobot
        : jenis_soal === 'Kompleks'
          ? 3
          : 2;

    rows.push({
      id_soal,
      jenis_soal,
      wacana,
      teks_soal,
      opsi_a,
      opsi_b,
      opsi_c,
      opsi_d,
      opsi_e,
      kunci_jawaban,
      bobot,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Tidak ditemukan baris soal yang valid di dalam file CSV/Excel.');
  }

  return { rows, errors };
}

// ============================================================================
// EXCEL-READY TEMPLATES & WORKBOOK EXPORT GENERATORS (SEPARATE COLUMNS)
// ============================================================================

/**
 * CSV Template for Bulk Student Upload — uses sep=; and semicolon delimiter
 * so Microsoft Excel automatically opens Nama Siswa in Column A and Kelas in Column B.
 */
export const SAMPLE_STUDENT_CSV_TEMPLATE = `\uFEFFsep=;
nama_siswa;kelas
Aditya Pratama;X MIPA 1
Siti Nurhaliza;X MIPA 2
Bagas Setiawan;XI MIPA 1
Putri Maharani;XI IPS 1
Reza Rahadian;XII MIPA 1
Aulia Rahman;XII IPS 2`;

/**
 * CSV Template for Bulk Question Upload — uses sep=; and semicolon delimiter
 * so Microsoft Excel automatically splits all 11 columns (id_soal..bobot) into Columns A-K
 * while preserving commas inside sentences and complex answer keys ("B,D,E").
 */
export const SAMPLE_CSV_TEMPLATE = `\uFEFFsep=;
id_soal;jenis_soal;wacana;teks_soal;opsi_a;opsi_b;opsi_c;opsi_d;opsi_e;kunci_jawaban;bobot
SOAL-01;PG;"Perhatikan konsep interaksi sosial dalam masyarakat multikultural. Interaksi sosial terjadi apabila memenuhi dua syarat utama menurut Soerjono Soekanto.";"Manakah dua syarat utama terjadinya interaksi sosial di masyarakat?";Asimilasi dan Akulturasi;Kontak Sosial dan Komunikasi;Imitasi dan Identifikasi;Sugesti dan Simpati;Kerja Sama dan Akomodasi;B;2
SOAL-02;Kompleks;"Sebuah penelitian sosiologi mengkaji dampak modernisasi dan digitalisasi terhadap perubahan perilaku remaja di perkotaan (Soal HOTS - Pilihan Ganda Kompleks: Benar Semua = 3 Poin, Benar Sebagian = 1-2 Poin, Salah = 0 Poin).";"Manakah dari pernyataan berikut yang termasuk dampak positif perubahan sosial akibat digitalisasi pendidikan? (Pilih lebih dari satu jawaban benar)";Menurunnya interaksi tatap muka antaranggota keluarga di rumah;Kemudahan akses literatur ilmiah dan jurnal pendidikan dari berbagai daerah;Meningkatnya penyebaran berita bohong (hoaks) tanpa verifikasi sumber;Terbukanya ruang kolaborasi belajar lintas sekolah secara daring;Efisiensi distribusi materi evaluasi berbasis komputer (CBT);"B,D,E";3
SOAL-03;PG;"Stratifikasi sosial dalam masyarakat dapat bersifat terbuka (open social stratification) maupun tertutup (closed social stratification).";"Faktor utama yang mendorong terjadinya mobilitas sosial vertikal naik pada masyarakat berstratifikasi terbuka adalah...";Garis keturunan keluarga bangsawan sejak lahir;Sistem kasta tradisional yang mengikat pekerjaan;Pendidikan tinggi dan keahlian profesional individu;Pembatasan hak politik berdasarkan suku bangsa;Warisan gelar adat yang tidak dapat dipindahtangankan;C;2`;

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildExcelHtmlTable(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): string {
  const thCells = headers
    .map(
      (h) =>
        `<th style="background-color:#1e40af;color:#ffffff;font-weight:bold;padding:8px 12px;border:1px solid #94a3b8;text-align:left;font-family:Calibri,Arial,sans-serif;font-size:11pt;">${escapeHtml(
          h
        )}</th>`
    )
    .join('');

  const bodyRows = rows
    .map((row, rIdx) => {
      const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const tds = row
        .map(
          (cell) =>
            `<td style="background-color:${bg};padding:6px 10px;border:1px solid #cbd5e1;vertical-align:top;mso-number-format:'\\@';font-family:Calibri,Arial,sans-serif;font-size:11pt;">${escapeHtml(
              cell
            )}</td>`
        )
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>${escapeHtml(sheetName.slice(0, 30))}</x:Name>
        <x:WorksheetOptions>
          <x:DisplayGridlines/>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
</head>
<body>
  <table border="1" cellspacing="0" cellpadding="4">
    <thead>
      <tr>${thCells}</tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
</body>
</html>`;
}

export function generateStudentTemplateExcel(): string {
  return buildExcelHtmlTable(
    'Template Siswa CBT',
    ['nama_siswa', 'kelas'],
    [
      ['Aditya Pratama', 'X MIPA 1'],
      ['Siti Nurhaliza', 'X MIPA 2'],
      ['Bagas Setiawan', 'XI MIPA 1'],
      ['Putri Maharani', 'XI IPS 1'],
      ['Reza Rahadian', 'XII MIPA 1'],
      ['Aulia Rahman', 'XII IPS 2'],
    ]
  );
}

export function generateQuestionTemplateExcel(): string {
  return buildExcelHtmlTable(
    'Template Soal CBT',
    [
      'id_soal',
      'jenis_soal',
      'wacana',
      'teks_soal',
      'opsi_a',
      'opsi_b',
      'opsi_c',
      'opsi_d',
      'opsi_e',
      'kunci_jawaban',
      'bobot',
    ],
    [
      [
        'SOAL-01',
        'PG',
        'Perhatikan konsep interaksi sosial dalam masyarakat multikultural. Interaksi sosial terjadi apabila memenuhi dua syarat utama menurut Soerjono Soekanto.',
        'Manakah dua syarat utama terjadinya interaksi sosial di masyarakat?',
        'Asimilasi dan Akulturasi',
        'Kontak Sosial dan Komunikasi',
        'Imitasi dan Identifikasi',
        'Sugesti dan Simpati',
        'Kerja Sama dan Akomodasi',
        'B',
        2,
      ],
      [
        'SOAL-02',
        'Kompleks',
        'Sebuah penelitian sosiologi mengkaji dampak modernisasi dan digitalisasi terhadap perubahan perilaku remaja di perkotaan (Soal HOTS - PG Kompleks: Benar Semua = 3 Poin, Benar Sebagian = 1-2 Poin, Salah = 0 Poin).',
        'Manakah dari pernyataan berikut yang termasuk dampak positif perubahan sosial akibat digitalisasi pendidikan? (Pilih lebih dari satu jawaban benar)',
        'Menurunnya interaksi tatap muka antaranggota keluarga di rumah',
        'Kemudahan akses literatur ilmiah dan jurnal pendidikan dari berbagai daerah',
        'Meningkatnya penyebaran berita bohong (hoaks) tanpa verifikasi sumber',
        'Terbukanya ruang kolaborasi belajar lintas sekolah secara daring',
        'Efisiensi distribusi materi evaluasi berbasis komputer (CBT)',
        'B,D,E',
        3,
      ],
      [
        'SOAL-03',
        'PG',
        'Stratifikasi sosial dalam masyarakat dapat bersifat terbuka (open social stratification) maupun tertutup (closed social stratification).',
        'Faktor utama yang mendorong terjadinya mobilitas sosial vertikal naik pada masyarakat berstratifikasi terbuka adalah...',
        'Garis keturunan keluarga bangsawan sejak lahir',
        'Sistem kasta tradisional yang mengikat pekerjaan',
        'Pendidikan tinggi dan keahlian profesional individu',
        'Pembatasan hak politik berdasarkan suku bangsa',
        'Warisan gelar adat yang tidak dapat dipindahtangankan',
        'C',
        2,
      ],
    ]
  );
}

export interface CognitiveQuestionInput {
  id: number | string;
  exam_id?: number;
  teks_soal?: string;
  tipe_soal: 'PG' | 'Kompleks' | string;
  data_opsi?: {
    wacana?: string;
    opsi?: { A: string; B: string; C: string; D: string; E: string };
  } | null;
  kunci_jawaban: string[];
  bobot?: number;
}

/**
 * Classifies a question into LOTS (Lower-Order Thinking Skills: C1-C3)
 * vs HOTS (Higher-Order Thinking Skills: C4-C6).
 */
export function classifyQuestionCognitiveLevel(
  question: CognitiveQuestionInput
): 'LOTS' | 'HOTS' {
  if (
    question.tipe_soal === 'Kompleks' ||
    (Array.isArray(question.kunci_jawaban) && question.kunci_jawaban.length > 1) ||
    (question.bobot && question.bobot >= 3)
  ) {
    return 'HOTS';
  }

  const soalText = (question.teks_soal || '').trim();
  if (
    /\b(analisis|analisislah|evaluasi|evaluasilah|kesimpulan|simpulkan|bandingkan|kritik|kritisi|argumen|solusi|strategi|mengapa|faktor penyebab|dampak|implikasi|telaah)\b/i.test(
      soalText
    )
  ) {
    return 'HOTS';
  }

  return 'LOTS';
}

/**
 * Calculates an individual student's LOTS (0-100) and HOTS (0-100) mastery scores
 * based on their question-level answers, with a deterministic fallback if question breakdown is unavailable.
 */
export function calculateStudentLotsVsHots(
  examQuestions: CognitiveQuestionInput[],
  jawabanSiswa?: Record<string, string[]> | null,
  fallbackScore = 0,
  analisisAi?: unknown | null
): {
  lotsScore: number;
  hotsScore: number;
  lotsQuestionCount: number;
  hotsQuestionCount: number;
} {
  const clamp = (val: number) =>
    Math.max(0, Math.min(100, Math.round(val * 10) / 10));

  const lotsQuestions = examQuestions.filter(
    (q) => classifyQuestionCognitiveLevel(q) === 'LOTS'
  );
  const hotsQuestions = examQuestions.filter(
    (q) => classifyQuestionCognitiveLevel(q) === 'HOTS'
  );

  const hasAnswers =
    jawabanSiswa &&
    typeof jawabanSiswa === 'object' &&
    Object.keys(jawabanSiswa).length > 0;

  let lotsScore: number | null = null;
  let hotsScore: number | null = null;

  if (hasAnswers && lotsQuestions.length > 0) {
    const lotsSummary = calculateExamScore(lotsQuestions, jawabanSiswa!);
    if (lotsSummary.rawMax > 0) {
      lotsScore = lotsSummary.normalizedScore;
    }
  }

  if (hasAnswers && hotsQuestions.length > 0) {
    const hotsSummary = calculateExamScore(hotsQuestions, jawabanSiswa!);
    if (hotsSummary.rawMax > 0) {
      hotsScore = hotsSummary.normalizedScore;
    }
  }

  const baseScore = Number(fallbackScore) || 0;
  const aiObj = analisisAi as { evaluasi_hots?: string } | null | undefined;
  const hotsText = (aiObj?.evaluasi_hots || '').toLowerCase();
  const isStrongHotsAi =
    hotsText.includes('sangat kuat') ||
    hotsText.includes('sangat baik') ||
    hotsText.includes('mampu mengintegrasikan');

  if (lotsScore === null && hotsScore !== null) {
    lotsScore = clamp(Math.min(100, hotsScore * 1.08 + 4));
  } else if (hotsScore === null && lotsScore !== null) {
    hotsScore = clamp(
      isStrongHotsAi ? lotsScore * 0.96 : Math.max(0, lotsScore * 0.86 - 2)
    );
  } else if (lotsScore === null && hotsScore === null) {
    if (baseScore <= 0) {
      lotsScore = 0;
      hotsScore = 0;
    } else if (isStrongHotsAi || baseScore >= 85) {
      lotsScore = clamp(Math.min(100, baseScore * 1.04));
      hotsScore = clamp(Math.min(100, baseScore * 0.96));
    } else if (baseScore >= 70) {
      lotsScore = clamp(Math.min(100, baseScore * 1.08));
      hotsScore = clamp(Math.max(0, baseScore * 0.91));
    } else {
      lotsScore = clamp(Math.min(100, baseScore * 1.14));
      hotsScore = clamp(Math.max(0, baseScore * 0.84));
    }
  }

  return {
    lotsScore: lotsScore ?? 0,
    hotsScore: hotsScore ?? 0,
    lotsQuestionCount: lotsQuestions.length,
    hotsQuestionCount: hotsQuestions.length,
  };
}

export interface ClassAnalyticsItem {
  kelas: string;
  shortKelas: string;
  tingkat: '10' | '11' | '12' | 'LAINNYA';
  totalStudents: number;
  statusCounts: {
    belumMulai: number;
    sedangUjian: number;
    selesai: number;
    diblokir: number;
  };
  resultCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number; // score >= 70
  passRate: number; // 0 - 100
  lotsScore: number; // 0 - 100 average LOTS mastery
  hotsScore: number; // 0 - 100 average HOTS mastery
  cognitiveGap: number; // lotsScore - hotsScore
  lotsMasteryCount: number; // students with lotsScore >= 70
  hotsMasteryCount: number; // students with hotsScore >= 70
  lotsMasteryRate: number; // 0 - 100
  hotsMasteryRate: number; // 0 - 100
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
  analyzedCount: number;
}

function formatShortClassLabel(kelas: string): string {
  const clean = (kelas || '').trim();
  if (clean.length <= 16) return clean;
  const parts = clean.split(/\s+/);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1]} ${parts[2].slice(0, 3)}.`;
  }
  return `${clean.slice(0, 14)}…`;
}

export function computeClassAnalytics(
  studentsList: {
    id: number;
    nama: string;
    kelas: string;
    status_ujian?: string;
  }[],
  resultsList: {
    id: number;
    student_id: number;
    exam_id: number;
    skor_angka: number;
    jawaban_siswa?: Record<string, string[]> | null;
    analisis_ai?: unknown | null;
  }[],
  extraClassNames: string[] = [],
  questionsList: CognitiveQuestionInput[] = []
): {
  perClass: ClassAnalyticsItem[];
  overall: ClassAnalyticsItem;
} {
  const classNamesSet = new Set<string>();
  for (const s of studentsList) {
    if (s.kelas && s.kelas.trim()) classNamesSet.add(s.kelas.trim());
  }
  for (const extra of extraClassNames) {
    if (extra && extra.trim()) classNamesSet.add(extra.trim());
  }

  const studentById = new Map<
    number,
    { id: number; nama: string; kelas: string; status_ujian?: string }
  >();
  for (const s of studentsList) {
    studentById.set(s.id, s);
  }

  const buildMetricsForGroup = (
    labelKelas: string,
    groupStudents: typeof studentsList,
    groupResults: typeof resultsList
  ): ClassAnalyticsItem => {
    const scores = groupResults.map((r) => Number(r.skor_angka) || 0);
    const resultCount = scores.length;
    const sum = scores.reduce((acc, v) => acc + v, 0);
    const averageScore =
      resultCount > 0 ? Math.round((sum / resultCount) * 10) / 10 : 0;
    const highestScore = resultCount > 0 ? Math.max(...scores) : 0;
    const lowestScore = resultCount > 0 ? Math.min(...scores) : 0;
    const passCount = scores.filter((sc) => sc >= 70).length;
    const passRate =
      resultCount > 0 ? Math.round((passCount / resultCount) * 100) : 0;

    const studentCognitiveBreakdowns = groupResults.map((r) => {
      const examQs = questionsList.filter(
        (q) => q.exam_id === undefined || Number(q.exam_id) === Number(r.exam_id)
      );
      return calculateStudentLotsVsHots(
        examQs.length > 0 ? examQs : questionsList,
        r.jawaban_siswa,
        Number(r.skor_angka) || 0,
        r.analisis_ai
      );
    });

    const lotsSum = studentCognitiveBreakdowns.reduce(
      (acc, item) => acc + item.lotsScore,
      0
    );
    const hotsSum = studentCognitiveBreakdowns.reduce(
      (acc, item) => acc + item.hotsScore,
      0
    );
    const lotsScore =
      resultCount > 0 ? Math.round((lotsSum / resultCount) * 10) / 10 : 0;
    const hotsScore =
      resultCount > 0 ? Math.round((hotsSum / resultCount) * 10) / 10 : 0;
    const cognitiveGap = Math.round((lotsScore - hotsScore) * 10) / 10;

    const lotsMasteryCount = studentCognitiveBreakdowns.filter(
      (item) => item.lotsScore >= 70
    ).length;
    const hotsMasteryCount = studentCognitiveBreakdowns.filter(
      (item) => item.hotsScore >= 70
    ).length;
    const lotsMasteryRate =
      resultCount > 0 ? Math.round((lotsMasteryCount / resultCount) * 100) : 0;
    const hotsMasteryRate =
      resultCount > 0 ? Math.round((hotsMasteryCount / resultCount) * 100) : 0;

    const gradeDistribution = {
      A: scores.filter((sc) => sc >= 85).length,
      B: scores.filter((sc) => sc >= 70 && sc < 85).length,
      C: scores.filter((sc) => sc >= 55 && sc < 70).length,
      D: scores.filter((sc) => sc < 55).length,
    };

    const statusCounts = {
      belumMulai: groupStudents.filter(
        (s) => (s.status_ujian || 'Belum Mulai') === 'Belum Mulai'
      ).length,
      sedangUjian: groupStudents.filter(
        (s) => s.status_ujian === 'Sedang Ujian'
      ).length,
      selesai: groupStudents.filter((s) => s.status_ujian === 'Selesai').length,
      diblokir: groupStudents.filter((s) => s.status_ujian === 'Diblokir')
        .length,
    };

    const analyzedCount = groupResults.filter((r) =>
      Boolean(r.analisis_ai)
    ).length;

    return {
      kelas: labelKelas,
      shortKelas: formatShortClassLabel(labelKelas),
      tingkat:
        labelKelas === 'SEMUA KELAS'
          ? 'LAINNYA'
          : extractTingkatFromKelas(labelKelas),
      totalStudents: groupStudents.length,
      statusCounts,
      resultCount,
      averageScore,
      highestScore,
      lowestScore,
      passCount,
      passRate,
      lotsScore,
      hotsScore,
      cognitiveGap,
      lotsMasteryCount,
      hotsMasteryCount,
      lotsMasteryRate,
      hotsMasteryRate,
      gradeDistribution,
      analyzedCount,
    };
  };

  const sortedClassNames = Array.from(classNamesSet).sort((a, b) => {
    const tA = extractTingkatFromKelas(a);
    const tB = extractTingkatFromKelas(b);
    if (tA !== tB) return tA.localeCompare(tB);
    return a.localeCompare(b);
  });

  const perClass = sortedClassNames.map((kls) => {
    const klsStudents = studentsList.filter(
      (s) => s.kelas.trim().toLowerCase() === kls.toLowerCase()
    );
    const klsStudentIds = new Set(klsStudents.map((s) => s.id));
    const klsResults = resultsList.filter((r) => {
      if (klsStudentIds.has(r.student_id)) return true;
      const st = studentById.get(r.student_id);
      return st ? st.kelas.trim().toLowerCase() === kls.toLowerCase() : false;
    });
    return buildMetricsForGroup(kls, klsStudents, klsResults);
  });

  const overall = buildMetricsForGroup('SEMUA KELAS', studentsList, resultsList);

  return { perClass, overall };
}

export function buildSemicolonCsv(
  headers: string[],
  rows: (string | number)[][]
): string {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '').replace(/\r?\n/g, ' ').trim();
    if (str.includes(';') || str.includes('"') || str.includes(',')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    '\uFEFFsep=;',
    headers.map(escapeCell).join(';'),
    ...rows.map((r) => r.map(escapeCell).join(';')),
  ];
  return lines.join('\n');
}

export interface StudentLoginClassOption {
  kelas: string;
  tingkat: '10' | '11' | '12' | 'LAINNYA';
  studentCount: number;
}

export function getStudentLoginClasses(
  studentsList: { kelas: string }[]
): StudentLoginClassOption[] {
  const map = new Map<string, { displayKelas: string; count: number }>();

  for (const s of studentsList) {
    const clean = (s.kelas || '').trim();
    if (!clean) continue;
    const key = clean.toUpperCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { displayKelas: clean, count: 1 });
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      kelas: item.displayKelas,
      tingkat: extractTingkatFromKelas(item.displayKelas),
      studentCount: item.count,
    }))
    .sort((a, b) => {
      if (a.tingkat !== b.tingkat) return a.tingkat.localeCompare(b.tingkat);
      return a.kelas.localeCompare(b.kelas, 'id');
    });
}

export function getStudentsForClass<
  T extends { id: number; nama: string; kelas: string }
>(studentsList: T[], selectedKelas: string): T[] {
  const target = (selectedKelas || '').trim().toLowerCase();
  if (!target) return [];

  return studentsList
    .filter((s) => (s.kelas || '').trim().toLowerCase() === target)
    .slice()
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

export function validateStudentCascadingLogin<
  T extends {
    id: number;
    nama: string;
    kelas: string;
    token_ujian: string;
    status_ujian?: string;
  }
>(params: {
  students: T[];
  selectedKelas: string;
  selectedStudentId: string | number;
  tokenInput: string;
}): { ok: true; student: T } | { ok: false; error: string } {
  const cleanKelas = (params.selectedKelas || '').trim();
  if (!cleanKelas) {
    return {
      ok: false,
      error: 'Silakan pilih Kelas / Rombel Anda terlebih dahulu (Langkah 1).',
    };
  }

  const classStudents = getStudentsForClass(params.students, cleanKelas);
  if (classStudents.length === 0) {
    return {
      ok: false,
      error: `Tidak ditemukan daftar siswa pada kelas "${cleanKelas}".`,
    };
  }

  const idStr = String(params.selectedStudentId ?? '').trim();
  if (!idStr) {
    return {
      ok: false,
      error: 'Silakan pilih Nama Lengkap Anda dari daftar siswa kelas (Langkah 2).',
    };
  }

  const selectedStudent = classStudents.find((s) => String(s.id) === idStr);
  if (!selectedStudent) {
    return {
      ok: false,
      error: 'Nama siswa yang dipilih tidak ditemukan pada kelas tersebut.',
    };
  }

  const cleanToken = (params.tokenInput || '').trim().toUpperCase();
  if (!cleanToken || cleanToken.length !== 6) {
    return {
      ok: false,
      error: 'Token Ujian harus terdiri dari 6 karakter alfanumerik (Langkah 3).',
    };
  }

  if ((selectedStudent.token_ujian || '').trim().toUpperCase() !== cleanToken) {
    return {
      ok: false,
      error: `Token Ujian tidak sesuai untuk siswa "${selectedStudent.nama}" (${selectedStudent.kelas}). Pastikan Anda memasukkan 6 karakter token milik Anda sendiri.`,
    };
  }

  if (selectedStudent.status_ujian === 'Diblokir') {
    return {
      ok: false,
      error:
        'Akses ujian Anda sedang DIBLOKIR / DIKUNCI karena pelanggaran aturan keamanan (Anti-Cheat) atau dikunci oleh Pengawas. Silakan hubungi Guru Pengawas untuk membuka kunci status ujian Anda.',
    };
  }

  if (selectedStudent.status_ujian === 'Selesai') {
    return {
      ok: false,
      error:
        'Anda telah menyelesaikan ujian dengan akun ini (Status: Selesai). Hubungi Guru Pengawas jika status ujian Anda perlu di-reset ke Belum Mulai.',
    };
  }

  return { ok: true, student: selectedStudent };
}


