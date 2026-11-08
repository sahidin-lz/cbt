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
} from '../utils/cbtLogic';

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
    const [exSnap, stSnap, qSnap, rSnap] = await Promise.all([
      counts?.exams !== undefined ? null : getDocs(cbtCollectionQuery('exams')),
      counts?.students !== undefined ? null : getDocs(cbtCollectionQuery('students')),
      counts?.questions !== undefined ? null : getDocs(cbtCollectionQuery('questions')),
      counts?.results !== undefined ? null : getDocs(cbtCollectionQuery('results')),
    ]);

    const pulse: CbtSyncPulseData = {
      lastSyncedAt: nowIso,
      lastEvent: eventText.slice(0, 200),
      totalExams: counts?.exams ?? exSnap?.size ?? 0,
      totalStudents: counts?.students ?? stSnap?.size ?? 0,
      totalQuestions: counts?.questions ?? qSnap?.size ?? 0,
      totalResults: counts?.results ?? rSnap?.size ?? 0,
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

    return { exams, students, questions, results };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, 'exams|students|questions|results');
    } catch {
      // Logged
    }
    return null;
  }
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
      batch.set(doc(db, 'exams', String(ex.id)), {
        id: Number(ex.id),
        judul_ujian: String(ex.judul_ujian || '').slice(0, 200),
        durasi_menit: Number(ex.durasi_menit) || 60,
        target_tingkat: String(ex.target_tingkat || 'SEMUA').slice(0, 16),
        target_kelas: String(ex.target_kelas || 'SEMUA').slice(0, 64),
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    }

    for (const st of data.students) {
      batch.set(doc(db, 'students', String(st.id)), {
        id: Number(st.id),
        nama: String(st.nama || '').slice(0, 150),
        kelas: String(st.kelas || '').slice(0, 64),
        token_ujian: String(st.token_ujian || '').slice(0, 6),
        status_ujian: String(st.status_ujian || 'Belum Mulai').slice(0, 32),
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
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
    return {
      exams: apiRes.data.exams || [],
      students: apiRes.data.students || [],
      questions: apiRes.data.questions || [],
      results: apiRes.data.results || [],
    };
  }

  if (firestoreData) {
    return firestoreData;
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
  const examRecord: ExamItem =
    apiRes.ok && apiRes.data?.exam
      ? apiRes.data.exam
      : {
          id: editingExamId || Date.now(),
          judul_ujian: payload.judul_ujian.trim(),
          durasi_menit: Math.max(5, Number(payload.durasi_menit) || 60),
          target_tingkat: payload.target_tingkat || 'SEMUA',
          target_kelas: payload.target_kelas || 'SEMUA',
        };

  if (db) {
    await setDoc(doc(db, 'exams', String(examRecord.id)), {
      id: Number(examRecord.id),
      judul_ujian: examRecord.judul_ujian.slice(0, 200),
      durasi_menit: Number(examRecord.durasi_menit),
      target_tingkat: examRecord.target_tingkat.slice(0, 16),
      target_kelas: examRecord.target_kelas.slice(0, 64),
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });
    await updateFirestorePulse(
      `Paket ujian disimpan: ${examRecord.judul_ujian} (Tingkat ${examRecord.target_tingkat})`
    );
  }

  return examRecord;
}

export async function deleteExamCbt(examId: number, title: string): Promise<void> {
  await safeApiJson(`/api/exams/${examId}`, { method: 'DELETE' });
  if (db) {
    await deleteDoc(doc(db, 'exams', String(examId)));
    await updateFirestorePulse(`Paket ujian "${title}" dihapus`);
  }
}

export async function saveStudentCbt(
  payload: { nama: string; kelas: string },
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
  const studentRecord: StudentItem =
    apiRes.ok && apiRes.data?.student
      ? apiRes.data.student
      : {
          id: editingStudentId || Date.now(),
          nama: payload.nama.trim(),
          kelas: payload.kelas.trim(),
          token_ujian: existingStudent?.token_ujian || generateExamToken(),
          status_ujian: existingStudent?.status_ujian || 'Belum Mulai',
        };

  if (db) {
    await setDoc(doc(db, 'students', String(studentRecord.id)), {
      id: Number(studentRecord.id),
      nama: studentRecord.nama.slice(0, 150),
      kelas: studentRecord.kelas.slice(0, 64),
      token_ujian: studentRecord.token_ujian.slice(0, 6),
      status_ujian: studentRecord.status_ujian.slice(0, 32),
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });
    await updateFirestorePulse(
      `Data siswa disimpan: ${studentRecord.nama} (${studentRecord.kelas})`
    );
  }

  return studentRecord;
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
      batch.set(doc(db, 'students', String(st.id)), {
        id: Number(st.id),
        nama: st.nama.slice(0, 150),
        kelas: st.kelas.slice(0, 64),
        token_ujian: st.token_ujian.slice(0, 6),
        status_ujian: st.status_ujian.slice(0, 32),
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
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

  const updated: StudentItem =
    apiRes.ok && apiRes.data?.student
      ? apiRes.data.student
      : {
          ...student,
          token_ujian: generateExamToken(),
          status_ujian: 'Belum Mulai',
        };

  if (db) {
    await setDoc(doc(db, 'students', String(updated.id)), {
      id: Number(updated.id),
      nama: updated.nama.slice(0, 150),
      kelas: updated.kelas.slice(0, 64),
      token_ujian: updated.token_ujian.slice(0, 6),
      status_ujian: updated.status_ujian.slice(0, 32),
      authorUid: 'sahidin30@gmail.com',
      updatedAt: new Date().toISOString(),
    });
    await updateFirestorePulse(
      `Token baru dibuat untuk ${updated.nama}: ${updated.token_ujian}`
    );
  }

  return updated;
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
  const cleanToken = token_ujian.toUpperCase().trim();

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
      token_ujian: cleanToken,
      examId,
    }),
  });

  if (apiRes.isApiAvailable) {
    if (!apiRes.ok || apiRes.data?.error) {
      throw new Error(apiRes.data?.error || 'Gagal memulai sesi ujian.');
    }
    if (apiRes.data?.student && apiRes.data?.exam && apiRes.data?.questions) {
      return {
        student: apiRes.data.student,
        exam: apiRes.data.exam,
        questions: apiRes.data.questions,
      };
    }
  }

  // Fallback / Direct Firebase Firestore verification (for Vercel static deployments)
  const fsData = await fetchAllFromFirestore();
  if (!fsData) {
    throw new Error('Tidak dapat terhubung ke database Firebase Firestore.');
  }

  const matchedStudent = fsData.students.find(
    (s) => s.token_ujian.toUpperCase() === cleanToken
  );
  if (!matchedStudent) {
    throw new Error(
      'Token Ujian tidak ditemukan di database siswa. Hubungi Guru/Pengawas Anda.'
    );
  }

  if (fsData.exams.length === 0) {
    throw new Error(
      'Belum ada Paket Ujian yang aktif. Silakan tunggu Guru mengaktifkan ujian.'
    );
  }

  const matchedExams = fsData.exams.filter((ex) =>
    isExamMatchedForStudentClass(ex, matchedStudent.kelas)
  );
  if (matchedExams.length === 0) {
    throw new Error(
      `Tidak ditemukan Paket Ujian yang didistribusikan untuk kelas Anda (${matchedStudent.kelas}). Hubungi Guru Pengawas.`
    );
  }

  const activeExam =
    (examId ? matchedExams.find((e) => e.id === examId) : matchedExams[0]) ||
    matchedExams[0];

  const examQuestions = fsData.questions.filter(
    (q) => q.exam_id === activeExam.id
  );
  if (examQuestions.length === 0) {
    throw new Error(
      `Paket ujian "${activeExam.judul_ujian}" untuk kelas ${matchedStudent.kelas} belum memiliki butir soal. Silakan hubungi Guru.`
    );
  }

  const updatedStudent: StudentItem = {
    ...matchedStudent,
    nama: cleanNama,
    status_ujian: 'Sedang Ujian',
  };

  if (db) {
    await setDoc(doc(db, 'students', String(updatedStudent.id)), {
      id: Number(updatedStudent.id),
      nama: updatedStudent.nama.slice(0, 150),
      kelas: updatedStudent.kelas.slice(0, 64),
      token_ujian: updatedStudent.token_ujian.slice(0, 6),
      status_ujian: 'Sedang Ujian',
      authorUid: 'sahidin30@gmail.com',
      updatedAt: new Date().toISOString(),
    });
    await updateFirestorePulse(
      `Siswa mulai ujian: ${updatedStudent.nama} (${updatedStudent.kelas}) — ${activeExam.judul_ujian}`
    );
  }

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
}> {
  const scoreSummary = calculateExamScore(
    payload.questions,
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
      jawabanSiswa: payload.jawabanSiswa,
      pelanggaranTab: payload.pelanggaranTab,
    }),
  });

  const nowIso = new Date().toISOString();
  const resultId = apiRes.data?.result?.id || Date.now();

  if (db) {
    await setDoc(doc(db, 'students', String(payload.student.id)), {
      id: Number(payload.student.id),
      nama: payload.student.nama.slice(0, 150),
      kelas: payload.student.kelas.slice(0, 64),
      token_ujian: payload.student.token_ujian.slice(0, 6),
      status_ujian: 'Selesai',
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });

    await setDoc(doc(db, 'results', String(resultId)), {
      id: Number(resultId),
      student_id: Number(payload.student.id),
      exam_id: Number(payload.exam.id),
      skor_angka: scoreSummary.normalizedScore,
      jawaban_siswa: payload.jawabanSiswa,
      analisis_ai: null,
      pelanggaran_tab: Number(payload.pelanggaranTab) || 0,
      created_at: nowIso,
      authorUid: 'sahidin30@gmail.com',
      updatedAt: nowIso,
    });

    await updateFirestorePulse(
      `Ujian selesai dikumpulkan: ${payload.student.nama} (Skor ${scoreSummary.normalizedScore}/100)`
    );
  }

  return {
    resultId,
    skor: scoreSummary.normalizedScore,
    kategori: scoreSummary.kategoriNilai,
    rawEarned: scoreSummary.rawEarned,
    rawMax: scoreSummary.rawMax,
  };
}

