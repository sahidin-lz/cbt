import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  CbtSyncPulseData,
  OperationType,
  handleFirestoreError,
} from './firebase';

function cbtCollectionQuery(collectionName: 'exams' | 'students' | 'questions' | 'results') {
  return query(collection(db!, collectionName), where('id', '>=', 1));
}
import {
  ExamItem,
  QuestionItem,
  StudentItem,
  StudentLiveTelemetry,
  ResultItem,
  AnalisisAI,
} from '../types/cbt';
import {
  parseQuestionsCsv,
  parseStudentsCsv,
  generateExamToken,
  isExamMatchedForStudentClass,
  calculateExamScore,
  normalizeAnswerKeys,
  resolveProportionalStudentExamPackage,
  mapStudentAnswersToCanonicalKeys,
  resolveSyncedStudentAnswersForExam,
  recalculateHistoricalResults,
  getEffectiveExamSessionToken,
  ExamScoreSummary,
} from '../utils/cbtLogic';

function buildCleanExamFirestoreDoc(ex: ExamItem, nowIso: string): Record<string, any> {
  const docObj: Record<string, any> = {
    id: Number(ex.id),
    judul_ujian: String(ex.judul_ujian || '').slice(0, 200),
    durasi_menit: Math.max(1, Math.min(300, Number(ex.durasi_menit) || 60)),
    target_tingkat: String(ex.target_tingkat || 'SEMUA').slice(0, 16),
    target_kelas: String(ex.target_kelas || 'SEMUA').slice(0, 64),
    authorUid: 'sahidin30@gmail.com',
    updatedAt: nowIso,
  };
  if (ex.kategori_ujian) docObj.kategori_ujian = String(ex.kategori_ujian).slice(0, 64);
  if (ex.status_ujian) docObj.status_ujian = String(ex.status_ujian).slice(0, 32);
  if (Array.isArray(ex.target_rombel)) docObj.target_rombel = ex.target_rombel.slice(0, 50);
  if (ex.jadwal_mulai) docObj.jadwal_mulai = String(ex.jadwal_mulai).slice(0, 64);
  if (ex.jadwal_selesai) docObj.jadwal_selesai = String(ex.jadwal_selesai).slice(0, 64);
  if (ex.acak_soal !== undefined) docObj.acak_soal = Boolean(ex.acak_soal);
  if (ex.acak_opsi !== undefined) docObj.acak_opsi = Boolean(ex.acak_opsi);
  if (ex.kode_paket) docObj.kode_paket = String(ex.kode_paket).slice(0, 32);
  if (ex.mode_multi_paket !== undefined) docObj.mode_multi_paket = Boolean(ex.mode_multi_paket);
  if (ex.jumlah_paket !== undefined) docObj.jumlah_paket = Math.max(1, Math.min(10, Number(ex.jumlah_paket) || 2));
  const effectiveTokenSesi = (ex.token_sesi || getEffectiveExamSessionToken(ex)).trim().toUpperCase().slice(0, 20);
  if (effectiveTokenSesi) docObj.token_sesi = effectiveTokenSesi;
  if (ex.tampilkan_nilai !== undefined) docObj.tampilkan_nilai = Boolean(ex.tampilkan_nilai);
  if (ex.pengumuman !== undefined && String(ex.pengumuman).trim() !== '') {
    docObj.pengumuman = String(ex.pengumuman).trim().slice(0, 600);
  }
  if (ex.mata_pelajaran !== undefined && String(ex.mata_pelajaran).trim() !== '') {
    docObj.mata_pelajaran = String(ex.mata_pelajaran).trim().slice(0, 80);
  }
  if (ex.distribusi_paket_mode !== undefined && String(ex.distribusi_paket_mode).trim() !== '') {
    docObj.distribusi_paket_mode = String(ex.distribusi_paket_mode).trim().slice(0, 40);
  }
  if (Array.isArray(ex.target_siswa_ids)) {
    docObj.target_siswa_ids = ex.target_siswa_ids
      .map((id) => Number(id))
      .filter((id) => !isNaN(id) && id > 0)
      .slice(0, 1000);
  }
  return docObj;
}

function buildCleanStudentFirestoreDoc(st: StudentItem, nowIso: string): Record<string, any> {
  const validToken = /^[A-Z0-9]{6}$/.test((st.token_ujian || '').toUpperCase().trim())
    ? st.token_ujian.toUpperCase().trim()
    : generateExamToken(Number(st.id) || 1);
  const docObj: Record<string, any> = {
    id: Number(st.id),
    nama: String(st.nama || '').slice(0, 150),
    kelas: String(st.kelas || '').slice(0, 64),
    token_ujian: validToken,
    status_ujian: String(st.status_ujian || 'Belum Mulai').slice(0, 32),
    authorUid: 'sahidin30@gmail.com',
    updatedAt: nowIso,
  };
  if (st.kode_soal) docObj.kode_soal = String(st.kode_soal).slice(0, 64);
  if (st.variasi_paket) docObj.variasi_paket = String(st.variasi_paket).slice(0, 64);
  if (st.nisn !== undefined && String(st.nisn).trim() !== '') {
    docObj.nisn = String(st.nisn).trim().slice(0, 40);
  }
  if (st.password_login !== undefined && String(st.password_login).trim() !== '') {
    docObj.password_login = String(st.password_login).trim().slice(0, 40);
  }
  if (st.live_telemetry && typeof st.live_telemetry === 'object') {
    const rawTel = st.live_telemetry;
    const cleanTel: Record<string, any> = {};
    if (rawTel.exam_id !== undefined) cleanTel.exam_id = Number(rawTel.exam_id) || 0;
    if (rawTel.judul_ujian) cleanTel.judul_ujian = String(rawTel.judul_ujian).slice(0, 120);
    if (rawTel.kode_paket) cleanTel.kode_paket = String(rawTel.kode_paket).slice(0, 32);
    if (rawTel.current_question_no !== undefined) {
      cleanTel.current_question_no = Math.max(0, Number(rawTel.current_question_no) || 0);
    }
    if (rawTel.answered_count !== undefined) {
      cleanTel.answered_count = Math.max(0, Number(rawTel.answered_count) || 0);
    }
    if (rawTel.total_questions !== undefined) {
      cleanTel.total_questions = Math.max(0, Number(rawTel.total_questions) || 0);
    }
    if (rawTel.remaining_seconds !== undefined) {
      cleanTel.remaining_seconds = Math.max(0, Number(rawTel.remaining_seconds) || 0);
    }
    if (rawTel.is_fullscreen !== undefined) cleanTel.is_fullscreen = Boolean(rawTel.is_fullscreen);
    if (rawTel.is_focused !== undefined) cleanTel.is_focused = Boolean(rawTel.is_focused);
    if (rawTel.devtools_open !== undefined) cleanTel.devtools_open = Boolean(rawTel.devtools_open);
    if (rawTel.tab_violations !== undefined) {
      cleanTel.tab_violations = Math.max(0, Number(rawTel.tab_violations) || 0);
    }
    if (rawTel.inspect_attempts !== undefined) {
      cleanTel.inspect_attempts = Math.max(0, Number(rawTel.inspect_attempts) || 0);
    }
    if (rawTel.last_action) cleanTel.last_action = String(rawTel.last_action).slice(0, 200);
    if (rawTel.last_active_at) cleanTel.last_active_at = String(rawTel.last_active_at).slice(0, 64);
    if (rawTel.device_info) cleanTel.device_info = String(rawTel.device_info).slice(0, 120);
    if (Array.isArray(rawTel.recent_logs)) {
      cleanTel.recent_logs = rawTel.recent_logs.slice(-12).map((l) => ({
        timestamp: String(l?.timestamp || '').slice(0, 32),
        action: String(l?.action || '').slice(0, 32),
        detail: String(l?.detail || '').slice(0, 180),
      }));
    }
    docObj.live_telemetry = cleanTel;
  }
  return docObj;
}

/**
 * Safely calls a backend API endpoint and returns parsed JSON only if the server
 * actually responds with application/json. Prevents "Unexpected token 'T', 'The page c'..."
 * errors when deployed as a static SPA on Vercel where /api/* routes return 404 text/html.
 */
export async function safeApiJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; isApiAvailable: boolean }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return { ok: false, status: res.status, data: null, isApiAvailable: false };
    }
    const parsed = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data: parsed, isApiAvailable: true };
  } catch {
    return { ok: false, status: 0, data: null, isApiAvailable: false };
  }
}

const OFFLINE_CACHE_KEY = 'cbt_offline_cache_v1';

let cachedCollectionCounts = {
  exams: 0,
  students: 0,
  questions: 0,
  results: 0,
};

