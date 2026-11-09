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
  const rawList = Array.isArray(keys)
    ? keys
    : String(keys)
        .split(/[,;|/+\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  const validSet = new Set<string>();
  for (const item of rawList) {
    const clean = item.toUpperCase().replace(/[^A-E]/g, '');
    if (clean.length === 1 && ['A', 'B', 'C', 'D', 'E'].includes(clean)) {
      validSet.add(clean);
    } else if (clean.length > 1) {
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
  if (countSemi > 0 && countSemi >= countComma) {
    return ';';
  }
  return ',';
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
 * Converts HTML <table> (.xls) or raw text into clean lines, removing BOM and 'sep=' directives
 */
export function normalizeSpreadsheetLines(rawInput: string): {
  lines: string[];
  delimiter: ',' | ';' | '\t';
} {
  const cleanText = (rawInput || '').replace(/^\uFEFF/, '').trim();

  // Support importing HTML-based .xls files directly if the teacher re-uploads the downloaded .xls
  if (/<table[\s>]/i.test(cleanText) && /<tr[\s>]/i.test(cleanText)) {
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
          .trim()
      );
      if (cells.some(Boolean)) {
        extractedLines.push(cells.join('\t'));
      }
    }
    return { lines: extractedLines, delimiter: '\t' };
  }

  let forcedDelimiter: ',' | ';' | '\t' | undefined;
  const rawLines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const filteredLines: string[] = [];
  for (const line of rawLines) {
    if (/^sep\s*=\s*(.|\\t)$/i.test(line)) {
      const m = line.match(/^sep\s*=\s*(.|\\t)$/i);
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

  const hasHeader =
    firstCells.some((c) =>
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
    const lineDelim = detectCsvDelimiter(lines[i]) || delimiter;
    const cells = splitCsvLine(lines[i], lineDelim).map((c) =>
      c.replace(/^["']|["']$/g, '').trim()
    );
    const nama = cells[namaIdx] || '';
    const kelas = cells[kelasIdx] || '';
    const rawToken =
      tokenIdx >= 0 ? (cells[tokenIdx] || '').toUpperCase().trim() : '';

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

/**
 * Parses Question Bank CSV / Excel content with 11 required columns:
 * id_soal, jenis_soal, wacana, teks_soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, bobot
 */
export function parseQuestionsCsv(csvText: string): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const { lines, delimiter } = normalizeSpreadsheetLines(csvText);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['File CSV/Excel kosong atau tidak memiliki baris data soal.'],
    };
  }

  const requiredHeaders = [
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
  ];

  const headerCells = splitCsvLine(lines[0], delimiter).map((h) =>
    h
      .toLowerCase()
      .replace(/^["']|["']$/g, '')
      .trim()
      .replace(/\s+/g, '_')
  );

  const missingHeaders = requiredHeaders.filter(
    (req) => !headerCells.includes(req)
  );
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [
        `Header tabel soal tidak sesuai template. Kolom yang belum ada: ${missingHeaders.join(
          ', '
        )}`,
      ],
    };
  }

  const colIndex: Record<string, number> = {};
  headerCells.forEach((h, idx) => {
    colIndex[h] = idx;
  });

  const rows: CsvQuestionRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineDelim = detectCsvDelimiter(lines[i]) || delimiter;
    const cells = splitCsvLine(lines[i], lineDelim);
    if (cells.length < requiredHeaders.length) {
      errors.push(`Baris ${i + 1}: Jumlah kolom kurang dari 11 kolom.`);
      continue;
    }

    const getVal = (col: string) =>
      (cells[colIndex[col]] ?? '').replace(/^["']|["']$/g, '').trim();

    const id_soal = getVal('id_soal') || `SOAL-${i}`;
    const rawJenis = getVal('jenis_soal').toUpperCase();
    const jenis_soal: 'PG' | 'Kompleks' =
      rawJenis.includes('KOMPLEKS') || rawJenis === 'PGK' ? 'Kompleks' : 'PG';
    const wacana = getVal('wacana');
    const teks_soal = getVal('teks_soal');
    const opsi_a = getVal('opsi_a');
    const opsi_b = getVal('opsi_b');
    const opsi_c = getVal('opsi_c');
    const opsi_d = getVal('opsi_d');
    const opsi_e = getVal('opsi_e');
    const kunci_jawaban = normalizeAnswerKeys(getVal('kunci_jawaban'));
    const rawBobot = parseInt(getVal('bobot'), 10);
    const bobot =
      !isNaN(rawBobot) && rawBobot > 0
        ? rawBobot
        : jenis_soal === 'Kompleks'
          ? 3
          : 2;

    if (!teks_soal) {
      errors.push(`Baris ${i + 1} (${id_soal}): Teks soal wajib diisi.`);
      continue;
    }

    if (kunci_jawaban.length === 0) {
      errors.push(
        `Baris ${i + 1} (${id_soal}): Kunci jawaban tidak valid (gunakan huruf A-E, misal "C" untuk PG Biasa atau "B,D,E" untuk PG Kompleks).`
      );
      continue;
    }

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
