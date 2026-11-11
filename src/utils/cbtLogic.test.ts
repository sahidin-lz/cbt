import test from 'node:test';
import assert from 'node:assert/strict';
import { StudentItem } from '../types/cbt';
import {
  calculateExamScore,
  parseQuestionsCsv,
  parseStudentsCsv,
  extractTingkatFromKelas,
  isExamMatchedForStudentClass,
  generateExamToken,
  normalizeAnswerKeys,
  generateStudentTemplateExcel,
  generateQuestionTemplateExcel,
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_STUDENT_CSV_TEMPLATE,
  computeClassAnalytics,
  buildSemicolonCsv,
  classifyQuestionCognitiveLevel,
  calculateStudentLotsVsHots,
  getStudentLoginClasses,
  getStudentsForClass,
  validateStudentCascadingLogin,
  SOSIOLOGI_EXAM_CATEGORIES,
} from './cbtLogic.ts';

test('generateExamToken returns 6-character uppercase alphanumeric string', () => {
  const token1 = generateExamToken(42);
  const token2 = generateExamToken();
  assert.equal(token1.length, 6);
  assert.equal(token2.length, 6);
  assert.match(token1, /^[A-Z2-9]{6}$/);
  assert.match(token2, /^[A-Z2-9]{6}$/);
});

test('normalizeAnswerKeys parses single and multiple keys accurately', () => {
  assert.deepEqual(normalizeAnswerKeys('c'), ['C']);
  assert.deepEqual(normalizeAnswerKeys('B, D, E'), ['B', 'D', 'E']);
  assert.deepEqual(normalizeAnswerKeys(['e', 'a', 'A']), ['A', 'E']);
});

test('calculateExamScore awards 2 points for PG Biasa, 3 for Kompleks full, 1-2 for partial, 0 for wrong', () => {
  const questions = [
    { id: 1, tipe_soal: 'PG', kunci_jawaban: ['C'], bobot: 2 },
    { id: 2, tipe_soal: 'Kompleks', kunci_jawaban: ['B', 'D', 'E'], bobot: 3 },
    { id: 3, tipe_soal: 'Kompleks', kunci_jawaban: ['A', 'B', 'D'], bobot: 3 },
    { id: 4, tipe_soal: 'PG', kunci_jawaban: ['B'], bobot: 2 },
  ];

  const summary = calculateExamScore(questions, {
    '1': ['C'],
    '2': ['B', 'D'],
    '3': ['A', 'B', 'D'],
    '4': ['A'],
  });

  assert.equal(summary.rawEarned, 7);
  assert.equal(summary.rawMax, 10);
  assert.equal(summary.normalizedScore, 70);
  assert.equal(summary.kategoriNilai, 'Baik (B)');
});

test('parseQuestionsCsv parses semicolon-separated Excel template and HTML .xls table with 11 columns', () => {
  const parsed = parseQuestionsCsv(SAMPLE_CSV_TEMPLATE);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].id_soal, 'SOAL-01');
  assert.equal(parsed.rows[0].jenis_soal, 'PG');
  assert.deepEqual(parsed.rows[0].kunci_jawaban, ['B']);
  assert.equal(parsed.rows[1].jenis_soal, 'Kompleks');
  assert.deepEqual(parsed.rows[1].kunci_jawaban, ['B', 'D', 'E']);
  assert.equal(parsed.rows[1].bobot, 3);

  // Also test parsing directly from the generated Excel (.xls) template
  const xlsContent = generateQuestionTemplateExcel();
  const parsedXls = parseQuestionsCsv(xlsContent);
  assert.equal(parsedXls.errors.length, 0);
  assert.equal(parsedXls.rows.length, 3);
  assert.deepEqual(parsedXls.rows[1].kunci_jawaban, ['B', 'D', 'E']);
});

