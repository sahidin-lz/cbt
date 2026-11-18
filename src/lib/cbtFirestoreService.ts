import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  CbtSyncPulseData,
  OperationType,
  handleFirestoreError,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  isFirestoreQuotaCooldownActive,
  saveCachedSyncPulseLocal,
  getCachedSyncPulseLocal,
  fetchCbtSyncPulseOnce,
} from './firebase';

function cbtCollectionQuery(collectionName: 'exams' | 'students' | 'questions' | 'results') {
  return query(collection(db!, collectionName), where('id', '>=', 1));
}

async function safeGetCollectionDocs(
  collectionName: 'exams' | 'students' | 'questions' | 'results'
) {
  const q = cbtCollectionQuery(collectionName);
  if (isFirestoreQuotaCooldownActive()) {
    return await getDocsFromCache(q);
  }
  try {
    return await getDocs(q);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    try {
      return await getDocsFromCache(q);
    } catch {
      throw err;
    }
  }
}

async function safeGetSingleDoc(collectionName: string, docId: string) {
  const ref = doc(db!, collectionName, docId);
  if (isFirestoreQuotaCooldownActive()) {
    return await getDocFromCache(ref);
  }
  try {
    return await getDoc(ref);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    try {
      return await getDocFromCache(ref);
    } catch {
      throw err;
    }
  }
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
  buildHumaneAnalysisForResult,
  getEffectiveExamSessionToken,
  getRotatedSingleStudentPackageForRetake,
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
export const QUESTION_CACHE_KEY_PREFIX = 'cbt_soal_';
export const ANSWER_CACHE_KEY_PREFIX = 'cbt_jawaban_';

export interface LocalStudentAnswerSession {
  examId: number;
  studentId: number;
  nama: string;
  kelas: string;
  token_ujian: string;
  assignedPackageCode?: string;
  questionOrderIds?: number[];
  answers: Record<string, string[]>;
  currentIndex: number;
  remainingSeconds: number;
  tabViolations: number;
  inspectAttempts?: number;
  logs?: any[];
  updatedAt: string;
}

/**
 * 2. Caching Soal di Memori Lokal (localStorage):
 * Key: `cbt_soal_${ujianId}`
 */
export function getCachedExamQuestionsLocal(
  examId: number | string
): QuestionItem[] | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(
      `${QUESTION_CACHE_KEY_PREFIX}${examId}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
      ? parsed.items
      : null;
    if (!items || items.length === 0) return null;
    return items.map((q: any) => ({
      id: Number(q.id),
      exam_id: Number(q.exam_id || examId),
      teks_soal: String(q.teks_soal || ''),
      tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
      data_opsi: q.data_opsi || {
        wacana: '',
        opsi: { A: '', B: '', C: '', D: '', E: '' },
      },
      kunci_jawaban: Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : ['A'],
      bobot:
        Number(q.bobot) > 0
          ? Number(q.bobot)
          : q.tipe_soal === 'Kompleks'
          ? 3
          : 2,
    }));
  } catch {
    return null;
  }
}

export function saveCachedExamQuestionsLocal(
  examId: number | string,
  questions: QuestionItem[]
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = `${QUESTION_CACHE_KEY_PREFIX}${examId}`;
    if (!questions || questions.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(questions));
  } catch {
    // Ignore localStorage quota errors
  }
}

/**
 * 3. Sistem Jawaban Anti-Hilang & Hemat Writes (Local-First):
 * Key: `cbt_jawaban_${ujianId}_${userId}`
 */
export function saveLocalStudentAnswers(
  examId: number | string,
  studentId: number | string,
  session: LocalStudentAnswerSession
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = `${ANSWER_CACHE_KEY_PREFIX}${examId}_${studentId}`;
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore storage error
  }
}

export function getLocalStudentAnswers(
  examId: number | string,
  studentId: number | string
): LocalStudentAnswerSession | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const key = `${ANSWER_CACHE_KEY_PREFIX}${examId}_${studentId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as LocalStudentAnswerSession;
  } catch {
    return null;
  }
}

export function clearLocalStudentAnswers(
  examId: number | string,
  studentId: number | string
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(
      `${ANSWER_CACHE_KEY_PREFIX}${examId}_${studentId}`
    );
  } catch {}
}

/**
 * 4. Optimasi Struktur Dokumen Soal:
 * Simpan seluruh soal dalam 1 paket ujian sebagai 1 dokumen tunggal (`questions/bundle_${examId}`)
 * sehingga 1 siswa hanya menghabiskan 1 kuota baca (`1 read`) saat mengunduh seluruh soal ujian.
 */
function buildExamQuestionsBundleDoc(
  examId: number,
  examQuestions: QuestionItem[],
  nowIso: string
) {
  const sanitizedItems = examQuestions
    .filter((q) => Number(q.exam_id) === Number(examId))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((q) => ({
      id: Number(q.id),
      exam_id: Number(examId),
      teks_soal: String(q.teks_soal || '').slice(0, 4000),
      tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
      data_opsi: q.data_opsi || {
        wacana: '',
        opsi: { A: '', B: '', C: '', D: '', E: '' },
      },
      kunci_jawaban: Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : ['A'],
      bobot:
        Number(q.bobot) > 0
          ? Number(q.bobot)
          : q.tipe_soal === 'Kompleks'
          ? 3
          : 2,
    }));

  return {
    id: Number(examId),
    exam_id: Number(examId),
    teks_soal: `BUNDLE_PAKET_SOAL_${examId}`,
    tipe_soal: 'PG',
    data_opsi: {
      is_bundle: true,
      items: sanitizedItems,
      wacana: '',
      opsi: { A: '-', B: '-', C: '-', D: '-', E: '-' },
    },
    kunci_jawaban: ['A'],
    bobot: 2,
    authorUid: 'sahidin30@gmail.com',
    updatedAt: nowIso,
  };
}

export async function syncExamQuestionsBundleToFirestore(
  examId: number,
  examQuestions: QuestionItem[]
): Promise<void> {
  const cleanItems = examQuestions
    .filter((q) => Number(q.exam_id) === Number(examId))
    .sort((a, b) => Number(a.id) - Number(b.id));

  saveCachedExamQuestionsLocal(examId, cleanItems);

  if (!db) return;
  const nowIso = new Date().toISOString();
  try {
    if (cleanItems.length === 0) {
      await deleteDoc(doc(db, 'questions', `bundle_${examId}`));
    } else {
      await setDoc(
        doc(db, 'questions', `bundle_${examId}`),
        buildExamQuestionsBundleDoc(Number(examId), cleanItems, nowIso)
      );
    }
  } catch (err) {
    try {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `questions/bundle_${examId}`
      );
    } catch {}
  }
}

/**
 * Mengambil seluruh soal ujian untuk siswa dengan prioritas:
 * 1. `localStorage` (`cbt_soal_${ujianId}`) -> 0 Read Firestore
 * 2. 1 Dokumen Bundel (`questions/bundle_${ujianId}`) -> 1 Read Firestore (`getDoc`)
 * 3. Fallback Legacy (`where('exam_id', '==', examId)`) lalu langsung disimpan ke `cbt_soal_${ujianId}` & bundel
 */
export async function fetchExamQuestionsBundleOnce(
  examId: number
): Promise<QuestionItem[]> {
  // 1. Cek localStorage cbt_soal_${examId} terlebih dahulu (0 Firestore Read)
  const localCached = getCachedExamQuestionsLocal(examId);
  if (localCached && localCached.length > 0) {
    return localCached;
  }

  // 2. Cek apakah snapshot lokal sudah menyimpan soal ujian ini (0 Firestore Read)
  const snapshotCache = loadLocalCbtSnapshotCache();
  if (snapshotCache) {
    const snapQuestions = snapshotCache.questions.filter(
      (q) => Number(q.exam_id) === Number(examId)
    );
    if (snapQuestions.length > 0) {
      saveCachedExamQuestionsLocal(examId, snapQuestions);
      return snapQuestions;
    }
  }

  if (!db) return [];

  // 3. Ambil 1 dokumen bundel soal (`questions/bundle_${examId}`) dalam 1 kali getDoc (1 Read)
  try {
    const bundleSnap = await safeGetSingleDoc('questions', `bundle_${examId}`);
    if (bundleSnap.exists()) {
      const raw = bundleSnap.data() as any;
      if (raw?.data_opsi?.is_bundle && Array.isArray(raw.data_opsi.items)) {
        const bundledItems: QuestionItem[] = raw.data_opsi.items
          .map((item: any) => ({
            id: Number(item.id),
            exam_id: Number(item.exam_id || examId),
            teks_soal: String(item.teks_soal || ''),
            tipe_soal: item.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
            data_opsi: item.data_opsi || {
              wacana: '',
              opsi: { A: '', B: '', C: '', D: '', E: '' },
            },
            kunci_jawaban: Array.isArray(item.kunci_jawaban)
              ? item.kunci_jawaban
              : ['A'],
            bobot:
              Number(item.bobot) > 0
                ? Number(item.bobot)
                : item.tipe_soal === 'Kompleks'
                ? 3
                : 2,
          }))
          .sort((a: QuestionItem, b: QuestionItem) => a.id - b.id);

        if (bundledItems.length > 0) {
          saveCachedExamQuestionsLocal(examId, bundledItems);
          return bundledItems;
        }
      }
    }
  } catch {
    // Lanjut ke fallback query jika dokumen bundel belum ada
  }

  // 4. Fallback satu kali jika paket soal lama belum dibundel, lalu simpan ke localStorage & bundel
  try {
    const qQuery = query(
      collection(db, 'questions'),
      where('exam_id', '==', Number(examId))
    );
    const snap = await getDocs(qQuery);
    const legacyItems: QuestionItem[] = [];
    snap.docs.forEach((d) => {
      const raw = d.data() as any;
      if (raw?.data_opsi?.is_bundle && Array.isArray(raw.data_opsi.items)) {
        raw.data_opsi.items.forEach((item: any) => {
          legacyItems.push({
            id: Number(item.id),
            exam_id: Number(item.exam_id || examId),
            teks_soal: String(item.teks_soal || ''),
            tipe_soal: item.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
            data_opsi: item.data_opsi || {
              wacana: '',
              opsi: { A: '', B: '', C: '', D: '', E: '' },
            },
            kunci_jawaban: Array.isArray(item.kunci_jawaban)
              ? item.kunci_jawaban
              : ['A'],
            bobot: Number(item.bobot) || 2,
          });
        });
      } else if (raw?.teks_soal && !String(raw.teks_soal).startsWith('BUNDLE_PAKET_SOAL')) {
        legacyItems.push({
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
        });
      }
    });

    const dedupMap = new Map<number, QuestionItem>();
    legacyItems.forEach((q) => dedupMap.set(Number(q.id), q));
    const finalItems = Array.from(dedupMap.values()).sort(
      (a, b) => a.id - b.id
    );

    if (finalItems.length > 0) {
      saveCachedExamQuestionsLocal(examId, finalItems);
      syncExamQuestionsBundleToFirestore(examId, finalItems).catch(() => {});
    }
    return finalItems;
  } catch {
    return [];
  }
}

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

  // Simpan juga cache soal per ujian ke `cbt_soal_${ujianId}`
  if (Array.isArray(snapshot.exams) && Array.isArray(snapshot.questions)) {
    for (const ex of snapshot.exams) {
      const exQuestions = snapshot.questions.filter(
        (q) => Number(q.exam_id) === Number(ex.id)
      );
      if (exQuestions.length > 0) {
        saveCachedExamQuestionsLocal(ex.id, exQuestions);
      }
    }
  }

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

export function patchLocalCbtSnapshotCache(patch: {
  exam?: ExamItem;
  student?: StudentItem;
  students?: StudentItem[];
  result?: ResultItem;
}): void {
  const current = loadLocalCbtSnapshotCache();
  if (!current) return;

  let nextExams = current.exams;
  if (patch.exam) {
    const targetExamId = Number(patch.exam.id);
    const existsExam = nextExams.some((e) => Number(e.id) === targetExamId);
    nextExams = existsExam
      ? nextExams.map((e) =>
          Number(e.id) === targetExamId ? { ...e, ...patch.exam } : e
        )
      : [patch.exam, ...nextExams];
  }

  let nextStudents = current.students;
  if (patch.student) {
    const targetId = Number(patch.student.id);
    const exists = nextStudents.some((s) => Number(s.id) === targetId);
    nextStudents = exists
      ? nextStudents.map((s) =>
          Number(s.id) === targetId ? { ...s, ...patch.student } : s
        )
      : [patch.student, ...nextStudents];
  }
  if (Array.isArray(patch.students) && patch.students.length > 0) {
    const mapById = new Map<number, StudentItem>();
    for (const st of patch.students) {
      mapById.set(Number(st.id), st);
    }
    nextStudents = nextStudents.map((s) => {
      const updated = mapById.get(Number(s.id));
      if (updated) {
        mapById.delete(Number(s.id));
        return { ...s, ...updated };
      }
      return s;
    });
    if (mapById.size > 0) {
      nextStudents = [...Array.from(mapById.values()), ...nextStudents];
    }
  }

  let nextResults = current.results;
  if (patch.result) {
    const targetResId = Number(patch.result.id);
    // Hanya filter berdasarkan ID dokumen hasil (Number(r.id) !== targetResId)
    // agar jika siswa dijadwalkan ulang (Ujian Ulang), nilai ujian pertama (Sebelum) dan nilai ujian ulang (Sesudah) keduanya tetap tersimpan utuh berdasarkan waktu ujian (created_at).
    const filtered = nextResults.filter((r) => Number(r.id) !== targetResId);
    nextResults = [patch.result, ...filtered];
  }

  saveLocalCbtSnapshotCache({
    exams: nextExams,
    students: nextStudents,
    questions: current.questions,
    results: nextResults,
  });
}

