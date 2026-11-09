var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  exams: () => exams,
  examsRelations: () => examsRelations,
  questions: () => questions,
  questionsRelations: () => questionsRelations,
  results: () => results,
  resultsRelations: () => resultsRelations,
  students: () => students,
  studentsRelations: () => studentsRelations,
  users: () => users
});
import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").default("admin").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var students = pgTable("students", {
  id: serial("id").primaryKey(),
  nama: text("nama").notNull(),
  kelas: text("kelas").notNull(),
  token_ujian: text("token_ujian").notNull().unique(),
  status_ujian: text("status_ujian").default("Belum Mulai").notNull(),
  // 'Belum Mulai' | 'Sedang Ujian' | 'Selesai'
  created_at: timestamp("created_at").defaultNow()
});
var exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  judul_ujian: text("judul_ujian").notNull(),
  durasi_menit: integer("durasi_menit").notNull().default(60),
  target_tingkat: text("target_tingkat").default("SEMUA").notNull(),
  // 'SEMUA' | '10' | '11' | '12'
  target_kelas: text("target_kelas").default("SEMUA").notNull(),
  // 'SEMUA' or specific class e.g. 'XII MIPA 1'
  created_at: timestamp("created_at").defaultNow()
});
var questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  exam_id: integer("exam_id").references(() => exams.id, { onDelete: "cascade" }).notNull(),
  teks_soal: text("teks_soal").notNull(),
  tipe_soal: text("tipe_soal").notNull(),
  // 'PG' | 'Kompleks'
  data_opsi: jsonb("data_opsi").$type().notNull(),
  kunci_jawaban: jsonb("kunci_jawaban").$type().notNull(),
  bobot: integer("bobot").notNull().default(2)
});
var results = pgTable("results", {
  id: serial("id").primaryKey(),
  student_id: integer("student_id").references(() => students.id, { onDelete: "cascade" }).notNull(),
  exam_id: integer("exam_id").references(() => exams.id, { onDelete: "cascade" }).notNull(),
  skor_angka: integer("skor_angka").notNull().default(0),
  jawaban_siswa: jsonb("jawaban_siswa").$type().notNull(),
  analisis_ai: jsonb("analisis_ai").$type(),
  pelanggaran_tab: integer("pelanggaran_tab").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow()
});
var examsRelations = relations(exams, ({ many }) => ({
  questions: many(questions),
  results: many(results)
}));
var questionsRelations = relations(questions, ({ one }) => ({
  exam: one(exams, {
    fields: [questions.exam_id],
    references: [exams.id]
  })
}));
var studentsRelations = relations(students, ({ many }) => ({
  results: many(results)
}));
var resultsRelations = relations(results, ({ one }) => ({
  student: one(students, {
    fields: [results.student_id],
    references: [students.id]
  }),
  exam: one(exams, {
    fields: [results.exam_id],
    references: [exams.id]
  })
}));

// src/db/index.ts
var createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15e3
    });
    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }
  return global._postgresPool;
};
var pool = createPool();
var db = drizzle(pool, { schema: schema_exports });

// src/db/cbtRepository.ts
import { eq, desc, inArray } from "drizzle-orm";