test('parseQuestionsCsv handles multiline quoted wacana, flexible headers, unquoted commas in semicolon CSV, and headerless rows', () => {
  // 1. Multiline quoted wacana + missing trailing bobot column
  const multilineCsv = `id_soal;jenis_soal;wacana;teks_soal;opsi_a;opsi_b;opsi_c;opsi_d;opsi_e;kunci_jawaban
SOAL-10;PG;"Paragraf pertama wacana sosiologi, terdiri dari beberapa kalimat.
Paragraf kedua dengan baris baru di dalam tanda kutip Excel.";"Apa kesimpulan utama dari wacana di atas?";Opsi Satu;Opsi Dua;Opsi Tiga;Opsi Empat;Opsi Lima;C`;
  const parsedMultiline = parseQuestionsCsv(multilineCsv);
  assert.equal(parsedMultiline.errors.length, 0);
  assert.equal(parsedMultiline.rows.length, 1);
  assert.equal(parsedMultiline.rows[0].id_soal, 'SOAL-10');
  assert.deepEqual(parsedMultiline.rows[0].kunci_jawaban, ['C']);
  assert.equal(parsedMultiline.rows[0].bobot, 2);

  // 2. Simplified headers (no, soal, a, b, c, d, e, kunci) with comma delimiter
  const simplifiedCsv = `no,soal,a,b,c,d,e,kunci
1,"Siapakah tokoh sosiologi yang memperkenalkan konsep fakta sosial?",Max Weber,Emile Durkheim,Karl Marx,Auguste Comte,Herbert Spencer,Jawaban: B
2,"Pilih faktor pendorong interaksi sosial!",Imitasi,Sugesti,Isolasi,Simpati, Konflik,"A,B,D"`;
  const parsedSimple = parseQuestionsCsv(simplifiedCsv);
  assert.equal(parsedSimple.errors.length, 0);
  assert.equal(parsedSimple.rows.length, 2);
  assert.equal(parsedSimple.rows[0].jenis_soal, 'PG');
  assert.deepEqual(parsedSimple.rows[0].kunci_jawaban, ['B']);
  assert.equal(parsedSimple.rows[1].jenis_soal, 'Kompleks');
  assert.deepEqual(parsedSimple.rows[1].kunci_jawaban, ['A', 'B', 'D']);
  assert.equal(parsedSimple.rows[1].bobot, 3);

  // 3. Headerless 7-column semicolon CSV where Indonesian sentence has many commas
  const headerlessCsv = `Dalam masyarakat modern, interaksi antara individu, kelompok, lembaga, dan budaya berlangsung dinamis. Manakah syarat interaksi sosial?;Asimilasi, akulturasi, dan difusi;Kontak sosial dan komunikasi;Imitasi, sugesti, dan simpati;Akomodasi dan kooperasi;Kompetisi dan kontravensi;B`;
  const parsedHeaderless = parseQuestionsCsv(headerlessCsv);
  assert.equal(parsedHeaderless.errors.length, 0);
  assert.equal(parsedHeaderless.rows.length, 1);
  assert.deepEqual(parsedHeaderless.rows[0].kunci_jawaban, ['B']);
});

test('extractTingkatFromKelas and isExamMatchedForStudentClass handle 3 grade levels (X/10, XI/11, XII/12)', () => {
  assert.equal(extractTingkatFromKelas('X MIPA 1'), '10');
  assert.equal(extractTingkatFromKelas('10-B'), '10');
  assert.equal(extractTingkatFromKelas('XI IPS 2'), '11');
  assert.equal(extractTingkatFromKelas('11 IPA 1'), '11');
  assert.equal(extractTingkatFromKelas('XII MIPA 1'), '12');
  assert.equal(extractTingkatFromKelas('12 TKJ'), '12');

  const examKelas10 = { target_tingkat: '10', target_kelas: 'SEMUA' };
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'X MIPA 1'), true);
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'XI MIPA 1'), false);
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'XII MIPA 1'), false);

  const examSpecific = { target_tingkat: '11', target_kelas: 'XI IPS 2' };
  assert.equal(isExamMatchedForStudentClass(examSpecific, 'XI IPS 2'), true);
  assert.equal(isExamMatchedForStudentClass(examSpecific, 'XI MIPA 1'), false);

  // Status Ujian (Draf vs Aktif)
  const draftExam = { target_tingkat: '12', target_kelas: 'SEMUA', status_ujian: 'DRAF' };
  assert.equal(isExamMatchedForStudentClass(draftExam, 'XII IPS 1', { requireActive: true }), false);
  assert.equal(isExamMatchedForStudentClass(draftExam, 'XII IPS 1'), true);

  const activeExam = { target_tingkat: '12', target_kelas: 'SEMUA', status_ujian: 'AKTIF' };
  assert.equal(isExamMatchedForStudentClass(activeExam, 'XII IPS 1', { requireActive: true }), true);

  // Target Rombel spesifik
  const rombelExam = {
    target_tingkat: '12',
    target_kelas: 'SEMUA',
    target_rombel: ['XII IPS 1', 'XII IPS 2'],
    status_ujian: 'AKTIF',
  };
  assert.equal(isExamMatchedForStudentClass(rombelExam, 'XII IPS 1'), true);
  assert.equal(isExamMatchedForStudentClass(rombelExam, 'XII IPS 2'), true);
  assert.equal(isExamMatchedForStudentClass(rombelExam, 'XII IPS 3'), false);

  // Sosiologi categories validation
  assert.equal(SOSIOLOGI_EXAM_CATEGORIES.includes('Penilaian Tengah Semester (PTS / STS)'), true);
  assert.equal(SOSIOLOGI_EXAM_CATEGORIES.includes('Penilaian Akhir Semester (PAS / SAS)'), true);
  assert.equal(SOSIOLOGI_EXAM_CATEGORIES.includes('Ujian Susulan & Remedial'), true);
});

