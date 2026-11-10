/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Default to Student Login Portal; Teacher Login is cleanly separated
  const [portalView, setPortalView] = useState<PortalView>('student');
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
        if (items.length > 0) setExams(items);
      },
      onStudents: (items) => {
        if (items.length > 0) setStudents(items);
      },
      onQuestions: (items) => {
        if (items.length > 0) setQuestions(items);
      },
      onResults: (items) => {
        if (items.length > 0) setResults(items);
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Zone 1 Brand Wordmark — Zone 2 Separated Student/Teacher Portal Links — Zone 3 Primary Portal Switch */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setPortalView('student');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          EduAssess CBT
        </a>

        {/* Zone 2: Separated Student Login & Teacher Login navigation links */}
        <nav
          aria-label="Navigasi Portal"
          className="flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setPortalView('student')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              portalView === 'student'
                ? 'text-blue-600 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Login Ujian Siswa
          </button>
          <button
            type="button"
            onClick={() => setPortalView('teacher')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              portalView === 'teacher'
                ? 'text-blue-600 font-semibold underline underline-offset-8'
                : ''
            }`}
          >
            Portal Guru / Admin
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() =>
              setPortalView(portalView === 'student' ? 'teacher' : 'student')
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {portalView === 'student'
              ? 'Masuk Halaman Guru'
              : 'Masuk Halaman Siswa'}
          </button>
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
            students={students}
            onExamCompleted={fetchDashboardData}
          />
        ) : (
          <AdminDashboard
            exams={exams}
            questions={questions}
            students={students}
            results={results}
            onRefreshData={fetchDashboardData}
            syncPulse={syncPulse}
            isSyncingFirebase={isSyncingFirebase}
            onManualFirebaseSync={handleManualFirebaseSync}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>EduAssess CBT — Sistem Ujian Berbasis Komputer Terintegrasi AI</span>
        <span>Sinkronisasi Real-Time Firebase Firestore & PostgreSQL</span>
      </footer>
    </div>
  );
}