export function saveLocalCbtSnapshotCache(snapshot: {
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}): void {
  const total =
    (snapshot.exams?.length || 0) +
    (snapshot.students?.length || 0) +
    (snapshot.questions?.length || 0) +
    (snapshot.results?.length || 0);
  if (total === 0) return;

  cachedCollectionCounts = {
    exams: snapshot.exams?.length || 0,
    students: snapshot.students?.length || 0,
    questions: snapshot.questions?.length || 0,
    results: snapshot.results?.length || 0,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        OFFLINE_CACHE_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          exams: snapshot.exams || [],
          students: snapshot.students || [],
          questions: snapshot.questions || [],
          results: snapshot.results || [],
        })
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalCbtSnapshotCache(): {
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
} | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const exams = Array.isArray(parsed.exams) ? parsed.exams : [];
    const students = Array.isArray(parsed.students) ? parsed.students : [];
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    if (
      exams.length + students.length + questions.length + results.length ===
      0
    ) {
      return null;
    }
    return { exams, students, questions, results };
  } catch {
    return null;
  }
}

async function updateFirestorePulse(
  eventText: string,
  counts?: {
    exams?: number;
    students?: number;
    questions?: number;
    results?: number;
  }
) {
  if (!db) return null;
  const nowIso = new Date().toISOString();
  try {
    const pulse: CbtSyncPulseData = {
      lastSyncedAt: nowIso,
      lastEvent: eventText.slice(0, 200),
      totalExams: counts?.exams ?? cachedCollectionCounts.exams,
      totalStudents: counts?.students ?? cachedCollectionCounts.students,
      totalQuestions: counts?.questions ?? cachedCollectionCounts.questions,
      totalResults: counts?.results ?? cachedCollectionCounts.results,
      authorUid: 'sahidin30@gmail.com',
    };

    await setDoc(doc(db, 'cbt_sync', 'live_state'), pulse);
    return pulse;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, 'cbt_sync/live_state');
    } catch {
      // Logged
    }
    return null;
  }
}

export async function fetchAllFromFirestore(): Promise<{
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
} | null> {
  if (!db) return null;
  try {
    const [exSnap, stSnap, qSnap, rSnap] = await Promise.all([
      getDocs(cbtCollectionQuery('exams')),
      getDocs(cbtCollectionQuery('students')),
      getDocs(cbtCollectionQuery('questions')),
      getDocs(cbtCollectionQuery('results')),
    ]);

    const exams: ExamItem[] = exSnap.docs
      .map((d) => d.data() as ExamItem)
      .sort((a, b) => b.id - a.id);

    const students: StudentItem[] = stSnap.docs
      .map((d) => d.data() as StudentItem)
      .sort((a, b) => b.id - a.id);

    const questions: QuestionItem[] = qSnap.docs
      .map((d) => {
        const raw = d.data() as any;
        return {
          id: Number(raw.id),
          exam_id: Number(raw.exam_id),
          teks_soal: String(raw.teks_soal || ''),
          tipe_soal: raw.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
          data_opsi: raw.data_opsi || {
            wacana: '',
            opsi: { A: '', B: '', C: '', D: '', E: '' },
          },
          kunci_jawaban: Array.isArray(raw.kunci_jawaban)
            ? raw.kunci_jawaban
            : ['A'],
          bobot: Number(raw.bobot) || 2,
        } satisfies QuestionItem;
      })
      .sort((a, b) => a.id - b.id);

    const results: ResultItem[] = rSnap.docs
      .map((d) => {
        const raw = d.data() as any;
        return {
          id: Number(raw.id),
          student_id: Number(raw.student_id),
          exam_id: Number(raw.exam_id),
          skor_angka: Number(raw.skor_angka) || 0,
          jawaban_siswa: raw.jawaban_siswa || {},
          analisis_ai: raw.analisis_ai || null,
          pelanggaran_tab: Number(raw.pelanggaran_tab) || 0,
          created_at: raw.created_at || raw.updatedAt || new Date().toISOString(),
        } satisfies ResultItem;
      })
      .sort((a, b) => b.id - a.id);

    const validExamIds = new Set(exams.map((e) => Number(e.id)));
    const validStudentIds = new Set(students.map((s) => Number(s.id)));

    const orphanedQuestionDocs = qSnap.docs.filter((d) => {
      const raw = d.data() as any;
      return !validExamIds.has(Number(raw.exam_id));
    });
    const orphanedResultDocs = rSnap.docs.filter((d) => {
      const raw = d.data() as any;
      return (
        !validExamIds.has(Number(raw.exam_id)) ||
        !validStudentIds.has(Number(raw.student_id))
      );
    });

    if (orphanedQuestionDocs.length > 0 || orphanedResultDocs.length > 0) {
      const cleanupBatch = writeBatch(db);
      orphanedQuestionDocs.forEach((d) => cleanupBatch.delete(d.ref));
      orphanedResultDocs.forEach((d) => cleanupBatch.delete(d.ref));
      cleanupBatch.commit().catch(() => {});
    }

    const validQuestions = questions.filter((q) =>
      validExamIds.has(Number(q.exam_id))
    );
    const validResults = results.filter(
      (r) =>
        validExamIds.has(Number(r.exam_id)) &&
        validStudentIds.has(Number(r.student_id))
    );

    // Recalculate historical student results in-memory using the Humane & Anti-Guessing formula
    const recalc = recalculateHistoricalResults({
      results: validResults,
      students,
      exams,
      questions: validQuestions,
    });

    const bundle = {
      exams,
      students,
      questions: validQuestions,
      results: recalc.results,
    };
    saveLocalCbtSnapshotCache(bundle);
    return bundle;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, 'exams|students|questions|results');
    } catch {
      // Logged
    }
    return null;
  }
}

export async function persistRecalculatedResultsToFirestore(
  changedResults: ResultItem[]
): Promise<number> {
  if (!db || changedResults.length === 0) return 0;
  const nowIso = new Date().toISOString();
  let persisted = 0;

  // Commit in batches of up to 400 documents
  const chunkSize = 400;
  for (let i = 0; i < changedResults.length; i += chunkSize) {
    const slice = changedResults.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const r of slice) {
      const resultDoc: Record<string, any> = {
        id: Number(r.id),
        student_id: Number(r.student_id),
        exam_id: Number(r.exam_id),
        skor_angka: Number(r.skor_angka) || 0,
        jawaban_siswa: r.jawaban_siswa || {},
        analisis_ai: r.analisis_ai || null,
        pelanggaran_tab: Number(r.pelanggaran_tab) || 0,
        created_at: r.created_at || nowIso,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      };
      if (r.kode_soal) {
        resultDoc.kode_soal = String(r.kode_soal).slice(0, 64);
      }
      batch.set(doc(db, 'results', String(r.id)), resultDoc);
      persisted++;
    }
    await batch.commit();
  }

  return persisted;
}

export async function recalculateAndSyncAllResultsCbt(params: {
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}): Promise<{
  updatedCount: number;
  totalResults: number;
  results: ResultItem[];
}> {
  const recalc = recalculateHistoricalResults({
    results: params.results,
    students: params.students,
    exams: params.exams,
    questions: params.questions,
  });

  await safeApiJson('/api/results/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (recalc.changedResults.length > 0 && db) {
    await persistRecalculatedResultsToFirestore(recalc.changedResults);
    await updateFirestorePulse(
      `Formula Nilai Humanis diterapkan: ${recalc.updatedCount} nilai siswa diperbarui otomatis`
    );
  }

  return {
    updatedCount: recalc.updatedCount,
    totalResults: recalc.results.length,
    results: recalc.results,
  };
}

