import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  getDashboardData,
  createOrReplaceQuestionsFromCsv,
  createManualQuestionRecord,
  updateManualQuestionRecord,
  deleteQuestionRecord,
  clearQuestionsByExamRecord,
  addStudentRecord,
  createStudentsFromCsv,
  updateStudentRecord,
  regenerateStudentTokenRecord,
  updateStudentStatusRecord,
  bulkUpdateStudentStatusRecord,
  deleteStudentRecord,
  renameStudentClassRecord,
  deleteStudentsByClassRecord,
  createNewExamRecord,
  updateExamRecord,
  deleteExamRecord,
  verifyStudentTokenForExam,
  submitStudentExamResult,
  saveAiAnalysisToResult,
  getOrCreateAdminUser,
  recalculateAllDatabaseResults,
} from './src/db/cbtRepository.ts';
import {
  parseQuestionsCsv,
  parseStudentsCsv,
  generateExamToken,
  calculateExamScore,
  normalizeAnswerKeys,
} from './src/utils/cbtLogic.ts';
import { AnalisisAI } from './src/db/schema.ts';
import {
  adminAuth,
  syncCbtStateToFirestore,
  removeDeletedDocFromFirestore,
  getFirestoreSyncStatus,
} from './src/lib/firebase-admin.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

const getGenAiClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const SYSTEM_PROMPT_EVALUATOR = `Anda adalah AI Evaluator CBT. Tugas Anda:
1. Hitung skor siswa secara humanis dan adil (PG Biasa: 2 Poin; PG Kompleks Benar Semua: 3 Poin, Benar Sebagian mendapatkan poin proporsional dari setiap jawaban benar yang dipilih dengan koreksi ringan anti-tebak, Asal centang semua opsi / Salah semua: 0 Poin).
2. Analisis kekuatan dan kelemahan kognitif siswa (LOTS vs HOTS).
3. Berikan 3 poin rekomendasi belajar.
Keluarkan output HANYA dalam format JSON valid dengan struktur: { nama_siswa, skor_akhir, kategori_nilai, analisis_kompetensi: { kekuatan, kelemahan }, evaluasi_hots, rekomendasi_belajar }.`;

// Helper to broadcast real-time sync to Firebase Firestore
async function broadcastFirestoreSync(eventDescription: string) {
  try {
    const latest = await getDashboardData();
    return await syncCbtStateToFirestore(latest, eventDescription);
  } catch (err) {
    console.warn('Broadcast Firestore sync skipped:', err);
    return null;
  }
}

// Sync Firebase Auth User
app.post('/api/auth/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token autentikasi tidak ditemukan.' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getOrCreateAdminUser(
      decoded.uid,
      decoded.email || 'sahidin30@gmail.com',
      decoded.name
    );
    await broadcastFirestoreSync(`Login Guru terverifikasi (${user.email})`);
    res.json({ user });
  } catch (error: any) {
    console.error('Auth sync error:', error);
    res.status(401).json({ error: 'Gagal memverifikasi token Google Sign-In.' });
  }
});

// GET /api/firebase/status - Inspect real-time Firebase Firestore status
app.get('/api/firebase/status', async (_req, res) => {
  try {
    const data = await getDashboardData();
    const status = await getFirestoreSyncStatus(data);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat status Firebase.' });
  }
});

