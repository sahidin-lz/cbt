import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  CsvQuestionRow,
  CsvStudentRow,
  parseQuestionsCsv,
  parseStudentsCsv,
  normalizeAnswerKeys,
} from './cbtLogic';
import { QuestionItem } from '../types/cbt';

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
 * Compresses an image DataURL or File in the browser using an offscreen HTMLCanvasElement
 * so embedded question/option images stay lightweight and fast inside Firestore.
 */
export async function compressImageDataUrl(
  rawDataUrl: string,
  maxDimension = 680,
  quality = 0.82
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return rawDataUrl;
  }
  // Keep small SVG/PNG/JPEG data URLs as-is if already under ~35KB
  if (rawDataUrl.length < 45000 || rawDataUrl.startsWith('data:image/svg+xml')) {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        // Fill white background so transparent PNGs convert cleanly to compact JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

/**
 * Converts a File object (e.g., from <input type="file"> or clipboard paste) into
 * a compressed inline [IMG:data:image/...] token ready to insert into question/option fields.
 */
export async function convertImageFileToInlineToken(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
  const compressed = await compressImageDataUrl(dataUrl);
  return `[IMG:${compressed}]`;
}

/**
 * Converts Office MathML (<m:oMath> / <m:oMathPara>) XML nodes from Microsoft Word (.docx)
 * into clean LaTeX ($...$) so native Word Equations (Alt + =) for Math, Physics, and Chemistry
 * are automatically recognized and rendered.
 */
export function convertOmmlXmlToLatex(ommlXml: string): string {
  if (!ommlXml || typeof DOMParser === 'undefined') return '';
  try {
    const wrapped = `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${ommlXml}</root>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(wrapped, 'application/xml');

    const getLocal = (el: Element) => (el.localName || el.tagName.split(':').pop() || '').toLowerCase();

    const findChild = (parent: Element, localName: string): Element | null => {
      for (let i = 0; i < parent.children.length; i++) {
        if (getLocal(parent.children[i]) === localName) {
          return parent.children[i];
        }
      }
      return null;
    };

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue || '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as Element;
      const name = getLocal(el);

      // Ignore property metadata nodes (<m:rPr>, <m:fPr>, <m:ctrlPr>, <w:rPr>, etc.)
      if (name.endsWith('pr')) {
        return '';
      }

      // Fraction <m:f><m:num>...</m:num><m:den>...</m:den></m:f>
      if (name === 'f') {
        const num = findChild(el, 'num');
        const den = findChild(el, 'den');
        return `\\frac{${num ? walkChildren(num) : ''}}{${den ? walkChildren(den) : ''}}`;
      }

      // Radical / Square Root <m:rad><m:deg>...</m:deg><m:e>...</m:e></m:rad>
      if (name === 'rad') {
        const deg = findChild(el, 'deg');
        const base = findChild(el, 'e');
        const degStr = deg ? walkChildren(deg).trim() : '';
        const baseStr = base ? walkChildren(base) : '';
        return degStr ? `\\sqrt[${degStr}]{${baseStr}}` : `\\sqrt{${baseStr}}`;
      }

      // Superscript <m:sSup><m:e>...</m:e><m:sup>...</m:sup></m:sSup>
      if (name === 'ssup') {
        const base = findChild(el, 'e');
        const sup = findChild(el, 'sup');
        return `{${base ? walkChildren(base) : ''}}^{${sup ? walkChildren(sup) : ''}}`;
      }

      // Subscript <m:sSub><m:e>...</m:e><m:sub>...</m:sub></m:sSub>
      if (name === 'ssub') {
        const base = findChild(el, 'e');
        const sub = findChild(el, 'sub');
        return `{${base ? walkChildren(base) : ''}}_{${sub ? walkChildren(sub) : ''}}`;
      }

      // Sub-Superscript <m:sSubSup><m:e>...</m:e><m:sub>...</m:sub><m:sup>...</m:sup></m:sSubSup>
      if (name === 'ssubsup') {
        const base = findChild(el, 'e');
        const sub = findChild(el, 'sub');
        const sup = findChild(el, 'sup');
        return `{${base ? walkChildren(base) : ''}}_{${sub ? walkChildren(sub) : ''}}^{${sup ? walkChildren(sup) : ''}}`;
      }

      // N-ary operator (Integral, Sum, Product) <m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>..</m:sub><m:sup>..</m:sup><m:e>..</m:e></m:nary>
      if (name === 'nary') {
        const naryPr = findChild(el, 'narypr');
        const chrEl = naryPr ? findChild(naryPr, 'chr') : null;
        const chrVal =
          chrEl?.getAttribute('m:val') ||
          chrEl?.getAttribute('val') ||
          '∫';
        let op = '\\int';
        if (chrVal.includes('∑')) op = '\\sum';
        else if (chrVal.includes('∏')) op = '\\prod';
        const sub = findChild(el, 'sub');
        const sup = findChild(el, 'sup');
        const expr = findChild(el, 'e');
        const subStr = sub ? walkChildren(sub).trim() : '';
        const supStr = sup ? walkChildren(sup).trim() : '';
        const exprStr = expr ? walkChildren(expr) : '';
        return `${op}${subStr ? `_{${subStr}}` : ''}${supStr ? `^{${supStr}}` : ''} ${exprStr}`;
      }

      // Delimiters / Brackets <m:d><m:dPr><m:begChr m:val="("/></m:dPr><m:e>...</m:e></m:d>
      if (name === 'd') {
        const dPr = findChild(el, 'dpr');
        const begEl = dPr ? findChild(dPr, 'begchr') : null;
        const endEl = dPr ? findChild(dPr, 'endchr') : null;
        const beg = begEl?.getAttribute('m:val') || begEl?.getAttribute('val') || '(';
        const end = endEl?.getAttribute('m:val') || endEl?.getAttribute('val') || ')';
        const eChildren: string[] = [];
        for (let i = 0; i < el.children.length; i++) {
          if (getLocal(el.children[i]) === 'e') {
            eChildren.push(walkChildren(el.children[i]));
          }
        }
        return `\\left${beg === '{' ? '\\{' : beg}${eChildren.join(', ')}\\right${end === '}' ? '\\}' : end}`;
      }

      // Accent / Vector <m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>...</m:e></m:acc>
      if (name === 'acc' || name === 'bar') {
        const expr = findChild(el, 'e');
        const inner = expr ? walkChildren(expr) : '';
        return name === 'bar' ? `\\overline{${inner}}` : `\\vec{${inner}}`;
      }

      // Matrix <m:m><m:mr><m:e>...</m:e></m:mr></m:m>
      if (name === 'm') {
        const rows: string[] = [];
        for (let i = 0; i < el.children.length; i++) {
          if (getLocal(el.children[i]) === 'mr') {
            const mr = el.children[i];
            const cells: string[] = [];
            for (let j = 0; j < mr.children.length; j++) {
              if (getLocal(mr.children[j]) === 'e') {
                cells.push(walkChildren(mr.children[j]));
              }
            }
            rows.push(cells.join(' & '));
          }
        }
        return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
      }

      // Limit / Lower / Upper <m:limLow>, <m:limUpp>
      if (name === 'limlow') {
        const expr = findChild(el, 'e');
        const lim = findChild(el, 'lim');
        return `${expr ? walkChildren(expr) : ''}_{${lim ? walkChildren(lim) : ''}}`;
      }

      return walkChildren(el);
    };

    const walkChildren = (parent: Element): string => {
      let out = '';
      for (let i = 0; i < parent.childNodes.length; i++) {
        out += walk(parent.childNodes[i]);
      }
      return out;
    };

    const latex = walkChildren(doc.documentElement).trim();
    return latex ? `$${latex}$` : '';
  } catch {
    return '';
  }
}

/**
 * Normalizes header names for flexible column matching in Excel/Word/CSV
 */
function normalizeColHeader(raw: string): string {
  return (raw || '')
    .toString()
    .toLowerCase()
    .replace(/\[IMG:[^\]]+\]/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Cleans an HTML fragment from Word (.docx / .doc) while PRESERVING:
 * - Embedded images (<img src="..."> -> [IMG:...])
 * - Superscripts and subscripts (<sup>...</sup>, <sub>...</sub>)
 * - LaTeX equations ($...$, $$...$$, [RUMUS:...])
 */
function cleanHtmlFragmentPreservingMediaAndMath(htmlFragment: string): string {
  if (!htmlFragment) return '';
  let s = htmlFragment;

  // 1. Convert <img ... src="..." ...> into [IMG:src]
  s = s.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (_m, src) => {
    return ` [IMG:${src.trim()}] `;
  });

  // 2. Preserve <sup> and <sub> via temporary placeholders
  const supSubPlaceholders: string[] = [];
  s = s.replace(/<(sup|sub)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag, inner) => {
    const cleanInner = inner.replace(/<[^>]+>/g, '').trim();
    if (!cleanInner) return '';
    const idx = supSubPlaceholders.length;
    const t = tag.toLowerCase();
    supSubPlaceholders.push(`<${t}>${cleanInner}</${t}>`);
    return `__CBT_SUPSUB_${idx}__`;
  });

  // 3. Preserve line breaks for paragraphs and <br>
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // 4. Restore <sup> and <sub>
  s = s.replace(/__CBT_SUPSUB_(\d+)__/g, (_m, idxStr) => {
    return supSubPlaceholders[Number(idxStr)] || '';
  });

  // 5. Collapse excessive spaces on each line
  return s
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Helper to parse stacked options (A. ... B. ... C. ... D. ... E. ...) inside a single Word table cell
 */
function parseStackedOptionsCell(rawCell: string): {
  A: string;
  B: string;
  C: string;
  D: string;
  E: string;
  detectedKunci: string[];
} {
  const result = { A: '', B: '', C: '', D: '', E: '', detectedKunci: [] as string[] };
  if (!rawCell || !rawCell.trim()) return result;

  // Also support inline A. ... B. ... on same line if separated by newlines or spaces before B./C./D./E.
  const normalized = rawCell.replace(
    /(\s+)(?=[*]?[A-E][.)\]:-]\s+)/g,
    '\n'
  );
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentKey: 'A' | 'B' | 'C' | 'D' | 'E' | null = null;
  for (const line of lines) {
    const match = line.match(/^([*]?)\s*([A-Ea-e])[.)\]:-]+\s*(.*)$/);
    if (match) {
      const starred = match[1] === '*';
      const letter = match[2].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      currentKey = letter;
      result[letter] = match[3].trim();
      if (starred && !result.detectedKunci.includes(letter)) {
        result.detectedKunci.push(letter);
      }
    } else if (currentKey) {
      result[currentKey] += (result[currentKey] ? ' ' : '') + line;
    }
  }
  return result;
}

/**
 * Helper to split combined "Wacana & Pertanyaan Soal" cell into { wacana, teks_soal }
 */
function parseCombinedWacanaAndSoalCell(rawCell: string): {
  wacana: string;
  teks_soal: string;
} {
  if (!rawCell || !rawCell.trim()) return { wacana: '', teks_soal: '' };
  const text = rawCell.trim();

  // Check if explicit "Soal:" / "Pertanyaan:" marker exists after a "Wacana:" / "Stimulus:" marker
  const explicitSplit = text.match(
    /^(?:wacana|stimulus|bacaan|narasi)\s*[:=-]\s*([\s\S]*?)\n+(?:soal|pertanyaan|butir\s+soal)\s*[:=-]\s*([\s\S]+)$/i
  );
  if (explicitSplit) {
    return {
      wacana: explicitSplit[1].trim(),
      teks_soal: explicitSplit[2].trim(),
    };
  }

  // Or if there is a line starting with "Soal:" / "Pertanyaan:"
  const lines = text.split(/\r?\n/);
  const soalLineIdx = lines.findIndex((l) =>
    /^(?:soal|pertanyaan|butir\s+soal)\s*[:=-]\s*/i.test(l.trim())
  );
  if (soalLineIdx > 0) {
    const wacanaPart = lines
      .slice(0, soalLineIdx)
      .join('\n')
      .replace(/^(?:wacana|stimulus|bacaan|narasi)\s*[:=-]\s*/i, '')
      .trim();
    const soalPart = lines
      .slice(soalLineIdx)
      .join('\n')
      .replace(/^(?:soal|pertanyaan|butir\s+soal)\s*[:=-]\s*/i, '')
      .trim();
    return {
      wacana: wacanaPart,
      teks_soal: soalPart || text,
    };
  }

  // Strip optional leading "Soal:" if there was no wacana
  const cleanedSoal = text.replace(/^(?:soal|pertanyaan|butir\s+soal)\s*[:=-]\s*/i, '').trim();
  return { wacana: '', teks_soal: cleanedSoal };
}

/**
 * Helper to parse combined "No / Kode & Jenis" cell
 */
function parseCombinedIdAndJenisCell(
  rawCell: string,
  fallbackIndex: number
): {
  id_soal: string;
  jenis_soal: 'PG' | 'Kompleks';
} {
  const fallbackId = `SOAL-${String(fallbackIndex).padStart(2, '0')}`;
  if (!rawCell || !rawCell.trim()) {
    return { id_soal: fallbackId, jenis_soal: 'PG' };
  }
  const lower = rawCell.toLowerCase();
  const jenis_soal: 'PG' | 'Kompleks' = lower.includes('kompleks') ? 'Kompleks' : 'PG';
  const lines = rawCell
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let idCandidate = lines[0] || '';
  idCandidate = idCandidate
    .replace(/\b(?:pg\s*kompleks|kompleks|pilihan\s*ganda|pg)\b/gi, '')
    .replace(/[()[\]]/g, '')
    .trim();
  if (/^\d+$/.test(idCandidate)) {
    idCandidate = `SOAL-${idCandidate.padStart(2, '0')}`;
  }
  return {
    id_soal: idCandidate || fallbackId,
    jenis_soal,
  };
}

/**
 * Helper to parse combined "Kunci & Bobot" cell
 */
function parseCombinedKunciAndBobotCell(rawCell: string): {
  rawKunci: string;
  bobot: number | null;
} {
  if (!rawCell || !rawCell.trim()) {
    return { rawKunci: 'A', bobot: null };
  }
  let bobot: number | null = null;
  const bobotMatch = rawCell.match(/(?:bobot|poin|skor|nilai)\s*[:=-]?\s*(\d+)/i);
  if (bobotMatch) {
    bobot = Number(bobotMatch[1]) || null;
  }

  let kunciPart = rawCell
    .replace(/(?:bobot|poin|skor|nilai)\s*[:=-]?\s*\d+/gi, '')
    .replace(/(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|key)\s*[:=-]?/gi, '')
    .trim();

  // If second line is just a number (e.g. line 1: "A", line 2: "2")
  const lines = kunciPart
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2 && /^\d+$/.test(lines[lines.length - 1])) {
    if (!bobot) bobot = Number(lines[lines.length - 1]) || null;
    kunciPart = lines.slice(0, -1).join(' ');
  }

  return { rawKunci: kunciPart.trim(), bobot };
}

/**
 * Parses a 2D grid of cell values (from XLSX, HTML tables, Word 4-column Fit-Page tables, or 11-column tables) into CsvQuestionRow[]
 */
export function parseGridToQuestionRows(
  grid: (string | number | boolean | null | undefined)[][]
): {
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
    id_soal: [
      'id_soal',
      'id',
      'no',
      'nomor',
      'no_soal',
      'nomor_soal',
      'kode',
      'kode_soal',
      'no_tipe',
      'no_jenis',
      'no_kode',
      'no_dan_jenis',
      'kode_tipe',
    ],
    jenis_soal: ['jenis_soal', 'tipe_soal', 'jenis', 'tipe', 'bentuk_soal', 'model_soal', 'kategori'],
    wacana: ['wacana', 'stimulus', 'bacaan', 'teks_bacaan', 'pengantar', 'cerita', 'narasi', 'kasus'],
    teks_soal: [
      'teks_soal',
      'soal',
      'pertanyaan',
      'butir_soal',
      'pokok_soal',
      'question',
      'text',
      'stem',
      'wacana_pertanyaan_soal',
      'wacana_dan_pertanyaan',
      'wacana_soal',
      'pertanyaan_soal',
      'wacana_pertanyaan',
    ],
    opsi_gabungan: [
      'pilihan_jawaban',
      'pilihan_jawaban_a_e',
      'opsi_jawaban',
      'opsi_jawaban_a_e',
      'opsi_a_e',
      'pilihan_a_e',
      'pilihan_a_sd_e',
      'opsi',
      'pilihan',
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
      'correct',
      'kunci_bobot',
      'kunci_dan_bobot',
      'kunci_poin',
    ],
    bobot: ['bobot', 'poin', 'skor', 'nilai', 'bobot_nilai', 'score', 'points', 'weight'],
  };

  for (let r = 0; r < Math.min(strGrid.length, 15); r++) {
    const row = strGrid[r];
    const normTokens = row.map(normalizeColHeader);
    const hasSoal = normTokens.some(
      (t) =>
        HEADER_PATTERNS.teks_soal.includes(t) ||
        t.includes('pertanyaan') ||
        t.includes('teks_soal')
    );
    const hasKunci = normTokens.some(
      (t) => HEADER_PATTERNS.kunci_jawaban.includes(t) || t.includes('kunci')
    );
    const hasOpsi = normTokens.some(
      (t) =>
        HEADER_PATTERNS.opsi_a.includes(t) ||
        HEADER_PATTERNS.opsi_b.includes(t) ||
        HEADER_PATTERNS.opsi_gabungan.includes(t) ||
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
        // Fuzzy fallback for compact 4-column Word headers
        if (colMap.teks_soal === undefined && (tok.includes('pertanyaan') || tok.includes('soal')) && !tok.includes('no') && !tok.includes('id') && !tok.includes('jenis')) {
          colMap.teks_soal = idx;
        }
        if (colMap.opsi_gabungan === undefined && colMap.opsi_a === undefined && (tok.includes('pilihan') || tok.includes('opsi'))) {
          colMap.opsi_gabungan = idx;
        }
        if (colMap.kunci_jawaban === undefined && tok.includes('kunci')) {
          colMap.kunci_jawaban = idx;
        }
      });
      break;
    }
  }

  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  const parsedRows: CsvQuestionRow[] = [];

  for (let r = startRow; r < strGrid.length; r++) {
    const cells = strGrid[r];
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

    // CASE 1: Compact 4-Column or 5-Column Word Table (with combined stacked options cell)
    const isCompactWordTableRow =
      (headerIdx >= 0 && colMap.opsi_gabungan !== undefined && colMap.opsi_a === undefined) ||
      (cells.length >= 3 &&
        cells.length <= 5 &&
        cells.some((c) => /(?:^|\n)\s*A[.)\]:-]\s+.+(?:\n|\s+)B[.)\]:-]\s+/is.test(c)));

    if (isCompactWordTableRow) {
      const idCell =
        colMap.id_soal !== undefined ? cells[colMap.id_soal] || '' : cells[0] || '';
      const parsedIdJenis = parseCombinedIdAndJenisCell(idCell, parsedRows.length + 1);
      id_soal = parsedIdJenis.id_soal;
      jenis_soal = parsedIdJenis.jenis_soal;

      if (colMap.jenis_soal !== undefined && cells[colMap.jenis_soal]) {
        if (cells[colMap.jenis_soal].toLowerCase().includes('kompleks')) {
          jenis_soal = 'Kompleks';
        }
      }

      const rawSoalCell =
        colMap.teks_soal !== undefined
          ? cells[colMap.teks_soal] || ''
          : cells[1] || '';
      const splitSoal = parseCombinedWacanaAndSoalCell(rawSoalCell);
      wacana =
        colMap.wacana !== undefined && cells[colMap.wacana]
          ? cells[colMap.wacana]
          : splitSoal.wacana;
      teks_soal = splitSoal.teks_soal;

      const rawOpsiCell =
        colMap.opsi_gabungan !== undefined
          ? cells[colMap.opsi_gabungan] || ''
          : cells.find((c) => /(?:^|\n)\s*A[.)\]:-]\s+/i.test(c)) || cells[2] || '';
      const stacked = parseStackedOptionsCell(rawOpsiCell);
      opsi_a = stacked.A;
      opsi_b = stacked.B;
      opsi_c = stacked.C;
      opsi_d = stacked.D;
      opsi_e = stacked.E;

      const rawKunciCell =
        colMap.kunci_jawaban !== undefined
          ? cells[colMap.kunci_jawaban] || ''
          : cells[cells.length - 1] || '';
      const parsedKB = parseCombinedKunciAndBobotCell(rawKunciCell);
      rawKunci =
        parsedKB.rawKunci ||
        (stacked.detectedKunci.length > 0 ? stacked.detectedKunci.join(',') : 'A');
      if (parsedKB.bobot && parsedKB.bobot > 0) {
        bobot = parsedKB.bobot;
      } else if (colMap.bobot !== undefined && cells[colMap.bobot]) {
        bobot = Number(cells[colMap.bobot]) || (jenis_soal === 'Kompleks' ? 3 : 2);
      }
    } else if (headerIdx >= 0 && colMap.teks_soal !== undefined) {
      // CASE 2: Standard Header-Mapped Table (11-column Excel / Word / CSV)
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
      // CASE 3: Headerless positional table
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
 * Supports inline images ([IMG:...]), LaTeX equations ($...$, $$...$$, [RUMUS:...]),
 * chemical formulas (\ce{...}), and superscripts/subscripts.
 */
export function parseTextDocumentQuestions(rawText: string): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

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
      currentWacana = '';
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

    // Skip template instruction banners
    if (/^(?:PANDUAN|PETUNJUK|CATATAN|CONTOH\s+FORMAT|TEMPLATE\s+WORD\s+CBT)/i.test(line)) {
      continue;
    }

    // Detect stimulus / wacana header
    const wacanaMatch = line.match(
      /^(?:wacana|stimulus|bacaan|teks\s+bacaan|narasi)\s*[:=-]\s*(.*)$/i
    );
    if (wacanaMatch) {
      if (currentQuestionText && (currentOpsi.A || currentOpsi.B)) {
        pushCurrentQuestion();
      }
      currentWacana = wacanaMatch[1].trim();
      activeOpsiKey = null;
      continue;
    }

    // Detect Question type header like: "Jenis: Kompleks" or "Tipe Soal: PG Kompleks"
    const tipeMatch = line.match(/^(?:jenis|tipe)(?:\s+soal)?\s*[:=-]\s*(.+)$/i);
    if (tipeMatch) {
      if (tipeMatch[1].toLowerCase().includes('kompleks')) {
        currentTipe = 'Kompleks';
        currentBobot = 3;
      } else {
        currentTipe = 'PG';
      }
      continue;
    }

    // Detect Question number like: "1.", "1)", "[1]", "No. 1", "Soal 1:"
    const qNumMatch = line.match(
      /^(?:no(?:mor)?\.?|soal|pertanyaan)?\s*([0-9]{1,3})[\s.)\]:-]+\s*(.+)$/i
    );
    if (qNumMatch && !line.match(/^[A-Ea-e][\s.)\]:-]/)) {
      pushCurrentQuestion();
      currentId = `SOAL-${qNumMatch[1].padStart(2, '0')}`;
      currentQuestionText = qNumMatch[2].trim();
      continue;
    }

    // Detect Answer Key like: "Kunci: A", "Kunci Jawaban: B, C", "Jawaban: D", "Key: A"
    const keyMatch = line.match(
      /^(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|key|ans)\s*[:=-]\s*([A-Ea-e,\s;|/]+)/i
    );
    if (keyMatch) {
      currentKunci = normalizeAnswerKeys(keyMatch[1]);
      if (currentKunci.length > 1) {
        currentTipe = 'Kompleks';
        if (currentBobot <= 2) currentBobot = 3;
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
    const optMatch = line.match(/^([*]?)\s*([A-Ea-e])[\s.)\]:-]+\s*(.*)$/);
    if (optMatch) {
      const isStarred = optMatch[1] === '*';
      const optLetter = optMatch[2].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      activeOpsiKey = optLetter;
      currentOpsi[optLetter] = optMatch[3].trim();
      if (isStarred && !currentKunci.includes(optLetter)) {
        currentKunci.push(optLetter);
      }
      continue;
    }

    // Continuation line (including standalone [IMG:...] or $$...$$ following a question or option)
    if (activeOpsiKey) {
      currentOpsi[activeOpsiKey] += (currentOpsi[activeOpsiKey] ? ' ' : '') + line;
    } else if (currentQuestionText) {
      currentQuestionText += '\n' + line;
    } else if (currentWacana) {
      currentWacana += '\n' + line;
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
  const header =
    'id_soal;jenis_soal;wacana;teks_soal;opsi_a;opsi_b;opsi_c;opsi_d;opsi_e;kunci_jawaban;bobot';
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
 * Extracts and converts HTML from mammoth.convertToHtml (with compressed embedded images!)
 * into either Table-based question rows OR Numbered-text question rows.
 */
async function parseDocxArrayBufferWithImagesAndMath(
  buffer: ArrayBuffer
): Promise<ParsedQuestionsOutcome> {
  // Custom mammoth image converter that compresses embedded Word images to compact [IMG:data:image/...]
  const htmlResult = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64');
        const mime = image.contentType || 'image/png';
        const rawDataUrl = `data:${mime};base64,${base64}`;
        const compressedUrl = await compressImageDataUrl(rawDataUrl);
        return {
          src: compressedUrl,
        };
      }),
    }
  );

  const htmlText = htmlResult.value || '';

  // 1. Check if the Word document contains a question table
  if (/<table[\s>]/i.test(htmlText)) {
    const trMatches = htmlText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const grid: string[][] = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      const rowCells = cellMatches.map((c) => cleanHtmlFragmentPreservingMediaAndMath(c));
      if (rowCells.some(Boolean)) {
        grid.push(rowCells);
      }
    }

    const gridResult = parseGridToQuestionRows(grid);
    if (gridResult.rows.length > 0) {
      return {
        rows: gridResult.rows,
        errors: gridResult.errors,
        formatDetected: 'Word Document (.docx) — Tabel + Gambar & Rumus',
        csvRepresentation: buildQuestionsCsvText(gridResult.rows),
      };
    }
  }

  // 2. Otherwise parse as structured numbered questions while preserving [IMG:...], <sup>, <sub>, and LaTeX!
  const preservedText = cleanHtmlFragmentPreservingMediaAndMath(htmlText);
  const textResult = parseTextDocumentQuestions(preservedText);

  if (textResult.rows.length > 0) {
    return {
      rows: textResult.rows,
      errors: textResult.errors,
      formatDetected: 'Word Document (.docx) — Soal Bernomor + Gambar & Rumus',
      csvRepresentation: buildQuestionsCsvText(textResult.rows),
    };
  }

  // 3. Fallback to mammoth.extractRawText
  const rawTextResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  const fallbackResult = parseTextDocumentQuestions(rawTextResult.value || '');
  return {
    rows: fallbackResult.rows,
    errors: fallbackResult.errors,
    formatDetected: 'Word Document (.docx) — Teks Soal',
    csvRepresentation:
      fallbackResult.rows.length > 0 ? buildQuestionsCsvText(fallbackResult.rows) : '',
  };
}

/**
 * Universal Question File Parser:
 * Supports:
 * - Word (.docx, .doc) with embedded Images, Equations, Superscripts/Subscripts, Tables, or Numbered Questions
 * - Excel (.xlsx, .xls, .xlsm, .xlsb, .ods)
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

  // Detect if the file is a ZIP-based Office Open XML (.docx or .xlsx) by magic bytes PK\x03\x04
  const magicBytes = new Uint8Array(buffer.slice(0, 4));
  const isZipArchive =
    magicBytes.length >= 4 &&
    magicBytes[0] === 0x50 &&
    magicBytes[1] === 0x4b &&
    magicBytes[2] === 0x03 &&
    magicBytes[3] === 0x04;

  // 1. Word Formats (.docx or .doc saved as .docx)
  if (ext === 'docx' || (ext === 'doc' && isZipArchive)) {
    try {
      return await parseDocxArrayBufferWithImagesAndMath(buffer);
    } catch (err: any) {
      return {
        rows: [],
        errors: [`Gagal membaca file Word (.docx): ${err.message || 'Format rusak'}`],
        formatDetected: 'Word Document (.docx)',
        csvRepresentation: '',
      };
    }
  }

  // 2. Excel Formats (.xlsx, .xls, .ods) — Note: check if .xls is actually an HTML table first
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) {
    const previewText = new TextDecoder('utf-8').decode(buffer.slice(0, 512)).trimStart();
    const isHtmlSpoof = /^<(?:!DOCTYPE\s+html|html|table|xml|meta)[\s>]/i.test(previewText);

    if (!isHtmlSpoof) {
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
  }

  // 3. Word HTML (.doc), HTML-based .xls, CSV, TSV, or Plain Text (.txt)
  const decoder = new TextDecoder('utf-8');
  const textContent = decoder.decode(buffer);

  const isHtmlDoc = /^<(?:!DOCTYPE\s+html|html|table|xml|meta)[\s>]/i.test(
    textContent.trimStart()
  );

  if (isHtmlDoc) {
    // 3A. If HTML doc has a <table>, extract table rows while preserving <img>, <sup>, <sub>, and LaTeX
    if (/<table[\s>]/i.test(textContent) && /<tr[\s>]/i.test(textContent)) {
      const trMatches = textContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      const grid: string[][] = [];
      for (const tr of trMatches) {
        const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        const rowCells = cellMatches.map((c) => cleanHtmlFragmentPreservingMediaAndMath(c));
        if (rowCells.some(Boolean)) grid.push(rowCells);
      }
      const gridResult = parseGridToQuestionRows(grid);
      if (gridResult.rows.length > 0) {
        return {
          rows: gridResult.rows,
          errors: gridResult.errors,
          formatDetected:
            ext === 'doc'
              ? 'Microsoft Word (.doc) — Tabel + Gambar & Rumus'
              : 'Tabel HTML / Excel (.xls)',
          csvRepresentation: buildQuestionsCsvText(gridResult.rows),
        };
      }
    }

    // 3B. If HTML doc is a numbered Word document (.doc), extract paragraphs preserving <img>, <sup>, <sub>, and LaTeX
    const bodyMatch = textContent.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    const htmlBody = bodyMatch ? bodyMatch[1] : textContent;
    const cleanedDocText = cleanHtmlFragmentPreservingMediaAndMath(htmlBody);
    const docTextResult = parseTextDocumentQuestions(cleanedDocText);
    if (docTextResult.rows.length > 0) {
      return {
        rows: docTextResult.rows,
        errors: docTextResult.errors,
        formatDetected: 'Microsoft Word (.doc) — Soal Bernomor + Gambar & Rumus',
        csvRepresentation: buildQuestionsCsvText(docTextResult.rows),
      };
    }
  }

  // 4. Try standard CSV parser
  const csvParsed = parseQuestionsCsv(textContent);
  if (csvParsed.rows.length > 0) {
    return {
      rows: csvParsed.rows,
      errors: csvParsed.errors,
      formatDetected: `File CSV/TSV (.${ext || 'csv'})`,
      csvRepresentation: buildQuestionsCsvText(csvParsed.rows),
    };
  }

  // 5. Try text question parser as fallback
  const textParsed = parseTextDocumentQuestions(textContent);
  if (textParsed.rows.length > 0) {
    return {
      rows: textParsed.rows,
      errors: textParsed.errors,
      formatDetected: `Dokumen Soal (.${ext || 'txt'})`,
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
 * Sample inline SVG diagram encoded as a Data URL for the Physics question in our Word Template
 * (Displays a clean inclined-plane / force block diagram F = 24 N on m = 4 kg)
 */
export const SAMPLE_PHYSICS_DIAGRAM_DATA_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="130" viewBox="0 0 380 130">
      <rect width="380" height="130" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
      <line x1="25" y1="100" x2="355" y2="100" stroke="#334155" stroke-width="3"/>
      <rect x="85" y="46" width="90" height="54" rx="6" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2.5"/>
      <text x="130" y="78" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#1e3a8a" text-anchor="middle">m = 4 kg</text>
      <line x1="175" y1="73" x2="275" y2="73" stroke="#dc2626" stroke-width="3.5"/>
      <polygon points="275,73 263,66 263,80" fill="#dc2626"/>
      <text x="230" y="62" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#b91c1c" text-anchor="middle">F = 24 N</text>
      <text x="190" y="118" font-family="Arial, sans-serif" font-size="11" fill="#475569" text-anchor="middle">Lantai Licin ( tanpa gesekan, μ = 0 )</text>
    </svg>`
  );

/**
 * Generates a Microsoft Word (.doc) Template using a 4-Column Compact Table Format on A4 Portrait
 * (No & Tipe | Wacana & Pertanyaan Soal | Pilihan Jawaban A–E | Kunci & Bobot)
 * so it NEVER juts out 11 columns horizontally and fits 100% cleanly on ONE single A4 Word page!
 */
export function generateWordQuestionTemplateTableDoc(): string {
  const colWidths = ['10%', '44%', '34%', '12%'];
  const headers = [
    'No & Tipe',
    'Wacana & Pertanyaan Soal',
    'Pilihan Jawaban (A – E)',
    'Kunci & Bobot',
  ];

  const colgroupHtml = colWidths.map((w) => `<col style="width:${w};" width="${w}" />`).join('');
  const thHtml = headers
    .map(
      (h, i) =>
        `<th width="${colWidths[i]}" style="width:${colWidths[i]}; background-color:#1e3a8a; color:#ffffff; font-weight:bold; border:1px solid #334155; padding:4pt 5pt; text-align:left; font-size:9pt; word-wrap:break-word; overflow-wrap:break-word;">${h}</th>`
    )
    .join('');

  const tdStyle = (idx: number) =>
    `width="${colWidths[idx]}" style="width:${colWidths[idx]}; border:1px solid #94a3b8; padding:4pt 5pt; vertical-align:top; font-size:9pt; line-height:1.35; word-wrap:break-word; overflow-wrap:break-word; word-break:break-word;"`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Template Word Tabel Ringkas 4 Kolom (Fit 1 Halaman A4)</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 {
      size: 595.3pt 841.9pt;
      mso-page-orientation: portrait;
      margin: 28.35pt 28.35pt 28.35pt 28.35pt;
    }
    div.WordSection1 {
      page: WordSection1;
      width: 100%;
    }
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 9pt;
      color: #0f172a;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 12pt;
      color: #1e3a8a;
      margin: 0 0 3pt 0;
    }
    .guide {
      background: #eff6ff;
      border: 1px solid #93c5fd;
      padding: 4.5pt 6pt;
      margin-bottom: 6pt;
      font-size: 8.5pt;
      line-height: 1.3;
      width: 100%;
      box-sizing: border-box;
    }
    table.cbt-fit-table {
      border-collapse: collapse;
      width: 100.0%;
      max-width: 100.0%;
      table-layout: fixed;
      mso-table-layout-alt: fixed;
      mso-FitToPage: yes;
      font-size: 9pt;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
<div class="WordSection1">
  <h1>TEMPLATE WORD TABEL RINGKAS 4 KOLOM (FIT 1 HALAMAN A4 — TIDAK MENJOROK)</h1>
  <div class="guide">
    <strong>PETUNJUK CEPAT (MUDAH DIKETIK DI WORD &amp; FIT 1 HALAMAN A4 PORTRAIT):</strong><br/>
    &bull; Tabel ini dirancang <strong>4 kolom proporsional</strong> (bukan 11 kolom ke samping) agar pas 1 halaman A4 dan sangat mudah diketik di Microsoft Word.<br/>
    &bull; <strong>Kolom 2 (Wacana &amp; Pertanyaan):</strong> Awali bacaan dengan <code>Wacana: ...</code> lalu baris baru <code>Soal: ...</code> (boleh langsung <em>Copy-Paste</em> Gambar &amp; Rumus <code>$...$</code> / <code>\\ce{...}</code>).<br/>
    &bull; <strong>Kolom 3 (Pilihan A–E):</strong> Ketik pilihan <code>A.</code> s/d <code>E.</code> berurutan ke bawah di dalam satu sel.
  </div>

  <table class="cbt-fit-table" width="100%">
    <colgroup>${colgroupHtml}</colgroup>
    <thead>
      <tr>${thHtml}</tr>
    </thead>
    <tbody>
      <tr>
        <td ${tdStyle(0)}><strong>FIS-01</strong><br/>PG</td>
        <td ${tdStyle(1)}>
          Wacana: Perhatikan diagram balok bermassa $m = 4\\text{ kg}$ yang ditarik gaya mendatar $F = 24\\text{ N}$ di atas lantai licin:<br/>
          <img src="${SAMPLE_PHYSICS_DIAGRAM_DATA_URL}" alt="Diagram Gaya Fisika" width="160" height="55" style="width:160px; height:auto; max-width:100%;" /><br/>
          Soal: Berdasarkan Hukum II Newton $\\sum \\vec{F} = m \\cdot \\vec{a}$, berapakah percepatan $a$ dan energi kinetik $E_k = \\frac{1}{2}mv^2$ balok setelah $t = 2\\text{ s}$?
        </td>
        <td ${tdStyle(2)}>
          A. $a = 6\\text{ m/s}^2$ dan $E_k = 288\\text{ J}$<br/>
          B. $a = 4\\text{ m/s}^2$ dan $E_k = 128\\text{ J}$<br/>
          C. $a = 6\\text{ m/s}^2$ dan $E_k = 144\\text{ J}$<br/>
          D. $a = 8\\text{ m/s}^2$ dan $E_k = 256\\text{ J}$<br/>
          E. $a = 12\\text{ m/s}^2$ dan $E_k = 576\\text{ J}$
        </td>
        <td ${tdStyle(3)}>Kunci: <strong>A</strong><br/>Bobot: 2</td>
      </tr>
      <tr>
        <td ${tdStyle(0)}><strong>MAT-02</strong><br/>PG</td>
        <td ${tdStyle(1)}>
          Wacana: Diketahui rumus kuadrat $x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ dan operasi kalkulus dasar.<br/>
          Soal: Nilai dari integral tentu $\\int_{1}^{3} (3x^2 - 4x + 1)\\,dx$ adalah...
        </td>
        <td ${tdStyle(2)}>
          A. $10$<br/>
          B. $12$<br/>
          C. $14$<br/>
          D. $16$<br/>
          E. $18$
        </td>
        <td ${tdStyle(3)}>Kunci: <strong>B</strong><br/>Bobot: 2</td>
      </tr>
      <tr>
        <td ${tdStyle(0)}><strong>KIM-03</strong><br/>PG</td>
        <td ${tdStyle(1)}>
          Wacana: Reaksi kesetimbangan pembentukan amonia: $\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$ dengan $\\Delta H = -92\\text{ kJ/mol}$.<br/>
          Soal: Ungkapan tetapan kesetimbangan konsentrasi $K_c$ yang tepat untuk reaksi di atas adalah...
        </td>
        <td ${tdStyle(2)}>
          A. $K_c = \\frac{[\\text{NH}_3]^2}{[\\text{N}_2][\\text{H}_2]^3}$<br/>
          B. $K_c = \\frac{[\\text{N}_2][\\text{H}_2]^3}{[\\text{NH}_3]^2}$<br/>
          C. $K_c = \\frac{[\\text{NH}_3]}{[\\text{N}_2][\\text{H}_2]}$<br/>
          D. $K_c = \\frac{2[\\text{NH}_3]}{[\\text{N}_2] + 3[\\text{H}_2]}$<br/>
          E. $K_c = [\\text{NH}_3]^2 [\\text{N}_2] [\\text{H}_2]^3$
        </td>
        <td ${tdStyle(3)}>Kunci: <strong>A</strong><br/>Bobot: 2</td>
      </tr>
      <tr>
        <td ${tdStyle(0)}><strong>SOS-04</strong><br/>Kompleks</td>
        <td ${tdStyle(1)}>
          Wacana: Transformasi digital mempercepat perubahan sosial di masyarakat perkotaan maupun perdesaan.<br/>
          Soal: Manakah pernyataan berikut yang merupakan dampak positif modernisasi teknologi informasi? (Pilih &gt;1 jawaban benar)
        </td>
        <td ${tdStyle(2)}>
          A. Terbukanya akses pendidikan dan literasi ilmiah daring<br/>
          B. Meningkatnya efisiensi komunikasi lintas wilayah<br/>
          C. Hilangnya seluruh norma sosial tradisional secara tiba-tiba<br/>
          D. Munculnya ekosistem ekonomi kreatif berbasis digital UMKM<br/>
          E. Meningkatnya disorganisasi sosial akibat hoaks
        </td>
        <td ${tdStyle(3)}>Kunci: <strong>A, B, D</strong><br/>Bobot: 3</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;
}

/**
 * Generates a Microsoft Word (.doc) Template using the Standard Numbered Question Format
 * (1. Pertanyaan... A. ... B. ... Kunci: A) strictly fitted to a single A4 Portrait page.
 */
export function generateWordQuestionTemplateNumberedDoc(): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Template Word Soal Bernomor CBT (Fit 1 Halaman A4)</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 {
      size: 595.3pt 841.9pt;
      mso-page-orientation: portrait;
      margin: 28.35pt 34.0pt 28.35pt 34.0pt;
    }
    div.WordSection1 {
      page: WordSection1;
      width: 100%;
    }
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.3;
      color: #0f172a;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 12pt;
      color: #1e3a8a;
      margin: 0 0 4pt 0;
    }
    .guide {
      background: #f0fdf4;
      border: 1px solid #86efac;
      padding: 5pt 7pt;
      margin-bottom: 6pt;
      font-size: 8.5pt;
      width: 100%;
      box-sizing: border-box;
    }
    p {
      margin: 1.5pt 0;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .q-spacer {
      margin-bottom: 5pt;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
<div class="WordSection1">
  <h1>TEMPLATE WORD SOAL BERNOMOR (FIT 1 HALAMAN A4 PORTRAIT) — BANK SOAL CBT</h1>
  <div class="guide">
    <strong>PETUNJUK PENULISAN SOAL BERNOMOR DI WORD (FIT 1 HALAMAN A4):</strong><br/>
    &bull; Awali soal dengan nomor (<code>1.</code>, <code>2.</code>, dst.), diikuti pilihan <code>A.</code> s/d <code>E.</code>, lalu <code>Kunci: A</code> (atau <code>Kunci: A, B, D</code>) dan <code>Bobot: 2</code>.<br/>
    &bull; Bebas menyisipkan <strong>Gambar (Copy-Paste)</strong> dan <strong>Rumus Matematika/Fisika/Kimia</strong> (<code>$...$</code> atau <code>\\ce{...}</code>).
  </div>

  <p>Wacana: Perhatikan diagram balok bermassa $m = 4\text{ kg}$ yang ditarik gaya mendatar $F = 24\text{ N}$ di atas bidang datar licin berikut:</p>
  <p><img src="${SAMPLE_PHYSICS_DIAGRAM_DATA_URL}" alt="Diagram Gaya Fisika" width="175" height="60" style="width:175px; height:auto; max-width:100%;" /></p>
  <p>1. Berdasarkan Hukum II Newton $\sum \vec{F} = m \cdot \vec{a}$, berapakah percepatan $a$ dan energi kinetik $E_k = \frac{1}{2}mv^2$ balok setelah bergerak selama $t = 2\text{ s}$ dari keadaan diam?</p>
  <p>A. $a = 6\text{ m/s}^2$ dan $E_k = 288\text{ J}$</p>
  <p>B. $a = 4\text{ m/s}^2$ dan $E_k = 128\text{ J}$</p>
  <p>C. $a = 6\text{ m/s}^2$ dan $E_k = 144\text{ J}$</p>
  <p>D. $a = 8\text{ m/s}^2$ dan $E_k = 256\text{ J}$</p>
  <p>E. $a = 12\text{ m/s}^2$ dan $E_k = 576\text{ J}$</p>
  <p class="q-spacer">Kunci: A | Bobot: 2</p>

  <p>Wacana: Diketahui rumus kuadrat $x_{1,2} = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ dan operasi kalkulus dasar.</p>
  <p>2. Nilai dari integral tentu $\int_{1}^{3} (3x^2 - 4x + 1)\,dx$ adalah...</p>
  <p>A. $10$</p>
  <p>B. $12$</p>
  <p>C. $14$</p>
  <p>D. $16$</p>
  <p>E. $18$</p>
  <p class="q-spacer">Kunci: B | Bobot: 2</p>

  <p>Wacana: Reaksi kesetimbangan pembentukan gas amonia: $\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$ dengan $\Delta H = -92\text{ kJ/mol}$.</p>
  <p>3. Ungkapan tetapan kesetimbangan konsentrasi $K_c$ yang tepat untuk reaksi di atas adalah...</p>
  <p>A. $K_c = \frac{[\text{NH}_3]^2}{[\text{N}_2][\text{H}_2]^3}$</p>
  <p>B. $K_c = \frac{[\text{N}_2][\text{H}_2]^3}{[\text{NH}_3]^2}$</p>
  <p>C. $K_c = \frac{[\text{NH}_3]}{[\text{N}_2][\text{H}_2]}$</p>
  <p>D. $K_c = \frac{2[\text{NH}_3]}{[\text{N}_2] + 3[\text{H}_2]}$</p>
  <p>E. $K_c = [\text{NH}_3]^2 [\text{N}_2] [\text{H}_2]^3$</p>
  <p class="q-spacer">Kunci: A | Bobot: 2</p>

  <p>Wacana: Transformasi digital mempercepat perubahan sosial di masyarakat perkotaan maupun perdesaan.</p>
  <p>4. Manakah di antara pernyataan berikut yang merupakan dampak positif modernisasi teknologi informasi? (Pilih lebih dari satu jawaban benar)</p>
  <p>A. Terbukanya akses pendidikan dan literasi ilmiah secara daring</p>
  <p>B. Meningkatnya efisiensi komunikasi lintas wilayah secara real-time</p>
  <p>C. Hilangnya seluruh norma sosial tradisional secara tiba-tiba</p>
  <p>D. Munculnya ekosistem ekonomi kreatif berbasis digital bagi UMKM</p>
  <p>E. Meningkatnya disorganisasi sosial akibat hoaks</p>
  <p>Kunci: A, B, D | Bobot: 3</p>
</div>
</body>
</html>`;
}

/**
 * Exports an existing list of QuestionItem[] into a ready-to-edit 4-Column Compact Microsoft Word (.doc) file
 * on A4 Portrait so it never overflows horizontally and can be edited & re-uploaded directly.
 */
export function exportQuestionsToWordDoc(
  examTitle: string,
  questionsList: QuestionItem[]
): string {
  const colWidths = ['10%', '44%', '34%', '12%'];
  const headers = [
    'No & Tipe',
    'Wacana & Pertanyaan Soal',
    'Pilihan Jawaban (A – E)',
    'Kunci & Bobot',
  ];

  const colgroupHtml = colWidths.map((w) => `<col style="width:${w};" width="${w}" />`).join('');
  const thHtml = headers
    .map(
      (h, i) =>
        `<th width="${colWidths[i]}" style="width:${colWidths[i]}; background-color:#1e3a8a; color:#ffffff; font-weight:bold; border:1px solid #334155; padding:4pt 5pt; text-align:left; font-size:9pt; word-wrap:break-word; overflow-wrap:break-word;">${h}</th>`
    )
    .join('');

  const tdStyle = (idx: number) =>
    `width="${colWidths[idx]}" style="width:${colWidths[idx]}; border:1px solid #94a3b8; padding:4pt 5pt; vertical-align:top; font-size:9pt; line-height:1.35; word-wrap:break-word; overflow-wrap:break-word; word-break:break-word;"`;

  const formatForWordHtml = (text: string | undefined | null) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;(sup|sub)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, '<$1>$2</$1>')
      .replace(
        /\[IMG:([^\]]+)\]/g,
        '<br/><img src="$1" alt="Gambar Soal" width="160" style="width:160px; height:auto; max-width:100%;" /><br/>'
      )
      .replace(/\n/g, '<br/>');
  };

  const rowsHtml = questionsList
    .map((q, idx) => {
      const idSoal = q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`;
      const isKompleks = q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      const wacanaHtml = q.data_opsi?.wacana
        ? `Wacana: ${formatForWordHtml(q.data_opsi.wacana)}<br/>Soal: `
        : 'Soal: ';
      const opsiLines = (['A', 'B', 'C', 'D', 'E'] as const)
        .filter((k) => Boolean(q.data_opsi?.opsi?.[k]))
        .map((k) => `${k}. ${formatForWordHtml(q.data_opsi?.opsi?.[k] || '')}`)
        .join('<br/>');

      return `<tr>
        <td ${tdStyle(0)}><strong>${idSoal}</strong><br/>${isKompleks ? 'Kompleks' : 'PG'}</td>
        <td ${tdStyle(1)}>${wacanaHtml}${formatForWordHtml(q.teks_soal)}</td>
        <td ${tdStyle(2)}>${opsiLines}</td>
        <td ${tdStyle(3)}>Kunci: <strong>${q.kunci_jawaban.join(', ')}</strong><br/>Bobot: ${q.bobot || (isKompleks ? 3 : 2)}</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Bank Soal Word — ${examTitle}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 {
      size: 595.3pt 841.9pt;
      mso-page-orientation: portrait;
      margin: 28.35pt 28.35pt 28.35pt 28.35pt;
    }
    div.WordSection1 {
      page: WordSection1;
      width: 100%;
    }
    body {
      font-family: Calibri, Arial, sans-serif;
      font-size: 9pt;
      color: #0f172a;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 12pt;
      color: #1e3a8a;
      margin: 0 0 5pt 0;
    }
    table.cbt-fit-table {
      border-collapse: collapse;
      width: 100.0%;
      max-width: 100.0%;
      table-layout: fixed;
      mso-table-layout-alt: fixed;
      mso-FitToPage: yes;
      font-size: 9pt;
    }
  </style>
</head>
<body>
<div class="WordSection1">
  <h1>BANK SOAL MICROSOFT WORD — ${examTitle} (${questionsList.length} Butir Soal)</h1>
  <table class="cbt-fit-table" width="100%">
    <colgroup>${colgroupHtml}</colgroup>
    <thead>
      <tr>${thHtml}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</div>
</body>
</html>`;
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

      const strGrid = grid.map((row) => (row || []).map((c) => String(c || '').trim()));
      let headerIdx = -1;
      let namaCol = -1;
      let kelasCol = -1;
      let tokenCol = -1;

      for (let r = 0; r < Math.min(strGrid.length, 10); r++) {
        const row = strGrid[r].map(normalizeColHeader);
        const nIdx = row.findIndex((t) =>
          ['nama', 'nama_siswa', 'nama_lengkap', 'siswa'].includes(t)
        );
        const kIdx = row.findIndex((t) =>
          ['kelas', 'rombel', 'kelas_rombel'].includes(t)
        );
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

      const csvRep = studentRows
        .map((s) => `${s.nama};${s.kelas}${s.token_ujian ? ';' + s.token_ujian : ''}`)
        .join('\n');
      return {
        rows: studentRows,
        errors:
          studentRows.length > 0
            ? []
            : ['Tidak ada baris siswa yang valid di file Excel.'],
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
