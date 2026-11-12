import React, { useState, useMemo } from 'react';
import {
  Home,
  Calendar,
  Award,
  History,
  User,
  LogOut,
  Play,
  KeyRound,
  CheckCircle2,
  Clock,
  BookOpen,
  Download,
  Sparkles,
  AlertTriangle,
  Lock,
  Shuffle,
  ShieldCheck,
  Bell,
  Save,
  Eye,
  EyeOff,
  Check,
  FileText,
  Layers,
} from 'lucide-react';
import {
  ExamItem,
  QuestionItem,
  StudentItem,
  ResultItem,
  AnalisisAI,
} from '../types/cbt';
import {
  extractTingkatFromKelas,
  getEffectiveMataPelajaran,
  getStudentAbsenInfoInClass,
  isExamMatchedForStudentClass,
  resolveProportionalStudentExamPackage,
  resolveStudentExamPackagesBySubject,
  resolveSyncedStudentAnswersForExam,
  verifyExamSessionToken,
} from '../utils/cbtLogic';
import {
  updateStudentProfileAndPasswordCbt,
  generateAiAnalysisCbt,
} from '../lib/cbtFirestoreService';
import {
  downloadSingleStudentResultPdf,
  downloadStudentTokenCardsPdf,
} from '../utils/cbtPdfGenerator';

export type StudentDashboardMenu =
  | 'beranda'
  | 'jadwal'
  | 'hasil'
  | 'riwayat'
  | 'profil';

interface StudentAccountDashboardProps {
  student: StudentItem;
  allStudents: StudentItem[];
  exams: ExamItem[];
  questions: QuestionItem[];
  results: ResultItem[];
  initialMenu?: StudentDashboardMenu;
  hasSavedProgressForExam: (examId: number) => {
    hasProgress: boolean;
    answeredCount: number;
  };
  onStartExamWithSessionToken: (exam: ExamItem) => Promise<void>;
  onStudentUpdated: (updated: StudentItem) => void;
  onRefreshData: () => void;
  onLogout: () => void;
}