test('parseStudentsCsv parses semicolon-separated CSV, comma-separated CSV, and Excel .xls across 3 grade levels', () => {
  const parsed = parseStudentsCsv(SAMPLE_STUDENT_CSV_TEMPLATE);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 6);
  assert.equal(parsed.rows[0].nama, 'Aditya Pratama');
  assert.equal(parsed.rows[0].tingkat, '10');
  assert.equal(parsed.rows[2].tingkat, '11');
  assert.equal(parsed.rows[4].tingkat, '12');

  const parsedXls = parseStudentsCsv(generateStudentTemplateExcel());
  assert.equal(parsedXls.errors.length, 0);
  assert.equal(parsedXls.rows.length, 6);
  assert.equal(parsedXls.rows[1].nama, 'Siti Nurhaliza');
});

test('computeClassAnalytics and buildSemicolonCsv compute per-class statistics and clean CSV output', () => {
  const students = [
    { id: 1, nama: 'Budi', kelas: 'X MIPA 1', status_ujian: 'Selesai' },
    { id: 2, nama: 'Siti', kelas: 'X MIPA 1', status_ujian: 'Belum Mulai' },
    { id: 3, nama: 'Andi', kelas: 'XI IPS 1', status_ujian: 'Selesai' },
  ];
  const results = [
    { id: 101, student_id: 1, exam_id: 1, skor_angka: 90, analisis_ai: { ringkasan: 'Sangat baik' } },
    { id: 102, student_id: 2, exam_id: 1, skor_angka: 60, analisis_ai: null },
    { id: 103, student_id: 3, exam_id: 1, skor_angka: 80, analisis_ai: { ringkasan: 'Baik' } },
  ];
  const analytics = computeClassAnalytics(students, results, ['XII SOS 1']);
  assert.equal(analytics.perClass.length, 3);
  assert.equal(analytics.overall.totalStudents, 3);
  assert.equal(analytics.overall.resultCount, 3);
  const xMipa = analytics.perClass.find((c) => c.kelas === 'X MIPA 1')!;
  assert.equal(xMipa.totalStudents, 2);
  assert.equal(xMipa.resultCount, 2);
  assert.equal(xMipa.averageScore, 75);
  assert.equal(xMipa.highestScore, 90);
  assert.equal(xMipa.lowestScore, 60);
  assert.equal(xMipa.passCount, 1);
  assert.equal(xMipa.passRate, 50);
  assert.equal(xMipa.gradeDistribution.A, 1);
  assert.equal(xMipa.gradeDistribution.C, 1);
  assert.equal(xMipa.analyzedCount, 1);

  const xiiSos = analytics.perClass.find((c) => c.kelas === 'XII SOS 1')!;
  assert.equal(xiiSos.totalStudents, 0);
  assert.equal(xiiSos.tingkat, '12');

  const csv = buildSemicolonCsv(['Nama', 'Kelas'], [['Budi;Santoso', 'X MIPA 1']]);
  assert.ok(csv.includes('sep=;'));
  assert.ok(csv.includes('"Budi;Santoso";X MIPA 1'));
});

test('classifyQuestionCognitiveLevel and calculateStudentLotsVsHots compute LOTS vs HOTS scores accurately', () => {
  const questions = [
    {
      id: 1,
      exam_id: 1,
      tipe_soal: 'PG',
      teks_soal: 'Siapa bapak sosiologi dunia?',
      kunci_jawaban: ['A'],
      bobot: 2,
    },
    {
      id: 2,
      exam_id: 1,
      tipe_soal: 'Kompleks',
      teks_soal: 'Analisislah faktor penyebab konflik sosial berikut!',
      kunci_jawaban: ['A', 'C', 'E'],
      bobot: 3,
    },
  ];

  assert.equal(classifyQuestionCognitiveLevel(questions[0]), 'LOTS');
  assert.equal(classifyQuestionCognitiveLevel(questions[1]), 'HOTS');

  const studentBreakdown = calculateStudentLotsVsHots(questions, {
    '1': ['A'], // 100% LOTS
    '2': ['A', 'C'], // 2/3 = 67% HOTS
  });
  assert.equal(studentBreakdown.lotsScore, 100);
  assert.equal(studentBreakdown.hotsScore, 67);

  const analytics = computeClassAnalytics(
    [{ id: 1, nama: 'Budi', kelas: 'X MIPA 1', status_ujian: 'Selesai' }],
    [
      {
        id: 101,
        student_id: 1,
        exam_id: 1,
        skor_angka: 80,
        jawaban_siswa: { '1': ['A'], '2': ['A', 'C'] },
      },
    ],
    [],
    questions
  );
  assert.equal(analytics.perClass[0].lotsScore, 100);
  assert.equal(analytics.perClass[0].hotsScore, 67);
  assert.equal(analytics.perClass[0].cognitiveGap, 33);
});