export async function pushSnapshotToFirestoreClient(
  data: {
    exams: ExamItem[];
    students: StudentItem[];
    questions: QuestionItem[];
    results: ResultItem[];
  },
  eventDescription: string
): Promise<CbtSyncPulseData | null> {
  if (!db) return null;
  const nowIso = new Date().toISOString();
  try {
    const batch = writeBatch(db);

    for (const ex of data.exams) {
      batch.set(doc(db, 'exams', String(ex.id)), buildCleanExamFirestoreDoc(ex, nowIso), { merge: true });
    }

    for (const st of data.students) {
      batch.set(doc(db, 'students', String(st.id)), buildCleanStudentFirestoreDoc(st, nowIso), { merge: true });
    }

    for (const q of data.questions) {
      batch.set(doc(db, 'questions', String(q.id)), {
        id: Number(q.id),
        exam_id: Number(q.exam_id),
        teks_soal: String(q.teks_soal || '').slice(0, 4000),
        tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
        data_opsi: q.data_opsi || {
          wacana: '',
          opsi: { A: '', B: '', C: '', D: '', E: '' },
        },
        kunci_jawaban: Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : ['A'],
        bobot: Number(q.bobot) || 2,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    }

    for (const r of data.results) {
      batch.set(doc(db, 'results', String(r.id)), {
        id: Number(r.id),
        student_id: Number(r.student_id),
        exam_id: Number(r.exam_id),
        skor_angka: Number(r.skor_angka) || 0,
        jawaban_siswa: r.jawaban_siswa || {},
        analisis_ai: r.analisis_ai || null,
        pelanggaran_tab: Number(r.pelanggaran_tab) || 0,
        created_at: r.created_at || nowIso,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    }

    const pulse: CbtSyncPulseData = {
      lastSyncedAt: nowIso,
      lastEvent: eventDescription.slice(0, 200),
      totalExams: data.exams.length,
      totalStudents: data.students.length,
      totalQuestions: data.questions.length,
      totalResults: data.results.length,
      authorUid: 'sahidin30@gmail.com',
    };
    batch.set(doc(db, 'cbt_sync', 'live_state'), pulse);

    await batch.commit();
    return pulse;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, 'batch_sync');
    } catch {
      // Logged
    }
    return null;
  }
}

export async function loadUnifiedDashboardData(): Promise<{
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}> {
  const [apiRes, firestoreData] = await Promise.all([
    safeApiJson<{
      exams: ExamItem[];
      students: StudentItem[];
      questions: QuestionItem[];
      results: ResultItem[];
    }>('/api/dashboard'),
    fetchAllFromFirestore(),
  ]);

  if (apiRes.isApiAvailable && apiRes.ok && apiRes.data) {
    const apiTotal =
      (apiRes.data.exams?.length || 0) +
      (apiRes.data.students?.length || 0) +
      (apiRes.data.questions?.length || 0) +
      (apiRes.data.results?.length || 0);
    const fsTotal =
      (firestoreData?.exams.length || 0) +
      (firestoreData?.students.length || 0) +
      (firestoreData?.questions.length || 0) +
      (firestoreData?.results.length || 0);

    // If Firestore has data and local API is empty, return Firestore data
    if (apiTotal === 0 && fsTotal > 0 && firestoreData) {
      return firestoreData;
    }

    // Merge rich Firestore fields (token_sesi, status_ujian, kategori_ujian, tampilkan_nilai, pengumuman, nisn, password_login, kode_soal)
    const fsExamMap = new Map<number, ExamItem>(
      (firestoreData?.exams || []).map((e) => [Number(e.id), e])
    );
    const fsStudentMap = new Map<number, StudentItem>(
      (firestoreData?.students || []).map((s) => [Number(s.id), s])
    );

    const mergedExams = (apiRes.data.exams || []).map((apiEx) => {
      const fsEx = fsExamMap.get(Number(apiEx.id));
      const combined: ExamItem = {
        ...fsEx,
        ...apiEx,
        status_ujian: fsEx?.status_ujian || apiEx.status_ujian || 'AKTIF',
        kategori_ujian: fsEx?.kategori_ujian || apiEx.kategori_ujian,
        target_rombel: fsEx?.target_rombel || apiEx.target_rombel,
        kode_paket: fsEx?.kode_paket || apiEx.kode_paket,
        acak_soal: fsEx?.acak_soal ?? apiEx.acak_soal,
        acak_opsi: fsEx?.acak_opsi ?? apiEx.acak_opsi,
        mode_multi_paket: fsEx?.mode_multi_paket ?? apiEx.mode_multi_paket,
        jumlah_paket: fsEx?.jumlah_paket ?? apiEx.jumlah_paket,
        token_sesi: fsEx?.token_sesi || apiEx.token_sesi || getEffectiveExamSessionToken(apiEx),
        tampilkan_nilai: fsEx?.tampilkan_nilai ?? apiEx.tampilkan_nilai ?? true,
        pengumuman: fsEx?.pengumuman ?? apiEx.pengumuman,
        mata_pelajaran: fsEx?.mata_pelajaran || apiEx.mata_pelajaran || 'Sosiologi',
        distribusi_paket_mode:
          fsEx?.distribusi_paket_mode ||
          apiEx.distribusi_paket_mode ||
          'OTOMATIS_GANJIL_GENAP',
        target_siswa_ids: fsEx?.target_siswa_ids || apiEx.target_siswa_ids || [],
      };
      return combined;
    });

    const mergedStudents = (apiRes.data.students || []).map((apiSt) => {
      const fsSt = fsStudentMap.get(Number(apiSt.id));
      return {
        ...fsSt,
        ...apiSt,
        kode_soal: fsSt?.kode_soal || apiSt.kode_soal,
        variasi_paket: fsSt?.variasi_paket || apiSt.variasi_paket,
        nisn: fsSt?.nisn || apiSt.nisn,
        password_login: fsSt?.password_login || apiSt.password_login,
      } satisfies StudentItem;
    });

    const mergedBundle = {
      exams: mergedExams,
      students: mergedStudents,
      questions:
        (apiRes.data.questions?.length || 0) > 0
          ? apiRes.data.questions
          : firestoreData?.questions || [],
      results:
        (apiRes.data.results?.length || 0) > 0
          ? apiRes.data.results
          : firestoreData?.results || [],
    };
    const mergedTotal =
      mergedBundle.exams.length +
      mergedBundle.students.length +
      mergedBundle.questions.length +
      mergedBundle.results.length;

    if (mergedTotal > 0) {
      saveLocalCbtSnapshotCache(mergedBundle);
      return mergedBundle;
    }
  }

  if (firestoreData) {
    const fsTotal =
      firestoreData.exams.length +
      firestoreData.students.length +
      firestoreData.questions.length +
      firestoreData.results.length;
    if (fsTotal > 0) {
      saveLocalCbtSnapshotCache(firestoreData);
      return firestoreData;
    }
  }

  const localFallback = loadLocalCbtSnapshotCache();
  if (localFallback) {
    return localFallback;
  }

  return {
    exams: [],
    students: [],
    questions: [],
    results: [],
  };
}

export function subscribeRealtimeFirestoreCollections(callbacks: {
  onExams?: (exams: ExamItem[]) => void;
  onStudents?: (students: StudentItem[]) => void;
  onQuestions?: (questions: QuestionItem[]) => void;
  onResults?: (results: ResultItem[]) => void;
}): Unsubscribe {
  if (!db) return () => {};
  const unsubs: Unsubscribe[] = [];

  if (callbacks.onExams) {
    unsubs.push(
      onSnapshot(
        cbtCollectionQuery('exams'),
        (snap) => {
          const items = snap.docs
            .map((d) => d.data() as ExamItem)
            .sort((a, b) => b.id - a.id);
          callbacks.onExams?.(items);
        },
        () => {}
      )
    );
  }

  if (callbacks.onStudents) {
    unsubs.push(
      onSnapshot(
        cbtCollectionQuery('students'),
        (snap) => {
          const items = snap.docs
            .map((d) => d.data() as StudentItem)
            .sort((a, b) => b.id - a.id);
          callbacks.onStudents?.(items);
        },
        () => {}
      )
    );
  }

  if (callbacks.onQuestions) {
    unsubs.push(
      onSnapshot(
        cbtCollectionQuery('questions'),
        (snap) => {
          const items = snap.docs
            .map((d) => {
              const raw = d.data() as any;
              return {
                id: Number(raw.id),
                exam_id: Number(raw.exam_id),
                teks_soal: String(raw.teks_soal || ''),
                tipe_soal: raw.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
                data_opsi: raw.data_opsi || {
                  wacana: '',
                  opsi: { A: '', B: '', C: '', D: '', E: '' },
                },
                kunci_jawaban: Array.isArray(raw.kunci_jawaban)
                  ? raw.kunci_jawaban
                  : ['A'],
                bobot: Number(raw.bobot) || 2,
              } satisfies QuestionItem;
            })
            .sort((a, b) => a.id - b.id);
          callbacks.onQuestions?.(items);
        },
        () => {}
      )
    );
  }

  if (callbacks.onResults) {
    unsubs.push(
      onSnapshot(
        cbtCollectionQuery('results'),
        (snap) => {
          const items = snap.docs
            .map((d) => {
              const raw = d.data() as any;
              return {
                id: Number(raw.id),
                student_id: Number(raw.student_id),
                exam_id: Number(raw.exam_id),
                skor_angka: Number(raw.skor_angka) || 0,
                jawaban_siswa: raw.jawaban_siswa || {},
                analisis_ai: raw.analisis_ai || null,
                pelanggaran_tab: Number(raw.pelanggaran_tab) || 0,
                created_at:
                  raw.created_at || raw.updatedAt || new Date().toISOString(),
              } satisfies ResultItem;
            })
            .sort((a, b) => b.id - a.id);
          callbacks.onResults?.(items);
        },
        () => {}
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

// ============================================================================
// UNIFIED CBT MUTATIONS (WORKS ON BOTH VERCEL & AI STUDIO SERVER)
// ============================================================================

export async function saveExamCbt(
  payload: {
    judul_ujian: string;
    durasi_menit: number;
    target_tingkat: string;
    target_kelas: string;
    kategori_ujian?: string;
    status_ujian?: string;
    target_rombel?: string[];
    jadwal_mulai?: string;
    jadwal_selesai?: string;
    acak_soal?: boolean;
    acak_opsi?: boolean;
    kode_paket?: string;
    mode_multi_paket?: boolean;
    jumlah_paket?: number;
    token_sesi?: string;
    tampilkan_nilai?: boolean;
    pengumuman?: string;
    mata_pelajaran?: string;
    distribusi_paket_mode?: string;
    target_siswa_ids?: number[];
  },
  editingExamId?: number | null
): Promise<ExamItem> {
  const apiUrl = editingExamId ? `/api/exams/${editingExamId}` : '/api/exams';
  const apiMethod = editingExamId ? 'PUT' : 'POST';

  const apiRes = await safeApiJson<{ exam?: ExamItem; error?: string }>(apiUrl, {
    method: apiMethod,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const nowIso = new Date().toISOString();
  const baseId = apiRes.ok && apiRes.data?.exam ? apiRes.data.exam.id : editingExamId || Date.now();
  const cleanTokenSesi =
    (payload.token_sesi || '').trim().toUpperCase() ||
    getEffectiveExamSessionToken({
      id: baseId,
      judul_ujian: payload.judul_ujian,
      target_tingkat: payload.target_tingkat,
    });

  const examRecord: ExamItem = {
    ...(apiRes.ok && apiRes.data?.exam ? apiRes.data.exam : {}),
    id: baseId,
    judul_ujian: payload.judul_ujian.trim(),
    durasi_menit: Math.max(5, Number(payload.durasi_menit) || 60),
    target_tingkat: payload.target_tingkat || 'SEMUA',
    target_kelas: payload.target_kelas || 'SEMUA',
    kategori_ujian: payload.kategori_ujian || 'Penilaian Harian (PH / Kuis)',
    status_ujian: payload.status_ujian || 'DRAF',
    target_rombel: Array.isArray(payload.target_rombel) ? payload.target_rombel : [],
    jadwal_mulai: payload.jadwal_mulai || '',
    jadwal_selesai: payload.jadwal_selesai || '',
    acak_soal: payload.acak_soal !== undefined ? payload.acak_soal : true,
    acak_opsi: payload.acak_opsi !== undefined ? payload.acak_opsi : true,
    kode_paket: payload.kode_paket?.trim() || 'PAKET-A',
    mode_multi_paket: Boolean(payload.mode_multi_paket),
    jumlah_paket: Number(payload.jumlah_paket) || 2,
    token_sesi: cleanTokenSesi,
    tampilkan_nilai: payload.tampilkan_nilai !== undefined ? Boolean(payload.tampilkan_nilai) : true,
    pengumuman: payload.pengumuman?.trim() || '',
    mata_pelajaran: payload.mata_pelajaran?.trim() || 'Sosiologi',
    distribusi_paket_mode:
      payload.distribusi_paket_mode?.trim() || 'OTOMATIS_GANJIL_GENAP',
    target_siswa_ids: Array.isArray(payload.target_siswa_ids)
      ? payload.target_siswa_ids.map((id) => Number(id)).filter((id) => !isNaN(id))
      : [],
  };

  if (db) {
    await setDoc(
      doc(db, 'exams', String(examRecord.id)),
      buildCleanExamFirestoreDoc(examRecord, nowIso)
    );
    await updateFirestorePulse(
      `Paket ujian disimpan: [${examRecord.mata_pelajaran}] ${examRecord.judul_ujian} (Token: ${examRecord.token_sesi})`
    );
  }

  return examRecord;
}

export async function toggleExamStatusCbt(
  exam: ExamItem,
  nextStatus: 'AKTIF' | 'DRAF' | 'SELESAI'
): Promise<void> {
  const payload = {
    judul_ujian: exam.judul_ujian,
    durasi_menit: exam.durasi_menit,
    target_tingkat: exam.target_tingkat,
    target_kelas: exam.target_kelas,
    kategori_ujian: exam.kategori_ujian,
    status_ujian: nextStatus,
    target_rombel: exam.target_rombel,
    acak_soal: exam.acak_soal,
    acak_opsi: exam.acak_opsi,
    kode_paket: exam.kode_paket,
    mode_multi_paket: exam.mode_multi_paket,
    jumlah_paket: exam.jumlah_paket,
    token_sesi: exam.token_sesi || getEffectiveExamSessionToken(exam),
    tampilkan_nilai: exam.tampilkan_nilai !== false,
    pengumuman: exam.pengumuman || '',
    mata_pelajaran: exam.mata_pelajaran || 'Sosiologi',
    distribusi_paket_mode: exam.distribusi_paket_mode || 'OTOMATIS_GANJIL_GENAP',
    target_siswa_ids: exam.target_siswa_ids || [],
  };
  await saveExamCbt(payload, exam.id);
}

export async function updateExamSessionTokenCbt(
  exam: ExamItem,
  customSessionToken?: string
): Promise<ExamItem> {
  const nextToken =
    customSessionToken && customSessionToken.trim().length >= 4
      ? customSessionToken.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
      : generateExamToken();

  return await saveExamCbt(
    {
      judul_ujian: exam.judul_ujian,
      durasi_menit: exam.durasi_menit,
      target_tingkat: exam.target_tingkat,
      target_kelas: exam.target_kelas,
      kategori_ujian: exam.kategori_ujian,
      status_ujian: exam.status_ujian || 'AKTIF',
      target_rombel: exam.target_rombel,
      acak_soal: exam.acak_soal,
      acak_opsi: exam.acak_opsi,
      kode_paket: exam.kode_paket,
      mode_multi_paket: exam.mode_multi_paket,
      jumlah_paket: exam.jumlah_paket,
      token_sesi: nextToken,
      tampilkan_nilai: exam.tampilkan_nilai !== false,
      pengumuman: exam.pengumuman || '',
      mata_pelajaran: exam.mata_pelajaran || 'Sosiologi',
      distribusi_paket_mode: exam.distribusi_paket_mode || 'OTOMATIS_GANJIL_GENAP',
      target_siswa_ids: exam.target_siswa_ids || [],
    },
    exam.id
  );
}

export async function batchAssignPackageVariantsCbt(
  updatedStudents: StudentItem[]
): Promise<void> {
  if (updatedStudents.length === 0) return;

  await safeApiJson('/api/students/batch-variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students: updatedStudents }),
  });

  const firestoreDb = db;
  if (firestoreDb) {
    const batch = writeBatch(firestoreDb);
    const nowIso = new Date().toISOString();
    updatedStudents.forEach((st) => {
      batch.set(
        doc(firestoreDb, 'students', String(st.id)),
        buildCleanStudentFirestoreDoc(st, nowIso),
        { merge: true }
      );
    });
    await batch.commit();
    await updateFirestorePulse(
      `Distribusi multi-paket kode soal diperbarui untuk ${updatedStudents.length} siswa`
    );
  }
}

export async function deleteExamCbt(examId: number, title: string): Promise<void> {
  await safeApiJson(`/api/exams/${examId}`, { method: 'DELETE' });
  if (db) {
    const [qSnap, rSnap] = await Promise.all([
      getDocs(cbtCollectionQuery('questions')),
      getDocs(cbtCollectionQuery('results')),
    ]);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'exams', String(examId)));
    qSnap.docs.forEach((d) => {
      const raw = d.data() as any;
      if (Number(raw.exam_id) === Number(examId)) {
        batch.delete(d.ref);
      }
    });
    rSnap.docs.forEach((d) => {
      const raw = d.data() as any;
      if (Number(raw.exam_id) === Number(examId)) {
        batch.delete(d.ref);
      }
    });
    await batch.commit();
    await updateFirestorePulse(`Paket ujian "${title}" beserta soal terkait dihapus`);
  }
}

export async function saveStudentCbt(
  payload: { nama: string; kelas: string; nisn?: string; password_login?: string },
  editingStudentId?: number | null,
  existingStudent?: StudentItem
): Promise<StudentItem> {
  const apiUrl = editingStudentId
    ? `/api/students/${editingStudentId}`
    : '/api/students';
  const apiMethod = editingStudentId ? 'PUT' : 'POST';

  const apiRes = await safeApiJson<{ student?: StudentItem; error?: string }>(
    apiUrl,
    {
      method: apiMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  const nowIso = new Date().toISOString();
  const baseStudent: StudentItem =
    apiRes.ok && apiRes.data?.student
      ? apiRes.data.student
      : {
          id: editingStudentId || Date.now(),
          nama: payload.nama.trim(),
          kelas: payload.kelas.trim(),
          token_ujian: existingStudent?.token_ujian || generateExamToken(),
          status_ujian: existingStudent?.status_ujian || 'Belum Mulai',
        };

  const studentRecord: StudentItem = {
    ...existingStudent,
    ...baseStudent,
    nisn: payload.nisn !== undefined ? payload.nisn.trim() : existingStudent?.nisn,
    password_login:
      payload.password_login !== undefined
        ? payload.password_login.trim()
        : existingStudent?.password_login,
  };

  if (db) {
    await setDoc(
      doc(db, 'students', String(studentRecord.id)),
      buildCleanStudentFirestoreDoc(studentRecord, nowIso),
      { merge: true }
    );
    await updateFirestorePulse(
      `Data siswa disimpan: ${studentRecord.nama} (${studentRecord.kelas})`
    );
  }

  return studentRecord;
}

export async function updateStudentProfileAndPasswordCbt(
  student: StudentItem,
  payload: {
    nisn?: string;
    password_login: string;
    syncSystemToken?: boolean;
  }
): Promise<StudentItem> {
  const cleanPassword = (payload.password_login || '').trim();
  if (cleanPassword.length < 4 || cleanPassword.length > 32) {
    throw new Error('Password / Token Login Akun baru harus terdiri dari 4 hingga 32 karakter.');
  }

  const cleanNisn = payload.nisn !== undefined ? payload.nisn.trim().slice(0, 32) : student.nisn;
  const upperCandidate = cleanPassword.toUpperCase();
  const isSixCharAlnum = /^[A-Z0-9]{6}$/.test(upperCandidate);

  const nextSystemToken =
    payload.syncSystemToken && isSixCharAlnum ? upperCandidate : student.token_ujian;

  const updatedStudent: StudentItem = {
    ...student,
    nisn: cleanNisn,
    password_login: cleanPassword,
    token_ujian: nextSystemToken,
  };

  if (db) {
    const nowIso = new Date().toISOString();
    await setDoc(
      doc(db, 'students', String(updatedStudent.id)),
      buildCleanStudentFirestoreDoc(updatedStudent, nowIso),
      { merge: true }
    );
    await updateFirestorePulse(
      `Profil & Password Login diperbarui oleh siswa: ${updatedStudent.nama} (${updatedStudent.kelas})`
    );
  }

  return updatedStudent;
}

export async function uploadStudentsCsvCbt(
  csvText: string,
  replaceExisting: boolean,
  currentStudents: StudentItem[]
): Promise<{ insertedCount: number; students: StudentItem[] }> {
  const parsed = parseStudentsCsv(csvText);
  if (parsed.rows.length === 0) {
    throw new Error(
      parsed.errors.join(' | ') || 'Format CSV siswa tidak valid.'
    );
  }

  const apiRes = await safeApiJson<{
    insertedCount: number;
    students: StudentItem[];
    error?: string;
  }>('/api/students/upload-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvText, replaceExisting }),
  });

  const nowIso = new Date().toISOString();
  let insertedStudents: StudentItem[] = [];

  if (apiRes.ok && apiRes.data?.students) {
    insertedStudents = apiRes.data.students;
  } else {
    const usedTokens = new Set(
      replaceExisting ? [] : currentStudents.map((s) => s.token_ujian)
    );
    const baseId = Date.now();
    insertedStudents = parsed.rows.map((row, idx) => {
      let token =
        row.token_ujian && !usedTokens.has(row.token_ujian)
          ? row.token_ujian
          : generateExamToken();
      while (usedTokens.has(token)) {
        token = generateExamToken();
      }
      usedTokens.add(token);
      return {
        id: baseId + idx,
        nama: row.nama.trim(),
        kelas: row.kelas.trim(),
        token_ujian: token,
        status_ujian: 'Belum Mulai',
      };
    });
  }

  if (db) {
    if (replaceExisting) {
      const oldSnap = await getDocs(cbtCollectionQuery('students'));
      const delBatch = writeBatch(db);
      oldSnap.docs.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }

    const batch = writeBatch(db);
    for (const st of insertedStudents) {
      batch.set(doc(db, 'students', String(st.id)), buildCleanStudentFirestoreDoc(st, nowIso));
    }
    await batch.commit();
    await updateFirestorePulse(
      `Upload massal ${insertedStudents.length} siswa CSV ke Firebase Firestore`
    );
  }

  return {
    insertedCount: insertedStudents.length,
    students: insertedStudents,
  };
}

export async function regenerateStudentTokenCbt(
  student: StudentItem
): Promise<StudentItem> {
  const apiRes = await safeApiJson<{ student?: StudentItem }>(
    `/api/students/${student.id}/regenerate-token`,
    { method: 'POST' }
  );

  const updated: StudentItem = {
    ...student,
    ...(apiRes.ok && apiRes.data?.student ? apiRes.data.student : {}),
    token_ujian:
      apiRes.ok && apiRes.data?.student
        ? apiRes.data.student.token_ujian
        : generateExamToken(),
    status_ujian: 'Belum Mulai',
  };

  if (db) {
    await setDoc(
      doc(db, 'students', String(updated.id)),
      buildCleanStudentFirestoreDoc(updated, new Date().toISOString()),
      { merge: true }
    );
    await updateFirestorePulse(
      `Token baru dibuat untuk ${updated.nama}: ${updated.token_ujian}`
    );
  }

  return updated;
}

export async function updateStudentStatusCbt(
  student: StudentItem,
  status_ujian: string
): Promise<StudentItem> {
  const apiRes = await safeApiJson<{ student?: StudentItem }>(
    `/api/students/${student.id}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_ujian }),
    }
  );

  const updated: StudentItem = {
    ...student,
    ...(apiRes.ok && apiRes.data?.student ? apiRes.data.student : {}),
    status_ujian,
  };

  if (db) {
    await setDoc(
      doc(db, 'students', String(updated.id)),
      buildCleanStudentFirestoreDoc(updated, new Date().toISOString()),
      { merge: true }
    );
    await updateFirestorePulse(
      `Status siswa ${updated.nama} diubah menjadi: ${updated.status_ujian}`
    );
  }

  return updated;
}

export async function syncStudentLiveTelemetryCbt(
  student: StudentItem,
  telemetryPatch: Partial<StudentLiveTelemetry>,
  statusOverride?: string
): Promise<void> {
  if (!student || !student.id) return;
  const nowIso = new Date().toISOString();
  const mergedTelemetry: StudentLiveTelemetry = {
    ...(student.live_telemetry || {}),
    ...telemetryPatch,
    last_active_at: telemetryPatch.last_active_at || nowIso,
  };
  const updatedStudent: StudentItem = {
    ...student,
    status_ujian: statusOverride || student.status_ujian || 'Sedang Ujian',
    live_telemetry: mergedTelemetry,
  };

  if (db) {
    try {
      await setDoc(
        doc(db, 'students', String(updatedStudent.id)),
        buildCleanStudentFirestoreDoc(updatedStudent, nowIso),
        { merge: true }
      );
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `students/${updatedStudent.id}`);
      } catch {}
    }
  }
}

export async function bulkUpdateStudentStatusCbt(
  targetStudents: StudentItem[],
  status_ujian: string
): Promise<void> {
  if (targetStudents.length === 0) return;

  await safeApiJson('/api/students/bulk-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentIds: targetStudents.map((s) => s.id),
      status_ujian,
    }),
  });

  if (db) {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    for (const st of targetStudents) {
      batch.set(
        doc(db, 'students', String(st.id)),
        buildCleanStudentFirestoreDoc({ ...st, status_ujian }, nowIso),
        { merge: true }
      );
    }
    await batch.commit();
    await updateFirestorePulse(
      `Status ${targetStudents.length} siswa diatur massal menjadi: ${status_ujian}`
    );
  }
}

export function subscribeToSingleStudentStatus(
  studentId: number,
  onStatusChange: (status: string) => void
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, 'students', String(studentId)),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data?.status_ujian) {
          onStatusChange(String(data.status_ujian));
        }
      }
    },
    () => {}
  );
}

export async function deleteStudentCbt(
  studentId: number,
  nama: string
): Promise<void> {
  await safeApiJson(`/api/students/${studentId}`, { method: 'DELETE' });
  if (db) {
    await deleteDoc(doc(db, 'students', String(studentId)));
    await updateFirestorePulse(`Data siswa "${nama}" dihapus`);
  }
}

export async function renameClassCbt(
  oldKelas: string,
  newKelas: string,
  currentStudents: StudentItem[]
): Promise<number> {
  const cleanOld = oldKelas.trim();
  const cleanNew = newKelas.trim();
  if (!cleanOld || !cleanNew) return 0;

  await safeApiJson('/api/classes/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldKelas: cleanOld, newKelas: cleanNew }),
  });

  const matching = currentStudents.filter(
    (s) => s.kelas.trim().toLowerCase() === cleanOld.toLowerCase()
  );

  if (db && matching.length > 0) {
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    for (const st of matching) {
      batch.set(
        doc(db, 'students', String(st.id)),
        buildCleanStudentFirestoreDoc({ ...st, kelas: cleanNew }, nowIso),
        { merge: true }
      );
    }
    await batch.commit();
    await updateFirestorePulse(
      `Nama kelas diubah: ${cleanOld} menjadi ${cleanNew} (${matching.length} siswa)`
    );
  }

  return matching.length;
}

export async function deleteClassStudentsCbt(
  kelas: string,
  currentStudents: StudentItem[]
): Promise<number> {
  const cleanKelas = kelas.trim();
  if (!cleanKelas) return 0;

  await safeApiJson('/api/classes/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kelas: cleanKelas }),
  });

  const matching = currentStudents.filter(
    (s) => s.kelas.trim().toLowerCase() === cleanKelas.toLowerCase()
  );

  if (db && matching.length > 0) {
    const batch = writeBatch(db);
    for (const st of matching) {
      batch.delete(doc(db, 'students', String(st.id)));
    }
    await batch.commit();
    await updateFirestorePulse(
      `Kelas ${cleanKelas} beserta ${matching.length} siswa dihapus`
    );
  }

  return matching.length;
}

export async function addManualQuestionCbt(payload: {
  examId: number;
  tipe_soal: 'PG' | 'Kompleks';
  wacana: string;
  teks_soal: string;
  opsi: { A: string; B: string; C: string; D: string; E: string };
  kunci_jawaban: string[];
  bobot: number;
}): Promise<QuestionItem> {
  const normalizedKeys = normalizeAnswerKeys(payload.kunci_jawaban);
  if (normalizedKeys.length === 0) {
    throw new Error('Pilih minimal satu kunci jawaban yang benar (A-E).');
  }

  const apiRes = await safeApiJson<{ question?: QuestionItem; error?: string }>(
    '/api/questions/manual',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, kunci_jawaban: normalizedKeys }),
    }
  );

  const nowIso = new Date().toISOString();
  const questionRecord: QuestionItem =
    apiRes.ok && apiRes.data?.question
      ? apiRes.data.question
      : {
          id: Date.now(),
          exam_id: payload.examId,
          teks_soal: payload.teks_soal.trim(),
          tipe_soal: payload.tipe_soal,
          data_opsi: {
            wacana: payload.wacana.trim(),
            opsi: payload.opsi,
          },
          kunci_jawaban: normalizedKeys,
          bobot: payload.bobot,
        };

  if (db) {
    await setDoc(doc(db, 'questions', String(questionRecord.id)), {
      id: Number(questionRecord.id),
      exam_id: Number(questionRecord.exam_id),
      teks_soal: questionRecord.teks_soal.slice(0, 4000),
      tipe_soal: questionRecord.tipe_soal,
      data_opsi: questionRecord.data_opsi,
      kunci_jawaban: questionRecord.kunci_jawaban,
      bobot: Number(questionRecord.bobot),
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });
    await updateFirestorePulse(
      `Butir soal baru ditambahkan ke paket ujian #${payload.examId}`
    );
  }

  return questionRecord;
}

export async function updateManualQuestionCbt(payload: {
  questionId: number;
  examId: number;
  tipe_soal: 'PG' | 'Kompleks';
  wacana: string;
  teks_soal: string;
  opsi: { A: string; B: string; C: string; D: string; E: string };
  kunci_jawaban: string[];
  bobot: number;
}): Promise<QuestionItem> {
  const normalizedKeys = normalizeAnswerKeys(payload.kunci_jawaban);
  if (normalizedKeys.length === 0) {
    throw new Error('Pilih minimal satu kunci jawaban yang benar (A-E).');
  }

  const apiRes = await safeApiJson<{ question?: QuestionItem; error?: string }>(
    `/api/questions/${payload.questionId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, kunci_jawaban: normalizedKeys }),
    }
  );

  const nowIso = new Date().toISOString();
  const questionRecord: QuestionItem =
    apiRes.ok && apiRes.data?.question
      ? apiRes.data.question
      : {
          id: payload.questionId,
          exam_id: payload.examId,
          teks_soal: payload.teks_soal.trim(),
          tipe_soal: payload.tipe_soal,
          data_opsi: {
            wacana: payload.wacana.trim(),
            opsi: payload.opsi,
          },
          kunci_jawaban: normalizedKeys,
          bobot: payload.bobot,
        };

  if (db) {
    await setDoc(doc(db, 'questions', String(questionRecord.id)), {
      id: Number(questionRecord.id),
      exam_id: Number(questionRecord.exam_id),
      teks_soal: questionRecord.teks_soal.slice(0, 4000),
      tipe_soal: questionRecord.tipe_soal,
      data_opsi: questionRecord.data_opsi,
      kunci_jawaban: questionRecord.kunci_jawaban,
      bobot: Number(questionRecord.bobot),
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });
    await updateFirestorePulse(
      `Butir soal #${questionRecord.id} berhasil diperbarui`
    );
  }

  return questionRecord;
}

export async function uploadQuestionsCsvCbt(
  examId: number,
  csvText: string,
  replaceExisting: boolean,
  currentQuestions: QuestionItem[]
): Promise<{ insertedCount: number; questions: QuestionItem[] }> {
  const parsed = parseQuestionsCsv(csvText);
  if (parsed.rows.length === 0) {
    throw new Error(
      parsed.errors.join(' | ') || 'Format CSV soal tidak valid.'
    );
  }

  const apiRes = await safeApiJson<{
    insertedCount: number;
    questions: QuestionItem[];
    error?: string;
  }>('/api/questions/upload-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId, csvText, replaceExisting }),
  });

  const nowIso = new Date().toISOString();
  let insertedQuestions: QuestionItem[] = [];

  if (apiRes.ok && apiRes.data?.questions) {
    insertedQuestions = apiRes.data.questions;
  } else {
    const baseId = Date.now();
    insertedQuestions = parsed.rows.map((row, idx) => ({
      id: baseId + idx,
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
          E: row.opsi_e,
        },
      },
      kunci_jawaban: row.kunci_jawaban,
      bobot: row.bobot,
    }));
  }

  if (db) {
    if (replaceExisting) {
      const toRemove = currentQuestions.filter((q) => q.exam_id === examId);
      const delBatch = writeBatch(db);
      toRemove.forEach((q) =>
        delBatch.delete(doc(db!, 'questions', String(q.id)))
      );
      await delBatch.commit();
    }

    const batch = writeBatch(db);
    for (const q of insertedQuestions) {
      batch.set(doc(db, 'questions', String(q.id)), {
        id: Number(q.id),
        exam_id: Number(q.exam_id),
        teks_soal: q.teks_soal.slice(0, 4000),
        tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
        data_opsi: q.data_opsi,
        kunci_jawaban: q.kunci_jawaban,
        bobot: Number(q.bobot) || 2,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    }
    await batch.commit();
    await updateFirestorePulse(
      `Upload massal ${insertedQuestions.length} soal CSV ke ujian #${examId}`
    );
  }

  return {
    insertedCount: insertedQuestions.length,
    questions: insertedQuestions,
  };
}

export async function deleteQuestionCbt(questionId: number): Promise<void> {
  await safeApiJson(`/api/questions/${questionId}`, { method: 'DELETE' });
  if (db) {
    await deleteDoc(doc(db, 'questions', String(questionId)));
    await updateFirestorePulse(`Butir soal #${questionId} dihapus`);
  }
}

export async function clearExamQuestionsCbt(
  examId: number,
  currentQuestions: QuestionItem[]
): Promise<number> {
  await safeApiJson(`/api/exams/${examId}/questions`, { method: 'DELETE' });
  const toRemove = currentQuestions.filter(
    (q) => Number(q.exam_id) === Number(examId)
  );
  if (db) {
    const qSnap = await getDocs(cbtCollectionQuery('questions'));
    const matchingDocIds = new Set<string>(
      toRemove.map((q) => String(q.id))
    );
    qSnap.docs.forEach((d) => {
      const data = d.data();
      if (Number(data.exam_id) === Number(examId)) {
        matchingDocIds.add(d.id);
      }
    });
    if (matchingDocIds.size > 0) {
      const batch = writeBatch(db);
      matchingDocIds.forEach((docId) =>
        batch.delete(doc(db!, 'questions', docId))
      );
      await batch.commit();
      await updateFirestorePulse(
        `Semua soal (${matchingDocIds.size} butir) pada bank soal ujian #${examId} dihapus`
      );
      return matchingDocIds.size;
    }
  }
  return toRemove.length;
}

export async function copyQuestionsToExamCbt(
  targetExamId: number,
  sourceQuestions: QuestionItem[]
): Promise<number> {
  if (sourceQuestions.length === 0) return 0;
  let copiedCount = 0;
  for (const q of sourceQuestions) {
    await addManualQuestionCbt({
      examId: targetExamId,
      tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
      wacana: q.data_opsi?.wacana || '',
      teks_soal: q.teks_soal,
      opsi: {
        A: q.data_opsi?.opsi?.A || '',
        B: q.data_opsi?.opsi?.B || '',
        C: q.data_opsi?.opsi?.C || '',
        D: q.data_opsi?.opsi?.D || '',
        E: q.data_opsi?.opsi?.E || '',
      },
      kunci_jawaban: q.kunci_jawaban,
      bobot: q.bobot || (q.tipe_soal === 'Kompleks' ? 3 : 2),
    });
    copiedCount++;
  }
  return copiedCount;
}

export async function loginStudentExamCbt(
  nama: string,
  token_ujian: string,
  examId?: number
): Promise<{
  student: StudentItem;
  exam: ExamItem;
  questions: QuestionItem[];
}> {
  const cleanNama = nama.trim();
  const cleanToken = token_ujian.trim();
  const cleanTokenUpper = cleanToken.toUpperCase();

  // First try Firestore as authoritative source if connected so Ganjil-Genap / Multi-Mapel / Bobot rules are 100% up-to-date
  const fsData = await fetchAllFromFirestore();

  if (!fsData) {
    const apiRes = await safeApiJson<{
      student?: StudentItem;
      exam?: ExamItem;
      questions?: QuestionItem[];
      error?: string;
    }>('/api/exam/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama: cleanNama,
        token_ujian: cleanTokenUpper,
        examId,
      }),
    });

    if (apiRes.isApiAvailable && apiRes.ok && apiRes.data?.student && apiRes.data?.exam && apiRes.data?.questions) {
      const syncedPkg =
        apiRes.data.student.kode_soal ||
        apiRes.data.exam.kode_paket ||
        'PAKET-A';
      const syncedStudent: StudentItem = {
        ...apiRes.data.student,
        status_ujian: 'Sedang Ujian',
        kode_soal: syncedPkg,
        variasi_paket:
          apiRes.data.student.variasi_paket ||
          syncedPkg.replace(/^PAKET[-_\s]*/i, '') ||
          'A',
      };
      const sortedQuestions = [...apiRes.data.questions]
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((q) => ({
          ...q,
          bobot:
            Number(q.bobot) > 0
              ? Number(q.bobot)
              : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
              ? 3
              : 2,
        }));
      return {
        student: syncedStudent,
        exam: apiRes.data.exam,
        questions: sortedQuestions,
      };
    }

    if (apiRes.isApiAvailable && apiRes.data?.error) {
      throw new Error(apiRes.data.error);
    }
    throw new Error('Tidak dapat terhubung ke database Firebase Firestore.');
  }

  const matchedStudent =
    fsData.students.find((s) => {
      const nameMatch = s.nama.trim().toLowerCase() === cleanNama.toLowerCase();
      const sysTokenMatch = (s.token_ujian || '').trim().toUpperCase() === cleanTokenUpper;
      const customPassMatch =
        Boolean(s.password_login) &&
        (s.password_login!.trim() === cleanToken ||
          s.password_login!.trim().toUpperCase() === cleanTokenUpper);
      return nameMatch && (sysTokenMatch || customPassMatch);
    }) ||
    fsData.students.find(
      (s) => (s.token_ujian || '').trim().toUpperCase() === cleanTokenUpper
    );

  if (!matchedStudent) {
    throw new Error(
      'Token / Password Akun Siswa tidak ditemukan di database. Hubungi Guru/Pengawas Anda.'
    );
  }

  if (matchedStudent.nama.trim().toLowerCase() !== cleanNama.toLowerCase()) {
    throw new Error(
      `Token Ujian tidak sesuai untuk siswa "${cleanNama}". Pastikan Anda memilih Kelas dan Nama Siswa yang sesuai.`
    );
  }

  if (matchedStudent.status_ujian === 'Diblokir') {
    throw new Error(
      'Akses ujian Anda sedang DIBLOKIR / DIKUNCI karena pelanggaran aturan keamanan (Anti-Cheat) atau dikunci oleh Pengawas. Silakan hubungi Guru Pengawas untuk membuka kunci status ujian Anda.'
    );
  }

  if (fsData.exams.length === 0) {
    throw new Error(
      'Belum ada Paket Ujian yang aktif. Silakan tunggu Guru mengaktifkan ujian.'
    );
  }

  // Proportional & Deterministic Exam Package Resolution across Class, Angkatan & Mata Pelajaran
  const proportionalAlloc = resolveProportionalStudentExamPackage({
    student: matchedStudent,
    allStudents: fsData.students,
    exams: fsData.exams,
    questions: fsData.questions,
    preferredExamId: examId,
  });

  if (!proportionalAlloc.exam || proportionalAlloc.matchedExams.length === 0) {
    throw new Error(
      `Belum ada sesi ujian berstatus AKTIF yang dijadwalkan untuk kelas Anda (${matchedStudent.kelas}). Paket soal mungkin masih berstatus DRAF atau telah ditutup oleh Guru.`
    );
  }

  const activeExam = proportionalAlloc.exam;
  const examQuestions = fsData.questions
    .filter((q) => Number(q.exam_id) === Number(activeExam.id))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((q) => ({
      ...q,
      bobot:
        Number(q.bobot) > 0
          ? Number(q.bobot)
          : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
          ? 3
          : 2,
    }));

  if (examQuestions.length === 0) {
    throw new Error(
      `Paket ujian "${activeExam.judul_ujian}" untuk kelas ${matchedStudent.kelas} belum memiliki butir soal. Silakan hubungi Guru.`
    );
  }

  const updatedStudent: StudentItem = {
    ...matchedStudent,
    status_ujian: 'Sedang Ujian',
    kode_soal: proportionalAlloc.packageCode,
    variasi_paket: proportionalAlloc.variantLetter,
  };

  if (db) {
    await setDoc(
      doc(db, 'students', String(updatedStudent.id)),
      buildCleanStudentFirestoreDoc(updatedStudent, new Date().toISOString()),
      { merge: true }
    );
    await updateFirestorePulse(
      `Siswa mulai ujian: ${updatedStudent.nama} (${updatedStudent.kelas}) — ${activeExam.judul_ujian} [${proportionalAlloc.packageCode}]`
    );
  }

  // Also notify backend API silently if available
  safeApiJson('/api/exam/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama: cleanNama,
      token_ujian: cleanTokenUpper,
      examId: activeExam.id,
    }),
  }).catch(() => {});

  return {
    student: updatedStudent,
    exam: activeExam,
    questions: examQuestions,
  };
}