// src/utils/cbtLogic.ts
function generateExamToken(seed) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 6; i++) {
    const randIndex = seed !== void 0 ? (seed * (i + 13) + i * 7) % chars.length : Math.floor(Math.random() * chars.length);
    token += chars[randIndex];
  }
  return token;
}
function extractTingkatFromKelas(kelas) {
  const upper = (kelas || "").toUpperCase().trim();
  if (/^(XII|12)\b/.test(upper) || /\b(XII|12)\b/.test(upper)) {
    return "12";
  }
  if (/^(XI|11)\b/.test(upper) || /\b(XI|11)\b/.test(upper)) {
    return "11";
  }
  if (/^(X|10)\b/.test(upper) || /\b(X|10)\b/.test(upper)) {
    return "10";
  }
  return "LAINNYA";
}
function isExamMatchedForStudentClass(exam, studentKelas) {
  const cleanTargetKelas = (exam.target_kelas || "SEMUA").toUpperCase().trim();
  const cleanStudentKelas = (studentKelas || "").toUpperCase().trim();
  if (cleanTargetKelas !== "SEMUA" && cleanTargetKelas !== "") {
    return cleanTargetKelas === cleanStudentKelas;
  }
  const cleanTargetTingkat = (exam.target_tingkat || "SEMUA").toUpperCase().trim();
  if (cleanTargetTingkat === "SEMUA" || cleanTargetTingkat === "") {
    return true;
  }
  const studentTingkat = extractTingkatFromKelas(studentKelas);
  return cleanTargetTingkat === studentTingkat;
}
function normalizeAnswerKeys(keys) {
  if (!keys) return [];
  const rawList = Array.isArray(keys) ? keys : String(keys).split(/[,;|/+\s]+/).map((s) => s.trim()).filter(Boolean);
  const validSet = /* @__PURE__ */ new Set();
  for (const item of rawList) {
    const clean = item.toUpperCase().replace(/[^A-E]/g, "");
    if (clean.length === 1 && ["A", "B", "C", "D", "E"].includes(clean)) {
      validSet.add(clean);
    } else if (clean.length > 1) {
      for (const ch of clean.split("")) {
        if (["A", "B", "C", "D", "E"].includes(ch)) {
          validSet.add(ch);
        }
      }
    }
  }
  return Array.from(validSet).sort();
}
function calculateExamScore(questionsList, studentAnswers) {
  let rawEarned = 0;
  let rawMax = 0;
  const breakdown = [];
  for (const q of questionsList) {
    const qId = String(q.id);
    const isKompleks = q.tipe_soal.toLowerCase().includes("kompleks") || q.kunci_jawaban.length > 1;
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
        status: "Salah"
      });
      continue;
    }
    if (!isKompleks) {
      const isCorrect = chosenKeys.length === 1 && chosenKeys[0] === correctKeys[0];
      const earned = isCorrect ? maxPoints : 0;
      rawEarned += earned;
      breakdown.push({
        questionId: qId,
        earnedPoints: earned,
        maxPoints,
        status: isCorrect ? "Benar Penuh" : "Salah"
      });
    } else {
      const matchedCount = chosenKeys.filter(
        (k) => correctKeys.includes(k)
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
          status: "Benar Penuh"
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
          status: "Benar Sebagian"
        });
      } else {
        breakdown.push({
          questionId: qId,
          earnedPoints: 0,
          maxPoints,
          status: "Salah"
        });
      }
    }
  }
  const normalizedScore = rawMax > 0 ? Math.round(rawEarned / rawMax * 100) : 0;
  let kategoriNilai = "Perlu Bimbingan (D)";
  if (normalizedScore >= 85) kategoriNilai = "Sangat Baik (A)";
  else if (normalizedScore >= 70) kategoriNilai = "Baik (B)";
  else if (normalizedScore >= 55) kategoriNilai = "Cukup (C)";
  return {
    rawEarned,
    rawMax,
    normalizedScore,
    kategoriNilai,
    breakdown
  };
}
function detectCsvDelimiter(line) {
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
      if (ch === ";") countSemi++;
      else if (ch === "	") countTab++;
      else if (ch === ",") countComma++;
    }
  }
  if (countTab > 0 && countTab >= countSemi && countTab >= countComma) {
    return "	";
  }
  if (countSemi > 0 && countSemi >= countComma) {
    return ";";
  }
  return ",";
}
function splitCsvLine(line, forcedDelimiter) {
  const delimiter = forcedDelimiter || detectCsvDelimiter(line);
  const result = [];
  let current = "";
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
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
function normalizeSpreadsheetLines(rawInput) {
  const cleanText = (rawInput || "").replace(/^\uFEFF/, "").trim();
  if (/<table[\s>]/i.test(cleanText) && /<tr[\s>]/i.test(cleanText)) {
    const trMatches = cleanText.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const extractedLines = [];
    for (const tr of trMatches) {
      const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
      if (cellMatches.length === 0) continue;
      const cells = cellMatches.map(
        (cell) => cell.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').trim()
      );
      if (cells.some(Boolean)) {
        extractedLines.push(cells.join("	"));
      }
    }
    return { lines: extractedLines, delimiter: "	" };
  }
  let forcedDelimiter;
  const rawLines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const filteredLines = [];
  for (const line of rawLines) {
    if (/^sep\s*=\s*(.|\\t)$/i.test(line)) {
      const m = line.match(/^sep\s*=\s*(.|\\t)$/i);
      if (m) {
        if (m[1] === ";") forcedDelimiter = ";";
        else if (m[1] === ",") forcedDelimiter = ",";
        else if (m[1] === "	" || m[1] === "\\t") forcedDelimiter = "	";
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    filteredLines.push(line);
  }
  const detected = forcedDelimiter || (filteredLines.length > 0 ? detectCsvDelimiter(filteredLines[0]) : ";");
  return { lines: filteredLines, delimiter: detected };
}
function parseStudentsCsv(csvText) {
  const { lines, delimiter } = normalizeSpreadsheetLines(csvText);
  if (lines.length === 0) {
    return {
      rows: [],
      errors: ["File CSV/Excel atau daftar siswa kosong."]
    };
  }
  const firstCells = splitCsvLine(lines[0], delimiter).map(
    (c) => c.toLowerCase().replace(/^["']|["']$/g, "").trim()
  );
  const hasHeader = firstCells.some(
    (c) => [
      "nama",
      "nama_siswa",
      "nama lengkap",
      "nama siswa",
      "kelas",
      "kelas / rombel",
      "rombel"
    ].includes(c)
  );
  let namaIdx = 0;
  let kelasIdx = 1;
  let tokenIdx = -1;
  if (hasHeader) {
    namaIdx = firstCells.findIndex(
      (c) => ["nama", "nama_siswa", "nama lengkap", "nama siswa"].includes(c)
    );
    kelasIdx = firstCells.findIndex(
      (c) => ["kelas", "kelas / rombel", "rombel", "tingkat_kelas"].includes(c)
    );
    tokenIdx = firstCells.findIndex(
      (c) => ["token", "token_ujian", "token ujian (6 karakter)"].includes(c)
    );
    if (namaIdx === -1) namaIdx = 0;
    if (kelasIdx === -1) kelasIdx = 1;
  }
  const startRow = hasHeader ? 1 : 0;
  const rows = [];
  const errors = [];
  for (let i = startRow; i < lines.length; i++) {
    const lineDelim = detectCsvDelimiter(lines[i]) || delimiter;
    const cells = splitCsvLine(lines[i], lineDelim).map(
      (c) => c.replace(/^["']|["']$/g, "").trim()
    );
    const nama = cells[namaIdx] || "";
    const kelas = cells[kelasIdx] || "";
    const rawToken = tokenIdx >= 0 ? (cells[tokenIdx] || "").toUpperCase().trim() : "";
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
      token_ujian: rawToken.length === 6 ? rawToken : void 0
    });
  }
  if (rows.length === 0 && errors.length === 0) {
    errors.push("Tidak ada baris data siswa yang valid ditemukan.");
  }
  return { rows, errors };
}
function parseQuestionsCsv(csvText) {
  const { lines, delimiter } = normalizeSpreadsheetLines(csvText);
  if (lines.length < 2) {
    return {
      rows: [],
      errors: ["File CSV/Excel kosong atau tidak memiliki baris data soal."]
    };
  }
  const requiredHeaders = [
    "id_soal",
    "jenis_soal",
    "wacana",
    "teks_soal",
    "opsi_a",
    "opsi_b",
    "opsi_c",
    "opsi_d",
    "opsi_e",
    "kunci_jawaban",
    "bobot"
  ];
  const headerCells = splitCsvLine(lines[0], delimiter).map(
    (h) => h.toLowerCase().replace(/^["']|["']$/g, "").trim().replace(/\s+/g, "_")
  );
  const missingHeaders = requiredHeaders.filter(
    (req) => !headerCells.includes(req)
  );
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [
        `Header tabel soal tidak sesuai template. Kolom yang belum ada: ${missingHeaders.join(
          ", "
        )}`
      ]
    };
  }
  const colIndex = {};
  headerCells.forEach((h, idx) => {
    colIndex[h] = idx;
  });
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const lineDelim = detectCsvDelimiter(lines[i]) || delimiter;
    const cells = splitCsvLine(lines[i], lineDelim);
    if (cells.length < requiredHeaders.length) {
      errors.push(`Baris ${i + 1}: Jumlah kolom kurang dari 11 kolom.`);
      continue;
    }
    const getVal = (col) => (cells[colIndex[col]] ?? "").replace(/^["']|["']$/g, "").trim();
    const id_soal = getVal("id_soal") || `SOAL-${i}`;
    const rawJenis = getVal("jenis_soal").toUpperCase();
    const jenis_soal = rawJenis.includes("KOMPLEKS") || rawJenis === "PGK" ? "Kompleks" : "PG";
    const wacana = getVal("wacana");
    const teks_soal = getVal("teks_soal");
    const opsi_a = getVal("opsi_a");
    const opsi_b = getVal("opsi_b");
    const opsi_c = getVal("opsi_c");
    const opsi_d = getVal("opsi_d");
    const opsi_e = getVal("opsi_e");
    const kunci_jawaban = normalizeAnswerKeys(getVal("kunci_jawaban"));
    const rawBobot = parseInt(getVal("bobot"), 10);
    const bobot = !isNaN(rawBobot) && rawBobot > 0 ? rawBobot : jenis_soal === "Kompleks" ? 3 : 2;
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
      bobot
    });
  }
  return { rows, errors };
}

// src/db/cbtRepository.ts
async function getOrCreateAdminUser(uid, email, name) {
  try {
    const res = await db.insert(users).values({
      uid,
      email,
      name: name || email.split("@")[0],
      role: "admin"
    }).onConflictDoUpdate({
      target: users.uid,
      set: { email, name: name || email.split("@")[0] }
    }).returning();
    return res[0];
  } catch (error) {
    console.error("Database query failed in getOrCreateAdminUser:", error);
    throw new Error("Failed to synchronize user profile.", { cause: error });
  }
}
async function getDashboardData() {
  try {
    const allExams = await db.select().from(exams).orderBy(desc(exams.id));
    const allStudents = await db.select().from(students).orderBy(desc(students.id));
    const allQuestions = await db.select().from(questions).orderBy(questions.id);
    const allResults = await db.select().from(results).orderBy(desc(results.created_at));
    return {
      exams: allExams,
      students: allStudents,
      questions: allQuestions,
      results: allResults
    };
  } catch (error) {
    console.error("Database query failed in getDashboardData:", error);
    throw new Error("Gagal mengambil data dashboard dari database.", { cause: error });
  }
}
async function createOrReplaceQuestionsFromCsv(examId, csvRows, replaceExisting) {
  try {
    if (replaceExisting) {
      await db.delete(questions).where(eq(questions.exam_id, examId));
    }
    const values = csvRows.map((row) => ({
      exam_id: examId,
      teks_soal: row.teks_soal,
      tipe_soal: row.jenis_soal,
      data_opsi: {
        id_soal_csv: row.id_soal,
        wacana: row.wacana,
        opsi: {
          A: row.opsi_a,
          B: row.opsi_b,
          C: row.opsi_c,
          D: row.opsi_d,
          E: row.opsi_e
        }
      },
      kunci_jawaban: row.kunci_jawaban,
      bobot: row.bobot
    }));
    return await db.insert(questions).values(values).returning();
  } catch (error) {
    console.error("Database query failed in createOrReplaceQuestionsFromCsv:", error);
    throw new Error("Gagal menyimpan soal dari CSV ke database.", { cause: error });
  }
}
async function createManualQuestionRecord(examId, teks_soal, tipe_soal, wacana, opsi, kunci_jawaban, bobot) {
  try {
    const [inserted] = await db.insert(questions).values({
      exam_id: examId,
      teks_soal: teks_soal.trim(),
      tipe_soal,
      data_opsi: {
        wacana: wacana.trim(),
        opsi
      },
      kunci_jawaban,
      bobot
    }).returning();
    return inserted;
  } catch (error) {
    console.error("Database query failed in createManualQuestionRecord:", error);
    throw new Error("Gagal menambahkan butir soal baru.", { cause: error });
  }
}
async function deleteQuestionRecord(questionId) {
  try {
    await db.delete(questions).where(eq(questions.id, questionId));
  } catch (error) {
    console.error("Database query failed in deleteQuestionRecord:", error);
    throw new Error("Gagal menghapus butir soal.", { cause: error });
  }
}
async function addStudentRecord(nama, kelas, token) {
  try {
    const [inserted] = await db.insert(students).values({
      nama: nama.trim(),
      kelas: kelas.trim(),
      token_ujian: token.toUpperCase().trim(),
      status_ujian: "Belum Mulai"
    }).returning();
    return inserted;
  } catch (error) {
    console.error("Database query failed in addStudentRecord:", error);
    throw new Error("Gagal menambahkan data siswa ke database.", { cause: error });
  }
}
async function createStudentsFromCsv(csvRows, replaceExisting) {
  try {
    if (replaceExisting) {
      await db.delete(students);
    }
    const existingStudents = await db.select().from(students);
    const usedTokens = new Set(existingStudents.map((s) => s.token_ujian));
    const values = csvRows.map((row) => {
      let token = row.token_ujian && !usedTokens.has(row.token_ujian) ? row.token_ujian : generateExamToken();
      while (usedTokens.has(token)) {
        token = generateExamToken();
      }
      usedTokens.add(token);
      return {
        nama: row.nama.trim(),
        kelas: row.kelas.trim(),
        token_ujian: token,
        status_ujian: "Belum Mulai"
      };
    });
    return await db.insert(students).values(values).returning();
  } catch (error) {
    console.error("Database query failed in createStudentsFromCsv:", error);
    throw new Error("Gagal menyimpan data upload massal siswa ke database.", {
      cause: error
    });
  }
}
async function updateStudentRecord(studentId, nama, kelas) {
  try {
    const [updated] = await db.update(students).set({
      nama: nama.trim(),
      kelas: kelas.trim()
    }).where(eq(students.id, studentId)).returning();
    return updated;
  } catch (error) {
    console.error("Database query failed in updateStudentRecord:", error);
    throw new Error("Gagal memperbarui data siswa.", { cause: error });
  }
}
async function regenerateStudentTokenRecord(studentId, newToken) {
  try {
    const [updated] = await db.update(students).set({ token_ujian: newToken.toUpperCase(), status_ujian: "Belum Mulai" }).where(eq(students.id, studentId)).returning();
    return updated;
  } catch (error) {
    console.error("Database query failed in regenerateStudentTokenRecord:", error);
    throw new Error("Gagal memperbarui token ujian siswa.", { cause: error });
  }
}
async function updateStudentStatusRecord(studentId, status_ujian) {
  try {
    const [updated] = await db.update(students).set({ status_ujian }).where(eq(students.id, studentId)).returning();
    return updated;
  } catch (error) {
    console.error("Database query failed in updateStudentStatusRecord:", error);
    throw new Error("Gagal memperbarui status ujian siswa.", { cause: error });
  }
}
async function bulkUpdateStudentStatusRecord(studentIds, status_ujian) {
  try {
    if (studentIds.length === 0) return [];
    return await db.update(students).set({ status_ujian }).where(inArray(students.id, studentIds)).returning();
  } catch (error) {
    console.error("Database query failed in bulkUpdateStudentStatusRecord:", error);
    throw new Error("Gagal memperbarui status ujian siswa secara massal.", {
      cause: error
    });
  }
}
async function deleteStudentRecord(studentId) {
  try {
    await db.delete(students).where(eq(students.id, studentId));
  } catch (error) {
    console.error("Database query failed in deleteStudentRecord:", error);
    throw new Error("Gagal menghapus siswa.", { cause: error });
  }
}
async function createNewExamRecord(judul_ujian, durasi_menit, target_tingkat = "SEMUA", target_kelas = "SEMUA") {
  try {
    const [created] = await db.insert(exams).values({
      judul_ujian: judul_ujian.trim(),
      durasi_menit: Math.max(5, durasi_menit),
      target_tingkat: target_tingkat.trim() || "SEMUA",
      target_kelas: target_kelas.trim() || "SEMUA"
    }).returning();
    return created;
  } catch (error) {
    console.error("Database query failed in createNewExamRecord:", error);
    throw new Error("Gagal membuat paket ujian baru.", { cause: error });
  }
}
async function updateExamRecord(examId, judul_ujian, durasi_menit, target_tingkat = "SEMUA", target_kelas = "SEMUA") {
  try {
    const [updated] = await db.update(exams).set({
      judul_ujian: judul_ujian.trim(),
      durasi_menit: Math.max(5, durasi_menit),
      target_tingkat: target_tingkat.trim() || "SEMUA",
      target_kelas: target_kelas.trim() || "SEMUA"
    }).where(eq(exams.id, examId)).returning();
    return updated;
  } catch (error) {
    console.error("Database query failed in updateExamRecord:", error);
    throw new Error("Gagal memperbarui paket ujian.", { cause: error });
  }
}
async function deleteExamRecord(examId) {
  try {
    await db.delete(exams).where(eq(exams.id, examId));
  } catch (error) {
    console.error("Database query failed in deleteExamRecord:", error);
    throw new Error("Gagal menghapus paket ujian.", { cause: error });
  }
}
async function verifyStudentTokenForExam(namaInput, tokenInput, examIdInput) {
  try {
    const cleanToken = tokenInput.toUpperCase().trim();
    const matchedStudents = await db.select().from(students).where(eq(students.token_ujian, cleanToken));
    if (matchedStudents.length === 0) {
      return {
        error: "Token Ujian tidak ditemukan di database siswa. Hubungi Guru/Pengawas Anda."
      };
    }
    const student = matchedStudents[0];
    const cleanNama = namaInput.trim();
    if (!cleanNama) {
      return { error: "Nama Siswa wajib diisi." };
    }
    if (student.status_ujian === "Diblokir") {
      return {
        error: "Akses ujian Anda sedang DIBLOKIR / DIKUNCI karena pelanggaran aturan keamanan (Anti-Cheat) atau dikunci oleh Pengawas. Silakan hubungi Guru Pengawas untuk membuka kunci status ujian Anda."
      };
    }
    if (student.status_ujian === "Selesai") {
      return {
        error: "Anda telah menyelesaikan ujian dengan Token ini (Status: Selesai). Hubungi Guru Pengawas jika status ujian Anda perlu di-reset ke Belum Mulai."
      };
    }
    const allExams = await db.select().from(exams).orderBy(desc(exams.id));
    if (allExams.length === 0) {
      return {
        error: "Belum ada Paket Ujian yang aktif. Silakan tunggu Guru mengaktifkan ujian."
      };
    }
    const matchedExams = allExams.filter(
      (ex) => isExamMatchedForStudentClass(ex, student.kelas)
    );
    if (matchedExams.length === 0) {
      return {
        error: `Tidak ditemukan Paket Ujian yang didistribusikan untuk kelas Anda (${student.kelas}). Hubungi Guru Pengawas.`
      };
    }
    const activeExam = (examIdInput ? matchedExams.find((e) => e.id === examIdInput) : matchedExams[0]) || matchedExams[0];
    const examQuestions = await db.select().from(questions).where(eq(questions.exam_id, activeExam.id)).orderBy(questions.id);
    if (examQuestions.length === 0) {
      return {
        error: `Paket ujian "${activeExam.judul_ujian}" untuk kelas ${student.kelas} belum memiliki butir soal. Silakan hubungi Guru.`
      };
    }
    const [updatedStudent] = await db.update(students).set({
      nama: cleanNama,
      status_ujian: "Sedang Ujian"
    }).where(eq(students.id, student.id)).returning();
    return {
      student: updatedStudent,
      exam: activeExam,
      availableExams: matchedExams,
      questions: examQuestions
    };
  } catch (error) {
    console.error("Database query failed in verifyStudentTokenForExam:", error);
    throw new Error("Gagal memverifikasi sesi login ujian siswa.", { cause: error });
  }
}
async function submitStudentExamResult(studentId, examId, jawabanSiswa, pelanggaranTab) {
  try {
    const examQuestions = await db.select().from(questions).where(eq(questions.exam_id, examId));
    const scoreSummary = calculateExamScore(examQuestions, jawabanSiswa);
    await db.update(students).set({ status_ujian: "Selesai" }).where(eq(students.id, studentId));
    const [savedResult] = await db.insert(results).values({
      student_id: studentId,
      exam_id: examId,
      skor_angka: scoreSummary.normalizedScore,
      jawaban_siswa: jawabanSiswa,
      analisis_ai: null,
      pelanggaran_tab: pelanggaranTab
    }).returning();
    return {
      result: savedResult,
      scoreSummary
    };
  } catch (error) {
    console.error("Database query failed in submitStudentExamResult:", error);
    throw new Error("Gagal menyimpan hasil ujian siswa.", { cause: error });
  }
}
async function saveAiAnalysisToResult(resultId, analisisAi) {
  try {
    const [updated] = await db.update(results).set({
      analisis_ai: analisisAi,
      skor_angka: analisisAi.skor_akhir
    }).where(eq(results.id, resultId)).returning();
    return updated;
  } catch (error) {
    console.error("Database query failed in saveAiAnalysisToResult:", error);
    throw new Error("Gagal menyimpan hasil analisis AI ke database.", { cause: error });
  }
}

// src/lib/firebase-admin.ts
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "ferrous-epoch-v6pck",
  appId: "1:121481033540:web:b68fa46310205e0ee44911",
  apiKey: "AIzaSyBWnZxDLeu1X8cpx6kAnj6SH_2f21JAmS8",
  authDomain: "ferrous-epoch-v6pck.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-eduassessaisiste-a2296655-657e-40ae-b3fd-26126203a6f1",
  storageBucket: "ferrous-epoch-v6pck.firebasestorage.app",
  messagingSenderId: "121481033540",
  measurementId: "",
  oAuthClientId: "121481033540-fj1qujbkl864h5jj7hg67fjtc3mo952a.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// src/lib/firebase-admin.ts
var adminApp = getApps().length ? getApp() : initializeApp({
  projectId: firebase_applet_config_default.projectId
});
var adminAuth = getAuth(adminApp);
var adminDb = getFirestore(
  adminApp,
  firebase_applet_config_default.firestoreDatabaseId
);
var DEFAULT_ADMIN_UID = "sahidin30@gmail.com";
async function syncCbtStateToFirestore(data, eventDescription = "Sinkronisasi otomatis sistem CBT") {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const batch = adminDb.batch();
    const pulseRef = adminDb.collection("cbt_sync").doc("live_state");
    const pulsePayload = {
      lastSyncedAt: nowIso,
      lastEvent: eventDescription.slice(0, 200),
      totalExams: data.exams.length,
      totalStudents: data.students.length,
      totalQuestions: data.questions.length,
      totalResults: data.results.length,
      authorUid: DEFAULT_ADMIN_UID
    };
    batch.set(pulseRef, pulsePayload);
    for (const ex of data.exams) {
      const docRef = adminDb.collection("exams").doc(String(ex.id));
      batch.set(docRef, {
        id: Number(ex.id),
        judul_ujian: String(ex.judul_ujian || "").slice(0, 200),
        durasi_menit: Number(ex.durasi_menit) || 60,
        target_tingkat: String(ex.target_tingkat || "SEMUA").slice(0, 16),
        target_kelas: String(ex.target_kelas || "SEMUA").slice(0, 64),
        authorUid: DEFAULT_ADMIN_UID,
        updatedAt: nowIso
      });
    }
    for (const st of data.students) {
      const docRef = adminDb.collection("students").doc(String(st.id));
      batch.set(docRef, {
        id: Number(st.id),
        nama: String(st.nama || "").slice(0, 150),
        kelas: String(st.kelas || "").slice(0, 64),
        token_ujian: String(st.token_ujian || "").slice(0, 6),
        status_ujian: String(st.status_ujian || "Belum Mulai").slice(0, 32),
        authorUid: DEFAULT_ADMIN_UID,
        updatedAt: nowIso
      });
    }
    for (const q of data.questions) {
      const docRef = adminDb.collection("questions").doc(String(q.id));
      batch.set(docRef, {
        id: Number(q.id),
        exam_id: Number(q.exam_id),
        teks_soal: String(q.teks_soal || "").slice(0, 4e3),
        tipe_soal: q.tipe_soal === "Kompleks" ? "Kompleks" : "PG",
        data_opsi: q.data_opsi || { wacana: "", opsi: { A: "", B: "", C: "", D: "", E: "" } },
        kunci_jawaban: Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : ["A"],
        bobot: Number(q.bobot) || 2,
        authorUid: DEFAULT_ADMIN_UID,
        updatedAt: nowIso
      });
    }
    for (const r of data.results) {
      const docRef = adminDb.collection("results").doc(String(r.id));
      batch.set(docRef, {
        id: Number(r.id),
        student_id: Number(r.student_id),
        exam_id: Number(r.exam_id),
        skor_angka: Number(r.skor_angka) || 0,
        jawaban_siswa: r.jawaban_siswa || {},
        analisis_ai: r.analisis_ai || null,
        pelanggaran_tab: Number(r.pelanggaran_tab) || 0,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : nowIso,
        authorUid: DEFAULT_ADMIN_UID,
        updatedAt: nowIso
      });
    }
    await batch.commit();
    return {
      synced: true,
      databaseId: firebase_applet_config_default.firestoreDatabaseId,
      projectId: firebase_applet_config_default.projectId,
      pulse: pulsePayload
    };
  } catch (error) {
    console.warn("Firestore sync warning:", error?.message || error);
    return {
      synced: false,
      databaseId: firebase_applet_config_default.firestoreDatabaseId,
      projectId: firebase_applet_config_default.projectId,
      error: error?.message || "Gagal sinkronisasi ke Firestore"
    };
  }
}
async function removeDeletedDocFromFirestore(collectionName, docId) {
  try {
    await adminDb.collection(collectionName).doc(String(docId)).delete();
  } catch (error) {
    console.warn(
      `Warning deleting ${collectionName}/${docId} from Firestore:`,
      error?.message
    );
  }
}
async function getFirestoreSyncStatus(fallbackData) {
  try {
    const pulseSnap = await adminDb.collection("cbt_sync").doc("live_state").get();
    if (!pulseSnap.exists) {
      const seeded = await syncCbtStateToFirestore(
        fallbackData,
        "Inisialisasi koneksi Firebase Firestore"
      );
      return {
        connected: seeded.synced,
        databaseId: firebase_applet_config_default.firestoreDatabaseId,
        projectId: firebase_applet_config_default.projectId,
        pulse: seeded.pulse || {
          lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastEvent: "Siap Sinkronisasi",
          totalExams: fallbackData.exams.length,
          totalStudents: fallbackData.students.length,
          totalQuestions: fallbackData.questions.length,
          totalResults: fallbackData.results.length,
          authorUid: DEFAULT_ADMIN_UID
        }
      };
    }
    return {
      connected: true,
      databaseId: firebase_applet_config_default.firestoreDatabaseId,
      projectId: firebase_applet_config_default.projectId,
      pulse: pulseSnap.data()
    };
  } catch (error) {
    return {
      connected: false,
      databaseId: firebase_applet_config_default.firestoreDatabaseId,
      projectId: firebase_applet_config_default.projectId,
      error: error?.message || "Firestore belum terjangkau",
      pulse: {
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastEvent: "Mode Lokal PostgreSQL",
        totalExams: fallbackData.exams.length,
        totalStudents: fallbackData.students.length,
        totalQuestions: fallbackData.questions.length,
        totalResults: fallbackData.results.length,
        authorUid: DEFAULT_ADMIN_UID
      }
    };
  }
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = 3e3;
app.use(express.json({ limit: "5mb" }));
var getGenAiClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
};
var SYSTEM_PROMPT_EVALUATOR = `Anda adalah AI Evaluator CBT. Tugas Anda:
1. Hitung skor siswa. (PG Biasa: 2 Poin, PG Kompleks Benar Semua: 3 Poin, Benar Sebagian: 1-2 Poin, Salah: 0 Poin).
2. Analisis kekuatan dan kelemahan kognitif siswa (LOTS vs HOTS).
3. Berikan 3 poin rekomendasi belajar.
Keluarkan output HANYA dalam format JSON valid dengan struktur: { nama_siswa, skor_akhir, kategori_nilai, analisis_kompetensi: { kekuatan, kelemahan }, evaluasi_hots, rekomendasi_belajar }.`;
async function broadcastFirestoreSync(eventDescription) {
  try {
    const latest = await getDashboardData();
    return await syncCbtStateToFirestore(latest, eventDescription);
  } catch (err) {
    console.warn("Broadcast Firestore sync skipped:", err);
    return null;
  }
}
app.post("/api/auth/sync", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token autentikasi tidak ditemukan." });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getOrCreateAdminUser(
      decoded.uid,
      decoded.email || "sahidin30@gmail.com",
      decoded.name
    );
    await broadcastFirestoreSync(`Login Guru terverifikasi (${user.email})`);
    res.json({ user });
  } catch (error) {
    console.error("Auth sync error:", error);
    res.status(401).json({ error: "Gagal memverifikasi token Google Sign-In." });
  }
});
app.get("/api/firebase/status", async (_req, res) => {
  try {
    const data = await getDashboardData();
    const status = await getFirestoreSyncStatus(data);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal memuat status Firebase." });
  }
});
app.post("/api/firebase/sync", async (req, res) => {
  try {
    const reason = req.body?.reason || "Sinkronisasi manual oleh Guru dari Dashboard";
    const data = await getDashboardData();
    const syncOutcome = await syncCbtStateToFirestore(data, String(reason));
    res.json({
      ...syncOutcome,
      data
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal melakukan sinkronisasi Firebase." });
  }
});
app.get("/api/dashboard", async (_req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    console.error("Error in GET /api/dashboard:", error);
    res.status(500).json({ error: error.message || "Gagal memuat data dashboard." });
  }
});
app.post("/api/exams", async (req, res) => {
  try {
    const { judul_ujian, durasi_menit, target_tingkat, target_kelas } = req.body;
    if (!judul_ujian || !String(judul_ujian).trim()) {
      return res.status(400).json({ error: "Judul ujian wajib diisi." });
    }
    const created = await createNewExamRecord(
      String(judul_ujian),
      Number(durasi_menit) || 60,
      String(target_tingkat || "SEMUA"),
      String(target_kelas || "SEMUA")
    );
    await broadcastFirestoreSync(
      `Paket ujian baru dibuat: ${created.judul_ujian} (Tingkat ${created.target_tingkat})`
    );
    res.json({ exam: created });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal membuat ujian." });
  }
});
app.put("/api/exams/:id", async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { judul_ujian, durasi_menit, target_tingkat, target_kelas } = req.body;
    if (!judul_ujian || !String(judul_ujian).trim()) {
      return res.status(400).json({ error: "Judul ujian wajib diisi." });
    }
    const updated = await updateExamRecord(
      examId,
      String(judul_ujian),
      Number(durasi_menit) || 60,
      String(target_tingkat || "SEMUA"),
      String(target_kelas || "SEMUA")
    );
    await broadcastFirestoreSync(`Distribusi ujian diperbarui: ${updated.judul_ujian}`);
    res.json({ exam: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal memperbarui ujian." });
  }
});
app.delete("/api/exams/:id", async (req, res) => {
  try {
    const examId = Number(req.params.id);
    await deleteExamRecord(examId);
    await removeDeletedDocFromFirestore("exams", examId);
    await broadcastFirestoreSync(`Paket ujian #${examId} dihapus`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal menghapus ujian." });
  }
});
app.post("/api/questions/manual", async (req, res) => {
  try {
    const { examId, teks_soal, tipe_soal, wacana, opsi, kunci_jawaban, bobot } = req.body;
    if (!examId || !teks_soal || !opsi) {
      return res.status(400).json({ error: "Paket ujian, teks soal, dan opsi wajib diisi." });
    }
    const normalizedKeys = normalizeAnswerKeys(kunci_jawaban);
    if (normalizedKeys.length === 0) {
      return res.status(400).json({ error: "Pilih minimal satu kunci jawaban yang benar (A-E)." });
    }
    const created = await createManualQuestionRecord(
      Number(examId),
      String(teks_soal),
      tipe_soal === "Kompleks" ? "Kompleks" : "PG",
      String(wacana || ""),
      opsi,
      normalizedKeys,
      Number(bobot) || (tipe_soal === "Kompleks" ? 3 : 2)
    );
    await broadcastFirestoreSync(`Butir soal baru ditambahkan ke ujian #${examId}`);
    res.json({ question: created });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal menambahkan soal." });
  }
});
app.delete("/api/questions/:id", async (req, res) => {
  try {
    const qId = Number(req.params.id);
    await deleteQuestionRecord(qId);
    await removeDeletedDocFromFirestore("questions", qId);
    await broadcastFirestoreSync(`Butir soal #${qId} dihapus`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal menghapus soal." });
  }
});
app.post("/api/questions/upload-csv", async (req, res) => {
  try {
    const { examId, csvText, replaceExisting = false } = req.body;
    if (!examId || !csvText) {
      return res.status(400).json({ error: "Pilih Paket Ujian dan unggah file CSV terlebih dahulu." });
    }
    const parsed = parseQuestionsCsv(String(csvText));
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return res.status(400).json({
        error: parsed.errors.join(" | "),
        errors: parsed.errors
      });
    }
    const inserted = await createOrReplaceQuestionsFromCsv(
      Number(examId),
      parsed.rows,
      Boolean(replaceExisting)
    );
    await broadcastFirestoreSync(
      `Upload massal ${inserted.length} soal CSV ke paket ujian #${examId}`
    );
    res.json({
      insertedCount: inserted.length,
      questions: inserted,
      warnings: parsed.errors
    });
  } catch (error) {
    console.error("CSV Upload Error:", error);
    res.status(500).json({ error: error.message || "Gagal memproses upload soal CSV." });
  }
});
app.post("/api/students", async (req, res) => {
  try {
    const { nama, kelas, customToken } = req.body;
    if (!nama || !String(nama).trim() || !kelas || !String(kelas).trim()) {
      return res.status(400).json({ error: "Nama siswa dan kelas wajib diisi." });
    }
    const token = customToken && String(customToken).trim().length === 6 ? String(customToken).toUpperCase().trim() : generateExamToken();
    const student = await addStudentRecord(String(nama), String(kelas), token);
    await broadcastFirestoreSync(
      `Siswa baru ditambahkan: ${student.nama} (${student.kelas}) \u2014 Token ${student.token_ujian}`
    );
    res.json({ student });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal menambahkan siswa." });
  }
});
app.post("/api/students/upload-csv", async (req, res) => {
  try {
    const { csvText, replaceExisting = false } = req.body;
    if (!csvText || !String(csvText).trim()) {
      return res.status(400).json({ error: "Konten CSV siswa wajib diisi." });
    }
    const parsed = parseStudentsCsv(String(csvText));
    if (parsed.rows.length === 0) {
      return res.status(400).json({
        error: parsed.errors.join(" | ") || "Format CSV siswa tidak valid."
      });
    }
    const inserted = await createStudentsFromCsv(
      parsed.rows,
      Boolean(replaceExisting)
    );
    await broadcastFirestoreSync(
      `Upload massal ${inserted.length} siswa CSV beserta token ujian`
    );
    res.json({
      insertedCount: inserted.length,
      students: inserted,
      warnings: parsed.errors
    });
  } catch (error) {
    console.error("Student CSV Upload Error:", error);
    res.status(500).json({
      error: error.message || "Gagal memproses upload massal siswa."
    });
  }
});
app.put("/api/students/:id", async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { nama, kelas } = req.body;
    if (!nama || !String(nama).trim() || !kelas || !String(kelas).trim()) {
      return res.status(400).json({ error: "Nama siswa dan kelas wajib diisi." });
    }
    const updated = await updateStudentRecord(studentId, String(nama), String(kelas));
    await broadcastFirestoreSync(`Data siswa diperbarui: ${updated.nama} (${updated.kelas})`);
    res.json({ student: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal memperbarui data siswa." });
  }
});
app.post("/api/students/:id/regenerate-token", async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const newToken = generateExamToken();
    const updated = await regenerateStudentTokenRecord(studentId, newToken);
    await broadcastFirestoreSync(
      `Token baru dibuat untuk ${updated.nama}: ${updated.token_ujian}`
    );
    res.json({ student: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal membuat ulang token." });
  }
});
app.patch("/api/students/:id/status", async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { status_ujian } = req.body;
    const validStatuses = ["Belum Mulai", "Sedang Ujian", "Selesai", "Diblokir"];
    if (!status_ujian || !validStatuses.includes(String(status_ujian))) {
      return res.status(400).json({ error: "Status ujian tidak valid." });
    }
    const updated = await updateStudentStatusRecord(studentId, String(status_ujian));
    await broadcastFirestoreSync(
      `Status siswa ${updated.nama} diubah menjadi: ${updated.status_ujian}`
    );
    res.json({ student: updated });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal mengubah status siswa." });
  }
});
app.post("/api/students/bulk-status", async (req, res) => {
  try {
    const { studentIds, status_ujian } = req.body;
    const validStatuses = ["Belum Mulai", "Sedang Ujian", "Selesai", "Diblokir"];
    if (!Array.isArray(studentIds) || !status_ujian || !validStatuses.includes(String(status_ujian))) {
      return res.status(400).json({ error: "Parameter daftar siswa atau status tidak valid." });
    }
    const updatedList = await bulkUpdateStudentStatusRecord(
      studentIds.map(Number),
      String(status_ujian)
    );
    await broadcastFirestoreSync(
      `Status ${updatedList.length} siswa diatur massal menjadi: ${status_ujian}`
    );
    res.json({ students: updatedList });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Gagal mengubah status siswa secara massal."
    });
  }
});
app.delete("/api/students/:id", async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    await deleteStudentRecord(studentId);
    await removeDeletedDocFromFirestore("students", studentId);
    await broadcastFirestoreSync(`Data siswa #${studentId} dihapus`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal menghapus siswa." });
  }
});
app.post("/api/exam/login", async (req, res) => {
  try {
    const { nama, token_ujian, examId } = req.body;
    if (!nama || !token_ujian) {
      return res.status(400).json({ error: "Nama Siswa dan Token Ujian wajib diisi." });
    }
    const session = await verifyStudentTokenForExam(
      String(nama),
      String(token_ujian),
      examId ? Number(examId) : void 0
    );
    if ("error" in session) {
      return res.status(400).json({ error: session.error });
    }
    await broadcastFirestoreSync(
      `Siswa mulai ujian: ${session.student.nama} (${session.student.kelas}) \u2014 ${session.exam.judul_ujian}`
    );
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal masuk ke sesi ujian." });
  }
});
app.post("/api/exam/heartbeat", async (req, res) => {
  try {
    const { nama, kelas, pelanggaranTab = 0, answeredCount = 0 } = req.body;
    await broadcastFirestoreSync(
      `Peringatan Anti-Cheat: ${nama || "Siswa"} (${kelas || "-"}) pindah tab (${pelanggaranTab}x) \xB7 Terjawab ${answeredCount} soal`
    );
    res.json({ synced: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal sinkronisasi heartbeat." });
  }
});
app.post("/api/exam/submit", async (req, res) => {
  try {
    const { studentId, examId, jawabanSiswa, pelanggaranTab = 0 } = req.body;
    if (!studentId || !examId || !jawabanSiswa) {
      return res.status(400).json({ error: "Data jawaban ujian tidak lengkap." });
    }
    const outcome = await submitStudentExamResult(
      Number(studentId),
      Number(examId),
      jawabanSiswa,
      Number(pelanggaranTab) || 0
    );
    await broadcastFirestoreSync(
      `Siswa mengumpulkan ujian (Skor: ${outcome.scoreSummary.normalizedScore}/100)`
    );
    res.json(outcome);
  } catch (error) {
    res.status(500).json({ error: error.message || "Gagal mengirim jawaban ujian." });
  }
});
app.post("/api/analyze", async (req, res) => {
  try {
    const { resultId, nama_siswa, questions: examQuestions, jawaban_siswa } = req.body;
    if (!nama_siswa || !Array.isArray(examQuestions) || !jawaban_siswa) {
      return res.status(400).json({
        error: "Parameter nama_siswa, daftar soal, dan jawaban_siswa wajib disertakan."
      });
    }
    const scoreSummary = calculateExamScore(examQuestions, jawaban_siswa);
    const detailItems = examQuestions.map((q, idx) => {
      const qId = String(q.id);
      const chosen = jawaban_siswa[qId] || [];
      const breakdownItem = scoreSummary.breakdown.find((b) => b.questionId === qId);
      return {
        nomor: idx + 1,
        tipe_soal: q.tipe_soal,
        wacana: q.data_opsi?.wacana || "",
        teks_soal: q.teks_soal,
        kunci_jawaban: q.kunci_jawaban,
        jawaban_siswa: chosen,
        status_jawaban: breakdownItem?.status || "Salah",
        poin_diperoleh: breakdownItem?.earnedPoints ?? 0,
        bobot_maksimal: breakdownItem?.maxPoints ?? q.bobot ?? 2
      };
    });
    const userPrompt = `Evaluasi hasil ujian CBT siswa berikut:
Nama Siswa: ${nama_siswa}
Skor Perhitungan Rubrik: ${scoreSummary.normalizedScore}/100 (Poin mentah: ${scoreSummary.rawEarned}/${scoreSummary.rawMax}, Kategori: ${scoreSummary.kategoriNilai})

Rincian Jawaban Siswa & Kunci Jawaban:
${JSON.stringify(detailItems, null, 2)}

Berikan evaluasi kognitif mendalam (LOTS vs HOTS) dalam Bahasa Indonesia sesuai instruksi sistem.`;
    let aiAnalysis;
    try {
      const ai = getGenAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT_EVALUATOR,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nama_siswa: { type: Type.STRING },
              skor_akhir: { type: Type.NUMBER },
              kategori_nilai: { type: Type.STRING },
              analisis_kompetensi: {
                type: Type.OBJECT,
                properties: {
                  kekuatan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  kelemahan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["kekuatan", "kelemahan"]
              },
              evaluasi_hots: { type: Type.STRING },
              rekomendasi_belajar: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: [
              "nama_siswa",
              "skor_akhir",
              "kategori_nilai",
              "analisis_kompetensi",
              "evaluasi_hots",
              "rekomendasi_belajar"
            ]
          }
        }
      });
      const rawText = (response.text ?? "").trim();
      const parsedJson = JSON.parse(rawText);
      aiAnalysis = {
        nama_siswa: parsedJson.nama_siswa || nama_siswa,
        skor_akhir: scoreSummary.normalizedScore,
        kategori_nilai: parsedJson.kategori_nilai || scoreSummary.kategoriNilai,
        analisis_kompetensi: {
          kekuatan: Array.isArray(parsedJson.analisis_kompetensi?.kekuatan) && parsedJson.analisis_kompetensi.kekuatan.length > 0 ? parsedJson.analisis_kompetensi.kekuatan : ["Mampu menyelesaikan soal-soal pemahaman konsep dasar (LOTS) dengan baik."],
          kelemahan: Array.isArray(parsedJson.analisis_kompetensi?.kelemahan) && parsedJson.analisis_kompetensi.kelemahan.length > 0 ? parsedJson.analisis_kompetensi.kelemahan : ["Perlu peningkatan ketelitian pada soal Pilihan Ganda Kompleks berbasis studi kasus (HOTS)."]
        },
        evaluasi_hots: parsedJson.evaluasi_hots || "Siswa menunjukkan pemahaman dasar yang cukup namun memerlukan latihan analisis multi-variabel untuk soal berdaya nalar tinggi (HOTS).",
        rekomendasi_belajar: Array.isArray(parsedJson.rekomendasi_belajar) && parsedJson.rekomendasi_belajar.length > 0 ? parsedJson.rekomendasi_belajar.slice(0, 3) : [
          "Review kembali konsep dasar pada butir soal yang masih dijawab salah atau sebagian.",
          "Perbanyak latihan soal Pilihan Ganda Kompleks dengan mengidentifikasi seluruh pernyataan benar.",
          "Gunakan metode pemetaan konsep (mind-mapping) saat menganalisis wacana studi kasus HOTS."
        ]
      };
    } catch (geminiError) {
      console.warn("Gemini API fallback triggered:", geminiError?.message);
      const benarItems = detailItems.filter((d) => d.status_jawaban === "Benar Penuh");
      const sebagianItems = detailItems.filter((d) => d.status_jawaban === "Benar Sebagian");
      const salahItems = detailItems.filter((d) => d.status_jawaban === "Salah");
      aiAnalysis = {
        nama_siswa,
        skor_akhir: scoreSummary.normalizedScore,
        kategori_nilai: scoreSummary.kategoriNilai,
        analisis_kompetensi: {
          kekuatan: benarItems.length > 0 ? benarItems.map(
            (b) => `Menguasai butir soal #${b.nomor} (${b.tipe_soal}): "${b.teks_soal.slice(0, 75)}..." dengan poin penuh (${b.poin_diperoleh}/${b.bobot_maksimal}).`
          ) : ["Telah menyelesaikan seluruh rangkaian ujian tepat waktu dan menjawab butir soal dasar."],
          kelemahan: salahItems.length > 0 || sebagianItems.length > 0 ? [
            ...sebagianItems.map(
              (s) => `Pemahaman parsial pada soal #${s.nomor} (${s.tipe_soal}): baru memilih sebagian opsi benar (${s.poin_diperoleh}/${s.bobot_maksimal} poin).`
            ),
            ...salahItems.map(
              (w) => `Perlu penguatan konsep pada soal #${w.nomor} (${w.tipe_soal}): "${w.teks_soal.slice(0, 70)}...".`
            )
          ] : ["Tidak ditemukan kelemahan signifikan; akurasi jawaban sangat konsisten di seluruh tipe soal."]
        },
        evaluasi_hots: scoreSummary.normalizedScore >= 80 ? "Kemampuan berpikir tingkat tinggi (HOTS - Analisis & Evaluasi) sangat kuat. Siswa mampu mengintegrasikan informasi wacana dengan tepat pada soal Pilihan Ganda Kompleks." : scoreSummary.normalizedScore >= 60 ? "Kemampuan kognitif LOTS (mengingat & memahami) sudah baik, namun pada soal HOTS (Pilihan Ganda Kompleks multi-opsi) siswa cenderung hanya mengidentifikasi sebagian faktor kunci." : "Siswa masih berfokus pada hafalan fakta tunggal (LOTS) dan memerlukan bimbingan terstruktur untuk menganalisis wacana kasus kompleks (HOTS).",
        rekomendasi_belajar: [
          "Pelajari kembali pembahasan konsep kunci pada soal Pilihan Ganda Kompleks yang memperoleh skor parsial atau nol.",
          "Latih teknik eliminasi distractor dan verifikasi setiap opsi A-E secara independen terhadap konteks wacana.",
          "Diskusikan studi kasus aplikatif bersama guru untuk memperkuat daya nalar analitis (C4) dan evaluatif (C5)."
        ]
      };
    }
    if (resultId) {
      await saveAiAnalysisToResult(Number(resultId), aiAnalysis);
    }
    await broadcastFirestoreSync(
      `Evaluasi AI selesai untuk ${nama_siswa} (${aiAnalysis.skor_akhir}/100)`
    );
    res.json(aiAnalysis);
  } catch (error) {
    console.error("Error in POST /api/analyze:", error);
    res.status(500).json({
      error: error.message || "Gagal menjalankan analisis AI Evaluator."
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CBT AI Server running on http://localhost:${PORT}`);
    broadcastFirestoreSync("Server CBT aktif dan terhubung ke Firebase Firestore");
  });
}
startServer();
