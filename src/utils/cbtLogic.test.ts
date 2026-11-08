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
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_STUDENT_CSV_TEMPLATE,
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

test('parseQuestionsCsv parses sample template with 11 columns including wacana and complex keys', () => {
  const parsed = parseQuestionsCsv(SAMPLE_CSV_TEMPLATE);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].id_soal, 'SOAL-01');
  assert.equal(parsed.rows[1].jenis_soal, 'Kompleks');
  assert.deepEqual(parsed.rows[1].kunci_jawaban, ['B', 'D', 'E']);
});

test('extractTingkatFromKelas and isExamMatchedForStudentClass handle 3 grade levels (X/10, XI/11, XII/12)', () => {
  assert.equal(extractTingkatFromKelas('X MIPA 1'), '10');
  assert.equal(extractTingkatFromKelas('10-B'), '10');
  assert.equal(extractTingkatFromKelas('XI IPS 2'), '11');
  assert.equal(extractTingkatFromKelas('11 IPA 1'), '11');
  assert.equal(extractTingkatFromKelas('XII MIPA 1'), '12');
  assert.equal(extractTingkatFromKelas('12 TKJ'), '12');

  // Exam for Tingkat 10 only
  const examKelas10 = { target_tingkat: '10', target_kelas: 'SEMUA' };
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'X MIPA 1'), true);
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'XI MIPA 1'), false);
  assert.equal(isExamMatchedForStudentClass(examKelas10, 'XII MIPA 1'), false);

  // Exam for specific class XI IPS 2
  const examSpecific = { target_tingkat: '11', target_kelas: 'XI IPS 2' };
  assert.equal(isExamMatchedForStudentClass(examSpecific, 'XI IPS 2'), true);
  assert.equal(isExamMatchedForStudentClass(examSpecific, 'XI MIPA 1'), false);
});

test('parseStudentsCsv parses bulk student CSV across 3 grade levels', () => {
  const parsed = parseStudentsCsv(SAMPLE_STUDENT_CSV_TEMPLATE);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 6);
  assert.equal(parsed.rows[0].nama, 'Aditya Pratama');
  assert.equal(parsed.rows[0].tingkat, '10');
  assert.equal(parsed.rows[2].tingkat, '11');
  assert.equal(parsed.rows[4].tingkat, '12');
});
