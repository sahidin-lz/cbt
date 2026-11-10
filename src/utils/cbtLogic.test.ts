import test from 'node:test';
import assert from 'node:assert/strict';
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