export async function generateAiAnalysisCbt(payload: {
  resultId?: number;
  nama_siswa: string;
  questions: QuestionItem[];
  jawaban_siswa: Record<string, string[]>;
  existingResult?: ResultItem;
}): Promise<AnalisisAI> {
  const apiRes = await safeApiJson<AnalisisAI & { error?: string }>(
    '/api/analyze',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resultId: payload.resultId,
        nama_siswa: payload.nama_siswa,
        questions: payload.questions,
        jawaban_siswa: payload.jawaban_siswa,
      }),
    }
  );

  let aiAnalysis: AnalisisAI;

  if (apiRes.ok && apiRes.data && apiRes.data.analisis_kompetensi) {
    aiAnalysis = apiRes.data;
  } else {
    // Structured cognitive LOTS vs HOTS evaluation rubric when running on static Vercel without backend server
    const scoreSummary = calculateExamScore(
      payload.questions,
      payload.jawaban_siswa
    );
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
      skor_akhir: scoreSummary.normalizedScore,
      kategori_nilai: scoreSummary.kategoriNilai,
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

  if (db && payload.resultId) {
    const nowIso = new Date().toISOString();
    const baseResult = payload.existingResult;
    if (baseResult) {
      await setDoc(doc(db, 'results', String(payload.resultId)), {
        id: Number(payload.resultId),
        student_id: Number(baseResult.student_id),
        exam_id: Number(baseResult.exam_id),
        skor_angka: aiAnalysis.skor_akhir,
        jawaban_siswa: baseResult.jawaban_siswa || payload.jawaban_siswa,
        analisis_ai: aiAnalysis,
        pelanggaran_tab: Number(baseResult.pelanggaran_tab) || 0,
        created_at: baseResult.created_at || nowIso,
        authorUid: 'sahidin30@gmail.com',
        updatedAt: nowIso,
      });
    }
    await updateFirestorePulse(
      `Evaluasi AI selesai untuk ${payload.nama_siswa} (${aiAnalysis.skor_akhir}/100)`
    );
  }

  return aiAnalysis;
}