test('getStudentLoginClasses, getStudentsForClass, and validateStudentCascadingLogin enforce 3-step student login', () => {
  const roster = [
    {
      id: 10,
      nama: 'Zaki Pratama',
      kelas: '10 ABU BAKAR',
      token_ujian: 'ABC123',
      status_ujian: 'Belum Mulai',
    },
    {
      id: 11,
      nama: 'Ahmad Fauzi',
      kelas: '10 ABU BAKAR',
      token_ujian: 'XYZ789',
      status_ujian: 'Belum Mulai',
    },
    {
      id: 12,
      nama: 'Siti Aisyah',
      kelas: '10 ASIAH',
      token_ujian: 'QWE456',
      status_ujian: 'Diblokir',
    },
  ];

  const classes = getStudentLoginClasses(roster);
  assert.equal(classes.length, 2);
  assert.equal(classes[0].kelas, '10 ABU BAKAR');
  assert.equal(classes[0].studentCount, 2);

  const abuBakarStudents = getStudentsForClass(roster, '10 ABU BAKAR');
  assert.equal(abuBakarStudents.length, 2);
  assert.equal(abuBakarStudents[0].nama, 'Ahmad Fauzi');
  assert.equal(abuBakarStudents[1].nama, 'Zaki Pratama');

  // Missing class
  const failStep1 = validateStudentCascadingLogin({
    students: roster,
    selectedKelas: '',
    selectedStudentId: '',
    tokenInput: '',
  });
  assert.equal(failStep1.ok, false);

  // Wrong token for selected student
  const failWrongToken = validateStudentCascadingLogin({
    students: roster,
    selectedKelas: '10 ABU BAKAR',
    selectedStudentId: 11,
    tokenInput: 'ABC123', // belongs to Zaki, not Ahmad
  });
  assert.equal(failWrongToken.ok, false);

  // Blocked student
  const failBlocked = validateStudentCascadingLogin({
    students: roster,
    selectedKelas: '10 ASIAH',
    selectedStudentId: 12,
    tokenInput: 'QWE456',
  });
  assert.equal(failBlocked.ok, false);

  // Valid cascading login
  const validLogin = validateStudentCascadingLogin({
    students: roster,
    selectedKelas: '10 ABU BAKAR',
    selectedStudentId: 11,
    tokenInput: 'xyz789',
  });
  assert.equal(validLogin.ok, true);
  if (validLogin.ok) {
    assert.equal(validLogin.student.nama, 'Ahmad Fauzi');
  }
});

test('parseGridToQuestionRows parses Excel grids with math formulas, tables, and flexible headers', async () => {
  const { parseGridToQuestionRows, buildQuestionsCsvText } = await import('./cbtFileParsers.ts');

  // 1. Standard 11-column grid from Excel (.xlsx)
  const excelGrid = [
    ['Header Atas Ujian Sekolah', '', '', '', '', '', '', '', '', '', ''],
    ['id_soal', 'jenis_soal', 'wacana', 'teks_soal', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci_jawaban', 'bobot'],
    ['M-01', 'PG', 'Diberikan persamaan kuadrat.', 'Tentukan akar dari $x^2 - 5x + 6 = 0$!', '$x = 2$ atau $x = 3$', '$x = -2$ atau $x = -3$', '$x = 1$ atau $x = 6$', '$x = 0$', '$x = 5$', 'A', '2'],
    ['M-02', 'Kompleks', 'Perhatikan tabel berikut:\n| No | Variabel | Nilai |\n| 1 | A | 10 |', 'Pilih pernyataan yang benar tentang fungsi $f(x) = \\sqrt{x}$!', 'Domain $x \\ge 0$', 'Grafik selalu positif', 'Nilai $f(4) = -2$', 'Nilai $f(9) = 3$', 'Fungsi tidak terdefinisi pada $x < 0$', 'A, B, D, E', '3'],
  ];

  const parsed = parseGridToQuestionRows(excelGrid);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].id_soal, 'M-01');
  assert.equal(parsed.rows[0].jenis_soal, 'PG');
  assert.deepEqual(parsed.rows[0].kunci_jawaban, ['A']);
  assert.match(parsed.rows[0].teks_soal, /\$x\^2 - 5x \+ 6 = 0\$/);

  assert.equal(parsed.rows[1].jenis_soal, 'Kompleks');
  assert.deepEqual(parsed.rows[1].kunci_jawaban, ['A', 'B', 'D', 'E']);
  assert.equal(parsed.rows[1].bobot, 3);

  // Verify that buildQuestionsCsvText output roundtrips back through parseQuestionsCsv
  const csvOutput = buildQuestionsCsvText(parsed.rows);
  const roundtrip = parseQuestionsCsv(csvOutput);
  assert.equal(roundtrip.errors.length, 0);
  assert.equal(roundtrip.rows.length, 2);
  assert.deepEqual(roundtrip.rows[0].kunci_jawaban, ['A']);
  assert.deepEqual(roundtrip.rows[1].kunci_jawaban, ['A', 'B', 'D', 'E']);
});

