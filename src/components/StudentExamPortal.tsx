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
  ClipboardList,
  LogIn,
  Activity,
  FileText,
  Printer,
  History,
  Check,
  X,
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
} from '../utils/cbtLogic';
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

export interface StudentExamReceipt {
  resultId: number;
  studentId: number;
  studentNama: string;
  studentKelas: string;
  tokenUjian: string;
  examId: number;
  examJudul: string;
  skor: number;
  kategori: string;
  pelanggaranTab: number;
  submittedAt: string;
  breakdown: Array<{
    pertanyaan: string;
    studentAnswer: string[];
    correctAnswer: string[];
    isCorrect: boolean;
    pointsEarned: number;
  }>;
}

function formatReceipt(
  item: ResultItem | LocalExamReceipt,
  allStudents: StudentItem[],
  allExams: ExamItem[],
  allQuestions: QuestionItem[]
): StudentExamReceipt {
  if ('examJudul' in item) {
    const qList = allQuestions.filter((q) => Number(q.exam_id) === Number(item.examId));
    const breakdown = qList.map((q) => {
      const studentAns = item.jawabanSiswa[String(q.id)] || [];
      const correctAns = q.kunci_jawaban || [];
      const isCorrect =
        studentAns.length === correctAns.length &&
        studentAns.every((ans) => correctAns.includes(ans));
      return {
        pertanyaan: q.teks_soal,
        studentAnswer: studentAns,
        correctAnswer: correctAns,
        isCorrect,
        pointsEarned: isCorrect ? q.bobot : 0,
      };
    });
    return {
      resultId: item.resultId,
      studentId: item.studentId,
      studentNama: item.studentNama,
      studentKelas: item.studentKelas,
      tokenUjian: item.tokenUjian,
      examId: item.examId,
      examJudul: item.examJudul,
      skor: item.skor,
      kategori: item.kategori,
      pelanggaranTab: item.pelanggaranTab,
      submittedAt: item.submittedAt,
      breakdown,
    };
  } else {
    const st = allStudents.find((s) => s.id === item.student_id);
    const ex = allExams.find((e) => e.id === item.exam_id);
    const qList = allQuestions.filter((q) => Number(q.exam_id) === Number(item.exam_id));
    const breakdown = qList.map((q) => {
      const studentAns = item.jawaban_siswa?.[String(q.id)] || [];
      const correctAns = q.kunci_jawaban || [];
      const isCorrect =
        studentAns.length === correctAns.length &&
        studentAns.every((ans) => correctAns.includes(ans));
      return {
        pertanyaan: q.teks_soal,
        studentAnswer: studentAns,
        correctAnswer: correctAns,
        isCorrect,
        pointsEarned: isCorrect ? q.bobot : 0,
      };
    });
    return {
      resultId: item.id,
      studentId: item.student_id,
      studentNama: st?.nama || `Siswa #${item.student_id}`,
      studentKelas: st?.kelas || '-',
      tokenUjian: st?.token_ujian || '-',
      examId: item.exam_id,
      examJudul: ex?.judul_ujian || `Ujian CBT #${item.exam_id}`,
      skor: item.skor_angka,
      kategori: item.analisis_ai?.kategori_nilai || 'Selesai',
      pelanggaranTab: item.pelanggaran_tab || 0,
      submittedAt: item.created_at || new Date().toISOString(),
      breakdown,
    };
  }
}

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

