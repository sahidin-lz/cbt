/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Lock } from 'lucide-react';
import { StudentExamPortal } from './components/StudentExamPortal';
import { AdminDashboard } from './components/AdminDashboard';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from './types/cbt';
import {
  subscribeToCbtSyncPulse,
  CbtSyncPulseData,
} from './lib/firebase';
import {
  loadUnifiedDashboardData,
  subscribeRealtimeFirestoreCollections,
  pushSnapshotToFirestoreClient,
  persistRecalculatedResultsToFirestore,
  safeApiJson,
} from './lib/cbtFirestoreService';
import { recalculateHistoricalResults } from './utils/cbtLogic';

type PortalView = 'student' | 'teacher';

export default function App() {
  // Persist portalView across browser reloads so teacher/student stay on their last page
  const [portalView, setPortalView] = useState<PortalView>(() => {
    try {
      const activeStudentSession = localStorage.getItem('cbt_active_student_session');
      if (activeStudentSession) {
        return 'student';
      }
      const saved = localStorage.getItem('cbt_active_portal');
      if (saved === 'teacher' || saved === 'student') return saved;
      if (localStorage.getItem('cbt_teacher_auth') === 'true') return 'teacher';
    } catch {}
    return 'student';
  });

  useEffect(() => {
    try {
      localStorage.setItem('cbt_active_portal', portalView);
    } catch {}
  }, [portalView]);

  const [antiInspectBanner, setAntiInspectBanner] = useState<string | null>(null);

  // Global Anti-Inspect Element & Right-Click Guard on Student Portal
  useEffect(() => {
    if (portalView !== 'student') {
      setAntiInspectBanner(null);
      return;
    }

    const showInspectWarning = (msg: string) => {
      setAntiInspectBanner(msg);
      window.setTimeout(() => {
        setAntiInspectBanner((prev) => (prev === msg ? null : prev));
      }, 3500);
    };

    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      showInspectWarning(
        'Keamanan CBT Aktif: Klik kanan dan Inspect Element dinonaktifkan pada Ruang Ujian Siswa.'
      );
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toUpperCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isMacAltCmd = e.metaKey && e.altKey;

      const isInspectCombo =
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C', 'K', 'M'].includes(key)) ||
        (isMacAltCmd && ['I', 'J', 'C', 'K', 'U'].includes(key)) ||
        (isCtrlOrCmd && key === 'U');

      if (isInspectCombo) {
        e.preventDefault();
        e.stopPropagation();
        showInspectWarning(
          'Keamanan CBT Aktif: Pintasan Inspect Element / Developer Tools (F12 / Ctrl+Shift+I) dilarang dan tercatat oleh sistem!'
        );
      }
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu);
    window.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu);
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [portalView]);

  const [isStudentInExam, setIsStudentInExam] = useState(false);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncPulse, setSyncPulse] = useState<CbtSyncPulseData | null>(null);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const lastSeenSyncTimestamp = useRef<string>('');

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await loadUnifiedDashboardData();
      setExams(data.exams || []);
      setQuestions(data.questions || []);
      setStudents(data.students || []);
      setResults(data.results || []);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setLoadError(err.message || 'Gagal memuat data CBT.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleManualFirebaseSync = useCallback(async () => {
    setIsSyncingFirebase(true);
    try {
      const apiRes = await safeApiJson<{
        pulse?: CbtSyncPulseData;
        data?: {
          exams: ExamItem[];
          questions: QuestionItem[];
          students: StudentItem[];
          results: ResultItem[];
        };
      }>('/api/firebase/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Sinkronisasi penuh manual dari Dashboard Guru',
        }),
      });

      if (apiRes.ok && apiRes.data) {
        if (apiRes.data.pulse) {
          setSyncPulse(apiRes.data.pulse);
          lastSeenSyncTimestamp.current = apiRes.data.pulse.lastSyncedAt;
        }
        if (apiRes.data.data) {
          setExams(apiRes.data.data.exams || []);
          setQuestions(apiRes.data.data.questions || []);
          setStudents(apiRes.data.data.students || []);
          setResults(apiRes.data.data.results || []);
        }
      } else {
        const clientPulse = await pushSnapshotToFirestoreClient(
          { exams, students, questions, results },
          'Sinkronisasi penuh manual dari Dashboard Guru'
        );
        if (clientPulse) {
          setSyncPulse(clientPulse);
          lastSeenSyncTimestamp.current = clientPulse.lastSyncedAt;
        }
        await fetchDashboardData();
      }
    } catch (error) {
      console.error('Manual Firebase sync error:', error);
    } finally {
      setIsSyncingFirebase(false);
    }
  }, [exams, students, questions, results, fetchDashboardData]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Subscribe directly to Firebase Firestore collections for real-time updates on Vercel & AI Studio
  useEffect(() => {
    const unsubCollections = subscribeRealtimeFirestoreCollections({
      onExams: (items) => {
        setExams(items);
      },
      onStudents: (items) => {
        setStudents(items);
      },
      onQuestions: (items) => {
        setQuestions(items);
      },
      onResults: (items) => {
        setResults(items);
      },
    });

    const unsubPulse = subscribeToCbtSyncPulse((pulse) => {
      setSyncPulse(pulse);
      if (
        pulse.lastSyncedAt &&
        pulse.lastSyncedAt !== lastSeenSyncTimestamp.current
      ) {
        lastSeenSyncTimestamp.current = pulse.lastSyncedAt;
        fetchDashboardData();
      }
    });

    return () => {
      unsubCollections();
      unsubPulse();
    };
  }, [fetchDashboardData]);

  // Ensure only questions and results belonging to active exams & students are counted,
  // and retroactively recalculate all historical results using the Humane & Anti-Guessing formula
  const activeQuestions = useMemo(() => {
    const activeExamIds = new Set(exams.map((e) => Number(e.id)));
    return questions.filter((q) => activeExamIds.has(Number(q.exam_id)));
  }, [exams, questions]);

  const recalculatedBundle = useMemo(() => {
    const activeExamIds = new Set(exams.map((e) => Number(e.id)));
    const activeStudentIds = new Set(students.map((s) => Number(s.id)));
    const rawValidResults = results.filter(
      (r) =>
        activeExamIds.has(Number(r.exam_id)) &&
        activeStudentIds.has(Number(r.student_id))
    );
    return recalculateHistoricalResults({
      results: rawValidResults,
      students,
      exams,
      questions: activeQuestions,
    });
  }, [results, students, exams, activeQuestions]);

  const activeResults = recalculatedBundle.results;

  // Automatically persist any upgraded historical student scores to Firestore
  useEffect(() => {
    if (recalculatedBundle.changedResults.length > 0) {
      persistRecalculatedResultsToFirestore(
        recalculatedBundle.changedResults
      ).catch(() => {});
    }
  }, [recalculatedBundle.changedResults]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70 text-slate-900">
      {/* Vibrant Educational Multi-Color Top Strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-emerald-400 via-cyan-400 to-blue-500" />

      {/* Top Bar Contract: Zone 1 Brand Wordmark — Zone 2 Separated Student/Teacher Portal Links — Zone 3 Primary Portal Switch */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white border-b border-indigo-800/70 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Zone 1: Institutional Identity */}
          <a
            href="#top"
            onClick={(e) => {
              if (isStudentInExam) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              setPortalView('student');
            }}
            className={`flex items-center gap-3 tracking-tight text-white whitespace-nowrap shrink-0 ${
              isStudentInExam ? 'cursor-default pointer-events-none' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-emerald-400 text-white flex items-center justify-center font-extrabold text-xs font-mono tracking-wider shadow-xs border border-white/25">
              CBT
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-none">
                  Pusat Kendali Asesmen CBT
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wider">
                  SMA / MA
                </span>
              </div>
              <span className="hidden md:inline-block text-[11px] font-medium text-blue-200/85 mt-0.5">
                Sistem Ujian Multi-Mapel, Progres Kemampuan Siswa &amp; Analisis Butir
              </span>
            </div>
          </a>

          {/* Zone 2: Primary Portal Navigation (Clean Segmented Switcher or Exam Lock Status) */}
          {isStudentInExam ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-xs font-semibold text-amber-200">
              <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="whitespace-nowrap">Sesi Ujian Berlangsung — Navigasi Terkunci</span>
            </div>
          ) : (
            <nav
              aria-label="Navigasi Portal Utama"
              className="flex items-center p-1 bg-slate-900/70 border border-white/15 rounded-xl backdrop-blur-xs gap-1"
            >
              <button
                type="button"
                onClick={() => setPortalView('student')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                  portalView === 'student'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xs ring-1 ring-cyan-300/40'
                    : 'text-blue-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    portalView === 'student' ? 'bg-amber-300' : 'bg-blue-400/50'
                  }`}
                />
                <span>Portal Siswa &amp; Laporan</span>
              </button>
              <button
                type="button"
                onClick={() => setPortalView('teacher')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                  portalView === 'teacher'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs ring-1 ring-emerald-300/40'
                    : 'text-blue-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    portalView === 'teacher' ? 'bg-amber-300' : 'bg-emerald-400/50'
                  }`}
                />
                <span>Konsol Guru &amp; Pengawas</span>
              </button>
            </nav>
          )}

          {/* Zone 3: Contextual Action */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            {isStudentInExam ? (
              <button
                type="button"
                disabled
                className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-white/10 border border-white/15 rounded-xl cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title="Dilarang beralih ke Portal Guru selama sesi ujian aktif berlangsung"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span>Mode Ujian Terkunci</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setPortalView(portalView === 'student' ? 'teacher' : 'student')
                }
                className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
              >
                {portalView === 'student'
                  ? 'Buka Konsol Guru →'
                  : '← Buka Portal Siswa'}
              </button>
            )}
          </div>
        </div>
      </header>

      {antiInspectBanner && portalView === 'student' && (
        <div className="bg-rose-600 text-white px-4 py-2 text-xs font-bold text-center shadow-sm flex items-center justify-center gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0 text-amber-300" />
          <span>{antiInspectBanner}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {isLoading ? (
          <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 space-y-4">
            <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse p-6" />
            <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse p-6" />
          </div>
        ) : loadError ? (
          <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6">
            <div className="bg-white border border-red-200 rounded-xl p-6 space-y-3">
              <h2 className="text-base font-bold text-red-700">
                Gagal Memuat Sistem Ujian
              </h2>
              <p className="text-xs text-slate-600">{loadError}</p>
              <button
                type="button"
                onClick={fetchDashboardData}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg cursor-pointer"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        ) : portalView === 'student' ? (
          <StudentExamPortal
            exams={exams}
            questions={activeQuestions}
            students={students}
            results={activeResults}
            onExamCompleted={fetchDashboardData}
            onExamStateChange={setIsStudentInExam}
          />
        ) : (
          <AdminDashboard
            exams={exams}
            questions={activeQuestions}
            students={students}
            results={activeResults}
            onRefreshData={fetchDashboardData}
            syncPulse={syncPulse}
            isSyncingFirebase={isSyncingFirebase}
            onManualFirebaseSync={handleManualFirebaseSync}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto w-full py-4 px-4 sm:px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
          <span>CBT Sosiologi — Sistem Asesmen &amp; Ujian Berbasis Komputer Sosiologi SMA</span>
          <span>Sinkronisasi Database Real-Time Aktif</span>
        </div>
      </footer>
    </div>
  );
}
