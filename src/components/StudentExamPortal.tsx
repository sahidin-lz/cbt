import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  ShieldAlert,
  BookOpen,
  Award,
  RotateCcw,
  Lock,
  Maximize2,
  Users,
  UserCheck,
  KeyRound,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, AnalisisAI } from '../types/cbt';
import {
  loginStudentExamCbt,
  submitStudentExamCbt,
  generateAiAnalysisCbt,
  updateStudentStatusCbt,
  subscribeToSingleStudentStatus,
  safeApiJson,
} from '../lib/cbtFirestoreService';
import {
  getStudentLoginClasses,
  getStudentsForClass,
  validateStudentCascadingLogin,
  isExamMatchedForStudentClass,
} from '../utils/cbtLogic';
import { MathAndTableRenderer } from './MathAndTableRenderer';

const MAX_TAB_VIOLATIONS = 3;

interface StudentExamPortalProps {
  exams: ExamItem[];
  students: StudentItem[];
  onExamCompleted: () => void;
}

export const StudentExamPortal: React.FC<StudentExamPortalProps> = ({
  exams,
  students,
  onExamCompleted,
}) => {
  const [selectedKelas, setSelectedKelas] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [namaInput, setNamaInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);

  // Derived class options and filtered students for cascading login
  const classOptions = useMemo(
    () => getStudentLoginClasses(students),
    [students]
  );

  const studentsInSelectedClass = useMemo(
    () => getStudentsForClass(students, selectedKelas),
    [students, selectedKelas]
  );

  const selectedStudentObj = useMemo(
    () =>
      studentsInSelectedClass.find(
        (s) => String(s.id) === String(selectedStudentId)
      ) || null,
    [studentsInSelectedClass, selectedStudentId]
  );

  const matchedExamsForSelectedClass = useMemo(() => {
    if (!selectedKelas) return exams;
    return exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, selectedKelas)
    );
  }, [exams, selectedKelas]);

  // Active Exam Session State
  const [activeStudent, setActiveStudent] = useState<StudentItem | null>(null);
  const [activeExam, setActiveExam] = useState<ExamItem | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  // Strict Anti-Cheat & Security Lockdown State
  const [tabViolations, setTabViolations] = useState(0);
  const [showCheatBanner, setShowCheatBanner] = useState(false);
  const [showCheatLockModal, setShowCheatLockModal] = useState(false);
  const [isStudentBlocked, setIsStudentBlocked] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [lastViolationTime, setLastViolationTime] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastViolationTimestampRef = useRef<number>(0);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<{
    resultId: number;
    skor: number;
    kategori: string;
    rawEarned: number;
    rawMax: number;
    aiResult: AnalisisAI | null;
  } | null>(null);
  const [isGeneratingStudentAi, setIsGeneratingStudentAi] = useState(false);

  useEffect(() => {
    if (matchedExamsForSelectedClass.length > 0) {
      setSelectedExamId(String(matchedExamsForSelectedClass[0].id));
    } else if (exams.length > 0 && !selectedExamId) {
      setSelectedExamId(String(exams[0].id));
    }
  }, [exams, matchedExamsForSelectedClass, selectedExamId]);

  const requestExamFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore if browser blocks automatic fullscreen
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleSelectKelas = (kelasVal: string) => {
    setSelectedKelas(kelasVal);
    setSelectedStudentId('');
    setNamaInput('');
    setTokenInput('');
    setLoginError(null);
  };

  const handleSelectStudent = (studentIdVal: string) => {
    setSelectedStudentId(studentIdVal);
    const found = studentsInSelectedClass.find(
      (s) => String(s.id) === String(studentIdVal)
    );
    setNamaInput(found ? found.nama : '');
    setTokenInput('');
    setLoginError(null);
    if (found) {
      setTimeout(() => {
        tokenInputRef.current?.focus();
      }, 60);
    }
  };

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (students.length > 0) {
      const validation = validateStudentCascadingLogin({
        students,
        selectedKelas,
        selectedStudentId,
        tokenInput,
      });
      if (!validation.ok) {
        setLoginError(validation.error);
        return;
      }
    } else {
      if (!namaInput.trim()) {
        setLoginError('Silakan pilih atau masukkan Nama Lengkap Siswa terlebih dahulu.');
        return;
      }
      if (!tokenInput.trim() || tokenInput.trim().length !== 6) {
        setLoginError('Token Ujian harus terdiri dari 6 karakter alfanumerik.');
        return;
      }
    }

    const targetNama = selectedStudentObj ? selectedStudentObj.nama : namaInput.trim();

    // Panggil Fullscreen SEKARANG (sebelum ada proses await/jaringan)
    // agar browser mendeteksi sebagai Transient User Activation dari klik user.
    requestExamFullscreen();

    setIsLoggingIn(true);
    try {
      const session = await loginStudentExamCbt(
        targetNama,
        tokenInput.toUpperCase().trim(),
        selectedExamId ? Number(selectedExamId) : undefined
      );

      setActiveStudent(session.student);
      setActiveExam(session.exam);
      setExamQuestions(session.questions || []);
      setRemainingSeconds((session.exam?.durasi_menit || 60) * 60);
      setCurrentIndex(0);
      setAnswers({});
      setTabViolations(0);
      setShowCheatBanner(false);
      setShowCheatLockModal(false);
      setIsStudentBlocked(session.student.status_ujian === 'Diblokir');
      setSecurityNotice(null);
      setSubmittedSummary(null);
      onExamCompleted();
    } catch (err: any) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setLoginError(err.message || 'Gagal memulai sesi ujian.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Real-time subscription to Teacher's Status Management (Blokir / Buka Kunci / Reset)
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const unsubscribe = subscribeToSingleStudentStatus(
      activeStudent.id,
      (newStatus) => {
        setActiveStudent((prev) =>
          prev ? { ...prev, status_ujian: newStatus } : null
        );
        if (newStatus === 'Diblokir') {
          setIsStudentBlocked(true);
          setShowCheatLockModal(true);
        } else if (newStatus === 'Sedang Ujian') {
          setIsStudentBlocked((wasBlocked) => {
            if (wasBlocked) {
              setTabViolations(0);
              setShowCheatLockModal(false);
              setShowCheatBanner(false);
              setSecurityNotice(
                'Kunci ujian telah dibuka oleh Guru Pengawas. Silakan lanjutkan ujian dengan tertib.'
              );
            }
            return false;
          });
        } else if (newStatus === 'Belum Mulai') {
          // Teacher reset this student's session
          setActiveStudent(null);
          setSubmittedSummary(null);
        }
      }
    );

    return () => unsubscribe();
  }, [activeStudent?.id, submittedSummary]);

  const triggerViolation = useCallback(
    (reason = 'Terdeteksi berpindah tab atau keluar dari jendela ujian') => {
      if (!activeStudent || submittedSummary || isStudentBlocked) return;

      // Debounce rapid blur+visibilitychange events within 800ms
      const now = Date.now();
      if (now - lastViolationTimestampRef.current < 800) return;
      lastViolationTimestampRef.current = now;

      setTabViolations((prev) => {
        const nextCount = prev + 1;
        const answeredNow = Object.keys(answers).filter(
          (k) => answers[k] && answers[k].length > 0
        ).length;
        safeApiJson('/api/exam/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama: activeStudent.nama,
            kelas: activeStudent.kelas,
            pelanggaranTab: nextCount,
            answeredCount: answeredNow,
          }),
        });

        if (nextCount >= MAX_TAB_VIOLATIONS) {
          setIsStudentBlocked(true);
          updateStudentStatusCbt(activeStudent, 'Diblokir').then(() => {
            onExamCompleted();
          });
        }

        return nextCount;
      });
      setShowCheatBanner(true);
      setShowCheatLockModal(true);
      setSecurityNotice(reason);
      setLastViolationTime(new Date().toLocaleTimeString('id-ID'));
    },
    [activeStudent, submittedSummary, isStudentBlocked, answers, onExamCompleted]
  );

  // Strict Anti-Cheat: Detect window blur, visibilitychange, right-click, copy/paste, and shortcuts
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const handleBlur = () => {
      triggerViolation('Terdeteksi keluar dari fokus jendela ujian (Alt+Tab / Pindah Aplikasi)');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation('Terdeteksi berpindah tab browser atau meminimalkan layar ujian');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityNotice('Klik kanan dinonaktifkan selama ujian berlangsung.');
    };

    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      setSecurityNotice('Fitur Salin / Tempel (Copy-Paste) dikunci selama ujian.');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      const blockedCombo =
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (isCtrlOrCmd &&
          e.shiftKey &&
          ['I', 'J', 'C', 'K'].includes(key)) ||
        (isCtrlOrCmd &&
          ['U', 'P', 'S', 'C', 'V', 'X', 'T', 'N', 'W'].includes(key)) ||
        (e.altKey && key === 'TAB');

      if (blockedCombo) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityNotice(
          `Pintasan keyboard (${e.ctrlKey ? 'Ctrl+' : ''}${e.key}) diblokir oleh sistem keamanan ujian.`
        );
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleClipboard);
    document.addEventListener('cut', handleClipboard);
    document.addEventListener('paste', handleClipboard);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleClipboard);
      document.removeEventListener('cut', handleClipboard);
      document.removeEventListener('paste', handleClipboard);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeStudent, submittedSummary, triggerViolation]);

  const handleSubmitExam = useCallback(async () => {
    if (!activeStudent || !activeExam || isSubmitting || isStudentBlocked) return;

    // Cek apakah siswa sudah menjawab minimal 1 soal (Cegah submit kosong & data dumi AI)
    const currentAnsweredCount = Object.keys(answers).filter(
      (k) => answers[k] && answers[k].length > 0
    ).length;

    if (currentAnsweredCount === 0) {
      setSecurityNotice(
        'Peringatan: Anda belum menjawab satu soal pun. Silakan isi jawaban terlebih dahulu sebelum mengumpulkan!'
      );
      setConfirmSubmitModal(false);
      return;
    }

    setIsSubmitting(true);
    setConfirmSubmitModal(false);

    try {
      const outcome = await submitStudentExamCbt({
        student: activeStudent,
        exam: activeExam,
        questions: examQuestions,
        jawabanSiswa: answers,
        pelanggaranTab: tabViolations,
      });
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setSubmittedSummary({
        resultId: outcome.resultId,
        skor: outcome.skor,
        kategori: outcome.kategori,
        rawEarned: outcome.rawEarned,
        rawMax: outcome.rawMax,
        aiResult: null,
      });
      onExamCompleted();
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeStudent,
    activeExam,
    answers,
    tabViolations,
    isSubmitting,
    isStudentBlocked,
    examQuestions,
    onExamCompleted,
  ]);

  // Countdown Timer Effect
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeStudent, submittedSummary, handleSubmitExam]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  };

  // Option selection handler for PG Biasa (Radio) and PG Kompleks (Checkbox)
  const handleSelectOption = (
    questionId: number,
    optionKey: string,
    tipeSoal: string
  ) => {
    const qKey = String(questionId);
    const isKompleks = tipeSoal.toLowerCase().includes('kompleks');

    setAnswers((prev) => {
      const currentSelected = prev[qKey] || [];
      if (!isKompleks) {
        return { ...prev, [qKey]: [optionKey] };
      } else {
        const exists = currentSelected.includes(optionKey);
        const nextSelected = exists
          ? currentSelected.filter((k) => k !== optionKey)
          : [...currentSelected, optionKey].sort();
        return { ...prev, [qKey]: nextSelected };
      }
    });
  };

  const handleRequestInstantAiEvaluation = async () => {
    if (!activeStudent || !submittedSummary || submittedSummary.rawEarned === 0) return;
    const currentAnsweredCount = Object.keys(answers).filter(
      (k) => answers[k] && answers[k].length > 0
    ).length;
    if (currentAnsweredCount === 0) return;

    setIsGeneratingStudentAi(true);
    try {
      const aiData = await generateAiAnalysisCbt({
        resultId: submittedSummary.resultId || undefined,
        nama_siswa: activeStudent.nama,
        questions: examQuestions,
        jawaban_siswa: answers,
      });
      setSubmittedSummary((prev) =>
        prev ? { ...prev, aiResult: aiData } : null
      );
      onExamCompleted();
    } catch (error) {
      console.error('Error requesting AI evaluation:', error);
    } finally {
      setIsGeneratingStudentAi(false);
    }
  };

  // 1. RENDER COMPLETED EXAM SUMMARY SCREEN
  if (activeStudent && submittedSummary) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs font-medium text-emerald-700">
                Ujian Telah Diselesaikan · Token {activeStudent.token_ujian}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                Hasil Ujian: {activeStudent.nama}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Kelas {activeStudent.kelas} · {activeExam?.judul_ujian}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-500">Skor Akhir CBT</div>
              <div className="text-4xl font-bold font-mono tabular-nums text-blue-700">
                {submittedSummary.skor}
                <span className="text-lg text-slate-400 font-normal">/100</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {submittedSummary.kategori} · Poin Mentah {submittedSummary.rawEarned}/
                {submittedSummary.rawMax}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-700">
              <span>Soal Dijawab: </span>
              <strong className="font-mono tabular-nums">
                {Object.keys(answers).filter((k) => answers[k]?.length > 0).length} /{' '}
                {examQuestions.length}
              </strong>
              <span className="mx-2 text-slate-300">·</span>
              <span>Log Pindah Tab (Anti-Cheat): </span>
              <strong className="font-mono tabular-nums text-amber-700">
                {tabViolations} kali
              </strong>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Hanya muncul jika belum ada hasil AI DAN siswa mendapatkan poin > 0 */}
              {!submittedSummary.aiResult && submittedSummary.rawEarned > 0 && (
                <button
                  type="button"
                  onClick={handleRequestInstantAiEvaluation}
                  disabled={isGeneratingStudentAi}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isGeneratingStudentAi
                    ? 'Menganalisis Kognitif (Gemini AI)...'
                    : 'Generate AI Analysis Sekarang'}
                </button>
              )}

              {!submittedSummary.aiResult && submittedSummary.rawEarned === 0 && (
                <div className="px-4 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                  Skor 0: Analisis AI tidak tersedia untuk ujian kosong.
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveStudent(null);
                  setSubmittedSummary(null);
                  setNamaInput('');
                  setTokenInput('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Kembali ke Login Siswa
              </button>
            </div>
          </div>

          {submittedSummary.aiResult && (
            <div className="mt-6 border border-slate-200 rounded-xl p-6 bg-slate-50/60 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Hasil Evaluasi AI Evaluator (LOTS vs HOTS)
                  </h2>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500">
                  Evaluasi Kognitif HOTS
                </h3>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                  {submittedSummary.aiResult.evaluasi_hots}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-emerald-700">
                    Kekuatan Kompetensi
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                    {submittedSummary.aiResult.analisis_kompetensi.kekuatan.map(
                      (item, i) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-amber-700">
                    Area Penguatan (Kelemahan)
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                    {submittedSummary.aiResult.analisis_kompetensi.kelemahan.map(
                      (item, i) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-700">
                  3 Rekomendasi Belajar Terarah
                </h4>
                <ol className="mt-2 space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
                  {submittedSummary.aiResult.rekomendasi_belajar.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. RENDER DEDICATED STUDENT LOGIN SCREEN (3-STEP CASCADING: PILIH KELAS -> PILIH NAMA -> MASUKKAN TOKEN)
  if (!activeStudent) {
    const step1Done = Boolean(selectedKelas);
    const step2Done = Boolean(selectedKelas && selectedStudentObj);
    const step3Done = Boolean(step2Done && tokenInput.trim().length === 6);

    return (
      <div className="max-w-xl mx-auto py-10 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="text-xs font-medium text-blue-700">
              Halaman Login Peserta Ujian CBT · 3 Langkah Verifikasi
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight">
              Masuk Ruang Ujian Siswa
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Pilih <strong>Kelas / Rombel</strong> terlebih dahulu, lalu pilih{' '}
              <strong>Nama Lengkap Anda</strong> dari daftar kelas, kemudian
              masukkan <strong>6 karakter Token Ujian</strong>.
            </p>
          </div>

          {/* 3-Step Visual Progress Indicator */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div
              className={`p-2.5 rounded-lg border text-xs transition-colors ${
                step1Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50/70 border-blue-200 text-blue-900'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>1. Pilih Kelas</span>
              </div>
              <div className="text-[11px] mt-0.5 truncate opacity-80">
                {selectedKelas || 'Belum dipilih'}
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border text-xs transition-colors ${
                step2Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step1Done
                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>2. Pilih Nama</span>
              </div>
              <div className="text-[11px] mt-0.5 truncate opacity-80">
                {selectedStudentObj
                  ? selectedStudentObj.nama
                  : step1Done
                    ? `${studentsInSelectedClass.length} siswa tersedia`
                    : 'Menunggu kelas'}
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border text-xs transition-colors ${
                step3Done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : step2Done
                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>3. Token Ujian</span>
              </div>
              <div className="text-[11px] mt-0.5 truncate opacity-80">
                {step3Done
                  ? 'Token siap diverifikasi'
                  : step2Done
                    ? 'Masukkan 6 karakter'
                    : 'Menunggu nama'}
              </div>
            </div>
          </div>

          <form onSubmit={handleStartExam} className="space-y-5">
            {/* LANGKAH 1: PILIH KELAS / ROMBEL */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="student-class-select"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Langkah 1 — Pilih Kelas / Rombel
                </label>
                <span className="text-xs text-slate-500">
                  {classOptions.length} kelas terdaftar
                </span>
              </div>
              <select
                id="student-class-select"
                value={selectedKelas}
                onChange={(e) => handleSelectKelas(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent cursor-pointer"
              >
                <option value="">-- Pilih Kelas / Rombel Anda --</option>
                {classOptions.map((cls) => (
                  <option key={cls.kelas} value={cls.kelas}>
                    {cls.kelas} ({cls.studentCount} Siswa)
                  </option>
                ))}
              </select>
            </div>

            {/* LANGKAH 2: PILIH NAMA SISWA (MUNCUL / AKTIF SETELAH PILIH KELAS) */}
            <div
              className={`transition-opacity ${
                step1Done ? 'opacity-100' : 'opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="student-name-select"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Langkah 2 — Pilih Nama Siswa
                </label>
                {step1Done && (
                  <span className="text-xs font-medium text-blue-700">
                    Kelas {selectedKelas}: {studentsInSelectedClass.length} siswa
                  </span>
                )}
              </div>

              {students.length > 0 ? (
                <select
                  id="student-name-select"
                  value={selectedStudentId}
                  disabled={!step1Done}
                  onChange={(e) => handleSelectStudent(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="">
                    {step1Done
                      ? `-- Pilih Nama Lengkap Anda (${studentsInSelectedClass.length} Siswa di ${selectedKelas}) --`
                      : '-- Pilih Kelas Terlebih Dahulu pada Langkah 1 --'}
                  </option>
                  {studentsInSelectedClass.map((st, idx) => {
                    const statusTag =
                      st.status_ujian === 'Selesai'
                        ? ' — [Sudah Selesai]'
                        : st.status_ujian === 'Diblokir'
                          ? ' — [Diblokir / Terkunci]'
                          : st.status_ujian === 'Sedang Ujian'
                            ? ' — [Sedang Ujian]'
                            : '';
                    return (
                      <option key={st.id} value={String(st.id)}>
                        {idx + 1}. {st.nama}
                        {statusTag}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  id="student-name-input"
                  type="text"
                  value={namaInput}
                  onChange={(e) => setNamaInput(e.target.value)}
                  placeholder="Masukkan Nama Lengkap Anda"
                  className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              )}

              {/* Selected Student Confirmation Card */}
              {selectedStudentObj && (
                <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Peserta Terpilih: </span>
                    <strong className="text-slate-900">
                      {selectedStudentObj.nama}
                    </strong>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-slate-600">
                      {selectedStudentObj.kelas}
                    </span>
                  </div>
                  <span
                    className={`font-semibold ${
                      selectedStudentObj.status_ujian === 'Diblokir'
                        ? 'text-red-700'
                        : selectedStudentObj.status_ujian === 'Selesai'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                    }`}
                  >
                    Status: {selectedStudentObj.status_ujian || 'Belum Mulai'}
                  </span>
                </div>
              )}
            </div>

            {/* LANGKAH 3: MASUKKAN TOKEN UJIAN (AKTIF SETELAH PILIH NAMA SISWA) */}
            <div
              className={`transition-opacity ${
                step2Done || students.length === 0 ? 'opacity-100' : 'opacity-60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="student-token-input"
                  className="block text-sm font-semibold text-slate-800 whitespace-nowrap"
                >
                  Langkah 3 — Masukkan Token Ujian (6 Karakter)
                </label>
                {matchedExamsForSelectedClass.length > 0 && step1Done && (
                  <span className="text-xs font-medium text-blue-700 whitespace-nowrap">
                    Ujian: {matchedExamsForSelectedClass[0].judul_ujian}
                  </span>
                )}
              </div>
              <input
                ref={tokenInputRef}
                id="student-token-input"
                type="text"
                maxLength={6}
                disabled={students.length > 0 && !step2Done}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                placeholder={
                  students.length > 0 && !step2Done
                    ? 'Pilih Kelas & Nama Siswa Terlebih Dahulu'
                    : 'Masukkan 6 Karakter Token Ujian Anda'
                }
                className="w-full px-4 py-2.5 text-base font-mono tracking-widest uppercase bg-white border border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed"
              />
            </div>

            {loginError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={
                isLoggingIn ||
                (students.length > 0 && (!step1Done || !step2Done || !step3Done))
              }
              className="w-full py-3 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoggingIn
                ? 'Memverifikasi Kelas, Nama & Token...'
                : 'Mulai Ujian Sekarang'}
            </button>
          </form>

          <div className="pt-5 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>Dukungan Soal: PG Biasa & PG Kompleks</span>
            <span>Proteksi Anti-Cheat Pindah Tab Aktif</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. RENDER ACTIVE EXAM INTERFACE
  const currentQuestion = examQuestions[currentIndex];
  const currentQId = currentQuestion ? String(currentQuestion.id) : '';
  const selectedOptions = answers[currentQId] || [];
  const isKompleks =
    currentQuestion?.tipe_soal.toLowerCase().includes('kompleks') || false;
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] && answers[k].length > 0
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-4 select-none">
      {/* Top Exam Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            Peserta: <strong className="text-slate-800">{activeStudent.nama}</strong> ·{' '}
            <span>Kelas {activeStudent.kelas}</span> · Token{' '}
            <span className="font-mono font-semibold text-blue-700">
              {activeStudent.token_ujian}
            </span>{' '}
            · Status:{' '}
            <span
              className={`font-semibold ${
                isStudentBlocked ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {isStudentBlocked ? 'Diblokir' : activeStudent.status_ujian}
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-0.5">
            {activeExam?.judul_ujian}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isFullscreen && (
            <button
              type="button"
              onClick={requestExamFullscreen}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Mode Layar Penuh
            </button>
          )}

          <div
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
              tabViolations > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <ShieldAlert
              className={`w-4 h-4 ${
                tabViolations > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            />
            <span>
              Anti-Cheat Tab:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {tabViolations} / {MAX_TAB_VIOLATIONS}
              </strong>
            </span>
          </div>

          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono tabular-nums text-base font-bold ${
              remainingSeconds < 300
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-slate-900 border-slate-900 text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span aria-label="Sisa Waktu Ujian">{formatTimer(remainingSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Security Notice Banner (Right-click, Copy-Paste, Keyboard Shortcut Blocked) */}
      {securityNotice && (
        <div
          role="status"
          className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Proteksi Keamanan Ujian Aktif:</strong> {securityNotice}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSecurityNotice(null)}
            className="px-2.5 py-1 text-[11px] font-semibold bg-white/15 hover:bg-white/25 rounded cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Anti-Cheat Alert Banner when student switches tab / blurs window */}
      {showCheatBanner && !isStudentBlocked && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                Peringatan Integritas Ujian (Anti-Cheat Terdeteksi)
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                Sistem mendeteksi Anda berpindah tab atau keluar dari jendela ujian
                pada pukul{' '}
                <span className="font-mono font-semibold">{lastViolationTime}</span>.
                Pelanggaran tercatat:{' '}
                <strong className="font-mono">
                  {tabViolations} dari {MAX_TAB_VIOLATIONS} batas maksimal
                </strong>{' '}
                (Jika mencapai {MAX_TAB_VIOLATIONS}x, ujian otomatis diblokir).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCheatBanner(false)}
            className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-200/70 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Saya Mengerti
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      {currentQuestion ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Stage */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-blue-700">
                  SOAL NO. {currentIndex + 1} / {examQuestions.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-xs font-medium text-slate-600">
                  {isKompleks
                    ? 'Pilihan Ganda Kompleks (Pilih >1 Jawaban Benar · Bobot Maks 3 Poin)'
                    : 'Pilihan Ganda Biasa (1 Jawaban Benar · Bobot 2 Poin)'}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Kode: {currentQuestion.data_opsi?.id_soal_csv || `Q-${currentQuestion.id}`}
              </span>
            </div>

            {currentQuestion.data_opsi?.wacana && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Wacana / Stimulus Soal</span>
                </div>
                <div className="text-sm text-slate-700 leading-relaxed">
                  <MathAndTableRenderer content={currentQuestion.data_opsi.wacana} />
                </div>
              </div>
            )}

            <div className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed">
              <MathAndTableRenderer content={currentQuestion.teks_soal} />
            </div>

            <div className="space-y-3 pt-1">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                const optText = currentQuestion.data_opsi?.opsi?.[optKey];
                if (!optText) return null;
                const isSelected = selectedOptions.includes(optKey);

                return (
                  <label
                    key={optKey}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-600 text-slate-900'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <input
                      type={isKompleks ? 'checkbox' : 'radio'}
                      name={`question-${currentQuestion.id}`}
                      value={optKey}
                      checked={isSelected}
                      disabled={isStudentBlocked}
                      onChange={() =>
                        handleSelectOption(
                          currentQuestion.id,
                          optKey,
                          currentQuestion.tipe_soal
                        )
                      }
                      className="mt-1 h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <div className="flex-1 text-sm leading-relaxed">
                      <span className="font-mono font-bold text-slate-900 mr-2">
                        {optKey}.
                      </span>
                      <MathAndTableRenderer content={optText} inline />
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-6 border-t border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || isStudentBlocked}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Soal Sebelumnya
              </button>

              {currentIndex < examQuestions.length - 1 ? (
                <button
                  type="button"
                  disabled={isStudentBlocked}
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(examQuestions.length - 1, prev + 1)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Soal Selanjutnya
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isStudentBlocked}
                  onClick={() => setConfirmSubmitModal(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Selesaikan & Kumpulkan Ujian
                </button>
              )}
            </div>
          </div>

          {/* Right Question Navigation Matrix */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Navigasi Nomor Soal
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Terjawab:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {answeredCount} / {examQuestions.length}
                </strong>{' '}
                butir soal
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2.5">
              {examQuestions.map((q, idx) => {
                const qAns = answers[String(q.id)] || [];
                const isAnswered = qAns.length > 0;
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={isStudentBlocked}
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Pilih Soal Nomor ${idx + 1}`}
                    className={`h-11 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors flex flex-col items-center justify-center cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                        : isAnswered
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isAnswered && (
                      <span className="text-[10px] font-normal truncate max-w-[36px]">
                        {qAns.join(',')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>Biru Solid:</span>
                <span className="font-medium text-slate-900">Soal Sedang Dibuka</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Hijau Muda:</span>
                <span className="font-medium text-emerald-700">Sudah Dijawab</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Abu-abu:</span>
                <span className="font-medium text-slate-500">Belum Dijawab</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isStudentBlocked}
              onClick={() => setConfirmSubmitModal(true)}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Kumpulkan Jawaban Sekarang
            </button>
          </div>
        </div>
      ) : null}

      {/* Full-Screen Anti-Cheat Lock / Auto-Block Overlay Modal */}
      {(showCheatLockModal || isStudentBlocked) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-xl">
            <div className="flex items-start gap-3.5">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  isStudentBlocked
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <div
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isStudentBlocked ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {isStudentBlocked
                    ? 'Sesi Ujian Diblokir · Pelanggaran Keamanan CBT'
                    : 'Layar Ujian Dikunci Sementara · Anti-Cheat Aktif'}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {isStudentBlocked
                    ? 'Akses Ujian Anda Telah Dikunci'
                    : 'Terdeteksi Keluar dari Jendela Ujian'}
                </h3>
              </div>
            </div>

            {isStudentBlocked ? (
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <p>
                  Peserta <strong>{activeStudent.nama}</strong> ({activeStudent.kelas}
                  ), sesi ujian Anda telah diubah menjadi{' '}
                  <strong className="text-red-700">Diblokir</strong> karena
                  mencapai batas maksimal pindah tab/keluar aplikasi (
                  <strong className="font-mono">
                    {tabViolations}/{MAX_TAB_VIOLATIONS} kali
                  </strong>
                  ) atau dikunci langsung oleh Pengawas.
                </p>
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                  <div className="font-bold">Cara Membuka Kunci Ujian:</div>
                  <p>
                    Silakan lapor kepada <strong>Guru / Pengawas Ujian</strong>.
                    Pengawas dapat membuka kunci Anda secara langsung melalui menu{' '}
                    <strong>Dashboard Guru → Database Siswa → Buka Kunci</strong>.
                    Layar ini akan terbuka otomatis begitu status Anda diaktifkan
                    kembali.
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStudent(null);
                      setIsStudentBlocked(false);
                      setShowCheatLockModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Keluar ke Halaman Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                <p>
                  Sistem keamanan CBT mendeteksi Anda berpindah tab browser,
                  membuka aplikasi lain, atau keluar dari fokus layar ujian pada
                  pukul <strong className="font-mono">{lastViolationTime}</strong>.
                </p>
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Peringatan Ke-<strong>{tabViolations}</strong> dari maksimal{' '}
                  <strong>{MAX_TAB_VIOLATIONS}</strong> kali. Apabila Anda
                  berpindah tab hingga {MAX_TAB_VIOLATIONS} kali, sesi ujian akan{' '}
                  <strong>Diblokir Otomatis</strong> dan hanya dapat dibuka oleh
                  Guru Pengawas.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCheatLockModal(false);
                    requestExamFullscreen();
                  }}
                  className="w-full py-3 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  Kembali Fokus ke Ruang Ujian Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog before Final Submit */}
      {confirmSubmitModal && !isStudentBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Konfirmasi Pengumpulan Ujian
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Anda telah menjawab{' '}
              <strong className="font-mono text-slate-900">
                {answeredCount} dari {examQuestions.length}
              </strong>{' '}
              soal. Apakah Anda yakin ingin mengakhiri ujian dan mengirim jawaban?
            </p>
            {answeredCount === 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Peringatan: Anda belum menjawab satu soal pun. Silakan isi
                  jawaban terlebih dahulu sebelum mengumpulkan!
                </span>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                {isSubmitting ? 'Mengirim Jawaban...' : 'Ya, Kumpulkan Jawaban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