export async function submitStudentExamCbt(payload: {
  student: StudentItem;
  exam: ExamItem;
  questions: QuestionItem[];
  jawabanSiswa: Record<string, string[]>;
  pelanggaranTab: number;
}): Promise<{
  resultId: number;
  skor: number;
  kategori: string;
  rawEarned: number;
  rawMax: number;
  canonicalAnswers: Record<string, string[]>;
}> {
  const answeredKeys = Object.keys(payload.jawabanSiswa || {}).filter(
    (k) =>
      Array.isArray(payload.jawabanSiswa[k]) &&
      payload.jawabanSiswa[k].length > 0
  );
  if (answeredKeys.length === 0) {
    throw new Error(
      'Peringatan: Anda belum menjawab satu soal pun. Silakan isi jawaban terlebih dahulu sebelum mengumpulkan!'
    );
  }

  // Synchronize latest bobot from Firestore if available while keeping the student's exact prepared option mapping
  let syncedQuestions = payload.questions.map((q) => ({
    ...q,
    bobot:
      Number(q.bobot) > 0
        ? Number(q.bobot)
        : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
        ? 3
        : 2,
  }));

  try {
    const fsData = await fetchAllFromFirestore();
    if (fsData && fsData.questions.length > 0) {
      const fsQuestionMap = new Map<number, QuestionItem>();
      for (const fq of fsData.questions) {
        fsQuestionMap.set(Number(fq.id), fq);
      }
      syncedQuestions = syncedQuestions.map((q) => {
        const fq = fsQuestionMap.get(Number(q.id));
        if (!fq) return q;
        const authoritativeBobot =
          Number(fq.bobot) > 0
            ? Number(fq.bobot)
            : Number(q.bobot) > 0
            ? Number(q.bobot)
            : String(fq.tipe_soal || q.tipe_soal || '')
                .toLowerCase()
                .includes('kompleks')
            ? 3
            : 2;
        return {
          ...q,
          bobot: authoritativeBobot,
        };
      });
    }
  } catch {
    // Fallback to payload.questions with normalized bobot
  }

  // 1. Calculate deterministic score against the exact prepared questions (with shuffled keys & teacher's bobot)
  const scoreSummary = calculateExamScore(
    syncedQuestions,
    payload.jawabanSiswa
  );

  // 2. Map student answers from shuffled display keys back to canonical Bank Soal option keys (A-E)
  const canonicalAnswers = mapStudentAnswersToCanonicalKeys(
    syncedQuestions,
    payload.jawabanSiswa
  );

  const apiRes = await safeApiJson<{
    result?: ResultItem;
    scoreSummary?: typeof scoreSummary;
  }>('/api/exam/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: payload.student.id,
      examId: payload.exam.id,
      jawabanSiswa: canonicalAnswers,
      pelanggaranTab: payload.pelanggaranTab,
    }),
  });

  const nowIso = new Date().toISOString();
  const resultId = apiRes.data?.result?.id || Date.now();

  if (db) {
    const studentPkg =
      payload.student.kode_soal?.slice(0, 64) ||
      payload.exam.kode_paket?.slice(0, 64) ||
      payload.student.variasi_paket?.slice(0, 64) ||
      'PAKET-A';

    await setDoc(
      doc(db, 'students', String(payload.student.id)),
      buildCleanStudentFirestoreDoc(
        {
          ...payload.student,
          status_ujian: 'Selesai',
          kode_soal: studentPkg,
          variasi_paket: studentPkg,
        },
        nowIso
      ),
      { merge: true }
    );

    await setDoc(doc(db, 'results', String(resultId)), {
      id: Number(resultId),
      student_id: Number(payload.student.id),
      exam_id: Number(payload.exam.id),
      skor_angka: scoreSummary.normalizedScore,
      jawaban_siswa: canonicalAnswers,
      kode_soal: studentPkg,
      analisis_ai: null,
      pelanggaran_tab: Number(payload.pelanggaranTab) || 0,
      created_at: nowIso,
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });

    await updateFirestorePulse(
      `Ujian selesai dikumpulkan: ${payload.student.nama} [${studentPkg}] (Skor ${scoreSummary.normalizedScore}/100)`
    );
  }

  return {
    resultId,
    skor: scoreSummary.normalizedScore,
    kategori: scoreSummary.kategoriNilai,
    rawEarned: scoreSummary.rawEarned,
    rawMax: scoreSummary.rawMax,
    canonicalAnswers,
  };
}

