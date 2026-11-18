import express from 'express';
import path from 'path';
import fs from 'fs';
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
  mapStudentAnswersToCanonicalKeys,
  buildHumaneAnalysisForResult,
} from './src/utils/cbtLogic.ts';
import { AnalisisAI } from './src/db/schema.ts';
import {
  adminAuth,
  adminDb,
  syncCbtStateToFirestore,
  removeDeletedDocFromFirestore,
  getFirestoreSyncStatus,
} from './src/lib/firebase-admin.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const VAULT_FILE_PATH = path.join(__dirname, '.cbt-question-vault.json');

// Server-side Question Vault (menyimpan kunci_jawaban aman di server untuk evaluasi mutlak)
const serverQuestionVault = new Map<number, any[]>();
// Server-side Live Session Singleton cache
const serverLiveSessions = new Map<number, any>();
// Server-side Archive Vault (30-day archive fallback + metadata)
const serverArchiveVault = new Map<string, any>();

function loadVaultFromDisk() {
  try {
    if (fs.existsSync(VAULT_FILE_PATH)) {
      const raw = fs.readFileSync(VAULT_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.exams === 'object') {
        for (const [k, v] of Object.entries(parsed.exams)) {
          if (Array.isArray(v)) {
            serverQuestionVault.set(Number(k), v);
          }
        }
      }
      if (parsed && typeof parsed.archives === 'object') {
        for (const [k, v] of Object.entries(parsed.archives)) {
          if (v && typeof v === 'object') {
            serverArchiveVault.set(k, v);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Question vault load skipped:', err);
  }
}

function persistVaultToDisk() {
  try {
    const examsObj: Record<string, any[]> = {};
    for (const [k, v] of serverQuestionVault.entries()) {
      examsObj[String(k)] = v;
    }
    const archivesObj: Record<string, any> = {};
    for (const [k, v] of serverArchiveVault.entries()) {
      archivesObj[k] = v;
    }
    fs.writeFileSync(
      VAULT_FILE_PATH,
      JSON.stringify({ exams: examsObj, archives: archivesObj }),
      'utf-8'
    );
  } catch {
    // Abaikan jika filesystem read-only
  }
}

loadVaultFromDisk();

/**
 * Menghapus `kunci_jawaban` sebelum payload soal dikirim ke klien siswa yang sedang ujian.
 */
function stripQuestionKeysForClient(questions: any[]): any[] {
  return (questions || [])
    .filter((q) => !q?.is_archived_version)
    .map((q) => ({
      ...q,
      kunci_jawaban: [],
    }));
}

async function resolveAuthoritativeQuestions(examId: number): Promise<any[]> {
  const numExamId = Number(examId);
  const byId = new Map<number, any>();

  // 1. Cek PostgreSQL repository
  try {
    const dash = await getDashboardData();
    const pgQuestions = (dash.questions || []).filter(
      (q: any) => Number(q.exam_id) === numExamId
    );
    for (const q of pgQuestions) {
      byId.set(Number(q.id), q);
    }
  } catch {
    // PostgreSQL mungkin belum terisi / tidak tersedia
  }

  // 2. Cek Server Vault (di-sync dari Admin Bank Soal)
  const vaultQuestions = serverQuestionVault.get(numExamId) || [];
  for (const q of vaultQuestions) {
    byId.set(Number(q.id), q);
  }

  // 3. Fallback Firebase Admin SDK (`questions/bundle_${examId}`)
  if (byId.size === 0) {
    try {
      const bundleSnap = await adminDb
        .collection('questions')
        .doc(`bundle_${numExamId}`)
        .get();
      if (bundleSnap.exists) {
        const raw = bundleSnap.data() as any;
        if (raw?.data_opsi?.is_bundle && Array.isArray(raw.data_opsi.items)) {
          for (const item of raw.data_opsi.items) {
            byId.set(Number(item.id), {
              ...item,
              exam_id: Number(item.exam_id || numExamId),
            });
          }
          if (byId.size > 0) {
            serverQuestionVault.set(numExamId, Array.from(byId.values()));
            persistVaultToDisk();
          }
        }
      }
    } catch {
      // Admin SDK permission / network fallback gracefully ignored
    }
  }

  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

function recomputeLiveSessionSummary(session: any) {
  const participants: Record<string, any> = session.participants || {};
  const list = Object.values(participants);
  let activeCount = 0;
  let finishedCount = 0;
  let blockedCount = 0;
  let notStartedCount = 0;
  let totalViolations = 0;

  for (const p of list) {
    const status = String(p?.status_ujian || 'Belum Mulai');
    if (status === 'Sedang Ujian') activeCount++;
    else if (status === 'Selesai') finishedCount++;
    else if (status === 'Diblokir') blockedCount++;
    else notStartedCount++;
    totalViolations +=
      Number(p?.tab_violations || 0) + Number(p?.inspect_attempts || 0);
  }

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    activeCount,
    finishedCount,
    blockedCount,
    notStartedCount,
    totalViolations,
    participants,
    authorUid: 'sahidin30@gmail.com',
  };
}

async function upsertLiveSessionParticipantServer(
  examId: number,
  judulUjian: string,
  participant: any
) {
  const numExamId = Number(examId);
  if (!numExamId || !participant?.student_id) return null;

  let current = serverLiveSessions.get(numExamId);
  if (!current) {
    try {
      const snap = await adminDb
        .collection('live_sessions')
        .doc(`ujian_${numExamId}`)
        .get();
      if (snap.exists) {
        current = snap.data();
      }
    } catch {
      // Ignore read fallback
    }
  }

  const baseSession = current || {
    exam_id: numExamId,
    judul_ujian: judulUjian || `Ujian #${numExamId}`,
    participants: {},
  };

  const nextParticipants = {
    ...(baseSession.participants || {}),
    [String(participant.student_id)]: participant,
  };

  const nextSession = recomputeLiveSessionSummary({
    ...baseSession,
    judul_ujian: judulUjian || baseSession.judul_ujian || `Ujian #${numExamId}`,
    participants: nextParticipants,
  });

  serverLiveSessions.set(numExamId, nextSession);

  try {
    await adminDb
      .collection('live_sessions')
      .doc(`ujian_${numExamId}`)
      .set(nextSession, { merge: true });
  } catch {
    // Tetap aman meski Starter Tier / client Firestore handles persistence
  }

  return nextSession;
}

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

// POST /api/questions/vault-sync - Sinkronkan kunci soal ke brankas server-side untuk evaluasi mutlak
app.post('/api/questions/vault-sync', async (req, res) => {
  try {
    const { examId, questions: incomingQuestions } = req.body || {};
    if (examId && Array.isArray(incomingQuestions)) {
      const numExamId = Number(examId);
      const existing = serverQuestionVault.get(numExamId) || [];
      const archivedExisting = existing.filter((q) => q?.is_archived_version);
      const mergedMap = new Map<number, any>();
      archivedExisting.forEach((q) => mergedMap.set(Number(q.id), q));
      incomingQuestions.forEach((q: any) =>
        mergedMap.set(Number(q.id), { ...q, exam_id: Number(q.exam_id || numExamId) })
      );
      serverQuestionVault.set(numExamId, Array.from(mergedMap.values()));
      persistVaultToDisk();
      return res.json({ ok: true, examId: numExamId, count: mergedMap.size });
    }
    if (Array.isArray(incomingQuestions)) {
      const grouped = new Map<number, any[]>();
      for (const q of incomingQuestions) {
        const eId = Number(q.exam_id);
        if (!eId) continue;
        const list = grouped.get(eId) || [];
        list.push(q);
        grouped.set(eId, list);
      }
      for (const [eId, list] of grouped.entries()) {
        serverQuestionVault.set(eId, list);
      }
      persistVaultToDisk();
      return res.json({ ok: true, examCount: grouped.size });
    }
    res.status(400).json({ error: 'Payload soal tidak valid.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal sinkronisasi vault soal.' });
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
    res.json({ exam: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memperbarui ujian.' });
  }
});

// Async deep delete chunk helper for Firestore Admin SDK (<= 400 ops per batch)
async function asyncDeepDeleteExamDocs(examId: number) {
  try {
    const [qSnap, rSnap] = await Promise.all([
      adminDb.collection('questions').where('exam_id', '==', examId).get(),
      adminDb.collection('results').where('exam_id', '==', examId).get(),
    ]);
    const refsToDelete: FirebaseFirestore.DocumentReference[] = [
      adminDb.collection('exams').doc(String(examId)),
      adminDb.collection('questions').doc(`bundle_${examId}`),
      adminDb.collection('live_sessions').doc(`ujian_${examId}`),
      ...qSnap.docs.map((d) => d.ref),
      ...rSnap.docs.map((d) => d.ref),
    ];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
      const slice = refsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = adminDb.batch();
      slice.forEach((r) => batch.delete(r));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Async Admin SDK deep delete skipped (fallback to client batch):', err);
  }
}

// POST /api/exams/:id/soft-delete - Soft-delete exam to 30-day archive & run async recursive cleanup
app.post('/api/exams/:id/soft-delete', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { exam, questions: archivedQuestions = [], results: archivedResults = [] } =
      req.body || {};

    const now = new Date();
    const deletedAt = now.toISOString();
    const purgeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const purgeAt = purgeDate.toISOString();
    const archiveId = `arch_${examId}_${now.getTime()}`;

    const archivePayload = {
      id: archiveId,
      exam_id: examId,
      judul_ujian: String(exam?.judul_ujian || `Paket Ujian #${examId}`).slice(0, 200),
      exam_data: {
        ...(exam || { id: examId, judul_ujian: `Paket Ujian #${examId}`, durasi_menit: 60, target_tingkat: 'SEMUA', target_kelas: 'SEMUA' }),
        isDeleted: true,
        deletedAt,
        purgeAt,
      },
      questions_data: Array.isArray(archivedQuestions) ? archivedQuestions : [],
      results_data: Array.isArray(archivedResults) ? archivedResults : [],
      deletedBy: 'sahidin30@gmail.com',
      deletedAt,
      purgeAt,
      expireAt: purgeAt,
      updatedAt: deletedAt,
    };

    serverArchiveVault.set(archiveId, archivePayload);
    serverQuestionVault.delete(examId);
    serverLiveSessions.delete(examId);
    persistVaultToDisk();

    try {
      await deleteExamRecord(examId);
    } catch {
      // PG may not have this exam
    }

    try {
      await adminDb.collection('exams_archive').doc(archiveId).set(archivePayload);
      await adminDb
        .collection('exams')
        .doc(String(examId))
        .set({ isDeleted: true, deletedAt, purgeAt, updatedAt: deletedAt }, { merge: true });
    } catch {
      // Admin SDK optional if handled by client
    }

    // Eksekusi penghapusan rekursif secara asinkron di belakang layar tanpa memblokir UI admin
    setImmediate(() => {
      asyncDeepDeleteExamDocs(examId).catch(() => {});
    });

    res.json({ success: true, archive: archivePayload });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengarsipkan ujian.' });
  }
});

// GET /api/exams/archive - Fetch 30-day archived exams
app.get('/api/exams/archive', async (_req, res) => {
  try {
    const byId = new Map<string, any>();
    for (const [k, v] of serverArchiveVault.entries()) {
      if (!v?.restoredAt) {
        byId.set(k, v);
      }
    }
    try {
      const snap = await adminDb.collection('exams_archive').get();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!data?.restoredAt) {
          byId.set(d.id, { ...data, id: d.id });
        }
      });
    } catch {
      // Fallback to serverArchiveVault
    }
    const archives = Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime()
    );
    res.json({ archives });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat arsip ujian.' });
  }
});

