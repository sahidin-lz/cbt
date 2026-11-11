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
  LogIn,
  Activity,
  Check,
  X,
  Layers,
  Shuffle,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, ResultItem, AnalisisAI } from '../types/cbt';
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
  calculateExamScore,
  prepareStudentExamQuestions,
} from '../utils/cbtLogic';
import { downloadSingleStudentResultPdf } from '../utils/cbtPdfGenerator';
import { MathAndTableRenderer } from './MathAndTableRenderer';

export interface StudentActivityLog {
  timestamp: string;
  action:
    | 'login'
    | 'answer'
    | 'navigate'
    | 'violation'
    | 'blocked'
    | 'unblocked'
    | 'resume'
    | 'submit';
  detail: string;
}

export interface StudentExamProgress {
  studentId: number;
  nama: string;
  kelas: string;
  token_ujian: string;
  examId: number;
  answers: Record<string, string[]>;
  currentIndex: number;
  remainingSeconds: number;
  tabViolations: number;
  logs: StudentActivityLog[];
  lastSavedAt: string;
}

export interface LocalExamReceipt {
  resultId: number;
  studentId: number;
  studentNama: string;
  studentKelas: string;
  tokenUjian: string;
  examId: number;
  examJudul: string;
  skor: number;
  kategori: string;
  rawEarned: number;
  rawMax: number;
  answeredCount: number;
  totalQuestions: number;
  pelanggaranTab: number;
  jawabanSiswa: Record<string, string[]>;
  logs?: StudentActivityLog[];
  analisisAi?: AnalisisAI | null;
  submittedAt: string;
}

export const MAX_TAB_VIOLATIONS = 3;

const PROGRESS_KEY_PREFIX = 'cbt_progress_token_';
const HISTORY_KEY_PREFIX = 'cbt_history_student_';

function saveLocalProgress(token: string, data: StudentExamProgress) {
  try {
    localStorage.setItem(
      PROGRESS_KEY_PREFIX + token.toUpperCase().trim(),
      JSON.stringify(data)
    );
  } catch (e) {
    console.error('Failed to save progress to localStorage', e);
  }
}