function getLocalReceiptsForStudent(studentId: number): LocalExamReceipt[] {
  try {
    const key = HISTORY_KEY_PREFIX + String(studentId);
    const existingRaw = localStorage.getItem(key);
    return existingRaw ? JSON.parse(existingRaw) : [];
  } catch {
    return [];
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
    if (!selectedKelas) return exams;
    return exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, selectedKelas)
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

  // Student Portal Navigation & Progress Management State
  const [studentPortalTab, setStudentPortalTab] = useState<'login' | 'history'>('login');
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
  const [selectedReceipt, setSelectedReceipt] = useState<StudentExamReceipt | null>(null);

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

      setActiveStudent(session.student);
      setActiveExam(session.exam);
      setExamQuestions(session.questions || []);

      saveActiveStudentSession({
        student: session.student,
        exam: session.exam,
        questions: session.questions || [],
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

      // Debounce rapid blur+visibilitychange events within 800ms
      const now = Date.now();
      if (now - lastViolationTimestampRef.current < 800) return;
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

      // Instantly block the student as requested
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

  // Strict Anti-Cheat: Detect window blur, visibilitychange, fullscreen change, right-click, selection, drag, copy/paste, and shortcuts
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

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && !isStudentBlocked) {
        triggerViolation('Terdeteksi keluar dari mode layar penuh (Fullscreen) ujian');
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
        e.key === 'PrintScreen' ||
        (isCtrlOrCmd &&
          e.shiftKey &&
          ['I', 'J', 'C', 'K'].includes(key)) ||
        (isCtrlOrCmd &&
          ['U', 'P', 'S', 'C', 'V', 'X', 'T', 'N', 'W', 'A'].includes(key)) ||
        (e.altKey && key === 'TAB');

      if (blockedCombo) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityNotice(
          `Pintasan keyboard (${e.ctrlKey ? 'Ctrl+' : ''}${e.key}) diblokir demi keamanan integritas ujian.`
        );
      }
    };

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

  // 2. RENDER DEDICATED STUDENT PORTAL (TAB: MASUK UJIAN SISWA & RIWAYAT HASIL UJIAN)
  if (!activeStudent) {
    const step1Done = Boolean(selectedKelas);
    const step2Done = Boolean(selectedKelas && selectedStudentObj);
    const step3Done = Boolean(step2Done && tokenInput.trim().length === 6);

    // Filter results for history tab
    const historyStudentName = selectedStudentObj ? selectedStudentObj.nama : namaInput.trim();
    const historyStudentKelas = selectedKelas.trim();

    const matchedDbResults = (results || []).filter((r) => {
      const st = students.find((s) => s.id === r.student_id);
      const matchName = historyStudentName
        ? (st?.nama || '').toLowerCase().trim() === historyStudentName.toLowerCase().trim()
        : true;
      const matchKelas = historyStudentKelas
        ? (st?.kelas || '').toLowerCase().trim() === historyStudentKelas.toLowerCase().trim()
        : true;
      return matchName && matchKelas;
    });

    const localReceipts = selectedStudentObj
      ? getLocalReceiptsForStudent(selectedStudentObj.id)
      : [];

    // Check if there is saved unsubmitted progress in localStorage for current student
    const activeSavedProgress = step3Done
      ? getLocalProgress(tokenInput.toUpperCase().trim(), selectedExamId ? Number(selectedExamId) : undefined)
      : null;

    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
        {/* Navigation Tabs for Student Portal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Portal Asesmen Siswa CBT
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
              Ruang Asesmen & Riwayat Siswa
            </h1>
          </div>

          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setStudentPortalTab('login')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                studentPortalTab === 'login'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk Ruang Ujian</span>
            </button>
            <button
              type="button"
              onClick={() => setStudentPortalTab('history')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                studentPortalTab === 'history'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Riwayat Hasil Ujian Saya</span>
              {(matchedDbResults.length > 0 || localReceipts.length > 0) && (
                <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-800 rounded-full font-bold">
                  {matchedDbResults.length || localReceipts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: LOGIN RUANG UJIAN SISWA */}
        {studentPortalTab === 'login' ? (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <div className="text-xs font-medium text-blue-700">
                Halaman Login Peserta Ujian CBT · 3 Langkah Verifikasi
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
                Masuk Ruang Ujian Siswa
              </h2>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
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
                className="w-full py-3 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoggingIn
                  ? 'Memverifikasi Kelas, Nama & Token...'
                  : activeSavedProgress
                    ? 'Lanjutkan Ujian (Jawaban Tersimpan)'
                    : 'Mulai Ujian Sekarang'}
              </button>
            </form>

            <div className="pt-5 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
              <span>Dukungan Soal: PG Biasa & PG Kompleks</span>
              <span>Proteksi Anti-Cheat & Autosave Aktif</span>
            </div>
          </div>
        ) : (
          /* TAB 2: RIWAYAT HASIL UJIAN SISWA */
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Riwayat Asesmen & Bukti Ujian
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Daftar ujian yang telah selesai dikerjakan beserta nilai, rekapan analisis LOTS/HOTS, dan bukti lembar jawaban.
                </p>
              </div>

              {/* Class & Name filter for History */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedKelas}
                  onChange={(e) => handleSelectKelas(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="">Semua Kelas</option>
                  {classOptions.map((cls) => (
                    <option key={cls.kelas} value={cls.kelas}>
                      {cls.kelas}
                    </option>
                  ))}
                </select>

                {selectedKelas && (
                  <select
                    value={selectedStudentId}
                    onChange={(e) => handleSelectStudent(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer max-w-[200px]"
                  >
                    <option value="">Semua Siswa di {selectedKelas}</option>
                    {studentsInSelectedClass.map((st) => (
                      <option key={st.id} value={String(st.id)}>
                        {st.nama}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* List of results */}
            {matchedDbResults.length === 0 && localReceipts.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
                <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-700">
                  Belum Ada Riwayat Ujian Ditemukan
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {selectedStudentObj
                    ? `Peserta ${selectedStudentObj.nama} (${selectedStudentObj.kelas}) belum memiliki rekaman ujian yang sudah diselesaikan.`
                    : 'Pilih Kelas dan Nama Anda pada pilihan di atas untuk melihat riwayat hasil ujian dan mencetak lembar bukti jawaban.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Server DB results */}
                {matchedDbResults.map((res) => {
                  const receipt = formatReceipt(res, students, exams, questions || []);

                  return (
                    <div
                      key={`db-${res.id}`}
                      className="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            Hasil Terverifikasi
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-1">
                            {receipt.examJudul}
                          </h4>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {receipt.studentNama} · Kelas {receipt.studentKelas}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-2xl font-black text-slate-900 font-mono">
                            {receipt.skor}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500">
                            Skor / 100
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="p-2 rounded bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500">Kategori</div>
                          <div className="font-semibold text-slate-800">
                            {receipt.kategori}
                          </div>
                        </div>
                        <div className="p-2 rounded bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500">Pelanggaran Tab</div>
                          <div
                            className={`font-semibold ${
                              receipt.pelanggaranTab > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {receipt.pelanggaranTab > 0 ? `${receipt.pelanggaranTab} kali` : '0 (Aman)'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs text-slate-500">
                        <span>{new Date(receipt.submittedAt).toLocaleDateString('id-ID')}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(receipt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Lihat Lembar Bukti</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Local Storage Receipts */}
                {localReceipts.map((rc, idx) => {
                  const receipt = formatReceipt(rc, students, exams, questions || []);

                  return (
                    <div
                      key={`loc-${idx}`}
                      className="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all space-y-3 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Tersimpan di Perangkat
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-1">
                            {receipt.examJudul}
                          </h4>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {receipt.studentNama} · Kelas {receipt.studentKelas} · Token {receipt.tokenUjian}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-2xl font-black text-slate-900 font-mono">
                            {receipt.skor}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500">
                            Skor / 100
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="p-2 rounded bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500">Kategori</div>
                          <div className="font-semibold text-slate-800">{receipt.kategori}</div>
                        </div>
                        <div className="p-2 rounded bg-slate-50 border border-slate-100">
                          <div className="text-[11px] text-slate-500">Pelanggaran Tab</div>
                          <div
                            className={`font-semibold ${
                              receipt.pelanggaranTab > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {receipt.pelanggaranTab > 0 ? `${receipt.pelanggaranTab} kali` : '0 (Aman)'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs text-slate-500">
                        <span>{new Date(receipt.submittedAt).toLocaleDateString('id-ID')}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(receipt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Lihat Bukti Resep</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal: Selected Exam Receipt / Lembar Bukti Jawaban */}
        {selectedReceipt && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Lembar Bukti & Hasil Asesmen Ujian CBT
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                    {selectedReceipt.examJudul}
                  </h3>
                  <div className="text-xs text-slate-600 mt-1">
                    {selectedReceipt.studentNama} · Kelas {selectedReceipt.studentKelas} · Token {selectedReceipt.tokenUjian}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-3xl font-black font-mono text-blue-700">
                    {selectedReceipt.skor}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Nilai Akhir
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Kategori</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {selectedReceipt.kategori || 'Selesai'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Pelanggaran Tab</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {selectedReceipt.pelanggaranTab} kali
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Waktu Selesai</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {new Date(selectedReceipt.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Status Bukti</div>
                  <div className="font-bold text-emerald-700 mt-0.5">
                    Tervalidasi Resmi
                  </div>
                </div>
              </div>

              {/* Question breakdown if available */}
              {selectedReceipt.breakdown && selectedReceipt.breakdown.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Daftar Rekap Soal & Jawaban:
                  </h4>
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {selectedReceipt.breakdown.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                          item.isCorrect
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-rose-50/50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">
                            Soal #{idx + 1}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.isCorrect
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.isCorrect ? 'Benar' : 'Salah'} ({item.pointsEarned} poin)
                          </span>
                        </div>
                        <div className="text-slate-700">
                          <MathAndTableRenderer content={item.pertanyaan} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                          <div>
                            <span className="text-slate-500">Jawaban Siswa: </span>
                            <strong className="text-slate-900 font-mono">
                              {item.studentAnswer && item.studentAnswer.length > 0
                                ? item.studentAnswer.join(', ')
                                : '(Kosong)'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Kunci Jawaban: </span>
                            <strong className="text-emerald-700 font-mono">
                              {item.correctAnswer && item.correctAnswer.length > 0
                                ? item.correctAnswer.join(', ')
                                : '-'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / Simpan Bukti (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
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
          <button
            type="button"
            onClick={() => setShowActivityLogModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span>Catatan Aktivitas ({activityLogs.length})</span>
          </button>

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
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
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
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Autosave Aktif · Tersimpan Otomatis ✓</span>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  Kode: {currentQuestion.data_opsi?.id_soal_csv || `Q-${currentQuestion.id}`}
                </span>
              </div>
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
                  <strong className="text-red-700 font-bold">DIBLOKIR SISTEM</strong> karena terdeteksi keluar dari layar ujian atau berpindah tab (
                  <strong className="font-mono">
                    {tabViolations}/{MAX_TAB_VIOLATIONS} pelanggaran
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

