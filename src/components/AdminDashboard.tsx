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
  LogIn,
  ClipboardList,
  Edit3,
  LogOut,
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
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_STUDENT_CSV_TEMPLATE,
  extractTingkatFromKelas,
} from '../utils/cbtLogic';
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
  saveStudentCbt,
  uploadStudentsCsvCbt,
  regenerateStudentTokenCbt,
  deleteStudentCbt,
  addManualQuestionCbt,
  uploadQuestionsCsvCbt,
  deleteQuestionCbt,
  generateAiAnalysisCbt,
} from '../lib/cbtFirestoreService';

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
  // Separate Teacher Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  // 4 Core Teacher Dashboard Modules:
  // 1. 'ujian' (Manajemen Ujian & Distribusi 3 Tingkatan Kelas)
  // 2. 'siswa' (Database Siswa: Input Manual & Upload Massal CSV + Filter 3 Tingkatan)
  // 3. 'soal'  (Bank Soal & Upload CSV per Paket Ujian/Tingkat)
  // 4. 'laporan' (Hasil Ujian & Evaluasi AI)
  const [activeTab, setActiveTab] = useState<
    'ujian' | 'siswa' | 'soal' | 'laporan'
  >('ujian');

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

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
  const [filterExamTingkat, setFilterExamTingkat] = useState<string>('SEMUA');
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [examFeedback, setExamFeedback] = useState<string | null>(null);

  // --- Module 2: Database Siswa (Manual & Bulk CSV Upload) ---
  const [studentInputMode, setStudentInputMode] = useState<'manual' | 'csv'>(
    'manual'
  );
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentTingkatPreset, setStudentTingkatPreset] = useState<
    'X' | 'XI' | 'XII'
  >('X');
  const [studentClassInput, setStudentClassInput] = useState('X MIPA 1');
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);

  // Bulk Student CSV Upload state
  const [studentCsvText, setStudentCsvText] = useState('');
  const [replaceExistingStudents, setReplaceExistingStudents] = useState(false);
  const [isUploadingStudentsCsv, setIsUploadingStudentsCsv] = useState(false);

  // Student Filters (3 Tingkatan + Specific Class)
  const [filterStudentTingkat, setFilterStudentTingkat] =
    useState<string>('SEMUA');
  const [filterKelas, setFilterKelas] = useState<string>('SEMUA');
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // --- Module 3: Manajemen Soal (Manual & CSV) ---
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
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [replaceExistingQuestions, setReplaceExistingQuestions] =
    useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // --- Module 4: Laporan & AI Analysis State ---
  const [analyzingResultId, setAnalyzingResultId] = useState<number | null>(
    null
  );
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

  // Unique classes in DB
  const uniqueClasses = Array.from(
    new Set(students.map((s) => s.kelas).filter(Boolean))
  ).sort();

  const filteredExams =
    filterExamTingkat === 'SEMUA'
      ? exams
      : exams.filter(
          (e) =>
            e.target_tingkat === filterExamTingkat ||
            e.target_tingkat === 'SEMUA'
        );

  const filteredStudents = students.filter((s) => {
    const sTingkat = extractTingkatFromKelas(s.kelas);
    const matchTingkat =
      filterStudentTingkat === 'SEMUA' || sTingkat === filterStudentTingkat;
    const matchKelas = filterKelas === 'SEMUA' || s.kelas === filterKelas;
    return matchTingkat && matchKelas;
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
    };

    try {
      const savedExam = await saveExamCbt(payload, editingExamId);
      if (editingExamId) {
        setExamFeedback('Paket ujian & distribusi kelas berhasil diperbarui.');
        setEditingExamId(null);
        setNewExamTitle('');
        setNewExamDuration('60');
        setNewExamTargetTingkat('10');
        setNewExamTargetKelas('SEMUA');
      } else {
        setExamFeedback(
          `Paket ujian "${savedExam.judul_ujian}" berhasil dibuat untuk ${formatDistribusiLabel(
            savedExam.target_tingkat,
            savedExam.target_kelas
          )}.`
        );
        setSelectedExamId(savedExam.id);
        setNewExamTitle('');
        setNewExamDuration('60');
      }
      await onRefreshData();
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleDeleteExam = async (examId: number, title: string) => {
    setExamFeedback(null);
    await deleteExamCbt(examId, title);
    setExamFeedback(`Paket ujian "${title}" telah dihapus.`);
    await onRefreshData();
  };

  // --- Student Database CRUD & Bulk Upload Handlers ---
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
      } else {
        setStudentFeedback({
          type: 'success',
          message: `Siswa "${savedStudent.nama}" (${savedStudent.kelas}) berhasil disimpan dengan Token: ${savedStudent.token_ujian}`,
        });
        setStudentNameInput('');
      }
      await onRefreshData();
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleStudentCsvFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setStudentCsvText(content);
        setStudentFeedback({
          type: 'success',
          message: `File "${file.name}" berhasil dimuat. Klik "Proses Upload Massal Siswa" untuk men-generate token seluruh siswa.`,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleUploadStudentCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentCsvText.trim()) {
      setStudentFeedback({
        type: 'error',
        message: 'Silakan pilih file CSV siswa atau tempelkan daftar Nama & Kelas.',
      });
      return;
    }

    setIsUploadingStudentsCsv(true);
    setStudentFeedback(null);
    try {
      const outcome = await uploadStudentsCsvCbt(
        studentCsvText,
        replaceExistingStudents,
        students
      );
      setStudentFeedback({
        type: 'success',
        message: `Berhasil mengimpor ${outcome.insertedCount} siswa beserta Token Ujian unik 6 karakter ke database.`,
      });
      setStudentCsvText('');
      await onRefreshData();
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || 'Gagal mengimpor CSV siswa.',
      });
    } finally {
      setIsUploadingStudentsCsv(false);
    }
  };

  const handleDownloadSampleStudentCsv = () => {
    const blob = new Blob([SAMPLE_STUDENT_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_siswa_3_tingkatan.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRegenerateToken = async (studentId: number, nama: string) => {
    setStudentFeedback(null);
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    const updated = await regenerateStudentTokenCbt(target);
    setStudentFeedback({
      type: 'success',
      message: `Token baru untuk ${nama}: ${updated.token_ujian}`,
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

  // --- Question Management Handlers ---
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

  const handleAddManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentExam) {
      setUploadStatus({
        type: 'error',
        message:
          'Buat Paket Ujian terlebih dahulu pada tab Manajemen Ujian sebelum menambah soal.',
      });
      return;
    }
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
      await addManualQuestionCbt({
        examId: currentExam.id,
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
        message: `Butir soal baru berhasil ditambahkan ke ujian "${currentExam.judul_ujian}".`,
      });
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
    await onRefreshData();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCsvText(content);
        setUploadStatus({
          type: 'success',
          message: `File "${file.name}" siap diunggah ke paket ujian "${currentExam?.judul_ujian || ''}".`,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleUploadCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentExam) {
      setUploadStatus({
        type: 'error',
        message: 'Silakan buat Paket Ujian terlebih dahulu di tab Manajemen Ujian.',
      });
      return;
    }
    setIsUploadingCsv(true);
    setUploadStatus(null);

    try {
      const outcome = await uploadQuestionsCsvCbt(
        currentExam.id,
        csvText,
        replaceExistingQuestions,
        questions
      );
      setUploadStatus({
        type: 'success',
        message: `Berhasil mengimpor ${outcome.insertedCount} butir soal ke ujian "${currentExam.judul_ujian}" (${formatDistribusiLabel(
          currentExam.target_tingkat,
          currentExam.target_kelas
        )}).`,
      });
      setCsvText('');
      await onRefreshData();
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || 'Gagal mengunggah file CSV.',
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_soal_cbt.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- AI Evaluation Handler ---
  const handleGenerateAiAnalysis = async (result: ResultItem) => {
    const student = students.find((s) => s.id === result.student_id);
    const examForResult = questions.filter((q) => q.exam_id === result.exam_id);
    if (!student) return;

    setAnalyzingResultId(result.id);
    setAiErrorBanner(null);

    try {
      const data = await generateAiAnalysisCbt({
        resultId: result.id,
        nama_siswa: student.nama,
        questions: examForResult,
        jawaban_siswa: result.jawaban_siswa,
        existingResult: result,
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

  // ============================================================================
  // SEPARATE TEACHER LOGIN PAGE (WHEN NOT AUTHENTICATED)
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-blue-700 text-xs font-semibold">
              <Lock className="w-4 h-4" />
              <span>Halaman Login Guru / Administrator CBT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight">
              Masuk Dashboard Guru
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Kelola distribusi ujian 3 tingkatan kelas, upload massal siswa,
              bank soal CSV, serta laporan evaluasi AI.
            </p>
          </div>

          <form onSubmit={handleTeacherFormLogin} className="space-y-4">
            <div>
              <label
                htmlFor="teacher-username-input"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Email Guru
              </label>
              <input
                id="teacher-username-input"
                type="email"
                value={teacherUsername}
                onChange={(e) => setTeacherUsername(e.target.value)}
                placeholder="Masukkan Email Guru Terdaftar"
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="teacher-password-input"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                PIN Akses Guru
              </label>
              <input
                id="teacher-password-input"
                type="password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                placeholder="Masukkan 6 Digit PIN Guru"
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              className="w-full py-3 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              Masuk ke Dashboard Guru
            </button>
          </form>

          <div className="relative py-1 text-center border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={handleGoogleTeacherSignIn}
              className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-blue-600" />
              Masuk dengan Akun Google Sekolah
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED TEACHER DASHBOARD
  // ============================================================================
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Top Admin Header & Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              Dashboard Guru CBT · Pengawas Aktif:{' '}
              <strong className="text-slate-800">{teacherProfile.name}</strong> (
              {teacherProfile.email})
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Distribusi Ujian 3 Tingkatan Kelas, Database Siswa & Evaluasi AI
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              role="tablist"
              aria-label="Menu Dashboard Guru"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-x-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ujian'}
                onClick={() => setActiveTab('ujian')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'ujian'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
                Distribusi Ujian ({exams.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'siswa'}
                onClick={() => setActiveTab('siswa')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'siswa'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Database Siswa ({students.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'soal'}
                onClick={() => setActiveTab('soal')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'soal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                Bank Soal ({questions.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'laporan'}
                onClick={() => setActiveTab('laporan')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'laporan'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Hasil & Analisis AI ({results.length})
              </button>
            </div>

            {onManualFirebaseSync && (
              <button
                type="button"
                onClick={onManualFirebaseSync}
                disabled={isSyncingFirebase}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isSyncingFirebase ? 'animate-spin' : ''
                  }`}
                />
                {isSyncingFirebase
                  ? 'Menyinkronkan Firebase...'
                  : 'Sinkronkan Firebase'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAuthenticated(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar Guru
            </button>
          </div>
        </div>

        {/* Clean 4-Metric Summary Strip with 3-Grade Level Breakdown */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Paket Ujian Aktif</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {exams.length}{' '}
              <span className="text-xs font-normal text-slate-500">paket</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">
              Sebaran Siswa 3 Tingkatan
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1">
              Kelas X: {countTingkat10} · XI: {countTingkat11} · XII:{' '}
              {countTingkat12}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total Butir Soal</div>
            <div className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-0.5">
              {questions.length}{' '}
              <span className="text-xs font-normal text-slate-500">soal</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Hasil Ujian Masuk</div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {results.length}{' '}
              <span className="text-xs font-normal text-slate-500">peserta</span>
            </div>
          </div>
        </div>

        {/* Real-Time Firebase Firestore Sync Status Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-700">
              Firebase Firestore Real-Time Sync Aktif:
            </span>
            <span>
              {syncPulse?.lastEvent ||
                'Siap menyinkronkan perubahan ujian, siswa, soal & hasil secara otomatis'}
            </span>
          </div>
          {syncPulse?.lastSyncedAt && (
            <span className="font-mono text-slate-500">
              Update Terakhir:{' '}
              {new Date(syncPulse.lastSyncedAt).toLocaleTimeString('id-ID')}
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
                    Judul / Mata Pelajaran Ujian
                  </label>
                  <input
                    id="exam-title-input"
                    type="text"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="Contoh: Ujian Matematika Kelas X"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="exam-tingkat-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Target Tingkatan Kelas (3 Tingkatan)
                  </label>
                  <select
                    id="exam-tingkat-select"
                    value={newExamTargetTingkat}
                    onChange={(e) => setNewExamTargetTingkat(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="10">
                      Tingkat 1 — Kelas X / Kelas 10
                    </option>
                    <option value="11">
                      Tingkat 2 — Kelas XI / Kelas 11
                    </option>
                    <option value="12">
                      Tingkat 3 — Kelas XII / Kelas 12
                    </option>
                    <option value="SEMUA">
                      Semua Tingkatan (Kelas X, XI & XII)
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="exam-specific-kelas-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Filter Rombel / Kelas Spesifik (Opsional)
                  </label>
                  <input
                    id="exam-specific-kelas-input"
                    type="text"
                    value={
                      newExamTargetKelas === 'SEMUA' ? '' : newExamTargetKelas
                    }
                    onChange={(e) =>
                      setNewExamTargetKelas(
                        e.target.value.trim() ? e.target.value : 'SEMUA'
                      )
                    }
                    placeholder="Kosongkan untuk seluruh rombel di tingkat ini, atau isi misal: X MIPA 1"
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
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
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Distribusi Paket Ujian ({filteredExams.length})
                </h2>

                {/* Segmented Filter per Tingkatan */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
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
                      className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filterExamTingkat === val
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredExams.length === 0 ? (
                <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm font-semibold text-slate-700">
                    Belum Ada Paket Ujian pada Tingkatan Ini
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Buat paket ujian untuk Tingkat 1 (Kelas X), Tingkat 2 (Kelas
                    XI), atau Tingkat 3 (Kelas XII) pada formulir di sebelah kiri.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Judul Paket Ujian</th>
                        <th className="py-3 px-4">Distribusi Tingkatan Kelas</th>
                        <th className="py-3 px-4 text-right">Durasi</th>
                        <th className="py-3 px-4 text-right">Bank Soal</th>
                        <th className="py-3 px-4 text-right">Aksi Distribusi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {filteredExams.map((ex) => {
                        const qCount = questions.filter(
                          (q) => q.exam_id === ex.id
                        ).length;
                        return (
                          <tr key={ex.id} className="hover:bg-slate-50/80">
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              {ex.judul_ujian}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-blue-700 font-medium">
                              {formatDistribusiLabel(
                                ex.target_tingkat,
                                ex.target_kelas
                              )}
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
                                    setActiveTab('soal');
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Isi / Upload Soal
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
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DATABASE SISWA (INPUT MANUAL & UPLOAD MASSAL SISWA CSV)         */}
      {/* ===================================================================== */}
      {activeTab === 'siswa' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Panel Kiri: Switcher Tambah 1 Siswa vs Upload Massal Siswa CSV */}
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
                Upload Massal Siswa (CSV)
              </button>
            </div>

            {studentInputMode === 'manual' ? (
              <form onSubmit={handleSaveStudent} className="space-y-4">
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
                onSubmit={handleUploadStudentCsvSubmit}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Upload Massal Siswa (CSV)
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Impor ratusan siswa dari 3 tingkatan kelas sekaligus.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSampleStudentCsv}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Template CSV
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-800">
                    Format Kolom CSV Siswa:
                  </div>
                  <code className="block font-mono text-[11px] text-blue-700">
                    nama_siswa,kelas
                  </code>
                  <p className="text-[11px] text-slate-500">
                    Contoh baris: <code className="font-mono">Aditya Pratama,X MIPA 1</code> atau{' '}
                    <code className="font-mono">Bagas Setiawan,XI MIPA 1</code>. Token
                    6 karakter akan di-generate otomatis untuk setiap siswa.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="student-csv-file"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Pilih File .CSV Daftar Siswa
                  </label>
                  <input
                    id="student-csv-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleStudentCsvFileChange}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>

                <div>
                  <label
                    htmlFor="student-csv-textarea"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Atau Tempelkan Daftar Siswa (Nama, Kelas)
                  </label>
                  <textarea
                    id="student-csv-textarea"
                    rows={6}
                    value={studentCsvText}
                    onChange={(e) => setStudentCsvText(e.target.value)}
                    placeholder={`nama_siswa,kelas\nAditya Pratama,X MIPA 1\nBagas Setiawan,XI MIPA 1\nReza Rahadian,XII MIPA 1`}
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

          {/* Tabel Database Siswa (Dengan Filter 3 Tingkatan & Kelas) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Database Siswa ({filteredStudents.length} Peserta)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter 3 Tingkatan */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
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
                      className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filterStudentTingkat === val
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {uniqueClasses.length > 0 && (
                  <select
                    aria-label="Filter Rombel Siswa"
                    value={filterKelas}
                    onChange={(e) => setFilterKelas(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="SEMUA">Semua Rombel</option>
                    {uniqueClasses.map((kls) => (
                      <option key={kls} value={kls}>
                        {kls}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-semibold text-slate-700">
                  Belum Ada Data Siswa pada Filter Ini
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Gunakan fitur <strong>Input Siswa Satuan</strong> atau{' '}
                  <strong>Upload Massal Siswa (CSV)</strong> di panel kiri untuk
                  mengisi daftar siswa Kelas X, XI, dan XII.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Nama Siswa</th>
                      <th className="py-3 px-4">Kelas · Tingkat</th>
                      <th className="py-3 px-4">Token Ujian</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {filteredStudents.map((st) => {
                      const tkt = extractTingkatFromKelas(st.kelas);
                      return (
                        <tr key={st.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {st.nama}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700">
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
                          <td className="py-3 px-4">
                            <code className="font-mono font-bold text-sm text-blue-700">
                              {st.token_ujian}
                            </code>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span
                              className={`font-medium ${
                                st.status_ujian === 'Selesai'
                                  ? 'text-emerald-700'
                                  : st.status_ujian === 'Sedang Ujian'
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                              }`}
                            >
                              {st.status_ujian}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleRegenerateToken(st.id, st.nama)
                                }
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BANK SOAL (TAMBAH SOAL MANUAL & UPLOAD SOAL MASSAL CSV)         */}
      {/* ===================================================================== */}
      {activeTab === 'soal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Cols: Input Soal Manual atau Upload CSV */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <label
                htmlFor="select-active-exam-soal"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pilih Paket Ujian & Target Tingkatan Kelas
              </label>
              {exams.length === 0 ? (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Belum ada Paket Ujian. Silakan buat Paket Ujian per Tingkatan
                  pada tab <strong>Distribusi Ujian</strong> terlebih dahulu.
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

            {/* Switcher: Tambah Manual vs Upload CSV */}
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
                Upload Massal CSV
              </button>
            </div>

            {questionInputMode === 'manual' ? (
              <form onSubmit={handleAddManualQuestion} className="space-y-3.5">
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

                <button
                  type="submit"
                  disabled={isSavingQuestion || !currentExam}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {isSavingQuestion ? 'Menyimpan Soal...' : 'Simpan Butir Soal'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleUploadCsvSubmit} className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Format Header CSV Soal (11 Kolom)
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Contoh CSV Soal
                  </button>
                </div>

                <p className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                  id_soal, jenis_soal, wacana, teks_soal, opsi_a, opsi_b,
                  opsi_c, opsi_d, opsi_e, kunci_jawaban, bobot
                </p>

                <div>
                  <label
                    htmlFor="csv-file-upload"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Pilih File .CSV Soal dari Komputer
                  </label>
                  <input
                    id="csv-file-upload"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>

                <div>
                  <label
                    htmlFor="csv-raw-textarea"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Konten CSV Soal
                  </label>
                  <textarea
                    id="csv-raw-textarea"
                    rows={6}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Tempelkan isi CSV atau unggah file CSV di atas..."
                    className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

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
                    Hapus soal lama pada paket ujian ini sebelum impor CSV
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isUploadingCsv || !currentExam}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingCsv
                    ? 'Memproses CSV...'
                    : 'Proses & Upload Soal CSV'}
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

          {/* Right 7 Cols: Daftar Soal pada Ujian Terpilih */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Daftar Soal:{' '}
                  {currentExam ? currentExam.judul_ujian : 'Belum Ada Ujian'} (
                  {currentExamQuestions.length} Butir)
                </h2>
                {currentExam && (
                  <p className="text-xs text-blue-700 font-medium mt-0.5">
                    Distribusi:{' '}
                    {formatDistribusiLabel(
                      currentExam.target_tingkat,
                      currentExam.target_kelas
                    )}
                  </p>
                )}
              </div>
            </div>

            {currentExamQuestions.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-semibold text-slate-700">
                  Belum Ada Butir Soal pada Paket Ini
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tambahkan soal secara manual atau gunakan fitur Upload Massal
                  CSV di panel sebelah kiri.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                {currentExamQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-4 border border-slate-200 rounded-lg bg-slate-50/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-900">
                        #{idx + 1} ·{' '}
                        {q.tipe_soal === 'Kompleks'
                          ? 'Pilihan Ganda Kompleks'
                          : 'Pilihan Ganda Biasa'}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono">
                          Kunci:{' '}
                          <strong className="text-emerald-700">
                            {q.kunci_jawaban.join(', ')}
                          </strong>{' '}
                          · Bobot: {q.bobot} Poin
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          aria-label={`Hapus soal nomor ${idx + 1}`}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {q.data_opsi?.wacana && (
                      <p className="text-xs text-slate-600 italic bg-white p-2.5 rounded border border-slate-200">
                        Wacana: {q.data_opsi.wacana}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-slate-900">
                      {q.teks_soal}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 pt-1">
                      {(['A', 'B', 'C', 'D', 'E'] as const).map((k) =>
                        q.data_opsi?.opsi?.[k] ? (
                          <div key={k} className="truncate">
                            <strong className="font-mono text-slate-800">
                              {k}.
                            </strong>{' '}
                            {q.data_opsi?.opsi?.[k]}
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: LAPORAN HASIL UJIAN & EVALUASI GEMINI AI                        */}
      {/* ===================================================================== */}
      {activeTab === 'laporan' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Laporan Hasil Ujian Siswa & Evaluasi Kognitif Gemini AI
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Setiap siswa yang menyelesaikan ujian akan muncul di tabel ini.
                Klik <strong>Generate AI Analysis</strong> untuk menganalisis
                kekuatan/kelemahan LOTS vs HOTS.
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Muat Ulang Data
            </button>
          </div>

          {aiErrorBanner && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{aiErrorBanner}</span>
            </div>
          )}

          {results.length === 0 ? (
            <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm font-semibold text-slate-700">
                Belum Ada Hasil Ujian Siswa
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hasil nilai dan analisis AI akan otomatis tercatat di sini
                setelah siswa login menggunakan Token Ujian dan mengumpulkan
                jawaban.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas · Token</th>
                    <th className="py-3 px-4">Paket Ujian</th>
                    <th className="py-3 px-4 text-right">Skor Akhir</th>
                    <th className="py-3 px-4">Log Anti-Cheat</th>
                    <th className="py-3 px-4">Status Analisis AI</th>
                    <th className="py-3 px-4 text-right">Aksi Evaluasi AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {results.map((resItem) => {
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
                          <span>{st?.kelas || '-'}</span>
                          <span className="mx-1.5">·</span>
                          <code className="font-mono font-bold text-slate-800">
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
                              Belum Dianalisis AI
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
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
                                Lihat Hasil AI
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleGenerateAiAnalysis(resItem)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {isBusy
                                ? 'Menganalisis...'
                                : hasAi
                                  ? 'Re-Generate AI Analysis'
                                  : 'Generate AI Analysis'}
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
      )}

      {/* Modal Detail Analisis AI */}
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
                  Laporan Evaluasi Kognitif Gemini AI · LOTS vs HOTS
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
                  3 Rekomendasi Belajar Personalisasi
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
                Tutup Laporan AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