test('parseTextDocumentQuestions parses Word/TXT formatted questions with numbers, options, and keys', async () => {
  const { parseTextDocumentQuestions } = await import('./cbtFileParsers.ts');

  const wordDocText = `
Wacana: Bacalah teks sosiologi berikut dengan cermat untuk menjawab soal nomor 1 dan 2.
Masyarakat modern mengalami perubahan sosial yang cepat akibat revolusi industri 4.0.

1. Apa dampak positif dari digitalisasi menurut wacana di atas?
A. Memperluas akses informasi dan inovasi
B. Meningkatkan isolasi geografis
C. Membatasi ruang interaksi
D. Menghambat produktivitas
E. Menurunkan literasi
Kunci: A
Bobot: 2

2. Manakah faktor pendorong interaksi sosial yang relevan?
*A. Komunikasi daring
*B. Kontak sosial virtual
C. Etnosentrisme ekstrem
*D. Empati terhadap korban bencana
E. Diskriminasi sosial
Kunci: A, B, D
Bobot: 3
`;

  const parsed = parseTextDocumentQuestions(wordDocText);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].id_soal, 'SOAL-01');
  assert.equal(parsed.rows[0].jenis_soal, 'PG');
  assert.deepEqual(parsed.rows[0].kunci_jawaban, ['A']);
  assert.match(parsed.rows[0].wacana, /Bacalah teks sosiologi/);

  assert.equal(parsed.rows[1].id_soal, 'SOAL-02');
  assert.equal(parsed.rows[1].jenis_soal, 'Kompleks');
  assert.deepEqual(parsed.rows[1].kunci_jawaban, ['A', 'B', 'D']);
  assert.equal(parsed.rows[1].bobot, 3);
});

