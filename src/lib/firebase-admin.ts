import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(
  adminApp,
  firebaseConfig.firestoreDatabaseId
);

const DEFAULT_ADMIN_UID = 'sahidin30@gmail.com';

export interface DashboardSnapshot {
  exams: any[];
  students: any[];
  questions: any[];
  results: any[];
}

export async function syncCbtStateToFirestore(
  data: DashboardSnapshot,
  eventDescription: string = 'Sinkronisasi otomatis sistem CBT'
) {
  const nowIso = new Date().toISOString();

  try {
    const batch = adminDb.batch();

    // 1. Update real-time sync pulse document (/cbt_sync/live_state)
    const pulseRef = adminDb.collection('cbt_sync').doc('live_state');
    const pulsePayload = {
      lastSyncedAt: nowIso,
      lastEvent: eventDescription.slice(0, 200),
      totalExams: data.exams.length,
      totalStudents: data.students.length,
      totalQuestions: data.questions.length,
      totalResults: data.results.length,
      authorUid: DEFAULT_ADMIN_UID,
    };
    batch.set(pulseRef, pulsePayload);

    // 2. Sync Exams (/exams/{id})
    for (const ex of data.exams) {
      const docRef = adminDb.collection('exams').doc(String(ex.id));
      batch.set(
        docRef,
        {
          id: Number(ex.id),
          judul_ujian: String(ex.judul_ujian || '').slice(0, 200),
          durasi_menit: Number(ex.durasi_menit) || 60,
          target_tingkat: String(ex.target_tingkat || 'SEMUA').slice(0, 16),
          target_kelas: String(ex.target_kelas || 'SEMUA').slice(0, 64),
          authorUid: DEFAULT_ADMIN_UID,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }

    // 3. Sync Students (/students/{id})
    for (const st of data.students) {
      const docRef = adminDb.collection('students').doc(String(st.id));
      batch.set(
        docRef,
        {
          id: Number(st.id),
          nama: String(st.nama || '').slice(0, 150),
          kelas: String(st.kelas || '').slice(0, 64),
          token_ujian: String(st.token_ujian || '').slice(0, 6),
          status_ujian: String(st.status_ujian || 'Belum Mulai').slice(0, 32),
          authorUid: DEFAULT_ADMIN_UID,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }

    // 4. Sync Questions (/questions/{id}) including full data_opsi & kunci_jawaban
    for (const q of data.questions) {
      const docRef = adminDb.collection('questions').doc(String(q.id));
      batch.set(
        docRef,
        {
          id: Number(q.id),
          exam_id: Number(q.exam_id),
          teks_soal: String(q.teks_soal || '').slice(0, 4000),
          tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
          data_opsi: q.data_opsi || { wacana: '', opsi: { A: '', B: '', C: '', D: '', E: '' } },
          kunci_jawaban: Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : ['A'],
          bobot: Number(q.bobot) || 2,
          authorUid: DEFAULT_ADMIN_UID,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }

    // 5. Sync Results (/results/{id}) including full jawaban_siswa & analisis_ai
    for (const r of data.results) {
      const docRef = adminDb.collection('results').doc(String(r.id));
      batch.set(
        docRef,
        {
          id: Number(r.id),
          student_id: Number(r.student_id),
          exam_id: Number(r.exam_id),
          skor_angka: Number(r.skor_angka) || 0,
          jawaban_siswa: r.jawaban_siswa || {},
          analisis_ai: r.analisis_ai || null,
          pelanggaran_tab: Number(r.pelanggaran_tab) || 0,
          created_at: r.created_at
            ? new Date(r.created_at).toISOString()
            : nowIso,
          authorUid: DEFAULT_ADMIN_UID,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }

    await batch.commit();

    return {
      synced: true,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      pulse: pulsePayload,
    };
  } catch (error: any) {
    console.warn('Firestore sync warning:', error?.message || error);
    return {
      synced: false,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      error: error?.message || 'Gagal sinkronisasi ke Firestore',
    };
  }
}

export async function removeDeletedDocFromFirestore(
  collectionName: 'exams' | 'students' | 'questions' | 'results',
  docId: number | string
) {
  try {
    await adminDb.collection(collectionName).doc(String(docId)).delete();
  } catch (error: any) {
    console.warn(
      `Warning deleting ${collectionName}/${docId} from Firestore:`,
      error?.message
    );
  }
}

export async function getFirestoreSyncStatus(fallbackData: DashboardSnapshot) {
  try {
    const pulseSnap = await adminDb
      .collection('cbt_sync')
      .doc('live_state')
      .get();

    if (!pulseSnap.exists) {
      const seeded = await syncCbtStateToFirestore(
        fallbackData,
        'Inisialisasi koneksi Firebase Firestore'
      );
      return {
        connected: seeded.synced,
        databaseId: firebaseConfig.firestoreDatabaseId,
        projectId: firebaseConfig.projectId,
        pulse: seeded.pulse || {
          lastSyncedAt: new Date().toISOString(),
          lastEvent: 'Siap Sinkronisasi',
          totalExams: fallbackData.exams.length,
          totalStudents: fallbackData.students.length,
          totalQuestions: fallbackData.questions.length,
          totalResults: fallbackData.results.length,
          authorUid: DEFAULT_ADMIN_UID,
        },
      };
    }

    return {
      connected: true,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      pulse: pulseSnap.data(),
    };
  } catch (error: any) {
    return {
      connected: false,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      error: error?.message || 'Firestore belum terjangkau',
      pulse: {
        lastSyncedAt: new Date().toISOString(),
        lastEvent: 'Mode Lokal PostgreSQL',
        totalExams: fallbackData.exams.length,
        totalStudents: fallbackData.students.length,
        totalQuestions: fallbackData.questions.length,
        totalResults: fallbackData.results.length,
        authorUid: DEFAULT_ADMIN_UID,
      },
    };
  }
}
