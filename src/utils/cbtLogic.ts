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

export const SOSIOLOGI_EXAM_CATEGORIES = [
  'Penilaian Harian (PH / Kuis)',
  'Penilaian Tengah Semester (PTS / STS)',
  'Penilaian Akhir Semester (PAS / SAS)',
  'Asesmen Sumatif Akhir Jenjang (ASAJ)',
  'Ujian Susulan & Remedial',
  'Try Out / Simulasi Mandiri HOTS',
] as const;

/**
 * Checks whether an exam distributed to (target_tingkat, target_kelas, target_rombel) applies to a student's class,
 * with optional requirement for active exam status (ignoring DRAF or SELESAI).
 */
export function isExamMatchedForStudentClass(
  exam: {
    target_tingkat?: string;
    target_kelas?: string;
    target_rombel?: string[];
    status_ujian?: string;
  },
  studentKelas: string,
  options?: { requireActive?: boolean }
): boolean {
  if (options?.requireActive) {
    const status = (exam.status_ujian || 'AKTIF').toUpperCase().trim();
    if (status !== 'AKTIF') {
      return false;
    }
  }

  const cleanStudentKelas = (studentKelas || '').toUpperCase().trim();

  // If a specific target_rombel list is specified, student's class must match one of them
  if (Array.isArray(exam.target_rombel) && exam.target_rombel.length > 0) {
    const matched = exam.target_rombel.some(
      (r) => (r || '').toUpperCase().trim() === cleanStudentKelas
    );
    if (!matched) return false;
  }

  const cleanTargetKelas = (exam.target_kelas || 'SEMUA').toUpperCase().trim();
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

/**
 * Generates a deterministic 32-bit positive integer hash from student identity, token, and exam.
 */
export function hashStudentSeed(
  studentId: number | string,
  token: string,
  examId: number | string
): number {
  const str = `${studentId}_${(token || '').toUpperCase().trim()}_${examId}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Creates a deterministic pseudo-random number generator (Mulberry32).
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array using Fisher-Yates with a seeded PRNG.
 */
export function shuffleArrayDeterministic<T>(array: T[], rng: () => number): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * Deterministically shuffles options A, B, C, D, E for a question,
 * and crucially recalculates the correct answer keys (kunci_jawaban)
 * so that scoring remains 100% accurate.
 */
export function shuffleQuestionOptions<T extends {
  id: number | string;
  data_opsi: {
    id_soal_csv?: string;
    wacana?: string;
    opsi: { A: string; B: string; C: string; D: string; E: string };
    opsi_original_map?: Record<string, string>;
  };
  kunci_jawaban: string[];
}>(question: T, rng: () => number): T {
  const origOpsi = question.data_opsi?.opsi;
  if (!origOpsi) return question;

  const validKeys: ('A' | 'B' | 'C' | 'D' | 'E')[] = ['A', 'B', 'C', 'D', 'E'];
  const populatedKeys = validKeys.filter(
    (k) =>
      origOpsi[k] !== undefined &&
      origOpsi[k] !== null &&
      String(origOpsi[k]).trim() !== ''
  );
  if (populatedKeys.length <= 1) return question;

  // Extract populated options as { originalKey, text }
  const pairs = populatedKeys.map((k) => ({
    originalKey: k,
    text: origOpsi[k],
  }));

  // Shuffle pairs
  const shuffledPairs = shuffleArrayDeterministic(pairs, rng);

  // Reassign to positions: first shuffled pair becomes A, second becomes B, etc.
  const newOpsi: { A: string; B: string; C: string; D: string; E: string } = {
    A: '',
    B: '',
    C: '',
    D: '',
    E: '',
  };
  const originalToNewMap: Record<string, string> = {};
  const newToOriginalMap: Record<string, string> = {};

  shuffledPairs.forEach((pair, idx) => {
    const newKey = validKeys[idx];
    newOpsi[newKey] = pair.text;
    originalToNewMap[pair.originalKey] = newKey;
    newToOriginalMap[newKey] = pair.originalKey;
  });

  // Fill in any remaining unpopulated keys if original had them
  validKeys.slice(shuffledPairs.length).forEach((k) => {
    newOpsi[k] = origOpsi[k] || '';
  });

  // Remap correct answer keys
  const normOriginalKeys = normalizeAnswerKeys(question.kunci_jawaban);
  const remappedKeys = normOriginalKeys
    .map((origK) => originalToNewMap[origK])
    .filter(Boolean);

  // Return new question with updated options and keys
  return {
    ...question,
    data_opsi: {
      ...question.data_opsi,
      opsi: newOpsi,
      opsi_original_map: newToOriginalMap,
    },
    kunci_jawaban: remappedKeys.sort(),
  };
}

/**
 * Returns deterministic package variant for a student.
 * If the student has an explicit `kode_soal`, it returns that.
 * Otherwise, allocates alternatingly using a stable hash (e.g. PAKET-A vs PAKET-B).
 */
export function getDeterministicStudentPackage(
  student: {
    id: number | string;
    nama?: string;
    kelas?: string;
    token_ujian?: string;
    kode_soal?: string;
    variasi_paket?: string;
  },
  numVariants = 2,
  variantLabels: string[] = ['PAKET-A', 'PAKET-B', 'PAKET-C', 'PAKET-D']
): string {
  if (student.kode_soal && student.kode_soal.trim()) {
    return student.kode_soal.trim().toUpperCase();
  }
  if (student.variasi_paket && student.variasi_paket.trim()) {
    const cleanV = student.variasi_paket.trim().toUpperCase();
    if (cleanV.startsWith('PAKET-')) return cleanV;
    return `PAKET-${cleanV}`;
  }

  // Derive stable alternating variant: if student id is numeric, consecutive IDs (101, 102...) alternate cleanly
  const idNum = Number(student.id);
  const maxV = Math.max(1, Math.min(numVariants, variantLabels.length));
  let variantIndex: number;
  if (!isNaN(idNum) && idNum >= 0) {
    variantIndex = idNum % maxV;
  } else {
    const str = `${student.kelas || ''}_${student.id}_${student.token_ujian || ''}`;
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    variantIndex = h % maxV;
  }
  return variantLabels[variantIndex];
}

/**
 * Assigns alternating package variants (A, B, C, D...) to students proportionally
 * within every class (rombel) and grade level (angkatan).
 */
export function assignPackageVariantsToStudents<T extends {
  id: number | string;
  nama: string;
  kelas: string;
  kode_soal?: string;
  variasi_paket?: string;
}>(
  students: T[],
  numVariants = 2,
  variantLabels: string[] = ['PAKET-A', 'PAKET-B', 'PAKET-C', 'PAKET-D'],
  activeExams?: {
    id: number | string;
    judul_ujian: string;
    target_tingkat?: string;
    target_kelas?: string;
    target_rombel?: string[];
    status_ujian?: string;
    kode_paket?: string;
    mode_multi_paket?: boolean;
    jumlah_paket?: number;
  }[]
): T[] {
  // Sort students stably by grade, class, and then by name
  const sorted = [...students].sort((a, b) => {
    const tA = extractTingkatFromKelas(a.kelas);
    const tB = extractTingkatFromKelas(b.kelas);
    if (tA !== tB) return tA.localeCompare(tB);
    const cComp = a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
    if (cComp !== 0) return cComp;
    return a.nama.localeCompare(b.nama, 'id');
  });

  const assignedMap = new Map<number | string, { kode_soal: string; variasi_paket: string }>();
  const classGroups: Record<string, T[]> = {};
  for (const s of sorted) {
    const k = (s.kelas || 'DEFAULT').trim();
    if (!classGroups[k]) classGroups[k] = [];
    classGroups[k].push(s);
  }

  const sortedClassKeys = Object.keys(classGroups).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  // Track running index per angkatan so odd-sized classes still balance across the grade
  const angkatanRunningCounter: Record<string, number> = {};

  for (const k of sortedClassKeys) {
    const group = classGroups[k];
    const tingkat = extractTingkatFromKelas(k);
    if (angkatanRunningCounter[tingkat] === undefined) {
      angkatanRunningCounter[tingkat] = 0;
    }

    // Check if activeExams are provided for this class
    const matchedForClass = (activeExams || [])
      .filter((ex) => isExamMatchedForStudentClass(ex, k, { requireActive: true }))
      .sort((a, b) => Number(a.id) - Number(b.id));

    const effectiveCount =
      matchedForClass.length > 1
        ? matchedForClass.length
        : matchedForClass.length === 1 && matchedForClass[0].mode_multi_paket
          ? Math.max(2, matchedForClass[0].jumlah_paket || numVariants)
          : Math.max(1, Math.min(numVariants, variantLabels.length));

    const distinctExamCodes =
      matchedForClass.length > 1
        ? new Set(
            matchedForClass
              .map((e) => (e.kode_paket || '').trim().toUpperCase())
              .filter(Boolean)
          ).size === matchedForClass.length
        : false;

    group.forEach((s) => {
      const counter = angkatanRunningCounter[tingkat]++;
      const vIdx = counter % effectiveCount;
      let code = variantLabels[vIdx] || `PAKET-${String.fromCharCode(65 + (vIdx % 26))}`;
      if (matchedForClass.length > 1 && distinctExamCodes) {
        code = (matchedForClass[vIdx].kode_paket || code).trim().toUpperCase();
      } else if (matchedForClass.length > 1) {
        code = `PAKET-${String.fromCharCode(65 + (vIdx % 26))}`;
      }
      const letter =
        code.replace(/^PAKET[-_\s]*/i, '').replace(/[^A-Z0-9]/gi, '') ||
        String.fromCharCode(65 + (vIdx % 26));
      assignedMap.set(s.id, {
        kode_soal: code,
        variasi_paket: letter,
      });
    });
  }

  return students.map((s) => {
    const assigned = assignedMap.get(s.id);
    if (!assigned) return s;
    return {
      ...s,
      kode_soal: assigned.kode_soal,
      variasi_paket: assigned.variasi_paket,
    };
  });
}

/**
 * Proportionally and deterministically resolves which Exam Package (ExamItem) and
 * Package Code (`kode_soal`) a student receives based on the student's position
 * within their class (`kelas`) and grade level (`angkatan`).
 * Guarantees 100% synchronization between Login preview, Active Exam session, and Scoring.
 */
export function resolveProportionalStudentExamPackage<
  TExam extends {
    id: number | string;
    judul_ujian: string;
    target_tingkat?: string;
    target_kelas?: string;
    target_rombel?: string[];
    status_ujian?: string;
    kode_paket?: string;
    mode_multi_paket?: boolean;
    jumlah_paket?: number;
    durasi_menit?: number;
    kategori_ujian?: string;
  },
  TStudent extends {
    id: number | string;
    nama: string;
    kelas: string;
    token_ujian?: string;
    kode_soal?: string;
    variasi_paket?: string;
  }
>(params: {
  student: TStudent;
  allStudents: TStudent[];
  exams: TExam[];
  questions?: { exam_id: number | string }[];
  preferredExamId?: number | string | null;
}): {
  exam: TExam | null;
  matchedExams: TExam[];
  packageCode: string;
  variantLetter: string;
  proportionalIndex: number;
  totalPackagesInPool: number;
  studentRankInClass: number;
  classTotalStudents: number;
} {
  const { student, allStudents, exams, questions, preferredExamId } = params;
  const studentKelas = (student?.kelas || '').trim();

  // 1. Filter all active exams matching this student's class/grade
  let matched = (exams || []).filter((ex) =>
    isExamMatchedForStudentClass(ex, studentKelas, { requireActive: true })
  );

  // If questions array is available and some matched exams have questions while others are empty,
  // prioritize active exams that actually have questions loaded so no student gets an empty exam.
  if (questions && questions.length > 0 && matched.length > 1) {
    const withQuestions = matched.filter((ex) =>
      questions.some((q) => Number(q.exam_id) === Number(ex.id))
    );
    if (withQuestions.length > 0) {
      matched = withQuestions;
    }
  }

  // Sort matched exams deterministically by ID ascending
  const sortedMatched = [...matched].sort((a, b) => Number(a.id) - Number(b.id));

  // 2. Compute student's exact rank in their class and angkatan
  const allStudentsList = allStudents || [];
  const normStudentKelas = studentKelas.toLowerCase();
  const classStudents = allStudentsList
    .filter((s) => (s.kelas || '').trim().toLowerCase() === normStudentKelas)
    .sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));
  const rankInClass = Math.max(
    0,
    classStudents.findIndex((s) => String(s.id) === String(student?.id))
  );

  const studentTingkat = extractTingkatFromKelas(studentKelas);
  const allClassesInAngkatan = getStudentLoginClasses(allStudentsList)
    .filter((c) => c.tingkat === studentTingkat)
    .map((c) => c.kelas.trim().toUpperCase());

  // Calculate cumulative student offset before this class in the same angkatan for exact grade-wide proportionality
  let cumulativeBeforeClass = 0;
  for (const clsName of allClassesInAngkatan) {
    if (clsName === studentKelas.toUpperCase()) break;
    const normCls = clsName.toLowerCase();
    cumulativeBeforeClass += allStudentsList.filter(
      (s) => (s.kelas || '').trim().toLowerCase() === normCls
    ).length;
  }

  const proportionalSeed = cumulativeBeforeClass + rankInClass;

  if (sortedMatched.length === 0) {
    return {
      exam: null,
      matchedExams: [],
      packageCode: student?.kode_soal || 'PAKET-A',
      variantLetter: 'A',
      proportionalIndex: 0,
      totalPackagesInPool: 0,
      studentRankInClass: rankInClass + 1,
      classTotalStudents: classStudents.length || 1,
    };
  }

  // 3. If multiple active ExamItems exist for this class/angkatan, distribute students proportionally across them
  if (sortedMatched.length > 1) {
    let chosenIdx = proportionalSeed % sortedMatched.length;

    // Only honor preferredExamId if explicitly requested AND valid in sortedMatched
    if (preferredExamId !== undefined && preferredExamId !== null && String(preferredExamId) !== '') {
      const prefIdx = sortedMatched.findIndex(
        (e) => String(e.id) === String(preferredExamId)
      );
      if (prefIdx >= 0) {
        chosenIdx = prefIdx;
      }
    }

    const chosenExam = sortedMatched[chosenIdx];
    const uniqueKodePakets = new Set(
      sortedMatched
        .map((e) => (e.kode_paket || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const hasDistinctKodePaket = uniqueKodePakets.size === sortedMatched.length;

    const letter = String.fromCharCode(65 + (chosenIdx % 26));
    const packageCode =
      hasDistinctKodePaket && chosenExam.kode_paket
        ? chosenExam.kode_paket.trim().toUpperCase()
        : `PAKET-${letter}`;

    return {
      exam: chosenExam,
      matchedExams: sortedMatched,
      packageCode,
      variantLetter: letter,
      proportionalIndex: chosenIdx,
      totalPackagesInPool: sortedMatched.length,
      studentRankInClass: rankInClass + 1,
      classTotalStudents: classStudents.length || 1,
    };
  }

  // 4. Single active ExamItem for this class/angkatan
  const singleExam = sortedMatched[0];
  const numVariants = singleExam.mode_multi_paket
    ? Math.max(2, singleExam.jumlah_paket || 2)
    : 1;
  const variantIdx = proportionalSeed % numVariants;
  const letter = String.fromCharCode(65 + (variantIdx % 26));
  const packageCode = singleExam.mode_multi_paket
    ? `PAKET-${letter}`
    : (singleExam.kode_paket || student?.kode_soal || 'PAKET-A').trim().toUpperCase();

  return {
    exam: singleExam,
    matchedExams: sortedMatched,
    packageCode,
    variantLetter: letter,
    proportionalIndex: variantIdx,
    totalPackagesInPool: numVariants,
    studentRankInClass: rankInClass + 1,
    classTotalStudents: classStudents.length || 1,
  };
}

/**
 * Returns the complete question set for the assigned exam package without
 * truncating or dropping questions (ensuring a 40-question exam always delivers 40 questions).
 * Only filters by explicit variant tag if the question bank is a combined multi-set (>50 questions)
 * where every variant has a complete >=35 question set.
 */
export function filterQuestionsForPackageVariant<T extends {
  id: number | string;
  data_opsi?: {
    id_soal_csv?: string;
    variasi_paket?: string;
  };
}>(
  questions: T[],
  packageCode: string,
  _numVariants = 2
): T[] {
  if (!questions || questions.length === 0) return questions;

  // Never slice or drop questions on a standard exam bank (e.g. <= 50 questions such as a 40-question exam)
  if (questions.length <= 50) {
    return questions;
  }

  const letter = packageCode.replace(/[^A-D]/gi, '').toUpperCase() || 'A';
  const matched = questions.filter((q) => {
    const explicit = (q.data_opsi?.variasi_paket || '').toUpperCase();
    if (explicit === letter || explicit === packageCode.toUpperCase() || explicit === 'SEMUA') {
      return true;
    }
    const matchCsv = (q.data_opsi?.id_soal_csv || '').toUpperCase();
    if (
      matchCsv.includes(`PAKET-${letter}`) ||
      matchCsv.includes(`PAKET ${letter}`) ||
      matchCsv.includes(`[${letter}]`)
    ) {
      return true;
    }
    return false;
  });

  // Only use the tagged subset if it contains a full exam set (>= 35 questions)
  if (matched.length >= 35) {
    return matched;
  }

  return questions;
}

/**
 * Maps student answers from shuffled display option keys (A-E) back to
 * the original canonical Bank Soal option keys (A-E) using `opsi_original_map`.
 * This guarantees that saved `jawaban_siswa` in the database matches the Bank Soal 1-to-1.
 */
export function mapStudentAnswersToCanonicalKeys(
  questions: {
    id: number | string;
    data_opsi?: {
      opsi_original_map?: Record<string, string>;
    } | null;
  }[],
  studentAnswers: Record<string, string[]>
): Record<string, string[]> {
  if (!studentAnswers || typeof studentAnswers !== 'object') return {};
  const mapById = new Map<string, Record<string, string>>();
  for (const q of questions || []) {
    if (q.data_opsi?.opsi_original_map) {
      mapById.set(String(q.id), q.data_opsi.opsi_original_map);
    }
  }

  const canonical: Record<string, string[]> = {};
  for (const [qId, chosen] of Object.entries(studentAnswers)) {
    if (!Array.isArray(chosen)) continue;
    const origMap = mapById.get(String(qId));
    if (origMap) {
      canonical[qId] = chosen
        .map((k) => {
          const clean = String(k || '').toUpperCase().trim();
          return origMap[clean] || clean;
        })
        .filter(Boolean)
        .sort();
    } else {
      canonical[qId] = normalizeAnswerKeys(chosen);
    }
  }
  return canonical;
}

/**
 * Prepares the final question set for a student, orchestrating:
 * 1. Synchronized Package Code determination (never mismatched with activeExam)
 * 2. Full Question Set preservation (all 40 questions preserved)
 * 3. Seeded Question Shuffling (Acak Soal - if enabled)
 * 4. Seeded Option Shuffling with Recalculated Answer Keys (Acak Opsi - if enabled)
 */
export function prepareStudentExamQuestions<T extends {
  id: number | string;
  exam_id: number | string;
  teks_soal: string;
  tipe_soal: 'PG' | 'Kompleks' | string;
  data_opsi: {
    id_soal_csv?: string;
    wacana?: string;
    opsi: { A: string; B: string; C: string; D: string; E: string };
    opsi_original_map?: Record<string, string>;
    variasi_paket?: string;
  };
  kunci_jawaban: string[];
  bobot: number;
}>(params: {
  questions: T[];
  student: {
    id: number | string;
    nama: string;
    kelas: string;
    token_ujian: string;
    kode_soal?: string;
    variasi_paket?: string;
  };
  exam: {
    id: number | string;
    judul_ujian: string;
    acak_soal?: boolean;
    acak_opsi?: boolean;
    kode_paket?: string;
    mode_multi_paket?: boolean;
    jumlah_paket?: number;
  };
  forcedPackageCode?: string;
}): {
  questions: T[];
  studentPackageCode: string;
  isQuestionShuffled: boolean;
  isOptionShuffled: boolean;
  originalQuestionCount: number;
} {
  const { questions, student, exam, forcedPackageCode } = params;
  // Filter to only questions belonging to this exam_id if exam_id is populated
  const examSpecificQuestions = (questions || []).filter(
    (q) => q.exam_id === undefined || Number(q.exam_id) === Number(exam.id)
  );
  const baseQuestions =
    examSpecificQuestions.length > 0 ? examSpecificQuestions : questions || [];

  if (baseQuestions.length === 0) {
    return {
      questions: [],
      studentPackageCode:
        forcedPackageCode || exam.kode_paket || student.kode_soal || 'PAKET-A',
      isQuestionShuffled: false,
      isOptionShuffled: false,
      originalQuestionCount: 0,
    };
  }

  // 1. Determine synchronized student package code
  const numVariants = exam.jumlah_paket || 2;
  let packageCode: string;
  if (forcedPackageCode && forcedPackageCode.trim()) {
    packageCode = forcedPackageCode.trim().toUpperCase();
  } else if (exam.mode_multi_paket) {
    packageCode =
      student.kode_soal && student.kode_soal.trim()
        ? student.kode_soal.trim().toUpperCase()
        : getDeterministicStudentPackage(student, numVariants);
  } else if (exam.kode_paket && exam.kode_paket.trim()) {
    packageCode = exam.kode_paket.trim().toUpperCase();
  } else if (student.kode_soal && student.kode_soal.trim()) {
    packageCode = student.kode_soal.trim().toUpperCase();
  } else {
    packageCode = getDeterministicStudentPackage(student, numVariants);
  }

  // 2. Keep full question set for the package
  let workingQuestions = [...baseQuestions];
  if (exam.mode_multi_paket) {
    workingQuestions = filterQuestionsForPackageVariant(
      baseQuestions,
      packageCode,
      numVariants
    );
  }

  // 3. Deterministic Seed (incorporates student, token, exam.id, and packageCode)
  const studentSeed = hashStudentSeed(
    `${student.id}_${packageCode}`,
    student.token_ujian,
    exam.id
  );
  const qRng = createSeededRandom(studentSeed);

  // 4. Acak Urutan Soal (Shuffle Questions) - default true unless explicitly false
  const shouldShuffleQuestions = exam.acak_soal !== false;
  if (shouldShuffleQuestions && workingQuestions.length > 1) {
    workingQuestions = shuffleArrayDeterministic(workingQuestions, qRng);
  }

  // 5. Acak Opsi Jawaban (Shuffle Options) - default true unless explicitly false
  const shouldShuffleOptions = exam.acak_opsi !== false;
  if (shouldShuffleOptions) {
    workingQuestions = workingQuestions.map((q, idx) => {
      const optSeed = (studentSeed + Number(q.id) * 37 + idx * 13) >>> 0;
      const optRng = createSeededRandom(optSeed);
      return shuffleQuestionOptions(q, optRng);
    });
  }

  return {
    questions: workingQuestions,
    studentPackageCode: packageCode,
    isQuestionShuffled: shouldShuffleQuestions,
    isOptionShuffled: shouldShuffleOptions,
    originalQuestionCount: baseQuestions.length,
  };
}

/**
 * Ensures a student's saved `jawaban_siswa` is 100% synchronized with the canonical
 * Bank Soal `questions`. If a historical result was saved with shuffled option keys,
 * this deterministically reconstructs the student's option map and translates the answers
 * so that `calculateExamScore(questions, syncedAnswers)` matches the recorded score and keys.
 */
export function resolveSyncedStudentAnswersForExam<
  TQuestion extends {
    id: number | string;
    exam_id: number | string;
    teks_soal: string;
    tipe_soal: 'PG' | 'Kompleks' | string;
    data_opsi: {
      id_soal_csv?: string;
      wacana?: string;
      opsi: { A: string; B: string; C: string; D: string; E: string };
      opsi_original_map?: Record<string, string>;
      variasi_paket?: string;
    };
    kunci_jawaban: string[];
    bobot: number;
  }
>(params: {
  questions: TQuestion[];
  jawabanSiswa?: Record<string, string[]> | null;
  student?: {
    id: number | string;
    nama: string;
    kelas: string;
    token_ujian: string;
    kode_soal?: string;
    variasi_paket?: string;
  } | null;
  exam?: {
    id: number | string;
    judul_ujian: string;
    acak_soal?: boolean;
    acak_opsi?: boolean;
    kode_paket?: string;
    mode_multi_paket?: boolean;
    jumlah_paket?: number;
  } | null;
  recordedScore?: number | null;
}): Record<string, string[]> {
  const rawAnswers = params.jawabanSiswa || {};
  if (
    !params.questions ||
    params.questions.length === 0 ||
    Object.keys(rawAnswers).length === 0
  ) {
    return rawAnswers;
  }

  if (
    params.student &&
    params.exam &&
    params.exam.acak_opsi !== false &&
    typeof params.recordedScore === 'number'
  ) {
    const directScore = calculateExamScore(params.questions, rawAnswers);
    if (directScore.normalizedScore !== params.recordedScore) {
      // Try both default seed and packageCode seed to match any historical session
      const candidateSeeds = [
        hashStudentSeed(params.student.id, params.student.token_ujian, params.exam.id),
        hashStudentSeed(
          `${params.student.id}_${params.student.kode_soal || params.exam.kode_paket || 'PAKET-A'}`,
          params.student.token_ujian,
          params.exam.id
        ),
      ];

      let bestRemapped = rawAnswers;
      let bestDiff = Math.abs(directScore.normalizedScore - params.recordedScore);

      for (const seed of candidateSeeds) {
        const qRng = createSeededRandom(seed);
        let working = [...params.questions];
        if (params.exam.acak_soal !== false && working.length > 1) {
          working = shuffleArrayDeterministic(working, qRng);
        }
        working = working.map((q, idx) => {
          const optSeed = (seed + Number(q.id) * 37 + idx * 13) >>> 0;
          const optRng = createSeededRandom(optSeed);
          return shuffleQuestionOptions(q, optRng);
        });

        const remapped = mapStudentAnswersToCanonicalKeys(working, rawAnswers);
        const remappedScore = calculateExamScore(params.questions, remapped);
        const diff = Math.abs(remappedScore.normalizedScore - params.recordedScore);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestRemapped = remapped;
        }
        if (diff === 0) break;
      }

      return bestRemapped;
    }
  }

  return rawAnswers;
}




