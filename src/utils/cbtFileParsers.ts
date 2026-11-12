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
 * Parses a 2D grid of cell values (from XLSX, HTML tables, Word tables, etc.) into CsvQuestionRow[]
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
    const hasOpsi = normTokens.some(
      (t) =>
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
 * Generates a Microsoft Word (.doc) Template using the 11-Column Table Format,
 * complete with sample Math, Physics (with Diagram Image), Chemistry, and Sociology questions.
 */
export function generateWordQuestionTemplateTableDoc(): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Template Word Tabel Bank Soal CBT (Matematika, Fisika, Kimia, Sosiologi & Gambar)</title>
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
    @page { size: 29.7cm 21cm; margin: 1.5cm; mso-page-orientation: landscape; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #0f172a; }
    h1 { font-size: 16pt; color: #1e3a8a; margin-bottom: 4pt; }
    .guide { background: #eff6ff; border: 1px solid #93c5fd; padding: 10pt; margin-bottom: 12pt; font-size: 10pt; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #334155; padding: 6pt; text-align: left; }
    td { border: 1px solid #94a3b8; padding: 6pt; vertical-align: top; }
  </style>
</head>
<body>
  <h1>TEMPLATE MICROSOFT WORD (TABEL 11 KOLOM) — BANK SOAL CBT MULTI-MAPEL</h1>
  <div class="guide">
    <strong>PANDUAN CEPAT PENGGUNAAN DI MICROSOFT WORD:</strong><br/>
    1. Anda dapat mengedit tabel di bawah ini langsung di <strong>Microsoft Word</strong>, lalu simpan sebagai <strong>.docx</strong> atau <strong>.doc</strong> dan langsung upload ke sistem CBT.<br/>
    2. <strong>Cara Memasukkan Gambar:</strong> Langsung <em>Copy-Paste</em> atau <em>Insert &rarr; Pictures</em> gambar ke dalam sel <code>wacana</code>, <code>teks_soal</code>, atau <code>opsi_a..e</code>.<br/>
    3. <strong>Cara Menulis Rumus Matematika / Fisika / Kimia:</strong> Gunakan apitan tanda dolar <code>$...$</code> atau tag <code>[RUMUS:...]</code>:<br/>
       &bull; <strong>Matematika:</strong> Pecahan <code>$\\frac{a}{b}$</code>, Akar <code>$\\sqrt{x^2 + y^2}$</code>, Kuadrat <code>$x^2 + 5x + 6 = 0$</code>, Integral <code>$\\int_{0}^{2} 3x^2 dx$</code><br/>
       &bull; <strong>Fisika:</strong> <code>$\\sum \\vec{F} = m \\cdot \\vec{a}$</code>, <code>$E_k = \\frac{1}{2}mv^2$</code>, <code>$\\lambda = \\frac{v}{f}$</code>, <code>$R_{total} = R_1 + R_2$</code><br/>
       &bull; <strong>Kimia:</strong> <code>$\\ce{2H2 + O2 -> 2H2O}$</code>, <code>$\\ce{N2(g) + 3H2(g) <=> 2NH3(g)}$</code>, <code>$\\text{H}_2\\text{SO}_4$</code>, <code>$\\text{pH} = -\\log[\\text{H}^+]$</code>
  </div>

  <table>
    <thead>
      <tr>
        <th>id_soal</th>
        <th>jenis_soal</th>
        <th>wacana</th>
        <th>teks_soal</th>
        <th>opsi_a</th>
        <th>opsi_b</th>
        <th>opsi_c</th>
        <th>opsi_d</th>
        <th>opsi_e</th>
        <th>kunci_jawaban</th>
        <th>bobot</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>FIS-01</td>
        <td>PG</td>
        <td>Perhatikan diagram balok bermassa $m = 4\\text{ kg}$ yang ditarik gaya mendatar $F = 24\\text{ N}$ di atas bidang datar licin berikut:<br/><img src="${SAMPLE_PHYSICS_DIAGRAM_DATA_URL}" alt="Diagram Gaya Fisika" width="320" /></td>
        <td>Berdasarkan Hukum II Newton $\\sum \\vec{F} = m \\cdot \\vec{a}$, berapakah percepatan $a$ dan energi kinetik $E_k = \\frac{1}{2}mv^2$ balok setelah bergerak selama $t = 2\\text{ s}$ dari keadaan diam?</td>
        <td>$a = 6\\text{ m/s}^2$ dan $E_k = 288\\text{ J}$</td>
        <td>$a = 4\\text{ m/s}^2$ dan $E_k = 128\\text{ J}$</td>
        <td>$a = 6\\text{ m/s}^2$ dan $E_k = 144\\text{ J}$</td>
        <td>$a = 8\\text{ m/s}^2$ dan $E_k = 256\\text{ J}$</td>
        <td>$a = 12\\text{ m/s}^2$ dan $E_k = 576\\text{ J}$</td>
        <td>A</td>
        <td>2</td>
      </tr>
      <tr>
        <td>MAT-02</td>
        <td>PG</td>
        <td>Diketahui persamaan kuadrat $x^2 - 5x + 6 = 0$ dengan rumus akar-akar $x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.</td>
        <td>Nilai dari integral tentu $\\int_{1}^{3} (3x^2 - 4x + 1)\\,dx$ adalah...</td>
        <td>$10$</td>
        <td>$12$</td>
        <td>$14$</td>
        <td>$16$</td>
        <td>$18$</td>
        <td>B</td>
        <td>2</td>
      </tr>
      <tr>
        <td>KIM-03</td>
        <td>PG</td>
        <td>Reaksi kesetimbangan pembentukan amonia (Proses Haber-Bosch) berlangsung menurut persamaan termokimia: $$\\ce{N2(g) + 3H2(g) <=> 2NH3(g)} \\quad \\Delta H = -92\\text{ kJ/mol}$$</td>
        <td>Ungkapan tetapan kesetimbangan konsentrasi $K_c$ yang tepat untuk reaksi di atas adalah...</td>
        <td>$K_c = \\frac{[\\text{NH}_3]^2}{[\\text{N}_2][\\text{H}_2]^3}$</td>
        <td>$K_c = \\frac{[\\text{N}_2][\\text{H}_2]^3}{[\\text{NH}_3]^2}$</td>
        <td>$K_c = \\frac{[\\text{NH}_3]}{[\\text{N}_2][\\text{H}_2]}$</td>
        <td>$K_c = \\frac{2[\\text{NH}_3]}{[\\text{N}_2] + 3[\\text{H}_2]}$</td>
        <td>$K_c = [\\text{NH}_3]^2 [\\text{N}_2] [\\text{H}_2]^3$</td>
        <td>A</td>
        <td>2</td>
      </tr>
      <tr>
        <td>SOS-04</td>
        <td>Kompleks</td>
        <td>Transformasi digital mempercepat perubahan sosial di masyarakat perkotaan maupun perdesaan.</td>
        <td>Manakah di antara pernyataan berikut yang merupakan dampak positif modernisasi teknologi informasi? (Pilih lebih dari satu jawaban benar)</td>
        <td>Terbukanya akses pendidikan dan literasi ilmiah secara daring</td>
        <td>Meningkatnya efisiensi komunikasi lintas wilayah secara real-time</td>
        <td>Hilangnya seluruh norma sosial tradisional secara tiba-tiba</td>
        <td>Munculnya ekosistem ekonomi kreatif berbasis digital bagi UMKM</td>
        <td>Meningkatnya disorganisasi sosial akibat hoaks</td>
        <td>A,B,D</td>
        <td>3</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Generates a Microsoft Word (.doc) Template using the Standard Numbered Question Format
 * (1. Pertanyaan... A. ... B. ... Kunci: A) so teachers can write naturally without tables.
 */
export function generateWordQuestionTemplateNumberedDoc(): string {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Template Word Soal Bernomor CBT (Matematika, Fisika, Kimia, Sosiologi & Gambar)</title>
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
    @page { size: 21cm 29.7cm; margin: 2cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #0f172a; }
    h1 { font-size: 15pt; color: #1e3a8a; margin-bottom: 6pt; }
    .guide { background: #f0fdf4; border: 1px solid #86efac; padding: 10pt; margin-bottom: 14pt; font-size: 10pt; }
    p { margin: 3pt 0; }
  </style>
</head>
<body>
  <h1>TEMPLATE WORD SOAL BERNOMOR — BANK SOAL CBT</h1>
  <div class="guide">
    <strong>PETUNJUK PENULISAN SOAL BERNOMOR DI WORD:</strong><br/>
    &bull; Awali setiap soal dengan nomor (<code>1.</code>, <code>2.</code>, <code>3.</code> dst.), diikuti pilihan <code>A.</code> sampai <code>E.</code>, lalu baris <code>Kunci: A</code> (atau <code>Kunci: A, B, D</code> untuk PG Kompleks) dan <code>Bobot: 2</code>.<br/>
    &bull; Jika soal memiliki bacaan/gambar pengantar, awali baris dengan <code>Wacana: ...</code>.<br/>
    &bull; Anda bebas menyisipkan <strong>Gambar (Copy-Paste / Insert Picture)</strong> dan <strong>Rumus Matematika/Fisika/Kimia</strong> (<code>$...$</code> atau <code>\\ce{...}</code>).
  </div>

  <p>Wacana: Perhatikan diagram balok bermassa $m = 4\text{ kg}$ yang ditarik gaya mendatar $F = 24\text{ N}$ di atas bidang datar licin berikut:</p>
  <p><img src="${SAMPLE_PHYSICS_DIAGRAM_DATA_URL}" alt="Diagram Gaya Fisika" width="320" /></p>
  <p>1. Berdasarkan Hukum II Newton $\sum \vec{F} = m \cdot \vec{a}$, berapakah percepatan $a$ dan energi kinetik $E_k = \frac{1}{2}mv^2$ balok setelah bergerak selama $t = 2\text{ s}$ dari keadaan diam?</p>
  <p>A. $a = 6\text{ m/s}^2$ dan $E_k = 288\text{ J}$</p>
  <p>B. $a = 4\text{ m/s}^2$ dan $E_k = 128\text{ J}$</p>
  <p>C. $a = 6\text{ m/s}^2$ dan $E_k = 144\text{ J}$</p>
  <p>D. $a = 8\text{ m/s}^2$ dan $E_k = 256\text{ J}$</p>
  <p>E. $a = 12\text{ m/s}^2$ dan $E_k = 576\text{ J}$</p>
  <p>Kunci: A</p>
  <p>Bobot: 2</p>

  <br/>

  <p>Wacana: Diketahui rumus kuadrat $x_{1,2} = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ dan operasi kalkulus dasar.</p>
  <p>2. Nilai dari integral tentu $\int_{1}^{3} (3x^2 - 4x + 1)\,dx$ adalah...</p>
  <p>A. $10$</p>
  <p>B. $12$</p>
  <p>C. $14$</p>
  <p>D. $16$</p>
  <p>E. $18$</p>
  <p>Kunci: B</p>
  <p>Bobot: 2</p>

  <br/>

  <p>Wacana: Reaksi kesetimbangan pembentukan gas amonia berlangsung menurut persamaan: $$\ce{N2(g) + 3H2(g) <=> 2NH3(g)} \quad \Delta H = -92\text{ kJ/mol}$$</p>
  <p>3. Ungkapan tetapan kesetimbangan konsentrasi $K_c$ yang tepat untuk reaksi di atas adalah...</p>
  <p>A. $K_c = \frac{[\text{NH}_3]^2}{[\text{N}_2][\text{H}_2]^3}$</p>
  <p>B. $K_c = \frac{[\text{N}_2][\text{H}_2]^3}{[\text{NH}_3]^2}$</p>
  <p>C. $K_c = \frac{[\text{NH}_3]}{[\text{N}_2][\text{H}_2]}$</p>
  <p>D. $K_c = \frac{2[\text{NH}_3]}{[\text{N}_2] + 3[\text{H}_2]}$</p>
  <p>E. $K_c = [\text{NH}_3]^2 [\text{N}_2] [\text{H}_2]^3$</p>
  <p>Kunci: A</p>
  <p>Bobot: 2</p>

  <br/>

  <p>Wacana: Transformasi digital mempercepat perubahan sosial di masyarakat perkotaan maupun perdesaan.</p>
  <p>4. Manakah di antara pernyataan berikut yang merupakan dampak positif modernisasi teknologi informasi? (Pilih lebih dari satu jawaban benar)</p>
  <p>A. Terbukanya akses pendidikan dan literasi ilmiah secara daring</p>
  <p>B. Meningkatnya efisiensi komunikasi lintas wilayah secara real-time</p>
  <p>C. Hilangnya seluruh norma sosial tradisional secara tiba-tiba</p>
  <p>D. Munculnya ekosistem ekonomi kreatif berbasis digital bagi UMKM</p>
  <p>E. Meningkatnya disorganisasi sosial akibat hoaks</p>
  <p>Kunci: A, B, D</p>
  <p>Bobot: 3</p>
</body>
</html>`;
}

/**
 * Exports an existing list of QuestionItem[] into a ready-to-edit Microsoft Word (.doc) file,
 * converting [IMG:...] tokens back into real <img> elements for Word.
 */
export function exportQuestionsToWordDoc(
  examTitle: string,
  questionsList: QuestionItem[]
): string {
  const formatForWordHtml = (text: string | undefined | null) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;(sup|sub)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, '<$1>$2</$1>')
      .replace(/\[IMG:([^\]]+)\]/g, '<br/><img src="$1" alt="Gambar Soal" width="280" /><br/>')
      .replace(/\n/g, '<br/>');
  };

  const rowsHtml = questionsList
    .map((q, idx) => {
      const idSoal = q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`;
      const isKompleks = q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      return `<tr>
        <td>${idSoal}</td>
        <td>${isKompleks ? 'Kompleks' : 'PG'}</td>
        <td>${formatForWordHtml(q.data_opsi?.wacana || '')}</td>
        <td>${formatForWordHtml(q.teks_soal)}</td>
        <td>${formatForWordHtml(q.data_opsi?.opsi?.A || '')}</td>
        <td>${formatForWordHtml(q.data_opsi?.opsi?.B || '')}</td>
        <td>${formatForWordHtml(q.data_opsi?.opsi?.C || '')}</td>
        <td>${formatForWordHtml(q.data_opsi?.opsi?.D || '')}</td>
        <td>${formatForWordHtml(q.data_opsi?.opsi?.E || '')}</td>
        <td>${q.kunci_jawaban.join(',')}</td>
        <td>${q.bobot || (isKompleks ? 3 : 2)}</td>
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
  <style>
    @page { size: 29.7cm 21cm; margin: 1.5cm; mso-page-orientation: landscape; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #0f172a; }
    h1 { font-size: 15pt; color: #1e3a8a; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; border: 1px solid #334155; padding: 6pt; text-align: left; }
    td { border: 1px solid #94a3b8; padding: 6pt; vertical-align: top; }
  </style>
</head>
<body>
  <h1>BANK SOAL MICROSOFT WORD — ${examTitle} (${questionsList.length} Butir Soal)</h1>
  <table>
    <thead>
      <tr>
        <th>id_soal</th>
        <th>jenis_soal</th>
        <th>wacana</th>
        <th>teks_soal</th>
        <th>opsi_a</th>
        <th>opsi_b</th>
        <th>opsi_c</th>
        <th>opsi_d</th>
        <th>opsi_e</th>
        <th>kunci_jawaban</th>
        <th>bobot</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
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