test('prepareStudentExamQuestions and shuffleQuestionOptions randomize order while preserving scoring fidelity and determinism', async () => {
  const {
    prepareStudentExamQuestions,
    assignPackageVariantsToStudents,
    calculateExamScore,
  } = await import('./cbtLogic.ts');

  const sampleQuestions = [
    {
      id: 1,
      exam_id: 10,
      teks_soal: 'Apa definisi diferensiasi sosial?',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOAL-01',
        opsi: {
          A: 'Pembedaan vertikal',
          B: 'Pembedaan horizontal secara sejajar', // Correct key
          C: 'Stratifikasi hierarkis',
          D: 'Konflik antarkelas',
          E: 'Asimilasi budaya',
        },
      },
      kunci_jawaban: ['B'],
      bobot: 2,
    },
    {
      id: 2,
      exam_id: 10,
      teks_soal: 'Manakah bentuk interaksi sosial disosiatif?',
      tipe_soal: 'Kompleks',
      data_opsi: {
        id_soal_csv: 'SOAL-02',
        opsi: {
          A: 'Kerjasama tim',
          B: 'Persaingan / kompetisi', // Correct key 1
          C: 'Akomodasi',
          D: 'Pertikaian / konflik', // Correct key 2
          E: 'Kontravensi', // Correct key 3
        },
      },
      kunci_jawaban: ['B', 'D', 'E'],
      bobot: 3,
    },
    {
      id: 3,
      exam_id: 10,
      teks_soal: 'Soal nomor tiga untuk varian',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOAL-03',
        opsi: { A: 'Opsi 1', B: 'Opsi 2', C: 'Opsi 3', D: 'Opsi 4', E: 'Opsi 5' },
      },
      kunci_jawaban: ['A'],
      bobot: 2,
    },
    {
      id: 4,
      exam_id: 10,
      teks_soal: 'Soal nomor empat untuk varian',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOAL-04',
        opsi: { A: 'Opsi A', B: 'Opsi B', C: 'Opsi C', D: 'Opsi D', E: 'Opsi E' },
      },
      kunci_jawaban: ['C'],
      bobot: 2,
    },
    {
      id: 5,
      exam_id: 10,
      teks_soal: 'Soal nomor lima untuk varian',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOAL-05',
        opsi: { A: 'Opsi 1', B: 'Opsi 2', C: 'Opsi 3', D: 'Opsi 4', E: 'Opsi 5' },
      },
      kunci_jawaban: ['D'],
      bobot: 2,
    },
    {
      id: 6,
      exam_id: 10,
      teks_soal: 'Soal nomor enam untuk varian',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOAL-06',
        opsi: { A: 'Opsi 1', B: 'Opsi 2', C: 'Opsi 3', D: 'Opsi 4', E: 'Opsi 5' },
      },
      kunci_jawaban: ['E'],
      bobot: 2,
    },
  ];

  const studentA = {
    id: 101,
    nama: 'Ahmad Fauzi',
    kelas: 'X-1',
    token_ujian: 'AF8921',
  };
  const studentB = {
    id: 102,
    nama: 'Budi Santoso',
    kelas: 'X-1',
    token_ujian: 'BS7734',
  };

  const examConfig = {
    id: 10,
    judul_ujian: 'Penilaian Akhir Semester Sosiologi',
    acak_soal: true,
    acak_opsi: true,
    mode_multi_paket: true,
    jumlah_paket: 2,
  };

  // Student A preparation
  const prepA = prepareStudentExamQuestions({
    questions: sampleQuestions,
    student: studentA,
    exam: examConfig,
  });

  // Student B preparation
  const prepB = prepareStudentExamQuestions({
    questions: sampleQuestions,
    student: studentB,
    exam: examConfig,
  });

  // 1. Multi-Paket: Student A and Student B should have alternating package codes
  assert.ok(['PAKET-A', 'PAKET-B'].includes(prepA.studentPackageCode));
  assert.ok(['PAKET-A', 'PAKET-B'].includes(prepB.studentPackageCode));
  assert.notEqual(prepA.studentPackageCode, prepB.studentPackageCode);

  // 2. Determinism test: calling prepareStudentExamQuestions again for Student A produces identical questions and options
  const prepA2 = prepareStudentExamQuestions({
    questions: sampleQuestions,
    student: studentA,
    exam: examConfig,
  });
  assert.deepEqual(
    prepA.questions.map((q) => q.id),
    prepA2.questions.map((q) => q.id)
  );
  assert.deepEqual(
    prepA.questions[0].data_opsi.opsi,
    prepA2.questions[0].data_opsi.opsi
  );

  // 3. Scoring Fidelity: Selecting the correct option text in the randomized question gives 100% score
  const q1A = prepA.questions.find((q) => q.id === 1);
  if (q1A) {
    // Find which key holds the correct text "Pembedaan horizontal secara sejajar"
    const correctKeyNow = (Object.keys(q1A.data_opsi.opsi) as ('A' | 'B' | 'C' | 'D' | 'E')[]).find(
      (k) => q1A.data_opsi.opsi[k] === 'Pembedaan horizontal secara sejajar'
    );
    assert.ok(correctKeyNow);
    assert.deepEqual(q1A.kunci_jawaban, [correctKeyNow]);

    // Grade student answers with this question
    const scoreOutcome = calculateExamScore([q1A], {
      '1': [correctKeyNow!],
    });
    assert.equal(scoreOutcome.normalizedScore, 100);
    assert.equal(scoreOutcome.rawEarned, 2);
  }

  // 4. Batch assign package variants to class
  const classStudents: StudentItem[] = [
    { id: 1, nama: 'Adi', kelas: 'XII IPS 1', token_ujian: 'TOK001', status_ujian: 'Belum Mulai' },
    { id: 2, nama: 'Beni', kelas: 'XII IPS 1', token_ujian: 'TOK002', status_ujian: 'Belum Mulai' },
    { id: 3, nama: 'Citra', kelas: 'XII IPS 1', token_ujian: 'TOK003', status_ujian: 'Belum Mulai' },
    { id: 4, nama: 'Dewi', kelas: 'XII IPS 1', token_ujian: 'TOK004', status_ujian: 'Belum Mulai' },
  ];
  const assigned = assignPackageVariantsToStudents(classStudents, 2);
  assert.equal(assigned[0].kode_soal, 'PAKET-A');
  assert.equal(assigned[1].kode_soal, 'PAKET-B');
  assert.equal(assigned[2].kode_soal, 'PAKET-A');
  assert.equal(assigned[3].kode_soal, 'PAKET-B');
});