// POST /api/exams/:archiveId/restore - Restore an exam from 30-day archive
app.post('/api/exams/:archiveId/restore', async (req, res) => {
  try {
    const archiveId = String(req.params.archiveId);
    let archiveDoc: any = serverArchiveVault.get(archiveId) || req.body?.archive;

    if (!archiveDoc) {
      try {
        const snap = await adminDb.collection('exams_archive').doc(archiveId).get();
        if (snap.exists) {
          archiveDoc = snap.data();
        }
      } catch {}
    }

    if (!archiveDoc) {
      return res.status(404).json({ error: 'Arsip ujian tidak ditemukan atau sudah kedaluwarsa.' });
    }

    const restoredExam = {
      ...archiveDoc.exam_data,
      id: Number(archiveDoc.exam_id),
      isDeleted: false,
      deletedAt: '',
      purgeAt: '',
      updatedAt: new Date().toISOString(),
    };
    const restoredQuestions = Array.isArray(archiveDoc.questions_data)
      ? archiveDoc.questions_data
      : [];
    const restoredResults = Array.isArray(archiveDoc.results_data)
      ? archiveDoc.results_data
      : [];

    if (restoredQuestions.length > 0) {
      serverQuestionVault.set(Number(archiveDoc.exam_id), restoredQuestions);
    }
    serverArchiveVault.delete(archiveId);
    persistVaultToDisk();

    try {
      const nowIso = new Date().toISOString();
      const batch = adminDb.batch();
      batch.set(adminDb.collection('exams').doc(String(archiveDoc.exam_id)), {
        ...restoredExam,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
      batch.set(
        adminDb.collection('questions').doc(`bundle_${archiveDoc.exam_id}`),
        {
          id: Number(archiveDoc.exam_id),
          exam_id: Number(archiveDoc.exam_id),
          teks_soal: `BUNDLE_PAKET_SOAL_${archiveDoc.exam_id}`,
          tipe_soal: 'PG',
          data_opsi: {
            is_bundle: true,
            ...(restoredQuestions.length === 0 ? { cleared: true } : {}),
            items: restoredQuestions,
            wacana: '',
            opsi: { A: '-', B: '-', C: '-', D: '-', E: '-' },
          },
          kunci_jawaban: ['A'],
          bobot: 2,
          authorUid: 'sahidin30@gmail.com',
          updatedAt: nowIso,
        }
      );
      batch.delete(adminDb.collection('exams_archive').doc(archiveId));
      await batch.commit();
    } catch {
      // Client handles Firestore restoration fallback
    }

    res.json({
      success: true,
      exam: restoredExam,
      questions: restoredQuestions,
      results: restoredResults,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memulihkan arsip ujian.' });
  }
});

// DELETE /api/exams/:id - Delete an exam package
app.delete('/api/exams/:id', async (req, res) => {
  try {
    const examId = Number(req.params.id);
    await deleteExamRecord(examId);
    await removeDeletedDocFromFirestore('exams', examId);
    serverQuestionVault.delete(examId);
    serverLiveSessions.delete(examId);
    persistVaultToDisk();
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
    const numExamId = Number(examId);
    const prevList = serverQuestionVault.get(numExamId) || [];
    serverQuestionVault.set(numExamId, [
      ...prevList.filter((q) => Number(q.id) !== Number(created.id)),
      created,
    ]);
    persistVaultToDisk();
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
    const numExamId = Number(examId);
    const prevList = serverQuestionVault.get(numExamId) || [];
    serverQuestionVault.set(numExamId, [
      ...prevList.filter((q) => Number(q.id) !== Number(updated.id)),
      updated,
    ]);
    persistVaultToDisk();
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
    for (const [eId, list] of serverQuestionVault.entries()) {
      const next = list.filter((q) => Number(q.id) !== qId);
      if (next.length !== list.length) {
        serverQuestionVault.set(eId, next);
      }
    }
    persistVaultToDisk();
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
    serverQuestionVault.set(examId, []);
    persistVaultToDisk();
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
    const numExamId = Number(examId);
    const prevList = replaceExisting ? [] : serverQuestionVault.get(numExamId) || [];
    serverQuestionVault.set(numExamId, [...prevList, ...inserted]);
    persistVaultToDisk();

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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menghapus siswa.' });
  }
});

// POST /api/exam/login - Student Login with Nama & 6-Char Token (NEVER return kunci_jawaban)
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
    // Simpan soal lengkap ke server vault sebelum membersihkan kunci_jawaban dari payload klien
    if (session.exam?.id && Array.isArray(session.questions) && session.questions.length > 0) {
      serverQuestionVault.set(Number(session.exam.id), session.questions);
      persistVaultToDisk();
    }
    res.json({
      ...session,
      questions: stripQuestionKeysForClient(session.questions || []),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal masuk ke sesi ujian.' });
  }
});

// GET /api/live-sessions/:examId - Singleton Live Session Aggregate
app.get('/api/live-sessions/:examId', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    let session = serverLiveSessions.get(examId);
    if (!session) {
      try {
        const snap = await adminDb
          .collection('live_sessions')
          .doc(`ujian_${examId}`)
          .get();
        if (snap.exists) {
          session = snap.data();
          serverLiveSessions.set(examId, session);
        }
      } catch {}
    }
    res.json({ session: session || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat sesi live.' });
  }
});

// POST /api/live-sessions/:examId/ping - Upsert participant into Singleton Live Session
app.post('/api/live-sessions/:examId/ping', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    const { judul_ujian, participant } = req.body || {};
    if (!examId || !participant?.student_id) {
      return res.status(400).json({ error: 'Data participant sesi live tidak lengkap.' });
    }
    const updated = await upsertLiveSessionParticipantServer(
      examId,
      String(judul_ujian || ''),
      participant
    );
    res.json({ synced: true, session: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memperbarui singleton live session.' });
  }
});

// POST /api/exam/heartbeat - Real-time anti-cheat & live progress broadcast via Singleton & Firebase
app.post('/api/exam/heartbeat', async (req, res) => {
  try {
    const { examId, judul_ujian, participant } = req.body || {};
    if (examId && participant?.student_id) {
      const updated = await upsertLiveSessionParticipantServer(
        Number(examId),
        String(judul_ujian || ''),
        participant
      );
      return res.json({ synced: true, session: updated });
    }
    res.json({ synced: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal sinkronisasi heartbeat.' });
  }
});

// POST /api/exam/submit - Evaluasi Server-Side Mutlak saat siswa menyelesaikan ujian
app.post('/api/exam/submit', async (req, res) => {
  try {
    const {
      studentId,
      examId,
      jawabanSiswa,
      pelanggaranTab = 0,
      forceByTimeout = false,
      clientQuestionsMeta = [],
      studentName = '',
      studentKelas = '',
      kodePaket = 'PAKET-A',
      judulUjian = '',
    } = req.body || {};

    if (!studentId || !examId || !jawabanSiswa) {
      return res.status(400).json({ error: 'Data jawaban ujian tidak lengkap.' });
    }
    const answeredKeys = Object.keys(jawabanSiswa || {}).filter(
      (k) => Array.isArray(jawabanSiswa[k]) && jawabanSiswa[k].length > 0
    );
    if (answeredKeys.length === 0 && !forceByTimeout) {
      return res.status(400).json({
        error:
          'Peringatan: Anda belum menjawab satu soal pun. Silakan isi jawaban terlebih dahulu sebelum mengumpulkan!',
      });
    }

    const numStudentId = Number(studentId);
    const numExamId = Number(examId);

    // 1. Cari pertanyaan otoritatif (lengkap dengan kunci_jawaban) di server
    const authoritativeQuestions = await resolveAuthoritativeQuestions(numExamId);

    // Bangun map `opsi_original_map` dari clientQuestionsMeta agar jawaban teracak tetap bisa dipetakan ke kunci kanonik server
    const metaOptionMap = new Map<string, Record<string, string>>();
    if (Array.isArray(clientQuestionsMeta)) {
      for (const m of clientQuestionsMeta) {
        if (m?.id && m?.opsi_original_map) {
          metaOptionMap.set(String(m.id), m.opsi_original_map);
        }
      }
    }

    let finalOutcome: any = null;

    if (authoritativeQuestions.length > 0) {
      const mergedQuestionsForStudent = authoritativeQuestions.map((q) => {
        const clientMap = metaOptionMap.get(String(q.id));
        if (!clientMap) return q;
        return {
          ...q,
          data_opsi: {
            ...(q.data_opsi || {}),
            opsi_original_map: clientMap,
          },
        };
      });

      // Filter hanya soal aktif atau yang dijawab siswa (jika soal di-versioning saat ujian berlangsung, versi lama tetap valid)
      const submittedIds = new Set(Object.keys(jawabanSiswa || {}));
      const gradingQuestions = mergedQuestionsForStudent.filter(
        (q) => !q.is_archived_version || submittedIds.has(String(q.id))
      );

      const canonicalAnswers = mapStudentAnswersToCanonicalKeys(
        gradingQuestions,
        jawabanSiswa
      );
      const scoreSummary = calculateExamScore(gradingQuestions, canonicalAnswers);
      const aiAnalysis = buildHumaneAnalysisForResult({
        studentName: String(studentName || `Siswa #${numStudentId}`),
        questions: gradingQuestions,
        canonicalAnswers,
        scoreSummary,
        finalScore: scoreSummary.normalizedScore,
        finalKategori: scoreSummary.kategoriNilai,
        existingAi: null,
      });

      // Coba simpan ke PostgreSQL jika tersedia
      let pgResult: any = null;
      try {
        const pgSaved = await submitStudentExamResult(
          numStudentId,
          numExamId,
          canonicalAnswers,
          Number(pelanggaranTab) || 0
        );
        pgResult = pgSaved?.result || null;
      } catch {
        // Firestore remains primary
      }

      const resultId = pgResult?.id || Number(`${Date.now()}${String(numStudentId).slice(-2)}`);

      // Perbarui Singleton Live Session di server (`live_sessions/ujian_${examId}`)
      await upsertLiveSessionParticipantServer(
        numExamId,
        String(judulUjian || ''),
        {
          student_id: numStudentId,
          nama: String(studentName || `Siswa #${numStudentId}`),
          kelas: String(studentKelas || '-'),
          kode_paket: String(kodePaket || 'PAKET-A'),
          status_ujian: 'Selesai',
          current_question_no: gradingQuestions.length,
          answered_count: answeredKeys.length,
          total_questions: gradingQuestions.length,
          remaining_seconds: 0,
          is_fullscreen: false,
          is_focused: true,
          devtools_open: false,
          tab_violations: Number(pelanggaranTab) || 0,
          inspect_attempts: 0,
          last_action: `SELESAI UJIAN (Server Graded) · NILAI: ${scoreSummary.normalizedScore}/100 [RES:${resultId}]`,
          last_active_at: new Date().toISOString(),
        }
      );

      finalOutcome = {
        authoritativeServerGraded: true,
        result: pgResult || {
          id: resultId,
          student_id: numStudentId,
          exam_id: numExamId,
          skor_angka: scoreSummary.normalizedScore,
          jawaban_siswa: canonicalAnswers,
          analisis_ai: aiAnalysis,
          pelanggaran_tab: Number(pelanggaranTab) || 0,
          created_at: new Date().toISOString(),
        },
        scoreSummary,
        canonicalAnswers,
        aiAnalysis,
      };
    } else {
      // Fallback jika PG & Vault kosong
      const outcome = await submitStudentExamResult(
        numStudentId,
        numExamId,
        jawabanSiswa,
        Number(pelanggaranTab) || 0
      );
      finalOutcome = {
        ...outcome,
        authoritativeServerGraded: false,
      };
    }

    res.json(finalOutcome);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal mengirim jawaban ujian.' });
  }
});

// POST /api/results/recalculate - Recalculate all existing student exam results using the Humane PG Kompleks formula
app.post('/api/results/recalculate', async (_req, res) => {
  try {
    const outcome = await recalculateAllDatabaseResults();
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
  });
}

startServer();