const processedDeltaTagsMemory = new Set<string>();

async function buildDeltaPulsePayload(
  headlineText: string,
  newDeltaTag?: string,
  extraResultAdded = false
): Promise<CbtSyncPulseData> {
  const nowIso = new Date().toISOString();
  // Gunakan cache lokal agar 0 Read Firestore setiap kali siswa/pengawas mengirim sinyal perubahan!
  const prevPulse: CbtSyncPulseData | null = getCachedSyncPulseLocal();

  // Ambil hingga 3 tag delta terakhir dari pulse sebelumnya agar jika beberapa siswa selesai/mulai/melanggar bersamaan tidak saling menimpa
  const prevTags: string[] = [];
  if (prevPulse?.lastEvent) {
    const matches = prevPulse.lastEvent.matchAll(
      /\[(?:RES:\d+:)?STU:\d+\]|\[EXM:\d+\]/g
    );
    for (const m of matches) {
      if (m[0] && !prevTags.includes(m[0])) {
        prevTags.push(m[0]);
      }
    }
  }

  if (newDeltaTag) {
    const incomingMatches = Array.from(
      newDeltaTag.matchAll(/\[(?:RES:\d+:)?STU:\d+\]|\[EXM:\d+\]/g)
    ).map((m) => m[0]);
    const tagsToAdd =
      incomingMatches.length > 0 ? incomingMatches : [newDeltaTag];

    let filteredPrev = [...prevTags];
    for (const tag of tagsToAdd) {
      const targetStuMatch = tag.match(/STU:(\d+)/);
      const targetStuId = targetStuMatch ? targetStuMatch[1] : null;
      const targetExmMatch = tag.match(/EXM:(\d+)/);
      const targetExmId = targetExmMatch ? targetExmMatch[1] : null;

      filteredPrev = targetStuId
        ? filteredPrev.filter((t) => !t.includes(`STU:${targetStuId}]`))
        : targetExmId
          ? filteredPrev.filter((t) => !t.includes(`EXM:${targetExmId}]`))
          : filteredPrev.filter((t) => t !== tag);
      filteredPrev.push(tag);
    }
    while (filteredPrev.length > 4) {
      filteredPrev.shift();
    }
    prevTags.length = 0;
    prevTags.push(...filteredPrev);
  }

  const tagsSuffix = prevTags.length > 0 ? ` ${prevTags.join('')}` : '';
  const cleanHeadline = headlineText
    .replace(/\s*(?:\[(?:RES:\d+:)?STU:\d+\]|\[EXM:\d+\])/g, '')
    .trim();
  const maxHeadlineLen = Math.max(20, 198 - tagsSuffix.length);
  const finalLastEvent = `${cleanHeadline.slice(0, maxHeadlineLen)}${tagsSuffix}`.slice(
    0,
    200
  );

  const pulse: CbtSyncPulseData = {
    lastSyncedAt: nowIso,
    lastEvent: finalLastEvent || 'Sinkronisasi CBT Aktif',
    totalExams: Math.max(prevPulse?.totalExams || 0, cachedCollectionCounts.exams),
    totalStudents: Math.max(
      prevPulse?.totalStudents || 0,
      cachedCollectionCounts.students
    ),
    totalQuestions: Math.max(
      prevPulse?.totalQuestions || 0,
      cachedCollectionCounts.questions
    ),
    totalResults: Math.max(
      (prevPulse?.totalResults || 0) + (extraResultAdded ? 1 : 0),
      cachedCollectionCounts.results
    ),
    authorUid: 'sahidin30@gmail.com',
  };
  saveCachedSyncPulseLocal(pulse);
  return pulse;
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
  const nowIso = new Date().toISOString();
  const tagMatches = Array.from(
    eventText.matchAll(/\[(?:RES:\d+:)?STU:\d+\]|\[EXM:\d+\]/g)
  ).map((m) => m[0]);
  let pulse: CbtSyncPulseData;
  if (tagMatches.length > 0 && !counts) {
    pulse = await buildDeltaPulsePayload(
      eventText,
      tagMatches.join(''),
      false
    );
  } else {
    pulse = {
      lastSyncedAt: nowIso,
      lastEvent: eventText.slice(0, 200),
      totalExams: counts?.exams ?? cachedCollectionCounts.exams,
      totalStudents: counts?.students ?? cachedCollectionCounts.students,
      totalQuestions: counts?.questions ?? cachedCollectionCounts.questions,
      totalResults: counts?.results ?? cachedCollectionCounts.results,
      authorUid: 'sahidin30@gmail.com',
    };
    saveCachedSyncPulseLocal(pulse);
  }

  if (!db || isFirestoreQuotaCooldownActive()) return pulse;
  try {
    await setDoc(doc(db, 'cbt_sync', 'live_state'), pulse);
    return pulse;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
      return pulse;
    }
    try {
      handleFirestoreError(err, OperationType.WRITE, 'cbt_sync/live_state');
    } catch {
      // Logged
    }
    return pulse;
  }
}

export async function fetchAllFromFirestore(): Promise<{
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
} | null> {
  if (!db) return loadLocalCbtSnapshotCache();
  if (isFirestoreQuotaCooldownActive()) {
    const localSnap = loadLocalCbtSnapshotCache();
    if (localSnap) return localSnap;
  }
  try {
    // Ambil koleksi ujian, peserta, dan hasil terlebih dahulu.
    // Untuk soal ujian, prioritaskan cache lokal `cbt_soal_${examId}` (0 Read) atau dokumen tunggal `questions/bundle_${examId}` (1 Read per paket)
    // agar tidak membaca ratusan dokumen butir soal individual setiap kali aplikasi dimuat.
    const [exSnap, stSnap, rSnap] = await Promise.all([
      safeGetCollectionDocs('exams'),
      safeGetCollectionDocs('students'),
      safeGetCollectionDocs('results'),
    ]);

    const exams: ExamItem[] = exSnap.docs
      .map((d) => d.data() as ExamItem)
      .sort((a, b) => b.id - a.id);

    const students: StudentItem[] = stSnap.docs
      .map((d) => d.data() as StudentItem)
      .sort((a, b) => b.id - a.id);

    const questionMap = new Map<number, QuestionItem>();
    const perExamQuestionLists = await Promise.all(
      exams.map((ex) => fetchExamQuestionsBundleOnce(Number(ex.id)))
    );
    perExamQuestionLists.forEach((list) => {
      list.forEach((q) => {
        questionMap.set(Number(q.id), q);
      });
    });

    // Fallback satu kali jika ada ujian tapi belum ada soal sama sekali di cache maupun bundel
    if (questionMap.size === 0 && exams.length > 0) {
      const qSnap = await safeGetCollectionDocs('questions');
      qSnap.docs.forEach((d) => {
        const raw = d.data() as any;
        if (raw?.data_opsi?.is_bundle && Array.isArray(raw.data_opsi.items)) {
          raw.data_opsi.items.forEach((item: any) => {
            const qObj: QuestionItem = {
              id: Number(item.id),
              exam_id: Number(item.exam_id || raw.exam_id),
              teks_soal: String(item.teks_soal || ''),
              tipe_soal: item.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
              data_opsi: item.data_opsi || {
                wacana: '',
                opsi: { A: '', B: '', C: '', D: '', E: '' },
              },
              kunci_jawaban: Array.isArray(item.kunci_jawaban)
                ? item.kunci_jawaban
                : ['A'],
              bobot: Number(item.bobot) || 2,
            };
            questionMap.set(qObj.id, qObj);
          });
        } else if (
          raw?.teks_soal &&
          !String(raw.teks_soal).startsWith('BUNDLE_PAKET_SOAL_')
        ) {
          const qObj: QuestionItem = {
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
          };
          if (!questionMap.has(qObj.id)) {
            questionMap.set(qObj.id, qObj);
          }
        }
      });
    }

    const questions: QuestionItem[] = Array.from(questionMap.values()).sort(
      (a, b) => a.id - b.id
    );

    const results: ResultItem[] = rSnap.docs
      .map((d) => {
        const raw = d.data() as any;
        return {
          id: Number(raw.id),
          student_id: Number(raw.student_id),
          exam_id: Number(raw.exam_id),
          skor_angka: Number(raw.skor_angka) || 0,
          kode_soal: raw.kode_soal ? String(raw.kode_soal) : undefined,
          jawaban_siswa: raw.jawaban_siswa || {},
          analisis_ai: raw.analisis_ai || null,
          pelanggaran_tab: Number(raw.pelanggaran_tab) || 0,
          created_at: raw.created_at || raw.updatedAt || new Date().toISOString(),
        } satisfies ResultItem;
      })
      .sort((a, b) => b.id - a.id);

    const validExamIds = new Set(exams.map((e) => Number(e.id)));
    const studentById = new Map<number, StudentItem>(
      students.map((s) => [Number(s.id), s])
    );

    const validQuestions = questions.filter((q) =>
      validExamIds.has(Number(q.exam_id))
    );
    const validResults = results
      .filter((r) => studentById.has(Number(r.student_id)))
      .map((r) => {
        if (validExamIds.has(Number(r.exam_id))) return r;
        const st = studentById.get(Number(r.student_id));
        if (st) {
          const matchedExam =
            exams.find((ex) =>
              isExamMatchedForStudentClass(ex, st.kelas, { requireActive: false })
            ) || exams[0];
          if (matchedExam) {
            return { ...r, exam_id: Number(matchedExam.id) };
          }
        }
        return r;
      })
      .filter((r) => validExamIds.has(Number(r.exam_id)));

    const reconciledResults = reconcileFinishedStudentsWithResults({
      students,
      exams,
      questions: validQuestions,
      results: validResults,
    });

    // Recalculate historical student results in-memory using the Humane & Anti-Guessing formula
    const recalc = recalculateHistoricalResults({
      results: reconciledResults,
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
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
      return loadLocalCbtSnapshotCache();
    }
    try {
      handleFirestoreError(err, OperationType.GET, 'exams|students|questions|results');
    } catch {
      // Logged
    }
    return loadLocalCbtSnapshotCache();
  }
}

/**
 * Memastikan setiap siswa yang berstatus 'Selesai' pasti memiliki dokumen nilai (`ResultItem`) yang sinkron,
 * baik dari hasil Firestore, bukti kelulusan lokal (`cbt_history_student_`), jawaban lokal (`cbt_jawaban_`),
 * maupun rekaman skor pada `live_telemetry` siswa.
 */
export function reconcileFinishedStudentsWithResults(params: {
  students: StudentItem[];
  exams: ExamItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}): ResultItem[] {
  const resultList = [...params.results];
  const existingResultIds = new Set<number>(
    resultList.map((r) => Number(r.id))
  );
  const existingStudentExamKeys = new Set<string>(
    resultList.map((r) => `${Number(r.student_id)}_${Number(r.exam_id)}`)
  );
  const existingStudentIdsWithAnyResult = new Set<number>(
    resultList.map((r) => Number(r.student_id))
  );

  const persistRecoveredResult = (rec: ResultItem, allowMultipleAttempts = false) => {
    const recId = Number(rec.id);
    const key = `${Number(rec.student_id)}_${Number(rec.exam_id)}`;
    if (existingResultIds.has(recId)) return;
    if (!allowMultipleAttempts && existingStudentExamKeys.has(key)) return;
    resultList.push(rec);
    existingResultIds.add(recId);
    existingStudentExamKeys.add(key);
    existingStudentIdsWithAnyResult.add(Number(rec.student_id));
    if (db && !isFirestoreQuotaCooldownActive()) {
      const nowIso = new Date().toISOString();
      setDoc(
        doc(db, 'results', String(rec.id)),
        {
          id: Number(rec.id),
          student_id: Number(rec.student_id),
          exam_id: Number(rec.exam_id),
          skor_angka: Number(rec.skor_angka) || 0,
          jawaban_siswa: rec.jawaban_siswa || {},
          kode_soal: String(rec.kode_soal || 'PAKET-A').slice(0, 32),
          analisis_ai: rec.analisis_ai || null,
          pelanggaran_tab: Number(rec.pelanggaran_tab) || 0,
          created_at: rec.created_at || nowIso,
          authorUid: 'sahidin30@gmail.com',
          updatedAt: nowIso,
        },
        { merge: true }
      ).catch(() => {});
    }
  };

  for (const st of params.students) {
    // 1. Pulihkan seluruh riwayat ujian multi-sesi (termasuk Ujian Awal & Ujian Ulang) dari localStorage (`cbt_history_student_${st.id}`) jika ada yang belum masuk ke `results`
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawReceipt = window.localStorage.getItem(
          `cbt_history_student_${st.id}`
        );
        if (rawReceipt) {
          const parsedReceipts = JSON.parse(rawReceipt);
          if (Array.isArray(parsedReceipts)) {
            for (const recItem of parsedReceipts) {
              if (!recItem || Number(recItem.studentId) !== Number(st.id)) continue;
              const recExamId = Number(
                recItem.examId || st.live_telemetry?.exam_id || params.exams[0]?.id || 1
              );
              const recResultId =
                Number(recItem.resultId) ||
                Number(`9${String(recExamId).slice(-7)}${String(st.id).slice(-7)}`);
              if (!existingResultIds.has(recResultId)) {
                persistRecoveredResult(
                  {
                    id: recResultId,
                    student_id: Number(st.id),
                    exam_id: recExamId,
                    skor_angka: Number(recItem.skor) || 0,
                    kode_soal: st.kode_soal || st.variasi_paket || 'PAKET-A',
                    jawaban_siswa: recItem.jawabanSiswa || {},
                    analisis_ai: recItem.analisisAi || null,
                    pelanggaran_tab: Number(recItem.pelanggaranTab) || 0,
                    created_at: recItem.submittedAt || new Date().toISOString(),
                  },
                  Boolean(recItem.resultId)
                );
              }
            }
          }
        }
      } catch {}
    }

    if (st.status_ujian !== 'Selesai') continue;

    // 2. Pastikan sesi ujian terakhir yang berstatus 'Selesai' pada `live_telemetry` siswa sudah memiliki dokumen `ResultItem`
    const tel = st.live_telemetry;
    const targetExam =
      (tel?.exam_id
        ? params.exams.find((e) => Number(e.id) === Number(tel.exam_id))
        : undefined) ||
      params.exams.find((e) =>
        isExamMatchedForStudentClass(e, st.kelas, { requireActive: false })
      ) ||
      params.exams[0];

    if (!targetExam) continue;
    const explicitResIdMatch = String(tel?.last_action || '').match(/\[RES:(\d+)\]/);
    const explicitResId = explicitResIdMatch ? Number(explicitResIdMatch[1]) : 0;
    const targetKey = `${Number(st.id)}_${Number(targetExam.id)}`;
    if (
      (explicitResId > 0 && existingResultIds.has(explicitResId)) ||
      (explicitResId === 0 &&
        (existingStudentExamKeys.has(targetKey) ||
          (!tel?.exam_id && existingStudentIdsWithAnyResult.has(Number(st.id)))))
    ) {
      continue;
    }

    if (tel) {
      const scoreMatch = String(tel.last_action || '').match(
        /(?:NILAI|SKOR)\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*100/i
      );
      let inferredScore = scoreMatch ? Math.round(Number(scoreMatch[1])) : 0;

      if (!inferredScore && Number(tel.answered_count) > 0) {
        const totalQ = Math.max(1, Number(tel.total_questions) || 40);
        const ansCount = Math.min(totalQ, Number(tel.answered_count) || 0);
        inferredScore = Math.min(
          100,
          Math.max(45, Math.round(35 + (ansCount / totalQ) * 45))
        );
      }

      if (inferredScore > 0) {
        const detId =
          explicitResId ||
          Number(
            `9${String(targetExam.id).slice(-7)}${String(st.id).slice(-7)}`
          ) ||
          Date.now();
        persistRecoveredResult(
          {
            id: detId,
            student_id: Number(st.id),
            exam_id: Number(targetExam.id),
            skor_angka: inferredScore,
            kode_soal:
              tel.kode_paket || st.kode_soal || targetExam.kode_paket || 'PAKET-A',
            jawaban_siswa: {},
            analisis_ai: null,
            pelanggaran_tab: Number(tel.tab_violations) || 0,
            created_at: tel.last_active_at || new Date().toISOString(),
          },
          explicitResId > 0
        );
      }
    }
  }

  return resultList;
}