export async function generateAiAnalysisCbt(payload: {
  resultId?: number;
  nama_siswa: string;
  questions: QuestionItem[];
  jawaban_siswa: Record<string, string[]>;
  existingResult?: ResultItem;
  student?: StudentItem | null;
  exam?: ExamItem | null;
}): Promise<AnalisisAI> {
  // Synchronize answers with Bank Soal questions (supporting both new canonical & historical results)
  const syncedAnswers = resolveSyncedStudentAnswersForExam({
    questions: payload.questions,
    jawabanSiswa: payload.jawaban_siswa,
    student: payload.student,
    exam: payload.exam,
    recordedScore: payload.existingResult?.skor_angka ?? null,
  });

  const answeredKeys = Object.keys(syncedAnswers || {}).filter(
    (k) => Array.isArray(syncedAnswers[k]) && syncedAnswers[k].length > 0
  );
  const preScore = calculateExamScore(payload.questions, syncedAnswers || {});

  // Lock authoritative final score using the Humane formula (upgrading historical score if higher, never lowering)
  const lockedScore =
    payload.existingResult && typeof payload.existingResult.skor_angka === 'number' && payload.existingResult.skor_angka > 0
      ? Math.max(payload.existingResult.skor_angka, preScore.normalizedScore)
      : preScore.normalizedScore;

  let lockedKategori: ExamScoreSummary['kategoriNilai'] = 'Perlu Bimbingan (D)';
  if (lockedScore >= 85) lockedKategori = 'Sangat Baik (A)';
  else if (lockedScore >= 70) lockedKategori = 'Baik (B)';
  else if (lockedScore >= 55) lockedKategori = 'Cukup (C)';

  if (answeredKeys.length === 0 || (lockedScore === 0 && preScore.rawEarned === 0)) {
    throw new Error(
      'Skor 0: Analisis AI tidak tersedia untuk ujian kosong atau belum ada jawaban benar.'
    );
  }

  const apiRes = await safeApiJson<AnalisisAI & { error?: string }>(
    '/api/analyze',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultId: payload.resultId,
        nama_siswa: payload.nama_siswa,
        questions: payload.questions,
        jawaban_siswa: syncedAnswers,
      }),
    }
  );

  let aiAnalysis: AnalisisAI;

  if (apiRes.ok && apiRes.data && apiRes.data.analisis_kompetensi) {
    aiAnalysis = {
      ...apiRes.data,
      skor_akhir: lockedScore,
      kategori_nilai: lockedKategori,
    };
  } else {
    const scoreSummary = preScore;
    const detailItems = payload.questions.map((q, idx) => {
      const qId = String(q.id);
      const breakdownItem = scoreSummary.breakdown.find(
        (b) => b.questionId === qId
      );
      return {
        nomor: idx + 1,
        tipe_soal: q.tipe_soal,
        teks_soal: q.teks_soal,
        status_jawaban: breakdownItem?.status || 'Salah',
        poin_diperoleh: breakdownItem?.earnedPoints ?? 0,
        bobot_maksimal: breakdownItem?.maxPoints ?? q.bobot ?? 2,
      };
    });

    const benarItems = detailItems.filter(
      (d) => d.status_jawaban === 'Benar Penuh'
    );
    const sebagianItems = detailItems.filter(
      (d) => d.status_jawaban === 'Benar Sebagian'
    );
    const salahItems = detailItems.filter((d) => d.status_jawaban === 'Salah');

    aiAnalysis = {
      nama_siswa: payload.nama_siswa,
      skor_akhir: lockedScore,
      kategori_nilai: lockedKategori,
      analisis_kompetensi: {
        kekuatan:
          benarItems.length > 0
            ? benarItems.map(
                (b) =>
                  `Menguasai butir soal #${b.nomor} (${b.tipe_soal}): "${b.teks_soal.slice(
                    0,
                    75
                  )}..." dengan poin penuh (${b.poin_diperoleh}/${
                    b.bobot_maksimal
                  }).`
              )
            : [
                'Telah menyelesaikan seluruh rangkaian ujian tepat waktu dan menjawab butir soal dasar.',
              ],
        kelemahan:
          salahItems.length > 0 || sebagianItems.length > 0
            ? [
                ...sebagianItems.map(
                  (s) =>
                    `Pemahaman parsial pada soal #${s.nomor} (${s.tipe_soal}): baru memilih sebagian opsi benar (${s.poin_diperoleh}/${s.bobot_maksimal} poin).`
                ),
                ...salahItems.map(
                  (w) =>
                    `Perlu penguatan konsep pada soal #${w.nomor} (${
                      w.tipe_soal
                    }): "${w.teks_soal.slice(0, 70)}...".`
                ),
              ]
            : [
                'Tidak ditemukan kelemahan signifikan; akurasi jawaban sangat konsisten di seluruh tipe soal.',
              ],
      },
      evaluasi_hots:
        lockedScore >= 80
          ? 'Kemampuan berpikir tingkat tinggi (HOTS - Analisis & Evaluasi) sangat kuat. Siswa mampu mengintegrasikan informasi wacana dengan tepat pada soal Pilihan Ganda Kompleks.'
          : lockedScore >= 60
            ? 'Kemampuan kognitif LOTS (mengingat & memahami) sudah baik, namun pada soal HOTS (Pilihan Ganda Kompleks multi-opsi) siswa cenderung hanya mengidentifikasi sebagian faktor kunci.'
            : 'Siswa masih berfokus pada hafalan fakta tunggal (LOTS) dan memerlukan bimbingan terstruktur untuk menganalisis wacana kasus kompleks (HOTS).',
      rekomendasi_belajar: [
        'Pelajari kembali pembahasan konsep kunci pada soal Pilihan Ganda Kompleks yang memperoleh skor parsial atau nol.',
        'Latih teknik eliminasi distractor dan verifikasi setiap opsi A-E secara independen terhadap konteks wacana.',
        'Diskusikan studi kasus aplikatif bersama guru untuk memperkuat daya nalar analitis (C4) dan evaluatif (C5).',
      ],
    };
  }

  if (db && payload.resultId) {
    const nowIso = new Date().toISOString();
    const baseResult = payload.existingResult;
    if (baseResult) {
      await setDoc(doc(db, 'results', String(payload.resultId)), {
        id: Number(payload.resultId),
        student_id: Number(baseResult.student_id),
        exam_id: Number(baseResult.exam_id),
        skor_angka: lockedScore,
        jawaban_siswa: syncedAnswers,
        analisis_ai: aiAnalysis,
        pelanggaran_tab: Number(baseResult.pelanggaran_tab) || 0,
        created_at: baseResult.created_at || nowIso,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    } else {
      await setDoc(
        doc(db, 'results', String(payload.resultId)),
        {
          skor_angka: lockedScore,
          analisis_ai: aiAnalysis,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    }
    await updateFirestorePulse(
      `Evaluasi selesai untuk ${payload.nama_siswa} (${lockedScore}/100)`
    );
  }

  return aiAnalysis;
}
