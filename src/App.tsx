import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, UserCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { StudentExamPortal } from './components/StudentExamPortal';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from './types/cbt';
import { subscribeToCbtSyncPulse, CbtSyncPulseData } from './lib/firebase';
import {
  loadLocalCbtSnapshotCache,
  saveLocalCbtSnapshotCache,
  loadUnifiedDashboardData,
  reconcileFinishedStudentsWithResults,
  syncDeltaFromPulseOnce,
  stripQuestionKeysForStudent,
} from './lib/cbtFirestoreService';
import { CBT_DASHBOARD_QUERY_KEY } from './lib/queryClient';

const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

interface CbtSnapshotData {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
}

function getInitialDashboardSnapshot(): CbtSnapshotData {
  const initialCache = loadLocalCbtSnapshotCache();
  return {
    exams: initialCache?.exams || [],
    questions: initialCache?.questions || [],
    students: initialCache?.students || [],
    results: initialCache?.results || [],
  };
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const portalView: 'student' | 'teacher' = location.pathname.startsWith('/admin')
    ? 'teacher'
    : 'student';

  const [isStudentInExam, setIsStudentInExam] = useState<boolean>(false);

  const { data: dashboardData } = useQuery<CbtSnapshotData>({
    queryKey: CBT_DASHBOARD_QUERY_KEY,
    initialData: getInitialDashboardSnapshot,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 30,
  });

  const exams = dashboardData?.exams || [];
  const questions = dashboardData?.questions || [];
  const students = dashboardData?.students || [];
  const results = dashboardData?.results || [];

  const snapshotRef = useRef<CbtSnapshotData>({
    exams,
    questions,
    students,
    results,
  });
  snapshotRef.current = { exams, questions, students, results };

  const setDashboardSnapshot = useCallback(
    (updater: CbtSnapshotData | ((prev: CbtSnapshotData) => CbtSnapshotData)) => {
      queryClient.setQueryData<CbtSnapshotData>(CBT_DASHBOARD_QUERY_KEY, (prev) => {
        const current = prev || getInitialDashboardSnapshot();
        return typeof updater === 'function' ? updater(current) : updater;
      });
    },
    [queryClient]
  );

  // One-time Firebase sync state & light pulse
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);
  const [syncPulse, setSyncPulse] = useState<CbtSyncPulseData | null>(null);
  const lastSeenPulseAtRef = useRef<string>('');

  // Persist last admin sub-tab path when navigating around admin console
  useEffect(() => {
    try {
      if (location.pathname.startsWith('/admin')) {
        localStorage.setItem('cbt_active_portal', 'teacher');
        localStorage.setItem('cbt_admin_last_path', location.pathname);
      } else {
        localStorage.setItem('cbt_active_portal', 'student');
      }
    } catch {}
  }, [location.pathname]);

  // Restore last admin route if returning on teacher session without an active student exam
  useEffect(() => {
    try {
      const activeStudentRaw = localStorage.getItem('cbt_active_student_session');
      if (activeStudentRaw) {
        const parsed = JSON.parse(activeStudentRaw);
        if (parsed?.student && parsed?.exam) {
          if (location.pathname.startsWith('/admin')) {
            navigate('/', { replace: true });
          }
          return;
        }
      }
      if (
        location.pathname === '/' &&
        localStorage.getItem('cbt_active_portal') === 'teacher' &&
        localStorage.getItem('cbt_teacher_auth') === 'true'
      ) {
        const savedPath = localStorage.getItem('cbt_admin_last_path') || '/admin/ujian';
        navigate(savedPath, { replace: true });
      }
    } catch {}
  }, []);

  // Reconcile any finished students missing result records using local answer backup
  const applyData = useCallback(
    (data: CbtSnapshotData) => {
      const safeExams = data.exams || [];
      const safeQuestions = data.questions || [];
      const safeStudents = data.students || [];
      const reconciledResults = reconcileFinishedStudentsWithResults({
        students: safeStudents,
        exams: safeExams,
        questions: safeQuestions,
        results: data.results || [],
      });
      const next: CbtSnapshotData = {
        exams: safeExams,
        questions: safeQuestions,
        students: safeStudents,
        results: reconciledResults,
      };
      setDashboardSnapshot(next);
      saveLocalCbtSnapshotCache(next);
    },
    [setDashboardSnapshot]
  );

  // Synchronous Instant Hydration from Local Cache (0 Firestore reads on instant UI mutations)
  const syncDashboardFromLocalCache = useCallback(() => {
    const cached = loadLocalCbtSnapshotCache();
    if (cached) {
      applyData(cached);
    }
  }, [applyData]);

  // Full background pull (only used at initial login/load or explicit Manual Sync button)
  const loadDataFromFirestore = useCallback(
    async (silent: boolean = false) => {
      if (!silent) {
        setIsSyncingFirebase(true);
      }
      try {
        const remote = await loadUnifiedDashboardData({
          checkPulseFirst: silent,
        });
        applyData(remote);
      } catch (err) {
        console.error('Failed to sync CBT data from Firestore:', err);
      } finally {
        if (!silent) {
          setIsSyncingFirebase(false);
        }
      }
    },
    [applyData]
  );

  // Initial startup load: display cached data immediately & silently reconcile delta
  useEffect(() => {
    const hasLocal =
      exams.length > 0 || students.length > 0 || questions.length > 0;
    loadDataFromFirestore(hasLocal);
  }, []);

  // Ultra-lightweight 1-document real-time pulse listener with DELTA-ONLY sync:
  // Saves 90-99% daily Firestore reads for hundreds of concurrent students!
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToCbtSyncPulse((pulse) => {
      setSyncPulse(pulse);
      if (pulse.lastSyncedAt && pulse.lastSyncedAt !== lastSeenPulseAtRef.current) {
        const prevSeenAt = lastSeenPulseAtRef.current;
        lastSeenPulseAtRef.current = pulse.lastSyncedAt;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (!prevSeenAt) return;
          const snap = snapshotRef.current;
          syncDeltaFromPulseOnce({
            currentExams: snap.exams,
            currentStudents: snap.students,
            currentQuestions: snap.questions,
            currentResults: snap.results,
            lastSeenPulseAt: prevSeenAt,
            preloadedPulse: pulse,
          })
            .then((deltaResult) => {
              if (!deltaResult.changed) return;
              applyData({
                exams: deltaResult.exams,
                questions: deltaResult.questions,
                students: deltaResult.students,
                results: deltaResult.results,
              });
            })
            .catch(() => {
              syncDashboardFromLocalCache();
            });
        }, 450);
      }
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [applyData, syncDashboardFromLocalCache]);

  const handlePortalSwitch = (target: 'student' | 'teacher') => {
    if (isStudentInExam && target === 'teacher') {
      return;
    }
    if (target === 'teacher') {
      let targetPath = '/admin/ujian';
      try {
        targetPath = localStorage.getItem('cbt_admin_last_path') || '/admin/ujian';
      } catch {}
      navigate(targetPath);
    } else {
      navigate('/');
    }
  };

  // Expose ONLY active (non-archived) questions for new student exams; keep full `questions` for Admin reports & historical review
  const activeQuestions = questions.filter((q) => !q.is_archived_version);
  // Strict Server-Side Security: never expose `kunci_jawaban` to client React tree during active student exam
  const studentPortalQuestions = isStudentInExam
    ? stripQuestionKeysForStudent(activeQuestions)
    : activeQuestions;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Persistent Top Portal Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => !isStudentInExam && handlePortalSwitch('student')}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm sm:text-base font-bold text-slate-900 tracking-tight block">
                CBT Sosiologi &amp; Analisis Kognitif HOTS
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:block">
                Portal Evaluasi Pembelajaran Berbasis Komputer (LOTS &amp; HOTS)
              </span>
            </div>
          </button>

          {/* Dual Role Navigation Switcher — Locked while student is taking exam */}
          {isStudentInExam ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>Mode Ujian Aktif (Navigasi Portal Dikunci)</span>
            </div>
          ) : (
            <nav
              aria-label="Pilih Portal Pengguna"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
            >
              <button
                type="button"
                onClick={() => handlePortalSwitch('student')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  portalView === 'student'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Portal Siswa &amp; Laporan</span>
              </button>
              <button
                type="button"
                onClick={() => handlePortalSwitch('teacher')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  portalView === 'teacher'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Konsol Guru &amp; Pengawas</span>
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Main View Content via React Router */}
      <main className="flex-1">
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense
                fallback={
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center gap-3 text-slate-600">
                    <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                    <span className="text-xs font-bold">
                      Membuka Konsol Guru &amp; Pengawas CBT...
                    </span>
                  </div>
                }
              >
                <AdminDashboard
                  exams={exams}
                  questions={questions}
                  students={students}
                  results={results}
                  onRefreshData={async () => {
                    syncDashboardFromLocalCache();
                  }}
                  syncPulse={syncPulse}
                  isSyncingFirebase={isSyncingFirebase}
                  onManualFirebaseSync={() => loadDataFromFirestore(false)}
                />
              </Suspense>
            }
          />
          <Route
            path="*"
            element={
              <StudentExamPortal
                exams={exams}
                questions={studentPortalQuestions}
                students={students}
                results={results}
                onExamCompleted={() => {
                  syncDashboardFromLocalCache();
                }}
                onRefreshData={() => {
                  syncDashboardFromLocalCache();
                }}
                onExamStateChange={setIsStudentInExam}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
