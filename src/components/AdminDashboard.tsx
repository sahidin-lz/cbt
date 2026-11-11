import React, { useState, useEffect } from 'react';
import {
  Upload,
  Users,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
  Trash2,
  Plus,
  Download,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  RotateCcw,
  Ban,
  LogIn,
  ClipboardList,
  Edit3,
  LogOut,
  Layers,
  Shuffle,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  Play,
  Pause,
  Calendar,
  BookmarkCheck,
  BarChart3,
} from 'lucide-react';
import {
  ExamItem,
  QuestionItem,
  StudentItem,
  ResultItem,
  AnalisisAI,
  ExamCategory,
  ExamStatus,
} from '../types/cbt';
import {
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_STUDENT_CSV_TEMPLATE,
  extractTingkatFromKelas,
  buildExcelHtmlTable,
  buildSemicolonCsv,
  generateStudentTemplateExcel,
  generateQuestionTemplateExcel,
  parseQuestionsCsv,
  computeClassAnalytics,
  classifyQuestionCognitiveLevel,
  assignPackageVariantsToStudents,
  resolveSyncedStudentAnswersForExam,
  getEffectiveExamSessionToken,
  generateExamToken,
  SOSIOLOGI_EXAM_CATEGORIES,
} from '../utils/cbtLogic';
import {
  downloadStudentTokenCardsPdf,
  downloadSingleStudentResultPdf,
} from '../utils/cbtPdfGenerator';
import {
  auth,
  googleAuthProvider,
  CbtSyncPulseData,
} from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import {
  safeApiJson,
  saveExamCbt,
  deleteExamCbt,
  toggleExamStatusCbt,
  updateExamSessionTokenCbt,
  saveStudentCbt,
  uploadStudentsCsvCbt,
  regenerateStudentTokenCbt,
  updateStudentStatusCbt,
  bulkUpdateStudentStatusCbt,
  batchAssignPackageVariantsCbt,
  deleteStudentCbt,
  renameClassCbt,
  deleteClassStudentsCbt,
  addManualQuestionCbt,
  updateManualQuestionCbt,
  uploadQuestionsCsvCbt,
  deleteQuestionCbt,
  clearExamQuestionsCbt,
  copyQuestionsToExamCbt,
  generateAiAnalysisCbt,
  recalculateAndSyncAllResultsCbt,
} from '../lib/cbtFirestoreService';
import {
  parseQuestionsFromFile,
  parseStudentsFromFile,
} from '../utils/cbtFileParsers';
import { MathAndTableRenderer } from './MathAndTableRenderer';
import { ClassPerformanceLotsHotsChart } from './ClassPerformanceLotsHotsChart';
import { ExamManagementTab } from './ExamManagementTab';
import { AnBusoAnalysisTab } from './AnBusoAnalysisTab';

interface AdminDashboardProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  onRefreshData: () => Promise<void>;
  syncPulse?: CbtSyncPulseData | null;
  isSyncingFirebase?: boolean;
  onManualFirebaseSync?: () => Promise<void>;
}

