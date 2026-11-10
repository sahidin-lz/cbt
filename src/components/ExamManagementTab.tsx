import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Unlock,
  Lock,
  Layers,
  FileSpreadsheet,
  Award,
  ChevronDown,
  ChevronUp,
  Table,
  LayoutList,
  Eye,
  RefreshCw,
  HelpCircle,
  Shuffle,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from '../types/cbt';
import { classifyQuestionCognitiveLevel, isExamMatchedForStudentClass } from '../utils/cbtLogic';
import { MathAndTableRenderer } from './MathAndTableRenderer';

interface ExamManagementTabProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  onRefreshData: () => Promise<void>;
  onUpdateStudentStatus: (student: StudentItem, nextStatus: string) => Promise<void>;
  onBatchDistributePackages?: (targetClass?: string) => Promise<void>;
}

export const ExamManagementTab: React.FC<ExamManagementTabProps> = ({
  exams,
  questions,
  students,
  results,
  onRefreshData,
  onUpdateStudentStatus,
  onBatchDistributePackages,
}) => {
  // Extract distinct class list sorted alphabetically
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.kelas && s.kelas.trim()) {
        set.add(s.kelas.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  // Selected class state (defaults to first class if available, or 'ALL')
  const [selectedClass, setSelectedClass] = useState<string>(
    uniqueClasses.length > 0 ? uniqueClasses[0] : 'ALL'
  );

  // Active view mode: 'cards' (Daftar Siswa & Analisis Butir Soal) or 'matrix' (Matriks Siswa x Soal)
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards');

  // Search and filter for students in selected class
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [packageFilter, setPackageFilter] = useState<string>('ALL');
  const [isDistributing, setIsDistributing] = useState(false);

  // Selected question modal / detail
  const [selectedQuestionDetail, setSelectedQuestionDetail] = useState<QuestionItem | null>(null);

  // Selected student for full answers modal
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<{
    student: StudentItem;
    result: ResultItem | null;
  } | null>(null);

  // Expanded question list in item analysis
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Record<number, boolean>>({});

  // Loading state for manual refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Handle class selection
  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setStudentSearch('');
    setStatusFilter('ALL');
    setPackageFilter('ALL');
  };

  // Filter students by selected class
  const classStudents = useMemo(() => {
    if (selectedClass === 'ALL') return students;
    return students.filter((s) => s.kelas.trim() === selectedClass.trim());
  }, [students, selectedClass]);

  // Find exams matched with this class
  const matchedExams = useMemo(() => {
    if (selectedClass === 'ALL') return exams;
    const directMatches = exams.filter((e) => isExamMatchedForStudentClass(e, selectedClass));
    if (directMatches.length > 0) return directMatches;
    return exams;
  }, [exams, selectedClass]);

  // Currently focused exam for item analysis
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  const activeExam = useMemo(() => {
    if (matchedExams.length === 0) return null;
    if (selectedExamId !== null) {
      const found = matchedExams.find((e) => e.id === selectedExamId);
      if (found) return found;
    }
    return matchedExams[0];
  }, [matchedExams, selectedExamId]);

  // Questions belonging to the active exam
  const examQuestions = useMemo(() => {
    if (!activeExam) return [];
    return questions.filter((q) => Number(q.exam_id) === Number(activeExam.id));
  }, [questions, activeExam]);

  // Results for students in this class
  const classResults = useMemo(() => {
    const classStudentIds = new Set(classStudents.map((s) => s.id));
    return results.filter((r) => {
      const matchStudent = classStudentIds.has(r.student_id);
      const matchExam = activeExam ? Number(r.exam_id) === Number(activeExam.id) : true;
      return matchStudent && matchExam;
    });
  }, [results, classStudents, activeExam]);

  // Map student ID to their result
  const studentResultMap = useMemo(() => {
    const map = new Map<number, ResultItem>();
    classResults.forEach((r) => {
      map.set(r.student_id, r);
    });
    return map;
  }, [classResults]);

  // Class KPI Summary
  const kpiStats = useMemo(() => {
    const total = classStudents.length;
    let sedangUjian = 0;
    let selesai = 0;
    let diblokir = 0;
    let belumMulai = 0;

    classStudents.forEach((s) => {
      const status = s.status_ujian || 'Belum Mulai';
      if (status === 'Sedang Ujian') sedangUjian++;
      else if (status === 'Selesai') selesai++;
      else if (status === 'Diblokir') diblokir++;
      else belumMulai++;
    });

    const finishedResults = classResults.filter((r) => typeof r.skor_angka === 'number');
    const avgScore =
      finishedResults.length > 0
        ? Math.round(
            finishedResults.reduce((acc, curr) => acc + curr.skor_angka, 0) /
              finishedResults.length
          )
        : null;

    const highestScore =
      finishedResults.length > 0
        ? Math.max(...finishedResults.map((r) => r.skor_angka))
        : null;

    const lowestScore =
      finishedResults.length > 0
        ? Math.min(...finishedResults.map((r) => r.skor_angka))
        : null;

    return {
      total,
      sedangUjian,
      selesai,
      diblokir,
      belumMulai,
      avgScore,
      highestScore,
      lowestScore,
      participatedCount: finishedResults.length,
    };
  }, [classStudents, classResults]);

  // Filtered students for table view
  const filteredStudents = useMemo(() => {
    return classStudents.filter((s) => {
      const matchSearch = studentSearch
        ? s.nama.toLowerCase().includes(studentSearch.toLowerCase()) ||
          s.token_ujian.toLowerCase().includes(studentSearch.toLowerCase())
        : true;
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : (s.status_ujian || 'Belum Mulai') === statusFilter;
      const studentPkg = s.kode_soal || s.variasi_paket || 'PAKET-A';
      const matchPackage =
        packageFilter === 'ALL'
          ? true
          : studentPkg === packageFilter;
      return matchSearch && matchStatus && matchPackage;
    });
  }, [classStudents, studentSearch, statusFilter, packageFilter]);

  // Question-by-question analysis for this class
  const questionAnalysis = useMemo(() => {
    if (examQuestions.length === 0) return [];

    return examQuestions.map((q, index) => {
      const qIdStr = String(q.id);
      const cognitiveLevel = classifyQuestionCognitiveLevel(q);
      const isKompleks = (q.tipe_soal || '').toLowerCase().includes('kompleks');
      const correctKeys = q.kunci_jawaban || [];

      // Collect answers from all finished students in this class
      let totalAnswered = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      const optionCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      const correctStudentNames: string[] = [];
      const incorrectStudentDetails: Array<{ name: string; chosen: string[] }> = [];

      classStudents.forEach((student) => {
        const res = studentResultMap.get(student.id);
        if (!res || !res.jawaban_siswa) return;

        const studentAns = res.jawaban_siswa[qIdStr];
        if (studentAns && Array.isArray(studentAns) && studentAns.length > 0) {
          totalAnswered++;

          // Tally option distribution
          studentAns.forEach((opt) => {
            const upper = opt.toUpperCase().trim();
            if (optionCounts[upper] !== undefined) {
              optionCounts[upper]++;
            }
          });

          // Check correctness
          const isCorrect =
            studentAns.length === correctKeys.length &&
            studentAns.every((ans) => correctKeys.includes(ans));

          if (isCorrect) {
            correctCount++;
            correctStudentNames.push(student.nama);
          } else {
            incorrectCount++;
            incorrectStudentDetails.push({
              name: student.nama,
              chosen: studentAns,
            });
          }
        } else {
          // Did not answer or left empty
          incorrectCount++;
          incorrectStudentDetails.push({
            name: student.nama,
            chosen: ['(Kosong)'],
          });
        }
      });

      const masteryRate =
        totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

      let difficultyCategory = 'Sedang';
      let difficultyColor = 'text-amber-700 bg-amber-50 border-amber-200';
      if (masteryRate >= 75) {
        difficultyCategory = 'Mudah / Tuntas Tinggi';
        difficultyColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (masteryRate < 40) {
        difficultyCategory = 'Sukar / Perlu Remedial';
        difficultyColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }

      return {
        question: q,
        index: index + 1,
        cognitiveLevel,
        isKompleks,
        correctKeys,
        totalAnswered,
        correctCount,
        incorrectCount,
        masteryRate,
        difficultyCategory,
        difficultyColor,
        optionCounts,
        correctStudentNames,
        incorrectStudentDetails,
      };
    });
  }, [examQuestions, classStudents, studentResultMap]);

  // Toggle question accordion in analysis
  const toggleQuestionExpand = (qId: number) => {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setActionFeedback(null);
    try {
      await onRefreshData();
      setActionFeedback({
        type: 'success',
        message: 'Data ujian dan status siswa berhasil diperbarui.',
      });
    } catch {
      setActionFeedback({
        type: 'error',
        message: 'Gagal memperbarui data ujian.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Status update wrapper
  const handleStatusChange = async (student: StudentItem, nextStatus: string) => {
    setActionFeedback(null);
    try {
      await onUpdateStudentStatus(student, nextStatus);
      setActionFeedback({
        type: 'success',
        message: `Status siswa "${student.nama}" berhasil diubah menjadi "${nextStatus}".`,
      });
    } catch {
      setActionFeedback({
        type: 'error',
        message: `Gagal memperbarui status siswa "${student.nama}".`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Pusat Kendali Asesmen CBT</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Manajemen Ujian & Analisis Butir Soal Kelas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pantau siswa yang sedang ujian secara real-time, evaluasi nilai akhir, serta analisis ketuntasan setiap soal yang dijawab benar vs salah per kelas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View mode toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Daftar & Analisis Soal</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'matrix'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Matriks Siswa × Soal</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isRefreshing ? 'Memperbarui...' : 'Segarkan Data'}</span>
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div
          role="status"
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-[11px] font-semibold underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* KLIK KELAS: Interactive Class Selector Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>Pilih Kelas / Rombel untuk Menganalisis:</span>
          </span>
          <span className="text-slate-500">{uniqueClasses.length} Kelas Terdaftar</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
          <button
            type="button"
            onClick={() => handleSelectClass('ALL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              selectedClass === 'ALL'
                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <span>Semua Kelas</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                selectedClass === 'ALL'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {students.length}
            </span>
          </button>

          {uniqueClasses.map((cls) => {
            const countInClass = students.filter((s) => s.kelas.trim() === cls).length;
            const activeInClass = students.filter(
              (s) => s.kelas.trim() === cls && s.status_ujian === 'Sedang Ujian'
            ).length;
            const blockedInClass = students.filter(
              (s) => s.kelas.trim() === cls && s.status_ujian === 'Diblokir'
            ).length;

            return (
              <button
                key={cls}
                type="button"
                onClick={() => handleSelectClass(cls)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                  selectedClass === cls
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs ring-2 ring-blue-600/20'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <span>Kelas {cls}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    selectedClass === cls
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {countInClass}
                </span>

                {/* Live indicators */}
                {activeInClass > 0 && (
                  <span
                    title={`${activeInClass} siswa sedang aktif ujian`}
                    className="flex h-2 w-2 relative"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
                {blockedInClass > 0 && (
                  <span
                    title={`${blockedInClass} siswa diblokir`}
                    className="h-2 w-2 rounded-full bg-red-500"
                  ></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Stats Cards for Selected Class */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Total Siswa</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{kpiStats.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {selectedClass === 'ALL' ? 'Seluruh Kelas' : `Kelas ${selectedClass}`}
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs bg-emerald-50/20">
          <div className="text-[11px] font-medium text-emerald-800 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Sedang Ujian</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {kpiStats.sedangUjian}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Siswa Aktif di Layar</div>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-2xs bg-blue-50/20">
          <div className="text-[11px] font-medium text-blue-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Selesai Ujian</span>
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{kpiStats.selesai}</div>
          <div className="text-[10px] text-blue-600 mt-0.5">Jawaban Terkirim</div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-2xs bg-rose-50/20">
          <div className="text-[11px] font-medium text-rose-800 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Diblokir</span>
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{kpiStats.diblokir}</div>
          <div className="text-[10px] text-rose-600 mt-0.5">Pindah Tab / Keluar</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Rata-Rata Nilai</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {kpiStats.avgScore !== null ? kpiStats.avgScore : '-'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {kpiStats.participatedCount} Siswa Dinilai
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500">Rentang Skor</div>
          <div className="text-lg font-bold font-mono text-slate-800 mt-1.5">
            {kpiStats.highestScore !== null
              ? `${kpiStats.highestScore} / ${kpiStats.lowestScore}`
              : '- / -'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Tertinggi / Terendah</div>
        </div>
      </div>

      {/* Exam selector if multiple exams exist */}
      {matchedExams.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-700">
            Pilih Paket Ujian yang Ditinjau:
          </span>
          <select
            value={activeExam ? activeExam.id : ''}
            onChange={(e) => setSelectedExamId(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer"
          >
            {matchedExams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.judul_ujian} (Tingkat {ex.target_tingkat || 'Semua'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* VIEW MODE 1: CARDS (Monitoring Siswa & Analisis Soal) */}
      {viewMode === 'cards' && (
        <div className="space-y-6">
          {/* TABEL 1: Monitoring Siswa yang Sedang Ujian & Nilai Akhir */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Daftar Siswa, Status Ujian & Nilai Akhir</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menampilkan status real-time siswa kelas{' '}
                  <strong className="text-slate-700">{selectedClass}</strong> beserta nilai akhir dan kontrol pembukaan kunci.
                </p>
              </div>

              {/* Search & Status Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama / token..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="Sedang Ujian">Sedang Ujian</option>
                  <option value="Selesai">Selesai</option>
                  <option value="Diblokir">Diblokir</option>
                  <option value="Belum Mulai">Belum Mulai</option>
                </select>

                <select
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer font-mono font-semibold"
                  aria-label="Filter Kode Soal Siswa"
                >
                  <option value="ALL">Semua Paket</option>
                  <option value="PAKET-A">Paket A</option>
                  <option value="PAKET-B">Paket B</option>
                  <option value="PAKET-C">Paket C</option>
                  <option value="PAKET-D">Paket D</option>
                </select>

                {onBatchDistributePackages && (
                  <button
                    type="button"
                    disabled={isDistributing || classStudents.length === 0}
                    onClick={async () => {
                      setIsDistributing(true);
                      try {
                        await onBatchDistributePackages(
                          selectedClass !== 'ALL' ? selectedClass : undefined
                        );
                        setActionFeedback({
                          type: 'success',
                          message: `Berhasil membagi kode soal berselang-seling (Paket A / B) untuk ${
                            selectedClass === 'ALL'
                              ? 'seluruh kelas'
                              : `kelas ${selectedClass}`
                          }.`,
                        });
                      } catch {
                        setActionFeedback({
                          type: 'error',
                          message: 'Gagal mendistribusikan paket soal ke siswa.',
                        });
                      } finally {
                        setIsDistributing(false);
                      }
                    }}
                    title="Bagi paket soal berselang-seling (A/B) untuk siswa kelas ini"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>
                      {isDistributing ? 'Membagi Paket...' : 'Bagi Multi-Paket (A/B)'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Token Ujian</th>
                    <th className="py-3 px-4 text-center">Kode Soal / Paket</th>
                    <th className="py-3 px-4 text-center">Status Ujian</th>
                    <th className="py-3 px-4 text-center">Pelanggaran Tab</th>
                    <th className="py-3 px-4 text-center">Nilai Akhir</th>
                    <th className="py-3 px-4 text-center">Predikat / Kategori</th>
                    <th className="py-3 px-4 text-center">Aksi Pengawas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        Tidak ada siswa yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, idx) => {
                      const res = studentResultMap.get(st.id);
                      const isBlocked = st.status_ujian === 'Diblokir';
                      const isOngoing = st.status_ujian === 'Sedang Ujian';
                      const isFinished = st.status_ujian === 'Selesai';

                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isBlocked ? 'bg-rose-50/30' : isOngoing ? 'bg-emerald-50/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{st.nama}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{st.kelas}</td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            {st.token_ujian}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                              <span>{st.kode_soal || st.variasi_paket || 'PAKET-A'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isOngoing ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                Sedang Ujian
                              </span>
                            ) : isFinished ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                Selesai
                              </span>
                            ) : isBlocked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                Diblokir
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                                Belum Mulai
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {res?.pelanggaran_tab ? (
                              <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                {res.pelanggaran_tab}x
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {res ? (
                              <span className="font-mono text-base font-black text-slate-900">
                                {res.skor_angka}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {res?.analisis_ai?.kategori_nilai ? (
                              <span className="font-semibold text-slate-700">
                                {res.analisis_ai.kategori_nilai}
                              </span>
                            ) : res ? (
                              <span className="text-slate-500">Tuntas</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Unlock / Block Button */}
                              {isBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(st, 'Sedang Ujian')}
                                  title="Buka blokir agar siswa dapat melanjutkan ujian"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                                >
                                  <Unlock className="w-3 h-3" />
                                  <span>Buka Kunci</span>
                                </button>
                              ) : isOngoing ? (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(st, 'Diblokir')}
                                  title="Kunci / Blokir siswa ini"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors cursor-pointer"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>Kunci</span>
                                </button>
                              ) : null}

                              {/* Reset Session Button */}
                              <button
                                type="button"
                                onClick={() => handleStatusChange(st, 'Belum Mulai')}
                                title="Reset sesi siswa ke Belum Mulai"
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>

                              {/* View Answers Sheet Button */}
                              {res && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedStudentForModal({
                                      student: st,
                                      result: res,
                                    })
                                  }
                                  title="Lihat rincian lembar jawaban per nomor"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Detail</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* BAGIAN 2: Hasil Analisis Setiap Soal yang Dijawab Benar / Salah */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>Analisis Butir Soal Kelas ({selectedClass})</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Hasil Analisis Setiap Soal (Tingkat Ketuntasan Benar vs Salah)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mengevaluasi setiap butir soal: berapa siswa yang menjawab benar, berapa siswa yang salah, opsi apa yang paling banyak dipilih siswa, dan klasifikasi kognitif LOTS/HOTS.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">
                  Total Soal:{' '}
                  <strong className="text-slate-900 font-mono">
                    {examQuestions.length} Butir
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">
                  Siswa yang Menyelesaikan:{' '}
                  <strong className="text-slate-900 font-mono">
                    {kpiStats.participatedCount} Siswa
                  </strong>
                </span>
              </div>
            </div>

            {questionAnalysis.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Belum ada soal pada paket ujian ini atau siswa belum mengerjakan.
              </div>
            ) : (
              <div className="space-y-3">
                {questionAnalysis.map((item) => {
                  const isExpanded = Boolean(expandedQuestionIds[item.question.id]);

                  return (
                    <div
                      key={item.question.id}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-all"
                    >
                      {/* Summary Header per Question */}
                      <div
                        onClick={() => toggleQuestionExpand(item.question.id)}
                        className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors select-none"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-800 font-bold font-mono text-sm shrink-0">
                            #{item.index}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                Soal No. {item.index}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.cognitiveLevel === 'HOTS'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {item.cognitiveLevel} ({item.isKompleks ? 'PG Kompleks' : 'PG Biasa'})
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.difficultyColor}`}
                              >
                                {item.difficultyCategory} ({item.masteryRate}% Tuntas)
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                Kunci: <strong>[{item.correctKeys.join(', ')}]</strong>
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 mt-1 line-clamp-1 max-w-2xl">
                              {item.question.teks_soal.replace(/<[^>]+>/g, '').slice(0, 100)}...
                            </p>
                          </div>
                        </div>

                        {/* Right: Quick Benar vs Salah Badge and toggle icon */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{item.correctCount} Benar</span>
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>{item.incorrectCount} Salah</span>
                            </span>
                          </div>

                          <button
                            type="button"
                            className="p-1 rounded hover:bg-slate-200 text-slate-500"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Detail per Question */}
                      {isExpanded && (
                        <div className="p-5 border-t border-slate-200 bg-white space-y-4 text-xs">
                          {/* Wacana if exists */}
                          {item.question.data_opsi?.wacana && (
                            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 space-y-1">
                              <div className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                                Wacana / Teks Stimulus:
                              </div>
                              <MathAndTableRenderer content={item.question.data_opsi.wacana} />
                            </div>
                          )}

                          {/* Full Question Text */}
                          <div className="space-y-1">
                            <div className="font-bold text-slate-800">Teks Soal:</div>
                            <div className="text-slate-800 text-sm leading-relaxed p-3 bg-slate-50/50 rounded-lg border border-slate-100">
                              <MathAndTableRenderer content={item.question.teks_soal} />
                            </div>
                          </div>

                          {/* Options Breakdown with student selections */}
                          <div className="space-y-2">
                            <div className="font-bold text-slate-800">
                              Pilihan Jawaban & Distribusi Siswa:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                                const optText = item.question.data_opsi?.opsi?.[optKey];
                                if (!optText && optText !== '') return null;
                                const isKey = item.correctKeys.includes(optKey);
                                const chosenCount = item.optionCounts[optKey] || 0;
                                const chosenPercent =
                                  item.totalAnswered > 0
                                    ? Math.round((chosenCount / item.totalAnswered) * 100)
                                    : 0;

                                return (
                                  <div
                                    key={optKey}
                                    className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                                      isKey
                                        ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400'
                                        : chosenCount > 0
                                          ? 'bg-amber-50/50 border-amber-200'
                                          : 'bg-slate-50 border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <span
                                        className={`font-bold font-mono px-2 py-0.5 rounded text-xs shrink-0 ${
                                          isKey
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {optKey}
                                      </span>
                                      <div className="text-slate-700 text-xs">
                                        <MathAndTableRenderer content={optText || ''} />
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                      <span
                                        className={`font-bold font-mono text-xs ${
                                          isKey ? 'text-emerald-800' : 'text-slate-700'
                                        }`}
                                      >
                                        {chosenCount} Siswa ({chosenPercent}%)
                                      </span>
                                      {isKey && (
                                        <div className="text-[10px] font-bold text-emerald-700">
                                          ★ KUNCI
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Student Names: Benar vs Salah */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            {/* Benar */}
                            <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-2">
                              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Siswa yang Menjawab Benar ({item.correctCount})</span>
                              </div>
                              {item.correctStudentNames.length === 0 ? (
                                <p className="text-[11px] text-emerald-700 italic">
                                  Belum ada siswa yang menjawab benar.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                                  {item.correctStudentNames.map((name, i) => (
                                    <span
                                      key={i}
                                      className="px-2 py-0.5 rounded bg-white text-emerald-900 border border-emerald-200 text-[11px] font-medium"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Salah */}
                            <div className="p-3.5 rounded-lg bg-rose-50/60 border border-rose-200 space-y-2">
                              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span>Siswa yang Menjawab Salah / Kosong ({item.incorrectCount})</span>
                              </div>
                              {item.incorrectStudentDetails.length === 0 ? (
                                <p className="text-[11px] text-rose-700 italic">
                                  Semua siswa menjawab benar (100% tuntas).
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                                  {item.incorrectStudentDetails.map((s, i) => (
                                    <span
                                      key={i}
                                      className="px-2 py-0.5 rounded bg-white text-rose-900 border border-rose-200 text-[11px]"
                                    >
                                      <strong>{s.name}</strong>{' '}
                                      <span className="font-mono text-rose-600">
                                        ({s.chosen.join(', ')})
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: MATRIKS SISWA x SOAL (Interactive Grid) */}
      {viewMode === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-600" />
                <span>Matriks Ketuntasan Jawaban: Siswa × Butir Soal</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Melihat peta menyeluruh setiap nomor soal yang dijawab Benar (hijau ✓) atau Salah (merah ✗) oleh seluruh siswa kelas{' '}
                <strong>{selectedClass}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Benar
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-semibold">
                <XCircle className="w-3.5 h-3.5" /> Salah
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200"></span> Belum
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 border-b border-r border-slate-200 w-10 text-center font-bold">
                    No
                  </th>
                  <th className="py-2.5 px-3 border-b border-r border-slate-200 min-w-[160px] font-bold sticky left-0 bg-slate-100 z-20">
                    Nama Siswa
                  </th>
                  <th className="py-2.5 px-3 border-b border-r border-slate-200 text-center font-bold">
                    Status
                  </th>
                  {examQuestions.map((q, idx) => (
                    <th
                      key={q.id}
                      onClick={() => setSelectedQuestionDetail(q)}
                      title={`Klik untuk lihat Soal #${idx + 1}`}
                      className="py-2.5 px-2 border-b border-r border-slate-200 text-center font-mono font-bold cursor-pointer hover:bg-blue-100/60 transition-colors w-10 shrink-0"
                    >
                      #{idx + 1}
                    </th>
                  ))}
                  <th className="py-2.5 px-4 border-b border-slate-200 text-center font-bold text-blue-900 bg-blue-50/80 min-w-[80px]">
                    Nilai Akhir
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map((st, sIdx) => {
                  const res = studentResultMap.get(st.id);
                  const isBlocked = st.status_ujian === 'Diblokir';
                  const isFinished = st.status_ujian === 'Selesai';

                  return (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isBlocked ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-2 px-3 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px]">
                        {sIdx + 1}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 font-semibold text-slate-900 sticky left-0 bg-white z-10 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedStudentForModal({
                                student: st,
                                result: res || null,
                              })
                            }
                            className="hover:text-blue-600 hover:underline text-left cursor-pointer"
                          >
                            {st.nama}
                          </button>
                          <span className="px-1.5 py-0.5 rounded font-mono text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                            {st.kode_soal || st.variasi_paket || 'PAKET-A'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 text-center text-[10px] whitespace-nowrap">
                        {isFinished ? (
                          <span className="text-blue-700 font-semibold">Selesai</span>
                        ) : isBlocked ? (
                          <span className="text-rose-700 font-bold">Diblokir</span>
                        ) : st.status_ujian === 'Sedang Ujian' ? (
                          <span className="text-emerald-700 font-semibold">Ujian</span>
                        ) : (
                          <span className="text-slate-400">Belum</span>
                        )}
                      </td>

                      {/* Question Answer Cells */}
                      {examQuestions.map((q) => {
                        const qIdStr = String(q.id);
                        const correctKeys = q.kunci_jawaban || [];
                        const studentAns = res?.jawaban_siswa?.[qIdStr];

                        if (!res || !studentAns || studentAns.length === 0) {
                          return (
                            <td
                              key={q.id}
                              className="py-2 px-2 border-r border-slate-200 text-center text-slate-300 font-mono"
                            >
                              -
                            </td>
                          );
                        }

                        const isCorrect =
                          studentAns.length === correctKeys.length &&
                          studentAns.every((ans) => correctKeys.includes(ans));

                        return (
                          <td
                            key={q.id}
                            title={`Jawaban Siswa: [${studentAns.join(', ')}] | Kunci: [${correctKeys.join(', ')}]`}
                            className={`py-2 px-2 border-r border-slate-200 text-center font-bold text-xs ${
                              isCorrect
                                ? 'bg-emerald-50/70 text-emerald-700'
                                : 'bg-rose-50/70 text-rose-700'
                            }`}
                          >
                            {isCorrect ? '✓' : `✗ ${studentAns.join('')}`}
                          </td>
                        );
                      })}

                      {/* Nilai Akhir Column */}
                      <td className="py-2 px-4 text-center font-mono font-black text-sm bg-blue-50/30 text-blue-900">
                        {res ? res.skor_angka : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Detail Soal Tertentu */}
      {selectedQuestionDetail && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Pratinjau Butir Soal #{selectedQuestionDetail.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestionDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedQuestionDetail.data_opsi?.wacana && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-[11px] text-slate-500 uppercase">
                  Wacana Stimulus:
                </div>
                <MathAndTableRenderer content={selectedQuestionDetail.data_opsi.wacana} />
              </div>
            )}

            <div className="text-sm text-slate-800 leading-relaxed space-y-1">
              <div className="font-bold text-xs text-slate-500 uppercase">Teks Soal:</div>
              <MathAndTableRenderer content={selectedQuestionDetail.teks_soal} />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="font-bold text-slate-700">Pilihan Opsi:</div>
              {(['A', 'B', 'C', 'D', 'E'] as const).map((key) => {
                const optText = selectedQuestionDetail.data_opsi?.opsi?.[key];
                if (!optText && optText !== '') return null;
                const isKey = selectedQuestionDetail.kunci_jawaban.includes(key);

                return (
                  <div
                    key={key}
                    className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                      isKey
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-mono font-bold">{key}.</span>
                    <div className="flex-1">
                      <MathAndTableRenderer content={optText || ''} />
                    </div>
                    {isKey && (
                      <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
                        Kunci
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedQuestionDetail(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Lembar Jawaban Lengkap Siswa */}
      {selectedStudentForModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-bold text-blue-700 uppercase">
                  Lembar Jawaban Siswa
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedStudentForModal.student.nama}
                </h3>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                  <span>Kelas {selectedStudentForModal.student.kelas}</span>
                  <span>·</span>
                  <span>
                    Token{' '}
                    <span className="font-mono font-bold text-blue-700">
                      {selectedStudentForModal.student.token_ujian}
                    </span>
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    <Layers className="w-3 h-3 text-indigo-600 shrink-0" />
                    <span>
                      {selectedStudentForModal.result?.kode_soal ||
                        selectedStudentForModal.student.kode_soal ||
                        selectedStudentForModal.student.variasi_paket ||
                        'PAKET-A'}
                    </span>
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-black font-mono text-slate-900">
                  {selectedStudentForModal.result
                    ? selectedStudentForModal.result.skor_angka
                    : '-'}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">Nilai Akhir</div>
              </div>
            </div>

            {selectedStudentForModal.result ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">Kategori Nilai:</span>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {selectedStudentForModal.result.analisis_ai?.kategori_nilai || 'Selesai'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">Pelanggaran Tab:</span>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {selectedStudentForModal.result.pelanggaran_tab || 0} kali
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">Waktu Selesai:</span>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {selectedStudentForModal.result.created_at
                        ? new Date(selectedStudentForModal.result.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                        : '-'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500">Total Soal:</span>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {examQuestions.length} Soal
                    </div>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pt-2">
                  Daftar Jawaban per Butir Soal:
                </h4>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {examQuestions.map((q, idx) => {
                    const qIdStr = String(q.id);
                    const correctKeys = q.kunci_jawaban || [];
                    const studentAns =
                      selectedStudentForModal.result?.jawaban_siswa?.[qIdStr] || [];
                    const isCorrect =
                      studentAns.length === correctKeys.length &&
                      studentAns.every((ans) => correctKeys.includes(ans));

                    return (
                      <div
                        key={q.id}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          isCorrect
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-rose-50/50 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            Soal #{idx + 1}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isCorrect
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isCorrect ? 'Benar (+poin)' : 'Salah (0 poin)'}
                          </span>
                        </div>

                        <div className="text-slate-700">
                          <MathAndTableRenderer content={q.teks_soal} />
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                          <div>
                            <span className="text-slate-500">Jawaban Siswa: </span>
                            <strong className="font-mono text-slate-900">
                              {studentAns.length > 0 ? studentAns.join(', ') : '(Kosong)'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Kunci Jawaban: </span>
                            <strong className="font-mono text-emerald-700">
                              {correctKeys.join(', ')}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Siswa ini belum menyelesaikan ujian atau jawaban belum masuk ke sistem.
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStudentForModal(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tutup Lembar Jawaban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