export async function persistRecalculatedResultsToFirestore(
  changedResults: ResultItem[]
): Promise<number> {
  if (!db || changedResults.length === 0 || isFirestoreQuotaCooldownActive()) {
    return changedResults.length;
  }
  const nowIso = new Date().toISOString();
  let persisted = 0;

  try {
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
        batch.set(doc(db, 'results', String(r.id)), resultDoc, { merge: true });
        persisted++;
      }
      await batch.commit();
    }
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
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
  updatedClasses: string[];
  results: ResultItem[];
}> {
  // Force-refresh humane analysis & humane scores across all historical results (including 11 Soshum Putri & 10 Abu Bakar)
  const strippedForFreshHumaneEval = params.results.map((r) => ({
    ...r,
    analisis_ai: null,
  }));

  const recalc = recalculateHistoricalResults({
    results: strippedForFreshHumaneEval,
    students: params.students,
    exams: params.exams,
    questions: params.questions,
  });

  const classSet = new Set<string>();
  for (const r of recalc.results) {
    const st = params.students.find((s) => Number(s.id) === Number(r.student_id));
    if (st?.kelas) {
      classSet.add(st.kelas.trim());
    }
  }

  saveLocalCbtSnapshotCache({
    exams: params.exams,
    students: params.students,
    questions: params.questions,
    results: recalc.results,
  });

  await safeApiJson('/api/results/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (recalc.results.length > 0 && db && !isFirestoreQuotaCooldownActive()) {
    await persistRecalculatedResultsToFirestore(recalc.results);
    await updateFirestorePulse(
      `Formula Nilai & Analisis Humanis diterapkan pada ${recalc.results.length} hasil ujian (${Array.from(classSet).join(', ')})`
    );
  }

  return {
    updatedCount: recalc.results.length,
    totalResults: recalc.results.length,
    updatedClasses: Array.from(classSet),
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

    // Bundle all questions per exam into 1 single document `questions/bundle_${examId}` (1 write per exam instead of N writes)
    const questionsByExam = new Map<number, QuestionItem[]>();
    for (const q of data.questions) {
      const exId = Number(q.exam_id);
      const list = questionsByExam.get(exId) || [];
      list.push(q);
      questionsByExam.set(exId, list);
    }
    for (const [exId, exQuestions] of questionsByExam.entries()) {
      saveCachedExamQuestionsLocal(exId, exQuestions);
      batch.set(
        doc(db, 'questions', `bundle_${exId}`),
        buildExamQuestionsBundleDoc(exId, exQuestions, nowIso)
      );
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

const LAST_SYNCED_PULSE_KEY = 'cbt_last_synced_pulse_at';

export async function loadUnifiedDashboardData(options?: {
  preferLocalCache?: boolean;
  checkPulseFirst?: boolean;
}): Promise<{
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}> {
  const cached = loadLocalCbtSnapshotCache();
  const hasValidCache =
    Boolean(cached) &&
    cached!.exams.length > 0 &&
    cached!.students.length > 0;

  if (options?.preferLocalCache && hasValidCache && cached) {
    return cached;
  }

  // Tarikan data super cepat & hemat kuota: jika cache lokal sudah ada dan checkPulseFirst aktif,
  // cek 1 dokumen ringan `cbt_sync/live_state` terlebih dahulu. Jika `lastSyncedAt` belum berubah,
  // langsung gunakan cache lokal tanpa mengunduh seluruh koleksi (1 Read saja).
  if (options?.checkPulseFirst && hasValidCache && cached) {
    try {
      const pulse = await fetchCbtSyncPulseOnce();
      const savedPulseAt =
        typeof window !== 'undefined' && window.localStorage
          ? window.localStorage.getItem(LAST_SYNCED_PULSE_KEY)
          : null;
      if (
        pulse?.lastSyncedAt &&
        savedPulseAt &&
        pulse.lastSyncedAt === savedPulseAt &&
        (!pulse.totalResults || cached.results.length === pulse.totalResults) &&
        (!pulse.totalExams || cached.exams.length === pulse.totalExams) &&
        (!pulse.totalStudents || cached.students.length === pulse.totalStudents)
      ) {
        return cached;
      }
      if (pulse?.lastSyncedAt && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LAST_SYNCED_PULSE_KEY, pulse.lastSyncedAt);
      }
    } catch {
      // Lanjut ke pembacaan koleksi jika gagal cek pulse
    }
  }

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

    // Union & Merge: Firestore is ALWAYS the primary source of truth over local SQLite API
    const examById = new Map<number, ExamItem>();
    for (const apiEx of apiRes.data.exams || []) {
      examById.set(Number(apiEx.id), {
        ...apiEx,
        token_sesi: apiEx.token_sesi || getEffectiveExamSessionToken(apiEx),
      });
    }
    for (const fsEx of firestoreData?.exams || []) {
      const prev = examById.get(Number(fsEx.id));
      examById.set(Number(fsEx.id), {
        ...prev,
        ...fsEx,
        status_ujian: fsEx.status_ujian || prev?.status_ujian || 'AKTIF',
        token_sesi:
          fsEx.token_sesi ||
          prev?.token_sesi ||
          getEffectiveExamSessionToken(fsEx),
      });
    }
    const mergedExams = Array.from(examById.values()).sort(
      (a, b) => Number(b.id) - Number(a.id)
    );

    const studentById = new Map<number, StudentItem>();
    for (const apiSt of apiRes.data.students || []) {
      studentById.set(Number(apiSt.id), apiSt);
    }
    for (const fsSt of firestoreData?.students || []) {
      const prev = studentById.get(Number(fsSt.id));
      studentById.set(Number(fsSt.id), {
        ...prev,
        ...fsSt,
        // Firestore status_ujian, live_telemetry, and package allocation ALWAYS take priority
        status_ujian: fsSt.status_ujian || prev?.status_ujian || 'Belum Mulai',
        kode_soal: fsSt.kode_soal || prev?.kode_soal,
        variasi_paket: fsSt.variasi_paket || prev?.variasi_paket,
        nisn: fsSt.nisn || prev?.nisn,
        password_login: fsSt.password_login || prev?.password_login,
        live_telemetry: fsSt.live_telemetry || prev?.live_telemetry,
      });
    }
    const mergedStudents = Array.from(studentById.values()).sort(
      (a, b) => Number(b.id) - Number(a.id)
    );

    const questionById = new Map<number, QuestionItem>();
    for (const apiQ of apiRes.data.questions || []) {
      questionById.set(Number(apiQ.id), apiQ);
    }
    for (const fsQ of firestoreData?.questions || []) {
      questionById.set(Number(fsQ.id), fsQ);
    }
    const mergedQuestions = Array.from(questionById.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );

    // Union results by (student_id, exam_id) so Firestore results are NEVER discarded when local SQLite has fewer/older rows!
    const resultByKey = new Map<string, ResultItem>();
    for (const apiR of apiRes.data.results || []) {
      const key = `${Number(apiR.student_id)}_${Number(apiR.exam_id)}`;
      resultByKey.set(key, apiR);
    }
    for (const fsR of firestoreData?.results || []) {
      const key = `${Number(fsR.student_id)}_${Number(fsR.exam_id)}`;
      const prev = resultByKey.get(key);
      if (!prev) {
        resultByKey.set(key, fsR);
      } else {
        const bestScore = Math.max(
          Number(fsR.skor_angka) || 0,
          Number(prev.skor_angka) || 0
        );
        const bestAnswers =
          Object.keys(fsR.jawaban_siswa || {}).length >=
          Object.keys(prev.jawaban_siswa || {}).length
            ? fsR.jawaban_siswa
            : prev.jawaban_siswa;
        resultByKey.set(key, {
          ...prev,
          ...fsR,
          skor_angka: bestScore,
          jawaban_siswa: bestAnswers,
          analisis_ai: fsR.analisis_ai || prev.analisis_ai || null,
        });
      }
    }

    const rawMergedResults = reconcileFinishedStudentsWithResults({
      students: mergedStudents,
      exams: mergedExams,
      questions: mergedQuestions,
      results: Array.from(resultByKey.values()),
    });

    const recalcMerged = recalculateHistoricalResults({
      results: rawMergedResults,
      students: mergedStudents,
      exams: mergedExams,
      questions: mergedQuestions,
    });

    const mergedBundle = {
      exams: mergedExams,
      students: mergedStudents,
      questions: mergedQuestions,
      results: recalcMerged.results,
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

/**
 * 1. Hapus Semua Real-Time Listener (onSnapshot):
 * Mengganti listener `onSnapshot` menjadi pembacaan satu kali (`fetchAllFromFirestore`).
 */
export function subscribeRealtimeFirestoreCollections(callbacks: {
  onExams?: (exams: ExamItem[]) => void;
  onStudents?: (students: StudentItem[]) => void;
  onQuestions?: (questions: QuestionItem[]) => void;
  onResults?: (results: ResultItem[]) => void;
}): Unsubscribe {
  fetchAllFromFirestore().then((bundle) => {
    if (!bundle) return;
    callbacks.onExams?.(bundle.exams);
    callbacks.onStudents?.(bundle.students);
    callbacks.onQuestions?.(bundle.questions);
    callbacks.onResults?.(bundle.results);
  });
  return () => {};
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

  patchLocalCbtSnapshotCache({ exam: examRecord });

  if (db) {
    const pulsePayload = await buildDeltaPulsePayload(
      `Paket ujian disimpan: [${examRecord.mata_pelajaran}] ${examRecord.judul_ujian} (Token: ${examRecord.token_sesi})`,
      `[EXM:${examRecord.id}]`,
      false
    );
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'exams', String(examRecord.id)),
        buildCleanExamFirestoreDoc(examRecord, nowIso)
      );
      batch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
      await batch.commit();
    } catch {
      await setDoc(
        doc(db, 'exams', String(examRecord.id)),
        buildCleanExamFirestoreDoc(examRecord, nowIso)
      );
      await setDoc(doc(db, 'cbt_sync', 'live_state'), pulsePayload).catch(() => {});
    }
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

  patchLocalCbtSnapshotCache({ students: updatedStudents });

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
    const tagSuffix =
      updatedStudents.length <= 4
        ? updatedStudents.map((s) => `[STU:${s.id}]`).join('')
        : '[BULK_STU]';
    const pulsePayload = await buildDeltaPulsePayload(
      `Distribusi multi-paket kode soal diperbarui untuk ${updatedStudents.length} siswa ${tagSuffix}`,
      updatedStudents.length <= 4 ? tagSuffix : undefined,
      false
    );
    batch.set(doc(firestoreDb, 'cbt_sync', 'live_state'), pulsePayload);
    await batch.commit();
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

  patchLocalCbtSnapshotCache({ student: studentRecord });

  if (db) {
    await setDoc(
      doc(db, 'students', String(studentRecord.id)),
      buildCleanStudentFirestoreDoc(studentRecord, nowIso),
      { merge: true }
    );
    await updateFirestorePulse(
      `Data siswa disimpan: ${studentRecord.nama} (${studentRecord.kelas}) [STU:${studentRecord.id}]`
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

  patchLocalCbtSnapshotCache({ student: updatedStudent });

  if (db) {
    const nowIso = new Date().toISOString();
    await setDoc(
      doc(db, 'students', String(updatedStudent.id)),
      buildCleanStudentFirestoreDoc(updatedStudent, nowIso),
      { merge: true }
    );
    await updateFirestorePulse(
      `Profil & Password Login diperbarui oleh siswa: ${updatedStudent.nama} (${updatedStudent.kelas}) [STU:${updatedStudent.id}]`
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

  patchLocalCbtSnapshotCache({ student: updated });

  if (db) {
    await setDoc(
      doc(db, 'students', String(updated.id)),
      buildCleanStudentFirestoreDoc(updated, new Date().toISOString()),
      { merge: true }
    );
    await updateFirestorePulse(
      `Token baru dibuat untuk ${updated.nama}: ${updated.token_ujian} [STU:${updated.id}]`
    );
  }

  return updated;
}

export function clearLocalStudentBlockCacheCbt(
  studentId: number,
  tokenUjian?: string,
  examId?: number,
  newStatus: string = 'Sedang Ujian'
): void {
  if (typeof window === 'undefined') return;
  const cleanToken = (tokenUjian || '').toUpperCase().trim();
  const isRescheduledReset = newStatus === 'Belum Mulai';

  // 1. Update cbt_offline_snapshot_v1 in localStorage
  try {
    const snap = loadLocalCbtSnapshotCache();
    if (snap && Array.isArray(snap.students)) {
      const target = snap.students.find((s) => Number(s.id) === Number(studentId));
      if (target) {
        const updatedStudent: StudentItem = {
          ...target,
          status_ujian: newStatus,
          live_telemetry: target.live_telemetry
            ? {
                ...target.live_telemetry,
                tab_violations: 0,
                inspect_attempts: 0,
                devtools_open: false,
                ...(isRescheduledReset
                  ? {
                      current_question_no: 1,
                      answered_count: 0,
                      remaining_seconds: 0,
                      last_action:
                        'KUNCI DIBUKA PENGAWAS (Belum Mulai) · DIJADWALKAN ULANG',
                    }
                  : {
                      last_action:
                        'KUNCI DIBUKA PENGAWAS (Cache Blokir Lokal Dibersihkan)',
                    }),
              }
            : undefined,
        };
        patchLocalCbtSnapshotCache({ student: updatedStudent });
      }
    }
  } catch {}

  // 2. Update cbt_logged_in_student_account in localStorage
  try {
    const rawAcc = localStorage.getItem('cbt_logged_in_student_account');
    if (rawAcc) {
      const parsedAcc = JSON.parse(rawAcc);
      if (parsedAcc && Number(parsedAcc.id) === Number(studentId)) {
        const updatedAcc = {
          ...parsedAcc,
          status_ujian: newStatus,
          live_telemetry: parsedAcc.live_telemetry
            ? {
                ...parsedAcc.live_telemetry,
                tab_violations: 0,
                inspect_attempts: 0,
                devtools_open: false,
                ...(isRescheduledReset
                  ? {
                      current_question_no: 1,
                      answered_count: 0,
                      remaining_seconds: 0,
                      last_action:
                        'KUNCI DIBUKA PENGAWAS (Belum Mulai) · DIJADWALKAN ULANG',
                    }
                  : {}),
              }
            : undefined,
        };
        localStorage.setItem('cbt_logged_in_student_account', JSON.stringify(updatedAcc));
      }
    }
  } catch {}

  // 3. Update or clear cbt_active_student_session in localStorage
  try {
    const rawSession = localStorage.getItem('cbt_active_student_session');
    if (rawSession) {
      const parsedSession = JSON.parse(rawSession);
      if (parsedSession?.student && Number(parsedSession.student.id) === Number(studentId)) {
        if (isRescheduledReset) {
          localStorage.removeItem('cbt_active_student_session');
        } else {
          parsedSession.student = {
            ...parsedSession.student,
            status_ujian: newStatus,
            live_telemetry: parsedSession.student.live_telemetry
              ? {
                  ...parsedSession.student.live_telemetry,
                  tab_violations: 0,
                  inspect_attempts: 0,
                  devtools_open: false,
                }
              : undefined,
          };
          localStorage.setItem('cbt_active_student_session', JSON.stringify(parsedSession));
        }
      }
    }
  } catch {}

  // 4. For 'Belum Mulai' (Reschedule / Ujian Ulang), clear old working progress keys so the retake starts with full time & blank sheet (while keeping cbt_history_student_* & results intact).
  // For 'Sedang Ujian' (Unblock mid-exam), preserve 100% of answers & remaining time and only reset violation counters to 0.
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('cbt_progress_token_') ||
        key.startsWith('cbt_jawaban_')
      ) {
        const rawVal = localStorage.getItem(key);
        if (!rawVal) continue;
        const parsedVal = JSON.parse(rawVal);
        if (!parsedVal || typeof parsedVal !== 'object') continue;

        const matchesStudent =
          Number(parsedVal.studentId) === Number(studentId) ||
          (cleanToken &&
            String(parsedVal.token_ujian || '')
              .toUpperCase()
              .trim() === cleanToken) ||
          (cleanToken && key.includes(cleanToken)) ||
          key.endsWith(`_${studentId}`);

        if (matchesStudent) {
          if (isRescheduledReset) {
            if (!examId || Number(parsedVal.examId) === Number(examId) || !parsedVal.examId) {
              keysToRemove.push(key);
            }
          } else {
            parsedVal.tabViolations = 0;
            parsedVal.inspectAttempts = 0;
            localStorage.setItem(key, JSON.stringify(parsedVal));
          }
        }
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

// Catat waktu terakhir siswa diblokir di sesi lokal agar pengecekan status otomatis tidak mengalami race-condition sebelum penulisan 'Diblokir' selesai di Firestore
const lastLocalBlockTimestampByStudent = new Map<number, number>();

export async function updateStudentStatusCbt(
  student: StudentItem,
  status_ujian: string
): Promise<StudentItem> {
  if (status_ujian === 'Diblokir') {
    lastLocalBlockTimestampByStudent.set(Number(student.id), Date.now());
  } else {
    lastLocalBlockTimestampByStudent.delete(Number(student.id));
  }

  const apiRes = await safeApiJson<{ student?: StudentItem }>(
    `/api/students/${student.id}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_ujian }),
    }
  );

  const isUnblocking = status_ujian !== 'Diblokir';
  const isRescheduledReset = status_ujian === 'Belum Mulai';
  const nowIso = new Date().toISOString();

  // Jika siswa dijadwalkan ulang (status_ujian === 'Belum Mulai') dan sebelumnya sudah punya nilai / status 'Selesai',
  // otomatis putar / tukar kode paket soal siswa ke paket yang BERBEDA dari ujian sebelumnya (mis. PAKET-A -> PAKET-B)
  let rotatedPkgInfo: { nextKodeSoal: string; nextVariasiPaket: string; previousKodeSoal: string } | null = null;
  if (isRescheduledReset) {
    const snap = loadLocalCbtSnapshotCache();
    const hasPriorResult = (snap?.results || []).some(
      (r) => Number(r.student_id) === Number(student.id)
    );
    if (hasPriorResult || student.status_ujian === 'Selesai') {
      rotatedPkgInfo = getRotatedSingleStudentPackageForRetake({
        student,
        allStudents: snap?.students || [student],
        exams: snap?.exams || [],
        questions: snap?.questions || [],
        results: snap?.results || [],
      });
    }
  }

  const nextKodeSoal = rotatedPkgInfo?.nextKodeSoal || student.kode_soal || 'PAKET-A';
  const nextVariasiPaket = rotatedPkgInfo?.nextVariasiPaket || student.variasi_paket || nextKodeSoal;

  const baseTelemetry: StudentLiveTelemetry = student.live_telemetry || {
    exam_id: 0,
    judul_ujian: '',
    kode_paket: nextKodeSoal,
    current_question_no: 1,
    answered_count: 0,
    total_questions: 0,
    remaining_seconds: 0,
    is_fullscreen: false,
    is_focused: true,
    devtools_open: false,
    tab_violations: 0,
    inspect_attempts: 0,
  };
  const updatedTelemetry: StudentLiveTelemetry = {
    ...baseTelemetry,
    kode_paket: nextKodeSoal,
    current_question_no: isRescheduledReset ? 1 : baseTelemetry.current_question_no,
    answered_count: isRescheduledReset ? 0 : baseTelemetry.answered_count,
    remaining_seconds: isRescheduledReset ? 0 : baseTelemetry.remaining_seconds,
    tab_violations: isUnblocking ? 0 : Math.max(3, Number(student.live_telemetry?.tab_violations || 3)),
    inspect_attempts: isUnblocking ? 0 : Number(student.live_telemetry?.inspect_attempts || 0),
    devtools_open: isUnblocking ? false : Boolean(student.live_telemetry?.devtools_open),
    last_action: isRescheduledReset
      ? rotatedPkgInfo
        ? `DIJADWALKAN UJIAN ULANG · PAKET DITUKAR (${rotatedPkgInfo.previousKodeSoal} → ${rotatedPkgInfo.nextKodeSoal})`
        : 'KUNCI DIBUKA PENGAWAS (Belum Mulai) · DIJADWALKAN ULANG'
      : isUnblocking
        ? `KUNCI DIBUKA PENGAWAS (${status_ujian})`
        : student.live_telemetry?.last_action || 'DIBLOKIR OLEH SISTEM / PENGAWAS',
    last_active_at: nowIso,
  };

  const updated: StudentItem = {
    ...student,
    ...(apiRes.ok && apiRes.data?.student ? apiRes.data.student : {}),
    status_ujian,
    kode_soal: nextKodeSoal,
    variasi_paket: nextVariasiPaket,
    live_telemetry: updatedTelemetry,
  };

  patchLocalCbtSnapshotCache({ student: updated });
  if (isUnblocking) {
    clearLocalStudentBlockCacheCbt(updated.id, updated.token_ujian, undefined, status_ujian);
  }

  if (db) {
    const pulsePayload = await buildDeltaPulsePayload(
      `Status siswa ${updated.nama} diubah menjadi: ${updated.status_ujian}`,
      `[STU:${updated.id}]`,
      false
    );
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'students', String(updated.id)),
        buildCleanStudentFirestoreDoc(updated, nowIso),
        { merge: true }
      );
      batch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
      await batch.commit();
    } catch {
      await setDoc(
        doc(db, 'students', String(updated.id)),
        buildCleanStudentFirestoreDoc(updated, nowIso),
        { merge: true }
      );
      await setDoc(doc(db, 'cbt_sync', 'live_state'), pulsePayload).catch(() => {});
    }
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

  patchLocalCbtSnapshotCache({ student: updatedStudent });

  if (db) {
    try {
      const pulsePayload = await buildDeltaPulsePayload(
        `PERINGATAN UJIAN: ${updatedStudent.nama} (${updatedStudent.kelas}) — ${
          mergedTelemetry.last_action || updatedStudent.status_ujian
        }`,
        `[STU:${updatedStudent.id}]`,
        false
      );
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'students', String(updatedStudent.id)),
        buildCleanStudentFirestoreDoc(updatedStudent, nowIso),
        { merge: true }
      );
      batch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
      await batch.commit();
    } catch (err) {
      try {
        await setDoc(
          doc(db, 'students', String(updatedStudent.id)),
          buildCleanStudentFirestoreDoc(updatedStudent, nowIso),
          { merge: true }
        );
      } catch {
        try {
          handleFirestoreError(err, OperationType.WRITE, `students/${updatedStudent.id}`);
        } catch {}
      }
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

  const isUnblocking = status_ujian !== 'Diblokir';
  const isRescheduledReset = status_ujian === 'Belum Mulai';

  if (db) {
    const nowIso = new Date().toISOString();
    const snap = loadLocalCbtSnapshotCache();
    const batch = writeBatch(db);
    for (const st of targetStudents) {
      let rotatedPkg: { nextKodeSoal: string; nextVariasiPaket: string; previousKodeSoal: string } | null = null;
      if (isRescheduledReset) {
        const hasPriorResult = (snap?.results || []).some(
          (r) => Number(r.student_id) === Number(st.id)
        );
        if (hasPriorResult || st.status_ujian === 'Selesai') {
          rotatedPkg = getRotatedSingleStudentPackageForRetake({
            student: st,
            allStudents: snap?.students || targetStudents,
            exams: snap?.exams || [],
            questions: snap?.questions || [],
            results: snap?.results || [],
          });
        }
      }
      const nextKodeSoal = rotatedPkg?.nextKodeSoal || st.kode_soal || 'PAKET-A';
      const nextVariasiPaket = rotatedPkg?.nextVariasiPaket || st.variasi_paket || nextKodeSoal;
      const updatedSt: StudentItem = {
        ...st,
        status_ujian,
        kode_soal: nextKodeSoal,
        variasi_paket: nextVariasiPaket,
        live_telemetry: st.live_telemetry
          ? {
              ...st.live_telemetry,
              kode_paket: nextKodeSoal,
              current_question_no: isRescheduledReset
                ? 1
                : st.live_telemetry.current_question_no,
              answered_count: isRescheduledReset
                ? 0
                : st.live_telemetry.answered_count,
              remaining_seconds: isRescheduledReset
                ? 0
                : st.live_telemetry.remaining_seconds,
              tab_violations: isUnblocking ? 0 : st.live_telemetry.tab_violations,
              inspect_attempts: isUnblocking ? 0 : st.live_telemetry.inspect_attempts,
              devtools_open: isUnblocking ? false : st.live_telemetry.devtools_open,
              last_action: isRescheduledReset
                ? rotatedPkg
                  ? `DIJADWALKAN UJIAN ULANG · PAKET DITUKAR (${rotatedPkg.previousKodeSoal} → ${rotatedPkg.nextKodeSoal})`
                  : 'KUNCI DIBUKA PENGAWAS (Belum Mulai) · DIJADWALKAN ULANG'
                : isUnblocking
                  ? `KUNCI DIBUKA PENGAWAS (${status_ujian})`
                  : st.live_telemetry.last_action,
              last_active_at: nowIso,
            }
          : undefined,
      };
      batch.set(
        doc(db, 'students', String(st.id)),
        buildCleanStudentFirestoreDoc(updatedSt, nowIso),
        { merge: true }
      );
      patchLocalCbtSnapshotCache({ student: updatedSt });
      if (isUnblocking) {
        clearLocalStudentBlockCacheCbt(st.id, st.token_ujian, undefined, status_ujian);
      }
    }
    const bulkTagSuffix =
      targetStudents.length <= 4
        ? targetStudents.map((s) => `[STU:${s.id}]`).join('')
        : '[BULK_STU]';
    const pulsePayload = await buildDeltaPulsePayload(
      `Status ${targetStudents.length} siswa diatur massal menjadi: ${status_ujian} ${bulkTagSuffix}`,
      targetStudents.length <= 4 ? bulkTagSuffix : undefined,
      false
    );
    batch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
    await batch.commit();
  }
}

/**
 * 1. Hapus onSnapshot pada status siswa -> gunakan pembacaan satu kali langsung dari server (`getDocFromServer` dengan fallback `getDoc`)
 * agar tidak pernah membaca cache IndexedDB/localStorage yang masih terjebak status 'Diblokir'.
 */
export async function fetchSingleStudentStatusOnce(
  studentId: number
): Promise<string | null> {
  // Cegah race-condition: jika siswa baru saja diblokir di perangkat ini (< 6 detik lalu), jangan biarkan pembacaan server yang belum terupdate membuka blokir sendiri
  const recentBlockTs = lastLocalBlockTimestampByStudent.get(Number(studentId)) || 0;
  if (recentBlockTs > 0 && Date.now() - recentBlockTs < 6000) {
    return 'Diblokir';
  }

  if (!db) return null;
  try {
    const ref = doc(db, 'students', String(studentId));
    let snap;
    if (!isFirestoreQuotaCooldownActive()) {
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await safeGetSingleDoc('students', String(studentId));
      }
    } else {
      snap = await safeGetSingleDoc('students', String(studentId));
    }

    if (snap && snap.exists()) {
      const data = snap.data() as any;
      if (data?.status_ujian) {
        const rawStatus = String(data.status_ujian);
        const serverViolations = Number(data?.live_telemetry?.tab_violations || 0);
        const lastActionStr = String(data?.live_telemetry?.last_action || '');
        const wasExplicitlyUnlockedByProctor = lastActionStr.includes('KUNCI DIBUKA PENGAWAS');

        // Jika catatan pelanggaran di server >= 3 dan belum pernah dibuka oleh Pengawas, paksa status tetap 'Diblokir'
        const freshStatus =
          rawStatus === 'Diblokir' ||
          (serverViolations >= 3 &&
            !wasExplicitlyUnlockedByProctor &&
            rawStatus !== 'Belum Mulai' &&
            rawStatus !== 'Selesai')
            ? 'Diblokir'
            : rawStatus;

        const mappedStudent: StudentItem = {
          id: Number(data.id ?? studentId),
          nama: String(data.nama || ''),
          kelas: String(data.kelas || ''),
          token_ujian: String(data.token_ujian || ''),
          status_ujian: freshStatus,
          kode_soal: data.kode_soal ? String(data.kode_soal) : undefined,
          variasi_paket: data.variasi_paket ? String(data.variasi_paket) : undefined,
          nisn: data.nisn ? String(data.nisn) : undefined,
          password_login: data.password_login ? String(data.password_login) : undefined,
          live_telemetry: data.live_telemetry || undefined,
        };
        patchLocalCbtSnapshotCache({ student: mappedStudent });
        if (freshStatus !== 'Diblokir') {
          lastLocalBlockTimestampByStudent.delete(Number(studentId));
          clearLocalStudentBlockCacheCbt(
            Number(studentId),
            mappedStudent.token_ujian,
            mappedStudent.live_telemetry?.exam_id,
            freshStatus
          );
        }
        return freshStatus;
      }
    }
  } catch {
    // Ignore transient errors
  }
  return null;
}

export function subscribeToSingleStudentStatus(
  studentId: number,
  onStatusChange: (status: string) => void
): Unsubscribe {
  fetchSingleStudentStatusOnce(studentId).then((status) => {
    if (status) onStatusChange(status);
  });
  return () => {};
}

/**
 * 3. Interval Auto-Save 5 Menit ke Firestore (`setDoc` dengan `{ merge: true }`):
 * Menyimpan map jawaban sementara siswa dalam 1 dokumen per sesi ujian per siswa.
 */
export async function autoSaveStudentAnswersToFirestoreCbt(params: {
  student: StudentItem;
  exam: ExamItem;
  answers: Record<string, string[]>;
  currentIndex: number;
  remainingSeconds: number;
  totalQuestions: number;
  tabViolations: number;
  inspectAttempts: number;
}): Promise<boolean> {
  if (!db || !params.student?.id || !params.exam?.id) return false;
  const nowIso = new Date().toISOString();
  const answeredCount = Object.keys(params.answers || {}).filter(
    (k) => Array.isArray(params.answers[k]) && params.answers[k].length > 0
  ).length;
  const pkgCode =
    params.student.kode_soal || params.exam.kode_paket || 'PAKET-A';

  try {
    await setDoc(
      doc(db, 'students', String(params.student.id)),
      buildCleanStudentFirestoreDoc(
        {
          ...params.student,
          status_ujian:
            params.student.status_ujian === 'Diblokir'
              ? 'Diblokir'
              : 'Sedang Ujian',
          kode_soal: pkgCode,
          live_telemetry: {
            ...(params.student.live_telemetry || {}),
            exam_id: Number(params.exam.id),
            judul_ujian: String(params.exam.judul_ujian || '').slice(0, 120),
            kode_paket: pkgCode,
            current_question_no: params.currentIndex + 1,
            answered_count: answeredCount,
            total_questions: params.totalQuestions,
            remaining_seconds: params.remainingSeconds,
            tab_violations: params.tabViolations,
            inspect_attempts: params.inspectAttempts,
            last_action: `Auto-Save Berkala (5 Menit): ${answeredCount}/${params.totalQuestions} terjawab`,
            last_active_at: nowIso,
          },
        },
        nowIso
      ),
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
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

  // Perbarui cache soal lokal `cbt_soal_${examId}` & dokumen bundel tunggal di Firestore
  const existingCached = getCachedExamQuestionsLocal(payload.examId) || [];
  const nextExamQuestions = [
    ...existingCached.filter((q) => Number(q.id) !== Number(questionRecord.id)),
    questionRecord,
  ].sort((a, b) => Number(a.id) - Number(b.id));

  await syncExamQuestionsBundleToFirestore(payload.examId, nextExamQuestions);
  if (db) {
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

  // Perbarui cache soal lokal `cbt_soal_${examId}` & dokumen bundel tunggal di Firestore
  const existingCached = getCachedExamQuestionsLocal(payload.examId) || [];
  const nextExamQuestions = [
    ...existingCached.filter((q) => Number(q.id) !== Number(questionRecord.id)),
    questionRecord,
  ].sort((a, b) => Number(a.id) - Number(b.id));

  await syncExamQuestionsBundleToFirestore(payload.examId, nextExamQuestions);
  if (db) {
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

  const existingForExam = replaceExisting
    ? []
    : currentQuestions.filter((q) => Number(q.exam_id) === Number(examId));
  const combinedForExam = [...existingForExam, ...insertedQuestions].sort(
    (a, b) => Number(a.id) - Number(b.id)
  );

  // Simpan seluruh soal ujian ini sebagai 1 dokumen bundel tunggal (`questions/bundle_${examId}`) + cache lokal `cbt_soal_${examId}`
  await syncExamQuestionsBundleToFirestore(examId, combinedForExam);

  if (db) {
    await updateFirestorePulse(
      `Upload massal ${insertedQuestions.length} soal CSV ke bundel ujian #${examId}`
    );
  }

  return {
    insertedCount: insertedQuestions.length,
    questions: insertedQuestions,
  };
}

export async function deleteQuestionCbt(questionId: number): Promise<void> {
  await safeApiJson(`/api/questions/${questionId}`, { method: 'DELETE' });
  const snapCache = loadLocalCbtSnapshotCache();
  const targetQ = snapCache?.questions.find(
    (q) => Number(q.id) === Number(questionId)
  );

  if (targetQ) {
    const remaining = (
      getCachedExamQuestionsLocal(targetQ.exam_id) ||
      snapCache?.questions.filter(
        (q) => Number(q.exam_id) === Number(targetQ.exam_id)
      ) ||
      []
    ).filter((q) => Number(q.id) !== Number(questionId));
    await syncExamQuestionsBundleToFirestore(targetQ.exam_id, remaining);
  }

  if (db) {
    await deleteDoc(doc(db, 'questions', String(questionId))).catch(() => {});
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
  saveCachedExamQuestionsLocal(examId, []);
  if (db) {
    await deleteDoc(doc(db, 'questions', `bundle_${examId}`)).catch(() => {});
    if (toRemove.length > 0) {
      const batch = writeBatch(db);
      toRemove.forEach((q) =>
        batch.delete(doc(db!, 'questions', String(q.id)))
      );
      await batch.commit().catch(() => {});
    }
    await updateFirestorePulse(
      `Semua soal (${toRemove.length} butir) pada bank soal ujian #${examId} dihapus`
    );
  }
  return toRemove.length;
}

export async function copyQuestionsToExamCbt(
  targetExamId: number,
  sourceQuestions: QuestionItem[]
): Promise<number> {
  if (sourceQuestions.length === 0) return 0;
  const baseId = Date.now();
  const existingForTarget = getCachedExamQuestionsLocal(targetExamId) || [];
  const clonedQuestions: QuestionItem[] = sourceQuestions.map((q, idx) => ({
    id: baseId + idx,
    exam_id: targetExamId,
    teks_soal: q.teks_soal,
    tipe_soal: q.tipe_soal === 'Kompleks' ? 'Kompleks' : 'PG',
    data_opsi: {
      wacana: q.data_opsi?.wacana || '',
      opsi: {
        A: q.data_opsi?.opsi?.A || '',
        B: q.data_opsi?.opsi?.B || '',
        C: q.data_opsi?.opsi?.C || '',
        D: q.data_opsi?.opsi?.D || '',
        E: q.data_opsi?.opsi?.E || '',
      },
    },
    kunci_jawaban: q.kunci_jawaban,
    bobot: q.bobot || (q.tipe_soal === 'Kompleks' ? 3 : 2),
  }));

  const combined = [...existingForTarget, ...clonedQuestions];
  await syncExamQuestionsBundleToFirestore(targetExamId, combined);
  return clonedQuestions.length;
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

  // Gunakan cache lokal terlebih dahulu agar tidak melakukan getDocs 4 koleksi saat siswa mulai ujian
  let snapshot = loadLocalCbtSnapshotCache();
  if (
    !snapshot ||
    snapshot.students.length === 0 ||
    snapshot.exams.length === 0
  ) {
    snapshot = await fetchAllFromFirestore();
  }

  if (!snapshot) {
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

    if (
      apiRes.isApiAvailable &&
      apiRes.ok &&
      apiRes.data?.student &&
      apiRes.data?.exam &&
      apiRes.data?.questions
    ) {
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
      saveCachedExamQuestionsLocal(apiRes.data.exam.id, sortedQuestions);
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

  let matchedStudent =
    snapshot.students.find((s) => {
      const nameMatch = s.nama.trim().toLowerCase() === cleanNama.toLowerCase();
      const sysTokenMatch =
        (s.token_ujian || '').trim().toUpperCase() === cleanTokenUpper;
      const customPassMatch =
        Boolean(s.password_login) &&
        (s.password_login!.trim() === cleanToken ||
          s.password_login!.trim().toUpperCase() === cleanTokenUpper);
      return nameMatch && (sysTokenMatch || customPassMatch);
    }) ||
    snapshot.students.find(
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

  // Selalu verifikasi 1 dokumen status siswa langsung dari server Firestore saat mulai/masuk ujian agar siswa tidak bisa mengakali blokir atau mereset hitungan pelanggaran lewat hapus cache / Incognito
  const matchedStudentId = Number(matchedStudent.id);
  const latestServerStatus = await fetchSingleStudentStatusOnce(matchedStudentId);
  const refreshedCache = loadLocalCbtSnapshotCache();
  const refreshedStudentFromServer = refreshedCache?.students.find(
    (s) => Number(s.id) === matchedStudentId
  );
  if (refreshedStudentFromServer) {
    matchedStudent = {
      ...matchedStudent,
      ...refreshedStudentFromServer,
      status_ujian: latestServerStatus || refreshedStudentFromServer.status_ujian,
    };
  } else if (latestServerStatus) {
    matchedStudent.status_ujian = latestServerStatus;
  }

  if (matchedStudent.status_ujian === 'Diblokir') {
    throw new Error(
      'Akses ujian Anda sedang DIBLOKIR / DIKUNCI karena pelanggaran aturan keamanan (Anti-Cheat) atau dikunci oleh Pengawas. Siswa tidak dapat membuka blokir sendiri. Silakan hubungi Guru Pengawas untuk membuka kunci status ujian Anda.'
    );
  }

  if (snapshot.exams.length === 0) {
    throw new Error(
      'Belum ada Paket Ujian yang aktif. Silakan tunggu Guru mengaktifkan ujian.'
    );
  }

  let proportionalAlloc = resolveProportionalStudentExamPackage({
    student: matchedStudent,
    allStudents: snapshot.students,
    exams: snapshot.exams,
    questions: snapshot.questions,
    preferredExamId: examId,
  });

  // Jika siswa memulai Ujian Susulan / Ujian Ulang dan paket yang dipilih/dirotasi belum berstatus 'AKTIF',
  // tetap izinkan semua paket di kelas tersebut langsung jalan tanpa hambatan.
  if (!proportionalAlloc.exam || proportionalAlloc.matchedExams.length === 0) {
    const allForcedActive = snapshot.exams.map((ex) => ({
      ...ex,
      status_ujian: 'AKTIF' as const,
    }));
    proportionalAlloc = resolveProportionalStudentExamPackage({
      student: matchedStudent,
      allStudents: snapshot.students,
      exams: allForcedActive,
      questions: snapshot.questions,
      preferredExamId: examId,
    });
  }

  if (!proportionalAlloc.exam) {
    const fallbackExam =
      (examId
        ? snapshot.exams.find((e) => Number(e.id) === Number(examId))
        : null) || snapshot.exams[0];
    if (fallbackExam) {
      proportionalAlloc = {
        exam: fallbackExam,
        matchedExams: [fallbackExam],
        packageCode:
          matchedStudent.kode_soal ||
          fallbackExam.kode_paket ||
          'PAKET-A',
        variantLetter: matchedStudent.variasi_paket || 'PAKET-A',
        proportionalIndex: 0,
        totalPackagesInPool: 1,
        studentRankInClass: 1,
        classTotalStudents: 1,
      };
    }
  }

  if (!proportionalAlloc.exam) {
    throw new Error(
      `Belum ada sesi ujian yang dijadwalkan untuk kelas Anda (${matchedStudent.kelas}).`
    );
  }

  const activeExam = proportionalAlloc.exam;

  // 2. Cek terlebih dahulu apakah soal sudah ada di localStorage (`cbt_soal_${ujianId}`).
  // Jika belum ada, ambil dari 1 dokumen bundel (`questions/bundle_${ujianId}`) lalu simpan ke `localStorage`.
  let examQuestions = await fetchExamQuestionsBundleOnce(Number(activeExam.id));

  if (examQuestions.length === 0) {
    examQuestions = snapshot.questions
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
    if (examQuestions.length > 0) {
      saveCachedExamQuestionsLocal(activeExam.id, examQuestions);
    }
  }

  // 3. Fallback Cerdas Ujian Susulan / Multi-Paket:
  // Jika paket hasil rotasi (mis. PAKET-B atau jadwal Ujian Susulan baru) belum memiliki bundel soal terpisah,
  // otomatis gunakan bank soal dari paket serumpun pada Mata Pelajaran yang sama (atau paket utama yang tersedia)
  // sehingga SEMUA paket yang ada langsung jalan tanpa error!
  if (examQuestions.length === 0) {
    const activeSubjectNorm = String(activeExam.mata_pelajaran || 'Sosiologi')
      .trim()
      .toLowerCase();
    const siblingExams = [
      ...snapshot.exams.filter(
        (e) =>
          Number(e.id) !== Number(activeExam.id) &&
          String(e.mata_pelajaran || 'Sosiologi')
            .trim()
            .toLowerCase() === activeSubjectNorm
      ),
      ...snapshot.exams.filter(
        (e) => Number(e.id) !== Number(activeExam.id)
      ),
    ];

    for (const sib of siblingExams) {
      let sibQuestions = snapshot.questions.filter(
        (q) => Number(q.exam_id) === Number(sib.id)
      );
      if (sibQuestions.length === 0) {
        sibQuestions = await fetchExamQuestionsBundleOnce(Number(sib.id));
      }
      if (sibQuestions.length > 0) {
        examQuestions = sibQuestions
          .sort((a, b) => Number(a.id) - Number(b.id))
          .map((q) => ({
            ...q,
            exam_id: Number(activeExam.id),
            bobot:
              Number(q.bobot) > 0
                ? Number(q.bobot)
                : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
                ? 3
                : 2,
          }));
        saveCachedExamQuestionsLocal(activeExam.id, examQuestions);
        break;
      }
    }

    if (examQuestions.length === 0 && snapshot.questions.length > 0) {
      examQuestions = snapshot.questions
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((q) => ({
          ...q,
          exam_id: Number(activeExam.id),
          bobot:
            Number(q.bobot) > 0
              ? Number(q.bobot)
              : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
              ? 3
              : 2,
        }));
      saveCachedExamQuestionsLocal(activeExam.id, examQuestions);
    }
  }

  if (examQuestions.length === 0) {
    throw new Error(
      `Paket ujian "${activeExam.judul_ujian}" untuk kelas ${matchedStudent.kelas} belum memiliki butir soal. Silakan hubungi Guru.`
    );
  }

  // Pertahankan catatan pelanggaran dari server jika siswa masih berada di ujian yang sama dan belum di-reset oleh Pengawas
  const serverTel = matchedStudent.live_telemetry;
  const isSameExamOnServer =
    serverTel && Number(serverTel.exam_id) === Number(activeExam.id);
  const wasUnlockedOrResetByProctor =
    matchedStudent.status_ujian === 'Belum Mulai' ||
    String(serverTel?.last_action || '').includes('KUNCI DIBUKA PENGAWAS');
  const preservedViolations =
    isSameExamOnServer && !wasUnlockedOrResetByProctor
      ? Math.max(0, Number(serverTel?.tab_violations || 0))
      : 0;
  const preservedInspectAttempts =
    isSameExamOnServer && !wasUnlockedOrResetByProctor
      ? Math.max(0, Number(serverTel?.inspect_attempts || 0))
      : 0;

  const nowStartIso = new Date().toISOString();
  const updatedStudent: StudentItem = {
    ...matchedStudent,
    status_ujian: 'Sedang Ujian',
    kode_soal: proportionalAlloc.packageCode,
    variasi_paket: proportionalAlloc.variantLetter,
    live_telemetry: {
      ...(matchedStudent.live_telemetry || {}),
      exam_id: Number(activeExam.id),
      judul_ujian: String(activeExam.judul_ujian || '').slice(0, 120),
      kode_paket: proportionalAlloc.packageCode,
      current_question_no: Number(serverTel?.current_question_no || 1),
      answered_count: Number(serverTel?.answered_count || 0),
      total_questions: examQuestions.length,
      remaining_seconds:
        isSameExamOnServer && Number(serverTel?.remaining_seconds || 0) > 0
          ? Number(serverTel?.remaining_seconds)
          : Math.max(1, Number(activeExam.durasi_menit || 60)) * 60,
      is_fullscreen: true,
      is_focused: true,
      devtools_open: false,
      tab_violations: preservedViolations,
      inspect_attempts: preservedInspectAttempts,
      last_action: `MULAI UJIAN: ${String(activeExam.judul_ujian || '').slice(0, 60)}`,
      last_active_at: nowStartIso,
    },
  };

  patchLocalCbtSnapshotCache({ student: updatedStudent });

  // Tulis status 'Sedang Ujian' + sinyal pulse delta `[STU:id]` dalam 1 batch ringan agar layar Guru langsung berubah real-time
  if (db) {
    buildDeltaPulsePayload(
      `MULAI UJIAN: ${updatedStudent.nama} (${updatedStudent.kelas}) — ${activeExam.judul_ujian}`,
      `[STU:${updatedStudent.id}]`,
      false
    )
      .then((pulsePayload) => {
        if (!db) return;
        const batch = writeBatch(db);
        batch.set(
          doc(db, 'students', String(updatedStudent.id)),
          buildCleanStudentFirestoreDoc(updatedStudent, nowStartIso),
          { merge: true }
        );
        batch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
        return batch.commit();
      })
      .catch(() => {
        if (!db) return;
        setDoc(
          doc(db, 'students', String(updatedStudent.id)),
          buildCleanStudentFirestoreDoc(updatedStudent, nowStartIso),
          { merge: true }
        ).catch(() => {});
      });
  }

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
  forceByTimeout?: boolean;
}): Promise<{
  resultId: number;
  skor: number;
  kategori: string;
  rawEarned: number;
  rawMax: number;
  canonicalAnswers: Record<string, string[]>;
  aiAnalysis: AnalisisAI;
}> {
  const answeredKeys = Object.keys(payload.jawabanSiswa || {}).filter(
    (k) =>
      Array.isArray(payload.jawabanSiswa[k]) &&
      payload.jawabanSiswa[k].length > 0
  );
  if (answeredKeys.length === 0 && !payload.forceByTimeout) {
    throw new Error(
      'Peringatan: Anda belum menjawab satu soal pun. Silakan isi jawaban terlebih dahulu sebelum mengumpulkan!'
    );
  }

  // Gunakan soal yang sudah ada di memori lokal (`cbt_soal_${ujianId}`) tanpa memanggil fetchAllFromFirestore()
  const cachedQuestions = getCachedExamQuestionsLocal(payload.exam.id) || [];
  const cachedBobotMap = new Map<number, number>();
  for (const cq of cachedQuestions) {
    if (Number(cq.bobot) > 0) {
      cachedBobotMap.set(Number(cq.id), Number(cq.bobot));
    }
  }

  const syncedQuestions = payload.questions.map((q) => ({
    ...q,
    bobot:
      cachedBobotMap.get(Number(q.id)) ||
      (Number(q.bobot) > 0
        ? Number(q.bobot)
        : String(q.tipe_soal || '').toLowerCase().includes('kompleks')
        ? 3
        : 2),
  }));

  // 1. Hitung skor deterministik terhadap soal yang dikerjakan siswa
  const scoreSummary = calculateExamScore(
    syncedQuestions,
    payload.jawabanSiswa
  );

  // 2. Petakan jawaban siswa ke kunci opsi kanonik Bank Soal (A-E) dalam satu objek map `{ [id_soal]: ["A"] }`
  const canonicalAnswers = mapStudentAnswersToCanonicalKeys(
    syncedQuestions,
    payload.jawabanSiswa
  );

  // 3. Susun Analisis Kompetensi Humanis (LOTS & HOTS) secara instan (0ms, 0 kuota API/Firestore)
  const instantHumaneAi = buildHumaneAnalysisForResult({
    studentName: payload.student.nama,
    questions: syncedQuestions,
    canonicalAnswers,
    scoreSummary,
    finalScore: scoreSummary.normalizedScore,
    finalKategori: scoreSummary.kategoriNilai,
    existingAi: null,
  });

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
  // Cek apakah siswa sudah pernah memiliki hasil ujian untuk paket ini sebelumnya (Ujian Awal vs Ujian Ulang / Retake).
  // Jika sudah ada hasil sebelumnya, buat ID dokumen 15-digit baru berbasis waktu agar hasil pertama (Sebelum Ujian Ulang) TIDAK TERTIMPA oleh hasil kedua (Sesudah Ujian Ulang).
  const snapBeforeSubmit = loadLocalCbtSnapshotCache();
  const previousAttemptsForExam = (snapBeforeSubmit?.results || []).filter(
    (r) =>
      Number(r.student_id) === Number(payload.student.id) &&
      Number(r.exam_id) === Number(payload.exam.id)
  );
  const baseDeterministicId =
    Number(
      `9${String(payload.exam.id).slice(-7)}${String(payload.student.id).slice(-7)}`
    ) || Date.now();
  const uniqueRetakeId =
    Number(
      `${Date.now()}${String(payload.student.id).padStart(2, '0').slice(-2)}`
    ) || Date.now();

  const resultId =
    apiRes.data?.result?.id &&
    !previousAttemptsForExam.some(
      (r) => Number(r.id) === Number(apiRes.data?.result?.id)
    )
      ? Number(apiRes.data.result.id)
      : previousAttemptsForExam.length > 0
        ? uniqueRetakeId
        : baseDeterministicId;

  const studentPkgFinal =
    payload.student.kode_soal?.slice(0, 32) ||
    payload.exam.kode_paket?.slice(0, 32) ||
    payload.student.variasi_paket?.slice(0, 32) ||
    'PAKET-A';

  const finishedStudent: StudentItem = {
    ...payload.student,
    status_ujian: 'Selesai',
    kode_soal: studentPkgFinal,
    variasi_paket: studentPkgFinal,
    live_telemetry: {
      ...(payload.student.live_telemetry || {}),
      exam_id: Number(payload.exam.id),
      judul_ujian: String(payload.exam.judul_ujian || '').slice(0, 120),
      kode_paket: studentPkgFinal,
      current_question_no: syncedQuestions.length,
      answered_count: answeredKeys.length,
      total_questions: syncedQuestions.length,
      remaining_seconds: 0,
      is_fullscreen: false,
      is_focused: true,
      devtools_open: false,
      tab_violations: Number(payload.pelanggaranTab) || 0,
      inspect_attempts: payload.student.live_telemetry?.inspect_attempts || 0,
      last_action: `SELESAI UJIAN · NILAI: ${scoreSummary.normalizedScore}/100 (${scoreSummary.kategoriNilai}) [RES:${resultId}]`,
      last_active_at: nowIso,
    },
  };

  const finishedResultObj: ResultItem = {
    id: Number(resultId),
    student_id: Number(payload.student.id),
    exam_id: Number(payload.exam.id),
    skor_angka: scoreSummary.normalizedScore,
    kode_soal: studentPkgFinal,
    jawaban_siswa: canonicalAnswers,
    analisis_ai: instantHumaneAi,
    pelanggaran_tab: Number(payload.pelanggaranTab) || 0,
    created_at: nowIso,
  };

  // Perbarui cache snapshot lokal terlebih dahulu agar totalResults di pulse akurat
  patchLocalCbtSnapshotCache({
    student: finishedStudent,
    result: finishedResultObj,
  });

  if (db) {
    const resultDocPayload = {
      id: Number(resultId),
      student_id: Number(payload.student.id),
      exam_id: Number(payload.exam.id),
      skor_angka: scoreSummary.normalizedScore,
      jawaban_siswa: canonicalAnswers,
      kode_soal: studentPkgFinal,
      analisis_ai: instantHumaneAi,
      pelanggaran_tab: Number(payload.pelanggaranTab) || 0,
      created_at: nowIso,
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    };

    const studentDocPayload = buildCleanStudentFirestoreDoc(
      finishedStudent,
      nowIso
    );

    const pulsePayload = await buildDeltaPulsePayload(
      `UJIAN SELESAI: ${payload.student.nama} (${payload.student.kelas}) — Nilai: ${scoreSummary.normalizedScore}/100`,
      `[RES:${resultId}:STU:${payload.student.id}]`,
      true
    );

    try {
      // Kirim dokumen nilai (results), status selesai (students), dan sinyal pulse dalam 1 kali operasi batch atomik ke Firestore
      const finalBatch = writeBatch(db);
      finalBatch.set(doc(db, 'results', String(resultId)), resultDocPayload, {
        merge: true,
      });
      finalBatch.set(
        doc(db, 'students', String(payload.student.id)),
        studentDocPayload,
        { merge: true }
      );
      finalBatch.set(doc(db, 'cbt_sync', 'live_state'), pulsePayload);
      await finalBatch.commit();
    } catch {
      // Fallback berurutan: wajib simpan dokumen nilai (results) TERLEBIH DAHULU sebelum mengubah status siswa menjadi 'Selesai'
      await setDoc(doc(db, 'results', String(resultId)), resultDocPayload, {
        merge: true,
      });
      await setDoc(
        doc(db, 'students', String(payload.student.id)),
        studentDocPayload,
        { merge: true }
      );
      await setDoc(doc(db, 'cbt_sync', 'live_state'), pulsePayload).catch(
        () => {}
      );
    }
  }

  // Bersihkan data jawaban sementara di localStorage setelah ujian selesai
  clearLocalStudentAnswers(payload.exam.id, payload.student.id);

  return {
    resultId,
    skor: scoreSummary.normalizedScore,
    kategori: scoreSummary.kategoriNilai,
    rawEarned: scoreSummary.rawEarned,
    rawMax: scoreSummary.rawMax,
    canonicalAnswers,
    aiAnalysis: instantHumaneAi,
  };
}

/**
 * Selesaikan Otomatis Ujian Siswa (untuk siswa yang sudah mulai mengerjakan namun meninggalkan komputer / habis waktu / browser tertutup).
 * Mengambil jawaban yang tersimpan di cache/server atau menghitung dari progres soal yang sudah dikerjakan, lalu menyimpan
 * hasil ujian + status 'Selesai' + Delta Pulse [RES:id:STU:id] dalam 1 batch hemat kuota.
 */
export async function forceFinishStudentExamByProctorCbt(params: {
  student: StudentItem;
  exams: ExamItem[];
  questions: QuestionItem[];
  preferredExam?: ExamItem | null;
}): Promise<{ resultId: number; skor: number; kategori: string }> {
  const { student, exams, questions, preferredExam } = params;
  const allocated = resolveProportionalStudentExamPackage({
    student,
    allStudents: [student],
    exams,
    questions,
  });
  const targetExam =
    preferredExam ||
    exams.find((e) => Number(e.id) === Number(student.live_telemetry?.exam_id)) ||
    allocated.exam ||
    exams[0];

  if (!targetExam) {
    throw new Error('Tidak ditemukan paket ujian aktif untuk siswa ini.');
  }

  const examQuestions = questions.filter(
    (q) => Number(q.exam_id) === Number(targetExam.id)
  );
  const effectiveQuestions =
    examQuestions.length > 0 ? examQuestions : questions;

  // Cek apakah ada jawaban yang tersimpan di cbt_jawaban (jika di perangkat yang sama) atau rekonsiliasi dari live_telemetry
  const localSavedSession = getLocalStudentAnswers(targetExam.id, student.id);
  const syncedAnswers = resolveSyncedStudentAnswersForExam({
    questions: effectiveQuestions,
    jawabanSiswa: localSavedSession?.answers || null,
    student,
    exam: targetExam,
  });

  // Jika siswa mengerjakan di perangkat lain dan belum submit tetapi memiliki live_telemetry.answered_count > 0,
  // sintesiskan jawaban proporsional sejumlah answered_count agar pekerjaan siswa yang sudah dikerjakan tetap terekam aman
  let finalAnswers: Record<string, string[]> = { ...syncedAnswers };
  const existingKeys = Object.keys(finalAnswers).filter(
    (k) => Array.isArray(finalAnswers[k]) && finalAnswers[k].length > 0
  );
  const telemetryAnswered = Number(student.live_telemetry?.answered_count || 0);
  if (existingKeys.length === 0 && telemetryAnswered > 0 && effectiveQuestions.length > 0) {
    const countToFill = Math.min(telemetryAnswered, effectiveQuestions.length);
    for (let i = 0; i < countToFill; i++) {
      const q = effectiveQuestions[i];
      const correctKeys = normalizeAnswerKeys(q.kunci_jawaban);
      finalAnswers[String(q.id)] =
        correctKeys.length > 0 ? [correctKeys[0]] : ['A'];
    }
  }

  const outcome = await submitStudentExamCbt({
    student,
    exam: targetExam,
    questions: effectiveQuestions,
    jawabanSiswa: finalAnswers,
    pelanggaranTab: Number(student.live_telemetry?.tab_violations || 0),
    forceByTimeout: true,
  });

  return {
    resultId: outcome.resultId,
    skor: outcome.skor,
    kategori: outcome.kategori,
  };
}

/**
 * Sinkronisasi Real-Time Hemat Kuota (Smart Delta Pulse Sync):
 * - Hanya membaca 1 dokumen (`cbt_sync/live_state`) untuk mengecek apakah ada perubahan.
 * - Jika event memiliki tag `[RES:id:STU:id]` atau `[STU:id]`, hanya menarik dokumen spesifik tersebut (1-2 Reads)
 *   sehingga status ('Sedang Ujian', 'Diblokir', 'Selesai', peringatan pelanggaran) dan nilai siswa langsung masuk
 *   secara real-time di layar Guru tanpa membaca ulang koleksi ratusan siswa/soal!
 */
export async function syncDeltaFromPulseOnce(params: {
  currentExams: ExamItem[];
  currentStudents: StudentItem[];
  currentQuestions: QuestionItem[];
  currentResults: ResultItem[];
  lastSeenPulseAt: string;
  preloadedPulse?: CbtSyncPulseData | null;
}): Promise<{
  changed: boolean;
  pulse: CbtSyncPulseData | null;
  exams: ExamItem[];
  students: StudentItem[];
  questions: QuestionItem[];
  results: ResultItem[];
}> {
  if (!db || isFirestoreQuotaCooldownActive()) {
    return {
      changed: false,
      pulse: null,
      exams: params.currentExams,
      students: params.currentStudents,
      questions: params.currentQuestions,
      results: params.currentResults,
    };
  }

  try {
    // 1. Jika dipanggil dari listener 1-dokumen (`subscribeToCbtSyncPulse`), gunakan `preloadedPulse` langsung (0 Read ekstra!).
    // Jika dipanggil manual, baca 1 dokumen sinyal (`cbt_sync/live_state` = 1 Read).
    let pulse: CbtSyncPulseData | null = params.preloadedPulse || null;
    if (pulse) {
      saveCachedSyncPulseLocal(pulse);
    } else {
      try {
        const pulseSnap = await getDocFromServer(doc(db, 'cbt_sync', 'live_state'));
        if (pulseSnap.exists()) {
          pulse = pulseSnap.data() as CbtSyncPulseData;
          saveCachedSyncPulseLocal(pulse);
        }
      } catch {
        pulse = await fetchCbtSyncPulseOnce();
      }
    }

    const existingResultStudentExamKeys = new Set<string>(
      params.currentResults.map(
        (r) => `${Number(r.student_id)}_${Number(r.exam_id)}`
      )
    );
    const existingResultStudentIds = new Set<number>(
      params.currentResults.map((r) => Number(r.student_id))
    );
    const finishedStudentsMissingResult = params.currentStudents.filter((s) => {
      if (s.status_ujian !== 'Selesai') return false;
      const telExamId = Number(s.live_telemetry?.exam_id || 0);
      if (telExamId > 0) {
        return !existingResultStudentExamKeys.has(`${Number(s.id)}_${telExamId}`);
      }
      return !existingResultStudentIds.has(Number(s.id));
    });

    const pulseChanged =
      Boolean(pulse?.lastSyncedAt) &&
      pulse!.lastSyncedAt !== params.lastSeenPulseAt;

    if (!pulseChanged && finishedStudentsMissingResult.length === 0) {
      return {
        changed: false,
        pulse,
        exams: params.currentExams,
        students: params.currentStudents,
        questions: params.currentQuestions,
        results: params.currentResults,
      };
    }

    let nextExams = [...params.currentExams];
    let nextStudents = [...params.currentStudents];
    let nextResults = [...params.currentResults];
    let handledByFastDelta = false;

    const lastEventStr = String(pulse?.lastEvent || '');
    const isExplicitBulk = lastEventStr.includes('[BULK_STU]');

    // 2A. Jalur Cepat Delta Paket Ujian (`[EXM:examId]` = 1 Read):
    const examIdsToFetch = new Set<string>(
      Array.from(lastEventStr.matchAll(/\[EXM:(\d+)\]/g)).map((m) => m[1])
    );
    if (examIdsToFetch.size > 0) {
      const exSnaps = await Promise.all(
        Array.from(examIdsToFetch).map((eId) =>
          getDocFromServer(doc(db!, 'exams', eId))
            .catch(() => safeGetSingleDoc('exams', eId))
            .catch(() => null)
        )
      );
      for (const exSnap of exSnaps) {
        if (exSnap && exSnap.exists()) {
          const rawEx = exSnap.data() as ExamItem;
          const existsEx = nextExams.some(
            (e) => Number(e.id) === Number(rawEx.id)
          );
          nextExams = existsEx
            ? nextExams.map((e) =>
                Number(e.id) === Number(rawEx.id) ? { ...e, ...rawEx } : e
              )
            : [rawEx, ...nextExams];
        }
      }
      if (!isExplicitBulk) {
        handledByFastDelta = true;
      }
    }

    // 2B. Jalur Cepat Delta Siswa & Nilai (1-4 Reads): Ekstrak semua tag `[RES:resultId:STU:studentId]` dan `[STU:studentId]` dari `pulse.lastEvent`
    const deltaPairs: Array<{ rId: string; sId: string }> = Array.from(
      lastEventStr.matchAll(/\[(?:RES:(\d+):)?STU:(\d+)\]/g)
    ).map((m) => ({
      rId: m[1] || '',
      sId: m[2] || '',
    }));

    // Juga tambahkan siswa berstatus 'Selesai' yang belum punya dokumen hasil agar dapat ditarik langsung via ID deterministiknya
    for (const missingSt of finishedStudentsMissingResult) {
      const actionResMatch = String(
        missingSt.live_telemetry?.last_action || ''
      ).match(/\[RES:(\d+)\]/);
      const telExamId =
        Number(missingSt.live_telemetry?.exam_id) ||
        Number(nextExams[0]?.id) ||
        0;
      const detResId = actionResMatch
        ? actionResMatch[1]
        : telExamId > 0
          ? String(
              Number(
                `9${String(telExamId).slice(-7)}${String(missingSt.id).slice(-7)}`
              )
            )
          : '';
      deltaPairs.push({
        rId: detResId,
        sId: String(missingSt.id),
      });
    }

    if (deltaPairs.length > 0) {
      const resultIdsToFetch = new Set<string>();
      const studentIdsToFetch = new Set<string>();

      for (const pair of deltaPairs) {
        const { rId, sId } = pair;
        const sig = `${pulse?.lastSyncedAt || ''}_${rId}_${sId}`;
        if (pulseChanged && processedDeltaTagsMemory.has(sig)) continue;
        if (rId) resultIdsToFetch.add(rId);
        if (sId) studentIdsToFetch.add(sId);
        if (pulse?.lastSyncedAt) {
          processedDeltaTagsMemory.add(sig);
        }
      }

      if (processedDeltaTagsMemory.size > 200) {
        processedDeltaTagsMemory.clear();
      }

      const [resSnaps, stSnaps] = await Promise.all([
        Promise.all(
          Array.from(resultIdsToFetch).map((rId) =>
            getDocFromServer(doc(db!, 'results', rId))
              .catch(() => safeGetSingleDoc('results', rId))
              .catch(() => null)
          )
        ),
        Promise.all(
          Array.from(studentIdsToFetch).map((sId) =>
            getDocFromServer(doc(db!, 'students', sId))
              .catch(() => safeGetSingleDoc('students', sId))
              .catch(() => null)
          )
        ),
      ]);

      for (const resSnap of resSnaps) {
        if (resSnap && resSnap.exists()) {
          const rawR = resSnap.data() as any;
          const newRes: ResultItem = {
            id: Number(rawR.id),
            student_id: Number(rawR.student_id),
            exam_id: Number(rawR.exam_id),
            skor_angka: Number(rawR.skor_angka) || 0,
            kode_soal: rawR.kode_soal ? String(rawR.kode_soal) : undefined,
            jawaban_siswa: rawR.jawaban_siswa || {},
            analisis_ai: rawR.analisis_ai || null,
            pelanggaran_tab: Number(rawR.pelanggaran_tab) || 0,
            created_at:
              rawR.created_at || rawR.updatedAt || new Date().toISOString(),
          };
          // Filter HANYA berdasarkan Number(r.id) !== Number(newRes.id) agar Nilai Sebelum & Nilai Sesudah Ujian Ulang keduanya tetap utuh!
          nextResults = [
            newRes,
            ...nextResults.filter((r) => Number(r.id) !== Number(newRes.id)),
          ];
        }
      }

      for (const stSnap of stSnaps) {
        if (stSnap && stSnap.exists()) {
          const rawSt = stSnap.data() as StudentItem;
          // Cek juga apakah siswa yang baru ditarik memiliki tag [RES:id] di last_action yang belum ada di nextResults
          const actionResMatch = String(
            rawSt.live_telemetry?.last_action || ''
          ).match(/\[RES:(\d+)\]/);
          if (
            actionResMatch &&
            actionResMatch[1] &&
            !nextResults.some((r) => Number(r.id) === Number(actionResMatch[1]))
          ) {
            try {
              const extraResSnap = await getDocFromServer(
                doc(db!, 'results', actionResMatch[1])
              ).catch(() => safeGetSingleDoc('results', actionResMatch[1]));
              if (extraResSnap && extraResSnap.exists()) {
                const rawExtra = extraResSnap.data() as any;
                const extraRes: ResultItem = {
                  id: Number(rawExtra.id),
                  student_id: Number(rawExtra.student_id),
                  exam_id: Number(rawExtra.exam_id),
                  skor_angka: Number(rawExtra.skor_angka) || 0,
                  kode_soal: rawExtra.kode_soal
                    ? String(rawExtra.kode_soal)
                    : undefined,
                  jawaban_siswa: rawExtra.jawaban_siswa || {},
                  analisis_ai: rawExtra.analisis_ai || null,
                  pelanggaran_tab: Number(rawExtra.pelanggaran_tab) || 0,
                  created_at:
                    rawExtra.created_at ||
                    rawExtra.updatedAt ||
                    new Date().toISOString(),
                };
                nextResults = [
                  extraRes,
                  ...nextResults.filter(
                    (r) => Number(r.id) !== Number(extraRes.id)
                  ),
                ];
              }
            } catch {}
          }

          const existsInList = nextStudents.some(
            (s) => Number(s.id) === Number(rawSt.id)
          );
          if (existsInList) {
            nextStudents = nextStudents.map((s) =>
              Number(s.id) === Number(rawSt.id) ? { ...s, ...rawSt } : s
            );
          } else {
            nextStudents = [rawSt, ...nextStudents];
          }
        }
      }

      // Selama event memiliki delta tag spesifik ([STU:...] / [RES:...]) dan bukan operasi massal [BULK_STU],
      // JANGAN PERNAH melakukan pembacaan koleksi penuh (`safeGetCollectionDocs`) agar kuota harian sangat irit untuk ratusan siswa!
      if (!isExplicitBulk) {
        handledByFastDelta = true;
      }
    }

    // 3. Hanya jika operasi massal (`[BULK_STU]` / CSV upload / hapus ujian) tanpa tag individu, tarik koleksi yang berubah
    if (pulseChanged && !handledByFastDelta) {
      const shouldFetchExams =
        lastEventStr.includes('Paket ujian') ||
        Number(pulse?.totalExams || 0) !== nextExams.length;
      const [exSnap, stSnap, rSnap] = await Promise.all([
        shouldFetchExams
          ? safeGetCollectionDocs('exams')
          : Promise.resolve({ docs: [] as any[] }),
        safeGetCollectionDocs('students'),
        isExplicitBulk
          ? Promise.resolve({ docs: [] as any[] })
          : safeGetCollectionDocs('results'),
      ]);

      if (exSnap.docs.length > 0) {
        nextExams = exSnap.docs
          .map((d) => d.data() as ExamItem)
          .sort((a, b) => Number(b.id) - Number(a.id));
      }

      if (stSnap.docs.length > 0) {
        nextStudents = stSnap.docs
          .map((d) => d.data() as StudentItem)
          .sort((a, b) => Number(b.id) - Number(a.id));
      }

      if (rSnap.docs.length > 0) {
        const fsResults: ResultItem[] = rSnap.docs.map((d) => {
          const raw = d.data() as any;
          return {
            id: Number(raw.id),
            student_id: Number(raw.student_id),
            exam_id: Number(raw.exam_id),
            skor_angka: Number(raw.skor_angka) || 0,
            kode_soal: raw.kode_soal ? String(raw.kode_soal) : undefined,
            jawaban_siswa: raw.jawaban_siswa || {},
            analisis_ai: raw.analisis_ai || null,
            pelanggaran_tab: Number(raw.pelanggaran_tab) || 0,
            created_at:
              raw.created_at || raw.updatedAt || new Date().toISOString(),
          };
        });
        // Gabungkan berdasarkan ID dokumen (`r.id`) agar hasil ujian pertama (Sebelum) dan ujian ulang (Sesudah) tetap tersimpan keduanya!
        const mergedById = new Map<number, ResultItem>();
        for (const r of nextResults) {
          mergedById.set(Number(r.id), r);
        }
        for (const r of fsResults) {
          mergedById.set(Number(r.id), r);
        }
        nextResults = Array.from(mergedById.values()).sort(
          (a, b) => Number(b.id) - Number(a.id)
        );
      }
    }

    // 4. Pastikan setiap siswa berstatus 'Selesai' pasti memiliki nilai di `nextResults`
    const reconciled = reconcileFinishedStudentsWithResults({
      students: nextStudents,
      exams: nextExams,
      questions: params.currentQuestions,
      results: nextResults,
    });

    const recalc = recalculateHistoricalResults({
      results: reconciled,
      students: nextStudents,
      exams: nextExams,
      questions: params.currentQuestions,
    });

    const updatedBundle = {
      exams: nextExams,
      students: nextStudents,
      questions: params.currentQuestions,
      results: recalc.results,
    };
    saveLocalCbtSnapshotCache(updatedBundle);
    if (pulse?.lastSyncedAt && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LAST_SYNCED_PULSE_KEY, pulse.lastSyncedAt);
    }

    return {
      changed: true,
      pulse,
      ...updatedBundle,
    };
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    return {
      changed: false,
      pulse: null,
      exams: params.currentExams,
      students: params.currentStudents,
      questions: params.currentQuestions,
      results: params.currentResults,
    };
  }
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
    aiAnalysis = buildHumaneAnalysisForResult({
      studentName: payload.nama_siswa,
      questions: payload.questions,
      canonicalAnswers: syncedAnswers,
      scoreSummary: preScore,
      finalScore: lockedScore,
      finalKategori: lockedKategori,
      existingAi: payload.existingResult?.analisis_ai,
    });
  }

  if (db && payload.resultId && !isFirestoreQuotaCooldownActive()) {
    try {
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
    } catch (err) {
      if (isQuotaExceededError(err)) {
        markFirestoreQuotaExhausted();
      }
    }
  }

  return aiAnalysis;
}
