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
  kategoriNilai: 'Sangat Baik (A)' | 'Baik (B)' | 'Cukup (C)' | 'Perlu Bimbingan (D)';
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
 * Supports formats like:
 * - "XII MIPA 1", "12 IPA 1", "Kelas 12" -> '12'
 * - "XI IPS 2", "11 MIPA 1", "Kelas 11" -> '11'
 * - "X MIPA 1", "10-A", "Kelas 10" -> '10'
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

  // 1. Specific class target check (e.g., "X MIPA 1")
  if (cleanTargetKelas !== 'SEMUA' && cleanTargetKelas !== '') {
    return cleanTargetKelas === cleanStudentKelas;
  }

  // 2. Grade level (Tingkat 10 / 11 / 12) check
  const cleanTargetTingkat = (exam.target_tingkat || 'SEMUA').toUpperCase().trim();
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
        .split(/[,;|/\s]+/)
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
 * Parses a single CSV line handling double-quoted fields containing commas
 */
export function splitCsvLine(line: string): string[] {
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
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
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
 * Parses Bulk Student CSV content.
 * Supports headers: nama (or nama_siswa), kelas, and optional token_ujian
 * Also supports headerless 2-column lines: "Nama Siswa, Kelas"
 */
export function parseStudentsCsv(csvText: string): {
  rows: CsvStudentRow[];
  errors: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      errors: ['File CSV atau daftar siswa kosong.'],
    };
  }

  const firstCells = splitCsvLine(lines[0]).map((c) =>
    c.toLowerCase().replace(/^["']|["']$/g, '').trim()
  );

  const hasHeader =
    firstCells.includes('nama') ||
    firstCells.includes('nama_siswa') ||
    firstCells.includes('nama lengkap') ||
    firstCells.includes('kelas');

  let namaIdx = 0;
  let kelasIdx = 1;
  let tokenIdx = -1;

  if (hasHeader) {
    namaIdx = firstCells.findIndex((c) =>
      ['nama', 'nama_siswa', 'nama lengkap', 'nama siswa'].includes(c)
    );
    kelasIdx = firstCells.findIndex((c) =>
      ['kelas', 'rombel', 'tingkat_kelas'].includes(c)
    );
    tokenIdx = firstCells.findIndex((c) =>
      ['token', 'token_ujian'].includes(c)
    );
    if (namaIdx === -1) namaIdx = 0;
    if (kelasIdx === -1) kelasIdx = 1;
  }

  const startRow = hasHeader ? 1 : 0;
  const rows: CsvStudentRow[] = [];
  const errors: string[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]).map((c) =>
      c.replace(/^["']|["']$/g, '').trim()
    );
    const nama = cells[namaIdx] || '';
    const kelas = cells[kelasIdx] || '';
    const rawToken = tokenIdx >= 0 ? (cells[tokenIdx] || '').toUpperCase() : '';

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
    errors.push('Tidak ada baris data siswa yang valid ditemukan di dalam CSV.');
  }

  return { rows, errors };
}

/**
 * Parses CSV content with required headers:
 * id_soal, jenis_soal, wacana, teks_soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, kunci_jawaban, bobot
 */
export function parseQuestionsCsv(csvText: string): {
  rows: CsvQuestionRow[];
  errors: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['File CSV kosong atau tidak memiliki baris data soal.'],
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

  const headerCells = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/^["']|["']$/g, '').trim()
  );

  const missingHeaders = requiredHeaders.filter(
    (req) => !headerCells.includes(req)
  );
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [
        `Header CSV tidak sesuai template. Kolom yang hilang: ${missingHeaders.join(', ')}`,
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
    const cells = splitCsvLine(lines[i]);
    if (cells.length < requiredHeaders.length) {
      errors.push(`Baris ${i + 1}: Jumlah kolom kurang dari 11 kolom.`);
      continue;
    }

    const getVal = (col: string) =>
      (cells[colIndex[col]] ?? '').replace(/^["']|["']$/g, '').trim();

    const id_soal = getVal('id_soal') || `Q-${i}`;
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
        `Baris ${i + 1} (${id_soal}): Kunci jawaban tidak valid (gunakan A-E, misal "A" atau "A,C").`
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

export const SAMPLE_STUDENT_CSV_TEMPLATE = `nama_siswa,kelas
Aditya Pratama,X MIPA 1
Siti Nurhaliza,X MIPA 2
Bagas Setiawan,XI MIPA 1
Putri Maharani,XI IPS 1
Reza Rahadian,XII MIPA 1
Aulia Rahman,XII IPS 2`;

export const SAMPLE_CSV_TEMPLATE = `id_soal,jenis_soal,wacana,teks_soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,kunci_jawaban,bobot
SOAL-01,PG,"Perhatikan konsep arsitektur jaringan komputer modern dan protokol komunikasi data TCP/IP.","Pada model lapisan OSI, lapisan manakah yang bertanggung jawab penuh atas penentuan rute terbaik (routing) dan pengalamatan logis paket data menggunakan alamat IP?",Physical Layer,Data Link Layer,Network Layer,Transport Layer,Application Layer,C,2
SOAL-02,Kompleks,"Sebuah perusahaan rintisan (startup) sedang merancang sistem autentikasi dan otorisasi berbasis cloud untuk 500.000 pengguna aktif harian. Arsitek keamanan menyarankan penerapan Zero-Trust Security.","Manakah dari pernyataan berikut yang merupakan praktik keamanan yang tepat untuk melindungi endpoint API dan kredensial pengguna? (Pilih lebih dari satu jawaban benar)",Menyimpan password pengguna dalam bentuk plaintext di tabel database agar mudah diverifikasi,Menggunakan algoritma hashing bcrypt atau Argon2 disertai salt unik untuk setiap password,Menyimpan secret API key langsung di kode frontend React agar tidak membebani server,Menerapkan JSON Web Token (JWT) berumur pendek dengan validasi signature di sisi server,Mengaktifkan pembatasan laju permintaan (Rate Limiting) untuk mencegah serangan brute-force,"B,D,E",3
SOAL-03,PG,"Dalam analisis algoritma pengurutan data (sorting), efisiensi waktu eksekusi diukur menggunakan notasi Big-O.","Berapakah kompleksitas waktu rata-rata (average-case time complexity) dari algoritma Merge Sort saat mengurutkan n elemen data?",O(1),O(log n),O(n),O(n log n),O(n^2),D,2`;
