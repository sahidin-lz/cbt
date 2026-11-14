import React, { useState, useMemo, useEffect } from 'react';
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
  BarChart3,
  Target,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  ExamItem,
  QuestionItem,
  StudentItem,
  ResultItem,
  AnalisisAI,
} from '../types/cbt';
import {
  calculateExamScore,
  calculateStudentLotsVsHots,
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
  | 'kemampuan'
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
  const [studentMapelFilter, setStudentMapelFilter] = useState<string>('SEMUA');

  // Collapsible / Minimizable Left Sidebar State for Student Portal
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cbt_student_sidebar_minimized') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        'cbt_student_sidebar_minimized',
        String(isSidebarMinimized)
      );
    } catch {}
  }, [isSidebarMinimized]);

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

  const studentAvailableMapels = useMemo(() => {
    const set = new Set<string>();
    classMatchedExams.forEach((ex) => {
      const m = getEffectiveMataPelajaran(ex);
      if (m) set.add(m);
    });
    exams.forEach((ex) => {
      const m = getEffectiveMataPelajaran(ex);
      if (m) set.add(m);
    });
    if (set.size === 0) set.add('Sosiologi');
    return Array.from(set);
  }, [classMatchedExams, exams]);

  const filteredClassMatchedExams = useMemo(() => {
    if (studentMapelFilter === 'SEMUA') return classMatchedExams;
    return classMatchedExams.filter(
      (ex) =>
        getEffectiveMataPelajaran(ex).toUpperCase() ===
        studentMapelFilter.toUpperCase()
    );
  }, [classMatchedExams, studentMapelFilter]);

  // All submitted results belonging to this student
  const studentResults = useMemo(() => {
    return results
      .filter((r) => Number(r.student_id) === Number(student.id))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [results, student.id]);

  const filteredStudentResults = useMemo(() => {
    if (studentMapelFilter === 'SEMUA') return studentResults;
    return studentResults.filter((r) => {
      const ex = exams.find((e) => Number(e.id) === Number(r.exam_id));
      return (
        getEffectiveMataPelajaran(ex).toUpperCase() ===
        studentMapelFilter.toUpperCase()
      );
    });
  }, [studentResults, studentMapelFilter, exams]);

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

  const assignedPackageBadge =
    student.kode_soal ||
    proportionalAlloc?.packageCode ||
    student.variasi_paket ||
    'PAKET-A';

  // Comprehensive Student Progress & Competency Profile Analytics
  const studentCompetencyProfile = useMemo(() => {
    const totalAssigned = Math.max(1, classMatchedExams.length);
    const completedCount = studentResults.length;
    const completionPercent = Math.min(
      100,
      Math.round((completedCount / totalAssigned) * 100)
    );

    let inProgressCount = 0;
    classMatchedExams.forEach((ex) => {
      if (!completedExamIds.has(Number(ex.id))) {
        const prog = hasSavedProgressForExam(ex.id);
        if (prog.hasProgress) inProgressCount += 1;
      }
    });

    const scores = studentResults.map((r) => Number(r.skor_angka) || 0);
    const avg =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : 0;
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const lowest = scores.length > 0 ? Math.min(...scores) : 0;
    const passKkmCount = scores.filter((s) => s >= 70).length;
    const passKkmRate =
      scores.length > 0 ? Math.round((passKkmCount / scores.length) * 100) : 0;

    let totalLotsSum = 0;
    let totalHotsSum = 0;
    let totalPgTunggalSum = 0;
    let totalPgTunggalCount = 0;
    let totalPgKompleksSum = 0;
    let totalPgKompleksCount = 0;

    const subjectRows = classMatchedExams.map((ex) => {
      const mapel = getEffectiveMataPelajaran(ex);
      const resItem =
        studentResults.find((r) => Number(r.exam_id) === Number(ex.id)) || null;
      const examQs = questions.filter((q) => Number(q.exam_id) === Number(ex.id));
      const prog = hasSavedProgressForExam(ex.id);

      let lotsScore = 0;
      let hotsScore = 0;
      let pgScore = 0;
      let pgkScore = 0;

      if (resItem) {
        const syncedAns = resolveSyncedStudentAnswersForExam({
          questions: examQs,
          jawabanSiswa: resItem.jawaban_siswa || {},
          student,
          exam: ex,
          recordedScore: resItem.skor_angka,
        });

        const lh = calculateStudentLotsVsHots(
          examQs,
          syncedAns,
          resItem.skor_angka,
          localAiOverrides[resItem.id] || resItem.analisis_ai
        );
        lotsScore = lh.lotsScore;
        hotsScore = lh.hotsScore;

        const pgQs = examQs.filter((q) => q.tipe_soal !== 'Kompleks');
        const pgkQs = examQs.filter((q) => q.tipe_soal === 'Kompleks');

        if (pgQs.length > 0 && Object.keys(syncedAns).length > 0) {
          pgScore = calculateExamScore(pgQs, syncedAns).normalizedScore;
        } else {
          pgScore = lotsScore;
        }

        if (pgkQs.length > 0 && Object.keys(syncedAns).length > 0) {
          pgkScore = calculateExamScore(pgkQs, syncedAns).normalizedScore;
        } else {
          pgkScore = hotsScore;
        }

        totalLotsSum += lotsScore;
        totalHotsSum += hotsScore;
        totalPgTunggalSum += pgScore;
        totalPgTunggalCount += 1;
        totalPgKompleksSum += pgkScore;
        totalPgKompleksCount += 1;
      }

      const scoreVal = resItem ? Number(resItem.skor_angka) || 0 : null;
      let predikat = 'Belum Ujian';
      let predikatTone = 'bg-slate-100 text-slate-700 border-slate-200';
      if (scoreVal !== null) {
        if (scoreVal >= 85) {
          predikat = 'Sangat Baik (A)';
          predikatTone = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        } else if (scoreVal >= 70) {
          predikat = 'Baik / Tuntas (B)';
          predikatTone = 'bg-blue-100 text-blue-800 border-blue-300';
        } else if (scoreVal >= 55) {
          predikat = 'Cukup (C)';
          predikatTone = 'bg-amber-100 text-amber-800 border-amber-300';
        } else {
          predikat = 'Perlu Penguatan (D)';
          predikatTone = 'bg-rose-100 text-rose-800 border-rose-300';
        }
      }

      return {
        exam: ex,
        mapel,
        packageCode: ex.kode_paket || assignedPackageBadge,
        questionCount: examQs.length,
        resItem,
        scoreVal,
        lotsScore: Math.round(lotsScore * 10) / 10,
        hotsScore: Math.round(hotsScore * 10) / 10,
        pgScore: Math.round(pgScore * 10) / 10,
        pgkScore: Math.round(pgkScore * 10) / 10,
        isPassedKkm: scoreVal !== null && scoreVal >= 70,
        inProgress: !resItem && prog.hasProgress,
        answeredDraftCount: prog.answeredCount,
        predikat,
        predikatTone,
      };
    });

    const overallLots =
      completedCount > 0
        ? Math.round((totalLotsSum / completedCount) * 10) / 10
        : 0;
    const overallHots =
      completedCount > 0
        ? Math.round((totalHotsSum / completedCount) * 10) / 10
        : 0;
    const overallPg =
      totalPgTunggalCount > 0
        ? Math.round((totalPgTunggalSum / totalPgTunggalCount) * 10) / 10
        : 0;
    const overallPgk =
      totalPgKompleksCount > 0
        ? Math.round((totalPgKompleksSum / totalPgKompleksCount) * 10) / 10
        : 0;

    let competencyTitle = 'Siap Memulai Evaluasi Kemampuan';
    let competencyBadge = 'BELUM ADA SKOR';
    let competencyTone =
      'from-slate-700 to-slate-900 text-white border-slate-600';
    let narrative =
      'Selesaikan minimal satu paket ujian aktif pada menu Jadwal Ujian untuk melihat peta kemampuan kognitif LOTS, HOTS, serta profil kekuatan akademik Anda secara otomatis.';
    const strengths: string[] = [];
    const recommendations: string[] = [];

    if (completedCount > 0) {
      if (avg >= 85 && overallHots >= 80) {
        competencyTitle = 'Kompetensi Analitis & Penalaran Kritis Unggul';
        competencyBadge = 'PREDIKAT A · SANGAT KOMPETEN';
        competencyTone =
          'from-emerald-600 to-teal-700 text-white border-emerald-500';
        narrative = `Capaian rata-rata akademik Anda (${avg}/100) menunjukkan penguasaan konsep dasar (${overallLots}%) dan daya analisis kasus tingkat tinggi HOTS (${overallHots}%) yang sangat matang dan konsisten.`;
        strengths.push(
          `Penguasaan konsep dasar (LOTS ${overallLots}%) sangat kokoh dan presisi.`,
          `Kemampuan menelaah wacana & studi kasus kritis (HOTS ${overallHots}%) berada di atas rata-rata standar ketuntasan.`,
          `Ketepatan menjawab soal Pilihan Ganda Kompleks mencapai ${overallPgk}%.`
        );
        recommendations.push(
          'Pertahankan ketelitian membaca stimulus wacana panjang pada soal-soal HOTS lintas mata pelajaran.',
          'Jadikan rangkuman pembahasan PDF sebagai referensi pengayaan materi tingkat lanjut.'
        );
      } else if (avg >= 70) {
        competencyTitle = 'Kompetensi Konsep Dasar Kuat & Tuntas KKM';
        competencyBadge = 'PREDIKAT B · KOMPETEN / TUNTAS';
        competencyTone =
          'from-blue-600 to-indigo-700 text-white border-blue-500';
        narrative = `Anda telah mencapai ketuntasan akademik (${avg}/100) dengan pemahaman konsep dasar LOTS sebesar ${overallLots}% dan penalaran analitis HOTS sebesar ${overallHots}%.`;
        strengths.push(
          `Pemahaman definisi, fakta, dan konsep dasar materi (${overallLots}%) sudah tuntas di atas KKM.`,
          `Ketepatan menjawab Pilihan Ganda Tunggal mencapai ${overallPg}%.`
        );
        if (overallHots < overallLots - 5) {
          recommendations.push(
            `Tingkatkan latihan menganalisis soal studi kasus (HOTS saat ini ${overallHots}%) agar seimbang dengan pemahaman konsep dasar Anda.`,
            `Perhatikan soal Pilihan Ganda Kompleks (${overallPgk}%) yang membutuhkan lebih dari satu jawaban benar.`
          );
        } else {
          recommendations.push(
            'Perkuat kembali topik-topik spesifik yang masih bernilai di bawah 85 melalui pembahasan PDF.'
          );
        }
      } else if (avg >= 55) {
        competencyTitle = 'Kompetensi Berkembang — Perlu Penguatan Analitis';
        competencyBadge = 'PREDIKAT C · CUKUP / BERKEMBANG';
        competencyTone =
          'from-amber-500 to-orange-600 text-white border-amber-400';
        narrative = `Skor rata-rata Anda (${avg}/100) menunjukkan fondasi konsep dasar sudah mulai terbentuk (${overallLots}%), namun masih memerlukan penguatan pada soal analisis wacana HOTS (${overallHots}%).`;
        strengths.push(
          `Sudah menyelesaikan ${completedCount} dari ${totalAssigned} paket ujian (${completionPercent}% progres).`,
          `Mampu menjawab sebagian soal konsep dasar (LOTS ${overallLots}%) dengan benar.`
        );
        recommendations.push(
          'Pelajari kembali konsep kunci pada setiap mata pelajaran sebelum memilih opsi jawaban.',
          'Pada soal PG Kompleks, hindari mencentang seluruh opsi sekaligus; pilih 2–3 pernyataan yang paling relevan dengan wacana.'
        );
      } else {
        competencyTitle = 'Perlu Pendampingan & Penguatan Konsep Dasar';
        competencyBadge = 'PREDIKAT D · PERLU REMEDIAL';
        competencyTone = 'from-rose-600 to-red-700 text-white border-rose-500';
        narrative = `Capaian rata-rata saat ini (${avg}/100) masih berada di bawah batas KKM (70). Fokuskan belajar pada penguasaan konsep dasar (LOTS ${overallLots}%) dan latihan membaca soal bertahap.`;
        strengths.push(
          `Partisipasi aktif menyelesaikan ${completedCount} paket evaluasi CBT.`
        );
        recommendations.push(
          'Unduh PDF Pembahasan Soal pada menu Hasil Ujian untuk mempelajari kunci jawaban yang tepat.',
          'Diskusikan butir soal yang terasa sulit bersama Guru mata pelajaran untuk program remedial.'
        );
      }
    }

    return {
      totalAssigned,
      completedCount,
      completionPercent,
      inProgressCount,
      avg,
      highest,
      lowest,
      passKkmCount,
      passKkmRate,
      overallLots,
      overallHots,
      overallPg,
      overallPgk,
      subjectRows,
      competencyTitle,
      competencyBadge,
      competencyTone,
      narrative,
      strengths,
      recommendations,
    };
  }, [
    classMatchedExams,
    studentResults,
    completedExamIds,
    hasSavedProgressForExam,
    questions,
    student,
    localAiOverrides,
    assignedPackageBadge,
  ]);

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
      allStudents,
      exams,
    });
  };

  const studentSidebarMenus = [
    {
      id: 'beranda' as const,
      num: '01',
      title: 'Beranda Siswa',
      subtitle: 'Ringkasan & Info Aktif',
      badge: `${activeClassExams.length} Aktif`,
      icon: Home,
      activeClass:
        'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-xs ring-2 ring-blue-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-blue-50 text-blue-600 border border-blue-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-blue-50 text-blue-700 border border-blue-200/70',
    },
    {
      id: 'jadwal' as const,
      num: '02',
      title: 'Jadwal & Ujian',
      subtitle: `${activeClassExams.length} Sesi Dibuka`,
      badge: `${classMatchedExams.length}`,
      icon: Calendar,
      activeClass:
        'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-xs ring-2 ring-emerald-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-emerald-50 text-emerald-600 border border-emerald-200/70',
      badgeActive: 'bg-amber-400 text-slate-950',
      badgeIdle: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'kemampuan' as const,
      num: '03',
      title: 'Laporan Kemampuan',
      subtitle: 'Progres & Peta Kognitif',
      badge: `${studentCompetencyProfile.completionPercent}%`,
      icon: BarChart3,
      activeClass:
        'bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700 text-white border-indigo-500 shadow-xs ring-2 ring-purple-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-indigo-600 text-white',
      badgeActive: 'bg-amber-400 text-slate-950',
      badgeIdle: 'bg-purple-100 text-purple-800 border border-purple-200',
    },
    {
      id: 'hasil' as const,
      num: '04',
      title: 'Hasil & Nilai PDF',
      subtitle: 'Skor & Pembahasan',
      badge: `${studentResults.length}`,
      icon: Award,
      activeClass:
        'bg-gradient-to-r from-violet-600 to-purple-700 text-white border-violet-500 shadow-xs ring-2 ring-violet-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-violet-50 text-violet-600 border border-violet-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-violet-100 text-violet-800',
    },
    {
      id: 'riwayat' as const,
      num: '05',
      title: 'Riwayat Ujian',
      subtitle: 'Log Status Sesi',
      badge: `${studentCompetencyProfile.completedCount}/${studentCompetencyProfile.totalAssigned}`,
      icon: History,
      activeClass:
        'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-500 shadow-xs ring-2 ring-amber-300/60',
      iconBoxActive: 'bg-white/20 text-white',
      iconBoxIdle: 'bg-amber-50 text-amber-600 border border-amber-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-amber-50 text-amber-800 border border-amber-200/70',
    },
    {
      id: 'profil' as const,
      num: '06',
      title: 'Profil & Password',
      subtitle: 'Atur Token Login',
      badge: 'AKUN',
      icon: User,
      activeClass:
        'bg-gradient-to-r from-cyan-600 to-blue-700 text-white border-cyan-500 shadow-xs ring-2 ring-cyan-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-cyan-50 text-cyan-600 border border-cyan-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-cyan-50 text-cyan-800 border border-cyan-200/70',
    },
  ];

  const activeStudentMenuObj =
    studentSidebarMenus.find((m) => m.id === activeMenu) ||
    studentSidebarMenus[0];

  return (
    <div className="max-w-[1440px] mx-auto w-full py-5 px-3 sm:px-6">
      <div className="flex flex-col lg:flex-row items-start gap-5">
        {/* ================================================================= */}
        {/* LEFT COLLAPSIBLE / MINIMIZABLE SIDEBAR NAVIGATION (PORTAL SISWA)  */}
        {/* ================================================================= */}
        <aside
          aria-label="Menu Utama Portal Siswa Samping Kiri"
          className={`w-full lg:sticky lg:top-20 shrink-0 transition-all duration-300 ease-in-out ${
            isSidebarMinimized ? 'lg:w-20' : 'lg:w-72'
          }`}
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            {/* Sidebar Header with Minimize / Expand Toggle */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-3.5 border-b border-indigo-900 flex items-center justify-between gap-2">
              {!isSidebarMinimized && (
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                    Menu Utama Siswa
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    Progres Ujian: {studentCompetencyProfile.completionPercent}%
                  </div>
                </div>
              )}

              {/* Desktop Minimize / Expand Button */}
              <button
                type="button"
                onClick={() => setIsSidebarMinimized((prev) => !prev)}
                title={
                  isSidebarMinimized
                    ? 'Buka / Perlebar Menu Samping Kiri'
                    : 'Minimize / Kecilkan Menu Samping Kiri'
                }
                className={`hidden lg:inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-xs transition-all cursor-pointer ${
                  isSidebarMinimized ? 'w-full py-2 px-2 flex-col' : 'px-2.5 py-1.5'
                }`}
              >
                {isSidebarMinimized ? (
                  <>
                    <PanelLeftOpen className="w-4 h-4 text-amber-300" />
                    <span className="text-[9px] uppercase tracking-wider text-amber-300">
                      Buka
                    </span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-4 h-4 text-amber-300" />
                    <span className="text-[11px]">Minimize</span>
                  </>
                )}
              </button>

              {/* Mobile / Tablet Open-Close Menu Button */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                {isMobileSidebarOpen ? (
                  <>
                    <PanelLeftClose className="w-4 h-4" />
                    <span>Tutup Menu</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="w-4 h-4" />
                    <span>Buka Menu ({activeStudentMenuObj.title})</span>
                  </>
                )}
              </button>
            </div>

            {/* Sidebar Menu Items List */}
            <nav
              aria-label="Navigasi Portal Akun Siswa"
              className={`${
                isMobileSidebarOpen ? 'block' : 'hidden lg:block'
              } p-2.5 space-y-1.5 bg-gradient-to-b from-slate-50/70 to-white`}
            >
              {studentSidebarMenus.map((item) => {
                const Icon = item.icon;
                const isSelected = activeMenu === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.num}. ${item.title} — ${item.subtitle} (${item.badge})`}
                    onClick={() => {
                      setActiveMenu(item.id);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full rounded-xl border transition-all cursor-pointer flex items-center ${
                      isSidebarMinimized
                        ? 'lg:justify-center lg:p-2.5 p-3 justify-between'
                        : 'p-2.5 justify-between gap-2.5'
                    } ${
                      isSelected
                        ? item.activeClass
                        : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200/90 hover:border-blue-300'
                    }`}
                  >
                    <div
                      className={`flex items-center ${
                        isSidebarMinimized
                          ? 'lg:flex-col lg:gap-1 gap-2.5'
                          : 'gap-2.5 min-w-0'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          isSelected ? item.iconBoxActive : item.iconBoxIdle
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      {isSidebarMinimized ? (
                        <span
                          className={`hidden lg:block text-[10px] font-mono font-extrabold leading-none ${
                            isSelected ? 'text-white' : 'text-slate-600'
                          }`}
                        >
                          {item.num}
                        </span>
                      ) : null}

                      <div
                        className={`text-left min-w-0 ${
                          isSidebarMinimized ? 'lg:hidden block' : 'block'
                        }`}
                      >
                        <div className="text-xs font-extrabold leading-snug">
                          {item.num}. {item.title}
                        </div>
                        <div
                          className={`text-[11px] leading-tight mt-0.5 ${
                            isSelected ? 'text-white/85' : 'text-slate-500'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono tabular-nums rounded-md font-extrabold shrink-0 ${
                        isSidebarMinimized ? 'lg:hidden inline-block' : 'inline-block'
                      } ${isSelected ? item.badgeActive : item.badgeIdle}`}
                    >
                      {item.badge}
                    </span>
                  </button>
                );
              })}

              {/* Sidebar Bottom Quick Actions (Download Kartu PDF & Logout) */}
              <div className="pt-2.5 mt-2 border-t border-slate-200 space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    downloadStudentTokenCardsPdf([student], {
                      kelasLabel: `Kartu Akun & Nilai - ${student.nama}`,
                      exams,
                      questions,
                      results,
                      allStudents,
                      includeSummaryPage: false,
                    })
                  }
                  title="Unduh Kartu Akun & Token (.PDF)"
                  className={`w-full rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold text-xs transition-colors cursor-pointer flex items-center ${
                    isSidebarMinimized
                      ? 'lg:justify-center lg:p-2.5 px-3 py-2 gap-2'
                      : 'px-3 py-2 gap-2'
                  }`}
                >
                  <Download className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className={isSidebarMinimized ? 'lg:hidden' : ''}>
                    Unduh Kartu &amp; Token (.PDF)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  title="Keluar dari Akun Siswa"
                  className={`w-full rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer flex items-center ${
                    isSidebarMinimized
                      ? 'lg:justify-center lg:p-2.5 px-3 py-2 gap-2'
                      : 'px-3 py-2 gap-2'
                  }`}
                >
                  <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className={isSidebarMinimized ? 'lg:hidden' : ''}>
                    Keluar Akun Siswa
                  </span>
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* ================================================================= */}
        {/* RIGHT MAIN WORKSPACE AREA (PORTAL SISWA)                          */}
        {/* ================================================================= */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Compact Institutional Student Account Banner */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white">
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-emerald-400 via-cyan-400 to-blue-500" />
              <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsSidebarMinimized((prev) => !prev)}
                    title={
                      isSidebarMinimized
                        ? 'Buka Lebar Menu Samping Kiri'
                        : 'Minimize / Kecilkan Menu Samping Kiri'
                    }
                    className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-amber-300 transition-colors cursor-pointer shrink-0 mt-0.5"
                  >
                    {isSidebarMinimized ? (
                      <PanelLeftOpen className="w-4 h-4" />
                    ) : (
                      <PanelLeftClose className="w-4 h-4" />
                    )}
                  </button>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Akun Siswa Terverifikasi</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg font-mono font-bold bg-indigo-500/30 text-amber-300 border border-indigo-400/30">
                        Kelas {student.kelas} · Absen #{absenInfo.noAbsen} ({absenInfo.ganjilGenapLabel})
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg font-mono font-extrabold bg-amber-400 text-slate-950">
                        <Shuffle className="w-3 h-3" />
                        <span>{assignedPackageBadge}</span>
                      </span>
                    </div>
                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                      Halo, {student.nama} —{' '}
                      <span className="text-amber-300">
                        {activeStudentMenuObj.title}
                      </span>
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 text-xs backdrop-blur-xs">
                    <div className="text-[10px] uppercase tracking-wider text-blue-200 font-semibold">
                      Password / Token Login Saya
                    </div>
                    <div className="font-mono font-extrabold text-sm text-amber-300 mt-0.5 flex items-center gap-2">
                      <span>{student.password_login || student.token_ujian}</span>
                      <button
                        type="button"
                        onClick={() => setActiveMenu('profil')}
                        className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-colors"
                      >
                        Ubah
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
          {/* 4 Colorful KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 border border-blue-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-blue-800">
                <span>Ujian Aktif Hari Ini</span>
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <Calendar className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-950 mt-2">
                {activeClassExams.length}{' '}
                <span className="text-xs font-sans font-semibold text-blue-700">
                  sesi dibuka
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                Khusus Kelas {student.kelas} (Tingkat {studentTingkat})
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 border border-emerald-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                <span>Progres Penyelesaian</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-950 mt-2">
                {studentCompetencyProfile.completedCount}/
                {studentCompetencyProfile.totalAssigned}{' '}
                <span className="text-xs font-sans font-semibold text-emerald-700">
                  ({studentCompetencyProfile.completionPercent}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                {studentCompetencyProfile.passKkmCount} paket lulus KKM (&ge; 70)
              </p>
            </div>

            <div className="bg-gradient-to-br from-violet-50/90 via-white to-purple-50/50 border border-violet-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-violet-800">
                <span>Rata-Rata Nilai Akademik</span>
                <span className="p-1.5 rounded-lg bg-violet-100 text-violet-700">
                  <Award className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-violet-950 mt-2">
                {averageScore !== null ? `${averageScore}` : '-'}{' '}
                <span className="text-xs font-sans font-semibold text-violet-700">
                  / 100
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                LOTS: {studentCompetencyProfile.overallLots}% · HOTS:{' '}
                {studentCompetencyProfile.overallHots}%
              </p>
            </div>

            <div className="bg-gradient-to-br from-amber-50/90 via-white to-orange-50/50 border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                <span>Paket Distribusi Soal</span>
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Shuffle className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl font-extrabold font-mono text-amber-950 mt-2">
                {assignedPackageBadge}
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                Absen #{absenInfo.noAbsen} ({absenInfo.ganjilGenapLabel}) · Terkunci Presisi
              </p>
            </div>
          </div>

          {/* Highlighted Dashboard Progres & Peta Kemampuan Siswa on Beranda */}
          <div className="bg-white border border-indigo-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Ringkasan Progres Belajar &amp; Peta Kemampuan Siswa</span>
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                  {studentCompetencyProfile.competencyTitle}
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-lg text-[11px] font-mono font-extrabold bg-white/15 border border-white/25 text-amber-300">
                  {studentCompetencyProfile.competencyBadge}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveMenu('kemampuan')}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors cursor-pointer shadow-2xs"
                >
                  Buka Laporan Kemampuan Lengkap →
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-3">
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {studentCompetencyProfile.narrative}
                </p>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Progres Penyelesaian Paket Ujian Kelas</span>
                    <span className="font-mono text-indigo-700">
                      {studentCompetencyProfile.completedCount} /{' '}
                      {studentCompetencyProfile.totalAssigned} Paket (
                      {studentCompetencyProfile.completionPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(
                          4,
                          studentCompetencyProfile.completionPercent
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                    <span>Pemahaman Konsep Dasar (LOTS)</span>
                    <span className="font-mono font-extrabold text-blue-700">
                      {studentCompetencyProfile.overallLots}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-blue-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, studentCompetencyProfile.overallLots)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-blue-800/80">
                    Penguasaan definisi, klasifikasi &amp; konsep esensial
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-950">
                    <span>Penalaran Kritis &amp; Analisis (HOTS)</span>
                    <span className="font-mono font-extrabold text-purple-700">
                      {studentCompetencyProfile.overallHots}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-purple-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, studentCompetencyProfile.overallHots)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-purple-800/80">
                    Evaluasi studi kasus, wacana &amp; pemecahan masalah
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span>Ketepatan Pilihan Ganda Tunggal</span>
                    <span className="font-mono font-extrabold text-emerald-700">
                      {studentCompetencyProfile.overallPg}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-emerald-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, studentCompetencyProfile.overallPg)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-emerald-800/80">
                    Akurasi menjawab soal 1 kunci jawaban utama
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span>Ketepatan PG Kompleks (Multi-Opsi)</span>
                    <span className="font-mono font-extrabold text-amber-800">
                      {studentCompetencyProfile.overallPgk}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-amber-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, studentCompetencyProfile.overallPgk)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-amber-900/80">
                    Akurasi memilih kombinasi pernyataan benar
                  </div>
                </div>
              </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter Mata Pelajaran Jadwal"
                value={studentMapelFilter}
                onChange={(e) => setStudentMapelFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold border border-indigo-200 cursor-pointer"
              >
                <option value="SEMUA">Semua Mata Pelajaran ({studentAvailableMapels.length} Mapel)</option>
                {studentAvailableMapels.map((mp) => (
                  <option key={mp} value={mp}>
                    Mapel: {mp}
                  </option>
                ))}
              </select>
              <span className="px-3 py-1.5 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-300">
                Kode Paket Anda: {assignedPackageBadge}
              </span>
            </div>
          </div>

          <div className="p-6">
            {filteredClassMatchedExams.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-bold text-slate-700">
                  Belum Ada Jadwal Ujian untuk Kelas {student.kelas} pada Filter Mapel Ini
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Jadwal ujian akan otomatis muncul di halaman ini segera
                  setelah ditambahkan oleh Guru.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredClassMatchedExams.map((ex) => {
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
      {/* MENU 2B: DASHBOARD LAPORAN PROGRES & PETA KEMAMPUAN SISWA           */}
      {/* =================================================================== */}
      {activeMenu === 'kemampuan' && (
        <div className="space-y-6">
          {/* Header Banner & Ringkasan Diagnostik Kemampuan */}
          <div className="bg-white border border-indigo-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-900 px-6 py-5 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950">
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Dashboard Laporan Progres &amp; Kemampuan Siswa</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md font-mono font-bold bg-white/15 text-blue-200 border border-white/15">
                    Kelas {student.kelas} · Paket {assignedPackageBadge}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  Peta Kemampuan Kognitif, Progres Ujian &amp; Evaluasi Belajar — {student.nama}
                </h2>
                <p className="text-xs text-blue-200/90 max-w-3xl leading-relaxed">
                  Laporan ini mencerminkan perkembangan kemampuan akademik Anda secara objektif berdasarkan hasil ujian yang telah diselesaikan, meliputi penguasaan konsep dasar (LOTS), penalaran analisis kritis (HOTS), serta ketepatan menjawab soal per mata pelajaran.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <select
                  aria-label="Filter Mata Pelajaran Laporan Kemampuan"
                  value={studentMapelFilter}
                  onChange={(e) => setStudentMapelFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold border border-indigo-200 cursor-pointer"
                >
                  <option value="SEMUA">
                    Semua Mata Pelajaran ({studentAvailableMapels.length} Mapel)
                  </option>
                  {studentAvailableMapels.map((mp) => (
                    <option key={mp} value={mp}>
                      Mapel: {mp}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    downloadStudentTokenCardsPdf([student], {
                      kelasLabel: `Rapor Kemampuan & Kartu Nilai - ${student.nama}`,
                      exams,
                      questions,
                      results,
                      allStudents,
                      includeSummaryPage: false,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Rapor &amp; Kartu Nilai (.PDF)</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* 4 Kartu KPI Utama Kemampuan & Progres */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50/40 border border-blue-200/90">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                    Progres Penyelesaian Ujian
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-950 mt-1">
                    {studentCompetencyProfile.completionPercent}%
                    <span className="text-xs font-sans font-semibold text-blue-700 ml-1.5">
                      ({studentCompetencyProfile.completedCount}/
                      {studentCompetencyProfile.totalAssigned} Paket)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-blue-200/70 rounded-full overflow-hidden mt-2.5">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{
                        width: `${Math.max(
                          5,
                          studentCompetencyProfile.completionPercent
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 border border-emerald-200/90">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Rata-Rata Nilai &amp; Ketuntasan
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-950 mt-1">
                    {studentCompetencyProfile.completedCount > 0
                      ? studentCompetencyProfile.avg
                      : '-'}
                    <span className="text-xs font-sans font-semibold text-emerald-700 ml-1">
                      / 100
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-800 mt-2">
                    Lulus KKM (&ge;70):{' '}
                    <span className="font-mono font-bold">
                      {studentCompetencyProfile.passKkmCount}/
                      {studentCompetencyProfile.completedCount || 0} ujian (
                      {studentCompetencyProfile.passKkmRate}%)
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-blue-50/40 border border-indigo-200/90">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                    Penguasaan Konsep Dasar (LOTS)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-indigo-950 mt-1">
                    {studentCompetencyProfile.overallLots}%
                  </div>
                  <div className="text-[11px] text-indigo-800/80 mt-2">
                    Pemahaman fakta, definisi &amp; konsep esensial (C1–C3)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40 border border-purple-200/90">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                    Penalaran Kritis &amp; Analisis (HOTS)
                  </div>
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-purple-950 mt-1">
                    {studentCompetencyProfile.overallHots}%
                  </div>
                  <div className="text-[11px] text-purple-800/80 mt-2">
                    Analisis studi kasus, evaluasi wacana &amp; sintesis (C4–C6)
                  </div>
                </div>
              </div>

              {/* Profil Predikat Kemampuan & Peta Dimensi Kognitif */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left: Diagnostic Competency Card */}
                <div className="lg:col-span-5 rounded-2xl border border-indigo-200 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Target className="w-4 h-4" />
                        <span>Profil Kemampuan Siswa</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-amber-400 text-slate-950">
                        {studentCompetencyProfile.competencyBadge}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-white leading-snug">
                      {studentCompetencyProfile.competencyTitle}
                    </h3>
                    <p className="text-xs text-blue-100/90 leading-relaxed">
                      {studentCompetencyProfile.narrative}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/15 text-xs">
                    <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                      <div className="text-[10px] uppercase tracking-wider text-blue-200">
                        Skor Tertinggi Saya
                      </div>
                      <div className="text-lg font-extrabold font-mono text-emerald-300 mt-0.5">
                        {studentCompetencyProfile.completedCount > 0
                          ? `${studentCompetencyProfile.highest}/100`
                          : '-'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                      <div className="text-[10px] uppercase tracking-wider text-blue-200">
                        Skor Terendah Saya
                      </div>
                      <div className="text-lg font-extrabold font-mono text-amber-300 mt-0.5">
                        {studentCompetencyProfile.completedCount > 0
                          ? `${studentCompetencyProfile.lowest}/100`
                          : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: 4 Visual Mastery Bars */}
                <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Peta Penguasaan Dimensi Kognitif &amp; Tipe Soal
                      </h3>
                      <p className="text-xs text-slate-600">
                        Persentase ketepatan jawaban Anda berdasarkan tingkat berpikir dan jenis soal
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-white border border-slate-200 text-slate-700">
                      Standar KKM: 70%
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          1. Pemahaman Konsep Dasar &amp; Aplikasi (LOTS C1–C3)
                        </span>
                        <span className="font-mono font-extrabold text-blue-700">
                          {studentCompetencyProfile.overallLots}%
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, studentCompetencyProfile.overallLots)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          2. Penalaran Kritis, Analisis Wacana &amp; Evaluasi (HOTS C4–C6)
                        </span>
                        <span className="font-mono font-extrabold text-purple-700">
                          {studentCompetencyProfile.overallHots}%
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-600 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, studentCompetencyProfile.overallHots)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          3. Akurasi Soal Pilihan Ganda Tunggal (1 Kunci Jawaban)
                        </span>
                        <span className="font-mono font-extrabold text-emerald-700">
                          {studentCompetencyProfile.overallPg}%
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, studentCompetencyProfile.overallPg)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          4. Akurasi Soal Pilihan Ganda Kompleks (Multi-Jawaban)
                        </span>
                        <span className="font-mono font-extrabold text-amber-700">
                          {studentCompetencyProfile.overallPgk}%
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, studentCompetencyProfile.overallPgk)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kekuatan Akademik & Rekomendasi Pengembangan */}
              {studentCompetencyProfile.completedCount > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Indikator Kekuatan Kemampuan Anda</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-emerald-950 list-disc list-inside leading-relaxed">
                      {studentCompetencyProfile.strengths.map((str, idx) => (
                        <li key={idx}>{str}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-900">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>Fokus Penguatan &amp; Rekomendasi Belajar</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-amber-950 list-disc list-inside leading-relaxed">
                      {studentCompetencyProfile.recommendations.map(
                        (rec, idx) => (
                          <li key={idx}>{rec}</li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Rincian Capaian & Progres per Mata Pelajaran / Paket Ujian */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Rincian Progres &amp; Peta Kemampuan per Mata Pelajaran
                    </h3>
                    <p className="text-xs text-slate-600">
                      Daftar paket ujian kelas {student.kelas} beserta perbandingan skor terhadap batas KKM (70)
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-slate-200 text-xs font-bold text-slate-800">
                        <th className="py-3.5 px-4">Mata Pelajaran &amp; Paket Ujian</th>
                        <th className="py-3.5 px-4">Kode Paket</th>
                        <th className="py-3.5 px-4">Progres &amp; Visualisasi Skor</th>
                        <th className="py-3.5 px-4 text-right">LOTS / HOTS</th>
                        <th className="py-3.5 px-4 text-right">Skor Akhir</th>
                        <th className="py-3.5 px-4">Predikat Kemampuan</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {studentCompetencyProfile.subjectRows
                        .filter((row) =>
                          studentMapelFilter === 'SEMUA'
                            ? true
                            : row.mapel.toUpperCase() ===
                              studentMapelFilter.toUpperCase()
                        )
                        .map((row) => {
                          const isScoreShown =
                            row.exam.tampilkan_nilai !== false;
                          return (
                            <tr
                              key={row.exam.id}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white">
                                    {row.mapel}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {row.questionCount} Soal
                                  </span>
                                </div>
                                <div className="font-bold text-slate-900 text-sm mt-1">
                                  {row.exam.judul_ujian}
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <span className="px-2.5 py-1 rounded-md font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  {row.packageCode}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 min-w-[180px]">
                                {row.resItem && isScoreShown ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span
                                        className={`font-bold ${
                                          row.isPassedKkm
                                            ? 'text-emerald-700'
                                            : 'text-amber-700'
                                        }`}
                                      >
                                        {row.isPassedKkm
                                          ? 'Tuntas KKM (≥70)'
                                          : 'Di Bawah KKM (<70)'}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {row.scoreVal}/100
                                      </span>
                                    </div>
                                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          (row.scoreVal || 0) >= 85
                                            ? 'bg-emerald-600'
                                            : (row.scoreVal || 0) >= 70
                                            ? 'bg-blue-600'
                                            : (row.scoreVal || 0) >= 55
                                            ? 'bg-amber-500'
                                            : 'bg-rose-600'
                                        }`}
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            Math.max(4, row.scoreVal || 0)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : row.inProgress ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                                    <span>
                                      Sedang Dikerjakan ({row.answeredDraftCount}{' '}
                                      dijawab)
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Menunggu pengerjaan ujian
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                                {row.resItem && isScoreShown ? (
                                  <div className="space-y-0.5">
                                    <div className="text-blue-700 font-bold">
                                      LOTS: {row.lotsScore}%
                                    </div>
                                    <div className="text-purple-700 font-bold">
                                      HOTS: {row.hotsScore}%
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono tabular-nums font-extrabold text-base">
                                {row.resItem ? (
                                  isScoreShown ? (
                                    <span className="text-slate-900">
                                      {row.scoreVal}
                                      <span className="text-xs font-normal text-slate-400">
                                        /100
                                      </span>
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

                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${row.predikatTone}`}
                                >
                                  {row.predikat}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-right">
                                {row.resItem && isScoreShown ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDownloadResultPdf(row.resItem!)
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-2xs"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Unduh PDF</span>
                                  </button>
                                ) : (row.exam.status_ujian || 'AKTIF') ===
                                  'AKTIF' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenStartExamModal(row.exam)
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Kerjakan</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
            <select
              aria-label="Filter Mata Pelajaran Hasil"
              value={studentMapelFilter}
              onChange={(e) => setStudentMapelFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold border border-indigo-200 cursor-pointer"
            >
              <option value="SEMUA">Semua Mata Pelajaran ({studentAvailableMapels.length} Mapel)</option>
              {studentAvailableMapels.map((mp) => (
                <option key={mp} value={mp}>
                  Mapel: {mp}
                </option>
              ))}
            </select>
          </div>

          <div className="p-6 space-y-5">
            {filteredStudentResults.length === 0 ? (
              <div className="py-12 text-center space-y-3 border border-dashed border-slate-200 rounded-xl">
                <Award className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  Belum Ada Hasil Nilai Ujian pada Filter Mata Pelajaran Ini
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
              filteredStudentResults.map((resItem) => {
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
            <select
              aria-label="Filter Mata Pelajaran Riwayat"
              value={studentMapelFilter}
              onChange={(e) => setStudentMapelFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold border border-indigo-200 cursor-pointer"
            >
              <option value="SEMUA">Semua Mata Pelajaran ({studentAvailableMapels.length} Mapel)</option>
              {studentAvailableMapels.map((mp) => (
                <option key={mp} value={mp}>
                  Mapel: {mp}
                </option>
              ))}
            </select>
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
                  {filteredClassMatchedExams.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        Belum ada riwayat ujian pada kelas {student.kelas}.
                      </td>
                    </tr>
                  ) : (
                    filteredClassMatchedExams.map((ex, idx) => {
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
      </div>
    </div>
  );
};
