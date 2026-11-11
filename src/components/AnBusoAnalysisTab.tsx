import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  RotateCcw,
  Sliders,
  BarChart3,
  UserCheck,
  Printer,
  Edit3,
  BookOpen,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from '../types/cbt';
import {
  isExamMatchedForStudentClass,
  buildSemicolonCsv,
  normalizeAnswerKeys,
} from '../utils/cbtLogic';
import {
  AnBusoIdentity,
  computeAnBusoAnalysis,
  generateAnBusoExcelReport,
  downloadAnBusoPdfReport,
} from '../utils/cbtAnBusoLogic';
import { MathAndTableRenderer } from './MathAndTableRenderer';

interface AnBusoAnalysisTabProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  teacherName?: string;
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
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

export const AnBusoAnalysisTab: React.FC<AnBusoAnalysisTabProps> = ({
  exams,
  questions,
  students,
  results,
  teacherName = 'Sahidin, S.Sos.',
}) => {
  // 4 Systematic Workflow Sub-Tabs matching AnBuso principles
  const [activeStep, setActiveStep] = useState<
    'identitas' | 'kunci_jawaban' | 'statistik_soal' | 'remedial_output'
  >('statistik_soal');

  // Distinct classes from students
  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.kelas && s.kelas.trim()) set.add(s.kelas.trim());
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'id', { numeric: true })
    );
  }, [students]);

  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedExamId, setSelectedExamId] = useState<number>(() => {
    return exams.length > 0 ? exams[0].id : 0;
  });

  // Keep selectedExamId valid when exams or class change
  const matchingExams = useMemo(() => {
    if (selectedClass === 'ALL') return exams;
    const matched = exams.filter((ex) =>
      isExamMatchedForStudentClass(ex, selectedClass)
    );
    return matched.length > 0 ? matched : exams;
  }, [exams, selectedClass]);

  useEffect(() => {
    if (
      matchingExams.length > 0 &&
      !matchingExams.some((e) => e.id === selectedExamId)
    ) {
      setSelectedExamId(matchingExams[0].id);
    }
  }, [matchingExams, selectedExamId]);

  const activeExam = useMemo(
    () =>
      matchingExams.find((e) => e.id === selectedExamId) ||
      matchingExams[0] ||
      null,
    [matchingExams, selectedExamId]
  );

  // Stage 1: Test Identity State
  const [identity, setIdentity] = useState<AnBusoIdentity>({
    namaSekolah: 'SMA Islam Al Ghozali / Institusi Penyelenggara CBT',
    mataPelajaran: 'Sosiologi',
    kelasRombel: 'Semua Kelas',
    namaTes: activeExam?.judul_ujian || 'Evaluasi Sumatif / Penilaian Harian',
    semesterTahunAjaran: 'Semester Ganjil / Genap — TA 2025/2026',
    namaPendidik: teacherName,
    nipPendidik: '-',
    tanggalUjian: new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    kkm: 70,
  });

  // Sync default identity labels when exam or class filter changes
  useEffect(() => {
    setIdentity((prev) => ({
      ...prev,
      kelasRombel: selectedClass === 'ALL' ? 'Semua Kelas' : selectedClass,
      namaTes: activeExam?.judul_ujian || prev.namaTes,
    }));
  }, [selectedClass, activeExam]);

  // Stage 2: Custom overrides for Keys, Topics, and Student Answers (Interactive Simulation / Correction)
  const [customKeyOverrides, setCustomKeyOverrides] = useState<
    Record<number, string[]>
  >({});
  const [customTopics, setCustomTopics] = useState<Record<number, string>>({});
  const [customAnswerOverrides, setCustomAnswerOverrides] = useState<
    Record<number, Record<string, string[]>>
  >({});
  const [editingCell, setEditingCell] = useState<{
    studentId: number;
    questionId: number;
    value: string;
  } | null>(null);

  // Filters for Stage 3 & Stage 4
  const [filterDecision, setFilterDecision] = useState<
    'ALL' | 'Disimpan di Bank Soal' | 'Direvisi' | 'Dibuang / Diganti'
  >('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState<
    'ALL' | 'Mudah' | 'Sedang' | 'Sukar'
  >('ALL');
  const [remedialSearch, setRemedialSearch] = useState<string>('');
  const [remedialStatusFilter, setRemedialStatusFilter] = useState<
    'ALL' | 'REMEDIAL' | 'TUNTAS'
  >('ALL');
  const [selectedQuestionPreview, setSelectedQuestionPreview] =
    useState<QuestionItem | null>(null);

  // Questions belonging to activeExam
  const examQuestions = useMemo(() => {
    if (!activeExam) return questions;
    const filtered = questions.filter(
      (q) => Number(q.exam_id) === Number(activeExam.id)
    );
    return filtered.length > 0 ? filtered : questions;
  }, [questions, activeExam]);

  // Students & results filtered by selectedClass and activeExam
  const filteredStudents = useMemo(() => {
    if (selectedClass === 'ALL') return students;
    return students.filter(
      (s) => s.kelas.trim().toLowerCase() === selectedClass.trim().toLowerCase()
    );
  }, [students, selectedClass]);

  const filteredResults = useMemo(() => {
    const allowedStudentIds = new Set(
      filteredStudents.map((s) => Number(s.id))
    );
    const qIds = new Set(examQuestions.map((q) => String(q.id)));

    return results.filter((r) => {
      if (selectedClass !== 'ALL' && !allowedStudentIds.has(Number(r.student_id))) {
        return false;
      }
      if (!activeExam) return true;
      if (Number(r.exam_id) === Number(activeExam.id)) return true;
      // Also include if student's answer keys overlap with this exam's questions
      const ansKeys = Object.keys(r.jawaban_siswa || {});
      return ansKeys.some((k) => qIds.has(k));
    });
  }, [results, filteredStudents, activeExam, examQuestions, selectedClass]);

  // Compute full AnBuso psychometric report
  const anBusoReport = useMemo(() => {
    return computeAnBusoAnalysis({
      identity,
      exam: activeExam,
      questions: examQuestions,
      students,
      results: filteredResults,
      customAnswerOverrides,
      customKeyOverrides,
      customTopics,
    });
  }, [
    identity,
    activeExam,
    examQuestions,
    students,
    filteredResults,
    customAnswerOverrides,
    customKeyOverrides,
    customTopics,
  ]);

  const filteredItems = useMemo(() => {
    return anBusoReport.items.filter((item) => {
      const matchDecision =
        filterDecision === 'ALL' || item.itemDecision === filterDecision;
      const matchDiff =
        filterDifficulty === 'ALL' ||
        item.difficultyCategory === filterDifficulty;
      return matchDecision && matchDiff;
    });
  }, [anBusoReport.items, filterDecision, filterDifficulty]);

  const filteredRemedialStudents = useMemo(() => {
    return anBusoReport.studentRemedial.filter((st) => {
      const matchSearch = remedialSearch.trim()
        ? st.studentName
            .toLowerCase()
            .includes(remedialSearch.trim().toLowerCase()) ||
          st.studentClass
            .toLowerCase()
            .includes(remedialSearch.trim().toLowerCase())
        : true;
      const matchStatus =
        remedialStatusFilter === 'ALL'
          ? true
          : remedialStatusFilter === 'REMEDIAL'
          ? !st.isPassedKkm || st.failedNumbers.length > 0
          : st.isPassedKkm && st.failedNumbers.length === 0;
      return matchSearch && matchStatus;
    });
  }, [anBusoReport.studentRemedial, remedialSearch, remedialStatusFilter]);

  const handleExportExcel = () => {
    const html = generateAnBusoExcelReport(anBusoReport);
    const cleanClass = (identity.kelasRombel || 'Semua_Kelas')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    triggerFileDownload(
      html,
      `AnBuso_Analisis_Butir_Soal_${cleanClass}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportCsv = () => {
    const headers = [
      'No_Butir',
      'Kode_Soal',
      'Tipe',
      'Kunci',
      'Indikator_Materi',
      'Indeks_Kesukaran_P',
      'Kategori_Kesukaran',
      'Daya_Beda_D',
      'Korelasi_r_pbi',
      'Kategori_Daya_Beda',
      'Pengecoh_Efektif',
      'Keputusan_Bank_Soal',
      'Prioritas_Remedial',
    ];
    const rows = anBusoReport.items.map((it) => [
      it.questionNumber,
      it.questionCode,
      it.questionType,
      it.correctKeys.join(','),
      it.topicSummary,
      it.difficultyIndex,
      it.difficultyCategory,
      it.discriminationIndex,
      it.pointBiserial,
      it.discriminationCategory,
      `${it.effectiveDistractorCount}/${it.totalDistractorCount}`,
      it.itemDecision,
      it.remedialPriority,
    ]);
    const csv = buildSemicolonCsv(headers, rows);
    const cleanClass = (identity.kelasRombel || 'Semua_Kelas')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    triggerFileDownload(
      csv,
      `AnBuso_Butir_Soal_${cleanClass}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleResetOverrides = () => {
    setCustomKeyOverrides({});
    setCustomTopics({});
    setCustomAnswerOverrides({});
    setEditingCell(null);
  };

  const hasCustomOverrides =
    Object.keys(customKeyOverrides).length > 0 ||
    Object.keys(customTopics).length > 0 ||
    Object.keys(customAnswerOverrides).length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Laboratorium Psikometri &amp; Evaluasi Pendidikan (Standar AnBuso)
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
              Analisis Butir Soal (AnBuso) &amp; Pemetaan Remedial Personal Siswa
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Evaluasi kualitas instrumen tes secara objektif berbasis respons empiris siswa (Tingkat Kesukaran{' '}
              <span className="font-mono font-semibold text-slate-800">P</span>, Daya Beda{' '}
              <span className="font-mono font-semibold text-slate-800">D</span>, Korelasi{' '}
              <span className="font-mono font-semibold text-slate-800">r_pbi</span>, Efektivitas Pengecoh{' '}
              <span className="font-mono font-semibold text-slate-800">A–E</span>, dan Reliabilitas Tes{' '}
              <span className="font-mono font-semibold text-slate-800">Cronbach&apos;s Alpha</span>) serta petakan kebutuhan remedial personal setiap siswa per butir soal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadAnBusoPdfReport(anBusoReport)}
              disabled={anBusoReport.items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Laporan AnBuso (.PDF)</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={anBusoReport.items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Workbook Excel (.xls)</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={anBusoReport.items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Source Selector: Paket Ujian + Filter Kelas + KKM Quick Control */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div>
            <label
              htmlFor="anbuso-exam-select"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              1. Pilih Paket Ujian yang Dianalisis
            </label>
            <select
              id="anbuso-exam-select"
              value={activeExam?.id || ''}
              onChange={(e) => setSelectedExamId(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {matchingExams.map((ex) => {
                const qCount = questions.filter(
                  (q) => Number(q.exam_id) === Number(ex.id)
                ).length;
                return (
                  <option key={ex.id} value={ex.id}>
                    {ex.judul_ujian} ({qCount} Butir Soal · Kelas {ex.target_tingkat})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label
              htmlFor="anbuso-class-select"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              2. Filter Kelas / Rombel Peserta
            </label>
            <select
              id="anbuso-class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">
                Semua Kelas / Seluruh Peserta ({results.length} Hasil)
              </option>
              {uniqueClasses.map((kls) => (
                <option key={kls} value={kls}>
                  Kelas {kls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="anbuso-kkm-input"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              3. Batas KKM Ketuntasan Minimal (0–100)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="anbuso-kkm-input"
                type="number"
                min={10}
                max={100}
                value={identity.kkm}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    kkm: Math.max(0, Math.min(100, Number(e.target.value) || 70)),
                  }))
                }
                className="w-24 px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
              />
              <span className="text-xs text-slate-600">
                Ketuntasan saat ini:{' '}
                <strong className="font-mono text-emerald-700 tabular-nums">
                  {anBusoReport.summary.passRate}%
                </strong>{' '}
                ({anBusoReport.summary.passCount}/
                {anBusoReport.summary.totalRespondents} siswa)
              </span>
            </div>
          </div>
        </div>

        {/* 4-Step Systematic Workflow Navigation (Prinsip 1 AnBuso) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          {(
            [
              {
                id: 'identitas',
                step: '01. Identitas Tes',
                desc: 'Data Mapel, Kelas & Parameter KKM',
                icon: Sliders,
              },
              {
                id: 'kunci_jawaban',
                step: '02. Kunci & Jawaban Siswa',
                desc: `${anBusoReport.summary.totalQuestions} Kunci · ${anBusoReport.summary.totalRespondents} Lembar Jawaban`,
                icon: Edit3,
              },
              {
                id: 'statistik_soal',
                step: '03. Analisis Otomatis Butir',
                desc: 'Kesukaran, Daya Beda & Pengecoh',
                icon: BarChart3,
              },
              {
                id: 'remedial_output',
                step: '04. Peta Remedial & Output',
                desc: 'Remedial Personal per Butir & Cetak',
                icon: UserCheck,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeStep === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveStep(tab.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-amber-300' : 'text-blue-600'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-extrabold truncate">
                    {tab.step}
                  </div>
                  <div
                    className={`text-[11px] truncate mt-0.5 ${
                      isActive ? 'text-blue-100' : 'text-slate-500'
                    }`}
                  >
                    {tab.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 5 Key Psychometric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">
              Reliabilitas Instrumen (Alpha)
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-indigo-800 mt-1">
              {anBusoReport.summary.reliabilityAlpha.toFixed(3)}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              Kategori: <strong>{anBusoReport.summary.reliabilityCategory}</strong>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">
              Rata-Rata &amp; Simpangan Baku
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-blue-800 mt-1">
              {anBusoReport.summary.meanScore}{' '}
              <span className="text-xs font-normal text-slate-500">
                ± {anBusoReport.summary.stdDeviation}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 mt-1 font-mono tabular-nums">
              Tertinggi: {anBusoReport.summary.highestScore} · Terendah:{' '}
              {anBusoReport.summary.lowestScore}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">
              Sebaran Tingkat Kesukaran (P)
            </div>
            <div className="text-xs font-bold font-mono tabular-nums text-slate-900 mt-1.5">
              Mudah: {anBusoReport.summary.difficultySummary.mudahCount} · Sedang:{' '}
              {anBusoReport.summary.difficultySummary.sedangCount} · Sukar:{' '}
              {anBusoReport.summary.difficultySummary.sukarCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Ideal proporsi mayoritas Sedang (0.31–0.70)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">
              Keputusan Objektif Bank Soal
            </div>
            <div className="text-xs font-bold font-mono tabular-nums text-slate-900 mt-1.5">
              Simpan: {anBusoReport.summary.bankSoalSummary.savedCount} · Revisi:{' '}
              {anBusoReport.summary.bankSoalSummary.revisedCount} · Buang:{' '}
              {anBusoReport.summary.bankSoalSummary.discardedCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Berdasarkan Daya Beda (D) &amp; Distraktor
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500">
              Kelompok Atas vs Bawah
            </div>
            <div className="text-xl font-extrabold font-mono tabular-nums text-emerald-800 mt-1">
              {anBusoReport.summary.upperGroupSize}{' '}
              <span className="text-xs font-normal text-slate-500">vs</span>{' '}
              {anBusoReport.summary.lowerGroupSize}{' '}
              <span className="text-xs font-normal text-slate-500">siswa</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              Total Responden: {anBusoReport.summary.totalRespondents} Siswa
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* STEP 1: IDENTITAS MATA PELAJARAN & PARAMETER EVALUASI                 */}
      {/* ===================================================================== */}
      {activeStep === 'identitas' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900">
              01. Identitas Mata Pelajaran &amp; Parameter Tes (Laporan Resmi AnBuso)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Informasi di bawah ini digunakan secara otomatis sebagai kop dan identitas resmi saat mencetak Laporan PDF maupun Workbook Microsoft Excel (.xls).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Satuan Pendidikan / Sekolah
              </label>
              <input
                type="text"
                value={identity.namaSekolah}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, namaSekolah: e.target.value }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mata Pelajaran
              </label>
              <input
                type="text"
                value={identity.mataPelajaran}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    mataPelajaran: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kelas / Rombongan Belajar
              </label>
              <input
                type="text"
                value={identity.kelasRombel}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, kelasRombel: e.target.value }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Tes / Evaluasi
              </label>
              <input
                type="text"
                value={identity.namaTes}
                onChange={(e) =>
                  setIdentity((prev) => ({ ...prev, namaTes: e.target.value }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Semester &amp; Tahun Ajaran
              </label>
              <input
                type="text"
                value={identity.semesterTahunAjaran}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    semesterTahunAjaran: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Guru / Pendidik Pengampu
              </label>
              <input
                type="text"
                value={identity.namaPendidik}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    namaPendidik: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NIP / NUPTK Pendidik
              </label>
              <input
                type="text"
                value={identity.nipPendidik}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    nipPendidik: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Pelaksanaan Evaluasi
              </label>
              <input
                type="text"
                value={identity.tanggalUjian}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    tanggalUjian: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kriteria Ketuntasan Minimal (KKM)
              </label>
              <input
                type="number"
                min={10}
                max={100}
                value={identity.kkm}
                onChange={(e) =>
                  setIdentity((prev) => ({
                    ...prev,
                    kkm: Number(e.target.value) || 70,
                  }))
                }
                className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Seluruh perubahan identitas otomatis diterapkan pada hasil analisis dan dokumen unduhan.
            </span>
            <button
              type="button"
              onClick={() => setActiveStep('kunci_jawaban')}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Lanjut ke Kunci &amp; Lembar Jawaban →
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 2: KUNCI JAWABAN, INDIKATOR MATERI & MATRIKS JAWABAN SISWA        */}
      {/* ===================================================================== */}
      {activeStep === 'kunci_jawaban' && (
        <div className="space-y-6">
          {/* Tabel Kunci Jawaban & Indikator Materi per Butir Soal */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  02A. Daftar Kunci Jawaban &amp; Pemetaan Indikator Materi per Butir Soal
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Anda dapat menyesuaikan <strong>Kunci Jawaban</strong> (simulasi koreksi kunci) maupun nama <strong>Indikator / Konsep Materi</strong> agar laporan remedial personal siswa lebih spesifik.
                </p>
              </div>
              {hasCustomOverrides && (
                <button
                  type="button"
                  onClick={handleResetOverrides}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset ke Data Asli Bank Soal</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 font-bold w-14 text-center">No</th>
                    <th className="py-2.5 px-3 font-bold w-24">Kode</th>
                    <th className="py-2.5 px-3 font-bold w-24">Tipe</th>
                    <th className="py-2.5 px-3 font-bold w-36">
                      Kunci Jawaban (Edit)
                    </th>
                    <th className="py-2.5 px-3 font-bold">
                      Indikator / Konsep Materi (Digunakan pada Peta Remedial Personal)
                    </th>
                    <th className="py-2.5 px-3 font-bold w-24 text-center">
                      Pratinjau
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {examQuestions.map((q, idx) => {
                    const qId = Number(q.id);
                    const currentKeys =
                      customKeyOverrides[qId] || q.kunci_jawaban || [];
                    const defaultTopic =
                      anBusoReport.items[idx]?.topicSummary || '';
                    const currentTopic =
                      customTopics[qId] !== undefined
                        ? customTopics[qId]
                        : defaultTopic;

                    return (
                      <tr key={q.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-800">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {q.data_opsi?.id_soal_csv || `SOAL-${idx + 1}`}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700">
                          {q.tipe_soal}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={currentKeys.join(', ')}
                            onChange={(e) => {
                              const parsed = normalizeAnswerKeys(e.target.value);
                              if (parsed.length > 0) {
                                setCustomKeyOverrides((prev) => ({
                                  ...prev,
                                  [qId]: parsed,
                                }));
                              }
                            }}
                            className="w-28 px-2.5 py-1 text-xs font-mono font-bold text-emerald-800 bg-emerald-50/70 border border-emerald-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-600"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={currentTopic}
                            onChange={(e) =>
                              setCustomTopics((prev) => ({
                                ...prev,
                                [qId]: e.target.value,
                              }))
                            }
                            placeholder="Ketik indikator atau konsep materi butir soal ini..."
                            className="w-full px-2.5 py-1 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedQuestionPreview(q)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded cursor-pointer"
                          >
                            Lihat Soal
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Matriks Lembar Jawaban Siswa (Bisa Diedit Langsung) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  02B. Matriks Lembar Jawaban Siswa Terkoreksi Otomatis ({anBusoReport.studentRemedial.length} Peserta)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Seluruh opsi jawaban siswa yang diacak (<code className="font-mono">acak_opsi</code>) telah otomatis diselaraskan ke kunci kanonik Bank Soal. Klik pada sel jawaban siswa jika Anda ingin mengoreksi atau melakukan simulasi input manual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep('statistik_soal')}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer shrink-0"
              >
                Lihat Hasil Analisis Otomatis →
              </button>
            </div>

            {anBusoReport.studentRemedial.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Belum ada lembar jawaban siswa yang masuk untuk paket ujian dan filter kelas ini.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="py-2.5 px-3 font-bold sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                        Nama Siswa &amp; Kelompok Skor
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-center border-r border-slate-200">
                        Kelas
                      </th>
                      <th className="py-2.5 px-2.5 font-bold text-center border-r border-slate-200 bg-blue-50 text-blue-900">
                        Nilai
                      </th>
                      {anBusoReport.items.map((item) => (
                        <th
                          key={item.questionId}
                          className="py-2 px-2 font-mono font-bold text-center border-r border-slate-200 min-w-[54px]"
                          title={`${item.topicSummary} | Kunci: ${item.correctKeys.join(', ')}`}
                        >
                          <div>#{item.questionNumber}</div>
                          <div className="text-[10px] text-emerald-700">
                            [{item.correctKeys.join('')}]
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {anBusoReport.studentRemedial.map((st, idx) => (
                      <tr key={st.studentId} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-slate-400">
                              {idx + 1}.
                            </span>
                            <span>{st.studentName}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal pl-5">
                            {st.groupRank} · {st.packageCode}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-center text-slate-600 border-r border-slate-200 whitespace-nowrap">
                          {st.studentClass}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-extrabold text-blue-900 bg-blue-50/40 border-r border-slate-200 tabular-nums">
                          {st.finalScore}
                        </td>
                        {anBusoReport.items.map((item) => {
                          const cell = st.itemScores[item.questionNumber];
                          const isEditing =
                            editingCell?.studentId === st.studentId &&
                            editingCell?.questionId === item.questionId;

                          const status = cell?.status || 'Salah';
                          const chosenStr =
                            cell && cell.chosen.length > 0
                              ? cell.chosen.join(',')
                              : '-';

                          return (
                            <td
                              key={item.questionId}
                              onClick={() => {
                                if (!isEditing) {
                                  setEditingCell({
                                    studentId: st.studentId,
                                    questionId: item.questionId,
                                    value:
                                      cell && cell.chosen.length > 0
                                        ? cell.chosen.join(', ')
                                        : '',
                                  });
                                }
                              }}
                              title={`Klik untuk edit jawaban ${st.studentName} pada Soal #${item.questionNumber} (Poin: +${cell?.earned ?? 0}/${item.maxPoints})`}
                              className={`py-1.5 px-1.5 text-center font-mono text-[11px] font-bold border-r border-slate-200 cursor-pointer ${
                                status === 'Benar Penuh'
                                  ? 'bg-emerald-50/70 text-emerald-800'
                                  : status === 'Benar Sebagian'
                                  ? 'bg-amber-50/80 text-amber-800'
                                  : 'bg-rose-50/60 text-rose-700'
                              }`}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell({
                                      ...editingCell,
                                      value: e.target.value,
                                    })
                                  }
                                  onBlur={() => {
                                    const parsed = normalizeAnswerKeys(
                                      editingCell.value
                                    );
                                    setCustomAnswerOverrides((prev) => {
                                      const prevStudent =
                                        prev[st.studentId] || {};
                                      return {
                                        ...prev,
                                        [st.studentId]: {
                                          ...prevStudent,
                                          [String(item.questionId)]: parsed,
                                        },
                                      };
                                    });
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  className="w-12 px-1 py-0.5 text-center text-[11px] font-mono bg-white border border-blue-500 rounded"
                                />
                              ) : (
                                <span>
                                  {status === 'Benar Penuh'
                                    ? `✓ ${chosenStr}`
                                    : status === 'Benar Sebagian'
                                    ? `◐ ${chosenStr}`
                                    : `✗ ${chosenStr}`}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: PROSES ANALISIS OTOMATIS (KESUKARAN, DAYA BEDA & PENGECOH)     */}
      {/* ===================================================================== */}
      {activeStep === 'statistik_soal' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                03. Tabel Analisis Statistik Butir Soal, Daya Beda, Efektivitas Pengecoh &amp; Keputusan Bank Soal
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Penentuan kualitas soal didasarkan murni pada data empiris respons siswa: Indeks Kesukaran (<code className="font-mono">P</code>), Daya Beda Kelompok Atas vs Bawah (<code className="font-mono">D = PA - PB</code>), Korelasi Point-Biserial (<code className="font-mono">r_pbi</code>), dan sebaran pemilih pengecoh <code className="font-mono">A–E</code>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Filter Keputusan Bank Soal */}
              <select
                aria-label="Filter Keputusan Bank Soal"
                value={filterDecision}
                onChange={(e) => setFilterDecision(e.target.value as any)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="ALL">
                  Semua Keputusan ({anBusoReport.items.length} Soal)
                </option>
                <option value="Disimpan di Bank Soal">
                  Disimpan di Bank Soal ({anBusoReport.summary.bankSoalSummary.savedCount})
                </option>
                <option value="Direvisi">
                  Perlu Direvisi ({anBusoReport.summary.bankSoalSummary.revisedCount})
                </option>
                <option value="Dibuang / Diganti">
                  Dibuang / Diganti ({anBusoReport.summary.bankSoalSummary.discardedCount})
                </option>
              </select>

              {/* Filter Tingkat Kesukaran */}
              <select
                aria-label="Filter Tingkat Kesukaran"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value as any)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="ALL">Semua Tingkat Kesukaran</option>
                <option value="Mudah">
                  Mudah ({anBusoReport.summary.difficultySummary.mudahCount})
                </option>
                <option value="Sedang">
                  Sedang ({anBusoReport.summary.difficultySummary.sedangCount})
                </option>
                <option value="Sukar">
                  Sukar ({anBusoReport.summary.difficultySummary.sukarCount})
                </option>
              </select>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Tidak ada butir soal yang sesuai dengan filter kriteria di atas.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="py-3 px-3 font-bold text-center w-12">No</th>
                    <th className="py-3 px-3 font-bold min-w-[210px]">
                      Butir Soal &amp; Indikator Materi
                    </th>
                    <th className="py-3 px-2.5 font-bold text-center">Kunci</th>
                    <th className="py-3 px-2.5 font-bold text-right">
                      Kesukaran (P)
                    </th>
                    <th className="py-3 px-2.5 font-bold text-right">
                      Daya Beda (D)
                    </th>
                    <th className="py-3 px-2.5 font-bold text-right">r_pbi</th>
                    <th className="py-3 px-3 font-bold min-w-[250px]">
                      Efektivitas Opsi &amp; Pengecoh (A / B / C / D / E)
                    </th>
                    <th className="py-3 px-3 font-bold min-w-[180px]">
                      Keputusan Objektif Bank Soal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredItems.map((item) => {
                    const qObj = examQuestions.find(
                      (q) => Number(q.id) === item.questionId
                    );
                    return (
                      <tr
                        key={item.questionId}
                        className="hover:bg-slate-50/80 align-top"
                      >
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 tabular-nums">
                          #{item.questionNumber}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">
                            {item.topicSummary}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                            <span>{item.questionCode}</span>
                            <span>·</span>
                            <span>{item.questionType}</span>
                            <span>·</span>
                            <span>{item.cognitiveLevel}</span>
                            <span>·</span>
                            <span>
                              Benar Penuh: {item.fullCorrectCount}
                              {item.partialCorrectCount > 0
                                ? ` · Parsial: ${item.partialCorrectCount}`
                                : ''}{' '}
                              · Salah: {item.wrongCount}
                            </span>
                          </div>
                          {qObj && (
                            <button
                              type="button"
                              onClick={() => setSelectedQuestionPreview(qObj)}
                              className="mt-1.5 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              Lihat Redaksi Soal &amp; Opsi →
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-2.5 text-center font-mono font-bold text-emerald-800">
                          {item.correctKeys.join(', ')}
                        </td>

                        {/* Tingkat Kesukaran (P) */}
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                          <div className="font-bold text-slate-900">
                            {item.difficultyIndex.toFixed(2)}
                          </div>
                          <div
                            className={`text-[10px] font-sans font-semibold mt-0.5 ${
                              item.difficultyCategory === 'Sedang'
                                ? 'text-emerald-700'
                                : item.difficultyCategory === 'Sukar'
                                ? 'text-rose-700'
                                : 'text-blue-700'
                            }`}
                          >
                            {item.difficultyCategory}
                          </div>
                        </td>

                        {/* Daya Beda (D) */}
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                          <div
                            className={`font-bold ${
                              item.discriminationIndex >= 0.3
                                ? 'text-emerald-700'
                                : item.discriminationIndex >= 0.2
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {item.discriminationIndex.toFixed(2)}
                          </div>
                          <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                            {item.discriminationCategory}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            PA:{item.upperProportion} / PB:{item.lowerProportion}
                          </div>
                        </td>

                        {/* Point-Biserial */}
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                          {item.pointBiserial.toFixed(2)}
                        </td>

                        {/* Efektivitas Pengecoh / Distraktor A-E */}
                        <td className="py-3 px-3">
                          <div className="grid grid-cols-5 gap-1">
                            {item.optionStats.map((opt) => (
                              <div
                                key={opt.option}
                                title={`${opt.option}: Dipilih ${opt.totalCount} siswa (${opt.percentage}%) | Atas: ${opt.upperCount}, Bawah: ${opt.lowerCount} | ${opt.distractorStatus}`}
                                className={`p-1.5 rounded border text-center font-mono text-[10px] tabular-nums ${
                                  opt.isKey
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                    : opt.distractorStatus === 'Berfungsi Baik'
                                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                                    : opt.distractorStatus ===
                                      'Perlu Revisi (Inversi)'
                                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                                    : 'bg-amber-50/60 border-amber-200 text-amber-800'
                                }`}
                              >
                                <div className="font-bold">
                                  {opt.option}
                                  {opt.isKey ? '*' : ''}
                                </div>
                                <div>{opt.percentage}%</div>
                                <div className="text-[9px] text-slate-400">
                                  ({opt.totalCount})
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Pengecoh berfungsi efektif:{' '}
                            <strong className="font-mono text-slate-700">
                              {item.effectiveDistractorCount}/
                              {item.totalDistractorCount}
                            </strong>{' '}
                            opsi
                          </div>
                        </td>

                        {/* Keputusan Objektif Bank Soal */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 font-bold">
                            {item.itemDecision === 'Disimpan di Bank Soal' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : item.itemDecision === 'Direvisi' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            )}
                            <span
                              className={
                                item.itemDecision === 'Disimpan di Bank Soal'
                                  ? 'text-emerald-800'
                                  : item.itemDecision === 'Direvisi'
                                  ? 'text-amber-800'
                                  : 'text-rose-800'
                              }
                            >
                              {item.itemDecision}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                            {item.decisionReason}
                          </p>
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

      {/* ===================================================================== */}
      {/* STEP 4: PEMETAAN REMEDIAL PERSONAL PER BUTIR SOAL & LAPORAN CETAK      */}
      {/* ===================================================================== */}
      {activeStep === 'remedial_output' && (
        <div className="space-y-6">
          {/* Ringkasan Prioritas Remedial Klasikal vs Kelompok per Butir Soal */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                04A. Peta Prioritas Remedial Kelas Berdasarkan Ketuntasan Butir Soal
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Mengidentifikasi konsep soal yang membutuhkan <strong>Pembelajaran Ulang Klasikal</strong> (daya serap butir &lt; 45%) vs <strong>Tutor Sebaya / Bimbingan Kelompok</strong> (45%–70%).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-2">
                <div className="text-xs font-bold text-rose-900">
                  Prioritas 1: Remedial Klasikal / Pembelajaran Ulang
                </div>
                <p className="text-[11px] text-rose-700">
                  Butir soal dengan tingkat penguasaan kelas di bawah 45%:
                </p>
                <div className="text-xs font-mono font-bold text-rose-950">
                  {anBusoReport.items
                    .filter(
                      (i) =>
                        i.remedialPriority === 'Remedial Klasikal (Ulang Konsep)'
                    )
                    .map((i) => `No.${i.questionNumber}`)
                    .join(', ') || 'Tidak ada (Seluruh butir ≥ 45%)'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2">
                <div className="text-xs font-bold text-amber-900">
                  Prioritas 2: Remedial Kelompok / Tutor Sebaya
                </div>
                <p className="text-[11px] text-amber-800">
                  Butir soal dengan tingkat penguasaan kelas 45% s.d. 70%:
                </p>
                <div className="text-xs font-mono font-bold text-amber-950">
                  {anBusoReport.items
                    .filter(
                      (i) =>
                        i.remedialPriority ===
                        'Remedial Kelompok / Tutor Sebaya'
                    )
                    .map((i) => `No.${i.questionNumber}`)
                    .join(', ') || 'Tidak ada'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                <div className="text-xs font-bold text-emerald-900">
                  Tuntas Klasikal (Penguasaan &ge; 70%)
                </div>
                <p className="text-[11px] text-emerald-800">
                  Butir soal yang telah dikuasai secara merata oleh kelas:
                </p>
                <div className="text-xs font-mono font-bold text-emerald-950">
                  {anBusoReport.items
                    .filter(
                      (i) => i.remedialPriority === 'Aman (Tuntas Klasikal)'
                    )
                    .map((i) => `No.${i.questionNumber}`)
                    .join(', ') || 'Belum ada'}
                </div>
              </div>
            </div>
          </div>

          {/* Tabel Pemetaan Remedial Personal per Siswa (Prinsip 2 AnBuso) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  04B. Pemetaan Kebutuhan Remedial Personal Siswa per Butir Soal ({filteredRemedialStudents.length} Siswa)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Memetakan secara spesifik <strong>nomor butir soal dan konsep materi apa</strong> yang belum dipahami oleh masing-masing siswa secara individu, bukan sekadar melihat nilai akhir.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={remedialSearch}
                    onChange={(e) => setRemedialSearch(e.target.value)}
                    placeholder="Cari nama siswa / kelas..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <select
                  aria-label="Filter Status Remedial"
                  value={remedialStatusFilter}
                  onChange={(e) =>
                    setRemedialStatusFilter(e.target.value as any)
                  }
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="ALL">Semua Siswa</option>
                  <option value="REMEDIAL">
                    Butuh Remedial / Penguatan Butir
                  </option>
                  <option value="TUNTAS">Tuntas Sempurna (100%)</option>
                </select>
              </div>
            </div>

            {filteredRemedialStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Tidak ada data siswa yang sesuai dengan pencarian/filter di atas.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="py-3 px-3 font-bold text-center w-10">No</th>
                      <th className="py-3 px-3 font-bold min-w-[180px]">
                        Nama Siswa &amp; Kelas
                      </th>
                      <th className="py-3 px-2.5 font-bold text-right">
                        Nilai Akhir
                      </th>
                      <th className="py-3 px-3 font-bold">
                        Status Ketuntasan (KKM {identity.kkm})
                      </th>
                      <th className="py-3 px-3 font-bold min-w-[190px]">
                        Butir Soal Belum Dikuasai (Salah / Parsial)
                      </th>
                      <th className="py-3 px-3 font-bold min-w-[230px]">
                        Konsep / Materi yang Perlu Diperbaiki
                      </th>
                      <th className="py-3 px-3 font-bold min-w-[230px]">
                        Rekomendasi Tindak Lanjut Individual
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRemedialStudents.map((st, idx) => (
                      <tr
                        key={st.studentId}
                        className="hover:bg-slate-50/80 align-top"
                      >
                        <td className="py-3 px-3 text-center font-mono text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {st.studentName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Kelas {st.studentClass} · {st.packageCode} ·{' '}
                            {st.groupRank}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                          <div
                            className={`text-sm font-extrabold ${
                              st.isPassedKkm
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {st.finalScore}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {st.rawEarned}/{st.rawMax} poin
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-bold ${
                              st.isPassedKkm
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {st.statusKkm}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Benar Penuh: {st.masteredNumbers.length} butir
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {st.failedNumbers.length > 0 ? (
                            <div className="text-rose-700 font-bold">
                              Salah ({st.failedNumbers.length}): No.{' '}
                              {st.failedNumbers.join(', ')}
                            </div>
                          ) : (
                            <div className="text-emerald-700 font-semibold">
                              Tidak ada jawaban salah (0)
                            </div>
                          )}
                          {st.partialNumbers.length > 0 && (
                            <div className="text-amber-700 font-semibold mt-1">
                              Parsial PGK ({st.partialNumbers.length}): No.{' '}
                              {st.partialNumbers.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {st.weakTopics.length > 0 ? (
                            <ul className="space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                              {st.weakTopics.map((topic, i) => (
                                <li key={i}>{topic}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Seluruh konsep materi telah dikuasai dengan sangat baik.
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-700 leading-relaxed">
                          {st.recommendedAction}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Pratinjau Butir Soal */}
      {selectedQuestionPreview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Pratinjau Butir Soal &amp; Kunci Jawaban (#{selectedQuestionPreview.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedQuestionPreview(null)}
                className="text-slate-400 hover:text-slate-700 px-2 py-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedQuestionPreview.data_opsi?.wacana && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-[11px] text-slate-500 uppercase">
                  Wacana Stimulus:
                </div>
                <MathAndTableRenderer
                  content={selectedQuestionPreview.data_opsi.wacana}
                />
              </div>
            )}

            <div className="text-sm text-slate-800 leading-relaxed space-y-1">
              <div className="font-bold text-xs text-slate-500 uppercase">
                Redaksi Pertanyaan:
              </div>
              <MathAndTableRenderer content={selectedQuestionPreview.teks_soal} />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="font-bold text-slate-700">Pilihan Opsi A–E:</div>
              {(['A', 'B', 'C', 'D', 'E'] as const).map((key) => {
                const optText = selectedQuestionPreview.data_opsi?.opsi?.[key];
                if (!optText && optText !== '') return null;
                const isKey = (
                  customKeyOverrides[Number(selectedQuestionPreview.id)] ||
                  selectedQuestionPreview.kunci_jawaban ||
                  []
                ).includes(key);

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
                      <span className="text-[10px] font-bold text-emerald-700">
                        Kunci Jawaban
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedQuestionPreview(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