function getLocalProgress(
  token: string,
  examId?: number
): StudentExamProgress | null {
  try {
    const raw = localStorage.getItem(
      PROGRESS_KEY_PREFIX + token.toUpperCase().trim()
    );
    if (!raw) return null;
    const parsed: StudentExamProgress = JSON.parse(raw);
    if (examId && parsed.examId && Number(parsed.examId) !== Number(examId)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearLocalProgress(token: string) {
  try {
    localStorage.removeItem(PROGRESS_KEY_PREFIX + token.toUpperCase().trim());
  } catch {}
}

function saveLocalReceipt(receipt: LocalExamReceipt) {
  try {
    const key = HISTORY_KEY_PREFIX + String(receipt.studentId);
    const existingRaw = localStorage.getItem(key);
    const existingList: LocalExamReceipt[] = existingRaw
      ? JSON.parse(existingRaw)
      : [];
    const filtered = existingList.filter(
      (item) => item.resultId !== receipt.resultId
    );
    localStorage.setItem(
      key,
      JSON.stringify([receipt, ...filtered].slice(0, 30))
    );
  } catch (e) {
    console.error('Failed to save receipt to localStorage', e);
  }
}

const ACTIVE_STUDENT_SESSION_KEY = 'cbt_active_student_session';

export interface ActiveStudentSessionData {
  student: StudentItem;
  exam: ExamItem;
  questions: QuestionItem[];
}

function saveActiveStudentSession(session: ActiveStudentSessionData) {
  try {
    localStorage.setItem(ACTIVE_STUDENT_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save active student session', e);
  }
}

function getActiveStudentSession(): ActiveStudentSessionData | null {
  try {
    const raw = localStorage.getItem(ACTIVE_STUDENT_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearActiveStudentSession() {
  try {
    localStorage.removeItem(ACTIVE_STUDENT_SESSION_KEY);
  } catch {}
}

interface StudentExamPortalProps {
  exams: ExamItem[];
  questions?: QuestionItem[];
  students: StudentItem[];
  results?: ResultItem[];
  onExamCompleted: () => void;
  onExamStateChange?: (isActive: boolean) => void;
}

export const StudentExamPortal: React.FC<StudentExamPortalProps> = ({
  exams,
  questions = [],
  students,
  results = [],
  onExamCompleted,
  onExamStateChange,
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
    if (!selectedKelas) {
      return exams.filter((ex) => (ex.status_ujian || 'AKTIF') === 'AKTIF');
    }
    return exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, selectedKelas, { requireActive: true })
    );
  }, [exams, selectedKelas]);

  // Attempt to restore active session on mount (so if student reloads, they stay in the exam without logging in again!)
  const initialSession = useMemo(() => {
    return getActiveStudentSession();
  }, []);

  const initialProgress = useMemo(() => {
    if (!initialSession?.student?.token_ujian) return null;
    return getLocalProgress(initialSession.student.token_ujian, initialSession.exam?.id);
  }, [initialSession]);

  // Active Exam Session State
  const [activeStudent, setActiveStudent] = useState<StudentItem | null>(() => {
    return initialSession?.student || null;
  });
  const [activeExam, setActiveExam] = useState<ExamItem | null>(() => {
    return initialSession?.exam || null;
  });
  const [examQuestions, setExamQuestions] = useState<QuestionItem[]>(() => {
    return initialSession?.questions || [];
  });
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    return initialProgress?.currentIndex || 0;
  });
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    return initialProgress?.answers || {};
  });
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (initialProgress?.remainingSeconds && initialProgress.remainingSeconds > 0) {
      return initialProgress.remainingSeconds;
    }
    return (initialSession?.exam?.durasi_menit || 60) * 60;
  });

  // Strict Anti-Cheat & Security Lockdown State
  const [tabViolations, setTabViolations] = useState<number>(() => {
    return initialProgress?.tabViolations || 0;
  });
  const [showCheatBanner, setShowCheatBanner] = useState(false);
  const [showCheatLockModal, setShowCheatLockModal] = useState<boolean>(() => {
    return initialSession?.student?.status_ujian === 'Diblokir';
  });
  const [isStudentBlocked, setIsStudentBlocked] = useState<boolean>(() => {
    return initialSession?.student?.status_ujian === 'Diblokir';
  });
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

  // Student Activity Logs & Recovery State
  const [activityLogs, setActivityLogs] = useState<StudentActivityLog[]>(() => {
    if (initialProgress?.logs && initialProgress.logs.length > 0) {
      return [
        ...initialProgress.logs,
        {
          timestamp: new Date().toLocaleTimeString('id-ID'),
          action: 'resume',
          detail: 'Sesi ujian berhasil dipulihkan otomatis setelah browser di-reload. Siswa langsung melanjutkan pengerjaan.',
        },
      ];
    }
    return [];
  });
  const [resumeNotice, setResumeNotice] = useState<string | null>(() => {
    if (initialSession) {
      const ansCount = Object.keys(initialProgress?.answers || {}).length;
      return ansCount > 0
        ? `Sesi Ujian & Jawaban Anda Berhasil Dipulihkan! (${ansCount} soal tersimpan otomatis, Anda langsung melanjutkan tanpa mulai dari awal).`
        : `Sesi Ujian Berhasil Dipulihkan! Silakan lanjutkan pengerjaan soal.`;
    }
    return null;
  });
  const [showActivityLogModal, setShowActivityLogModal] = useState(false);

  // Notify parent (App.tsx) so the global header locks when student is inside active exam
  useEffect(() => {
    const isRunning = Boolean(activeStudent && !submittedSummary);
    onExamStateChange?.(isRunning);
  }, [activeStudent, submittedSummary, onExamStateChange]);

  // Real-time synchronization & autosave to ensure reload/logout never loses data
  useEffect(() => {
    if (!activeStudent || !activeExam || submittedSummary) return;

    saveLocalProgress(activeStudent.token_ujian, {
      studentId: activeStudent.id,
      nama: activeStudent.nama,
      kelas: activeStudent.kelas,
      token_ujian: activeStudent.token_ujian,
      examId: activeExam.id,
      answers,
      currentIndex,
      remainingSeconds,
      tabViolations,
      logs: activityLogs,
      lastSavedAt: new Date().toISOString(),
    });

    saveActiveStudentSession({
      student: activeStudent,
      exam: activeExam,
      questions: examQuestions,
    });
  }, [
    activeStudent,
    activeExam,
    examQuestions,
    answers,
    currentIndex,
    remainingSeconds,
    tabViolations,
    activityLogs,
    submittedSummary,
  ]);

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

    // Enforce pre-validation check for Diblokir status
    if (selectedStudentObj && selectedStudentObj.status_ujian === 'Diblokir') {
      setLoginError(
        'Akses ujian Anda saat ini DIBLOKIR / DIKUNCI karena terdeteksi berpindah tab atau dikunci pengawas. Silakan hubungi Guru Pengawas untuk membuka blokir Anda terlebih dahulu di Dashboard Guru.'
      );
      return;
    }

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
    const cleanToken = tokenInput.toUpperCase().trim();

    // Panggil Fullscreen SEKARANG (sebelum ada proses await/jaringan)
    // agar browser mendeteksi sebagai Transient User Activation dari klik user.
    requestExamFullscreen();

    setIsLoggingIn(true);
    try {
      const session = await loginStudentExamCbt(
        targetNama,
        cleanToken,
        selectedExamId ? Number(selectedExamId) : undefined
      );

      const savedProgress = getLocalProgress(cleanToken, session.exam?.id);

      // Prepare questions with deterministic question & option shuffling + multi-package routing
      const prepared = prepareStudentExamQuestions({
        questions: session.questions || [],
        student: session.student,
        exam: session.exam,
      });

      const updatedStudent: StudentItem = {
        ...session.student,
        kode_soal: prepared.studentPackageCode,
        variasi_paket: prepared.studentPackageCode.replace(/[^A-D]/g, '') || 'A',
      };

      setActiveStudent(updatedStudent);
      setActiveExam(session.exam);
      setExamQuestions(prepared.questions);

      saveActiveStudentSession({
        student: updatedStudent,
        exam: session.exam,
        questions: prepared.questions,
      });

      if (savedProgress && Object.keys(savedProgress.answers || {}).length > 0) {
        // RESUME EXISTING PROGRESS (Siswa tinggal melanjutkan!)
        setAnswers(savedProgress.answers);
        setCurrentIndex(savedProgress.currentIndex || 0);
        setRemainingSeconds(
          savedProgress.remainingSeconds && savedProgress.remainingSeconds > 0
            ? savedProgress.remainingSeconds
            : (session.exam?.durasi_menit || 60) * 60
        );
        setTabViolations(savedProgress.tabViolations || 0);
        const resumedLogs: StudentActivityLog[] = [
          ...(savedProgress.logs || []),
          {
            timestamp: new Date().toLocaleTimeString('id-ID'),
            action: 'resume',
            detail: `Siswa masuk kembali dan melanjutkan sesi ujian (${Object.keys(savedProgress.answers).length} jawaban dipulihkan).`,
          },
        ];
        setActivityLogs(resumedLogs);
        setResumeNotice(
          `Sesi Ujian Dilanjutkan! Jawaban Anda sebelumnya (${Object.keys(savedProgress.answers).length} soal) berhasil dipulihkan otomatis.`
        );
      } else {
        // Fresh Session
        setAnswers({});
        setCurrentIndex(0);
        setRemainingSeconds((session.exam?.durasi_menit || 60) * 60);
        setTabViolations(0);
        setActivityLogs([
          {
            timestamp: new Date().toLocaleTimeString('id-ID'),
            action: 'login',
            detail: 'Siswa berhasil login dan memulai sesi ujian.',
          },
        ]);
        setResumeNotice(null);
      }

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
        setActiveStudent((prev) => {
          if (!prev) return null;
          const updated = { ...prev, status_ujian: newStatus };
          if (activeExam) {
            saveActiveStudentSession({
              student: updated,
              exam: activeExam,
              questions: examQuestions,
            });
          }
          return updated;
        });

        if (newStatus === 'Diblokir') {
          setIsStudentBlocked(true);
          setShowCheatLockModal(true);
        } else if (newStatus === 'Sedang Ujian') {
          setIsStudentBlocked((wasBlocked) => {
            if (wasBlocked) {
              setShowCheatLockModal(false);
              setShowCheatBanner(false);
              setSecurityNotice(
                'Kunci ujian telah dibuka oleh Guru Pengawas! Silakan lanjutkan ujian dengan tertib.'
              );
              setActivityLogs((prev) => [
                ...prev,
                {
                  timestamp: new Date().toLocaleTimeString('id-ID'),
                  action: 'unblocked',
                  detail: 'Kunci ujian telah dibuka oleh Guru Pengawas di Dashboard.',
                },
              ]);
            }
            return false;
          });
        } else if (newStatus === 'Belum Mulai') {
          // Teacher reset this student's session
          clearLocalProgress(activeStudent.token_ujian);
          clearActiveStudentSession();
          setActiveStudent(null);
          setSubmittedSummary(null);
        }
      }
    );

    return () => unsubscribe();
  }, [activeStudent?.id, activeStudent?.token_ujian, activeExam, examQuestions, submittedSummary]);

  const triggerViolation = useCallback(
    (reason = 'Terdeteksi berpindah tab browser atau keluar dari jendela ujian') => {
      if (!activeStudent || submittedSummary || isStudentBlocked) return;

      // Debounce rapid blur+visibilitychange events within 500ms
      const now = Date.now();
      if (now - lastViolationTimestampRef.current < 500) return;
      lastViolationTimestampRef.current = now;

      const timeStr = new Date().toLocaleTimeString('id-ID');
      const nextCount = tabViolations + 1;
      setTabViolations(nextCount);
      setLastViolationTime(timeStr);
      setSecurityNotice(reason);

      const newLogItem: StudentActivityLog = {
        timestamp: timeStr,
        action: 'violation',
        detail: `${reason} (Pelanggaran ke-${nextCount})`,
      };
      const blockedLogItem: StudentActivityLog = {
        timestamp: timeStr,
        action: 'blocked',
        detail: 'Sesi ujian diblokir otomatis. Menunggu guru pengawas membuka blokir.',
      };
      const updatedLogs = [...activityLogs, newLogItem, blockedLogItem];
      setActivityLogs(updatedLogs);

      // Autosave answers & state so NOTHING is lost (Siswa tinggal melanjutkan!)
      saveLocalProgress(activeStudent.token_ujian, {
        studentId: activeStudent.id,
        nama: activeStudent.nama,
        kelas: activeStudent.kelas,
        token_ujian: activeStudent.token_ujian,
        examId: activeExam ? activeExam.id : 0,
        answers,
        currentIndex,
        remainingSeconds,
        tabViolations: nextCount,
        logs: updatedLogs,
        lastSavedAt: new Date().toISOString(),
      });

      // Instantly block the student strictly as requested
      setIsStudentBlocked(true);
      setShowCheatLockModal(true);

      if (activeExam) {
        saveActiveStudentSession({
          student: { ...activeStudent, status_ujian: 'Diblokir' },
          exam: activeExam,
          questions: examQuestions,
        });
      }

      // Persist blocked status to server / Firebase
      updateStudentStatusCbt(activeStudent, 'Diblokir').then(() => {
        onExamCompleted();
      });

      safeApiJson('/api/exam/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: activeStudent.id,
          nama: activeStudent.nama,
          kelas: activeStudent.kelas,
          pelanggaranTab: nextCount,
          answeredCount: Object.keys(answers).filter(
            (k) => answers[k] && answers[k].length > 0
          ).length,
          status: 'Diblokir',
          reason,
        }),
      });
    },
    [
      activeStudent,
      activeExam,
      examQuestions,
      answers,
      currentIndex,
      remainingSeconds,
      tabViolations,
      activityLogs,
      submittedSummary,
      isStudentBlocked,
      onExamCompleted,
    ]
  );

  // Strict Anti-Cheat: Detect window blur, visibilitychange, fullscreen change, right-click, selection, drag, copy/paste, shortcuts, and active focus polling
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const handleBlur = () => {
      triggerViolation('Terdeteksi keluar dari fokus jendela ujian (Alt+Tab / Pindah Aplikasi / Layar Ganda)');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation('Terdeteksi berpindah tab browser atau meminimalkan layar ujian');
      }
    };

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && !isStudentBlocked) {
        triggerViolation('Terdeteksi keluar dari mode layar penuh (Fullscreen) ujian');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityNotice('Klik kanan dinonaktifkan demi integritas keamanan ujian.');
    };

    const handleClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      setSecurityNotice('Fitur Salin / Tempel (Copy-Paste) dikunci selama ujian.');
    };

    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      const blockedCombo =
        e.key === 'F12' ||
        e.key === 'F5' ||
        e.key === 'F11' ||
        e.key === 'PrintScreen' ||
        e.key === 'Escape' ||
        (isCtrlOrCmd &&
          e.shiftKey &&
          ['I', 'J', 'C', 'K', 'M', 'S'].includes(key)) ||
        (isCtrlOrCmd &&
          ['U', 'P', 'S', 'C', 'V', 'X', 'T', 'N', 'W', 'A', 'R', 'F', 'H', 'J', 'O'].includes(key)) ||
        (e.altKey && key === 'TAB') ||
        (e.altKey && ['ARROWLEFT', 'ARROWRIGHT', 'D', 'HOME', 'F4'].includes(key));

      if (blockedCombo) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityNotice(
          `Pintasan keyboard (${e.ctrlKey ? 'Ctrl+' : ''}${e.key}) diblokir demi keamanan integritas ujian.`
        );
      }
    };

    // Sensitive Active Polling: Check window focus & visibility every 1000ms
    const focusCheckInterval = setInterval(() => {
      if (!isStudentBlocked && (!document.hasFocus() || document.visibilityState === 'hidden')) {
        triggerViolation('Terdeteksi kehilangan fokus jendela ujian (Aplikasi eksternal / Taskbar / Layar ganda)');
      }
    }, 1000);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Synchronously flush all answers to localStorage before any refresh/tab close
      if (activeStudent && activeExam) {
        try {
          saveLocalProgress(activeStudent.token_ujian, {
            studentId: activeStudent.id,
            nama: activeStudent.nama,
            kelas: activeStudent.kelas,
            token_ujian: activeStudent.token_ujian,
            examId: activeExam.id,
            answers,
            currentIndex,
            remainingSeconds,
            tabViolations,
            logs: activityLogs,
            lastSavedAt: new Date().toISOString(),
          });
          saveActiveStudentSession({
            student: activeStudent,
            exam: activeExam,
            questions: examQuestions,
          });
        } catch {}
      }
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('copy', handleClipboard);
    document.addEventListener('cut', handleClipboard);
    document.addEventListener('paste', handleClipboard);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(focusCheckInterval);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('copy', handleClipboard);
      document.removeEventListener('cut', handleClipboard);
      document.removeEventListener('paste', handleClipboard);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeStudent, activeExam, examQuestions, answers, currentIndex, remainingSeconds, tabViolations, activityLogs, isStudentBlocked, submittedSummary, triggerViolation]);

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

      // Clear in-progress storage upon successful submission
      clearLocalProgress(activeStudent.token_ujian);
      clearActiveStudentSession();

      // Save complete receipt to student's history
      const finalReceipt: LocalExamReceipt = {
        resultId: outcome.resultId,
        studentId: activeStudent.id,
        studentNama: activeStudent.nama,
        studentKelas: activeStudent.kelas,
        tokenUjian: activeStudent.token_ujian,
        examId: activeExam.id,
        examJudul: activeExam.judul_ujian,
        skor: outcome.skor,
        kategori: outcome.kategori,
        rawEarned: outcome.rawEarned,
        rawMax: outcome.rawMax,
        answeredCount: currentAnsweredCount,
        totalQuestions: examQuestions.length,
        pelanggaranTab: tabViolations,
        jawabanSiswa: answers,
        logs: [
          ...activityLogs,
          {
            timestamp: new Date().toLocaleTimeString('id-ID'),
            action: 'submit',
            detail: `Ujian berhasil dikumpulkan dengan skor ${outcome.skor}/100.`,
          },
        ],
        submittedAt: new Date().toISOString(),
      };
      saveLocalReceipt(finalReceipt);

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
    activityLogs,
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

  // Option selection handler for PG Biasa (Radio) and PG Kompleks (Checkbox) with autosave
  const handleSelectOption = (
    questionId: number,
    optionKey: string,
    tipeSoal: string
  ) => {
    if (isStudentBlocked || !activeStudent || !activeExam) return;
    const qKey = String(questionId);
    const isKompleks = tipeSoal.toLowerCase().includes('kompleks');

    let nextAnswersMap: Record<string, string[]> = {};
    setAnswers((prev) => {
      const currentSelected = prev[qKey] || [];
      let nextSelected: string[];
      if (!isKompleks) {
        nextSelected = [optionKey];
      } else {
        const exists = currentSelected.includes(optionKey);
        nextSelected = exists
          ? currentSelected.filter((k) => k !== optionKey)
          : [...currentSelected, optionKey].sort();
      }
      nextAnswersMap = { ...prev, [qKey]: nextSelected };

      // Immediately autosave progress (Siswa tinggal melanjutkan!)
      saveLocalProgress(activeStudent.token_ujian, {
        studentId: activeStudent.id,
        nama: activeStudent.nama,
        kelas: activeStudent.kelas,
        token_ujian: activeStudent.token_ujian,
        examId: activeExam.id,
        answers: nextAnswersMap,
        currentIndex,
        remainingSeconds,
        tabViolations,
        logs: activityLogs,
        lastSavedAt: new Date().toISOString(),
      });

      return nextAnswersMap;
    });

    const timeStr = new Date().toLocaleTimeString('id-ID');
    setActivityLogs((prev) => [
      ...prev.slice(-49),
      {
        timestamp: timeStr,
        action: 'answer',
        detail: `Menjawab Soal #${currentIndex + 1} (${optionKey})`,
      },
    ]);
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Colorful Top Celebration Strip */}
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-blue-600 to-indigo-600" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Ujian Selesai Dikerjakan · Token {activeStudent.token_ujian}</span>
                </p>
                <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
                  Hasil Ujian: {activeStudent.nama}
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Kelas {activeStudent.kelas} · {activeExam?.judul_ujian}
                </p>
              </div>
              <div className="text-left sm:text-right bg-gradient-to-br from-blue-50 via-indigo-50/70 to-emerald-50/60 border border-blue-200/80 rounded-xl px-5 py-3.5">
                <div className="text-xs font-semibold text-indigo-800">Nilai Akhir CBT Sosiologi</div>
                <div className="text-4xl font-extrabold font-mono tabular-nums text-blue-700 mt-0.5">
                  {submittedSummary.skor}
                  <span className="text-lg text-slate-400 font-normal">/100</span>
                </div>
                <div className="text-xs font-medium text-emerald-800 mt-0.5">
                  Predikat: {submittedSummary.kategori}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-sm text-slate-700">
                <span>Soal Dijawab: </span>
                <strong className="font-mono tabular-nums text-blue-700">
                  {Object.keys(answers).filter((k) => answers[k]?.length > 0).length} /{' '}
                  {examQuestions.length}
                </strong>
                <span className="mx-2 text-slate-300">·</span>
                <span>Catatan Pindah Tab: </span>
                <strong className="font-mono tabular-nums text-amber-700">
                  {tabViolations} kali
                </strong>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    downloadSingleStudentResultPdf({
                      student: activeStudent,
                      exam: activeExam,
                      score: submittedSummary.skor,
                      kategori: submittedSummary.kategori,
                      answeredCount: Object.keys(answers).filter(
                        (k) => answers[k]?.length > 0
                      ).length,
                      totalQuestions: examQuestions.length,
                      tabViolations,
                      aiAnalysis: submittedSummary.aiResult,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Kartu Hasil Nilai (.PDF)</span>
                </button>

                {/* Hanya muncul jika belum ada hasil evaluasi DAN siswa mendapatkan poin > 0 */}
                {!submittedSummary.aiResult && submittedSummary.rawEarned > 0 && (
                  <button
                    type="button"
                    onClick={handleRequestInstantAiEvaluation}
                    disabled={isGeneratingStudentAi}
                    className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                  >
                    {isGeneratingStudentAi
                      ? 'Menyusun Evaluasi Capaian Sosiologi...'
                      : 'Lihat Evaluasi Capaian & Rekomendasi Belajar'}
                  </button>
                )}

                {!submittedSummary.aiResult && submittedSummary.rawEarned === 0 && (
                  <div className="px-4 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                    Skor 0: Evaluasi capaian tidak tersedia untuk lembar jawaban kosong.
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Kembali ke Halaman Login
                </button>
              </div>
            </div>

            {submittedSummary.aiResult && (
              <div className="mt-6 border border-indigo-200/80 rounded-xl p-6 bg-gradient-to-br from-blue-50/40 via-white to-emerald-50/30 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Evaluasi Kompetensi Sosiologi (LOTS &amp; HOTS)
                    </h2>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Analisis Penalaran Kognitif Sosiologi
                  </h3>
                  <p className="text-sm text-slate-800 mt-1.5 leading-relaxed">
                    {submittedSummary.aiResult.evaluasi_hots}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Kekuatan Kompetensi Materi
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                      {submittedSummary.aiResult.analisis_kompetensi.kekuatan.map(
                        (item, i) => (
                          <li key={i}>{item}</li>
                        )
                      )}
                    </ul>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                      Materi yang Perlu Diperkuat
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

                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800">
                    3 Panduan &amp; Rekomendasi Belajar Sosiologi
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
      </div>
    );
  }

  // 2. RENDER DEDICATED STUDENT PORTAL (MASUK UJIAN SISWA)
  if (!activeStudent) {
    const step1Done = Boolean(selectedKelas);
    const step2Done = Boolean(selectedKelas && selectedStudentObj);
    const step3Done = Boolean(step2Done && tokenInput.trim().length === 6);

    // Check if there is saved unsubmitted progress in localStorage for current student
    const activeSavedProgress = step3Done
      ? getLocalProgress(tokenInput.toUpperCase().trim(), selectedExamId ? Number(selectedExamId) : undefined)
      : null;

    return (
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 space-y-5">
        {/* Vibrant & Inspiring Institutional Student Login Card */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Colorful Educational Illustration Banner */}
          <div className="relative bg-gradient-to-r from-blue-700 via-indigo-700 to-emerald-600 overflow-hidden">
            <img
              src="/assets/cbt-sosiologi-banner.jpg"
              alt="Ilustrasi Belajar & Asesmen CBT Sosiologi SMA"
              className="w-full h-44 sm:h-52 object-cover object-center opacity-95"
            />
            <div className=" inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/35 to-transparent flex flex-col justify-end p-5 sm:p-6 absolute">
              <div className="flex items-center justify-between gap-2 text-xs text-amber-300 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Portal Peserta CBT Sosiologi SMA</span>
                </span>
                <span className="font-mono text-white/90 bg-white/15 backdrop-blur-xs px-2.5 py-0.5 rounded-md">
                  3 Langkah Mudah
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Selamat Datang di Ruang Ujian Sosiologi
              </h1>
              <p className="text-xs text-slate-100 mt-1 leading-relaxed max-w-xl">
                Siapkan fokus terbaikmu! Pilih <strong>Kelas</strong>, pilih <strong>Nama Lengkap</strong>, lalu masukkan <strong>Token Ujian</strong> untuk memulai asesmen.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Colorful 3-Step Horizontal Verification Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  step1Done
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-2xs'
                    : 'bg-blue-50/80 border-blue-200 text-blue-950'
                }`}
              >
                <div className="font-bold flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-bold text-white ${step1Done ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                      1
                    </span>
                    <span>Pilih Kelas</span>
                  </span>
                  {step1Done && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <div className="text-[11px] mt-1.5 font-semibold truncate text-slate-700">
                  {selectedKelas ? `Kelas ${selectedKelas}` : 'Pilih rombel Anda'}
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  step2Done
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-2xs'
                    : step1Done
                      ? 'bg-violet-50/80 border-violet-200 text-violet-950'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <div className="font-bold flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-bold text-white ${step2Done ? 'bg-emerald-600' : step1Done ? 'bg-violet-600' : 'bg-slate-400'}`}>
                      2
                    </span>
                    <span>Nama Peserta</span>
                  </span>
                  {step2Done && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <div className="text-[11px] mt-1.5 font-semibold truncate opacity-90">
                  {selectedStudentObj
                    ? selectedStudentObj.nama
                    : step1Done
                      ? `${studentsInSelectedClass.length} siswa terdaftar`
                      : 'Menunggu kelas'}
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  step3Done
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-2xs'
                    : step2Done
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <div className="font-bold flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-mono font-bold text-white ${step3Done ? 'bg-emerald-600' : step2Done ? 'bg-amber-600' : 'bg-slate-400'}`}>
                      3
                    </span>
                    <span>Token Ujian</span>
                  </span>
                  {step3Done && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <div className="text-[11px] mt-1.5 font-semibold truncate opacity-90">
                  {step3Done
                    ? 'Token siap diverifikasi'
                    : step2Done
                      ? 'Masukkan 6 karakter'
                      : 'Menunggu peserta'}
                </div>
              </div>
            </div>

            {/* Saved Progress Notice if returning student */}
            {activeSavedProgress && Object.keys(activeSavedProgress.answers || {}).length > 0 && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-950">
                    Progres Ujian Tersimpan Ditemukan!
                  </div>
                  <p className="mt-0.5 leading-relaxed text-emerald-800">
                    Sistem mendeteksi ada{' '}
                    <strong>{Object.keys(activeSavedProgress.answers).length} jawaban tersimpan</strong>{' '}
                    dari sesi sebelumnya. Saat Anda klik <em>Mulai Ujian</em>, Anda akan langsung{' '}
                    <strong>melanjutkan</strong> pengerjaan soal tanpa kehilangan jawaban.
                  </p>
                </div>
              </div>
            )}

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

              {/* PILIHAN SESI UJIAN AKTIF JIKA ADA LEBIH DARI 1 UJIAN / INFO UJIAN TUNGGAL */}
              {step1Done && (
                <div className="space-y-2">
                  {matchedExamsForSelectedClass.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Belum Ada Sesi Ujian Sosiologi yang Dibuka</div>
                        <p className="mt-0.5 leading-relaxed text-amber-800">
                          Saat ini belum ada sesi ujian berstatus <strong>AKTIF</strong> untuk kelas <strong>{selectedKelas}</strong>. Bank soal mungkin masih berstatus <em>DRAF</em> (sedang disiapkan guru) atau sesi ujian telah ditutup oleh Guru Sosiologi. Silakan tunggu instruksi pengawas.
                        </p>
                      </div>
                    </div>
                  ) : matchedExamsForSelectedClass.length > 1 ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-800">
                        Pilih Sesi Ujian Sosiologi yang Anda Ikuti:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {matchedExamsForSelectedClass.map((ex) => {
                          const isSelected = String(selectedExamId) === String(ex.id);
                          return (
                            <button
                              key={ex.id}
                              type="button"
                              onClick={() => setSelectedExamId(String(ex.id))}
                              className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-500'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                  {ex.kategori_ujian || 'Ujian Sosiologi'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-medium">
                                  {ex.durasi_menit} Menit
                                </span>
                              </div>
                              <div className="font-bold text-xs text-slate-900 mt-1 line-clamp-1">
                                {ex.judul_ujian}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 shrink-0">
                          {matchedExamsForSelectedClass[0].kategori_ujian || 'Ujian Sosiologi'}
                        </span>
                        <span className="font-semibold text-slate-900 line-clamp-1">
                          {matchedExamsForSelectedClass[0].judul_ujian}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-600 shrink-0">
                        {matchedExamsForSelectedClass[0].durasi_menit} Menit
                      </span>
                    </div>
                  )}
                </div>
              )}

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
                  className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <div className="font-bold">Akses Tidak Diizinkan</div>
                    <div className="mt-0.5">{loginError}</div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isLoggingIn ||
                  (students.length > 0 && (!step1Done || !step2Done || !step3Done)) ||
                  (step1Done && matchedExamsForSelectedClass.length === 0)
                }
                className="w-full py-3.5 px-5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-700 disabled:opacity-50 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs"
              >
                {isLoggingIn
                  ? 'Memverifikasi Kelas, Nama & Token...'
                  : activeSavedProgress
                    ? 'Lanjutkan Ujian (Jawaban Tersimpan)'
                    : 'Mulai Ujian Sekarang'}
              </button>
            </form>

            <div className="pt-5 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Dukungan Soal: PG Biasa &amp; PG Kompleks</span>
              <span>Proteksi Anti-Cheat &amp; Autosave Aktif</span>
            </div>
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
      {/* Clean Institutional Exam Status Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>
              Peserta: <strong className="text-slate-900 font-semibold">{activeStudent.nama}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>Kelas {activeStudent.kelas}</span>
            <span className="text-slate-300">·</span>
            <span>
              Token:{' '}
              <span className="font-mono tabular-nums font-semibold text-blue-700">
                {activeStudent.token_ujian}
              </span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono font-semibold text-slate-700">
              {activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A'}
            </span>
            {activeExam?.acak_soal !== false && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600">Urutan Diacak</span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span>
              Status:{' '}
              <strong
                className={`font-semibold ${
                  isStudentBlocked ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {isStudentBlocked ? 'Diblokir' : activeStudent.status_ujian}
              </strong>
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {activeExam?.judul_ujian}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowActivityLogModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>Log Sesi ({activityLogs.length})</span>
          </button>

          {!isFullscreen && (
            <button
              type="button"
              onClick={requestExamFullscreen}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Layar Penuh</span>
            </button>
          )}

          <div
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border whitespace-nowrap shrink-0 ${
              tabViolations > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <ShieldAlert
              className={`w-3.5 h-3.5 shrink-0 ${
                tabViolations > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            />
            <span>
              Pengawasan:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {tabViolations > 0 ? `${tabViolations}/${MAX_TAB_VIOLATIONS} Peringatan` : 'Aktif'}
              </strong>
            </span>
          </div>

          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono tabular-nums text-base font-bold whitespace-nowrap shrink-0 ${
              remainingSeconds < 300
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-slate-900 border-slate-900 text-white'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span aria-label="Sisa Waktu Ujian">{formatTimer(remainingSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Resume Progress Notice Banner */}
      {resumeNotice && (
        <div
          role="status"
          className="bg-emerald-900 text-white rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>
              <strong>Status Sesi Ujian:</strong> {resumeNotice}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setResumeNotice(null)}
            className="px-2.5 py-1 text-[11px] font-semibold bg-white/15 hover:bg-white/25 rounded cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

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
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            {/* Colorful Live Progress Strip */}
            <div className="bg-slate-100 h-2 w-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 transition-all duration-300"
                style={{
                  width: `${
                    examQuestions.length > 0
                      ? Math.max(5, Math.round((answeredCount / examQuestions.length) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold font-mono tabular-nums shadow-2xs">
                    SOAL NO. {currentIndex + 1} / {examQuestions.length}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-xs font-bold text-indigo-700">
                    {activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A'}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs font-semibold text-slate-600">
                    {isKompleks
                      ? 'PG Kompleks (Pilih >1 Jawaban · Bobot Maks 3)'
                      : 'PG Biasa (Pilih 1 Jawaban · Bobot 2)'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Tersimpan Otomatis</span>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono tabular-nums">
                    {currentQuestion.data_opsi?.id_soal_csv || `Q-${currentQuestion.id}`}
                  </span>
                </div>
              </div>

              {currentQuestion.data_opsi?.wacana && (
                <div className="bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-amber-50/30 border border-indigo-200/80 rounded-xl p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-800">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Wacana &amp; Stimulus Sosiologi</span>
                  </div>
                  <div className="text-sm text-slate-800 leading-relaxed">
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

                  const badgeColors: Record<string, string> = {
                    A: 'bg-blue-100 text-blue-800 border-blue-300',
                    B: 'bg-indigo-100 text-indigo-800 border-indigo-300',
                    C: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    D: 'bg-amber-100 text-amber-800 border-amber-300',
                    E: 'bg-violet-100 text-violet-800 border-violet-300',
                  };

                  return (
                    <label
                      key={optKey}
                      className={`flex items-start gap-3.5 p-4 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-blue-50/90 border-blue-600 text-slate-900 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50/80 text-slate-800'
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
                        className="sr-only"
                      />
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-extrabold flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : badgeColors[optKey] || 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {optKey}
                      </span>
                      <div className="flex-1 text-sm leading-relaxed pt-0.5">
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
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                  >
                    Soal Selanjutnya
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isStudentBlocked}
                    onClick={() => setConfirmSubmitModal(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                  >
                    <Send className="w-4 h-4" />
                    Selesaikan &amp; Kumpulkan Ujian
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Question Navigation Matrix */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Navigasi Nomor Soal
                </h2>
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Autosave Aktif</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Terjawab:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {answeredCount} / {examQuestions.length}
                </strong>{' '}
                butir soal · Disimpan otomatis
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
              <div className="space-y-3.5 text-sm text-slate-700 leading-relaxed">
                <p>
                  Peserta <strong>{activeStudent.nama}</strong> ({activeStudent.kelas}), sesi ujian Anda telah{' '}
                  <strong className="text-red-700 font-bold">DIBLOKIR SISTEM</strong> demi menjaga integritas CBT karena terdeteksi keluar dari layar ujian atau berpindah tab (
                  <strong className="font-mono text-red-700 font-bold">
                    {tabViolations} kali pelanggaran tercatat
                  </strong>
                  ).
                </p>

                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Jawaban & Sisa Waktu Anda Tersimpan Aman (Autosave)</span>
                  </div>
                  <p className="text-emerald-800 leading-relaxed">
                    Semua jawaban yang telah Anda pilih hingga detik ini tersimpan rapi di sistem. Begitu akun dibuka kembali, Anda dapat langsung <strong>melanjutkan soal berikutnya</strong> tanpa kehilangan data.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-1.5">
                  <div className="font-bold text-red-950 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Prosedur Membuka Blokir:</span>
                  </div>
                  <p>
                    Anda <strong>TIDAK DAPAT LOGIN SENDIRI</strong> sampai Guru/Pengawas membuka blokir. Silakan segera lapor kepada Guru Pengawas di ruang kelas.
                  </p>
                  <div className="p-2 bg-white/70 rounded border border-red-200 font-mono text-[11px] text-red-800">
                    Guru membuka via: Dashboard Guru → Database Siswa → Klik [Buka Kunci]
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActivityLogModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-slate-600" />
                    <span>Lihat Rekaman Pelanggaran</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      clearActiveStudentSession();
                      setActiveStudent(null);
                      setIsStudentBlocked(false);
                      setShowCheatLockModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
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

      {/* Audit Trail: Activity Log Modal */}
      {showActivityLogModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Catatan Aktivitas Siswa (Audit Trail)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowActivityLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Riwayat kronologis seluruh aktivitas pengerjaan, autosave jawaban, peringatan layar, dan status sesi ujian.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
              {activityLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Belum ada rekaman aktivitas.
                </div>
              ) : (
                [...activityLogs].reverse().map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      log.action === 'violation' || log.action === 'blocked'
                        ? 'bg-rose-50 border-rose-200 text-rose-950'
                        : log.action === 'resume'
                          ? 'bg-blue-50 border-blue-200 text-blue-950'
                          : log.action === 'answer' || log.action === 'submit'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="font-bold uppercase tracking-wider">
                        [{log.action.replace('_', ' ')}]
                      </span>
                      <span className="text-slate-500">{log.timestamp}</span>
                    </div>
                    <p className="leading-relaxed">{log.detail}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Total rekaman: {activityLogs.length} kejadian</span>
              <button
                type="button"
                onClick={() => setShowActivityLogModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