test('Humane PG Kompleks formula awards fair partial points for every correct answer while blocking blind guessing and upgrading historical results', async () => {
  const { calculateExamScore, recalculateHistoricalResults } = await import('./cbtLogic.ts');

  const pgk2Keys = {
    id: 101,
    exam_id: 1,
    tipe_soal: 'Kompleks',
    kunci_jawaban: ['A', 'C'],
    bobot: 3,
  };
  const pgk3Keys = {
    id: 102,
    exam_id: 1,
    tipe_soal: 'Kompleks',
    kunci_jawaban: ['A', 'C', 'E'],
    bobot: 3,
  };

  // 1. Choosing 1 right + 1 wrong on a 2-key PGK (previously 0 pts!) now earns humane partial points (1.2 pts)
  const score1Right1Wrong = calculateExamScore([pgk2Keys], {
    '101': ['A', 'B'],
  });
  assert.ok(score1Right1Wrong.rawEarned > 0, '1 right + 1 wrong should earn positive partial points');
  assert.equal(score1Right1Wrong.rawEarned, 1.2);
  assert.equal(score1Right1Wrong.breakdown[0].status, 'Benar Sebagian');

  // 2. Choosing 1 right + 0 wrong on a 2-key PGK earns 1.5 pts (50% of 3)
  const score1Right0Wrong = calculateExamScore([pgk2Keys], {
    '101': ['A'],
  });
  assert.equal(score1Right0Wrong.rawEarned, 1.5);
  assert.equal(score1Right0Wrong.breakdown[0].status, 'Benar Sebagian');

  // 3. Choosing 1 right + 2 wrong on a 3-key PGK (previously 0 pts!) now earns humane partial points (0.84 pts)
  const score1Right2WrongOn3Key = calculateExamScore([pgk3Keys], {
    '102': ['A', 'B', 'D'],
  });
  assert.ok(score1Right2WrongOn3Key.rawEarned > 0, '1 right + 2 wrong on 3-key PGK should earn positive points');
  assert.equal(score1Right2WrongOn3Key.rawEarned, 0.84);
  assert.equal(score1Right2WrongOn3Key.breakdown[0].status, 'Benar Sebagian');

  // 4. Anti-Guessing protection: checking all 5 options (A, B, C, D, E) or 4 options with only 1 right gets 0 points
  const blindAll5 = calculateExamScore([pgk3Keys], {
    '102': ['A', 'B', 'C', 'D', 'E'],
  });
  assert.equal(blindAll5.rawEarned, 0);
  assert.equal(blindAll5.breakdown[0].status, 'Salah');

  const blind4With1Right = calculateExamScore([pgk2Keys], {
    '101': ['A', 'B', 'D', 'E'],
  });
  assert.equal(blind4With1Right.rawEarned, 0);
  assert.equal(blind4With1Right.breakdown[0].status, 'Salah');

  // 5. Retroactive recalculation upgrades historical student results from previous days
  const historicalResults = [
    {
      id: 501,
      student_id: 1,
      exam_id: 1,
      skor_angka: 0, // Under old strict rule, 1 right + 1 wrong on pgk2Keys gave 0
      jawaban_siswa: { '101': ['A', 'B'] },
      analisis_ai: {
        skor_akhir: 0,
        kategori_nilai: 'Perlu Bimbingan (D)',
        ringkasan_evaluasi: 'Evaluasi lama',
        kekuatan_utama: '-',
        kelemahan_utama: '-',
        rekomendasi_belajar: ['Pelajari kembali'],
      },
    },
  ];
  const recalc = recalculateHistoricalResults({
    results: historicalResults as any,
    questions: [pgk2Keys] as any,
    students: [{ id: 1, nama: 'Siswa Kemarin', kelas: '10 ASIAH', token_ujian: 'TOK123' }] as any,
    exams: [{ id: 1, judul_ujian: 'UH Sosiologi', durasi_menit: 60 }] as any,
  });

  assert.equal(recalc.updatedCount, 1);
  assert.equal(recalc.results[0].skor_angka, 40); // 1.2 / 3 = 40%
  assert.equal(recalc.results[0].analisis_ai?.skor_akhir, 40);
});