function triggerBrowserDownload(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  exams,
  questions,
  students,
  results,
  onRefreshData,
  syncPulse,
  isSyncingFirebase = false,
  onManualFirebaseSync,
}) => {
  // Separate Teacher Authentication State (Persisted across browser reloads)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cbt_teacher_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<{
    name: string;
    email: string;
  }>({
    name: 'Sahidin',
    email: 'sahidin30@gmail.com',
  });

  // Core Teacher Dashboard Modules (Persisted on reload)
  const [activeTab, setActiveTab] = useState<
    'ujian' | 'manajemen' | 'siswa' | 'soal' | 'laporan' | 'anbuso'
  >(() => {
    try {
      const saved = localStorage.getItem('cbt_teacher_active_tab');
      if (
        saved &&
        ['ujian', 'manajemen', 'siswa', 'soal', 'laporan', 'anbuso'].includes(
          saved
        )
      ) {
        return saved as any;
      }
    } catch {}
    return 'ujian';
  });

  useEffect(() => {
    try {
      localStorage.setItem('cbt_teacher_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [isRecalculatingScores, setIsRecalculatingScores] = useState(false);
  const [recalcFeedback, setRecalcFeedback] = useState<string | null>(null);

  const handleRecalculateAllScores = async () => {
    setIsRecalculatingScores(true);
    setRecalcFeedback(null);
    try {
      const outcome = await recalculateAndSyncAllResultsCbt({
        results,
        questions,
        students,
        exams,
      });
      await onRefreshData();
      setRecalcFeedback(
        outcome.updatedCount > 0
          ? `Berhasil memperbarui & menyinkronkan ${outcome.updatedCount} dari ${outcome.totalResults} nilai peserta ujian sebelumnya dengan Formula Humanis PG Kompleks.`
          : `Seluruh ${outcome.totalResults} nilai peserta ujian (termasuk ujian hari sebelumnya) sudah tersinkronisasi optimal dengan Formula Humanis PG Kompleks.`
      );
    } catch (err: any) {
      setRecalcFeedback(err?.message || 'Gagal menghitung ulang nilai siswa.');
    } finally {
      setIsRecalculatingScores(false);
    }
  };
  const [isBankSoalDetailOpen, setIsBankSoalDetailOpen] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [bankSoalDeleteModal, setBankSoalDeleteModal] = useState<{
    examId: number;
    title: string;
    questionCount: number;
  } | null>(null);
  const [isDeletingBankSoal, setIsDeletingBankSoal] = useState(false);
  const [bankSoalFeedback, setBankSoalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (exams.length > 0 && selectedExamId === null) {
      setSelectedExamId(exams[0].id);
    } else if (
      exams.length > 0 &&
      selectedExamId !== null &&
      !exams.some((e) => e.id === selectedExamId)
    ) {
      setSelectedExamId(exams[0].id);
    } else if (exams.length === 0) {
      setSelectedExamId(null);
    }
  }, [exams, selectedExamId]);

  // --- Module 1: Manajemen Ujian & Distribusi 3 Tingkatan Kelas ---
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDuration, setNewExamDuration] = useState('60');
  const [newExamTargetTingkat, setNewExamTargetTingkat] =
    useState<string>('10');
  const [newExamTargetKelas, setNewExamTargetKelas] =
    useState<string>('SEMUA');
  const [newExamKategori, setNewExamKategori] =
    useState<string>('Penilaian Harian (PH / Kuis)');
  const [newExamStatus, setNewExamStatus] =
    useState<'AKTIF' | 'DRAF' | 'SELESAI'>('DRAF');
  const [newExamTargetRombel, setNewExamTargetRombel] =
    useState<string[]>([]);
  const [filterExamKategori, setFilterExamKategori] =
    useState<string>('SEMUA');
  const [filterExamStatus, setFilterExamStatus] =
    useState<string>('SEMUA');
  const [newExamAcakSoal, setNewExamAcakSoal] = useState<boolean>(true);
  const [newExamAcakOpsi, setNewExamAcakOpsi] = useState<boolean>(true);
  const [newExamKodePaket, setNewExamKodePaket] = useState<string>('PAKET-A');
  const [newExamMultiPaket, setNewExamMultiPaket] = useState<boolean>(false);
  const [newExamJumlahPaket, setNewExamJumlahPaket] = useState<number>(2);
  const [newExamTokenSesi, setNewExamTokenSesi] = useState<string>(() => generateExamToken());
  const [newExamTampilkanNilai, setNewExamTampilkanNilai] = useState<boolean>(true);
  const [newExamPengumuman, setNewExamPengumuman] = useState<string>('');
  const [inlineTokenEditExamId, setInlineTokenEditExamId] = useState<number | null>(null);
  const [inlineTokenEditValue, setInlineTokenEditValue] = useState<string>('');
  const [isDistributingPackages, setIsDistributingPackages] = useState(false);
  const [filterExamTingkat, setFilterExamTingkat] = useState<string>('SEMUA');
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [examFeedback, setExamFeedback] = useState<string | null>(null);

  // --- Module 2: Database Siswa (Manual & Bulk CSV/Excel Upload + Status Management) ---
  const [studentInputMode, setStudentInputMode] = useState<'manual' | 'csv'>(
    'manual'
  );
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentNisnInput, setStudentNisnInput] = useState('');
  const [studentTingkatPreset, setStudentTingkatPreset] = useState<
    'X' | 'XI' | 'XII'
  >('X');
  const [studentClassInput, setStudentClassInput] = useState('X MIPA 1');
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);

  // Bulk Student CSV Upload state
  const [studentCsvText, setStudentCsvText] = useState('');
  const [replaceExistingStudents, setReplaceExistingStudents] = useState(false);
  const [isUploadingStudentsCsv, setIsUploadingStudentsCsv] = useState(false);

  // Student Filters (3 Tingkatan + Specific Class + Exam Status)
  const [filterStudentTingkat, setFilterStudentTingkat] =
    useState<string>('SEMUA');
  const [filterKelas, setFilterKelas] = useState<string>('SEMUA');
  const [filterStudentStatus, setFilterStudentStatus] =
    useState<string>('SEMUA');
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // --- Module 3: Manajemen Soal (Manual & CSV/Excel) ---
  const [questionInputMode, setQuestionInputMode] = useState<'manual' | 'csv'>(
    'manual'
  );
  const [manualTipe, setManualTipe] = useState<'PG' | 'Kompleks'>('PG');
  const [manualWacana, setManualWacana] = useState('');
  const [manualTeksSoal, setManualTeksSoal] = useState('');
  const [manualOpsiA, setManualOpsiA] = useState('');
  const [manualOpsiB, setManualOpsiB] = useState('');
  const [manualOpsiC, setManualOpsiC] = useState('');
  const [manualOpsiD, setManualOpsiD] = useState('');
  const [manualOpsiE, setManualOpsiE] = useState('');
  const [manualKunci, setManualKunci] = useState<string[]>(['A']);
  const [manualBobot, setManualBobot] = useState('2');
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null
  );
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Filter & Copy Question Management state
  const [filterQuestionType, setFilterQuestionType] = useState<
    'SEMUA' | 'PG' | 'Kompleks'
  >('SEMUA');
  const [searchQuestionQuery, setSearchQuestionQuery] = useState('');
  const [copyTargetExamId, setCopyTargetExamId] = useState<number | null>(null);
  const [isCopyingQuestions, setIsCopyingQuestions] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [replaceExistingQuestions, setReplaceExistingQuestions] =
    useState(false);
  const [quickExamTitle, setQuickExamTitle] = useState('Ujian CBT Sosiologi');
  const [quickExamTingkat, setQuickExamTingkat] = useState<string>('SEMUA');
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // --- Class Management (Manajemen Kelas / Rombel) State ---
  const [customClasses, setCustomClasses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('eduassess_custom_classes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newClassNameInput, setNewClassNameInput] = useState('');
  const [renamingClassTarget, setRenamingClassTarget] = useState<string | null>(
    null
  );
  const [renameClassValue, setRenameClassValue] = useState('');

  // --- Module 4: Laporan, Analisis Kelas & AI Analysis State ---
  const [filterResultTingkat, setFilterResultTingkat] =
    useState<string>('SEMUA');
  const [filterResultKelas, setFilterResultKelas] = useState<string>('SEMUA');
  const [filterResultExamId, setFilterResultExamId] =
    useState<string>('SEMUA');
  const [analyzingResultId, setAnalyzingResultId] = useState<number | null>(
    null
  );
  const [isAnalyzingBatchClass, setIsAnalyzingBatchClass] = useState(false);
  const [selectedAiModal, setSelectedAiModal] = useState<{
    studentName: string;
    studentClass: string;
    analysis: AnalisisAI;
  } | null>(null);
  const [aiErrorBanner, setAiErrorBanner] = useState<string | null>(null);

  const currentExam =
    exams.find((e) => e.id === selectedExamId) || exams[0] || null;
  const currentExamQuestions = questions.filter(
    (q) => currentExam && q.exam_id === currentExam.id
  );
  const filteredExamQuestions = currentExamQuestions.filter((q) => {
    const matchType =
      filterQuestionType === 'SEMUA' || q.tipe_soal === filterQuestionType;
    const qText = `${q.teks_soal} ${q.data_opsi?.wacana || ''}`.toLowerCase();
    const matchSearch =
      !searchQuestionQuery.trim() ||
      qText.includes(searchQuestionQuery.trim().toLowerCase());
    return matchType && matchSearch;
  });

  // Helper to format Target Distribusi badge label
  const formatDistribusiLabel = (tingkat: string, kelas: string) => {
    if (kelas && kelas !== 'SEMUA') {
      return `Khusus Kelas ${kelas}`;
    }
    if (tingkat === '10') return 'Tingkat 1 (Kelas X / 10)';
    if (tingkat === '11') return 'Tingkat 2 (Kelas XI / 11)';
    if (tingkat === '12') return 'Tingkat 3 (Kelas XII / 12)';
    return 'Semua Tingkatan (X, XI, XII)';
  };

  // Unique classes in DB + custom registered classes
  const uniqueClasses = Array.from(
    new Set([
      ...students.map((s) => s.kelas.trim()).filter(Boolean),
      ...customClasses.map((c) => c.trim()).filter(Boolean),
    ])
  ).sort((a, b) => {
    const tA = extractTingkatFromKelas(a);
    const tB = extractTingkatFromKelas(b);
    if (tA !== tB) return tA.localeCompare(tB);
    return a.localeCompare(b);
  });

  const classAnalyticsData = computeClassAnalytics(
    students,
    results,
    customClasses,
    questions
  );

  const filteredResults = results.filter((resItem) => {
    const st = students.find((s) => s.id === resItem.student_id);
    const sKelas = st?.kelas || '';
    const sTingkat = extractTingkatFromKelas(sKelas);
    const matchTingkat =
      filterResultTingkat === 'SEMUA' || sTingkat === filterResultTingkat;
    const matchKelas =
      filterResultKelas === 'SEMUA' ||
      sKelas.trim().toLowerCase() === filterResultKelas.trim().toLowerCase();
    const matchExam =
      filterResultExamId === 'SEMUA' ||
      String(resItem.exam_id) === filterResultExamId;
    return matchTingkat && matchKelas && matchExam;
  });

  const filteredExams = exams.filter((e) => {
    const matchTingkat =
      filterExamTingkat === 'SEMUA' ||
      e.target_tingkat === filterExamTingkat ||
      e.target_tingkat === 'SEMUA';
    const matchKategori =
      filterExamKategori === 'SEMUA' ||
      (e.kategori_ujian || 'Penilaian Harian (PH / Kuis)') === filterExamKategori;
    const matchStatus =
      filterExamStatus === 'SEMUA' ||
      (e.status_ujian || 'DRAF') === filterExamStatus;
    return matchTingkat && matchKategori && matchStatus;
  });

  const filteredStudents = students.filter((s) => {
    const sTingkat = extractTingkatFromKelas(s.kelas);
    const matchTingkat =
      filterStudentTingkat === 'SEMUA' || sTingkat === filterStudentTingkat;
    const matchKelas = filterKelas === 'SEMUA' || s.kelas === filterKelas;
    const matchStatus =
      filterStudentStatus === 'SEMUA' || s.status_ujian === filterStudentStatus;
    return matchTingkat && matchKelas && matchStatus;
  });

  // Count students per grade level (Tingkat 10, 11, 12)
  const countTingkat10 = students.filter(
    (s) => extractTingkatFromKelas(s.kelas) === '10'
  ).length;
  const countTingkat11 = students.filter(
    (s) => extractTingkatFromKelas(s.kelas) === '11'
  ).length;
  const countTingkat12 = students.filter(
    (s) => extractTingkatFromKelas(s.kelas) === '12'
  ).length;

  // Count students per Exam Status
  const countStatusBelumMulai = students.filter(
    (s) => s.status_ujian === 'Belum Mulai'
  ).length;
  const countStatusSedangUjian = students.filter(
    (s) => s.status_ujian === 'Sedang Ujian'
  ).length;
  const countStatusSelesai = students.filter(
    (s) => s.status_ujian === 'Selesai'
  ).length;
  const countStatusDiblokir = students.filter(
    (s) => s.status_ujian === 'Diblokir'
  ).length;

  // --- Teacher Login Handlers ---
  const handleTeacherFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const cleanEmail = teacherUsername.trim().toLowerCase();
    const cleanPin = teacherPassword.trim();

    if (!cleanEmail || !cleanPin) {
      setAuthError('Silakan masukkan Email Guru dan PIN Akses.');
      return;
    }

    if (cleanEmail === 'sahidin30@gmail.com' && cleanPin === '949321') {
      setTeacherProfile({
        name: 'Sahidin',
        email: 'sahidin30@gmail.com',
      });
      setIsAuthenticated(true);
      try {
        localStorage.setItem('cbt_teacher_auth', 'true');
        localStorage.setItem('cbt_active_portal', 'teacher');
      } catch {}
      setTeacherPassword('');
    } else {
      setAuthError('Email atau PIN Guru tidak sesuai.');
    }
  };

  const handleGoogleTeacherSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const userEmail = (cred.user.email || '').toLowerCase();
      if (userEmail && userEmail !== 'sahidin30@gmail.com') {
        setAuthError(
          'Akses ditolak: Hanya akun sahidin30@gmail.com yang diizinkan masuk.'
        );
        return;
      }
      const idToken = await cred.user.getIdToken();
      await safeApiJson('/api/auth/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      setTeacherProfile({
        name: cred.user.displayName || 'Sahidin',
        email: cred.user.email || 'sahidin30@gmail.com',
      });
      setIsAuthenticated(true);
      try {
        localStorage.setItem('cbt_teacher_auth', 'true');
        localStorage.setItem('cbt_active_portal', 'teacher');
      } catch {}
    } catch {
      setAuthError(
        'Login Google dibatalkan. Silakan masuk menggunakan Email & PIN Guru di atas.'
      );
    }
  };

  // --- Exam & Distribution CRUD Handlers ---
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim()) return;
    setIsSavingExam(true);
    setExamFeedback(null);

    const payload = {
      judul_ujian: newExamTitle.trim(),
      durasi_menit: Number(newExamDuration) || 60,
      target_tingkat: newExamTargetTingkat,
      target_kelas: newExamTargetKelas.trim() || 'SEMUA',
      kategori_ujian: newExamKategori,
      status_ujian: newExamStatus,
      target_rombel: newExamTargetRombel,
      acak_soal: newExamAcakSoal,
      acak_opsi: newExamAcakOpsi,
      kode_paket: newExamKodePaket.trim() || 'PAKET-A',
      mode_multi_paket: newExamMultiPaket,
      jumlah_paket: newExamJumlahPaket,
      token_sesi: newExamTokenSesi.trim().toUpperCase() || generateExamToken(),
      tampilkan_nilai: newExamTampilkanNilai,
      pengumuman: newExamPengumuman.trim(),
    };

    try {
      const savedExam = await saveExamCbt(payload, editingExamId);
      if (editingExamId) {
        setExamFeedback(
          `Paket ujian "${savedExam.judul_ujian}" [${savedExam.status_ujian || 'DRAF'}] berhasil diperbarui (Token Sesi Ujian: ${savedExam.token_sesi}).`
        );
        setEditingExamId(null);
        setNewExamTitle('');
        setNewExamDuration('60');
        setNewExamTargetTingkat('10');
        setNewExamTargetKelas('SEMUA');
        setNewExamKategori('Penilaian Harian (PH / Kuis)');
        setNewExamStatus('DRAF');
        setNewExamTargetRombel([]);
        setNewExamAcakSoal(true);
        setNewExamAcakOpsi(true);
        setNewExamKodePaket('PAKET-A');
        setNewExamMultiPaket(false);
        setNewExamJumlahPaket(2);
        setNewExamTokenSesi(generateExamToken());
        setNewExamTampilkanNilai(true);
        setNewExamPengumuman('');
      } else {
        setExamFeedback(
          `Paket ujian "${savedExam.judul_ujian}" [${savedExam.status_ujian || 'DRAF'}] berhasil dibuat dengan Token Sesi Ujian: ${savedExam.token_sesi}.`
        );
        setSelectedExamId(savedExam.id);
        setNewExamTitle('');
        setNewExamDuration('60');
        setNewExamKategori('Penilaian Harian (PH / Kuis)');
        setNewExamStatus('DRAF');
        setNewExamTargetRombel([]);
        setNewExamAcakSoal(true);
        setNewExamAcakOpsi(true);
        setNewExamKodePaket('PAKET-A');
        setNewExamMultiPaket(false);
        setNewExamJumlahPaket(2);
        setNewExamTokenSesi(generateExamToken());
        setNewExamTampilkanNilai(true);
        setNewExamPengumuman('');
      }
      await onRefreshData();
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleUpdateExamSessionToken = async (exam: ExamItem, customToken?: string) => {
    setExamFeedback(null);
    try {
      const updated = await updateExamSessionTokenCbt(exam, customToken);
      setInlineTokenEditExamId(null);
      setInlineTokenEditValue('');
      setExamFeedback(
        `Token Sesi Ujian untuk "${updated.judul_ujian}" berhasil diperbarui menjadi: ${updated.token_sesi}. Berikan token ini kepada siswa saat ujian dimulai.`
      );
      await onRefreshData();
    } catch (err: any) {
      setExamFeedback(err.message || 'Gagal memperbarui Token Sesi Ujian.');
    }
  };

  const handleToggleExamStatus = async (
    exam: ExamItem,
    nextStatus: 'AKTIF' | 'DRAF' | 'SELESAI'
  ) => {
    setExamFeedback(null);
    try {
      await toggleExamStatusCbt(exam, nextStatus);
      setExamFeedback(
        nextStatus === 'AKTIF'
          ? `Sesi ujian "${exam.judul_ujian}" kini AKTIF! Token Sesi Ujian: ${getEffectiveExamSessionToken(exam)}. Siswa sudah bisa memilih ujian ini di menu Jadwal Ujian.`
          : nextStatus === 'DRAF'
            ? `Sesi ujian "${exam.judul_ujian}" kini berstatus DRAF (Tersimpan di Bank Soal, siswa tidak bisa melihat).`
            : `Sesi ujian "${exam.judul_ujian}" telah DITUTUP (Arsip).`
      );
      await onRefreshData();
    } catch (err: any) {
      setExamFeedback(err.message || 'Gagal mengubah status ujian.');
    }
  };

  const handleBatchDistributePackages = async (targetClass?: string) => {
    const targetPool = targetClass
      ? students.filter((s) => s.kelas.trim() === targetClass.trim())
      : filteredStudents;
    if (targetPool.length === 0) return;
    setIsDistributingPackages(true);
    setStudentFeedback(null);
    try {
      const assigned = assignPackageVariantsToStudents(
        targetPool,
        2,
        ['PAKET-A', 'PAKET-B', 'PAKET-C', 'PAKET-D'],
        exams
      );
      await batchAssignPackageVariantsCbt(assigned);
      setStudentFeedback({
        type: 'success',
        message: `Berhasil mendistribusikan kode paket soal secara proporsional untuk ${assigned.length} siswa pada setiap kelas & angkatan!`,
      });
      await onRefreshData();
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || 'Gagal mendistribusikan multi-paket siswa.',
      });
    } finally {
      setIsDistributingPackages(false);
    }
  };

  const handleDeleteExam = async (examId: number, title: string) => {
    setExamFeedback(null);
    await deleteExamCbt(examId, title);
    setExamFeedback(`Paket ujian "${title}" telah dihapus.`);
    await onRefreshData();
  };

  const handleClearBankSoalOnly = async (examId: number, title: string) => {
    setIsDeletingBankSoal(true);
    setBankSoalFeedback(null);
    setUploadStatus(null);
    try {
      const removedCount = await clearExamQuestionsCbt(examId, questions);
      setBankSoalFeedback({
        type: 'success',
        message: `Seluruh butir soal (${removedCount} soal) pada Bank Soal "${title}" berhasil dikosongkan. Paket ujian tetap tersimpan.`,
      });
      setBankSoalDeleteModal(null);
      await onRefreshData();
    } catch (err: any) {
      setBankSoalFeedback({
        type: 'error',
        message: err.message || 'Gagal mengosongkan butir soal pada bank soal.',
      });
    } finally {
      setIsDeletingBankSoal(false);
    }
  };

  const handleDeleteFullBankSoal = async (examId: number, title: string) => {
    setIsDeletingBankSoal(true);
    setBankSoalFeedback(null);
    setUploadStatus(null);
    try {
      await deleteExamCbt(examId, title);
      setBankSoalDeleteModal(null);
      setIsBankSoalDetailOpen(false);
      if (selectedExamId === examId) {
        const remaining = exams.filter((e) => e.id !== examId);
        setSelectedExamId(remaining.length > 0 ? remaining[0].id : null);
      }
      setBankSoalFeedback({
        type: 'success',
        message: `Bank Soal "${title}" beserta seluruh butir soalnya telah berhasil dihapus dari sistem.`,
      });
      await onRefreshData();
    } catch (err: any) {
      setBankSoalFeedback({
        type: 'error',
        message: err.message || 'Gagal menghapus Bank Soal dari sistem.',
      });
    } finally {
      setIsDeletingBankSoal(false);
    }
  };

  // --- Student Database CRUD, Status Management & Excel/CSV Handlers ---
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentNameInput.trim() || !studentClassInput.trim()) return;
    setIsSavingStudent(true);
    setStudentFeedback(null);

    try {
      const existingSt = editingStudentId
        ? students.find((s) => s.id === editingStudentId)
        : undefined;
      const savedStudent = await saveStudentCbt(
        {
          nama: studentNameInput.trim(),
          kelas: studentClassInput.trim(),
          nisn: studentNisnInput.trim() || undefined,
        },
        editingStudentId,
        existingSt
      );

      if (editingStudentId) {
        setStudentFeedback({
          type: 'success',
          message: 'Data siswa berhasil diperbarui.',
        });
        setEditingStudentId(null);
        setStudentNameInput('');
        setStudentNisnInput('');
      } else {
        setStudentFeedback({
          type: 'success',
          message: `Siswa "${savedStudent.nama}" (${savedStudent.kelas}) berhasil disimpan dengan Token Login: ${savedStudent.token_ujian}`,
        });
        setStudentNameInput('');
        setStudentNisnInput('');
      }
      await onRefreshData();
    } finally {
      setIsSavingStudent(false);
    }
  };

  const executeStudentCsvUpload = async (
    rawCsvContent: string,
    sourceLabel?: string
  ) => {
    if (!rawCsvContent.trim()) {
      setStudentFeedback({
        type: 'error',
        message:
          'Silakan pilih file Excel/CSV siswa atau tempelkan daftar Nama & Kelas.',
      });
      return;
    }

    setIsUploadingStudentsCsv(true);
    setStudentFeedback(null);
    try {
      const outcome = await uploadStudentsCsvCbt(
        rawCsvContent,
        replaceExistingStudents,
        students
      );
      setStudentFeedback({
        type: 'success',
        message: `${
          sourceLabel ? `File "${sourceLabel}" diproses: ` : ''
        }Berhasil mengimpor ${
          outcome.insertedCount
        } siswa beserta Token Ujian unik 6 karakter ke database.`,
      });
      setStudentCsvText('');
      await onRefreshData();
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || 'Gagal mengimpor file siswa.',
      });
    } finally {
      setIsUploadingStudentsCsv(false);
    }
  };

  const handleStudentCsvFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    e.target.value = '';
    setIsUploadingStudentsCsv(true);
    setStudentFeedback(null);
    try {
      const outcome = await parseStudentsFromFile(file);
      if (outcome.rows.length === 0) {
        setStudentFeedback({
          type: 'error',
          message:
            outcome.errors.join(' | ') ||
            `File "${fileName}" tidak memiliki data siswa yang valid.`,
        });
        return;
      }
      setStudentCsvText(outcome.csvRepresentation);
      await executeStudentCsvUpload(
        outcome.csvRepresentation,
        `${fileName} (${outcome.formatDetected})`
      );
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || `Gagal membaca file siswa "${fileName}".`,
      });
    } finally {
      setIsUploadingStudentsCsv(false);
    }
  };

  const handleUploadStudentCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeStudentCsvUpload(studentCsvText);
  };

  const handleDownloadSampleStudentCsv = () => {
    triggerBrowserDownload(
      SAMPLE_STUDENT_CSV_TEMPLATE,
      'Template_Siswa_Kolom_Terpisah.csv',
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadStudentTemplateExcel = () => {
    triggerBrowserDownload(
      generateStudentTemplateExcel(),
      'Template_Siswa_3_Tingkatan.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportStudentsExcel = () => {
    const targetList = filteredStudents.length > 0 ? filteredStudents : students;
    const rows = targetList.map((st, idx) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      return [
        idx + 1,
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? 'Umum' : `Tingkat ${tkt}`,
        st.token_ujian,
        st.status_ujian,
      ];
    });
    const html = buildExcelHtmlTable(
      'Database Siswa CBT',
      [
        'No',
        'nama_siswa',
        'kelas',
        'Tingkatan Kelas',
        'Token Ujian (6 Karakter)',
        'Status Ujian',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      'Database_Siswa_dan_Token_CBT.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleUpdateStudentStatus = async (
    student: StudentItem,
    nextStatus: string
  ) => {
    setStudentFeedback(null);
    await updateStudentStatusCbt(student, nextStatus);
    setStudentFeedback({
      type: 'success',
      message: `Status ujian siswa "${student.nama}" (${student.kelas}) berhasil diubah menjadi "${nextStatus}".`,
    });
    await onRefreshData();
  };

  const handleBulkUpdateStudentStatus = async (nextStatus: string) => {
    if (filteredStudents.length === 0) return;
    setStudentFeedback(null);
    await bulkUpdateStudentStatusCbt(filteredStudents, nextStatus);
    setStudentFeedback({
      type: 'success',
      message: `Status ${filteredStudents.length} siswa pada filter aktif berhasil diatur menjadi "${nextStatus}".`,
    });
    await onRefreshData();
  };

  const handleRegenerateToken = async (studentId: number, nama: string) => {
    setStudentFeedback(null);
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    const updated = await regenerateStudentTokenCbt(target);
    setStudentFeedback({
      type: 'success',
      message: `Token baru untuk ${nama}: ${updated.token_ujian} (Status di-reset ke Belum Mulai)`,
    });
    await onRefreshData();
  };

  const handleDeleteStudent = async (studentId: number, nama: string) => {
    setStudentFeedback(null);
    await deleteStudentCbt(studentId, nama);
    setStudentFeedback({
      type: 'success',
      message: `Data siswa "${nama}" telah dihapus dari database.`,
    });
    await onRefreshData();
  };

  // --- Question Management & Excel/CSV Export Handlers ---
  const handleToggleManualKunci = (letter: string) => {
    if (manualTipe === 'PG') {
      setManualKunci([letter]);
    } else {
      setManualKunci((prev) =>
        prev.includes(letter)
          ? prev.filter((k) => k !== letter)
          : [...prev, letter].sort()
      );
    }
  };

  // --- Class Management Handlers ---
  const saveCustomClassesToStorage = (nextList: string[]) => {
    setCustomClasses(nextList);
    try {
      localStorage.setItem(
        'eduassess_custom_classes',
        JSON.stringify(nextList)
      );
    } catch {
      // Ignore storage errors
    }
  };

  const handleAddNewClass = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newClassNameInput.trim();
    if (!clean) return;
    if (
      !uniqueClasses.some((c) => c.toLowerCase() === clean.toLowerCase())
    ) {
      saveCustomClassesToStorage([...customClasses, clean]);
    }
    setStudentClassInput(clean);
    setNewClassNameInput('');
    setStudentFeedback({
      type: 'success',
      message: `Kelas / Rombel "${clean}" berhasil ditambahkan ke daftar kelas aktif.`,
    });
  };

  const handleRenameClassSubmit = async (oldName: string) => {
    const cleanNew = renameClassValue.trim();
    if (!cleanNew || cleanNew === oldName) {
      setRenamingClassTarget(null);
      return;
    }
    const updatedCount = await renameClassCbt(oldName, cleanNew, students);
    saveCustomClassesToStorage(
      customClasses.map((c) =>
        c.toLowerCase() === oldName.toLowerCase() ? cleanNew : c
      )
    );
    setRenamingClassTarget(null);
    setRenameClassValue('');
    if (filterKelas === oldName) setFilterKelas(cleanNew);
    setStudentFeedback({
      type: 'success',
      message: `Nama kelas "${oldName}" berhasil diubah menjadi "${cleanNew}" (${updatedCount} siswa diperbarui).`,
    });
    await onRefreshData();
  };

  const handleDeleteClass = async (kelasName: string) => {
    const deletedCount = await deleteClassStudentsCbt(kelasName, students);
    saveCustomClassesToStorage(
      customClasses.filter(
        (c) => c.toLowerCase() !== kelasName.toLowerCase()
      )
    );
    if (filterKelas === kelasName) setFilterKelas('SEMUA');
    setStudentFeedback({
      type: 'success',
      message: `Kelas "${kelasName}" dihapus (${deletedCount} data siswa di kelas tersebut turut dihapus).`,
    });
    await onRefreshData();
  };

  const handleDownloadClassStudentsExcel = (targetKelasName?: string) => {
    const list = targetKelasName
      ? students.filter(
          (s) => s.kelas.trim().toLowerCase() === targetKelasName.toLowerCase()
        )
      : filteredStudents.length > 0
        ? filteredStudents
        : students;
    const rows = list.map((st, idx) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      return [
        idx + 1,
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? 'Umum' : `Tingkat ${tkt}`,
        st.token_ujian,
        st.status_ujian,
      ];
    });
    const label = targetKelasName || 'Semua_Kelas';
    const html = buildExcelHtmlTable(
      `Siswa ${label}`,
      [
        'No',
        'nama_siswa',
        'kelas',
        'Tingkatan Kelas',
        'Token Ujian (6 Karakter)',
        'Status Ujian',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      `Database_Siswa_${label.replace(/[^a-zA-Z0-9]+/g, '_')}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const ensureActiveExamForQuestions = async (): Promise<ExamItem> => {
    if (currentExam) return currentExam;
    const createdExam = await saveExamCbt({
      judul_ujian: quickExamTitle.trim() || 'Ujian CBT Sosiologi',
      durasi_menit: 60,
      target_tingkat: quickExamTingkat || 'SEMUA',
      target_kelas: 'SEMUA',
    });
    setSelectedExamId(createdExam.id);
    return createdExam;
  };

  const handleStartEditQuestion = (q: QuestionItem) => {
    setShowUploadPanel(true);
    setQuestionInputMode('manual');
    setEditingQuestionId(q.id);
    const isKompleks =
      q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
    setManualTipe(isKompleks ? 'Kompleks' : 'PG');
    setManualBobot(String(q.bobot || (isKompleks ? 3 : 2)));
    setManualWacana(q.data_opsi?.wacana || '');
    setManualTeksSoal(q.teks_soal || '');
    setManualOpsiA(q.data_opsi?.opsi?.A || '');
    setManualOpsiB(q.data_opsi?.opsi?.B || '');
    setManualOpsiC(q.data_opsi?.opsi?.C || '');
    setManualOpsiD(q.data_opsi?.opsi?.D || '');
    setManualOpsiE(q.data_opsi?.opsi?.E || '');
    setManualKunci(q.kunci_jawaban?.length ? q.kunci_jawaban : ['A']);
    setUploadStatus(null);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
    setManualWacana('');
    setManualTeksSoal('');
    setManualOpsiA('');
    setManualOpsiB('');
    setManualOpsiC('');
    setManualOpsiD('');
    setManualOpsiE('');
    setManualKunci(['A']);
  };

  const handleAddManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTeksSoal.trim() || !manualOpsiA.trim() || !manualOpsiB.trim()) {
      setUploadStatus({
        type: 'error',
        message: 'Teks soal dan minimal opsi jawaban wajib diisi.',
      });
      return;
    }

    setIsSavingQuestion(true);
    setUploadStatus(null);
    try {
      const targetExam = await ensureActiveExamForQuestions();
      if (editingQuestionId) {
        await updateManualQuestionCbt({
          questionId: editingQuestionId,
          examId: targetExam.id,
          tipe_soal: manualTipe,
          wacana: manualWacana,
          teks_soal: manualTeksSoal,
          opsi: {
            A: manualOpsiA,
            B: manualOpsiB,
            C: manualOpsiC,
            D: manualOpsiD,
            E: manualOpsiE,
          },
          kunci_jawaban: manualKunci,
          bobot: Number(manualBobot) || (manualTipe === 'Kompleks' ? 3 : 2),
        });
        setUploadStatus({
          type: 'success',
          message: `Butir soal berhasil diperbarui pada paket "${targetExam.judul_ujian}".`,
        });
        setEditingQuestionId(null);
      } else {
        await addManualQuestionCbt({
          examId: targetExam.id,
          tipe_soal: manualTipe,
          wacana: manualWacana,
          teks_soal: manualTeksSoal,
          opsi: {
            A: manualOpsiA,
            B: manualOpsiB,
            C: manualOpsiC,
            D: manualOpsiD,
            E: manualOpsiE,
          },
          kunci_jawaban: manualKunci,
          bobot: Number(manualBobot) || (manualTipe === 'Kompleks' ? 3 : 2),
        });
        setUploadStatus({
          type: 'success',
          message: `Butir soal baru berhasil ditambahkan ke ujian "${targetExam.judul_ujian}".`,
        });
      }
      setManualWacana('');
      setManualTeksSoal('');
      setManualOpsiA('');
      setManualOpsiB('');
      setManualOpsiC('');
      setManualOpsiD('');
      setManualOpsiE('');
      setManualKunci(['A']);
      await onRefreshData();
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || 'Gagal menyimpan soal.',
      });
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: number) => {
    await deleteQuestionCbt(questionId);
    if (editingQuestionId === questionId) {
      handleCancelEditQuestion();
    }
    await onRefreshData();
  };

  const handleClearExamQuestions = async () => {
    if (!currentExam || currentExamQuestions.length === 0) return;
    setUploadStatus(null);
    const removedCount = await clearExamQuestionsCbt(
      currentExam.id,
      questions
    );
    setUploadStatus({
      type: 'success',
      message: `Seluruh soal (${removedCount} butir) pada paket "${currentExam.judul_ujian}" telah dikosongkan.`,
    });
    await onRefreshData();
  };

  const handleCopyQuestionsToExam = async () => {
    if (!currentExam || !copyTargetExamId || currentExamQuestions.length === 0)
      return;
    const destExam = exams.find((e) => e.id === copyTargetExamId);
    if (!destExam) return;
    setIsCopyingQuestions(true);
    setUploadStatus(null);
    try {
      const copied = await copyQuestionsToExamCbt(
        destExam.id,
        currentExamQuestions
      );
      setUploadStatus({
        type: 'success',
        message: `Berhasil menyalin ${copied} butir soal ke paket ujian "${destExam.judul_ujian}".`,
      });
      await onRefreshData();
    } finally {
      setIsCopyingQuestions(false);
    }
  };

  const executeQuestionsCsvUpload = async (
    rawCsvContent: string,
    sourceFileName?: string
  ) => {
    if (!rawCsvContent.trim()) {
      setUploadStatus({
        type: 'error',
        message:
          'Pilih file CSV/Excel soal atau tempelkan daftar soal terlebih dahulu.',
      });
      return;
    }

    setIsUploadingCsv(true);
    setUploadStatus(null);

    try {
      const targetExam = await ensureActiveExamForQuestions();
      const outcome = await uploadQuestionsCsvCbt(
        targetExam.id,
        rawCsvContent,
        replaceExistingQuestions,
        questions
      );
      setUploadStatus({
        type: 'success',
        message: `${
          sourceFileName ? `File "${sourceFileName}" langsung diupload: ` : ''
        }Berhasil mengimpor ${outcome.insertedCount} butir soal ke ujian "${
          targetExam.judul_ujian
        }" (${formatDistribusiLabel(
          targetExam.target_tingkat,
          targetExam.target_kelas
        )}).`,
      });
      setCsvText('');
      await onRefreshData();
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || 'Gagal mengunggah file soal.',
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    e.target.value = '';
    setIsUploadingCsv(true);
    setUploadStatus(null);
    try {
      const outcome = await parseQuestionsFromFile(file);
      if (outcome.rows.length === 0) {
        setUploadStatus({
          type: 'error',
          message:
            outcome.errors.join(' | ') ||
            `File "${fileName}" tidak memiliki butir soal yang terbaca. Pastikan terdapat kolom soal dan pilihan jawaban.`,
        });
        return;
      }
      setCsvText(outcome.csvRepresentation);
      await executeQuestionsCsvUpload(
        outcome.csvRepresentation,
        `${fileName} (${outcome.formatDetected})`
      );
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || `Gagal memproses file soal "${fileName}".`,
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleUploadCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeQuestionsCsvUpload(csvText);
  };

  const handleDownloadSampleCsv = () => {
    triggerBrowserDownload(
      SAMPLE_CSV_TEMPLATE,
      'Template_Soal_CBT_Kolom_Terpisah.csv',
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadQuestionTemplateExcel = () => {
    triggerBrowserDownload(
      generateQuestionTemplateExcel(),
      'Template_Soal_CBT_11_Kolom.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportQuestionsExcel = (exportAllPackages = false) => {
    const targetQuestions =
      exportAllPackages || currentExamQuestions.length === 0
        ? questions
        : currentExamQuestions;
    const rows = targetQuestions.map((q, idx) => {
      const ex = exams.find((e) => e.id === q.exam_id);
      const isKompleks =
        q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      const logikaPenilaian = isKompleks
        ? 'PG Kompleks: Benar Semua = 3 Poin, Benar Sebagian = 1-2 Poin, Salah = 0 Poin'
        : 'PG Biasa: Benar = 2 Poin, Salah = 0 Poin';
      return [
        q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`,
        isKompleks ? 'Kompleks' : 'PG',
        q.data_opsi?.wacana || '',
        q.teks_soal,
        q.data_opsi?.opsi?.A || '',
        q.data_opsi?.opsi?.B || '',
        q.data_opsi?.opsi?.C || '',
        q.data_opsi?.opsi?.D || '',
        q.data_opsi?.opsi?.E || '',
        q.kunci_jawaban.join(','),
        q.bobot || (isKompleks ? 3 : 2),
        ex?.judul_ujian || `Ujian #${q.exam_id}`,
        logikaPenilaian,
      ];
    });
    const html = buildExcelHtmlTable(
      'Bank Soal CBT',
      [
        'id_soal',
        'jenis_soal',
        'wacana',
        'teks_soal',
        'opsi_a',
        'opsi_b',
        'opsi_c',
        'opsi_d',
        'opsi_e',
        'kunci_jawaban',
        'bobot',
        'paket_ujian',
        'keterangan_logika_skor',
      ],
      rows
    );
    const examSlug = exportAllPackages
      ? 'Semua_Paket_Ujian'
      : (currentExam?.judul_ujian || 'Semua_Paket')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .slice(0, 30);
    triggerBrowserDownload(
      html,
      `Bank_Soal_${examSlug}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportQuestionsCsv = () => {
    const targetQuestions =
      currentExamQuestions.length > 0 ? currentExamQuestions : questions;
    const rows = targetQuestions.map((q, idx) => {
      const isKompleks =
        q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      return [
        q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`,
        isKompleks ? 'Kompleks' : 'PG',
        q.data_opsi?.wacana || '',
        q.teks_soal,
        q.data_opsi?.opsi?.A || '',
        q.data_opsi?.opsi?.B || '',
        q.data_opsi?.opsi?.C || '',
        q.data_opsi?.opsi?.D || '',
        q.data_opsi?.opsi?.E || '',
        q.kunci_jawaban.join(','),
        q.bobot || (isKompleks ? 3 : 2),
      ];
    });
    const csvContent = buildSemicolonCsv(
      [
        'id_soal',
        'jenis_soal',
        'wacana',
        'teks_soal',
        'opsi_a',
        'opsi_b',
        'opsi_c',
        'opsi_d',
        'opsi_e',
        'kunci_jawaban',
        'bobot',
      ],
      rows
    );
    const examSlug = (currentExam?.judul_ujian || 'Semua_Paket')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .slice(0, 30);
    triggerBrowserDownload(
      csvContent,
      `Bank_Soal_${examSlug}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const buildResultReportRows = (
    targetResultsList: ResultItem[],
    rosterStudentsList: StudentItem[] = []
  ) => {
    const sortedList = [...targetResultsList].sort((a, b) => {
      const stA = students.find((s) => s.id === a.student_id);
      const stB = students.find((s) => s.id === b.student_id);
      const klsCmp = (stA?.kelas || '').localeCompare(stB?.kelas || '');
      if (klsCmp !== 0) return klsCmp;
      return (stA?.nama || '').localeCompare(stB?.nama || '');
    });

    const submittedStudentIds = new Set<number>();
    const submittedRows = sortedList.map((resItem) => {
      submittedStudentIds.add(resItem.student_id);
      const st = students.find((s) => s.id === resItem.student_id);
      const ex = exams.find((e) => e.id === resItem.exam_id);
      const tkt = st ? extractTingkatFromKelas(st.kelas) : 'LAINNYA';
      const ai = resItem.analisis_ai;
      const ketuntasan =
        resItem.skor_angka >= 70 ? 'Tuntas (>=70)' : 'Belum Tuntas (<70)';
      const kategori =
        ai?.kategori_nilai ||
        (resItem.skor_angka >= 85
          ? 'Sangat Baik (A)'
          : resItem.skor_angka >= 70
            ? 'Baik (B)'
            : resItem.skor_angka >= 55
              ? 'Cukup (C)'
              : 'Perlu Bimbingan (D)');
      const ringkasanJawaban = Object.entries(resItem.jawaban_siswa || {})
        .map(([qId, keys]) => `#${qId}:${(keys || []).join('')}`)
        .join(' ');

      return [
        st?.nama || `Siswa #${resItem.student_id}`,
        st?.kelas || '-',
        tkt === 'LAINNYA' ? '-' : `Tingkat ${tkt}`,
        st?.token_ujian || '-',
        ex?.judul_ujian || `Ujian #${resItem.exam_id}`,
        resItem.skor_angka,
        kategori,
        ketuntasan,
        `${resItem.pelanggaran_tab || 0}x Pindah Tab`,
        ringkasanJawaban || '-',
        ai?.evaluasi_hots || 'Belum Dianalisis AI',
        ai?.analisis_kompetensi?.kekuatan?.join(' | ') || '-',
        ai?.analisis_kompetensi?.kelemahan?.join(' | ') || '-',
        ai?.rekomendasi_belajar?.join(' | ') || '-',
      ];
    });

    const pendingStudents = rosterStudentsList
      .filter((s) => !submittedStudentIds.has(s.id))
      .sort((a, b) => {
        const klsCmp = a.kelas.localeCompare(b.kelas);
        if (klsCmp !== 0) return klsCmp;
        return a.nama.localeCompare(b.nama);
      });

    const pendingRows = pendingStudents.map((st) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      return [
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? '-' : `Tingkat ${tkt}`,
        st.token_ujian,
        '-',
        '-',
        st.status_ujian || 'Belum Mulai',
        'Belum Mengumpulkan Ujian',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ];
    });

    return [...submittedRows, ...pendingRows].map((row, idx) => [
      idx + 1,
      ...row,
    ]);
  };

  const RESULT_REPORT_HEADERS = [
    'No',
    'Nama Siswa',
    'Kelas',
    'Tingkatan',
    'Token Ujian',
    'Paket Ujian',
    'Skor Akhir (0-100)',
    'Kategori / Status Ujian',
    'Status Ketuntasan',
    'Log Anti-Cheat',
    'Rekaman Jawaban Siswa',
    'Evaluasi Kognitif HOTS',
    'Kekuatan Kompetensi',
    'Kelemahan Kognitif',
    '3 Rekomendasi Belajar',
  ];

  const resolveScopeResultsAndRoster = (
    scope: 'filtered' | 'all' | { kelas: string } = 'all'
  ) => {
    let targetResults = results;
    let targetRoster = students;
    let label = 'Semua_Kelas';

    if (typeof scope === 'object' && scope.kelas) {
      label = `Kelas_${scope.kelas}`;
      const normKls = scope.kelas.trim().toLowerCase();
      targetRoster = students.filter(
        (s) => s.kelas.trim().toLowerCase() === normKls
      );
      targetResults = results.filter((r) => {
        const st = students.find((s) => s.id === r.student_id);
        return st && st.kelas.trim().toLowerCase() === normKls;
      });
    } else if (scope === 'filtered') {
      targetResults = filteredResults;
      if (filterResultKelas !== 'SEMUA') {
        label = `Kelas_${filterResultKelas}`;
        const normKls = filterResultKelas.trim().toLowerCase();
        targetRoster = students.filter(
          (s) => s.kelas.trim().toLowerCase() === normKls
        );
      } else if (filterResultTingkat !== 'SEMUA') {
        label = `Tingkat_${filterResultTingkat}`;
        targetRoster = students.filter(
          (s) => extractTingkatFromKelas(s.kelas) === filterResultTingkat
        );
      } else {
        label = 'Filter_Aktif';
        targetRoster = students;
      }
    }

    return { targetResults, targetRoster, label };
  };

  const handleExportResultsExcel = (
    scope: 'filtered' | 'all' | { kelas: string } = 'all'
  ) => {
    const { targetResults, targetRoster, label } =
      resolveScopeResultsAndRoster(scope);
    const rows = buildResultReportRows(targetResults, targetRoster);
    const html = buildExcelHtmlTable(
      `Hasil ${label}`,
      RESULT_REPORT_HEADERS,
      rows
    );
    const safeSlug = label.replace(/[^a-zA-Z0-9]+/g, '_');
    triggerBrowserDownload(
      html,
      `Laporan_Hasil_Ujian_${safeSlug}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportResultsCsv = (
    scope: 'filtered' | 'all' | { kelas: string } = 'all'
  ) => {
    const { targetResults, targetRoster, label } =
      resolveScopeResultsAndRoster(scope);
    const rows = buildResultReportRows(targetResults, targetRoster);
    const csvContent = buildSemicolonCsv(RESULT_REPORT_HEADERS, rows);
    const safeSlug = label.replace(/[^a-zA-Z0-9]+/g, '_');
    triggerBrowserDownload(
      csvContent,
      `Laporan_Hasil_Ujian_${safeSlug}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportClassSummaryExcel = () => {
    const rows = [
      ...classAnalyticsData.perClass,
      classAnalyticsData.overall,
    ].map((item, idx) => [
      idx + 1,
      item.kelas,
      item.tingkat === 'LAINNYA' ? 'Semua Tingkat' : `Tingkat ${item.tingkat}`,
      item.totalStudents,
      item.resultCount,
      item.averageScore,
      item.lotsScore,
      item.hotsScore,
      item.highestScore,
      item.lowestScore,
      `${item.passCount} Siswa (${item.passRate}%)`,
      item.gradeDistribution.A,
      item.gradeDistribution.B,
      item.gradeDistribution.C,
      item.gradeDistribution.D,
      `${item.analyzedCount}/${item.resultCount} Teranalisis`,
    ]);
    const html = buildExcelHtmlTable(
      'Rekap Analisis Kelas',
      [
        'No',
        'Nama Kelas / Rombel',
        'Tingkatan',
        'Total Siswa Terdaftar',
        'Peserta Selesai Ujian',
        'Rata-Rata Nilai',
        'Rata-Rata LOTS (C1-C3)',
        'Rata-Rata HOTS (C4-C6)',
        'Nilai Tertinggi',
        'Nilai Terendah',
        'Ketuntasan (>=70)',
        'Predikat A (85-100)',
        'Predikat B (70-84)',
        'Predikat C (55-69)',
        'Predikat D (<55)',
        'Status Evaluasi AI',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      'Rekapitulasi_Analisis_Nilai_Per_Kelas_dan_Semua.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  // --- AI Evaluation Handler (Single & Batch Class) ---
  const handleGenerateAiAnalysis = async (result: ResultItem) => {
    const student = students.find((s) => s.id === result.student_id);
    const examObj = exams.find((e) => Number(e.id) === Number(result.exam_id));
    const examForResult = questions.filter((q) => Number(q.exam_id) === Number(result.exam_id));
    if (!student) return;

    const answeredCount = Object.keys(result.jawaban_siswa || {}).filter(
      (k) =>
        Array.isArray(result.jawaban_siswa[k]) &&
        result.jawaban_siswa[k].length > 0
    ).length;

    if (result.skor_angka === 0 || answeredCount === 0) {
      setAiErrorBanner(
        `Skor 0: Analisis AI tidak tersedia untuk hasil ujian kosong (${student.nama}).`
      );
      return;
    }

    setAnalyzingResultId(result.id);
    setAiErrorBanner(null);

    try {
      const data = await generateAiAnalysisCbt({
        resultId: result.id,
        nama_siswa: student.nama,
        questions: examForResult,
        jawaban_siswa: result.jawaban_siswa,
        existingResult: result,
        student,
        exam: examObj,
      });
      await onRefreshData();
      setSelectedAiModal({
        studentName: student.nama,
        studentClass: student.kelas,
        analysis: data,
      });
    } catch (err: any) {
      setAiErrorBanner(
        err.message || 'Gagal menjalankan analisis AI.'
      );
    } finally {
      setAnalyzingResultId(null);
    }
  };

  const handleBatchAiAnalysisForList = async (targetList: ResultItem[]) => {
    const validTargets = targetList.filter((resItem) => {
      const answeredCount = Object.keys(resItem.jawaban_siswa || {}).filter(
        (k) =>
          Array.isArray(resItem.jawaban_siswa[k]) &&
          resItem.jawaban_siswa[k].length > 0
      ).length;
      return resItem.skor_angka > 0 && answeredCount > 0;
    });

    if (validTargets.length === 0) {
      setAiErrorBanner(
        'Tidak ada hasil ujian dengan skor > 0 untuk dianalisis oleh AI.'
      );
      return;
    }

    setIsAnalyzingBatchClass(true);
    setAiErrorBanner(null);
    try {
      for (const resItem of validTargets) {
        const student = students.find((s) => s.id === resItem.student_id);
        const examObj = exams.find((e) => Number(e.id) === Number(resItem.exam_id));
        const examForResult = questions.filter(
          (q) => Number(q.exam_id) === Number(resItem.exam_id)
        );
        if (!student) continue;
        await generateAiAnalysisCbt({
          resultId: resItem.id,
          nama_siswa: student.nama,
          questions: examForResult,
          jawaban_siswa: resItem.jawaban_siswa,
          existingResult: resItem,
          student,
          exam: examObj,
        });
      }
      await onRefreshData();
    } catch (err: any) {
      setAiErrorBanner(
        err.message || 'Gagal menjalankan analisis AI massal.'
      );
    } finally {
      setIsAnalyzingBatchClass(false);
    }
  };

  // ============================================================================
  // SEPARATE TEACHER LOGIN PAGE (WHEN NOT AUTHENTICATED)
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 text-slate-600 text-xs font-semibold uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              <span>Otorisasi Pengawas &amp; Guru CBT</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
              Portal Manajemen Ujian
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Masuk untuk mengelola jadwal ujian, distribusi paket soal, pemantauan peserta, serta analisis evaluasi kognitif.
            </p>
          </div>

          <form onSubmit={handleTeacherFormLogin} className="space-y-4">
            <div>
              <label
                htmlFor="teacher-username-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email Pengawas / Guru
              </label>
              <input
                id="teacher-username-input"
                type="email"
                value={teacherUsername}
                onChange={(e) => setTeacherUsername(e.target.value)}
                placeholder="nama@sekolah.sch.id"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="teacher-password-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                PIN Otorisasi (6 Digit)
              </label>
              <input
                id="teacher-password-input"
                type="password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              Masuk ke Konsol Guru
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleGoogleTeacherSignIn}
              className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-blue-600" />
              <span>Masuk dengan Akun Google Institusi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED TEACHER DASHBOARD
  // ============================================================================
  const activeStudentsCount = students.filter(
    (s) => s.status_ujian === 'Sedang Ujian'
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Executive Colorful Institutional Console Header & Dedicated Navigation Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        {/* Top Row: Royal Blue & Indigo Hero Identity Banner + System Actions */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-indigo-800">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 text-amber-300 font-bold uppercase tracking-wider">
                Konsol Guru &amp; Pengawas CBT
              </span>
              <span className="text-indigo-300">·</span>
              <span className="text-blue-100">
                Pengawas Aktif:{' '}
                <strong className="text-white font-bold">
                  {teacherProfile.name}
                </strong>{' '}
                <span className="text-blue-200/80">({teacherProfile.email})</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Pusat Kendali Distribusi Ujian, Database Siswa &amp; Evaluasi Sosiologi
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onManualFirebaseSync && (
              <button
                type="button"
                onClick={onManualFirebaseSync}
                disabled={isSyncingFirebase}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 disabled:opacity-50 rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer backdrop-blur-xs"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-emerald-300 ${
                    isSyncingFirebase ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isSyncingFirebase ? 'Menyinkronkan...' : 'Sinkronkan Data'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsAuthenticated(false);
                try {
                  localStorage.removeItem('cbt_teacher_auth');
                  localStorage.removeItem('cbt_teacher_active_tab');
                } catch {}
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 border border-rose-400/40 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Guru</span>
            </button>
          </div>
        </div>

        {/* Second Row: Dedicated Full-Width Colorful 6-Tab Navigation Menu Bar */}
        <div className="bg-gradient-to-r from-slate-100 via-blue-50/50 to-indigo-50/50 p-3 border-b border-slate-200">
          <div
            role="tablist"
            aria-label="Menu Utama Konsol Guru"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ujian'}
              onClick={() => setActiveTab('ujian')}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'ujian'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-700 shadow-xs'
                  : 'bg-white hover:bg-blue-50/70 text-slate-700 border-slate-200/90 hover:border-blue-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <ClipboardList
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'ujian' ? 'text-amber-300' : 'text-blue-600'
                  }`}
                />
                <span className="truncate">Distribusi Ujian</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'ujian'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                }`}
              >
                {exams.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'manajemen'}
              onClick={() => setActiveTab('manajemen')}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'manajemen'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-white hover:bg-indigo-50/70 text-slate-700 border-slate-200/90 hover:border-indigo-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Layers
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'manajemen' ? 'text-emerald-300' : 'text-indigo-600'
                  }`}
                />
                <span className="truncate">Manajemen Ujian</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'manajemen'
                    ? 'bg-white/20 text-white'
                    : activeStudentsCount > 0
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                }`}
              >
                {activeStudentsCount > 0 ? `${activeStudentsCount} Aktif` : 'Kelas'}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'siswa'}
              onClick={() => setActiveTab('siswa')}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'siswa'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white hover:bg-emerald-50/70 text-slate-700 border-slate-200/90 hover:border-emerald-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Users
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'siswa' ? 'text-amber-200' : 'text-emerald-600'
                  }`}
                />
                <span className="truncate">Database Siswa</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'siswa'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                }`}
              >
                {students.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'soal'}
              onClick={() => {
                setActiveTab('soal');
                setIsBankSoalDetailOpen(false);
              }}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'soal'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white hover:bg-amber-50/70 text-slate-700 border-slate-200/90 hover:border-amber-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <FileSpreadsheet
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'soal' ? 'text-white' : 'text-amber-600'
                  }`}
                />
                <span className="truncate">Bank Soal</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'soal'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                }`}
              >
                {questions.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'laporan'}
              onClick={() => setActiveTab('laporan')}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'laporan'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-700 shadow-xs'
                  : 'bg-white hover:bg-purple-50/70 text-slate-700 border-slate-200/90 hover:border-purple-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'laporan' ? 'text-amber-300' : 'text-purple-600'
                  }`}
                />
                <span className="truncate">Hasil &amp; Evaluasi</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'laporan'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-50 text-purple-800 border border-purple-200/60'
                }`}
              >
                {results.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'anbuso'}
              onClick={() => setActiveTab('anbuso')}
              className={`px-3.5 py-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'anbuso'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white border-cyan-700 shadow-xs'
                  : 'bg-white hover:bg-cyan-50/70 text-slate-700 border-slate-200/90 hover:border-cyan-300'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <BarChart3
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'anbuso' ? 'text-amber-300' : 'text-cyan-600'
                  }`}
                />
                <span className="truncate">Analisis Butir (AnBuso)</span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-md font-bold shrink-0 ${
                  activeTab === 'anbuso'
                    ? 'bg-white/20 text-white'
                    : 'bg-cyan-50 text-cyan-800 border border-cyan-200/60'
                }`}
              >
                AnBuso
              </span>
            </button>
          </div>
        </div>

        {/* Third Row: Colorful 4-Metric Institutional Summary Cards */}
        <div className="p-4 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-blue-50 via-blue-50/60 to-indigo-50/40 border border-blue-200/80">
            <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
              Paket Ujian Aktif
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-blue-950 mt-0.5">
              {exams.length}{' '}
              <span className="text-xs font-medium font-sans text-blue-700">
                paket ujian
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-violet-50 via-purple-50/60 to-indigo-50/40 border border-violet-200/80">
            <div className="text-[11px] font-bold text-violet-800 uppercase tracking-wider">
              Sebaran Siswa 3 Tingkatan
            </div>
            <div className="text-xs font-extrabold font-mono tabular-nums text-violet-950 mt-1.5">
              Kelas X: {countTingkat10} <span className="text-violet-400">·</span> XI:{' '}
              {countTingkat11} <span className="text-violet-400">·</span> XII:{' '}
              {countTingkat12}
            </div>
          </div>

          <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-amber-50 via-orange-50/50 to-yellow-50/40 border border-amber-200/80">
            <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
              Total Butir Soal
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-amber-950 mt-0.5">
              {questions.length}{' '}
              <span className="text-xs font-medium font-sans text-amber-800">
                butir soal
              </span>
            </div>
          </div>

          <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-emerald-50 via-teal-50/60 to-cyan-50/40 border border-emerald-200/80">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Hasil Ujian Masuk
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-emerald-950 mt-0.5">
              {results.length}{' '}
              <span className="text-xs font-medium font-sans text-emerald-700">
                peserta selesai
              </span>
            </div>
          </div>
        </div>

        {/* Quiet Footer Status Bar inside Console Header */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-blue-50/70 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider">
              Live Sync Aktif
            </span>
            <span className="font-medium text-slate-700">
              {syncPulse?.lastEvent ||
                'Perubahan jadwal, peserta, bank soal, dan hasil tersimpan otomatis'}
            </span>
          </div>
          {syncPulse?.lastSyncedAt && (
            <span className="font-mono tabular-nums font-semibold text-indigo-800">
              Update Terakhir: {new Date(syncPulse.lastSyncedAt).toLocaleTimeString('id-ID')}
            </span>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: MANAJEMEN UJIAN & DISTRIBUSI SOAL KE 3 TINGKATAN KELAS          */}
      {/* ===================================================================== */}
      {activeTab === 'ujian' && (
        <div className="space-y-6">
          {/* Panduan Alur Distribusi Soal 3 Tingkatan */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                <Layers className="w-4 h-4" />
                <span>Cara Menentukan & Mendistribusikan Soal untuk 3 Tingkatan Kelas</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. Buat <strong>Paket Ujian</strong> di bawah dan pilih{' '}
                <strong>Target Tingkat Kelas</strong> (Tingkat 1 / Kelas X, Tingkat 2 / Kelas XI, atau Tingkat 3 / Kelas XII).{' '}
                2. Klik <strong>Kelola Soal</strong> pada paket tersebut untuk mengunggah soal khusus tingkatan itu.{' '}
                3. Saat siswa login dengan Token, sistem <strong>otomatis mencocokkan kelas siswa</strong> dan hanya memberikan soal sesuai tingkatannya.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Form Buat / Edit Paket Ujian & Distribusi Tingkat */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                {editingExamId
                  ? 'Edit Paket & Distribusi Ujian'
                  : 'Buat Paket Ujian per Tingkatan'}
              </h2>

              <form onSubmit={handleSaveExam} className="space-y-4">
                <div>
                  <label
                    htmlFor="exam-title-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Judul / Nama Ujian Sosiologi
                  </label>
                  <input
                    id="exam-title-input"
                    type="text"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="Contoh: PTS Sosiologi — Kelompok Sosial & Perubahan"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Kategori Momen Ujian Sosiologi */}
                <div>
                  <label
                    htmlFor="exam-kategori-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Kategori Momen Ujian Sosiologi
                  </label>
                  <select
                    id="exam-kategori-select"
                    value={newExamKategori}
                    onChange={(e) => setNewExamKategori(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {SOSIOLOGI_EXAM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Siklus Sesi Ujian (Draf vs Aktif) */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <label className="block text-xs font-semibold text-slate-800">
                    Status Sesi Ujian (Kapan Siswa Boleh Masuk?)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewExamStatus('DRAF')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                        newExamStatus === 'DRAF'
                          ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-400'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>DRAF (Bank Soal)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-1 leading-tight">
                        Siswa belum bisa melihat atau masuk. Aman untuk persiapan upload soal.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewExamStatus('AKTIF')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                        newExamStatus === 'AKTIF'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>AKTIF (Buka Sesi)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-1 leading-tight">
                        Sesi langsung terbuka bagi siswa kelas bersangkutan untuk memulai ujian.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="exam-tingkat-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Target Tingkatan Kelas Sosiologi
                  </label>
                  <select
                    id="exam-tingkat-select"
                    value={newExamTargetTingkat}
                    onChange={(e) => {
                      setNewExamTargetTingkat(e.target.value);
                      setNewExamTargetRombel([]);
                    }}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="10">
                      Tingkat 1 — Kelas X / Fase E
                    </option>
                    <option value="11">
                      Tingkat 2 — Kelas XI / Fase F
                    </option>
                    <option value="12">
                      Tingkat 3 — Kelas XII / Fase F Lanjutan
                    </option>
                    <option value="SEMUA">
                      Semua Tingkatan (Lintas Kelas)
                    </option>
                  </select>
                </div>

                {/* Target Rombel Spesifik */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Target Rombel Spesifik (Opsional)
                    </label>
                    {newExamTargetRombel.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewExamTargetRombel([])}
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Pilih Semua Rombel
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    {newExamTargetRombel.length === 0
                      ? 'Berlaku untuk SEMUA rombel pada tingkat ini.'
                      : `Dibatasi hanya untuk ${newExamTargetRombel.length} rombel terpilih:`}
                  </p>
                  {uniqueClasses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      {uniqueClasses
                        .filter((kls) => {
                          if (newExamTargetTingkat === 'SEMUA') return true;
                          return extractTingkatFromKelas(kls) === newExamTargetTingkat;
                        })
                        .map((kls) => {
                          const isChecked = newExamTargetRombel.includes(kls);
                          return (
                            <button
                              key={kls}
                              type="button"
                              onClick={() => {
                                setNewExamTargetRombel((prev) =>
                                  isChecked
                                    ? prev.filter((c) => c !== kls)
                                    : [...prev, kls]
                                );
                              }}
                              className={`px-2 py-0.5 text-xs rounded-md border font-medium cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isChecked ? '✓ ' : ''}{kls}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="exam-duration-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Durasi Ujian (Menit)
                  </label>
                  <input
                    id="exam-duration-input"
                    type="number"
                    min={5}
                    max={300}
                    value={newExamDuration}
                    onChange={(e) => setNewExamDuration(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Konfigurasi Pengacakan Soal & Multi-Paket (Anti-Mencontek) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Shuffle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Mekanisme Pengacakan & Multi-Paket Soal</span>
                  </div>

                  <div>
                    <label
                      htmlFor="exam-kode-paket-input"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Kode Soal / Paket Utama
                    </label>
                    <input
                      id="exam-kode-paket-input"
                      type="text"
                      value={newExamKodePaket}
                      onChange={(e) => setNewExamKodePaket(e.target.value.toUpperCase())}
                      placeholder="Contoh: PAKET-A, PAKET-B, UTAMA"
                      className="w-full px-3 py-1.5 text-xs font-mono font-semibold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-200/80">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamAcakSoal}
                        onChange={(e) => setNewExamAcakSoal(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">Acak Urutan Butir Soal</span>
                        <p className="text-[11px] text-slate-500">Nomor butir soal diacak otomatis per siswa sekelas.</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamAcakOpsi}
                        onChange={(e) => setNewExamAcakOpsi(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">Acak Pilihan Opsi A-E</span>
                        <p className="text-[11px] text-slate-500">Pilihan A-E diacak otomatis (skor tetap 100% akurat sesuai kunci).</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamMultiPaket}
                        onChange={(e) => setNewExamMultiPaket(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">Mode Multi-Paket (Beda Soal Sekelas / Angkatan)</span>
                        <p className="text-[11px] text-slate-500">Siswa sekelas otomatis dibagi ke varian paket/kode soal yang berbeda (A vs B).</p>
                      </div>
                    </label>

                    {newExamMultiPaket && (
                      <div className="pl-6 pt-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Jumlah Varian Paket Soal:
                        </label>
                        <select
                          value={newExamJumlahPaket}
                          onChange={(e) => setNewExamJumlahPaket(Number(e.target.value))}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value={2}>2 Varian (Paket A & Paket B)</option>
                          <option value={3}>3 Varian (Paket A, B, C)</option>
                          <option value={4}>4 Varian (Paket A, B, C, D)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Token Sesi Ujian (Diberikan Guru Setiap Akan Ujian) & Pengumuman */}
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-indigo-950">
                      Token Sesi Ujian &amp; Portal Siswa
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                      Kontrol Guru
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="exam-token-sesi-input"
                      className="block text-[11px] font-semibold text-indigo-950 mb-1"
                    >
                      Token Sesi Ujian (Diinput Siswa Saat Klik &ldquo;Mulai Ujian&rdquo;)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="exam-token-sesi-input"
                        type="text"
                        maxLength={12}
                        value={newExamTokenSesi}
                        onChange={(e) =>
                          setNewExamTokenSesi(
                            e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
                          )
                        }
                        placeholder="Misal: SOS10A"
                        className="flex-1 px-3 py-1.5 text-xs font-mono font-extrabold tracking-widest uppercase bg-white border border-indigo-300 text-indigo-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setNewExamTokenSesi(generateExamToken())}
                        className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-800 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-md cursor-pointer shrink-0 flex items-center gap-1"
                        title="Buat Token Sesi Ujian acak 6 karakter baru"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Acak Token</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-indigo-800/80 mt-1 leading-tight">
                      Token ini dapat Bapak/Ibu ubah kapan saja setiap akan mulai sesi ujian.
                    </p>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1 border-t border-indigo-200/60">
                    <input
                      type="checkbox"
                      checked={newExamTampilkanNilai}
                      onChange={(e) => setNewExamTampilkanNilai(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-indigo-600 rounded border-indigo-300"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-indigo-950">
                        Tampilkan Hasil &amp; Nilai di Akun Siswa
                      </span>
                      <p className="text-[10px] text-indigo-800/80">
                        Jika aktif, siswa dapat melihat skor &amp; mengunduh PDF pembahasan di menu Hasil Ujian.
                      </p>
                    </div>
                  </label>

                  <div>
                    <label
                      htmlFor="exam-pengumuman-input"
                      className="block text-[11px] font-semibold text-indigo-950 mb-1"
                    >
                      Pengumuman Ujian di Beranda Siswa (Opsional)
                    </label>
                    <textarea
                      id="exam-pengumuman-input"
                      rows={2}
                      value={newExamPengumuman}
                      onChange={(e) => setNewExamPengumuman(e.target.value)}
                      placeholder="Contoh: Kerjakan dengan jujur dan teliti. Waktu ujian 60 menit."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSavingExam}
                    className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingExam
                      ? 'Menyimpan...'
                      : editingExamId
                        ? 'Simpan Perubahan'
                        : 'Simpan Paket Ujian'}
                  </button>
                  {editingExamId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExamId(null);
                        setNewExamTitle('');
                        setNewExamDuration('60');
                        setNewExamTargetTingkat('10');
                        setNewExamTargetKelas('SEMUA');
                        setNewExamKategori('Penilaian Harian (PH / Kuis)');
                        setNewExamStatus('DRAF');
                        setNewExamTargetRombel([]);
                        setNewExamAcakSoal(true);
                        setNewExamAcakOpsi(true);
                        setNewExamKodePaket('PAKET-A');
                        setNewExamMultiPaket(false);
                        setNewExamJumlahPaket(2);
                        setNewExamTokenSesi(generateExamToken());
                        setNewExamTampilkanNilai(true);
                        setNewExamPengumuman('');
                      }}
                      className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>

              {examFeedback && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-800">
                  {examFeedback}
                </div>
              )}
            </div>

            {/* Tabel Daftar Paket Ujian per Tingkatan */}
            <div className="lg:col-span-8 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Manajemen Sesi &amp; Distribusi Paket
                  </div>
                  <h2 className="text-base font-extrabold text-white mt-0.5">
                    Daftar Distribusi Paket Ujian ({filteredExams.length} Paket)
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200">
                  Total Soal: {questions.length} Butir
                </span>
              </div>

              {/* Dedicated Full-Width Filter Bar: Tingkatan, Kategori, & Status */}
              <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-slate-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2.5">
                {/* Segmented Filter per Tingkatan */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-white rounded-lg border border-indigo-200 shadow-2xs">
                  {(
                    [
                      ['SEMUA', 'Semua'],
                      ['10', 'Tingkat 1 (X)'],
                      ['11', 'Tingkat 2 (XI)'],
                      ['12', 'Tingkat 3 (XII)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFilterExamTingkat(val)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filterExamTingkat === val
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Filter Status Ujian */}
                  <select
                    value={filterExamStatus}
                    onChange={(e) => setFilterExamStatus(e.target.value)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg cursor-pointer text-slate-800"
                    aria-label="Filter Status Ujian"
                  >
                    <option value="SEMUA">Semua Status</option>
                    <option value="AKTIF">Hanya Sesi Aktif</option>
                    <option value="DRAF">Hanya Draf (Bank Soal)</option>
                    <option value="SELESAI">Hanya Selesai</option>
                  </select>

                  {/* Filter Kategori Momen */}
                  <select
                    value={filterExamKategori}
                    onChange={(e) => setFilterExamKategori(e.target.value)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg cursor-pointer text-slate-800"
                    aria-label="Filter Kategori Momen Ujian"
                  >
                    <option value="SEMUA">Semua Kategori Momen</option>
                    {SOSIOLOGI_EXAM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-6">
              {filteredExams.length === 0 ? (
                <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm font-semibold text-slate-700">
                    Belum Ada Paket Ujian pada Filter Ini
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Buat paket ujian Sosiologi untuk Tingkat 1 (Kelas X), Tingkat 2 (Kelas
                    XI), atau Tingkat 3 (Kelas XII) pada formulir di sebelah kiri.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                        <th className="py-3 px-4">Judul &amp; Kode Paket</th>
                        <th className="py-3 px-4">Kategori &amp; Status Sesi</th>
                        <th className="py-3 px-4">Distribusi Tingkat &amp; Rombel</th>
                        <th className="py-3 px-4 text-right">Durasi</th>
                        <th className="py-3 px-4 text-right">Bank Soal</th>
                        <th className="py-3 px-4 text-right">Aksi Sesi &amp; Distribusi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredExams.map((ex) => {
                        const qCount = questions.filter(
                          (q) => q.exam_id === ex.id
                        ).length;
                        const isAktif = (ex.status_ujian || 'DRAF') === 'AKTIF';
                        const isDraf = (ex.status_ujian || 'DRAF') === 'DRAF';
                        const isSelesai = ex.status_ujian === 'SELESAI';

                        return (
                          <tr key={ex.id} className="hover:bg-slate-50/80">
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              <div>{ex.judul_ujian}</div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <Layers className="w-3 h-3 text-blue-600" />
                                  <span>{ex.kode_paket || 'PAKET-A'}</span>
                                </span>
                                {ex.acak_soal !== false && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Shuffle className="w-2.5 h-2.5" />
                                    <span>Acak Soal</span>
                                  </span>
                                )}
                                {ex.acak_opsi !== false && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                    <span>Acak Opsi</span>
                                  </span>
                                )}
                                {ex.mode_multi_paket && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                    <span>Multi-Paket ({ex.jumlah_paket || 2} Varian)</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-xs">
                              <div>
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {ex.kategori_ujian || 'Penilaian Harian (PH / Kuis)'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {isAktif ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                    AKTIF (Dibuka)
                                  </span>
                                ) : isSelesai ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                                    SELESAI (Arsip)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                                    DRAF (Bank Soal)
                                  </span>
                                )}

                                {isAktif ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleExamStatus(ex, 'DRAF')}
                                    title="Tutup sesi ujian ini agar siswa tidak bisa masuk (kembalikan ke Draf)"
                                    className="px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded cursor-pointer transition-colors"
                                  >
                                    Tutup / Draf
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleExamStatus(ex, 'AKTIF')}
                                    title="Buka sesi ujian ini sekarang agar siswa bisa memasukkan token dan mengerjakan"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer shadow-xs transition-colors"
                                  >
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    Buka Ujian
                                  </button>
                                )}
                              </div>

                              {/* Token Sesi Ujian Control right inside the row */}
                              <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-500">
                                  Token Sesi:
                                </span>
                                {inlineTokenEditExamId === ex.id ? (
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="text"
                                      maxLength={12}
                                      value={inlineTokenEditValue}
                                      onChange={(e) =>
                                        setInlineTokenEditValue(
                                          e.target.value
                                            .toUpperCase()
                                            .replace(/[^A-Z0-9-]/g, '')
                                        )
                                      }
                                      className="w-20 px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase border border-indigo-400 rounded bg-white text-indigo-950"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateExamSessionToken(
                                          ex,
                                          inlineTokenEditValue
                                        )
                                      }
                                      className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer"
                                    >
                                      Simpan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setInlineTokenEditExamId(null)}
                                      className="px-1.5 py-0.5 text-[10px] text-slate-600 bg-slate-100 rounded cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <code className="px-2 py-0.5 rounded bg-indigo-950 text-amber-300 font-mono text-[11px] font-extrabold tracking-wider">
                                      {getEffectiveExamSessionToken(ex)}
                                    </code>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateExamSessionToken(ex)
                                      }
                                      title="Acak Token Sesi Ujian baru untuk ujian ini"
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded cursor-pointer"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" />
                                      <span>Acak</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setInlineTokenEditExamId(ex.id);
                                        setInlineTokenEditValue(
                                          getEffectiveExamSessionToken(ex)
                                        );
                                      }}
                                      title="Atur sendiri kode Token Sesi Ujian"
                                      className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                    >
                                      Set Token
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-xs text-slate-700">
                              <div className="font-semibold text-blue-700">
                                {formatDistribusiLabel(
                                  ex.target_tingkat,
                                  ex.target_kelas
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {Array.isArray(ex.target_rombel) && ex.target_rombel.length > 0
                                  ? `Rombel: ${ex.target_rombel.join(', ')}`
                                  : 'Semua Rombel Tingkat Ini'}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                              {ex.durasi_menit} Menit
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                              {qCount} Soal
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedExamId(ex.id);
                                    setShowUploadPanel(true);
                                    setActiveTab('soal');
                                    setIsBankSoalDetailOpen(true);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Kelola Soal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingExamId(ex.id);
                                    setNewExamTitle(ex.judul_ujian);
                                    setNewExamDuration(String(ex.durasi_menit));
                                    setNewExamTargetTingkat(
                                      ex.target_tingkat || 'SEMUA'
                                    );
                                    setNewExamTargetKelas(
                                      ex.target_kelas || 'SEMUA'
                                    );
                                    setNewExamKategori(
                                      ex.kategori_ujian || 'Penilaian Harian (PH / Kuis)'
                                    );
                                    setNewExamStatus(
                                      (ex.status_ujian as any) || 'DRAF'
                                    );
                                    setNewExamTargetRombel(
                                      Array.isArray(ex.target_rombel) ? ex.target_rombel : []
                                    );
                                    setNewExamAcakSoal(ex.acak_soal !== false);
                                    setNewExamAcakOpsi(ex.acak_opsi !== false);
                                    setNewExamKodePaket(ex.kode_paket || 'PAKET-A');
                                    setNewExamMultiPaket(Boolean(ex.mode_multi_paket));
                                    setNewExamJumlahPaket(ex.jumlah_paket || 2);
                                    setNewExamTokenSesi(
                                      ex.token_sesi || getEffectiveExamSessionToken(ex)
                                    );
                                    setNewExamTampilkanNilai(ex.tampilkan_nilai !== false);
                                    setNewExamPengumuman(ex.pengumuman || '');
                                  }}
                                  aria-label={`Edit ujian ${ex.judul_ujian}`}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteExam(ex.id, ex.judul_ujian)
                                  }
                                  aria-label={`Hapus ujian ${ex.judul_ujian}`}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Visualisasi Performa Kelas: Komparasi LOTS vs HOTS (Recharts) */}
          <ClassPerformanceLotsHotsChart
            classAnalytics={classAnalyticsData}
            questions={questions}
            exams={exams}
            selectedClassFilter={filterResultKelas}
            onSelectClass={(kls) => {
              setFilterResultKelas(kls);
              if (kls !== 'SEMUA') {
                setActiveTab('laporan');
              }
            }}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB BARU: MANAJEMEN UJIAN & ANALISIS BUTIR SOAL KELAS                 */}
      {/* ===================================================================== */}
      {activeTab === 'manajemen' && (
        <ExamManagementTab
          exams={exams}
          questions={questions}
          students={students}
          results={results}
          onRefreshData={onRefreshData}
          onUpdateStudentStatus={handleUpdateStudentStatus}
          onBatchDistributePackages={handleBatchDistributePackages}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 2: MANAJEMEN KELAS, DATABASE SISWA & MANAJEMEN STATUS UJIAN        */}
      {/* ===================================================================== */}
      {activeTab === 'siswa' && (
        <div className="space-y-6">
          {/* Panel Manajemen Kelas / Rombel (Tambah Kelas, Ubah Nama Kelas, Download per Kelas) */}
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Administrasi Rombongan Belajar
                </div>
                <h2 className="text-base font-extrabold text-white mt-0.5">
                  Manajemen Kelas / Rombel (Kelas X, XI, XII)
                </h2>
                <p className="text-xs text-blue-200/90 mt-0.5">
                  Buat daftar kelas/rombel baru, ubah nama kelas secara massal,
                  reset status ujian satu kelas penuh, atau unduh daftar siswa &amp;
                  token per kelas maupun semua kelas.
                </p>
              </div>

              <form
                onSubmit={handleAddNewClass}
                className="flex flex-wrap items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  aria-label="Nama Kelas Baru"
                  value={newClassNameInput}
                  onChange={(e) => setNewClassNameInput(e.target.value)}
                  placeholder="Tambah Kelas (misal: X SOS 1)"
                  className="px-3 py-2 text-xs text-slate-900 bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 rounded-lg cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Kelas
                </button>
              </form>
            </div>

            <div className="p-5">
            {classAnalyticsData.perClass.length > 0 && (
              <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                      <th className="py-2.5 px-3.5">Nama Kelas / Rombel</th>
                      <th className="py-2.5 px-3.5">Tingkatan</th>
                      <th className="py-2.5 px-3.5 text-right">Jumlah Siswa</th>
                      <th className="py-2.5 px-3.5">Status Ujian Kelas</th>
                      <th className="py-2.5 px-3.5 text-right">Rata-Rata Nilai</th>
                      <th className="py-2.5 px-3.5 text-right">
                        Aksi Manajemen Kelas &amp; Download
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {classAnalyticsData.perClass.map((clsItem) => {
                      const isRenaming = renamingClassTarget === clsItem.kelas;
                      return (
                        <tr
                          key={clsItem.kelas}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  aria-label={`Ubah nama kelas ${clsItem.kelas}`}
                                  value={renameClassValue}
                                  onChange={(e) =>
                                    setRenameClassValue(e.target.value)
                                  }
                                  className="px-2 py-1 text-xs border border-blue-400 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRenameClassSubmit(clsItem.kelas)
                                  }
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-blue-600 rounded cursor-pointer"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingClassTarget(null)}
                                  className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              clsItem.kelas
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {clsItem.tingkat === 'LAINNYA'
                              ? 'Umum'
                              : `Tingkat ${clsItem.tingkat}`}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900">
                            {clsItem.totalStudents} Siswa
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            Selesai: <strong>{clsItem.statusCounts.selesai}</strong> ·
                            Aktif: <strong>{clsItem.statusCounts.sedangUjian}</strong> ·
                            Blokir: <strong className="text-red-700">{clsItem.statusCounts.diblokir}</strong>
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-blue-700">
                            {clsItem.resultCount > 0
                              ? `${clsItem.averageScore}/100`
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterStudentTingkat('SEMUA');
                                  setFilterKelas(clsItem.kelas);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
                              >
                                Filter Siswa
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const clsStudents = students.filter(
                                    (s) =>
                                      s.kelas.trim().toLowerCase() ===
                                      clsItem.kelas.trim().toLowerCase()
                                  );
                                  downloadStudentTokenCardsPdf(clsStudents, {
                                    kelasLabel: `Kelas ${clsItem.kelas}`,
                                    exams,
                                    results,
                                    includeSummaryPage: true,
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                Kartu Token &amp; Nilai (.PDF)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadClassStudentsExcel(
                                    clsItem.kelas
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                Siswa (.xls)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingClassTarget(clsItem.kelas);
                                  setRenameClassValue(clsItem.kelas);
                                }}
                                className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                              >
                                Ubah Nama
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteClass(clsItem.kelas)
                                }
                                aria-label={`Hapus kelas ${clsItem.kelas}`}
                                className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>

          {/* Baris Ringkasan & Manajemen Status Ujian Siswa */}
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Kontrol Status Peserta &amp; Kartu Token Ujian
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Manajemen Status Ujian Siswa &amp; Export Excel Terpisah per Kolom
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5 max-w-4xl">
                Pantau dan kelola status peserta ujian secara real-time: buka
                kunci siswa yang terblokir Anti-Cheat, reset status siswa yang
                sudah selesai agar bisa login ulang, atau unduh daftar Nama,
                Kelas &amp; Token dalam kolom Excel terpisah maupun PDF Kartu Token.
              </p>
            </div>

            <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 border-b border-indigo-100 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={filteredStudents.length === 0}
                onClick={() =>
                  downloadStudentTokenCardsPdf(filteredStudents, {
                    kelasLabel:
                      filterKelas !== 'SEMUA'
                        ? `Kelas ${filterKelas}`
                        : 'Semua Kelas',
                    exams,
                    results,
                    includeSummaryPage: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 rounded-lg transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {filterKelas !== 'SEMUA'
                    ? `Download Kartu Token & Nilai Kelas ${filterKelas} (.PDF)`
                    : 'Download Kartu Token & Nilai (.PDF)'}
                </span>
              </button>
              {filterKelas !== 'SEMUA' && (
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadClassStudentsExcel(filterKelas)
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Siswa Kelas {filterKelas} (.xls)
                </button>
              )}
              <button
                type="button"
                onClick={handleExportStudentsExcel}
                disabled={students.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Semua Siswa &amp; Token (.xls)
              </button>
              <button
                type="button"
                onClick={() => handleBulkUpdateStudentStatus('Belum Mulai')}
                disabled={filteredStudents.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Status ke &ldquo;Belum Mulai&rdquo;
              </button>
            </div>

            {/* Filter & Indikator 4 Status Ujian Siswa */}
            <div className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(
                [
                  ['SEMUA', 'Semua Status', students.length, 'text-slate-900'],
                  [
                    'Belum Mulai',
                    'Belum Mulai',
                    countStatusBelumMulai,
                    'text-slate-700',
                  ],
                  [
                    'Sedang Ujian',
                    'Sedang Ujian',
                    countStatusSedangUjian,
                    'text-amber-700',
                  ],
                  ['Selesai', 'Selesai Ujian', countStatusSelesai, 'text-emerald-700'],
                  [
                    'Diblokir',
                    'Diblokir (Anti-Cheat)',
                    countStatusDiblokir,
                    'text-red-700',
                  ],
                ] as const
              ).map(([statusKey, label, countVal, textColor]) => {
                const isSelected = filterStudentStatus === statusKey;
                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setFilterStudentStatus(statusKey)}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500">
                      {label}
                    </div>
                    <div
                      className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${textColor}`}
                    >
                      {countVal}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        siswa
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Panel Kiri: Switcher Tambah 1 Siswa vs Upload Massal Siswa Excel/CSV */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setStudentInputMode('manual')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    studentInputMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Input Siswa Satuan
                </button>
                <button
                  type="button"
                  onClick={() => setStudentInputMode('csv')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    studentInputMode === 'csv'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Upload Massal Siswa (Excel / CSV)
                </button>
              </div>

              {studentInputMode === 'manual' ? (
                <form
                  key="student-form-manual"
                  onSubmit={handleSaveStudent}
                  className="space-y-4"
                >
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {editingStudentId
                        ? 'Edit Data Siswa'
                        : 'Tambah Siswa ke Database'}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Pilih tingkatan kelas (X, XI, atau XII) dan masukkan nama
                      siswa.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="add-student-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Nama Lengkap Siswa
                    </label>
                    <input
                      id="add-student-name"
                      type="text"
                      value={studentNameInput}
                      onChange={(e) => setStudentNameInput(e.target.value)}
                      placeholder="Masukkan Nama Siswa"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="add-student-nisn"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      NISN Siswa (Opsional — Tampil di Profil Akun Siswa)
                    </label>
                    <input
                      id="add-student-nisn"
                      type="text"
                      value={studentNisnInput}
                      onChange={(e) => setStudentNisnInput(e.target.value)}
                      placeholder="Contoh: 0078123456"
                      className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Pilih Tingkatan Kelas Cepat
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['X', 'Tingkat 1 (X)', 'X MIPA 1'],
                          ['XI', 'Tingkat 2 (XI)', 'XI MIPA 1'],
                          ['XII', 'Tingkat 3 (XII)', 'XII MIPA 1'],
                        ] as const
                      ).map(([prefix, label, sampleKelas]) => (
                        <button
                          key={prefix}
                          type="button"
                          onClick={() => {
                            setStudentTingkatPreset(prefix);
                            if (
                              !studentClassInput
                                .toUpperCase()
                                .startsWith(prefix + ' ')
                            ) {
                              setStudentClassInput(sampleKelas);
                            }
                          }}
                          className={`py-1.5 px-2 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                            studentTingkatPreset === prefix
                              ? 'bg-blue-50 text-blue-700 border-blue-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="add-student-class"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Nama Kelas / Rombel
                    </label>
                    <input
                      id="add-student-class"
                      type="text"
                      value={studentClassInput}
                      onChange={(e) => setStudentClassInput(e.target.value)}
                      placeholder="Contoh: X MIPA 1, XI IPS 2, XII MIPA 1"
                      className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isSavingStudent}
                      className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {isSavingStudent
                        ? 'Menyimpan...'
                        : editingStudentId
                          ? 'Simpan Perubahan Siswa'
                          : 'Simpan Siswa & Generate Token'}
                    </button>
                    {editingStudentId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingStudentId(null);
                          setStudentNameInput('');
                        }}
                        className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <form
                  key="student-form-csv"
                  onSubmit={handleUploadStudentCsvSubmit}
                  className="space-y-4"
                >
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Upload Massal Siswa (Excel / CSV)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Unduh template Excel rapi di bawah (Kolom A: Nama Siswa,
                      Kolom B: Kelas terpisah otomatis saat dibuka di Microsoft
                      Excel).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadStudentTemplateExcel}
                      className="py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template Excel (.xls)
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleStudentCsv}
                      className="py-2 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template CSV (Kolom Terpisah)
                    </button>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-800">
                      Struktur 2 Kolom Terpisah (Nama Siswa & Kelas):
                    </div>
                    <code className="block font-mono text-[11px] text-blue-700">
                      Kolom A: nama_siswa &nbsp;|&nbsp; Kolom B: kelas
                    </code>
                    <p className="text-[11px] text-slate-500">
                      Mendukung pemisah titik koma (<code className="font-mono">;</code>),
                      koma (<code className="font-mono">,</code>), atau salin-tempel
                      langsung 2 kolom dari tabel Microsoft Excel.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="student-csv-file"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Pilih File Daftar Siswa (.xlsx, .xls, .csv, atau .txt)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-1.5">
                      Langsung upload otomatis saat file dipilih. Mendukung Excel (.xlsx & .xls), CSV, dan TSV.
                    </p>
                    <input
                      id="student-csv-file"
                      type="file"
                      accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleStudentCsvFileChange}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="student-csv-textarea"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Atau Tempelkan Daftar Siswa dari Excel (Nama ; Kelas)
                    </label>
                    <textarea
                      id="student-csv-textarea"
                      rows={5}
                      value={studentCsvText}
                      onChange={(e) => setStudentCsvText(e.target.value)}
                      placeholder={`nama_siswa;kelas\nAditya Pratama;X MIPA 1\nBagas Setiawan;XI MIPA 1\nReza Rahadian;XII MIPA 1`}
                      className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceExistingStudents}
                      onChange={(e) =>
                        setReplaceExistingStudents(e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      Kosongkan data siswa lama sebelum mengimpor daftar baru ini
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isUploadingStudentsCsv}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploadingStudentsCsv
                      ? 'Mengimpor & Membuat Token...'
                      : 'Proses Upload Massal Siswa'}
                  </button>
                </form>
              )}

              {studentFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-start gap-2 ${
                    studentFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{studentFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Tabel Database Siswa (Dengan Filter 3 Tingkatan, Kelas & Manajemen Status) */}
            <div className="lg:col-span-7 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Daftar Peserta &amp; Kode Paket Terkunci
                  </div>
                  <h2 className="text-base font-extrabold text-white mt-0.5">
                    Database Siswa ({filteredStudents.length} Peserta)
                  </h2>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200">
                  {uniqueClasses.length} Kelas / Rombel
                </span>
              </div>

              <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-slate-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2.5">
                {/* Filter 3 Tingkatan */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-white rounded-lg border border-indigo-200 shadow-2xs">
                  {(
                    [
                      ['SEMUA', 'Semua'],
                      ['10', 'Kelas X'],
                      ['11', 'Kelas XI'],
                      ['12', 'Kelas XII'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setFilterStudentTingkat(val);
                        setFilterKelas('SEMUA');
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filterStudentTingkat === val
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {uniqueClasses.length > 0 && (
                    <select
                      aria-label="Filter Rombel Siswa"
                      value={filterKelas}
                      onChange={(e) => setFilterKelas(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg text-slate-800"
                    >
                      <option value="SEMUA">Semua Rombel</option>
                      {uniqueClasses.map((kls) => (
                        <option key={kls} value={kls}>
                          {kls}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    disabled={isDistributingPackages || filteredStudents.length === 0}
                    onClick={() =>
                      handleBatchDistributePackages(
                        filterKelas !== 'SEMUA' ? filterKelas : undefined
                      )
                    }
                    title="Bagi varian paket berselang-seling (Paket A, Paket B) agar teman sekelas/sebangku mendapat paket berbeda"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-100/80 hover:bg-indigo-200/80 border border-indigo-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>
                      {isDistributingPackages
                        ? 'Membagi Paket...'
                        : 'Bagi Multi-Paket (A/B)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="p-6">
              {filteredStudents.length === 0 ? (
                <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm font-semibold text-slate-700">
                    Belum Ada Data Siswa pada Filter Ini
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Gunakan fitur <strong>Input Siswa Satuan</strong> atau{' '}
                    <strong>Upload Massal Siswa (Excel / CSV)</strong> di panel
                    kiri untuk mengisi daftar siswa Kelas X, XI, dan XII.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-3.5">Nama Siswa</th>
                        <th className="py-3 px-3.5">Kelas · Tingkat</th>
                        <th className="py-3 px-3.5">Token</th>
                        <th className="py-3 px-3.5">Kode Soal / Paket</th>
                        <th className="py-3 px-3.5">Manajemen Status Ujian</th>
                        <th className="py-3 px-3.5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredStudents.map((st) => {
                        const tkt = extractTingkatFromKelas(st.kelas);
                        const isBlocked = st.status_ujian === 'Diblokir';
                        const isOngoing = st.status_ujian === 'Sedang Ujian';
                        const isFinished = st.status_ujian === 'Selesai';

                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-3.5 font-semibold text-slate-900">
                              <div>{st.nama}</div>
                              {st.nisn && (
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  NISN: {st.nisn}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">
                                {st.kelas}
                              </span>
                              {tkt !== 'LAINNYA' && (
                                <span className="text-slate-500">
                                  {' '}
                                  · Tingkat {tkt}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="flex flex-col gap-0.5">
                                <code className="font-mono font-bold text-sm text-blue-700">
                                  {st.token_ujian}
                                </code>
                                {st.password_login &&
                                  st.password_login.toUpperCase() !==
                                    st.token_ujian.toUpperCase() && (
                                    <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                                      Pass: {st.password_login}
                                    </span>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                                <span>{st.kode_soal || st.variasi_paket || 'PAKET-A'}</span>
                              </span>
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <select
                                  aria-label={`Ubah status ujian ${st.nama}`}
                                  value={st.status_ujian}
                                  onChange={(e) =>
                                    handleUpdateStudentStatus(
                                      st,
                                      e.target.value
                                    )
                                  }
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-md border cursor-pointer ${
                                    isBlocked
                                      ? 'bg-red-50 text-red-700 border-red-300'
                                      : isOngoing
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : isFinished
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                          : 'bg-slate-50 text-slate-700 border-slate-300'
                                  }`}
                                >
                                  <option value="Belum Mulai">
                                    Belum Mulai
                                  </option>
                                  <option value="Sedang Ujian">
                                    Sedang Ujian
                                  </option>
                                  <option value="Selesai">Selesai</option>
                                  <option value="Diblokir">Diblokir</option>
                                </select>

                                {isBlocked && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateStudentStatus(
                                        st,
                                        'Sedang Ujian'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer"
                                  >
                                    <Unlock className="w-3 h-3" />
                                    Buka Kunci
                                  </button>
                                )}

                                {isOngoing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateStudentStatus(st, 'Diblokir')
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded cursor-pointer"
                                  >
                                    <Ban className="w-3 h-3" />
                                    Blokir
                                  </button>
                                )}

                                {(isFinished || isOngoing) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateStudentStatus(
                                        st,
                                        'Belum Mulai'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadStudentTokenCardsPdf([st], {
                                      kelasLabel: `Kelas ${st.kelas} - ${st.nama}`,
                                      exams,
                                      results,
                                      includeSummaryPage: false,
                                    })
                                  }
                                  title={`Download Kartu Token & Nilai PDF untuk ${st.nama}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Kartu PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRegenerateToken(st.id, st.nama)
                                  }
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Token Baru
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStudentInputMode('manual');
                                    setEditingStudentId(st.id);
                                    setStudentNameInput(st.nama);
                                    setStudentClassInput(st.kelas);
                                    setStudentNisnInput(st.nisn || '');
                                  }}
                                  aria-label={`Edit siswa ${st.nama}`}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteStudent(st.id, st.nama)
                                  }
                                  aria-label={`Hapus siswa ${st.nama}`}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BANK SOAL (DAFTAR BANK SOAL -> KLIK BARU KELUAR SEMUA SOALNYA) */}
      {/* ===================================================================== */}
      {activeTab === 'soal' && (
        <div className="space-y-6">
          {/* Notifikasi Feedback Hapus / Kelola Bank Soal */}
          {bankSoalFeedback && (
            <div
              role="status"
              className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                bankSoalFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                {bankSoalFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{bankSoalFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setBankSoalFeedback(null)}
                className="text-xs font-semibold underline opacity-75 hover:opacity-100 cursor-pointer shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Modal / Panel Konfirmasi Hapus Bank Soal */}
          {bankSoalDeleteModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-hapus-bank-soal-title"
              className="bg-red-50/90 border-2 border-red-300 rounded-xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700">
                    <Trash2 className="w-4 h-4" />
                    Konfirmasi Hapus Bank Soal dari Sistem
                  </div>
                  <h3
                    id="modal-hapus-bank-soal-title"
                    className="text-base font-bold text-slate-900"
                  >
                    Hapus Bank Soal: &ldquo;{bankSoalDeleteModal.title}&rdquo; ({bankSoalDeleteModal.questionCount} Butir Soal)
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
                    Pilih tindakan penghapusan yang Anda inginkan: Anda dapat{' '}
                    <strong>mengosongkan seluruh butir soalnya saja</strong>{' '}
                    (agar nama paket ujian tetap ada dan bisa diupload soal baru), atau{' '}
                    <strong>menghapus permanen Bank Soal beserta Paket Ujiannya</strong>{' '}
                    dari sistem.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDeletingBankSoal}
                  onClick={() => setBankSoalDeleteModal(null)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md cursor-pointer"
                >
                  Batal
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {bankSoalDeleteModal.questionCount > 0 && (
                  <button
                    type="button"
                    disabled={isDeletingBankSoal}
                    onClick={() =>
                      handleClearBankSoalOnly(
                        bankSoalDeleteModal.examId,
                        bankSoalDeleteModal.title
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {isDeletingBankSoal
                      ? 'Memproses...'
                      : `Kosongkan Isi Soal Saja (${bankSoalDeleteModal.questionCount} Soal)`}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isDeletingBankSoal}
                  onClick={() =>
                    handleDeleteFullBankSoal(
                      bankSoalDeleteModal.examId,
                      bankSoalDeleteModal.title
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeletingBankSoal
                    ? 'Menghapus Bank Soal...'
                    : 'Hapus Permanen Bank Soal & Paket Ujian'}
                </button>

                <button
                  type="button"
                  disabled={isDeletingBankSoal}
                  onClick={() => setBankSoalDeleteModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {!isBankSoalDetailOpen && exams.length > 0 ? (
            <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Repositori Instrumen Ujian Sosiologi
                  </div>
                  <h2 className="text-lg font-extrabold text-white mt-0.5">
                    Daftar Bank Soal Ujian ({exams.length} Paket Bank Soal · Total {questions.length} Butir Soal)
                  </h2>
                  <p className="text-xs text-blue-200/90 mt-0.5">
                    Pilih atau klik salah satu <strong className="text-amber-300">Bank Soal</strong> di bawah ini untuk melihat seluruh daftar butir soal, kunci jawaban, menambah/upload soal, atau menghapus bank soal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('ujian')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Buat Paket Bank Soal Baru
                </button>
              </div>

              <div className="p-6">
              <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                      <th className="py-3.5 px-4">Nama Bank Soal / Paket Ujian</th>
                      <th className="py-3.5 px-4">Target Distribusi Kelas</th>
                      <th className="py-3.5 px-4 text-right">Durasi</th>
                      <th className="py-3.5 px-4 text-right">Jumlah Butir Soal</th>
                      <th className="py-3.5 px-4">Komposisi Tipe &amp; Kognitif</th>
                      <th className="py-3.5 px-4 text-right">Aksi &amp; Hapus Bank Soal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {exams.map((ex) => {
                      const exQuestions = questions.filter(
                        (q) => Number(q.exam_id) === Number(ex.id)
                      );
                      const pgKompleksCount = exQuestions.filter(
                        (q) => q.tipe_soal === 'Kompleks'
                      ).length;
                      const pgBiasaCount = exQuestions.length - pgKompleksCount;
                      const hotsCount = exQuestions.filter(
                        (q) => classifyQuestionCognitiveLevel(q) === 'HOTS'
                      ).length;
                      const lotsCount = exQuestions.length - hotsCount;

                      return (
                        <tr
                          key={ex.id}
                          onClick={() => {
                            setSelectedExamId(ex.id);
                            setShowUploadPanel(exQuestions.length === 0);
                            setIsBankSoalDetailOpen(true);
                          }}
                          className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                        >
                          <td className="py-4 px-4">
                            <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {ex.judul_ujian}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Klik untuk membuka daftar seluruh soal pada bank soal ini
                            </div>
                          </td>
                          <td className="py-4 px-4 text-xs font-medium text-blue-700">
                            {formatDistribusiLabel(
                              ex.target_tingkat,
                              ex.target_kelas
                            )}
                          </td>
                          <td className="py-4 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                            {ex.durasi_menit} Menit
                          </td>
                          <td className="py-4 px-4 text-right">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tabular-nums bg-blue-50 text-blue-800 border border-blue-200">
                              {exQuestions.length} Soal
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                PG Biasa: {pgBiasaCount}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium">
                                PG Kompleks: {pgKompleksCount}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium">
                                LOTS: {lotsCount} · HOTS: {hotsCount}
                              </span>
                            </div>
                          </td>
                          <td
                            className="py-4 px-4 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedExamId(ex.id);
                                  setShowUploadPanel(exQuestions.length === 0);
                                  setIsBankSoalDetailOpen(true);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Buka Bank Soal ({exQuestions.length} Soal)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setBankSoalDeleteModal({
                                    examId: ex.id,
                                    title: ex.judul_ujian,
                                    questionCount: exQuestions.length,
                                  })
                                }
                                aria-label={`Hapus Bank Soal ${ex.judul_ujian}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus Bank Soal
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {exams.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsBankSoalDetailOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      ← Kembali ke Daftar Bank Soal
                    </button>
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Bank Soal: {currentExam?.judul_ujian || 'Paket Ujian'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Menampilkan {currentExamQuestions.length} butir soal pada paket bank soal ini
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUploadPanel((prev) => !prev)}
                      aria-label={
                        showUploadPanel
                          ? 'Sembunyikan Panel Upload (Mode Layar Penuh)'
                          : 'Buka Panel Upload / Tambah Soal'
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-xs cursor-pointer ${
                        showUploadPanel
                          ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                          : 'text-white bg-blue-600 hover:bg-blue-700 border-blue-600'
                      }`}
                    >
                      {showUploadPanel ? (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Layar Penuh (Sembunyikan Upload)</span>
                        </>
                      ) : (
                        <>
                          <PanelLeftOpen className="w-3.5 h-3.5" />
                          <span>+ Buka Panel Upload / Form Soal</span>
                        </>
                      )}
                    </button>
                    <label
                      htmlFor="quick-switch-bank-soal"
                      className="text-xs font-medium text-slate-600"
                    >
                      Ganti Bank Soal:
                    </label>
                    <select
                      id="quick-switch-bank-soal"
                      value={currentExam?.id || ''}
                      onChange={(e) => setSelectedExamId(Number(e.target.value))}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                    >
                      {exams.map((ex) => {
                        const cnt = questions.filter(
                          (q) => Number(q.exam_id) === Number(ex.id)
                        ).length;
                        return (
                          <option key={ex.id} value={ex.id}>
                            {ex.judul_ujian} ({cnt} Soal)
                          </option>
                        );
                      })}
                    </select>
                    {currentExam && (
                      <button
                        type="button"
                        onClick={() =>
                          setBankSoalDeleteModal({
                            examId: currentExam.id,
                            title: currentExam.judul_ujian,
                            questionCount: currentExamQuestions.length,
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus Bank Soal Ini
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 5 Cols: Input Soal Manual atau Upload Excel/CSV */}
                {showUploadPanel && (
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Upload className="w-4 h-4 text-blue-600" />
                        <span>Form Input & Upload Soal</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowUploadPanel(false)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                        title="Sembunyikan panel upload untuk memperluas tinjauan soal"
                      >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                        <span>Sembunyikan</span>
                      </button>
                    </div>
            <div>
              <label
                htmlFor="select-active-exam-soal"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pilih Paket Ujian & Target Tingkatan Kelas
              </label>
              {exams.length === 0 ? (
                <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 space-y-2.5">
                  <div className="text-xs font-semibold text-blue-900">
                    Paket Ujian Otomatis (Langsung Buat & Upload Soal)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="quick-exam-title"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Nama Paket Ujian
                      </label>
                      <input
                        id="quick-exam-title"
                        type="text"
                        value={quickExamTitle}
                        onChange={(e) => setQuickExamTitle(e.target.value)}
                        placeholder="Ujian CBT Sosiologi"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="quick-exam-tingkat"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        Target Tingkatan
                      </label>
                      <select
                        id="quick-exam-tingkat"
                        value={quickExamTingkat}
                        onChange={(e) => setQuickExamTingkat(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        <option value="SEMUA">Semua Kelas (X, XI, XII)</option>
                        <option value="10">Tingkat 1 — Kelas X</option>
                        <option value="11">Tingkat 2 — Kelas XI</option>
                        <option value="12">Tingkat 3 — Kelas XII</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <select
                  id="select-active-exam-soal"
                  value={currentExam?.id || ''}
                  onChange={(e) => setSelectedExamId(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.judul_ujian} —{' '}
                      {formatDistribusiLabel(
                        ex.target_tingkat,
                        ex.target_kelas
                      )}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Switcher: Tambah Manual vs Upload Excel/CSV */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setQuestionInputMode('manual')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  questionInputMode === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Input Soal Manual
              </button>
              <button
                type="button"
                onClick={() => setQuestionInputMode('csv')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  questionInputMode === 'csv'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Upload Massal Excel / CSV
              </button>
            </div>

            {/* Info Card Logika Penilaian CBT */}
            <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-blue-900">
                Logika Penilaian Soal CBT (Otomatis & Konsisten):
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>
                  <strong>PG Biasa (1 Jawaban Benar):</strong> Benar ={' '}
                  <strong>2 Poin</strong>, Salah = 0 Poin.
                </li>
                <li>
                  <strong>PG Kompleks (&gt;1 Jawaban Benar):</strong> Benar Semua
                  = <strong>3 Poin</strong>, Benar Sebagian ={' '}
                  <strong>1–2 Poin</strong>, Salah = 0 Poin.
                </li>
              </ul>
            </div>

            {questionInputMode === 'manual' ? (
              <form
                key="question-form-manual"
                onSubmit={handleAddManualQuestion}
                className="space-y-3.5"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="manual-tipe-soal"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Tipe Soal
                    </label>
                    <select
                      id="manual-tipe-soal"
                      value={manualTipe}
                      onChange={(e) => {
                        const val = e.target.value as 'PG' | 'Kompleks';
                        setManualTipe(val);
                        setManualBobot(val === 'Kompleks' ? '3' : '2');
                        setManualKunci(['A']);
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="PG">Pilihan Ganda Biasa (Radio)</option>
                      <option value="Kompleks">
                        PG Kompleks (Checkbox &gt;1)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="manual-bobot-soal"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Bobot Poin
                    </label>
                    <input
                      id="manual-bobot-soal"
                      type="number"
                      min={1}
                      value={manualBobot}
                      onChange={(e) => setManualBobot(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="manual-wacana"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Wacana / Stimulus (Opsional)
                  </label>
                  <textarea
                    id="manual-wacana"
                    rows={2}
                    value={manualWacana}
                    onChange={(e) => setManualWacana(e.target.value)}
                    placeholder="Teks bacaan pengantar soal..."
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label
                    htmlFor="manual-teks-soal"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Pertanyaan / Teks Soal
                  </label>
                  <textarea
                    id="manual-teks-soal"
                    rows={2}
                    value={manualTeksSoal}
                    onChange={(e) => setManualTeksSoal(e.target.value)}
                    placeholder="Tuliskan pertanyaan soal..."
                    className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-700">
                    Opsi Jawaban (A – E)
                  </span>
                  {(
                    [
                      ['A', manualOpsiA, setManualOpsiA],
                      ['B', manualOpsiB, setManualOpsiB],
                      ['C', manualOpsiC, setManualOpsiC],
                      ['D', manualOpsiD, setManualOpsiD],
                      ['E', manualOpsiE, setManualOpsiE],
                    ] as const
                  ).map(([letter, val, setter]) => (
                    <div key={letter} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-700 w-5">
                        {letter}.
                      </span>
                      <input
                        type="text"
                        aria-label={`Opsi ${letter}`}
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={`Teks opsi ${letter}`}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Kunci Jawaban Benar (
                    {manualTipe === 'Kompleks'
                      ? 'Bisa pilih lebih dari 1'
                      : 'Pilih 1 kunci'}
                    )
                  </span>
                  <div className="flex items-center gap-2">
                    {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                      const active = manualKunci.includes(letter);
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => handleToggleManualKunci(letter)}
                          className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md border transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSavingQuestion}
                    className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingQuestion
                      ? 'Menyimpan Soal...'
                      : editingQuestionId
                        ? 'Simpan Perubahan Soal'
                        : 'Simpan Butir Soal'}
                  </button>
                  {editingQuestionId && (
                    <button
                      type="button"
                      onClick={handleCancelEditQuestion}
                      className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Batal Edit
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form
                key="question-form-csv"
                onSubmit={handleUploadCsvSubmit}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-700">
                    Unduh Template Soal (11 Kolom Terpisah Rapi di Excel)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadQuestionTemplateExcel}
                      className="py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template Soal (.xls)
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleCsv}
                      className="py-2 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Template CSV (Kolom Terpisah)
                    </button>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                  <div className="font-sans font-semibold text-slate-800">
                    Format Fleksibel (Otomatis Deteksi `;`, `,`, atau Tab):
                  </div>
                  <div>
                    id_soal ; jenis_soal ; wacana ; teks_soal ; opsi_a ; opsi_b
                    ; opsi_c ; opsi_d ; opsi_e ; kunci_jawaban ; bobot
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <label
                    htmlFor="csv-file-upload"
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Pilih File Soal: Excel (.xlsx, .xls), Word (.docx, .doc), CSV, atau TXT
                  </label>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {'Langsung upload otomatis saat file dipilih! Mendukung tabel Excel/Word, soal bernomor di Word/TXT, tabel stimulus/wacana, serta lambang matematika (LaTeX $...$, $\\sqrt{x}$, $\\frac{a}{b}$, $\\pm$, $\\pi$, dsb).'}
                  </p>
                  <input
                    id="csv-file-upload"
                    type="file"
                    accept=".xlsx,.xls,.docx,.doc,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="csv-raw-textarea"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Atau Tempelkan / Edit Konten CSV Soal
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvText(SAMPLE_CSV_TEMPLATE);
                        setUploadStatus(null);
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 underline cursor-pointer"
                    >
                      Isi Contoh Soal CSV
                    </button>
                  </div>
                  <textarea
                    id="csv-raw-textarea"
                    rows={5}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Tempelkan isi tabel Excel/CSV atau pilih file di atas untuk langsung mengupload..."
                    className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {csvText.trim().length > 0 && (() => {
                  const livePreview = parseQuestionsCsv(csvText);
                  return (
                    <div
                      className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                        livePreview.rows.length > 0
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="font-bold">
                        {livePreview.rows.length > 0
                          ? `Terdeteksi ${livePreview.rows.length} butir soal siap diupload`
                          : 'Format CSV belum terbaca sebagai butir soal'}
                      </div>
                      {livePreview.rows.slice(0, 3).map((r, i) => (
                        <div key={i} className="text-[11px] truncate">
                          #{i + 1} [{r.jenis_soal} · Kunci:{' '}
                          {r.kunci_jawaban.join(',')} · {r.bobot} Poin]{' '}
                          {r.teks_soal}
                        </div>
                      ))}
                      {livePreview.errors.length > 0 && (
                        <div className="text-[11px] text-red-700 font-medium">
                          Catatan: {livePreview.errors[0]}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExistingQuestions}
                    onChange={(e) =>
                      setReplaceExistingQuestions(e.target.checked)
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>
                    Hapus soal lama pada paket ujian ini sebelum impor
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isUploadingCsv}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingCsv
                    ? 'Memproses & Mengupload Soal...'
                    : 'Proses & Upload Soal ke Paket Ujian'}
                </button>
              </form>
            )}

              {uploadStatus && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-start gap-2 ${
                    uploadStatus.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadStatus.message}</span>
                </div>
              )}
            </div>
          )}

          {/* Right Column: Manajemen & Tinjauan Soal pada Ujian Terpilih */}
          <div
            className={`${
              showUploadPanel ? 'lg:col-span-7' : 'lg:col-span-12'
            } bg-white border border-slate-200 rounded-xl p-6 space-y-4 transition-all duration-200`}
          >
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 -mx-6 -mt-6 px-6 py-4 text-white rounded-t-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-extrabold text-white">
                      Manajemen &amp; Tinjauan Soal:{' '}
                      {currentExam ? currentExam.judul_ujian : 'Belum Ada Ujian'} (
                      {currentExamQuestions.length} Butir)
                    </h2>
                    {!showUploadPanel && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold text-amber-950 bg-amber-300 rounded-full">
                        <Maximize2 className="w-3 h-3" />
                        Mode Tinjau Layar Penuh (12 Kolom)
                      </span>
                    )}
                  </div>
                  {currentExam && (
                    <p className="text-xs text-blue-200 font-medium mt-0.5">
                      Distribusi:{' '}
                      {formatDistribusiLabel(
                        currentExam.target_tingkat,
                        currentExam.target_kelas
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/15">
                <button
                  type="button"
                  onClick={() => setShowUploadPanel((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                    showUploadPanel
                      ? 'text-white bg-white/15 hover:bg-white/25 border-white/25'
                      : 'text-slate-950 bg-amber-400 hover:bg-amber-300 border-amber-300'
                  }`}
                >
                  {showUploadPanel ? (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Sembunyikan Panel Upload</span>
                    </>
                  ) : (
                    <>
                      <PanelLeftOpen className="w-3.5 h-3.5" />
                      <span>+ Buka Panel Upload / Form Soal</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleExportQuestionsExcel(false)}
                  disabled={questions.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Soal Paket (.xls)
                </button>
                <button
                  type="button"
                  onClick={handleExportQuestionsCsv}
                  disabled={questions.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV (.csv)
                </button>
                {exams.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleExportQuestionsExcel(true)}
                    disabled={questions.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Semua Paket (.xls)
                  </button>
                )}
              </div>
            </div>

            {/* Toolbar Filter, Pencarian, Salin Antar Paket & Kosongkan Soal */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <input
                  type="text"
                  aria-label="Cari butir soal"
                  value={searchQuestionQuery}
                  onChange={(e) => setSearchQuestionQuery(e.target.value)}
                  placeholder="Cari kata kunci soal / wacana..."
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md flex-1 min-w-[160px]"
                />
                <select
                  aria-label="Filter Tipe Soal"
                  value={filterQuestionType}
                  onChange={(e) =>
                    setFilterQuestionType(
                      e.target.value as 'SEMUA' | 'PG' | 'Kompleks'
                    )
                  }
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value="SEMUA">Semua Tipe Soal</option>
                  <option value="PG">PG Biasa (2 Poin)</option>
                  <option value="Kompleks">PG Kompleks (3 Poin)</option>
                </select>
              </div>

              {currentExamQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearExamQuestions}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Kosongkan Paket Ini
                </button>
              )}
            </div>

            {/* Fitur Salin Soal ke Paket Ujian Kelas Lain */}
            {exams.length > 1 && currentExamQuestions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs">
                <span className="font-semibold text-slate-800">
                  Salin {currentExamQuestions.length} Soal ke Paket Ujian Kelas Lain:
                </span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Pilih Paket Ujian Tujuan Salin"
                    value={copyTargetExamId || ''}
                    onChange={(e) =>
                      setCopyTargetExamId(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">-- Pilih Paket Tujuan --</option>
                    {exams
                      .filter((ex) => ex.id !== currentExam?.id)
                      .map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.judul_ujian} ({ex.target_tingkat})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!copyTargetExamId || isCopyingQuestions}
                    onClick={handleCopyQuestionsToExam}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md cursor-pointer"
                  >
                    {isCopyingQuestions ? 'Menyalin...' : 'Salin Soal'}
                  </button>
                </div>
              </div>
            )}

            {filteredExamQuestions.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-semibold text-slate-700">
                  Belum Ada Butir Soal pada Paket / Filter Ini
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {showUploadPanel
                    ? 'Tambahkan soal secara manual atau gunakan fitur Upload Massal Excel/CSV di panel sebelah kiri.'
                    : 'Buka panel upload atau tambahkan soal secara manual untuk mengisi paket ujian ini.'}
                </p>
                {!showUploadPanel && (
                  <button
                    type="button"
                    onClick={() => setShowUploadPanel(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer mt-2"
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5" />
                    Buka Panel Upload / Tambah Soal
                  </button>
                )}
              </div>
            ) : (
              <div
                className={`space-y-4 pr-1 ${
                  showUploadPanel ? 'max-h-[580px] overflow-y-auto' : 'overflow-visible'
                }`}
              >
                {filteredExamQuestions.map((q, idx) => {
                  const cogLevel = classifyQuestionCognitiveLevel(q);
                  return (
                    <div
                      key={q.id}
                      className={`p-5 border rounded-xl space-y-3 transition-shadow ${
                        editingQuestionId === q.id
                          ? 'border-blue-600 bg-blue-50/30 ring-1 ring-blue-600 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pb-2 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                            Soal #{idx + 1}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                              cogLevel === 'HOTS'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {cogLevel} (
                            {cogLevel === 'HOTS' ? 'C4–C6 / Analitis' : 'C1–C3 / Dasar'}
                            )
                          </span>
                          <span className="text-slate-600 font-medium">
                            {q.tipe_soal === 'Kompleks'
                              ? 'PG Kompleks (Maks 3 Poin)'
                              : 'PG Biasa (2 Poin)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                            Kunci:{' '}
                            <strong className="text-emerald-700 font-bold">
                              {q.kunci_jawaban.join(', ')}
                            </strong>{' '}
                            · Bobot: {q.bobot} Poin
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartEditQuestion(q)}
                            aria-label={`Edit soal nomor ${idx + 1}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            aria-label={`Hapus soal nomor ${idx + 1}`}
                            className="text-slate-400 hover:text-red-600 cursor-pointer p-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {q.data_opsi?.wacana && (
                        <div className="text-xs text-slate-700 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200">
                          <div className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                            <Layers className="w-3.5 h-3.5 text-blue-600" />
                            Stimulus / Wacana / Narasi Soal:
                          </div>
                          <div className="prose prose-xs max-w-none">
                            <MathAndTableRenderer content={q.data_opsi.wacana} />
                          </div>
                        </div>
                      )}

                      <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                        <MathAndTableRenderer content={q.teks_soal} />
                      </div>

                      <div
                        className={`grid gap-2 text-xs pt-1.5 ${
                          showUploadPanel
                            ? 'grid-cols-1 sm:grid-cols-2'
                            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                        }`}
                      >
                        {(['A', 'B', 'C', 'D', 'E'] as const).map((k) =>
                          q.data_opsi?.opsi?.[k] ? (
                            <div
                              key={k}
                              className={`p-2.5 rounded-lg border text-xs break-words flex items-start gap-2 ${
                                q.kunci_jawaban.includes(k)
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <span
                                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold font-mono shrink-0 mt-0.5 ${
                                  q.kunci_jawaban.includes(k)
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {k}
                              </span>
                              <div className="flex-1 overflow-x-auto min-w-0">
                                <MathAndTableRenderer
                                  content={q.data_opsi?.opsi?.[k] || ''}
                                  inline
                                />
                              </div>
                              {q.kunci_jawaban.includes(k) && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                                  Kunci
                                </span>
                              )}
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: ANALISIS & DOWNLOAD HASIL UJIAN SISWA PER KELAS DAN SEMUANYA    */}
      {/* ===================================================================== */}
      {activeTab === 'laporan' && (
        <div className="space-y-6">
          {/* Panel Rekapitulasi Analisis & Download Per Kelas dan Semua Kelas */}
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-5 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Pusat Pelaporan &amp; Evaluasi Akademik
              </div>
              <h2 className="text-lg font-extrabold text-white mt-0.5">
                Analisis Statistik &amp; Download Hasil Ujian Siswa Per Kelas &amp; Semuanya
              </h2>
              <p className="text-xs text-blue-200/90 mt-1 max-w-4xl leading-relaxed">
                Lihat analisis capaian nilai rata-rata, ketuntasan, sebaran
                predikat (A/B/C/D), serta unduh laporan hasil ujian siswa baik{' '}
                <strong className="text-amber-300">per kelas (rombel)</strong> maupun{' '}
                <strong className="text-amber-300">semua kelas sekaligus</strong> dalam format PDF, Excel
                (.xls) &amp; CSV.
              </p>
            </div>

            {/* Dedicated Full-Width Export & Action Bar */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 border-b border-indigo-100 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadStudentTokenCardsPdf(students, {
                    kelasLabel: 'Semua Kelas',
                    exams,
                    results,
                    includeSummaryPage: true,
                  })
                }
                disabled={students.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 rounded-lg transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Rekap &amp; Kartu Nilai (.PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportResultsExcel('all')}
                disabled={students.length === 0 && results.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Semua Hasil Ujian (.xls)
              </button>
              <button
                type="button"
                onClick={() => handleExportResultsCsv('all')}
                disabled={students.length === 0 && results.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Semua Hasil (.csv)
              </button>
              <button
                type="button"
                onClick={handleExportClassSummaryExcel}
                disabled={
                  students.length === 0 && results.length === 0
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Rekap Analisis Kelas (.xls)
              </button>
              <button
                type="button"
                onClick={handleRecalculateAllScores}
                disabled={isRecalculatingScores || results.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-800 bg-indigo-100/80 hover:bg-indigo-200/80 border border-indigo-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isRecalculatingScores ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {isRecalculatingScores
                    ? 'Menyinkronkan Nilai...'
                    : 'Sinkronkan Nilai Formula Humanis'}
                </span>
              </button>
            </div>

            <div className="p-6 space-y-5">

            {/* Info Banner Formula Penilaian Humanis & Anti-Ngarang */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50/90 via-blue-50/80 to-emerald-50/80 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white">
                    Formula Penilaian Humanis &amp; Adil Aktif
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    Apresiasi Poin Parsial PG Kompleks &amp; Proteksi Anti-Menebak
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Setiap jawaban benar pada soal <strong>PG Kompleks (Multi-Jawaban)</strong> tetap mendapatkan poin proporsional meskipun terdapat sebagian opsi yang terlewat atau meleset wajar, namun tetap memberikan <strong>0 poin</strong> jika siswa mencentang semua opsi (asal tebak). Nilai peserta dari ujian hari sebelumnya otomatis diperbarui secara adil.
                </p>
              </div>
              {recalcFeedback && (
                <div className="px-3 py-1.5 rounded-lg bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-xs font-semibold shrink-0">
                  {recalcFeedback}
                </div>
              )}
            </div>

            {/* 4 Kartu Ringkasan Statistik Keseluruhan */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">
                  Rata-Rata Skor Nasional / Sekolah
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
                  {classAnalyticsData.overall.averageScore}
                  <span className="text-xs font-normal text-slate-500">
                    /100
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Tertinggi: {classAnalyticsData.overall.highestScore} · Terendah:{' '}
                  {classAnalyticsData.overall.lowestScore}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">
                  Tingkat Ketuntasan (&ge; 70)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {classAnalyticsData.overall.passRate}%
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {classAnalyticsData.overall.passCount} dari{' '}
                  {classAnalyticsData.overall.resultCount} peserta tuntas
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">
                  Sebaran Predikat Nilai (A / B / C / D)
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                  A: {classAnalyticsData.overall.gradeDistribution.A} · B:{' '}
                  {classAnalyticsData.overall.gradeDistribution.B} · C:{' '}
                  {classAnalyticsData.overall.gradeDistribution.C} · D:{' '}
                  {classAnalyticsData.overall.gradeDistribution.D}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  A (&ge;85), B (70-84), C (55-69), D (&lt;55)
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500">
                  Cakupan Evaluasi LOTS vs HOTS
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {classAnalyticsData.overall.analyzedCount}
                  <span className="text-xs font-normal text-slate-500">
                    /{classAnalyticsData.overall.resultCount} hasil
                  </span>
                </div>
                <div className="mt-1">
                  <button
                    type="button"
                    disabled={
                      results.length === 0 || isAnalyzingBatchClass
                    }
                    onClick={() => handleBatchAiAnalysisForList(results)}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 underline disabled:opacity-50 cursor-pointer"
                  >
                    {isAnalyzingBatchClass
                      ? 'Sedang Menyusun Evaluasi...'
                      : 'Evaluasi Capaian Semua Peserta Sekaligus'}
                  </button>
                </div>
              </div>
            </div>

            {/* Visualisasi Recharts LOTS vs HOTS per Kelas */}
            <ClassPerformanceLotsHotsChart
              classAnalytics={classAnalyticsData}
              questions={questions}
              exams={exams}
              selectedClassFilter={filterResultKelas}
              onSelectClass={(kls) => {
                setFilterResultTingkat('SEMUA');
                setFilterResultKelas(kls);
              }}
            />

            {/* Tabel Rekapitulasi Analisis & Download Per Kelas */}
            {classAnalyticsData.perClass.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 px-4 py-2.5 rounded-xl border border-indigo-100">
                  <h3 className="text-sm font-extrabold text-indigo-950">
                    Tabel Analisis Capaian &amp; Download Hasil Ujian Per Kelas
                  </h3>
                  <span className="text-[11px] font-mono font-semibold text-indigo-700">
                    {classAnalyticsData.perClass.length} Kelas Terdaftar
                  </span>
                </div>
                <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                        <th className="py-3 px-3.5">Kelas / Rombel</th>
                        <th className="py-3 px-3.5 text-right">
                          Peserta Selesai
                        </th>
                        <th className="py-3 px-3.5 text-right">
                          Rata-Rata Skor
                        </th>
                        <th className="py-3 px-3.5 text-right">
                          LOTS vs HOTS
                        </th>
                        <th className="py-3 px-3.5 text-right">
                          Max / Min
                        </th>
                        <th className="py-3 px-3.5 text-right">
                          Ketuntasan
                        </th>
                        <th className="py-3 px-3.5">Sebaran A / B / C / D</th>
                        <th className="py-3 px-3.5 text-right">
                          Download &amp; Analisis Per Kelas
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {classAnalyticsData.perClass.map((cls) => {
                        const clsResults = results.filter((r) => {
                          const st = students.find(
                            (s) => s.id === r.student_id
                          );
                          return (
                            st &&
                            st.kelas.trim().toLowerCase() ===
                              cls.kelas.trim().toLowerCase()
                          );
                        });
                        return (
                          <tr
                            key={cls.kelas}
                            className="hover:bg-slate-50/80"
                          >
                            <td className="py-3 px-3.5 font-semibold text-slate-900">
                              {cls.kelas}{' '}
                              {cls.tingkat !== 'LAINNYA' && (
                                <span className="text-slate-500 font-normal">
                                  (Tingkat {cls.tingkat})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums">
                              <strong>{cls.resultCount}</strong> /{' '}
                              {cls.totalStudents} siswa
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-blue-700">
                              {cls.resultCount > 0 ? cls.averageScore : '-'}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-700">
                              {cls.resultCount > 0
                                ? `LOTS ${cls.lotsScore} · HOTS ${cls.hotsScore}`
                                : '-'}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-700">
                              {cls.resultCount > 0
                                ? `${cls.highestScore} / ${cls.lowestScore}`
                                : '-'}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                              {cls.resultCount > 0 ? `${cls.passRate}%` : '-'}
                            </td>
                            <td className="py-3 px-3.5 font-mono text-slate-600">
                              A:{cls.gradeDistribution.A} · B:
                              {cls.gradeDistribution.B} · C:
                              {cls.gradeDistribution.C} · D:
                              {cls.gradeDistribution.D}
                            </td>
                            <td className="py-3 px-3.5 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterResultTingkat('SEMUA');
                                    setFilterResultKelas(cls.kelas);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                >
                                  Lihat Kelas
                                </button>
                                <button
                                  type="button"
                                  disabled={cls.totalStudents === 0}
                                  onClick={() => {
                                    const clsStudents = students.filter(
                                      (s) =>
                                        s.kelas.trim().toLowerCase() ===
                                        cls.kelas.trim().toLowerCase()
                                    );
                                    downloadStudentTokenCardsPdf(clsStudents, {
                                      kelasLabel: `Kelas ${cls.kelas}`,
                                      exams,
                                      results,
                                      includeSummaryPage: true,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  Kartu &amp; Nilai (.PDF)
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    cls.totalStudents === 0 &&
                                    clsResults.length === 0
                                  }
                                  onClick={() =>
                                    handleExportResultsExcel({
                                      kelas: cls.kelas,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  Excel Kelas (.xls)
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    cls.totalStudents === 0 &&
                                    clsResults.length === 0
                                  }
                                  onClick={() =>
                                    handleExportResultsCsv({
                                      kelas: cls.kelas,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-40 rounded cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  CSV Kelas
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    clsResults.length === 0 ||
                                    isAnalyzingBatchClass
                                  }
                                  onClick={() =>
                                    handleBatchAiAnalysisForList(clsResults)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-blue-100/80 hover:bg-blue-200 disabled:opacity-40 rounded cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  Evaluasi Kelas
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Tabel Detail Hasil Ujian Siswa (Dengan Filter Per Kelas, Tingkatan & Paket Ujian) */}
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            {/* Full-Width Colorful Institutional Header Banner (Never Squished) */}
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Daftar Nilai, Pembahasan Soal &amp; Evaluasi Kognitif Siswa
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                    Daftar Nilai &amp; Evaluasi Capaian Peserta (
                    {filterResultKelas === 'SEMUA'
                      ? 'Semua Kelas'
                      : `Kelas ${filterResultKelas}`}{' '}
                    — {filteredResults.length} Peserta)
                  </h2>
                  <p className="text-xs text-blue-200/90 mt-0.5">
                    Pilih filter Kelas/Rombel di bawah untuk melihat nilai akhir, mengunduh PDF Nilai lengkap beserta rincian soal &amp; jawaban siswa, atau mengunduh Excel kelas.
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200 shrink-0">
                  {filteredResults.length} Hasil Ujian
                </span>
              </div>
            </div>

            {/* Dedicated Full-Width Filter & Action Bar */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Filter 3 Tingkatan */}
                <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-indigo-200 shadow-2xs">
                  {(
                    [
                      ['SEMUA', 'Semua'],
                      ['10', 'Kelas X'],
                      ['11', 'Kelas XI'],
                      ['12', 'Kelas XII'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setFilterResultTingkat(val);
                        setFilterResultKelas('SEMUA');
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filterResultTingkat === val
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Dropdown Filter Kelas Spesifik */}
                <select
                  aria-label="Filter Hasil Per Kelas"
                  value={filterResultKelas}
                  onChange={(e) => setFilterResultKelas(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-semibold text-slate-800"
                >
                  <option value="SEMUA">Semua Kelas / Rombel</option>
                  {uniqueClasses.map((kls) => (
                    <option key={kls} value={kls}>
                      Kelas {kls}
                    </option>
                  ))}
                </select>

                {/* Dropdown Filter Paket Ujian */}
                {exams.length > 0 && (
                  <select
                    aria-label="Filter Hasil Per Paket Ujian"
                    value={filterResultExamId}
                    onChange={(e) => setFilterResultExamId(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-medium text-slate-800"
                  >
                    <option value="SEMUA">Semua Paket Ujian</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={String(ex.id)}>
                        {ex.judul_ujian}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportResultsExcel('filtered')}
                  disabled={students.length === 0 && filteredResults.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  {filterResultKelas !== 'SEMUA'
                    ? `Download Kelas ${filterResultKelas} (.xls)`
                    : 'Download Filter Ini (.xls)'}
                </button>

                <button
                  type="button"
                  onClick={onRefreshData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Muat Ulang
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
            {aiErrorBanner && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{aiErrorBanner}</span>
              </div>
            )}

            {filteredResults.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-semibold text-slate-700">
                  Belum Ada Hasil Ujian pada Kelas / Filter Ini
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Hasil nilai dan analisis AI akan otomatis tercatat di sini
                  setelah siswa login menggunakan Token Ujian dan mengumpulkan
                  jawaban.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                      <th className="py-3 px-4">Nama Siswa</th>
                      <th className="py-3 px-4">Kelas · Token</th>
                      <th className="py-3 px-4">Paket Ujian</th>
                      <th className="py-3 px-4 text-right">Skor Akhir</th>
                      <th className="py-3 px-4">Log Anti-Cheat</th>
                      <th className="py-3 px-4">Status Evaluasi</th>
                      <th className="py-3 px-4 text-right">Aksi Evaluasi Kognitif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredResults.map((resItem) => {
                      const st = students.find(
                        (s) => s.id === resItem.student_id
                      );
                      const ex = exams.find((e) => e.id === resItem.exam_id);
                      const isBusy = analyzingResultId === resItem.id;
                      const hasAi = Boolean(resItem.analisis_ai);

                      return (
                        <tr
                          key={resItem.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {st?.nama || `Siswa #${resItem.student_id}`}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            <span className="font-semibold text-slate-800">
                              {st?.kelas || '-'}
                            </span>
                            <span className="mx-1.5">·</span>
                            <code className="font-mono font-bold text-blue-700">
                              {st?.token_ujian || '-'}
                            </code>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            {ex?.judul_ujian || `Ujian #${resItem.exam_id}`}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                            {resItem.skor_angka}
                            <span className="text-xs font-normal text-slate-400">
                              /100
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono tabular-nums">
                            {resItem.pelanggaran_tab > 0 ? (
                              <span className="text-amber-700 font-semibold">
                                {resItem.pelanggaran_tab}x Pindah Tab
                              </span>
                            ) : (
                              <span className="text-emerald-700">
                                0 Pelanggaran
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            {hasAi ? (
                              <span className="text-emerald-700 font-medium">
                                Tersedia · {resItem.analisis_ai?.kategori_nilai}
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                Belum Dievaluasi
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              {st && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    let examQuestionsForPdf = questions.filter(
                                      (q) => Number(q.exam_id) === Number(resItem.exam_id)
                                    );
                                    if (
                                      examQuestionsForPdf.length === 0 &&
                                      resItem.jawaban_siswa
                                    ) {
                                      const ansIds = new Set(
                                        Object.keys(resItem.jawaban_siswa)
                                      );
                                      const matchedQ = questions.find((q) =>
                                        ansIds.has(String(q.id))
                                      );
                                      if (matchedQ) {
                                        examQuestionsForPdf = questions.filter(
                                          (q) =>
                                            Number(q.exam_id) ===
                                            Number(matchedQ.exam_id)
                                        );
                                      }
                                    }
                                    const syncedAnswersForPdf =
                                      examQuestionsForPdf.length > 0
                                        ? resolveSyncedStudentAnswersForExam({
                                            questions: examQuestionsForPdf,
                                            jawabanSiswa: resItem.jawaban_siswa || {},
                                            student: st,
                                            exam: ex || null,
                                            recordedScore: resItem.skor_angka,
                                          })
                                        : resItem.jawaban_siswa || {};
                                    downloadSingleStudentResultPdf({
                                      student: st,
                                      exam: ex || null,
                                      score: resItem.skor_angka,
                                      kategori:
                                        resItem.analisis_ai?.kategori_nilai ||
                                        (resItem.skor_angka >= 85
                                          ? 'Sangat Baik (A)'
                                          : resItem.skor_angka >= 70
                                            ? 'Baik (B)'
                                            : resItem.skor_angka >= 55
                                              ? 'Cukup (C)'
                                              : 'Perlu Penguatan (D)'),
                                      answeredCount: Object.keys(syncedAnswersForPdf).filter(
                                        (k) => syncedAnswersForPdf[k]?.length > 0
                                      ).length,
                                      totalQuestions: examQuestionsForPdf.length,
                                      tabViolations: resItem.pelanggaran_tab,
                                      aiAnalysis: resItem.analisis_ai,
                                      questions: examQuestionsForPdf,
                                      studentAnswers: syncedAnswersForPdf,
                                      submittedAt: resItem.created_at
                                        ? new Date(
                                            resItem.created_at
                                          ).toLocaleDateString('id-ID', {
                                            day: '2-digit',
                                            month: 'long',
                                            year: 'numeric',
                                          })
                                        : undefined,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>PDF Nilai &amp; Soal</span>
                                </button>
                              )}
                              {hasAi && resItem.analisis_ai && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedAiModal({
                                      studentName: st?.nama || 'Siswa',
                                      studentClass: st?.kelas || '-',
                                      analysis: resItem.analisis_ai!,
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Lihat Evaluasi
                                </button>
                              )}
                              {resItem.skor_angka > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleGenerateAiAnalysis(resItem)
                                  }
                                  disabled={isBusy}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {isBusy
                                    ? 'Menyusun...'
                                    : hasAi
                                      ? 'Perbarui Evaluasi'
                                      : 'Proses Evaluasi'}
                                </button>
                              ) : (
                                <span className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap">
                                  Skor 0: Evaluasi Nonaktif
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: ANALISIS BUTIR SOAL (ANBUSO) & PEMETAAN REMEDIAL PERSONAL       */}
      {/* ===================================================================== */}
      {activeTab === 'anbuso' && (
        <AnBusoAnalysisTab
          exams={exams}
          questions={questions}
          students={students}
          results={results}
          teacherName={teacherProfile.name}
        />
      )}

      {/* Modal Detail Evaluasi Capaian Kognitif */}
      {selectedAiModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-semibold text-blue-700">
                  Laporan Evaluasi Kognitif Sosiologi · LOTS vs HOTS
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  {selectedAiModal.analysis.nama_siswa} (
                  {selectedAiModal.studentClass})
                </h3>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                  {selectedAiModal.analysis.skor_akhir}/100
                </div>
                <div className="text-xs text-slate-600">
                  {selectedAiModal.analysis.kategori_nilai}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500">
                  Evaluasi Penalaran HOTS (Higher Order Thinking Skills)
                </h4>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                  {selectedAiModal.analysis.evaluasi_hots}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <h5 className="text-xs font-bold text-emerald-700">
                    Kekuatan Kompetensi Siswa
                  </h5>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                    {selectedAiModal.analysis.analisis_kompetensi.kekuatan.map(
                      (k, idx) => (
                        <li key={idx}>{k}</li>
                      )
                    )}
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <h5 className="text-xs font-bold text-amber-700">
                    Kelemahan Kognitif Siswa
                  </h5>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                    {selectedAiModal.analysis.analisis_kompetensi.kelemahan.map(
                      (w, idx) => (
                        <li key={idx}>{w}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-200">
                <h5 className="text-xs font-bold text-blue-800">
                  3 Rekomendasi Belajar Terarah
                </h5>
                <ol className="mt-2 space-y-1.5 text-xs text-slate-800 list-decimal list-inside">
                  {selectedAiModal.analysis.rekomendasi_belajar.map(
                    (r, idx) => (
                      <li key={idx}>{r}</li>
                    )
                  )}
                </ol>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAiModal(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tutup Laporan Evaluasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
