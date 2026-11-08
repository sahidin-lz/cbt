import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 0. Users table for Firebase Auth (Teachers/Admins)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('admin').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 1. Students table: id, nama, kelas, token_ujian, status_ujian
export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  nama: text('nama').notNull(),
  kelas: text('kelas').notNull(),
  token_ujian: text('token_ujian').notNull().unique(),
  status_ujian: text('status_ujian').default('Belum Mulai').notNull(), // 'Belum Mulai' | 'Sedang Ujian' | 'Selesai'
  created_at: timestamp('created_at').defaultNow(),
});

// 2. Exams table: id, judul_ujian, durasi_menit, target_tingkat, target_kelas
export const exams = pgTable('exams', {
  id: serial('id').primaryKey(),
  judul_ujian: text('judul_ujian').notNull(),
  durasi_menit: integer('durasi_menit').notNull().default(60),
  target_tingkat: text('target_tingkat').default('SEMUA').notNull(), // 'SEMUA' | '10' | '11' | '12'
  target_kelas: text('target_kelas').default('SEMUA').notNull(), // 'SEMUA' or specific class e.g. 'XII MIPA 1'
  created_at: timestamp('created_at').defaultNow(),
});

export interface QuestionDataOpsi {
  id_soal_csv?: string;
  wacana?: string;
  opsi: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
}

// 3. Questions table: id, exam_id, teks_soal, tipe_soal (PG/Kompleks), data_opsi (JSON), kunci_jawaban (JSON), bobot
export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  exam_id: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  teks_soal: text('teks_soal').notNull(),
  tipe_soal: text('tipe_soal').notNull(), // 'PG' | 'Kompleks'
  data_opsi: jsonb('data_opsi').$type<QuestionDataOpsi>().notNull(),
  kunci_jawaban: jsonb('kunci_jawaban').$type<string[]>().notNull(),
  bobot: integer('bobot').notNull().default(2),
});

export interface AnalisisAI {
  nama_siswa: string;
  skor_akhir: number;
  kategori_nilai: string;
  analisis_kompetensi: {
    kekuatan: string[];
    kelemahan: string[];
  };
  evaluasi_hots: string;
  rekomendasi_belajar: string[];
}

// 4. Results table: id, student_id, exam_id, skor_angka, jawaban_siswa (JSON), analisis_ai (JSON)
export const results = pgTable('results', {
  id: serial('id').primaryKey(),
  student_id: integer('student_id')
    .references(() => students.id, { onDelete: 'cascade' })
    .notNull(),
  exam_id: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  skor_angka: integer('skor_angka').notNull().default(0),
  jawaban_siswa: jsonb('jawaban_siswa').$type<Record<string, string[]>>().notNull(),
  analisis_ai: jsonb('analisis_ai').$type<AnalisisAI | null>(),
  pelanggaran_tab: integer('pelanggaran_tab').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

// Relations
export const examsRelations = relations(exams, ({ many }) => ({
  questions: many(questions),
  results: many(results),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  exam: one(exams, {
    fields: [questions.exam_id],
    references: [exams.id],
  }),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  results: many(results),
}));

export const resultsRelations = relations(results, ({ one }) => ({
  student: one(students, {
    fields: [results.student_id],
    references: [students.id],
  }),
  exam: one(exams, {
    fields: [results.exam_id],
    references: [exams.id],
  }),
}));