test('computeAnBusoAnalysis computes difficulty index (P), discrimination index (D), distractor effectiveness, reliability Alpha, and personal remedial mapping', async () => {
  const { computeAnBusoAnalysis, generateAnBusoExcelReport } = await import(
    './cbtAnBusoLogic.ts'
  );

  const questions = [
    {
      id: 1,
      exam_id: 1,
      teks_soal: 'Siapa tokoh pencetus konsep tindakan sosial dalam sosiologi?',
      tipe_soal: 'PG',
      data_opsi: {
        id_soal_csv: 'SOS-01',
        opsi: {
          A: 'Max Weber',
          B: 'Emile Durkheim',
          C: 'Karl Marx',
          D: 'Auguste Comte',
          E: 'Georg Simmel',
        },
      },
      kunci_jawaban: ['A'],
      bobot: 2,
    },
    {
      id: 2,
      exam_id: 1,
      teks_soal: 'Pilih contoh interaksi sosial asosiatif di masyarakat!',
      tipe_soal: 'Kompleks',
      data_opsi: {
        id_soal_csv: 'SOS-02',
        opsi: {
          A: 'Gotong royong warga',
          B: 'Koalisi partai',
          C: 'Tawuran pelajar',
          D: 'Akulturasi budaya',
          E: 'Fitnah sosial',
        },
      },
      kunci_jawaban: ['A', 'B', 'D'],
      bobot: 3,
    },
  ];

  const students = [
    { id: 1, nama: 'Siswa Unggul 1', kelas: '10 ASIAH', token_ujian: 'T00001' },
    { id: 2, nama: 'Siswa Unggul 2', kelas: '10 ASIAH', token_ujian: 'T00002' },
    { id: 3, nama: 'Siswa Bawah 1', kelas: '10 ASIAH', token_ujian: 'T00003' },
    { id: 4, nama: 'Siswa Bawah 2', kelas: '10 ASIAH', token_ujian: 'T00004' },
  ];

  const results = [
    {
      id: 101,
      student_id: 1,
      exam_id: 1,
      skor_angka: 100,
      jawaban_siswa: { '1': ['A'], '2': ['A', 'B', 'D'] },
      pelanggaran_tab: 0,
    },
    {
      id: 102,
      student_id: 2,
      exam_id: 1,
      skor_angka: 100,
      jawaban_siswa: { '1': ['A'], '2': ['A', 'B', 'D'] },
      pelanggaran_tab: 0,
    },
    {
      id: 103,
      student_id: 3,
      exam_id: 1,
      skor_angka: 40,
      jawaban_siswa: { '1': ['B'], '2': ['A', 'B'] },
      pelanggaran_tab: 0,
    },
    {
      id: 104,
      student_id: 4,
      exam_id: 1,
      skor_angka: 0,
      jawaban_siswa: { '1': ['C'], '2': ['C', 'E'] },
      pelanggaran_tab: 0,
    },
  ];

  const report = computeAnBusoAnalysis({
    identity: {
      namaSekolah: 'SMA Uji Coba',
      mataPelajaran: 'Sosiologi',
      kelasRombel: '10 ASIAH',
      namaTes: 'Penilaian Harian 1',
      semesterTahunAjaran: 'Ganjil 2025/2026',
      namaPendidik: 'Sahidin',
      nipPendidik: '-',
      tanggalUjian: '11 Nov 2026',
      kkm: 70,
    },
    questions: questions as any,
    students: students as any,
    results: results as any,
  });

  assert.equal(report.summary.totalRespondents, 4);
  assert.equal(report.summary.totalQuestions, 2);
  assert.equal(report.summary.upperGroupSize, 2);
  assert.equal(report.summary.lowerGroupSize, 2);

  // Item 1: 2 upper correct (1.0), 2 lower wrong (0.0) => P = 0.50 (Sedang), D = 1.00 (Sangat Baik)
  const item1 = report.items[0];
  assert.equal(item1.difficultyIndex, 0.5);
  assert.equal(item1.difficultyCategory, 'Sedang');
  assert.equal(item1.discriminationIndex, 1);
  assert.equal(item1.discriminationCategory, 'Sangat Baik');
  assert.equal(item1.itemDecision, 'Disimpan di Bank Soal');

  // Personal remedial check: Siswa Bawah 2 failed both items 1 and 2
  const bottomStudent = report.studentRemedial.find((s) => s.studentId === 4)!;
  assert.equal(bottomStudent.isPassedKkm, false);
  assert.deepEqual(bottomStudent.failedNumbers, [1, 2]);

  // Verify Excel export generates valid HTML spreadsheet table
  const xls = generateAnBusoExcelReport(report);
  assert.ok(xls.includes('PEMETAAN REMEDIAL PERSONAL SISWA PER BUTIR SOAL'));
});