export const StudentAccountDashboard: React.FC<StudentAccountDashboardProps> = ({
  student,
  allStudents,
  exams,
  questions,
  results,
  initialMenu = 'beranda',
  hasSavedProgressForExam,
  onStartExamWithSessionToken,
  onStudentUpdated,
  onRefreshData,
  onLogout,
}) => {
  const [activeMenu, setActiveMenu] = useState<StudentDashboardMenu>(initialMenu);

  // Modal state for entering Teacher's Exam Session Token when clicking "Mulai Ujian"
  const [tokenModalExam, setTokenModalExam] = useState<ExamItem | null>(null);
  const [sessionTokenInput, setSessionTokenInput] = useState('');
  const [sessionTokenError, setSessionTokenError] = useState<string | null>(null);
  const [isStartingExam, setIsStartingExam] = useState(false);

  // Profile & Change Login Password/Token state
  const [nisnInput, setNisnInput] = useState(student.nisn || '');
  const [newPasswordInput, setNewPasswordInput] = useState(
    student.password_login || student.token_ujian || ''
  );
  const [confirmPasswordInput, setConfirmPasswordInput] = useState(
    student.password_login || student.token_ujian || ''
  );
  const [syncSystemTokenCard, setSyncSystemTokenCard] = useState(true);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // AI evaluation loading state per result ID in Hasil Ujian tab
  const [generatingAiResultId, setGeneratingAiResultId] = useState<number | null>(
    null
  );
  const [localAiOverrides, setLocalAiOverrides] = useState<
    Record<number, AnalisisAI>
  >({});

  const studentTingkat = useMemo(
    () => extractTingkatFromKelas(student.kelas),
    [student.kelas]
  );

  const absenInfo = useMemo(
    () => getStudentAbsenInfoInClass(student, allStudents),
    [student, allStudents]
  );

  // Proportional package allocation for this student
  const proportionalAlloc = useMemo(() => {
    if (exams.length === 0) return null;
    return resolveProportionalStudentExamPackage({
      student,
      allStudents,
      exams,
      questions,
    });
  }, [student, allStudents, exams, questions]);

  // Subject-by-subject assigned packages (Active exams: each subject resolves the student's exact Ganjil/Genap or assigned package)
  const activeSubjectAllocations = useMemo(() => {
    return resolveStudentExamPackagesBySubject({
      student,
      allStudents,
      exams,
      questions,
      requireActive: true,
    });
  }, [student, allStudents, exams, questions]);

  // Subject-by-subject assigned packages (All statuses for Jadwal Ujian)
  const allSubjectAllocations = useMemo(() => {
    return resolveStudentExamPackagesBySubject({
      student,
      allStudents,
      exams,
      questions,
      requireActive: false,
    });
  }, [student, allStudents, exams, questions]);

  // All exams distributed to this student's class/grade (filtered so if multiple packages exist for a subject, the student receives their assigned Ganjil/Genap package)
  const classMatchedExams = useMemo(() => {
    if (allSubjectAllocations.length > 0) {
      return allSubjectAllocations.map((a) => a.assignedExam);
    }
    return exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, student.kelas, { requireActive: false })
    );
  }, [allSubjectAllocations, exams, student.kelas]);

  // Active exams available right now for this student's class (per subject)
  const activeClassExams = useMemo(() => {
    if (activeSubjectAllocations.length > 0) {
      return activeSubjectAllocations.map((a) => a.assignedExam);
    }
    return exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, student.kelas, { requireActive: true })
    );
  }, [activeSubjectAllocations, exams, student.kelas]);

  // All submitted results belonging to this student
  const studentResults = useMemo(() => {
    return results
      .filter((r) => Number(r.student_id) === Number(student.id))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [results, student.id]);

  const completedExamIds = useMemo(() => {
    return new Set(studentResults.map((r) => Number(r.exam_id)));
  }, [studentResults]);

  const averageScore = useMemo(() => {
    if (studentResults.length === 0) return null;
    const sum = studentResults.reduce(
      (acc, r) => acc + (Number(r.skor_angka) || 0),
      0
    );
    return Math.round((sum / studentResults.length) * 10) / 10;
  }, [studentResults]);

  // Announcements from active exams or default school announcement
  const announcements = useMemo(() => {
    const customList = classMatchedExams
      .filter((ex) => ex.pengumuman && ex.pengumuman.trim().length > 0)
      .map((ex) => ({
        examId: ex.id,
        title: ex.judul_ujian,
        kategori: ex.kategori_ujian || 'Pengumuman Ujian',
        content: ex.pengumuman!.trim(),
        status: ex.status_ujian || 'AKTIF',
      }));
    return customList;
  }, [classMatchedExams]);

  const handleOpenStartExamModal = (exam: ExamItem) => {
    setSessionTokenError(null);
    setSessionTokenInput('');
    setTokenModalExam(exam);
  };

  const handleConfirmSessionTokenAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenModalExam) return;
    setSessionTokenError(null);

    if (student.status_ujian === 'Diblokir') {
      setSessionTokenError(
        'Akun ujian Anda sedang DIBLOKIR karena pelanggaran Anti-Cheat. Silakan lapor kepada Guru Pengawas untuk membuka kunci status Anda.'
      );
      return;
    }

    const check = verifyExamSessionToken({
      exam: tokenModalExam,
      student,
      inputToken: sessionTokenInput,
    });

    if (!check.ok) {
      setSessionTokenError(check.error);
      return;
    }

    setIsStartingExam(true);
    try {
      await onStartExamWithSessionToken(tokenModalExam);
      setTokenModalExam(null);
    } catch (err: any) {
      setSessionTokenError(
        err?.message || 'Gagal memulai sesi ujian. Silakan coba lagi.'
      );
    } finally {
      setIsStartingExam(false);
    }
  };

  const handleSaveProfileAndPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    const cleanPass = newPasswordInput.trim();
    const cleanConfirm = confirmPasswordInput.trim();

    if (cleanPass.length < 4 || cleanPass.length > 32) {
      setProfileFeedback({
        type: 'error',
        message:
          'Password / Token Login baru harus terdiri dari 4 hingga 32 karakter.',
      });
      return;
    }

    if (cleanPass !== cleanConfirm) {
      setProfileFeedback({
        type: 'error',
        message:
          'Konfirmasi Password / Token Login tidak cocok. Pastikan kedua kolom berisi kode yang sama.',
      });
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateStudentProfileAndPasswordCbt(student, {
        nisn: nisnInput.trim(),
        password_login: cleanPass,
        syncSystemToken: syncSystemTokenCard,
      });
      onStudentUpdated(updated);
      onRefreshData();
      setProfileFeedback({
        type: 'success',
        message: `Berhasil! Profil dan Password / Token Login Akun Anda telah diperbarui menjadi "${cleanPass}". Gunakan kode ini saat login berikutnya.`,
      });
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        message:
          err?.message || 'Gagal menyimpan perubahan profil dan password.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRequestAiForResult = async (resItem: ResultItem) => {
    const examObj = exams.find((e) => Number(e.id) === Number(resItem.exam_id));
    const examQs = questions.filter(
      (q) => Number(q.exam_id) === Number(resItem.exam_id)
    );
    if (examQs.length === 0) return;

    setGeneratingAiResultId(resItem.id);
    try {
      const aiData = await generateAiAnalysisCbt({
        resultId: resItem.id,
        nama_siswa: student.nama,
        questions: examQs,
        jawaban_siswa: resItem.jawaban_siswa || {},
        existingResult: resItem,
        student,
        exam: examObj || null,
      });
      setLocalAiOverrides((prev) => ({ ...prev, [resItem.id]: aiData }));
      onRefreshData();
    } catch (err) {
      console.error('Error generating AI analysis for student result:', err);
    } finally {
      setGeneratingAiResultId(null);
    }
  };

  const handleDownloadResultPdf = (resItem: ResultItem) => {
    const examObj =
      exams.find((e) => Number(e.id) === Number(resItem.exam_id)) || null;
    const examQs = questions.filter(
      (q) => Number(q.exam_id) === Number(resItem.exam_id)
    );
    const syncedAns = resolveSyncedStudentAnswersForExam({
      questions: examQs,
      jawabanSiswa: resItem.jawaban_siswa || {},
      student,
      exam: examObj,
      recordedScore: resItem.skor_angka,
    });
    const answeredCount = Object.keys(syncedAns).filter(
      (k) => Array.isArray(syncedAns[k]) && syncedAns[k].length > 0
    ).length;

    let kategori = 'Perlu Bimbingan (D)';
    if (resItem.skor_angka >= 85) kategori = 'Sangat Baik (A)';
    else if (resItem.skor_angka >= 70) kategori = 'Baik (B)';
    else if (resItem.skor_angka >= 55) kategori = 'Cukup (C)';

    downloadSingleStudentResultPdf({
      student,
      exam: examObj,
      score: resItem.skor_angka,
      kategori,
      answeredCount,
      totalQuestions: examQs.length || 40,
      tabViolations: resItem.pelanggaran_tab || 0,
      submittedAt: resItem.created_at,
      aiAnalysis: localAiOverrides[resItem.id] || resItem.analisis_ai || null,
      questions: examQs,
      studentAnswers: syncedAns,
    });
  };

  const assignedPackageBadge =
    student.kode_soal ||
    proportionalAlloc?.packageCode ||
    student.variasi_paket ||
    'PAKET-A';

  return (
    <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 space-y-6">
      {/* Top Institutional Student Account Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl border border-indigo-800/80 overflow-hidden shadow-sm">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-emerald-400 via-cyan-400 to-blue-500" />
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Akun Siswa Terverifikasi</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-md font-mono font-bold bg-indigo-500/30 text-amber-300 border border-indigo-400/30">
                Kelas {student.kelas} · No. Absen #{absenInfo.noAbsen} ({absenInfo.ganjilGenapLabel})
              </span>
              {student.nisn && (
                <span className="px-2.5 py-0.5 rounded-md font-mono text-blue-200 bg-white/10 border border-white/15">
                  NISN: {student.nisn}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-extrabold bg-amber-400 text-slate-950">
                <Shuffle className="w-3 h-3" />
                <span>{assignedPackageBadge} ({absenInfo.ganjilGenapLabel})</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              Halo, {student.nama}
            </h1>
            <p className="text-xs text-blue-200/90 max-w-2xl leading-relaxed">
              Selamat datang di Portal Akun Peserta CBT Sosiologi. Pantau jadwal
              ujian aktif, masukkan <strong>Token Sesi Ujian</strong> dari Guru
              untuk mulai mengerjakan, lihat hasil nilai &amp; pembahasan PDF,
              atau atur password login Anda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-blue-200 font-semibold">
                Password / Token Login Saya
              </div>
              <div className="font-mono font-extrabold text-sm text-amber-300 mt-0.5 flex items-center gap-2">
                <span>{student.password_login || student.token_ujian}</span>
                <button
                  type="button"
                  onClick={() => setActiveMenu('profil')}
                  className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                >
                  Ubah
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 border border-rose-500 transition-colors cursor-pointer shadow-xs"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout / Keluar</span>
            </button>
          </div>
        </div>

        {/* 6-Menu Student Navigation Bar */}
        <div className="px-5 sm:px-6 py-3 bg-slate-950/50 border-t border-indigo-900/80 flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Menu Portal Akun Siswa"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => setActiveMenu('beranda')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMenu === 'beranda'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs ring-1 ring-blue-400/50'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Dashboard / Beranda</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('jadwal')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMenu === 'jadwal'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs ring-1 ring-emerald-400/50'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Jadwal &amp; Daftar Ujian</span>
              {activeClassExams.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-extrabold bg-amber-400 text-slate-950">
                  {activeClassExams.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('hasil')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMenu === 'hasil'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-xs ring-1 ring-violet-400/50'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Hasil Ujian / Nilai</span>
              {studentResults.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-extrabold bg-white/20 text-white">
                  {studentResults.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('riwayat')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMenu === 'riwayat'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-xs ring-1 ring-amber-400/50'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Ujian</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('profil')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMenu === 'profil'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-xs ring-1 ring-cyan-400/50'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Profil &amp; Password</span>
            </button>
          </nav>

          <button
            type="button"
            onClick={() =>
              downloadStudentTokenCardsPdf([student], {
                kelasLabel: `Kartu Akun & Nilai - ${student.nama}`,
                exams,
                results,
                includeSummaryPage: false,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 bg-white/10 hover:bg-white/15 border border-white/15 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Kartu Akun (.PDF)</span>
          </button>
        </div>
      </div>

      {/* Warning if student is currently blocked by Anti-Cheat */}
      {student.status_ujian === 'Diblokir' && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-300 text-xs text-red-900 flex items-start gap-3"
        >
          <Lock className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-red-950">
              Status Sesi Ujian Anda Sedang Diblokir / Dikunci Sementara
            </div>
            <p className="mt-0.5 leading-relaxed">
              Sistem mendeteksi perpindahan tab/jendela saat ujian berlangsung.
              Silakan lapor kepada Guru Pengawas di kelas agar status Anda dibuka
              kembali (<strong>Buka Kunci</strong>) sebelum melanjutkan ujian.
            </p>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MENU 1: DASHBOARD / BERANDA                                         */}
      {/* =================================================================== */}
      {activeMenu === 'beranda' && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-blue-700">
                <span>Ujian Aktif Hari Ini</span>
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1.5">
                {activeClassExams.length}{' '}
                <span className="text-xs font-sans font-normal text-slate-500">
                  sesi dibuka
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Khusus Kelas {student.kelas} (Tingkat {studentTingkat})
              </p>
            </div>

            <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Ujian Selesai Dikerjakan</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1.5">
                {studentResults.length}{' '}
                <span className="text-xs font-sans font-normal text-slate-500">
                  ujian selesai
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Dari total {classMatchedExams.length} paket ujian kelas
              </p>
            </div>

            <div className="bg-white border border-violet-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-violet-700">
                <span>Rata-Rata Nilai Saya</span>
                <Award className="w-4 h-4 text-violet-600" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1.5">
                {averageScore !== null ? `${averageScore}` : '-'}{' '}
                <span className="text-xs font-sans font-normal text-slate-500">
                  / 100
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Formula Penilaian Humanis PG &amp; PGK
              </p>
            </div>

            <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                <span>Paket Proporsional Saya</span>
                <Shuffle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-extrabold font-mono text-indigo-900 mt-1.5">
                {assignedPackageBadge}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Terkunci sinkron dengan bank soal
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Pengumuman Sekolah & Guru */}
            <div className="lg:col-span-5 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-5 py-4 text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-300" />
                  <h2 className="text-sm font-extrabold text-white">
                    Pengumuman Sekolah &amp; Informasi Ujian
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950">
                  Terbaru
                </span>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                {announcements.length > 0 ? (
                  announcements.map((item) => (
                    <div
                      key={item.examId}
                      className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-indigo-950">
                          {item.title}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                          {item.kategori}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">
                        {item.content}
                      </p>
                    </div>
                  ))
                ) : null}

                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1.5 text-emerald-950">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Sistem 2-Token (Password Akun &amp; Token Sesi Ujian)</span>
                  </div>
                  <p className="text-emerald-800 leading-relaxed">
                    1. <strong>Password / Token Login Akun</strong> digunakan
                    untuk masuk ke dashboard ini dan dapat Anda ubah sendiri di
                    menu <strong>Profil &amp; Password</strong> agar mudah
                    diingat.
                  </p>
                  <p className="text-emerald-800 leading-relaxed">
                    2. <strong>Token Sesi Ujian</strong> diberikan oleh Guru
                    Pengawas setiap kali akan memulai ujian di menu{' '}
                    <strong>Jadwal &amp; Daftar Ujian</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1 text-amber-950">
                  <div className="font-bold text-amber-900">
                    Tata Tertib Keamanan Ujian (Anti-Cheat)
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    Selama mengerjakan soal, jangan berpindah tab browser atau
                    keluar dari mode layar penuh. Jawaban Anda tersimpan
                    otomatis (Autosave) setiap detik.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Rangkuman Ujian Hari Ini */}
            <div className="lg:col-span-7 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-5 py-4 text-white flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Rangkuman Ujian Hari Ini
                  </div>
                  <h2 className="text-sm font-extrabold text-white mt-0.5">
                    Daftar Ujian Aktif untuk Kelas {student.kelas}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMenu('jadwal')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                >
                  Lihat Semua Jadwal
                </button>
              </div>

              <div className="p-5 space-y-3">
                {activeClassExams.length === 0 ? (
                  <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                    <p className="text-sm font-bold text-slate-700">
                      Belum Ada Sesi Ujian yang Sedang Dibuka Saat Ini
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Silakan tunggu Guru Sosiologi mengaktifkan paket ujian
                      untuk kelas {student.kelas}, atau periksa nilai ujian Anda
                      sebelumnya di menu <strong>Hasil Ujian / Nilai</strong>.
                    </p>
                  </div>
                ) : (
                  activeClassExams.map((ex) => {
                    const qCount = questions.filter(
                      (q) => Number(q.exam_id) === Number(ex.id)
                    ).length;
                    const isDone = completedExamIds.has(Number(ex.id));
                    const progressInfo = hasSavedProgressForExam(ex.id);
                    const matchingResult = studentResults.find(
                      (r) => Number(r.exam_id) === Number(ex.id)
                    );

                    return (
                      <div
                        key={ex.id}
                        className="p-4 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/40 via-white to-emerald-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white">
                              Mapel: {getEffectiveMataPelajaran(ex)}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              AKTIF DIBUKA
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              {ex.kategori_ujian || 'Ujian CBT'}
                            </span>
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              {ex.kode_paket || assignedPackageBadge} · Absen #{absenInfo.noAbsen} ({absenInfo.ganjilGenapLabel})
                            </span>
                          </div>
                          <h3 className="text-base font-extrabold text-slate-900">
                            {ex.judul_ujian}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              <span>Durasi: {ex.durasi_menit} Menit</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Jumlah Soal: {qCount} Butir</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {isDone && student.status_ujian === 'Selesai' ? (
                            <div className="flex flex-col sm:items-end gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>
                                  Selesai Dikerjakan
                                  {matchingResult &&
                                  ex.tampilkan_nilai !== false
                                    ? ` (${matchingResult.skor_angka}/100)`
                                    : ''}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveMenu('hasil')}
                                className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer"
                              >
                                Lihat Nilai &amp; PDF
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenStartExamModal(ex)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 shadow-xs cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {progressInfo.hasProgress
                                  ? `Lanjutkan Ujian (${progressInfo.answeredCount} Dijawab)`
                                  : 'Mulai Ujian (Input Token)'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MENU 2: JADWAL UJIAN / DAFTAR UJIAN                                 */}
      {/* =================================================================== */}
      {activeMenu === 'jadwal' && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Jadwal &amp; Daftar Sesi Ujian Kelas {student.kelas}
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Daftar Ujian Tersedia ({classMatchedExams.length} Paket Ujian)
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Klik tombol <strong>Mulai Ujian</strong> pada ujian berstatus{' '}
                <strong>AKTIF</strong>, lalu masukkan{' '}
                <strong>Token Sesi Ujian</strong> yang diberikan oleh Guru
                Pengawas.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-300">
              Kode Paket Anda: {assignedPackageBadge}
            </span>
          </div>

          <div className="p-6">
            {classMatchedExams.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-bold text-slate-700">
                  Belum Ada Jadwal Ujian untuk Kelas {student.kelas}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Jadwal ujian akan otomatis muncul di halaman ini segera
                  setelah ditambahkan oleh Guru Sosiologi.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classMatchedExams.map((ex) => {
                  const isAktif = (ex.status_ujian || 'AKTIF') === 'AKTIF';
                  const isSelesaiStatus = ex.status_ujian === 'SELESAI';
                  const qCount = questions.filter(
                    (q) => Number(q.exam_id) === Number(ex.id)
                  ).length;
                  const studentHasSubmitted = completedExamIds.has(
                    Number(ex.id)
                  );
                  const progressInfo = hasSavedProgressForExam(ex.id);

                  return (
                    <div
                      key={ex.id}
                      className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                        isAktif
                          ? 'bg-white border-indigo-200 shadow-xs'
                          : 'bg-slate-50/80 border-slate-200 opacity-85'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-600 text-white">
                              Mapel: {getEffectiveMataPelajaran(ex)}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                              {ex.kategori_ujian || 'Penilaian Harian (PH / Kuis)'}
                            </span>
                          </div>

                          {isAktif ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              <span>AKTIF DIBUKA</span>
                            </span>
                          ) : isSelesaiStatus ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                              SELESAI / DITUTUP
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <Lock className="w-3 h-3" />
                              <span>BELUM DIBUKA (MENUNGGU JADWAL)</span>
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-extrabold text-slate-900">
                          {ex.judul_ujian}
                        </h3>

                        {ex.pengumuman && (
                          <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                            <strong>Catatan Guru:</strong> {ex.pengumuman}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <div className="text-[10px] text-slate-500">
                              Durasi Waktu
                            </div>
                            <div className="font-mono font-bold text-slate-900 mt-0.5">
                              {ex.durasi_menit} Menit
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <div className="text-[10px] text-slate-500">
                              Jumlah Soal
                            </div>
                            <div className="font-mono font-bold text-slate-900 mt-0.5">
                              {qCount} Butir
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200">
                            <div className="text-[10px] text-indigo-700">
                              Kode Paket
                            </div>
                            <div className="font-mono font-extrabold text-indigo-900 mt-0.5">
                              {assignedPackageBadge}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                        <div className="text-xs">
                          {studentHasSubmitted &&
                          student.status_ujian === 'Selesai' ? (
                            <span className="font-bold text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Sudah Selesai Dikerjakan</span>
                            </span>
                          ) : progressInfo.hasProgress ? (
                            <span className="font-bold text-blue-700">
                              Progres Tersimpan ({progressInfo.answeredCount}{' '}
                              jawaban)
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Siap dikerjakan dengan Token Sesi
                            </span>
                          )}
                        </div>

                        {studentHasSubmitted &&
                        student.status_ujian === 'Selesai' ? (
                          <button
                            type="button"
                            onClick={() => setActiveMenu('hasil')}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer"
                          >
                            Lihat Nilai
                          </button>
                        ) : isAktif ? (
                          <button
                            type="button"
                            disabled={qCount === 0}
                            onClick={() => handleOpenStartExamModal(ex)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>
                              {progressInfo.hasProgress
                                ? 'Lanjutkan Ujian'
                                : 'Mulai & Input Token'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed"
                          >
                            Menunggu Dibuka Guru
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MENU 3: HASIL UJIAN / NILAI                                         */}
      {/* =================================================================== */}
      {activeMenu === 'hasil' && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Transkrip Nilai &amp; Evaluasi Kognitif Siswa
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Hasil Ujian &amp; Pembahasan Soal ({studentResults.length}{' '}
                Hasil)
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Lihat skor akhir, analisis capaian LOTS &amp; HOTS, serta unduh
                sertifikat nilai beserta pembahasan soal lengkap dalam format
                PDF.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {studentResults.length === 0 ? (
              <div className="py-12 text-center space-y-3 border border-dashed border-slate-200 rounded-xl">
                <Award className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  Belum Ada Hasil Nilai Ujian yang Tersimpan
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Setelah Anda menyelesaikan ujian di menu{' '}
                  <strong>Jadwal &amp; Daftar Ujian</strong>, nilai akhir dan
                  pembahasan lengkap akan langsung tampil di halaman ini.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveMenu('jadwal')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
                >
                  Buka Jadwal Ujian
                </button>
              </div>
            ) : (
              studentResults.map((resItem) => {
                const examObj = exams.find(
                  (e) => Number(e.id) === Number(resItem.exam_id)
                );
                const isScoreVisible = examObj?.tampilkan_nilai !== false;
                const examQs = questions.filter(
                  (q) => Number(q.exam_id) === Number(resItem.exam_id)
                );
                const aiData =
                  localAiOverrides[resItem.id] || resItem.analisis_ai || null;

                let predikat = 'Perlu Bimbingan (D)';
                let badgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
                if (resItem.skor_angka >= 85) {
                  predikat = 'Sangat Baik (A)';
                  badgeColor =
                    'bg-emerald-100 text-emerald-800 border-emerald-300';
                } else if (resItem.skor_angka >= 70) {
                  predikat = 'Baik (B)';
                  badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
                } else if (resItem.skor_angka >= 55) {
                  predikat = 'Cukup (C)';
                  badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
                }

                return (
                  <div
                    key={resItem.id}
                    className="rounded-2xl border border-indigo-200/90 bg-white overflow-hidden shadow-2xs"
                  >
                    <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-emerald-50/30 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2.5 py-0.5 rounded-md font-bold bg-indigo-100 text-indigo-800">
                            {examObj?.kategori_ujian || 'Ujian Sosiologi'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {resItem.kode_soal || assignedPackageBadge}
                          </span>
                          <span className="text-slate-500">
                            Dikumpulkan:{' '}
                            {resItem.created_at
                              ? new Date(resItem.created_at).toLocaleString(
                                  'id-ID'
                                )
                              : 'Tersimpan'}
                          </span>
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-900">
                          {examObj?.judul_ujian ||
                            `Paket Ujian #${resItem.exam_id}`}
                        </h3>
                        <p className="text-xs text-slate-600">
                          Peserta: <strong>{student.nama}</strong> (Kelas{' '}
                          {student.kelas}) · Jumlah Soal: {examQs.length} Butir
                        </p>
                      </div>

                      {isScoreVisible ? (
                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          <div className="px-4 py-2.5 rounded-xl bg-white border border-indigo-200 text-right shadow-2xs">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Nilai Akhir
                            </div>
                            <div className="text-3xl font-extrabold font-mono text-blue-700">
                              {resItem.skor_angka}
                              <span className="text-sm font-normal text-slate-400">
                                /100
                              </span>
                            </div>
                            <span
                              className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}
                            >
                              {predikat}
                            </span>
                          </div>

                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadResultPdf(resItem)}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download PDF Nilai &amp; Soal Lengkap</span>
                            </button>

                            {!aiData && resItem.skor_angka > 0 && (
                              <button
                                type="button"
                                disabled={generatingAiResultId === resItem.id}
                                onClick={() => handleRequestAiForResult(resItem)}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer disabled:opacity-50"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>
                                  {generatingAiResultId === resItem.id
                                    ? 'Menyusun Evaluasi...'
                                    : 'Tampilkan Evaluasi LOTS & HOTS'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 max-w-xs">
                          <div className="font-bold flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-700" />
                            <span>Nilai Sedang Diverifikasi Guru</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-amber-800">
                            Jawaban Anda telah tercatat aman. Rincian skor akan
                            muncul setelah fitur tampilkan nilai diaktifkan oleh
                            Guru.
                          </p>
                        </div>
                      )}
                    </div>

                    {isScoreVisible && aiData && (
                      <div className="p-5 sm:p-6 space-y-4 bg-white text-xs">
                        <div>
                          <div className="font-bold uppercase tracking-wider text-indigo-700">
                            Evaluasi Penalaran Kognitif (LOTS &amp; HOTS)
                          </div>
                          <p className="text-slate-700 mt-1 leading-relaxed text-sm">
                            {aiData.evaluasi_hots}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                            <div className="font-bold text-emerald-900 mb-1.5">
                              Kekuatan Penguasaan Materi
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-slate-700">
                              {aiData.analisis_kompetensi.kekuatan.map(
                                (k, idx) => (
                                  <li key={idx}>{k}</li>
                                )
                              )}
                            </ul>
                          </div>

                          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                            <div className="font-bold text-amber-900 mb-1.5">
                              Konsep yang Perlu Diperkuat
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-slate-700">
                              {aiData.analisis_kompetensi.kelemahan.map(
                                (w, idx) => (
                                  <li key={idx}>{w}</li>
                                )
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MENU 4: RIWAYAT UJIAN                                               */}
      {/* =================================================================== */}
      {activeMenu === 'riwayat' && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Log Aktivitas &amp; Riwayat Asesmen Siswa
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Riwayat Ujian Lengkap (Selesai &amp; Belum Dikerjakan)
              </h2>
            </div>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto border border-indigo-100 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Judul &amp; Kategori Ujian</th>
                    <th className="py-3 px-4">Kode Paket</th>
                    <th className="py-3 px-4">Status Pengerjaan</th>
                    <th className="py-3 px-4">Waktu Selesai</th>
                    <th className="py-3 px-4 text-right">Nilai Akhir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {classMatchedExams.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        Belum ada riwayat ujian pada kelas {student.kelas}.
                      </td>
                    </tr>
                  ) : (
                    classMatchedExams.map((ex, idx) => {
                      const resItem = studentResults.find(
                        (r) => Number(r.exam_id) === Number(ex.id)
                      );
                      const progressInfo = hasSavedProgressForExam(ex.id);
                      const isDone = Boolean(
                        resItem && student.status_ujian === 'Selesai'
                      );
                      const isAktif = (ex.status_ujian || 'AKTIF') === 'AKTIF';

                      return (
                        <tr key={ex.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 text-sm">
                              {ex.judul_ujian}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {ex.kategori_ujian || 'Ujian Sosiologi'} · Durasi{' '}
                              {ex.durasi_menit} Menit
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              {resItem?.kode_soal || assignedPackageBadge}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Selesai</span>
                              </span>
                            ) : progressInfo.hasProgress ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                <span>
                                  Sedang Dikerjakan ({progressInfo.answeredCount}{' '}
                                  Soal)
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                <span>Belum Dikerjakan</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono">
                            {resItem?.created_at
                              ? new Date(resItem.created_at).toLocaleString(
                                  'id-ID'
                                )
                              : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-extrabold text-sm">
                            {resItem ? (
                              ex.tampilkan_nilai !== false ? (
                                <span className="text-blue-700">
                                  {resItem.skor_angka}/100
                                </span>
                              ) : (
                                <span className="text-xs text-amber-700">
                                  Diverifikasi
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {resItem && ex.tampilkan_nilai !== false ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadResultPdf(resItem)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF Nilai &amp; Soal</span>
                              </button>
                            ) : isAktif && !isDone ? (
                              <button
                                type="button"
                                onClick={() => handleOpenStartExamModal(ex)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Mulai</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MENU 5: PROFIL SISWA & UBAH PASSWORD / TOKEN LOGIN AKUN             */}
      {/* =================================================================== */}
      {activeMenu === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Kartu Identitas Profil Siswa */}
          <div className="lg:col-span-5 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Identitas Resmi Peserta
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Profil Akun Siswa CBT
              </h2>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div>
                  <div className="text-slate-500">Nama Lengkap Siswa</div>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    {student.nama}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-slate-500">NISN</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {student.nisn || 'Belum diisi'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Kelas / Rombel</div>
                    <div className="font-bold text-indigo-800 mt-0.5">
                      {student.kelas} (Tingkat {studentTingkat})
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-slate-500">
                      Token Bawaan Sistem (Kartu)
                    </div>
                    <div className="font-mono font-extrabold text-blue-700 text-sm mt-0.5">
                      {student.token_ujian}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">
                      Password / Token Login Aktif
                    </div>
                    <div className="font-mono font-extrabold text-emerald-700 text-sm mt-0.5">
                      {student.password_login || student.token_ujian}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-slate-500">
                    Kode Paket Soal Proporsional:
                  </span>
                  <span className="px-2.5 py-0.5 rounded font-mono font-extrabold bg-indigo-600 text-white">
                    {assignedPackageBadge}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadStudentTokenCardsPdf([student], {
                    kelasLabel: `Kartu Akun CBT - ${student.nama}`,
                    exams,
                    results,
                    includeSummaryPage: false,
                  })
                }
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Cetak / Download Kartu Akun &amp; Nilai (.PDF)</span>
              </button>
            </div>
          </div>

          {/* Form Ubah Password / Token Login & NISN */}
          <div className="lg:col-span-7 bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Keamanan Akun &amp; Kredensial Mandiri
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Ubah Password / Token Login Akun Siswa
              </h2>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Sistem telah menyediakan Token bawaan (
                <strong className="font-mono text-amber-300">
                  {student.token_ujian}
                </strong>
                ), namun Anda dapat mengubah Password / Token Login agar lebih
                mudah Anda ingat saat login berikutnya.
              </p>
            </div>

            <form
              onSubmit={handleSaveProfileAndPassword}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label
                  htmlFor="student-profile-nisn"
                  className="block font-bold text-slate-800 mb-1"
                >
                  Nomor Induk Siswa Nasional (NISN)
                </label>
                <input
                  id="student-profile-nisn"
                  type="text"
                  maxLength={32}
                  value={nisnInput}
                  onChange={(e) => setNisnInput(e.target.value)}
                  placeholder="Masukkan NISN Anda (contoh: 0078123456)"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="student-new-password"
                    className="block font-bold text-slate-800 mb-1"
                  >
                    Password / Token Login Baru (4–32 Karakter)
                  </label>
                  <div className="relative">
                    <input
                      id="student-new-password"
                      type={showPasswordText ? 'text' : 'password'}
                      maxLength={32}
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Buat password/token mudah diingat"
                      className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPasswordText ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="student-confirm-password"
                    className="block font-bold text-slate-800 mb-1"
                  >
                    Ulangi Password / Token Login Baru
                  </label>
                  <input
                    id="student-confirm-password"
                    type={showPasswordText ? 'text' : 'password'}
                    maxLength={32}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Ketik ulang password/token baru"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncSystemTokenCard}
                  onChange={(e) => setSyncSystemTokenCard(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300"
                />
                <div className="text-slate-700">
                  <span className="font-bold text-slate-900">
                    Sinkronkan juga ke 6 Karakter Token Kartu (Jika 6 Karakter
                    Huruf/Angka)
                  </span>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Catatan: Meskipun Anda membuat password baru, Token Bawaan
                    Sistem (<strong>{student.token_ujian}</strong>) tetap dapat
                    digunakan sebagai cadangan jika Anda lupa password.
                  </p>
                </div>
              </label>

              {profileFeedback && (
                <div
                  className={`p-3.5 rounded-xl font-medium flex items-start gap-2 ${
                    profileFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{profileFeedback.message}</span>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setNewPasswordInput(student.token_ujian);
                    setConfirmPasswordInput(student.token_ujian);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Kembalikan ke Token Sistem ({student.token_ujian})
                </button>

                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSavingProfile
                      ? 'Menyimpan...'
                      : 'Simpan Profil & Password Baru'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL VERIFIKASI TOKEN SESI UJIAN (DIBERIKAN GURU SAAT AKAN UJIAN)  */}
      {/* =================================================================== */}
      {tokenModalExam && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-indigo-200 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Verifikasi Token Sesi Ujian
              </div>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                {tokenModalExam.judul_ujian}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                Durasi {tokenModalExam.durasi_menit} Menit · Kode Paket Anda:{' '}
                <strong className="font-mono text-amber-300">
                  {assignedPackageBadge}
                </strong>
              </p>
            </div>

            <form
              onSubmit={handleConfirmSessionTokenAndStart}
              className="p-6 space-y-4"
            >
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-900">
                  <KeyRound className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Mapel {getEffectiveMataPelajaran(tokenModalExam)} · Paket{' '}
                    {tokenModalExam.kode_paket || assignedPackageBadge} (Absen #{absenInfo.noAbsen} {absenInfo.ganjilGenapLabel})
                  </span>
                </div>
                <p className="text-blue-800 leading-relaxed">
                  Ketikkan <strong>Token Sesi Ujian</strong> yang diumumkan oleh
                  Guru / Pengawas di kelas untuk membuka lembar soal ujian ini.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-950 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold">Mode Isolasi Ujian Penuh (Auto-Close Tab &amp; Aplikasi Lain):</span>{' '}
                  Begitu Anda mengklik <strong>Mulai Kerjakan Soal</strong>, sistem otomatis mengunci layar penuh (Kiosk Mode) dan menutup/memblokir akses ke seluruh tab lain maupun aplikasi lain selama ujian berlangsung.
                </div>
              </div>

              <div>
                <label
                  htmlFor="modal-session-token-input"
                  className="block text-xs font-bold text-slate-800 mb-1.5"
                >
                  Token Sesi Ujian
                </label>
                <input
                  id="modal-session-token-input"
                  type="text"
                  autoFocus
                  maxLength={12}
                  value={sessionTokenInput}
                  onChange={(e) =>
                    setSessionTokenInput(e.target.value.toUpperCase())
                  }
                  placeholder="MASUKKAN TOKEN SESI UJIAN"
                  className="w-full px-4 py-3 text-base font-mono font-extrabold tracking-widest uppercase text-center bg-white border-2 border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {sessionTokenError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{sessionTokenError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTokenModalExam(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isStartingExam || sessionTokenInput.trim().length < 4}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isStartingExam ? 'Membuka Soal...' : 'Mulai Kerjakan Soal'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
