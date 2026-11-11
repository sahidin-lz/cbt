/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  safeApiJson,
} from './lib/cbtFirestoreService';

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

  // Ensure only questions and results belonging to active exams & students are counted
  const activeExamIds = new Set(exams.map((e) => Number(e.id)));
  const activeStudentIds = new Set(students.map((s) => Number(s.id)));
  const activeQuestions = questions.filter((q) =>
    activeExamIds.has(Number(q.exam_id))
  );
  const activeResults = results.filter(
    (r) =>
      activeExamIds.has(Number(r.exam_id)) &&
      activeStudentIds.has(Number(r.student_id))
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/90 text-slate-900">
      {/* Vibrant Educational Multi-Color Top Strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 via-emerald-500 to-amber-500" />

      {/* Top Bar Contract: Zone 1 Brand Wordmark — Zone 2 Separated Student/Teacher Portal Links — Zone 3 Primary Portal Switch */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 shadow-2xs sticky top-0 z-30">
        {/* Zone 1: Brand Identity (Single-line clean institutional lockup) */}
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
          className={`flex items-center gap-3 tracking-tight text-slate-900 whitespace-nowrap shrink-0 ${
            isStudentInExam ? 'cursor-default pointer-events-none' : ''
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-emerald-600 text-white flex items-center justify-center font-bold text-xs font-mono tracking-wider shadow-xs">
            CBT
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-base font-extrabold tracking-tight text-slate-900">
              CBT Sosiologi
            </span>
            <span className="hidden md:inline-block text-slate-300">|</span>
            <span className="hidden md:inline-block text-xs font-medium text-indigo-700">
              Sistem Ujian &amp; Asesmen Sosiologi SMA
            </span>
          </div>
        </a>

        {/* Zone 2: Primary Portal Navigation (Clean Segmented Switcher or Exam Lock Status) */}
        {isStudentInExam ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-900">
            <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="whitespace-nowrap">Sesi Ujian Berlangsung — Navigasi Terkunci</span>
          </div>
        ) : (
          <nav
            aria-label="Navigasi Portal"
            className="flex items-center p-1 bg-slate-100 border border-slate-200/80 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setPortalView('student')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                portalView === 'student'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ruang Ujian Siswa
            </button>
            <button
              type="button"
              onClick={() => setPortalView('teacher')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                portalView === 'teacher'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Portal Guru &amp; Pengawas
            </button>
          </nav>
        )}

        {/* Zone 3: Contextual Action */}
        <div className="flex items-center gap-3 shrink-0">
          {isStudentInExam ? (
            <button
              type="button"
              disabled
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Dilarang beralih ke Portal Guru selama sesi ujian aktif berlangsung"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Mode Ujian Terkunci</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setPortalView(portalView === 'student' ? 'teacher' : 'student')
              }
              className="px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {portalView === 'student'
                ? 'Masuk Halaman Guru'
                : 'Layar Ujian Siswa'}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {isLoading ? (
          <div className="max-w-7xl mx-auto py-12 px-6 space-y-4">
            <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse p-6" />
            <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse p-6" />
          </div>
        ) : loadError ? (
          <div className="max-w-3xl mx-auto py-12 px-6">
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
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>CBT Sosiologi — Sistem Asesmen &amp; Ujian Berbasis Komputer Sosiologi SMA</span>
        <span>Sinkronisasi Database Real-Time Aktif</span>
      </footer>
    </div>
  );
}