// POST /api/firebase/sync - Trigger explicit full synchronization to Firebase Firestore
app.post('/api/firebase/sync', async (req, res) => {
  try {
    const reason = req.body?.reason || 'Sinkronisasi manual oleh Guru dari Dashboard';
    const data = await getDashboardData();
    const syncOutcome = await syncCbtStateToFirestore(data, String(reason));
    res.json({
      ...syncOutcome,
      data,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal melakukan sinkronisasi Firebase.' });
  }
});

// GET /api/dashboard - Fetch all CBT data
app.get('/api/dashboard', async (_req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error: any) {
    console.error('Error in GET /api/dashboard:', error);
    res.status(500).json({ error: error.message || 'Gagal memuat data dashboard.' });
  }
});

// POST /api/exams - Create a new exam package with grade/class distribution
app.post('/api/exams', async (req, res) => {
  try {
    const { judul_ujian, durasi_menit, target_tingkat, target_kelas } = req.body;
    if (!judul_ujian || !String(judul_ujian).trim()) {
      return res.status(400).json({ error: 'Judul ujian wajib diisi.' });
    }
    const created = await createNewExamRecord(
      String(judul_ujian),
      Number(durasi_menit) || 60,
      String(target_tingkat || 'SEMUA'),
      String(target_kelas || 'SEMUA')
    );
    await broadcastFirestoreSync(
      `Paket ujian baru dibuat: ${created.judul_ujian} (Tingkat ${created.target_tingkat})`
    );
    res.json({ exam: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal membuat ujian.' });
  }
});

// PUT /api/exams/:id - Update an exam package with grade/class distribution
app.put('/api/exams/:id', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { judul_ujian, durasi_menit, target_tingkat, target_kelas } = req.body;
    if (!judul_ujian || !String(judul_ujian).trim()) {
      return res.status(400).json({ error: 'Judul ujian wajib diisi.' });
    }
    const updated = await updateExamRecord(
      examId,
      String(judul_ujian),
      Number(durasi_menit) || 60,
      String(target_tingkat || 'SEMUA'),
      String(target_kelas || 'SEMUA')
    );
    await broadcastFirestoreSync(`Distribusi ujian diperbarui: ${updated.judul_ujian}`);
    res.json({ exam: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memperbarui ujian.' });
  }
});

// DELETE /api/exams/:id - Delete an exam package
app.delete('/api/exams/:id', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    await deleteExamRecord(examId);
    await removeDeletedDocFromFirestore('exams', examId);
    await broadcastFirestoreSync(`Paket ujian #${examId} dihapus`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghapus ujian.' });
  }
});

// POST /api/questions/manual - Create a single question manually
app.post('/api/questions/manual', async (req, res) => {
  try {
    const { examId, teks_soal, tipe_soal, wacana, opsi, kunci_jawaban, bobot } = req.body;
    if (!examId || !teks_soal || !opsi) {
      return res.status(400).json({ error: 'Paket ujian, teks soal, dan opsi wajib diisi.' });
    }
    const normalizedKeys = normalizeAnswerKeys(kunci_jawaban);
    if (normalizedKeys.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal satu kunci jawaban yang benar (A-E).' });
    }
    const created = await createManualQuestionRecord(
      Number(examId),
      String(teks_soal),
      tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
      String(wacana || ''),
      opsi,
      normalizedKeys,
      Number(bobot) || (tipe_soal === 'Kompleks' ? 3 : 2)
    );
    await broadcastFirestoreSync(`Butir soal baru ditambahkan ke ujian #${examId}`);
    res.json({ question: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menambahkan soal.' });
  }
});

// PUT /api/questions/:id - Update an existing question
app.put('/api/questions/:id', async (req, res) => {
  try {
    const qId = Number(req.params.id);
    const { examId, teks_soal, tipe_soal, wacana, opsi, kunci_jawaban, bobot } = req.body;
    if (!examId || !teks_soal || !opsi) {
      return res.status(400).json({ error: 'Paket ujian, teks soal, dan opsi wajib diisi.' });
    }
    const normalizedKeys = normalizeAnswerKeys(kunci_jawaban);
    if (normalizedKeys.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal satu kunci jawaban yang benar (A-E).' });
    }
    const updated = await updateManualQuestionRecord(
      qId,
      Number(examId),
      String(teks_soal),
      tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
      String(wacana || ''),
      opsi,
      normalizedKeys,
      Number(bobot) || (tipe_soal === 'Kompleks' ? 3 : 2)
    );
    await broadcastFirestoreSync(`Butir soal #${qId} diperbarui`);
    res.json({ question: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memperbarui soal.' });
  }
});

// DELETE /api/questions/:id - Delete a question
app.delete('/api/questions/:id', async (req, res) => {
  try {
    const qId = Number(req.params.id);
    await deleteQuestionRecord(qId);
    await removeDeletedDocFromFirestore('questions', qId);
    await broadcastFirestoreSync(`Butir soal #${qId} dihapus`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghapus soal.' });
  }
});

// DELETE /api/exams/:id/questions - Clear all questions in an exam package
app.delete('/api/exams/:id/questions', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    await clearQuestionsByExamRecord(examId);
    await broadcastFirestoreSync(`Semua soal pada ujian #${examId} dikosongkan`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengosongkan soal.' });
  }
});

// POST /api/questions/upload-csv - Bulk CSV Upload
app.post('/api/questions/upload-csv', async (req, res) => {
  try {
    const { examId, csvText, replaceExisting = false } = req.body;
    if (!examId || !csvText) {
      return res.status(400).json({ error: 'Pilih Paket Ujian dan unggah file CSV terlebih dahulu.' });
    }

    const parsed = parseQuestionsCsv(String(csvText));
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return res.status(400).json({
        error: parsed.errors.join(' | '),
        errors: parsed.errors,
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
      warnings: parsed.errors,
    });
  } catch (error: any) {
    console.error('CSV Upload Error:', error);
    res.status(500).json({ error: error.message || 'Gagal memproses upload soal CSV.' });
  }
});

// POST /api/students - Add student (Nama Siswa & Kelas) and generate unique 6-character token
app.post('/api/students', async (req, res) => {
  try {
    const { nama, kelas, customToken } = req.body;
    if (!nama || !String(nama).trim() || !kelas || !String(kelas).trim()) {
      return res.status(400).json({ error: 'Nama siswa dan kelas wajib diisi.' });
    }
    const token =
      customToken && String(customToken).trim().length === 6
        ? String(customToken).toUpperCase().trim()
        : generateExamToken();

    const student = await addStudentRecord(String(nama), String(kelas), token);
    await broadcastFirestoreSync(
      `Siswa baru ditambahkan: ${student.nama} (${student.kelas}) — Token ${student.token_ujian}`
    );
    res.json({ student });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menambahkan siswa.' });
  }
});

// POST /api/students/upload-csv - Bulk Student CSV Upload (Nama Siswa & Kelas)
app.post('/api/students/upload-csv', async (req, res) => {
  try {
    const { csvText, replaceExisting = false } = req.body;
    if (!csvText || !String(csvText).trim()) {
      return res.status(400).json({ error: 'Konten CSV siswa wajib diisi.' });
    }

    const parsed = parseStudentsCsv(String(csvText));
    if (parsed.rows.length === 0) {
      return res.status(400).json({
        error: parsed.errors.join(' | ') || 'Format CSV siswa tidak valid.',
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
      warnings: parsed.errors,
    });
  } catch (error: any) {
    console.error('Student CSV Upload Error:', error);
    res.status(500).json({
      error: error.message || 'Gagal memproses upload massal siswa.',
    });
  }
});

// PUT /api/students/:id - Update student nama and kelas
app.put('/api/students/:id', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { nama, kelas } = req.body;
    if (!nama || !String(nama).trim() || !kelas || !String(kelas).trim()) {
      return res.status(400).json({ error: 'Nama siswa dan kelas wajib diisi.' });
    }
    const updated = await updateStudentRecord(studentId, String(nama), String(kelas));
    await broadcastFirestoreSync(`Data siswa diperbarui: ${updated.nama} (${updated.kelas})`);
    res.json({ student: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memperbarui data siswa.' });
  }
});

// POST /api/classes/rename - Rename a class across all students in that class
app.post('/api/classes/rename', async (req, res) => {
  try {
    const { oldKelas, newKelas } = req.body;
    if (!oldKelas || !newKelas || !String(newKelas).trim()) {
      return res.status(400).json({ error: 'Nama kelas lama dan baru wajib diisi.' });
    }
    const updated = await renameStudentClassRecord(String(oldKelas), String(newKelas));
    await broadcastFirestoreSync(`Nama kelas diubah: ${oldKelas} -> ${newKelas}`);
    res.json({ updatedCount: updated.length, students: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengubah nama kelas.' });
  }
});

// POST /api/classes/delete - Delete all students in a specific class
app.post('/api/classes/delete', async (req, res) => {
  try {
    const { kelas } = req.body;
    if (!kelas || !String(kelas).trim()) {
      return res.status(400).json({ error: 'Nama kelas wajib diisi.' });
    }
    await deleteStudentsByClassRecord(String(kelas));
    await broadcastFirestoreSync(`Kelas ${kelas} dihapus`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghapus kelas.' });
  }
});

// POST /api/students/:id/regenerate-token - Regenerate 6-char token
app.post('/api/students/:id/regenerate-token', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const newToken = generateExamToken();
    const updated = await regenerateStudentTokenRecord(studentId, newToken);
    await broadcastFirestoreSync(
      `Token baru dibuat untuk ${updated.nama}: ${updated.token_ujian}`
    );
    res.json({ student: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal membuat ulang token.' });
  }
});

// PATCH /api/students/:id/status - Manage student exam status (Belum Mulai, Sedang Ujian, Selesai, Diblokir)
app.patch('/api/students/:id/status', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    const { status_ujian } = req.body;
    const validStatuses = ['Belum Mulai', 'Sedang Ujian', 'Selesai', 'Diblokir'];
    if (!status_ujian || !validStatuses.includes(String(status_ujian))) {
      return res.status(400).json({ error: 'Status ujian tidak valid.' });
    }
    const updated = await updateStudentStatusRecord(studentId, String(status_ujian));
    await broadcastFirestoreSync(
      `Status siswa ${updated.nama} diubah menjadi: ${updated.status_ujian}`
    );
    res.json({ student: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengubah status siswa.' });
  }
});

// POST /api/students/bulk-status - Bulk update student exam statuses
app.post('/api/students/bulk-status', async (req, res) => {
  try {
    const { studentIds, status_ujian } = req.body;
    const validStatuses = ['Belum Mulai', 'Sedang Ujian', 'Selesai', 'Diblokir'];
    if (
      !Array.isArray(studentIds) ||
      !status_ujian ||
      !validStatuses.includes(String(status_ujian))
    ) {
      return res.status(400).json({ error: 'Parameter daftar siswa atau status tidak valid.' });
    }
    const updatedList = await bulkUpdateStudentStatusRecord(
      studentIds.map(Number),
      String(status_ujian)
    );
    await broadcastFirestoreSync(
      `Status ${updatedList.length} siswa diatur massal menjadi: ${status_ujian}`
    );
    res.json({ students: updatedList });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Gagal mengubah status siswa secara massal.',
    });
  }
});

// DELETE /api/students/:id - Delete a student
app.delete('/api/students/:id', async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    await deleteStudentRecord(studentId);
    await removeDeletedDocFromFirestore('students', studentId);
    await broadcastFirestoreSync(`Data siswa #${studentId} dihapus`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghapus siswa.' });
  }
});

// POST /api/exam/login - Student Login with Nama & 6-Char Token
app.post('/api/exam/login', async (req, res) => {
  try {
    const { nama, token_ujian, examId } = req.body;
    if (!nama || !token_ujian) {
      return res.status(400).json({ error: 'Nama Siswa dan Token Ujian wajib diisi.' });
    }
    const session = await verifyStudentTokenForExam(
      String(nama),
      String(token_ujian),
      examId ? Number(examId) : undefined
    );
    if ('error' in session) {
      return res.status(400).json({ error: session.error });
    }
    await broadcastFirestoreSync(
      `Siswa mulai ujian: ${session.student.nama} (${session.student.kelas}) — ${session.exam.judul_ujian}`
    );
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal masuk ke sesi ujian.' });
  }
});

// POST /api/exam/heartbeat - Real-time anti-cheat & live progress broadcast via Firebase
app.post('/api/exam/heartbeat', async (req, res) => {
  try {
    const { nama, kelas, pelanggaranTab = 0, answeredCount = 0 } = req.body;
    await broadcastFirestoreSync(
      `Peringatan Anti-Cheat: ${nama || 'Siswa'} (${kelas || '-'}) pindah tab (${pelanggaranTab}x) · Terjawab ${answeredCount} soal`
    );
    res.json({ synced: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal sinkronisasi heartbeat.' });
  }
});

// POST /api/exam/submit - Submit student exam answers
app.post('/api/exam/submit', async (req, res) => {
  try {
    const { studentId, examId, jawabanSiswa, pelanggaranTab = 0 } = req.body;
    if (!studentId || !examId || !jawabanSiswa) {
      return res.status(400).json({ error: 'Data jawaban ujian tidak lengkap.' });
    }
    const answeredKeys = Object.keys(jawabanSiswa || {}).filter(
      (k) => Array.isArray(jawabanSiswa[k]) && jawabanSiswa[k].length > 0
    );
    if (answeredKeys.length === 0) {
      return res.status(400).json({
        error:
          'Peringatan: Anda belum menjawab satu soal pun. Silakan isi jawaban terlebih dahulu sebelum mengumpulkan!',
      });
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
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengirim jawaban ujian.' });
  }
});

// POST /api/results/recalculate - Recalculate all existing student exam results using the Humane PG Kompleks formula
app.post('/api/results/recalculate', async (_req, res) => {
  try {
    const outcome = await recalculateAllDatabaseResults();
    await broadcastFirestoreSync(
      `Skor hasil ujian siswa dihitung ulang dengan Formula Nilai Humanis`
    );
    res.json(outcome);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghitung ulang nilai siswa.' });
  }
});

// POST /api/analyze - Gemini AI Evaluator Endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { resultId, nama_siswa, questions: examQuestions, jawaban_siswa } = req.body;

    if (!nama_siswa || !Array.isArray(examQuestions) || !jawaban_siswa) {
      return res.status(400).json({
        error: 'Parameter nama_siswa, daftar soal, dan jawaban_siswa wajib disertakan.',
      });
    }

    const answeredKeys = Object.keys(jawaban_siswa || {}).filter(
      (k) => Array.isArray(jawaban_siswa[k]) && jawaban_siswa[k].length > 0
    );
    const scoreSummary = calculateExamScore(examQuestions, jawaban_siswa);

    if (answeredKeys.length === 0 || scoreSummary.rawEarned === 0) {
      return res.status(400).json({
        error: 'Skor 0: Analisis AI tidak tersedia untuk ujian kosong.',
      });
    }

    const detailItems = examQuestions.map((q: any, idx: number) => {
      const qId = String(q.id);
      const chosen = jawaban_siswa[qId] || [];
      const breakdownItem = scoreSummary.breakdown.find((b) => b.questionId === qId);
      return {
        nomor: idx + 1,
        tipe_soal: q.tipe_soal,
        wacana: q.data_opsi?.wacana || '',
        teks_soal: q.teks_soal,
        kunci_jawaban: q.kunci_jawaban,
        jawaban_siswa: chosen,
        status_jawaban: breakdownItem?.status || 'Salah',
        poin_diperoleh: breakdownItem?.earnedPoints ?? 0,
        bobot_maksimal: breakdownItem?.maxPoints ?? q.bobot ?? 2,
      };
    });

    const userPrompt = `Evaluasi hasil ujian CBT siswa berikut:
Nama Siswa: ${nama_siswa}
Skor Perhitungan Rubrik: ${scoreSummary.normalizedScore}/100 (Poin mentah: ${scoreSummary.rawEarned}/${scoreSummary.rawMax}, Kategori: ${scoreSummary.kategoriNilai})

Rincian Jawaban Siswa & Kunci Jawaban:
${JSON.stringify(detailItems, null, 2)}

Berikan evaluasi kognitif mendalam (LOTS vs HOTS) dalam Bahasa Indonesia sesuai instruksi sistem.`;

    let aiAnalysis: AnalisisAI;

    try {
      const ai = getGenAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT_EVALUATOR,
          responseMimeType: 'application/json',
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
                    items: { type: Type.STRING },
                  },
                  kelemahan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['kekuatan', 'kelemahan'],
              },
              evaluasi_hots: { type: Type.STRING },
              rekomendasi_belajar: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'nama_siswa',
              'skor_akhir',
              'kategori_nilai',
              'analisis_kompetensi',
              'evaluasi_hots',
              'rekomendasi_belajar',
            ],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsedJson = JSON.parse(rawText);

      aiAnalysis = {
        nama_siswa: parsedJson.nama_siswa || nama_siswa,
        skor_akhir: scoreSummary.normalizedScore,
        kategori_nilai: parsedJson.kategori_nilai || scoreSummary.kategoriNilai,
        analisis_kompetensi: {
          kekuatan:
            Array.isArray(parsedJson.analisis_kompetensi?.kekuatan) &&
            parsedJson.analisis_kompetensi.kekuatan.length > 0
              ? parsedJson.analisis_kompetensi.kekuatan
              : ['Mampu menyelesaikan soal-soal pemahaman konsep dasar (LOTS) dengan baik.'],
          kelemahan:
            Array.isArray(parsedJson.analisis_kompetensi?.kelemahan) &&
            parsedJson.analisis_kompetensi.kelemahan.length > 0
              ? parsedJson.analisis_kompetensi.kelemahan
              : ['Perlu peningkatan ketelitian pada soal Pilihan Ganda Kompleks berbasis studi kasus (HOTS).'],
        },
        evaluasi_hots:
          parsedJson.evaluasi_hots ||
          'Siswa menunjukkan pemahaman dasar yang cukup namun memerlukan latihan analisis multi-variabel untuk soal berdaya nalar tinggi (HOTS).',
        rekomendasi_belajar:
          Array.isArray(parsedJson.rekomendasi_belajar) &&
          parsedJson.rekomendasi_belajar.length > 0
            ? parsedJson.rekomendasi_belajar.slice(0, 3)
            : [
                'Review kembali konsep dasar pada butir soal yang masih dijawab salah atau sebagian.',
                'Perbanyak latihan soal Pilihan Ganda Kompleks dengan mengidentifikasi seluruh pernyataan benar.',
                'Gunakan metode pemetaan konsep (mind-mapping) saat menganalisis wacana studi kasus HOTS.',
              ],
      };
    } catch (geminiError: any) {
      console.warn('Gemini API fallback triggered:', geminiError?.message);
      const benarItems = detailItems.filter((d) => d.status_jawaban === 'Benar Penuh');
      const sebagianItems = detailItems.filter((d) => d.status_jawaban === 'Benar Sebagian');
      const salahItems = detailItems.filter((d) => d.status_jawaban === 'Salah');

      aiAnalysis = {
        nama_siswa,
        skor_akhir: scoreSummary.normalizedScore,
        kategori_nilai: scoreSummary.kategoriNilai,
        analisis_kompetensi: {
          kekuatan:
            benarItems.length > 0
              ? benarItems.map(
                  (b) =>
                    `Menguasai butir soal #${b.nomor} (${b.tipe_soal}): "${b.teks_soal.slice(0, 75)}..." dengan poin penuh (${b.poin_diperoleh}/${b.bobot_maksimal}).`
                )
              : ['Telah menyelesaikan seluruh rangkaian ujian tepat waktu dan menjawab butir soal dasar.'],
          kelemahan:
            salahItems.length > 0 || sebagianItems.length > 0
              ? [
                  ...sebagianItems.map(
                    (s) =>
                      `Pemahaman parsial pada soal #${s.nomor} (${s.tipe_soal}): baru memilih sebagian opsi benar (${s.poin_diperoleh}/${s.bobot_maksimal} poin).`
                  ),
                  ...salahItems.map(
                    (w) =>
                      `Perlu penguatan konsep pada soal #${w.nomor} (${w.tipe_soal}): "${w.teks_soal.slice(0, 70)}...".`
                  ),
                ]
              : ['Tidak ditemukan kelemahan signifikan; akurasi jawaban sangat konsisten di seluruh tipe soal.'],
        },
        evaluasi_hots:
          scoreSummary.normalizedScore >= 80
            ? 'Kemampuan berpikir tingkat tinggi (HOTS - Analisis & Evaluasi) sangat kuat. Siswa mampu mengintegrasikan informasi wacana dengan tepat pada soal Pilihan Ganda Kompleks.'
            : scoreSummary.normalizedScore >= 60
              ? 'Kemampuan kognitif LOTS (mengingat & memahami) sudah baik, namun pada soal HOTS (Pilihan Ganda Kompleks multi-opsi) siswa cenderung hanya mengidentifikasi sebagian faktor kunci.'
              : 'Siswa masih berfokus pada hafalan fakta tunggal (LOTS) dan memerlukan bimbingan terstruktur untuk menganalisis wacana kasus kompleks (HOTS).',
        rekomendasi_belajar: [
          'Pelajari kembali pembahasan konsep kunci pada soal Pilihan Ganda Kompleks yang memperoleh skor parsial atau nol.',
          'Latih teknik eliminasi distractor dan verifikasi setiap opsi A-E secara independen terhadap konteks wacana.',
          'Diskusikan studi kasus aplikatif bersama guru untuk memperkuat daya nalar analitis (C4) dan evaluatif (C5).',
        ],
      };
    }

    if (resultId) {
      await saveAiAnalysisToResult(Number(resultId), aiAnalysis);
    }

    await broadcastFirestoreSync(
      `Evaluasi AI selesai untuk ${nama_siswa} (${aiAnalysis.skor_akhir}/100)`
    );

    res.json(aiAnalysis);
  } catch (error: any) {
    console.error('Error in POST /api/analyze:', error);
    res.status(500).json({
      error: error.message || 'Gagal menjalankan analisis AI Evaluator.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CBT AI Server running on http://localhost:${PORT}`);
    broadcastFirestoreSync('Server CBT aktif dan terhubung ke Firebase Firestore');
  });
}

startServer();
