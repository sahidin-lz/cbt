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
  syncStudentLiveTelemetryCbt,
  fetchSingleStudentStatusOnce,
  getCachedExamQuestionsLocal,
  saveCachedExamQuestionsLocal,
  saveLocalStudentAnswers,
  getLocalStudentAnswers,
  clearLocalStudentAnswers,
  autoSaveStudentAnswersToFirestoreCbt,
  safeApiJson,
} from '../lib/cbtFirestoreService';
import {
  getStudentLoginClasses,
  getStudentsForClass,
  validateStudentCascadingLogin,
  isExamMatchedForStudentClass,
  calculateExamScore,
  prepareStudentExamQuestions,
  resolveProportionalStudentExamPackage,
  getEffectiveMataPelajaran,
  getStudentAbsenInfoInClass,
} from '../utils/cbtLogic';
import { downloadSingleStudentResultPdf } from '../utils/cbtPdfGenerator';
import { MathAndTableRenderer } from './MathAndTableRenderer';
import {
  StudentAccountDashboard,
  StudentDashboardMenu,
} from './StudentAccountDashboard';

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
  assignedPackageCode?: string;
  questionOrderIds?: number[];
  preparedQuestions?: QuestionItem[];
  answers: Record<string, string[]>;
  currentIndex: number;
  remainingSeconds: number;
  tabViolations: number;
  inspectAttempts?: number;
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
    const cleanToken = token.toUpperCase().trim();
    const serialized = JSON.stringify(data);
    localStorage.setItem(PROGRESS_KEY_PREFIX + cleanToken, serialized);
    if (data.examId) {
      localStorage.setItem(
        `${PROGRESS_KEY_PREFIX}${cleanToken}_exam_${Number(data.examId)}`,
        serialized
      );
    }
    if (data.examId && data.studentId) {
      saveLocalStudentAnswers(data.examId, data.studentId, {
        examId: data.examId,
        studentId: data.studentId,
        nama: data.nama || '',
        kelas: data.kelas || '',
        token_ujian: data.token_ujian || '',
        answers: data.answers || {},
        currentIndex: data.currentIndex || 0,
        remainingSeconds: data.remainingSeconds || 0,
        tabViolations: data.tabViolations || 0,
        inspectAttempts: data.inspectAttempts || 0,
        assignedPackageCode: data.assignedPackageCode,
        questionOrderIds: data.questionOrderIds,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Failed to save progress to localStorage', e);
  }
}

function getLocalProgress(
  token: string,
  examId?: number,
  studentId?: number
): StudentExamProgress | null {
  try {
    const cleanToken = token.toUpperCase().trim();
    let baseProgress: StudentExamProgress | null = null;

    if (examId) {
      const examSpecificRaw = localStorage.getItem(
        `${PROGRESS_KEY_PREFIX}${cleanToken}_exam_${Number(examId)}`
      );
      if (examSpecificRaw) {
        const parsedExamSpecific: StudentExamProgress = JSON.parse(examSpecificRaw);
        if (
          !parsedExamSpecific.examId ||
          Number(parsedExamSpecific.examId) === Number(examId)
        ) {
          baseProgress = parsedExamSpecific;
        }
      }
    }

    if (!baseProgress) {
      const raw = localStorage.getItem(PROGRESS_KEY_PREFIX + cleanToken);
      if (raw) {
        const parsed: StudentExamProgress = JSON.parse(raw);
        if (!examId || !parsed.examId || Number(parsed.examId) === Number(examId)) {
          baseProgress = parsed;
        }
      }
    }

    const effectiveExamId = examId || baseProgress?.examId;
    const effectiveStudentId = studentId || baseProgress?.studentId;
    if (effectiveExamId && effectiveStudentId) {
      const localAnswerCache = getLocalStudentAnswers(
        effectiveExamId,
        effectiveStudentId
      );
      if (localAnswerCache) {
        if (baseProgress) {
          return {
            ...baseProgress,
            answers:
              Object.keys(localAnswerCache.answers || {}).length > 0
                ? localAnswerCache.answers
                : baseProgress.answers,
            currentIndex:
              typeof localAnswerCache.currentIndex === 'number'
                ? localAnswerCache.currentIndex
                : baseProgress.currentIndex,
            remainingSeconds:
              localAnswerCache.remainingSeconds > 0
                ? localAnswerCache.remainingSeconds
                : baseProgress.remainingSeconds,
            assignedPackageCode:
              localAnswerCache.assignedPackageCode ||
              baseProgress.assignedPackageCode,
            questionOrderIds:
              localAnswerCache.questionOrderIds || baseProgress.questionOrderIds,
          };
        }
      }
    }

    return baseProgress;
  } catch {
    return null;
  }
}

function clearLocalProgress(token: string, examId?: number, studentId?: number) {
  try {
    const cleanToken = token.toUpperCase().trim();
    localStorage.removeItem(PROGRESS_KEY_PREFIX + cleanToken);
    if (examId) {
      localStorage.removeItem(
        `${PROGRESS_KEY_PREFIX}${cleanToken}_exam_${Number(examId)}`
      );
    }
    if (examId && studentId) {
      clearLocalStudentAnswers(examId, studentId);
    }
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

const LOGGED_IN_STUDENT_ACCOUNT_KEY = 'cbt_logged_in_student_account';

function saveLoggedInStudentAccount(student: StudentItem) {
  try {
    localStorage.setItem(LOGGED_IN_STUDENT_ACCOUNT_KEY, JSON.stringify(student));
  } catch (e) {
    console.error('Failed to save student account session', e);
  }
}

function getLoggedInStudentAccount(): StudentItem | null {
  try {
    const raw = localStorage.getItem(LOGGED_IN_STUDENT_ACCOUNT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearLoggedInStudentAccount() {
  try {
    localStorage.removeItem(LOGGED_IN_STUDENT_ACCOUNT_KEY);
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

  // Proportional & deterministic package allocation per student, class (rombel), and grade (angkatan)
  const studentProportionalAllocation = useMemo(() => {
    if (!selectedStudentObj || exams.length === 0) return null;
    return resolveProportionalStudentExamPackage({
      student: selectedStudentObj,
      allStudents: students,
      exams,
      questions,
    });
  }, [selectedStudentObj, students, exams, questions]);

  // Comfortable enlarged font scale for questions & options so students' eyes don't get tired
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xlarge'>('large');

  // Attempt to restore active session on mount (so if student reloads, they stay in the exam without logging in again!)
  const initialSession = useMemo(() => {
    return getActiveStudentSession();
  }, []);

  const initialProgress = useMemo(() => {
    if (!initialSession?.student?.token_ujian) return null;
    return getLocalProgress(
      initialSession.student.token_ujian,
      initialSession.exam?.id,
      initialSession.student.id
    );
  }, [initialSession]);

  // Logged-in Student Account State (Portal Akun Siswa)
  const [loggedInAccount, setLoggedInAccount] = useState<StudentItem | null>(() => {
    return initialSession?.student || getLoggedInStudentAccount() || null;
  });
  const [accountDashboardMenu, setAccountDashboardMenu] =
    useState<StudentDashboardMenu>('beranda');

  // Keep loggedInAccount synced when students list updates from Firestore
  useEffect(() => {
    if (!loggedInAccount || students.length === 0) return;
    const fresh = students.find((s) => Number(s.id) === Number(loggedInAccount.id));
    if (fresh) {
      const merged: StudentItem = {
        ...loggedInAccount,
        ...fresh,
        password_login: fresh.password_login ?? loggedInAccount.password_login,
        nisn: fresh.nisn ?? loggedInAccount.nisn,
      };
      if (JSON.stringify(merged) !== JSON.stringify(loggedInAccount)) {
        setLoggedInAccount(merged);
        saveLoggedInStudentAccount(merged);
      }
    }
  }, [students, loggedInAccount]);

  // Active Exam Session State
  const [activeStudent, setActiveStudent] = useState<StudentItem | null>(() => {
    return initialSession?.student || null;
  });
  const [activeExam, setActiveExam] = useState<ExamItem | null>(() => {
    return initialSession?.exam || null;
  });
  const [examQuestions, setExamQuestions] = useState<QuestionItem[]>(() => {
    if (initialSession?.questions && initialSession.questions.length > 0) {
      return initialSession.questions;
    }
    if (initialSession?.exam?.id) {
      return getCachedExamQuestionsLocal(initialSession.exam.id) || [];
    }
    return [];
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
  const [inspectAttempts, setInspectAttempts] = useState<number>(() => {
    return initialProgress?.inspectAttempts || 0;
  });
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
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
  const lastInspectAttemptRef = useRef<number>(0);
  const baselineWindowGapRef = useRef<{ wGap: number; hGap: number } | null>(null);

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

  // Keep examQuestions bobot synchronized with live Bank Soal weights while preserving student's exact question order & option shuffle
  useEffect(() => {
    if (!activeStudent || !activeExam || questions.length === 0 || examQuestions.length === 0) {
      return;
    }
    const qMap = new Map<number, QuestionItem>();
    for (const q of questions) {
      qMap.set(Number(q.id), q);
    }
    let hasChanged = false;
    const syncedList = examQuestions.map((eq) => {
      const liveQ = qMap.get(Number(eq.id));
      if (!liveQ) return eq;
      const liveBobot =
        Number(liveQ.bobot) > 0
          ? Number(liveQ.bobot)
          : Number(eq.bobot) > 0
          ? Number(eq.bobot)
          : String(liveQ.tipe_soal || eq.tipe_soal || '')
              .toLowerCase()
              .includes('kompleks')
          ? 3
          : 2;
      if (Number(eq.bobot) !== liveBobot) {
        hasChanged = true;
        return {
          ...eq,
          bobot: liveBobot,
        };
      }
      return eq;
    });
    if (hasChanged) {
      setExamQuestions(syncedList);
    }
  }, [questions, activeStudent, activeExam, examQuestions]);

  // Real-time synchronization & autosave to ensure reload/logout/error never loses package, shuffle order, or answers
  useEffect(() => {
    if (!activeStudent || !activeExam || submittedSummary) return;

    saveLocalProgress(activeStudent.token_ujian, {
      studentId: activeStudent.id,
      nama: activeStudent.nama,
      kelas: activeStudent.kelas,
      token_ujian: activeStudent.token_ujian,
      examId: activeExam.id,
      assignedPackageCode:
        activeStudent.kode_soal || activeExam.kode_paket || 'PAKET-A',
      questionOrderIds: examQuestions.map((q) => Number(q.id)),
      preparedQuestions: examQuestions,
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
    if (studentProportionalAllocation?.exam) {
      setSelectedExamId(String(studentProportionalAllocation.exam.id));
    } else if (matchedExamsForSelectedClass.length > 0) {
      setSelectedExamId(String(matchedExamsForSelectedClass[0].id));
    } else if (exams.length > 0 && !selectedExamId) {
      setSelectedExamId(String(exams[0].id));
    }
  }, [exams, matchedExamsForSelectedClass, studentProportionalAllocation, selectedExamId]);

  const tabInstanceIdRef = useRef<string>(
    `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );
  const [isClosedByOtherExamTab, setIsClosedByOtherExamTab] = useState(false);

  const broadcastCloseOtherTabsAndApps = useCallback(
    (studentName?: string, examTitle?: string) => {
      const payload = {
        type: 'CLOSE_OTHER_TABS',
        sourceTabId: tabInstanceIdRef.current,
        studentName: studentName || activeStudent?.nama || loggedInAccount?.nama || 'Siswa',
        examTitle: examTitle || activeExam?.judul_ujian || 'Sesi Ujian CBT',
        timestamp: Date.now(),
      };
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('cbt_exam_kiosk_channel');
          channel.postMessage(payload);
          channel.close();
        }
      } catch {
        // Ignore if BroadcastChannel is not supported
      }
      try {
        localStorage.setItem('cbt_kiosk_close_signal', JSON.stringify(payload));
      } catch {
        // Ignore storage error
      }
    },
    [activeStudent?.nama, loggedInAccount?.nama, activeExam?.judul_ujian]
  );

  // Listen for cross-tab auto-close signal when an exam starts in another tab
  useEffect(() => {
    const handleIncomingSignal = (data: any) => {
      if (!data || data.type !== 'CLOSE_OTHER_TABS') return;
      if (data.sourceTabId && data.sourceTabId !== tabInstanceIdRef.current) {
        setIsClosedByOtherExamTab(true);
        try {
          window.opener = null;
          window.close();
        } catch {
          // If browser blocks script window.close(), the tab stays locked on the closed-tab screen
        }
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('cbt_exam_kiosk_channel');
        channel.onmessage = (event) => handleIncomingSignal(event.data);
      }
    } catch {
      channel = null;
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cbt_kiosk_close_signal' && e.newValue) {
        try {
          handleIncomingSignal(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      if (channel) {
        try {
          channel.close();
        } catch {}
      }
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const requestExamFullscreen = useCallback(async () => {
    broadcastCloseOtherTabsAndApps();
    const docEl = document.documentElement as HTMLElement & {
      requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    };
    try {
      if (!document.fullscreenElement && typeof docEl.requestFullscreen === 'function') {
        await docEl.requestFullscreen({
          navigationUI: 'hide',
        });
      }
      if (
        typeof navigator !== 'undefined' &&
        (navigator as any).keyboard &&
        typeof (navigator as any).keyboard.lock === 'function'
      ) {
        await (navigator as any).keyboard
          .lock(['Escape', 'F11', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'Tab'])
          .catch(() => {});
      }
    } catch {
      try {
        if (!document.fullscreenElement && typeof docEl.requestFullscreen === 'function') {
          await docEl.requestFullscreen();
        }
      } catch {
        // Ignore if browser blocks automatic fullscreen
      }
    }
  }, [broadcastCloseOtherTabsAndApps]);

  useEffect(() => {
    const onFsChange = () => {
      const fsActive = Boolean(document.fullscreenElement);
      setIsFullscreen(fsActive);
      if (!fsActive && typeof navigator !== 'undefined' && (navigator as any).keyboard?.unlock) {
        try {
          (navigator as any).keyboard.unlock();
        } catch {}
      }
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

  // Login to Student Account Portal (3-Step Login with Custom Password or System Token)
  const handleAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (students.length > 0) {
      const validation = validateStudentCascadingLogin({
        students,
        selectedKelas,
        selectedStudentId,
        tokenInput,
        allowAccountPortalLogin: true,
      });
      if (!validation.ok) {
        setLoginError(validation.error);
        return;
      }

      const matchedStudent = validation.student;
      const proportional = resolveProportionalStudentExamPackage({
        student: matchedStudent,
        allStudents: students,
        exams,
        questions,
      });

      const enrichedStudent: StudentItem = {
        ...matchedStudent,
        kode_soal:
          proportional?.packageCode ||
          matchedStudent.kode_soal ||
          'PAKET-A',
      };

      setLoggedInAccount(enrichedStudent);
      saveLoggedInStudentAccount(enrichedStudent);
      setAccountDashboardMenu('beranda');
      setTokenInput('');
      setLoginError(null);
    } else {
      if (!namaInput.trim()) {
        setLoginError('Silakan pilih atau masukkan Nama Lengkap Siswa terlebih dahulu.');
        return;
      }
      if (!tokenInput.trim() || tokenInput.trim().length < 4) {
        setLoginError('Password / Token Login minimal 4 karakter.');
        return;
      }
    }
  };

  // Start Exam Worksheet from Student Account Dashboard (after Teacher's Exam Session Token is verified)
  const handleStartExamFromDashboard = async (targetExam: ExamItem) => {
    const currentAccount = loggedInAccount || selectedStudentObj;
    if (!currentAccount) {
      throw new Error('Sesi akun siswa tidak ditemukan. Silakan login kembali.');
    }

    if (currentAccount.status_ujian === 'Diblokir') {
      throw new Error(
        'Akses ujian Anda saat ini DIBLOKIR / DIKUNCI karena terdeteksi berpindah tab atau dikunci pengawas. Silakan hubungi Guru Pengawas untuk membuka blokir Anda.'
      );
    }

    setIsClosedByOtherExamTab(false);
    broadcastCloseOtherTabsAndApps(currentAccount.nama, targetExam.judul_ujian);
    requestExamFullscreen();
    setIsLoggingIn(true);

    try {
      const cleanSystemToken = String(currentAccount.token_ujian || '')
        .toUpperCase()
        .trim();

      const preSavedProgress = getLocalProgress(
        cleanSystemToken,
        targetExam.id,
        currentAccount.id
      );
      const preferredExamIdToUse = preSavedProgress?.examId || targetExam.id;

      // Check localStorage question cache (cbt_soal_${ujianId}) first before loginStudentExamCbt
      const preCachedQuestions = getCachedExamQuestionsLocal(preferredExamIdToUse);

      const session = await loginStudentExamCbt(
        currentAccount.nama,
        cleanSystemToken,
        preferredExamIdToUse
      );

      const rawExamQuestions =
        preCachedQuestions && preCachedQuestions.length > 0
          ? preCachedQuestions
          : session.questions || [];

      if (session.exam?.id && rawExamQuestions.length > 0) {
        saveCachedExamQuestionsLocal(session.exam.id, rawExamQuestions);
      }

      const savedProgress =
        getLocalProgress(cleanSystemToken, session.exam?.id, currentAccount.id) ||
        preSavedProgress;

      const proportional = resolveProportionalStudentExamPackage({
        student: currentAccount,
        allStudents: students,
        exams,
        questions,
        preferredExamId: session.exam?.id || preferredExamIdToUse,
      });

      // Deterministic Priority:
      // 1. Saved package code from previous interrupted attempt on this exam
      // 2. Proportional Ganjil/Genap or Multi-Mapel package allocation
      // 3. Student's assigned kode_soal from login session
      // 4. Exam default kode_paket
      const syncedPackageCode =
        savedProgress?.assignedPackageCode ||
        proportional?.packageCode ||
        session.student.kode_soal ||
        session.exam?.kode_paket ||
        'PAKET-A';

      const prepared = prepareStudentExamQuestions({
        questions: rawExamQuestions,
        student: {
          ...session.student,
          kode_soal: syncedPackageCode,
        },
        exam: session.exam,
        forcedPackageCode: syncedPackageCode,
        lockedQuestionOrderIds: savedProgress?.questionOrderIds,
      });

      const updatedStudent: StudentItem = {
        ...session.student,
        nisn: currentAccount.nisn || session.student.nisn,
        password_login:
          currentAccount.password_login || session.student.password_login,
        kode_soal: prepared.studentPackageCode,
        variasi_paket: prepared.studentPackageCode.replace(/[^A-D]/g, '') || 'A',
      };

      setLoggedInAccount(updatedStudent);
      saveLoggedInStudentAccount(updatedStudent);

      setActiveStudent(updatedStudent);
      setActiveExam(session.exam);
      setExamQuestions(prepared.questions);

      saveActiveStudentSession({
        student: updatedStudent,
        exam: session.exam,
        questions: prepared.questions,
      });

      if (savedProgress && Object.keys(savedProgress.answers || {}).length > 0) {
        setAnswers(savedProgress.answers);
        setCurrentIndex(savedProgress.currentIndex || 0);
        setRemainingSeconds(
          savedProgress.remainingSeconds && savedProgress.remainingSeconds > 0
            ? savedProgress.remainingSeconds
            : (session.exam?.durasi_menit || 60) * 60
        );
        setTabViolations(savedProgress.tabViolations || 0);
        setInspectAttempts(savedProgress.inspectAttempts || 0);
        saveLocalStudentAnswers(session.exam.id, updatedStudent.id, {
          examId: session.exam.id,
          studentId: updatedStudent.id,
          nama: updatedStudent.nama,
          kelas: updatedStudent.kelas,
          token_ujian: updatedStudent.token_ujian,
          answers: savedProgress.answers,
          currentIndex: savedProgress.currentIndex || 0,
          remainingSeconds:
            savedProgress.remainingSeconds || (session.exam.durasi_menit || 60) * 60,
          tabViolations: savedProgress.tabViolations || 0,
          inspectAttempts: savedProgress.inspectAttempts || 0,
          assignedPackageCode: prepared.studentPackageCode,
          questionOrderIds: prepared.questions.map((q) => Number(q.id)),
          updatedAt: new Date().toISOString(),
        });
        const resumedLogs: StudentActivityLog[] = [
          ...(savedProgress.logs || []),
          {
            timestamp: new Date().toLocaleTimeString('id-ID'),
            action: 'resume',
            detail: `Siswa masuk kembali dan melanjutkan sesi ujian [${prepared.studentPackageCode}] (${Object.keys(savedProgress.answers).length} jawaban dipulihkan dari localStorage dengan urutan soal konsisten).`,
          },
        ];
        setActivityLogs(resumedLogs);
        setResumeNotice(
          `Sesi Ujian Dilanjutkan (${prepared.studentPackageCode})! Urutan soal, paket soal, dan jawaban Anda sebelumnya (${Object.keys(savedProgress.answers).length} soal) berhasil dipulihkan otomatis dari memori lokal.`
        );
      } else {
        setAnswers({});
        setCurrentIndex(0);
        setRemainingSeconds((session.exam?.durasi_menit || 60) * 60);
        setTabViolations(0);
        setInspectAttempts(0);
        saveLocalStudentAnswers(session.exam.id, updatedStudent.id, {
          examId: session.exam.id,
          studentId: updatedStudent.id,
          nama: updatedStudent.nama,
          kelas: updatedStudent.kelas,
          token_ujian: updatedStudent.token_ujian,
          answers: {},
          currentIndex: 0,
          remainingSeconds: (session.exam?.durasi_menit || 60) * 60,
          tabViolations: 0,
          inspectAttempts: 0,
          assignedPackageCode: prepared.studentPackageCode,
          questionOrderIds: prepared.questions.map((q) => Number(q.id)),
          updatedAt: new Date().toISOString(),
        });
        const startLogs: StudentActivityLog[] = [
          {
            timestamp: new Date().toLocaleTimeString('id-ID'),
            action: 'login',
            detail: `Siswa memulai sesi ujian "${session.exam?.judul_ujian || targetExam.judul_ujian}" [${prepared.studentPackageCode}] setelah verifikasi Token Sesi Ujian.`,
          },
        ];
        setActivityLogs(startLogs);
        setResumeNotice(null);
      }

      baselineWindowGapRef.current = {
        wGap: Math.max(0, window.outerWidth - window.innerWidth),
        hGap: Math.max(0, window.outerHeight - window.innerHeight),
      };
      setIsDevToolsOpen(false);
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
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Manual one-time status check (replaces real-time onSnapshot listener to save daily Firestore reads)
  const [isCheckingUnlockStatus, setIsCheckingUnlockStatus] = useState(false);

  const handleCheckStudentStatusManual = useCallback(async () => {
    if (!activeStudent || submittedSummary) return;
    setIsCheckingUnlockStatus(true);
    try {
      const freshStatus = await fetchSingleStudentStatusOnce(activeStudent.id);
      if (!freshStatus) return;
      const newStatus = (
        freshStatus === 'Diblokir' ||
        freshStatus === 'Sedang Ujian' ||
        freshStatus === 'Selesai' ||
        freshStatus === 'Belum Mulai'
          ? freshStatus
          : 'Belum Mulai'
      ) as StudentItem['status_ujian'];

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
        clearLocalProgress(
          activeStudent.token_ujian,
          activeExam?.id,
          activeStudent.id
        );
        clearActiveStudentSession();
        setActiveStudent(null);
        setSubmittedSummary(null);
      }
    } finally {
      setIsCheckingUnlockStatus(false);
    }
  }, [activeStudent, activeExam, examQuestions, submittedSummary]);

  const getBrowserDeviceSummary = useCallback(() => {
    try {
      const ua = navigator.userAgent || '';
      const browser = ua.includes('Edg/')
        ? 'Edge'
        : ua.includes('Chrome/')
          ? 'Chrome'
          : ua.includes('Firefox/')
            ? 'Firefox'
            : ua.includes('Safari/')
              ? 'Safari'
              : 'Browser';
      const os = ua.includes('Windows')
        ? 'Windows'
        : ua.includes('Android')
          ? 'Android'
          : ua.includes('Mac')
            ? 'macOS'
            : ua.includes('Linux')
              ? 'Linux'
              : 'OS';
      return `${browser} · ${os} (${window.innerWidth}x${window.innerHeight})`;
    } catch {
      return 'Web Browser';
    }
  }, []);

  const triggerViolation = useCallback(
    (
      reason = 'Terdeteksi berpindah tab browser atau keluar dari jendela ujian',
      extraInspectCount = 0,
      devToolsDetected = false
    ) => {
      if (!activeStudent || submittedSummary || isStudentBlocked) return;

      // Debounce rapid blur+visibilitychange events within 500ms
      const now = Date.now();
      if (now - lastViolationTimestampRef.current < 500) return;
      lastViolationTimestampRef.current = now;

      const timeStr = new Date().toLocaleTimeString('id-ID');
      const nextCount = tabViolations + 1;
      const nextInspectCount = inspectAttempts + extraInspectCount;
      setTabViolations(nextCount);
      if (extraInspectCount > 0) {
        setInspectAttempts(nextInspectCount);
      }
      if (devToolsDetected) {
        setIsDevToolsOpen(true);
      }
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

      const currentAnsCount = Object.keys(answers).filter(
        (k) => answers[k] && answers[k].length > 0
      ).length;

      // Autosave answers & state so NOTHING is lost (Siswa tinggal melanjutkan!)
      saveLocalProgress(activeStudent.token_ujian, {
        studentId: activeStudent.id,
        nama: activeStudent.nama,
        kelas: activeStudent.kelas,
        token_ujian: activeStudent.token_ujian,
        examId: activeExam ? activeExam.id : 0,
        assignedPackageCode:
          activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A',
        questionOrderIds: examQuestions.map((q) => Number(q.id)),
        preparedQuestions: examQuestions,
        answers,
        currentIndex,
        remainingSeconds,
        tabViolations: nextCount,
        inspectAttempts: nextInspectCount,
        logs: updatedLogs,
        lastSavedAt: new Date().toISOString(),
      });

      // Instantly block the student strictly as requested
      setIsStudentBlocked(true);
      setShowCheatLockModal(true);

      const blockedStudentObj: StudentItem = {
        ...activeStudent,
        status_ujian: 'Diblokir',
        live_telemetry: {
          exam_id: activeExam?.id || 0,
          judul_ujian: activeExam?.judul_ujian || 'Ujian CBT',
          kode_paket:
            activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A',
          current_question_no: currentIndex + 1,
          answered_count: currentAnsCount,
          total_questions: examQuestions.length,
          remaining_seconds: remainingSeconds,
          is_fullscreen: Boolean(document.fullscreenElement),
          is_focused: false,
          devtools_open: devToolsDetected || isDevToolsOpen,
          tab_violations: nextCount,
          inspect_attempts: nextInspectCount,
          last_action: `DIBLOKIR: ${reason}`,
          last_active_at: new Date().toISOString(),
          device_info: getBrowserDeviceSummary(),
          recent_logs: updatedLogs.slice(-12),
        },
      };

      if (activeExam) {
        saveActiveStudentSession({
          student: blockedStudentObj,
          exam: activeExam,
          questions: examQuestions,
        });
      }

      // Persist blocked status & live telemetry to server / Firebase
      updateStudentStatusCbt(blockedStudentObj, 'Diblokir').then(() => {
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
          inspectAttempts: nextInspectCount,
          answeredCount: currentAnsCount,
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
      inspectAttempts,
      isDevToolsOpen,
      activityLogs,
      submittedSummary,
      isStudentBlocked,
      onExamCompleted,
      getBrowserDeviceSummary,
    ]
  );

  // Strict Anti-Cheat & Anti-Inspect Element: Detect window blur, visibilitychange, fullscreen change, right-click, DevTools shortcuts, docked DevTools panel, selection, drag, copy/paste
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const recordInspectAttempt = (inspectReason: string, shouldBlockImmediately: boolean) => {
      const now = Date.now();
      if (now - lastInspectAttemptRef.current < 600) return;
      lastInspectAttemptRef.current = now;

      const nextInspect = inspectAttempts + 1;
      setInspectAttempts(nextInspect);
      const timeStr = new Date().toLocaleTimeString('id-ID');
      const inspectLog: StudentActivityLog = {
        timestamp: timeStr,
        action: 'violation',
        detail: `PERCOBAAN INSPECT ELEMENT #${nextInspect}: ${inspectReason}`,
      };
      const nextLogs = [...activityLogs.slice(-49), inspectLog];
      setActivityLogs(nextLogs);
      setSecurityNotice(
        `DILARANG INSPECT ELEMENT! (${inspectReason}) — Tercatat di layar pengawas (${nextInspect}x).`
      );

      if (shouldBlockImmediately) {
        triggerViolation(
          `Terdeteksi mencoba Inspect Element / Developer Tools (${inspectReason})`,
          1,
          true
        );
      } else {
        const currentAnsCount = Object.keys(answers).filter(
          (k) => answers[k] && answers[k].length > 0
        ).length;
        syncStudentLiveTelemetryCbt(activeStudent, {
          exam_id: activeExam?.id || 0,
          judul_ujian: activeExam?.judul_ujian || 'Ujian CBT',
          kode_paket:
            activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A',
          current_question_no: currentIndex + 1,
          answered_count: currentAnsCount,
          total_questions: examQuestions.length,
          remaining_seconds: remainingSeconds,
          is_fullscreen: Boolean(document.fullscreenElement),
          is_focused: document.hasFocus() && document.visibilityState === 'visible',
          devtools_open: isDevToolsOpen,
          tab_violations: tabViolations,
          inspect_attempts: nextInspect,
          last_action: `PERINGATAN: ${inspectReason} (Soal #${currentIndex + 1})`,
          device_info: getBrowserDeviceSummary(),
          recent_logs: nextLogs.slice(-12),
        });
      }
    };

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
      e.stopPropagation();
      recordInspectAttempt('Mencoba Klik Kanan / Inspect Element pada lembar soal', false);
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
      const key = (e.key || '').toUpperCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isMacAltCmd = e.metaKey && e.altKey;

      // 1. Strict Inspect Element & DevTools Shortcuts -> Block + Trigger Immediate Lockdown
      const isInspectDevToolsShortcut =
        e.key === 'F12' ||
        (isCtrlOrCmd && e.shiftKey && ['I', 'J', 'C', 'K', 'M'].includes(key)) ||
        (isMacAltCmd && ['I', 'J', 'C', 'K', 'U'].includes(key)) ||
        (isCtrlOrCmd && key === 'U');

      if (isInspectDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
        const comboLabel =
          e.key === 'F12'
            ? 'Tombol F12 (DevTools)'
            : `${e.ctrlKey ? 'Ctrl+' : e.metaKey ? 'Cmd+' : ''}${e.shiftKey ? 'Shift+' : e.altKey ? 'Opt+' : ''}${key} (Inspect Element)`;
        recordInspectAttempt(`Menekan pintasan ${comboLabel}`, true);
        return;
      }

      // 2. Other blocked browser/navigation shortcuts
      const blockedCombo =
        e.key === 'F5' ||
        e.key === 'F11' ||
        e.key === 'PrintScreen' ||
        e.key === 'Escape' ||
        (isCtrlOrCmd && e.shiftKey && key === 'S') ||
        (isCtrlOrCmd &&
          ['P', 'S', 'C', 'V', 'X', 'T', 'N', 'W', 'A', 'R', 'F', 'H', 'J', 'O'].includes(key)) ||
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

    // Sensitive Active Polling: Check window focus, visibility, AND Docked DevTools panel every 1000ms
    const focusCheckInterval = setInterval(() => {
      if (isStudentBlocked) return;

      if (!document.hasFocus() || document.visibilityState === 'hidden') {
        triggerViolation('Terdeteksi kehilangan fokus jendela ujian (Aplikasi eksternal / Taskbar / Layar ganda)');
        return;
      }

      // Detect if student opened Docked DevTools panel (Inspect Element side/bottom panel)
      const baseGap = baselineWindowGapRef.current || { wGap: 24, hGap: 110 };
      const currentWGap = Math.max(0, window.outerWidth - window.innerWidth);
      const currentHGap = Math.max(0, window.outerHeight - window.innerHeight);
      const dockedSideDevTools = currentWGap - baseGap.wGap > 180;
      const dockedBottomDevTools = currentHGap - baseGap.hGap > 180;

      if (dockedSideDevTools || dockedBottomDevTools) {
        setIsDevToolsOpen(true);
        recordInspectAttempt('Membuka Panel Inspect Element / Developer Tools Browser', true);
      } else if (isDevToolsOpen) {
        setIsDevToolsOpen(false);
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
            assignedPackageCode:
              activeStudent.kode_soal || activeExam.kode_paket || 'PAKET-A',
            questionOrderIds: examQuestions.map((q) => Number(q.id)),
            preparedQuestions: examQuestions,
            answers,
            currentIndex,
            remainingSeconds,
            tabViolations,
            inspectAttempts,
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
  }, [
    activeStudent,
    activeExam,
    examQuestions,
    answers,
    currentIndex,
    remainingSeconds,
    tabViolations,
    inspectAttempts,
    isDevToolsOpen,
    activityLogs,
    isStudentBlocked,
    submittedSummary,
    triggerViolation,
    getBrowserDeviceSummary,
  ]);

  // Live Telemetry Heartbeat & Question Navigation Broadcaster (syncs to Admin screen in real time)
  const latestTelemetryStateRef = useRef({
    currentIndex,
    answers,
    remainingSeconds,
    isFullscreen,
    isDevToolsOpen,
    tabViolations,
    inspectAttempts,
    activityLogs,
    isStudentBlocked,
  });

  useEffect(() => {
    latestTelemetryStateRef.current = {
      currentIndex,
      answers,
      remainingSeconds,
      isFullscreen,
      isDevToolsOpen,
      tabViolations,
      inspectAttempts,
      activityLogs,
      isStudentBlocked,
    };
  }, [
    currentIndex,
    answers,
    remainingSeconds,
    isFullscreen,
    isDevToolsOpen,
    tabViolations,
    inspectAttempts,
    activityLogs,
    isStudentBlocked,
  ]);

  // Track whether there are new answer changes since the last 5-minute periodic auto-save
  const hasUnsavedAnswerChangesRef = useRef<boolean>(false);

  // Periodic 5-minute (300,000 ms) auto-save to Firestore as server backup if student switches devices.
  // Only writes to Firestore if there are new answer changes (hasUnsavedAnswerChangesRef.current === true).
  useEffect(() => {
    if (!activeStudent || !activeExam || submittedSummary) return;

    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    const autoSaveInterval = window.setInterval(() => {
      if (!hasUnsavedAnswerChangesRef.current) {
        return;
      }
      const stRef = latestTelemetryStateRef.current;
      hasUnsavedAnswerChangesRef.current = false;

      autoSaveStudentAnswersToFirestoreCbt({
        student: activeStudent,
        exam: activeExam,
        answers: stRef.answers,
        currentIndex: stRef.currentIndex,
        totalQuestions: examQuestions.length,
        remainingSeconds: stRef.remainingSeconds,
        tabViolations: stRef.tabViolations,
        inspectAttempts: stRef.inspectAttempts,
      });
    }, FIVE_MINUTES_MS);

    return () => window.clearInterval(autoSaveInterval);
  }, [activeStudent, activeExam, examQuestions.length, submittedSummary]);

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

      // Clear temporary in-progress localStorage data upon final submission
      hasUnsavedAnswerChangesRef.current = false;
      clearLocalProgress(activeStudent.token_ujian, activeExam.id, activeStudent.id);
      clearLocalStudentAnswers(activeExam.id, activeStudent.id);
      clearActiveStudentSession();

      const finalLogs: StudentActivityLog[] = [
        ...activityLogs,
        {
          timestamp: new Date().toLocaleTimeString('id-ID'),
          action: 'submit',
          detail: `Ujian berhasil dikumpulkan dengan skor ${outcome.skor}/100.`,
        },
      ];

      // Save complete receipt to student's history (with canonical Bank Soal option keys)
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
        jawabanSiswa: outcome.canonicalAnswers || answers,
        logs: finalLogs,
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
        assignedPackageCode:
          activeStudent.kode_soal || activeExam.kode_paket || 'PAKET-A',
        questionOrderIds: examQuestions.map((q) => Number(q.id)),
        preparedQuestions: examQuestions,
        answers: nextAnswersMap,
        currentIndex,
        remainingSeconds,
        tabViolations,
        inspectAttempts,
        logs: activityLogs,
        lastSavedAt: new Date().toISOString(),
      });

      return nextAnswersMap;
    });

    // Save immediately to localStorage (cbt_jawaban_${ujianId}_${userId}) without sending any Firestore request
    hasUnsavedAnswerChangesRef.current = true;
    saveLocalStudentAnswers(activeExam.id, activeStudent.id, {
      examId: activeExam.id,
      studentId: activeStudent.id,
      nama: activeStudent.nama,
      kelas: activeStudent.kelas,
      token_ujian: activeStudent.token_ujian,
      answers: nextAnswersMap,
      currentIndex,
      remainingSeconds,
      tabViolations,
      inspectAttempts,
      assignedPackageCode:
        activeStudent.kode_soal || activeExam.kode_paket || 'PAKET-A',
      questionOrderIds: examQuestions.map((q) => Number(q.id)),
      updatedAt: new Date().toISOString(),
    });

    const timeStr = new Date().toLocaleTimeString('id-ID');
    const newAnswerLog: StudentActivityLog = {
      timestamp: timeStr,
      action: 'answer',
      detail: `Menjawab Soal #${currentIndex + 1} (${optionKey}) — Tersimpan instan di memori lokal`,
    };
    const nextLogs = [...activityLogs.slice(-49), newAnswerLog];
    setActivityLogs(nextLogs);
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
        student: activeStudent,
        exam: activeExam || undefined,
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

  // 0. RENDER AUTO-CLOSED DUPLICATE TAB SCREEN (WHEN EXAM STARTS IN PRIMARY TAB)
  if (isClosedByOtherExamTab) {
    return (
      <div className="min-h-[80vh] max-w-3xl mx-auto w-full py-12 px-4 sm:px-6 flex items-center justify-center select-none">
        <div className="bg-slate-900 text-white border-2 border-red-500/80 rounded-2xl p-8 shadow-xl text-center space-y-4 w-full">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-400/40 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-red-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-500/20 border border-red-400/30 text-red-300 text-xs font-bold uppercase tracking-wider">
            Isolasi Sesi Ujian CBT Aktif · Tab Lain Ditutup Otomatis
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Tab Ini Telah Ditutup Otomatis Karena Anda Sedang Memulai Ujian
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl mx-auto">
            Demi kejujuran akademik dan keamanan ujian, sistem otomatis menutup dan menonaktifkan seluruh tab lain saat lembar soal dibuka. Silakan lanjutkan pengerjaan ujian Anda pada <strong>jendela/tab ujian utama yang sedang berada dalam Mode Layar Penuh (Fullscreen)</strong>.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                try {
                  window.close();
                } catch {}
                setIsClosedByOtherExamTab(false);
              }}
              className="px-5 py-2.5 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors cursor-pointer"
            >
              Tutup Tab Ini / Kembali ke Jendela Aktif
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. RENDER COMPLETED EXAM SUMMARY SCREEN
  if (activeStudent && submittedSummary) {
    const completedMapel = getEffectiveMataPelajaran(activeExam);
    const completedPkg =
      activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A';
    return (
      <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          {/* Colorful Top Celebration Strip */}
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-blue-600 to-indigo-600" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ujian Selesai Dikerjakan</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-900 font-mono">
                    {completedPkg}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                    Mapel: {completedMapel}
                  </span>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
                  Hasil Ujian: {activeStudent.nama}
                </h1>
                <p className="text-sm text-slate-600">
                  Kelas {activeStudent.kelas} · {activeExam?.judul_ujian} · Token{' '}
                  <strong className="font-mono text-indigo-700">
                    {activeStudent.token_ujian}
                  </strong>
                </p>
              </div>
              <div className="text-left sm:text-right bg-gradient-to-br from-blue-50 via-indigo-50/70 to-emerald-50/60 border border-blue-200/80 rounded-2xl px-5 py-3.5 shadow-2xs">
                <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  Nilai Akhir CBT {completedMapel}
                </div>
                <div className="text-4xl font-extrabold font-mono tabular-nums text-blue-700 mt-0.5">
                  {submittedSummary.skor}
                  <span className="text-lg text-slate-400 font-normal">/100</span>
                </div>
                <div className="text-xs font-bold text-emerald-800 mt-0.5">
                  Predikat: {submittedSummary.kategori}
                </div>
                <div className="text-[11px] font-mono font-semibold text-slate-600 mt-0.5">
                  Poin Bobot: {submittedSummary.rawEarned} / {submittedSummary.rawMax} Poin
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
                      questions: examQuestions,
                      studentAnswers: answers,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Kartu Hasil Nilai &amp; Pembahasan Soal (.PDF)</span>
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
                    setAccountDashboardMenu('hasil');
                    setNamaInput('');
                    setTokenInput('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Kembali ke Dashboard Akun Siswa
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

  // 2. RENDER STUDENT ACCOUNT DASHBOARD (IF LOGGED IN TO ACCOUNT & NOT IN ACTIVE EXAM WORKSHEET)
  if (!activeStudent && loggedInAccount) {
    return (
      <StudentAccountDashboard
        student={loggedInAccount}
        allStudents={students}
        exams={exams}
        questions={questions}
        results={results}
        initialMenu={accountDashboardMenu}
        hasSavedProgressForExam={(examId: number) => {
          const saved = getLocalProgress(
            String(loggedInAccount.token_ujian || '').toUpperCase().trim(),
            examId
          );
          const count = Object.keys(saved?.answers || {}).filter(
            (k) => saved?.answers[k] && saved.answers[k].length > 0
          ).length;
          return {
            hasProgress: count > 0,
            answeredCount: count,
          };
        }}
        onStartExamWithSessionToken={handleStartExamFromDashboard}
        onStudentUpdated={(updated) => {
          setLoggedInAccount(updated);
          saveLoggedInStudentAccount(updated);
          onExamCompleted();
        }}
        onRefreshData={onExamCompleted}
        onLogout={() => {
          clearLoggedInStudentAccount();
          clearActiveStudentSession();
          setLoggedInAccount(null);
          setActiveStudent(null);
          setSubmittedSummary(null);
          setTokenInput('');
          setLoginError(null);
        }}
      />
    );
  }

  // 2B. RENDER DEDICATED STUDENT LOGIN PORTAL (LOGIN AKUN SISWA)
  if (!activeStudent) {
    const step1Done = Boolean(selectedKelas);
    const step2Done = Boolean(selectedKelas && selectedStudentObj);
    const step3Done = Boolean(step2Done && tokenInput.trim().length >= 4);

    // Check if there is saved unsubmitted progress in localStorage for current student
    const activeSavedProgress =
      step2Done && selectedStudentObj
        ? getLocalProgress(
            selectedStudentObj.token_ujian.toUpperCase().trim(),
            selectedExamId ? Number(selectedExamId) : undefined
          )
        : null;

    return (
      <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 space-y-5">
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
                  <span>Portal Login Akun Siswa &amp; Asesmen CBT Multi-Mapel SMA</span>
                </span>
                <span className="font-mono text-white/90 bg-white/15 backdrop-blur-xs px-2.5 py-0.5 rounded-md">
                  Sistem Akun &amp; Token Sesi
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
                Selamat Datang di Portal Akun Siswa CBT
              </h1>
              <p className="text-xs text-slate-100 mt-1 leading-relaxed max-w-2xl">
                Pilih <strong>Kelas</strong>, pilih <strong>Nama Lengkap</strong>, lalu masukkan <strong>Password Login Akun</strong> (atau <strong>Token Bawaan Sistem</strong>) untuk mengakses Beranda, Jadwal Ujian, Nilai, Riwayat, dan Profil Siswa.
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
                    <span>Password / Token Login</span>
                  </span>
                  {step3Done && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <div className="text-[11px] mt-1.5 font-semibold truncate opacity-90">
                  {step3Done
                    ? 'Kredensial siap diverifikasi'
                    : step2Done
                      ? 'Masukkan Password / Token'
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
                    dari sesi sebelumnya. Setelah masuk ke Dashboard Akun Siswa, Anda dapat langsung melanjutkan ujian tanpa kehilangan jawaban.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleAccountLogin} className="space-y-5">
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
                  <div className="mt-2.5 p-3.5 rounded-xl bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-emerald-50/60 border border-indigo-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-600">Peserta Terpilih: </span>
                      <strong className="text-slate-900 font-bold">
                        {selectedStudentObj.nama}
                      </strong>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-indigo-800">
                        Kelas {selectedStudentObj.kelas}
                      </span>
                      {studentProportionalAllocation && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-[11px] font-extrabold bg-indigo-600 text-white shadow-2xs">
                            <Shuffle className="w-3 h-3 shrink-0" />
                            <span>{studentProportionalAllocation.packageCode}</span>
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedStudentObj.password_login && (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                          Password Kustom Aktif
                        </span>
                      )}
                      <span
                        className={`font-bold ${
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
                  </div>
                )}
              </div>

              {/* LANGKAH 3: MASUKKAN PASSWORD LOGIN AKUN ATAU TOKEN BAWAAN SISTEM */}
              <div
                className={`transition-opacity ${
                  step2Done || students.length === 0 ? 'opacity-100' : 'opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="student-token-input"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Langkah 3 — Masukkan Password Login Akun / Token Sistem
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Bisa diubah sendiri di menu <strong>Profil Siswa</strong> setelah login
                  </span>
                </div>
                <input
                  ref={tokenInputRef}
                  id="student-token-input"
                  type="text"
                  maxLength={32}
                  disabled={students.length > 0 && !step2Done}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={
                    students.length > 0 && !step2Done
                      ? 'Pilih Kelas & Nama Siswa Terlebih Dahulu'
                      : 'Masukkan Password Login Akun atau 6 Karakter Token Sistem Anda'
                  }
                  className="w-full px-4 py-2.5 text-base font-mono tracking-wider bg-white border border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed"
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
                  (students.length > 0 && (!step1Done || !step2Done || !step3Done))
                }
                className="w-full py-3.5 px-5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-700 disabled:opacity-50 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {isLoggingIn
                    ? 'Memverifikasi Akun Siswa...'
                    : 'Masuk ke Dashboard Akun Siswa'}
                </span>
              </button>
            </form>

            <div className="pt-5 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Fitur Akun Siswa: Beranda · Jadwal Ujian · Hasil Nilai · Riwayat · Profil &amp; Ubah Password</span>
              <span>Token Sesi Ujian Diberikan Guru Saat Mulai Ujian</span>
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

  const activeAbsenInfo = getStudentAbsenInfoInClass(activeStudent, students);
  const activeMataPelajaran = getEffectiveMataPelajaran(activeExam);

  return (
    <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 space-y-4 select-none">
      {/* Clean Institutional Exam Status Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[11px]">
              Mapel: {activeMataPelajaran}
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Peserta: <strong className="text-slate-900 font-semibold">{activeStudent.nama}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>Kelas {activeStudent.kelas}</span>
            <span className="text-slate-300">·</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                activeAbsenInfo.isGanjil
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-sky-100 text-sky-900'
              }`}
            >
              Absen #{activeAbsenInfo.noAbsen} ({activeAbsenInfo.ganjilGenapLabel})
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[11px] font-bold">
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
              tabViolations > 0 || inspectAttempts > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
            }`}
          >
            <ShieldAlert
              className={`w-3.5 h-3.5 shrink-0 ${
                tabViolations > 0 || inspectAttempts > 0
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            />
            <span>
              Anti-Cheat:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {tabViolations > 0
                  ? `${tabViolations}x Tab`
                  : inspectAttempts > 0
                  ? `${inspectAttempts}x Inspect`
                  : 'Aktif & Aman'}
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

      {/* Fullscreen & Tab/App Isolation Enforcement Banner */}
      {!isFullscreen && !isStudentBlocked && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 text-white border border-indigo-500/40 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <Maximize2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Mode Isolasi Ujian Penuh (Auto-Close Tab &amp; Aplikasi Lain):</strong> Klik tombol di samping untuk mengunci tampilan layar penuh sehingga tab browser lain dan taskbar aplikasi tertutup selama ujian berlangsung.
            </span>
          </div>
          <button
            type="button"
            onClick={requestExamFullscreen}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Aktifkan Layar Penuh &amp; Tutup Tab Lain
          </button>
        </div>
      )}

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
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs sm:text-sm font-extrabold font-mono tabular-nums shadow-2xs">
                    SOAL NO. {currentIndex + 1} / {examQuestions.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 font-mono text-xs font-extrabold text-indigo-800">
                    {activeStudent.kode_soal || activeExam?.kode_paket || 'PAKET-A'}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                    {isKompleks
                      ? `PG Kompleks (Pilih >1 Jawaban · Bobot ${currentQuestion.bobot || 3} Poin)`
                      : `PG Biasa (Pilih 1 Jawaban · Bobot ${currentQuestion.bobot || 2} Poin)`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                  {/* Ergonomic Font Size Controls so students don't get eye strain */}
                  <div
                    className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5"
                    title="Atur Ukuran Huruf Soal & Opsi Jawaban"
                  >
                    <button
                      type="button"
                      onClick={() => setFontScale('normal')}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        fontScale === 'normal'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontScale('large')}
                      className={`px-2 py-1 rounded-md text-xs font-extrabold transition-all cursor-pointer ${
                        fontScale === 'large'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontScale('xlarge')}
                      className={`px-2 py-1 rounded-md text-sm font-extrabold transition-all cursor-pointer ${
                        fontScale === 'xlarge'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      A++
                    </button>
                  </div>
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
                <div className="bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-amber-50/30 border border-indigo-200/80 rounded-xl p-5 sm:p-6 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-indigo-800">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Wacana &amp; Stimulus Soal ({activeMataPelajaran})</span>
                  </div>
                  <div
                    className={`text-slate-800 leading-relaxed ${
                      fontScale === 'xlarge'
                        ? 'text-lg sm:text-xl'
                        : fontScale === 'large'
                          ? 'text-base sm:text-lg'
                          : 'text-sm sm:text-base'
                    }`}
                  >
                    <MathAndTableRenderer content={currentQuestion.data_opsi.wacana} />
                  </div>
                </div>
              )}

              <div
                className={`font-bold text-slate-900 leading-relaxed tracking-normal ${
                  fontScale === 'xlarge'
                    ? 'text-xl sm:text-2xl md:text-[26px]'
                    : fontScale === 'large'
                      ? 'text-lg sm:text-xl md:text-2xl'
                      : 'text-base sm:text-lg'
                }`}
              >
                <MathAndTableRenderer content={currentQuestion.teks_soal} />
              </div>

              <div className="space-y-3.5 pt-2">
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
                      className={`flex items-start gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-blue-50/90 border-blue-600 text-slate-900 shadow-xs'
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
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-mono text-sm sm:text-base font-extrabold flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : badgeColors[optKey] || 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {optKey}
                      </span>
                      <div
                        className={`flex-1 font-medium leading-relaxed pt-1 ${
                          fontScale === 'xlarge'
                            ? 'text-lg sm:text-xl'
                            : fontScale === 'large'
                              ? 'text-base sm:text-lg'
                              : 'text-sm sm:text-base'
                        }`}
                      >
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
                    Guru membuka via: Konsol Guru → Menu 03 (Live Monitor) atau Menu 04 (Database Siswa) → Klik [Buka Kunci]
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isCheckingUnlockStatus}
                      onClick={handleCheckStudentStatusManual}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <RotateCcw
                        className={`w-3.5 h-3.5 ${
                          isCheckingUnlockStatus ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {isCheckingUnlockStatus
                          ? 'Mengecek Status...'
                          : 'Cek Status Buka Kunci'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowActivityLogModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-600" />
                      <span>Lihat Rekaman Pelanggaran</span>
                    </button>
                  </div>

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

