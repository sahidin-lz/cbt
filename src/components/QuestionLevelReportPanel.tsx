import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  Sparkles,
  Printer,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from '../types/cbt';
import {
  getEffectiveMataPelajaran,
  isExamMatchedForStudentClass,
  buildExcelHtmlTable,
  buildSemicolonCsv,
} from '../utils/cbtLogic';
import {
  computeAnBusoAnalysis,
  downloadAnBusoPdfReport,
  AnBusoItemAnalysis,
} from '../utils/cbtAnBusoLogic';
import { MathAndTableRenderer } from './MathAndTableRenderer';

interface QuestionLevelReportPanelProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  selectedClass: string;
  onSelectClass: (kelas: string) => void;
  selectedMapel: string;
  onSelectMapel: (mapel: string) => void;
  selectedExamId: string;
  onSelectExamId: (examId: string) => void;
  uniqueClasses: string[];
  availableMataPelajaran: string[];
  teacherName?: string;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

function downloadFileHelper(content: string, filename: string, mimeType: string) {
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

export const QuestionLevelReportPanel: React.FC<QuestionLevelReportPanelProps> = ({
  exams,
  questions,
  students,
  results,
  selectedClass,
  onSelectClass,
  selectedMapel,
  onSelectMapel,
  selectedExamId,
  onSelectExamId,
  uniqueClasses,
  availableMataPelajaran,
  teacherName = 'Sahidin, S.Sos.',
  isMinimized = false,
  onToggleMinimize,
}) => {
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<string>('ALL');
  const [filterTypeCognitive, setFilterTypeCognitive] = useState<
    'ALL' | 'PG' | 'Kompleks' | 'LOTS' | 'HOTS'
  >('ALL');
  const [filterMasteryPriority, setFilterMasteryPriority] = useState<
    | 'ALL'
    | 'Aman (Tuntas Klasikal)'
    | 'Remedial Kelompok / Tutor Sebaya'
    | 'Remedial Klasikal (Ulang Konsep)'
  >('ALL');
  const [studentAnswerFilter, setStudentAnswerFilter] = useState<
    'ALL' | 'Benar Penuh' | 'Benar Sebagian' | 'Salah'
  >('ALL');
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [inspectedQuestionNumber, setInspectedQuestionNumber] = useState<number | null>(
    null
  );
  const [reanalysisStamp, setReanalysisStamp] = useState<string | null>(null);

  // Resolve active exam to analyze
  const matchedExams = useMemo(() => {
    const byMapel =
      selectedMapel === 'SEMUA'
        ? exams
        : exams.filter(
            (ex) =>
              getEffectiveMataPelajaran(ex).toUpperCase() ===
              selectedMapel.toUpperCase()
          );
    if (selectedClass === 'SEMUA') return byMapel.length > 0 ? byMapel : exams;
    const byClass = byMapel.filter((ex) =>
      isExamMatchedForStudentClass(ex, selectedClass)
    );
    return byClass.length > 0 ? byClass : byMapel.length > 0 ? byMapel : exams;
  }, [exams, selectedMapel, selectedClass]);

  const activeExam = useMemo(() => {
    if (selectedExamId !== 'SEMUA') {
      const found = exams.find((e) => String(e.id) === selectedExamId);
      if (found) return found;
    }
    // Prefer exam that has results in the current class
    for (const ex of matchedExams) {
      const hasRes = results.some((r) => Number(r.exam_id) === Number(ex.id));
      if (hasRes) return ex;
    }
    return matchedExams[0] || exams[0] || null;
  }, [selectedExamId, matchedExams, exams, results]);

  const examQuestions = useMemo(() => {
    if (!activeExam) return questions;
    const qs = questions.filter((q) => Number(q.exam_id) === Number(activeExam.id));
    return qs.length > 0 ? qs : questions;
  }, [questions, activeExam]);

  const scopedResults = useMemo(() => {
    const qIds = new Set(examQuestions.map((q) => String(q.id)));
    return results.filter((r) => {
      const st = students.find((s) => Number(s.id) === Number(r.student_id));
      if (selectedClass !== 'SEMUA') {
        if (
          !st ||
          st.kelas.trim().toLowerCase() !== selectedClass.trim().toLowerCase()
        ) {
          return false;
        }
      }
      if (!activeExam) return true;
      if (Number(r.exam_id) === Number(activeExam.id)) return true;
      const ansKeys = Object.keys(r.jawaban_siswa || {});
      return ansKeys.some((k) => qIds.has(k));
    });
  }, [results, students, selectedClass, activeExam, examQuestions]);

  const report = useMemo(() => {
    return computeAnBusoAnalysis({
      identity: {
        namaSekolah: 'SMA Islam Al Ghozali / Institusi Penyelenggara CBT',
        mataPelajaran: activeExam
          ? getEffectiveMataPelajaran(activeExam)
          : selectedMapel === 'SEMUA'
          ? 'Sosiologi'
          : selectedMapel,
        kelasRombel: selectedClass === 'SEMUA' ? 'Semua Kelas' : selectedClass,
        namaTes: activeExam?.judul_ujian || 'Evaluasi Akademik CBT',
        semesterTahunAjaran: 'TA 2025/2026',
        namaPendidik: teacherName,
        nipPendidik: '-',
        tanggalUjian: new Date().toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        kkm: 70,
      },
      exam: activeExam,
      questions: examQuestions,
      students,
      results: scopedResults,
    });
  }, [activeExam, selectedMapel, selectedClass, teacherName, examQuestions, students, scopedResults]);

  // Also compute per-class mastery comparison for every question across all classes that took this exam
  const perClassQuestionComparison = useMemo(() => {
    const qIds = new Set(examQuestions.map((q) => String(q.id)));
    const examResultsAllClasses = results.filter((r) => {
      if (!activeExam) return true;
      if (Number(r.exam_id) === Number(activeExam.id)) return true;
      return Object.keys(r.jawaban_siswa || {}).some((k) => qIds.has(k));
    });

    const classList = uniqueClasses.filter((cls) => {
      return examResultsAllClasses.some((r) => {
        const st = students.find((s) => Number(s.id) === Number(r.student_id));
        return st && st.kelas.trim().toLowerCase() === cls.trim().toLowerCase();
      });
    });

    const mapByClass: Record<
      string,
      Record<
        number,
        {
          respondents: number;
          fullCorrect: number;
          partialCorrect: number;
          wrong: number;
          masteryPercent: number;
        }
      >
    > = {};

    for (const cls of classList) {
      const clsRes = examResultsAllClasses.filter((r) => {
        const st = students.find((s) => Number(s.id) === Number(r.student_id));
        return st && st.kelas.trim().toLowerCase() === cls.trim().toLowerCase();
      });
      const clsReport = computeAnBusoAnalysis({
        identity: {
          namaSekolah: 'Institusi CBT',
          mataPelajaran: activeExam ? getEffectiveMataPelajaran(activeExam) : 'Sosiologi',
          kelasRombel: cls,
          namaTes: activeExam?.judul_ujian || 'Ujian',
          semesterTahunAjaran: '2025/2026',
          namaPendidik: teacherName,
          nipPendidik: '-',
          tanggalUjian: '-',
          kkm: 70,
        },
        exam: activeExam,
        questions: examQuestions,
        students,
        results: clsRes,
      });

      mapByClass[cls] = {};
      for (const item of clsReport.items) {
        mapByClass[cls][item.questionNumber] = {
          respondents: item.respondentCount,
          fullCorrect: item.fullCorrectCount,
          partialCorrect: item.partialCorrectCount,
          wrong: item.wrongCount,
          masteryPercent: Math.round(item.difficultyIndex * 100),
        };
      }
    }

    return { classList, mapByClass };
  }, [examQuestions, results, activeExam, uniqueClasses, students, teacherName]);

  const filteredQuestionItems = useMemo(() => {
    return report.items.filter((item) => {
      const matchNum =
        selectedQuestionNumber === 'ALL' ||
        String(item.questionNumber) === selectedQuestionNumber;
      const matchTypeCog =
        filterTypeCognitive === 'ALL'
          ? true
          : filterTypeCognitive === 'PG'
          ? item.questionType === 'PG'
          : filterTypeCognitive === 'Kompleks'
          ? item.questionType === 'Kompleks'
          : filterTypeCognitive === 'HOTS'
          ? item.cognitiveLevel === 'HOTS'
          : item.cognitiveLevel === 'LOTS';
      const matchMastery =
        filterMasteryPriority === 'ALL' ||
        item.remedialPriority === filterMasteryPriority;
      return matchNum && matchTypeCog && matchMastery;
    });
  }, [
    report.items,
    selectedQuestionNumber,
    filterTypeCognitive,
    filterMasteryPriority,
  ]);

  // Active single question being inspected in detail (either from dropdown or table row click)
  const effectiveInspectedNum = useMemo(() => {
    if (selectedQuestionNumber !== 'ALL') {
      return Number(selectedQuestionNumber);
    }
    return inspectedQuestionNumber;
  }, [selectedQuestionNumber, inspectedQuestionNumber]);

  const inspectedItem: AnBusoItemAnalysis | null = useMemo(() => {
    if (!effectiveInspectedNum) return null;
    return (
      report.items.find((i) => i.questionNumber === effectiveInspectedNum) || null
    );
  }, [report.items, effectiveInspectedNum]);

  const inspectedQuestionObj: QuestionItem | null = useMemo(() => {
    if (!inspectedItem) return null;
    return (
      examQuestions.find((q) => Number(q.id) === Number(inspectedItem.questionId)) ||
      null
    );
  }, [inspectedItem, examQuestions]);

  const inspectedQuestionStudentRows = useMemo(() => {
    if (!inspectedItem) return [];
    const qNum = inspectedItem.questionNumber;
    return report.studentRemedial
      .map((st) => {
        const cell = st.itemScores[qNum] || {
          chosen: [],
          earned: 0,
          max: inspectedItem.maxPoints,
          status: 'Salah' as const,
        };
        return {
          studentId: st.studentId,
          studentName: st.studentName,
          studentClass: st.studentClass,
          packageCode: st.packageCode,
          finalScore: st.finalScore,
          chosen: cell.chosen,
          earned: cell.earned,
          max: cell.max,
          status: cell.status,
        };
      })
      .filter((row) => {
        const matchStatus =
          studentAnswerFilter === 'ALL' || row.status === studentAnswerFilter;
        const matchSearch =
          !studentSearchQuery.trim() ||
          row.studentName
            .toLowerCase()
            .includes(studentSearchQuery.trim().toLowerCase()) ||
          row.studentClass
            .toLowerCase()
            .includes(studentSearchQuery.trim().toLowerCase());
        return matchStatus && matchSearch;
      });
  }, [report.studentRemedial, inspectedItem, studentAnswerFilter, studentSearchQuery]);

  const handleExportPerQuestionExcel = () => {
    const headers = [
      'No Soal',
      'Kode Soal',
      'Tipe Soal',
      'Level Kognitif',
      'Kunci Jawaban',
      'Ringkasan Materi / Indikator',
      'Kelas Dianalisis',
      'Jumlah Responden',
      'Benar Penuh',
      'Benar Sebagian (Parsial PGK)',
      'Salah',
      'Daya Serap Kelas (%)',
      'Kategori Kesukaran',
      'Daya Beda (D)',
      'Sebaran Opsi A–E',
      'Status Ketuntasan Butir',
      'Rekomendasi Bank Soal',
    ];
    const rows = filteredQuestionItems.map((it) => [
      `No. ${it.questionNumber}`,
      it.questionCode,
      it.questionType,
      it.cognitiveLevel,
      it.correctKeys.join(', '),
      it.topicSummary,
      selectedClass === 'SEMUA' ? 'Semua Kelas' : `Kelas ${selectedClass}`,
      it.respondentCount,
      it.fullCorrectCount,
      it.partialCorrectCount,
      it.wrongCount,
      `${Math.round(it.difficultyIndex * 100)}%`,
      `${it.difficultyCategory} (${it.difficultyIndex.toFixed(2)})`,
      `${it.discriminationIndex.toFixed(2)} (${it.discriminationCategory})`,
      it.optionStats
        .map((o) => `${o.option}${o.isKey ? '*' : ''}:${o.totalCount}(${o.percentage}%)`)
        .join(' | '),
      it.remedialPriority,
      it.itemDecision,
    ]);
    const cleanCls = (selectedClass === 'SEMUA' ? 'Semua_Kelas' : selectedClass).replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const html = buildExcelHtmlTable(
      `Analisis Per Butir Soal - ${cleanCls}`,
      headers,
      rows
    );
    downloadFileHelper(
      html,
      `Analisis_Per_Butir_Soal_${cleanCls}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportPerQuestionCsv = () => {
    const headers = [
      'No_Soal',
      'Kode_Soal',
      'Tipe',
      'Level_Kognitif',
      'Kunci',
      'Kelas',
      'Responden',
      'Benar_Penuh',
      'Benar_Parsial',
      'Salah',
      'Daya_Serap_Persen',
      'Kategori_Kesukaran',
      'Daya_Beda',
      'Status_Ketuntasan',
    ];
    const rows = filteredQuestionItems.map((it) => [
      it.questionNumber,
      it.questionCode,
      it.questionType,
      it.cognitiveLevel,
      it.correctKeys.join(','),
      selectedClass === 'SEMUA' ? 'Semua Kelas' : selectedClass,
      it.respondentCount,
      it.fullCorrectCount,
      it.partialCorrectCount,
      it.wrongCount,
      Math.round(it.difficultyIndex * 100),
      it.difficultyCategory,
      it.discriminationIndex,
      it.remedialPriority,
    ]);
    const cleanCls = (selectedClass === 'SEMUA' ? 'Semua_Kelas' : selectedClass).replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const csv = buildSemicolonCsv(headers, rows);
    downloadFileHelper(
      csv,
      `Analisis_Per_Butir_Soal_${cleanCls}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleTriggerReanalyze = () => {
    setReanalysisStamp(
      new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  };

  return (
    <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
      {/* Header Banner with Minimize Toggle */}
      <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Sub-Modul 5C · Analisis Mendalam Per Kelas &amp; Per Butir Soal</span>
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
            Bedah &amp; Analisis Capaian Per Kelas, Per Paket &amp; Per Nomor Soal (
            {selectedClass === 'SEMUA' ? 'Semua Kelas' : `Kelas ${selectedClass}`} ·{' '}
            {filteredQuestionItems.length} Soal)
          </h2>
          {!isMinimized && (
            <p className="text-xs text-blue-200/90 mt-0.5 max-w-4xl">
              Pilih <strong>Kelas/Rombel</strong>, <strong>Paket Ujian</strong>, atau{' '}
              <strong>Nomor Butir Soal Spesifik (#1 s/d #{report.items.length})</strong> untuk melihat daya serap tiap soal, distribusi jawaban A–E, perbandingan antar kelas, serta daftar siswa yang benar/parsial/salah pada soal tersebut.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerReanalyze}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer transition-colors shadow-2xs"
            title="Hitung dan Analisis Ulang Seluruh Data Kelas & Butir Soal"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Analisis Ulang</span>
          </button>
          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white cursor-pointer transition-colors"
            >
              {isMinimized ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-amber-300" />
                  <span>Buka Analisis Per Soal</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!isMinimized && (
        <div className="p-6 space-y-5">
          {/* Interactive Multi-Filter Bar: Pilih Per Kelas, Per Paket, Per Nomor Soal, Per Tipe/Kognitif */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-slate-50 border border-indigo-200/80 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-950">
                <Filter className="w-4 h-4 text-indigo-600" />
                <span>
                  Filter Multi-Dimensi: Pilih Per Kelas, Paket Ujian, Nomor Soal &amp; Level Kognitif
                </span>
                {reanalysisStamp && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-mono">
                    Dianalisis ulang: {reanalysisStamp}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAnBusoPdfReport(report)}
                  disabled={report.items.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF Analisis Soal ({selectedClass === 'SEMUA' ? 'Semua' : selectedClass})</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPerQuestionExcel}
                  disabled={filteredQuestionItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel Per Soal (.xls)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPerQuestionCsv}
                  disabled={filteredQuestionItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV Per Soal</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* 1. Pilih Kelas / Rombel */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Pilih Kelas / Rombel
                </label>
                <select
                  value={selectedClass}
                  onChange={(e) => onSelectClass(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold text-indigo-950 bg-white border border-indigo-300 rounded-xl cursor-pointer"
                >
                  <option value="SEMUA">Semua Kelas ({results.length} Hasil)</option>
                  {uniqueClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Pilih Mata Pelajaran */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  2. Pilih Mata Pelajaran
                </label>
                <select
                  value={selectedMapel}
                  onChange={(e) => {
                    onSelectMapel(e.target.value);
                    onSelectExamId('SEMUA');
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl cursor-pointer"
                >
                  <option value="SEMUA">
                    Semua Mapel ({availableMataPelajaran.length})
                  </option>
                  {availableMataPelajaran.map((mp) => (
                    <option key={mp} value={mp}>
                      {mp}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Pilih Paket Ujian */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  3. Pilih Paket Soal Ujian
                </label>
                <select
                  value={
                    selectedExamId === 'SEMUA' && activeExam
                      ? String(activeExam.id)
                      : selectedExamId
                  }
                  onChange={(e) => {
                    onSelectExamId(e.target.value);
                    setSelectedQuestionNumber('ALL');
                    setInspectedQuestionNumber(null);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl cursor-pointer"
                >
                  <option value="SEMUA">
                    Otomatis Paket Aktif ({activeExam?.judul_ujian || 'Semua'})
                  </option>
                  {matchedExams.map((ex) => (
                    <option key={ex.id} value={String(ex.id)}>
                      {ex.judul_ujian} ({ex.kode_paket || 'PAKET-A'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Pilih Spesifik Nomor Butir Soal */}
              <div>
                <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                  4. Pilih Per Butir Soal (#1–#{report.items.length})
                </label>
                <select
                  value={selectedQuestionNumber}
                  onChange={(e) => {
                    setSelectedQuestionNumber(e.target.value);
                    if (e.target.value !== 'ALL') {
                      setInspectedQuestionNumber(Number(e.target.value));
                    } else {
                      setInspectedQuestionNumber(null);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs font-extrabold text-indigo-950 bg-amber-50/90 border border-amber-400 rounded-xl cursor-pointer"
                >
                  <option value="ALL">
                    Semua Butir Soal (1 s/d {report.items.length})
                  </option>
                  {report.items.map((item) => (
                    <option
                      key={item.questionId}
                      value={String(item.questionNumber)}
                    >
                      Soal No. {item.questionNumber} ({item.questionType} ·{' '}
                      {item.cognitiveLevel} · Serap{' '}
                      {Math.round(item.difficultyIndex * 100)}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Filter Tipe & Level Kognitif */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  5. Tipe &amp; Level Kognitif
                </label>
                <select
                  value={filterTypeCognitive}
                  onChange={(e) => setFilterTypeCognitive(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl cursor-pointer"
                >
                  <option value="ALL">Semua Tipe &amp; Level</option>
                  <option value="PG">PG Tunggal (1 Kunci)</option>
                  <option value="Kompleks">PG Kompleks (Multi-Jawaban)</option>
                  <option value="LOTS">Level Kognitif LOTS (C1–C3)</option>
                  <option value="HOTS">Level Kognitif HOTS (C4–C6)</option>
                </select>
              </div>
            </div>

            {/* Quick Pill Filter for Mastery Status + Quick Jump Question Buttons */}
            <div className="pt-2 border-t border-indigo-200/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-600 mr-1">
                  Status Ketuntasan Butir:
                </span>
                {(
                  [
                    ['ALL', `Semua (${report.items.length})`],
                    [
                      'Aman (Tuntas Klasikal)',
                      `Tuntas ≥70% (${
                        report.items.filter(
                          (i) => i.remedialPriority === 'Aman (Tuntas Klasikal)'
                        ).length
                      })`,
                    ],
                    [
                      'Remedial Kelompok / Tutor Sebaya',
                      `Penguatan 45–69% (${
                        report.items.filter(
                          (i) =>
                            i.remedialPriority ===
                            'Remedial Kelompok / Tutor Sebaya'
                        ).length
                      })`,
                    ],
                    [
                      'Remedial Klasikal (Ulang Konsep)',
                      `Remedial Klasikal <45% (${
                        report.items.filter(
                          (i) =>
                            i.remedialPriority ===
                            'Remedial Klasikal (Ulang Konsep)'
                        ).length
                      })`,
                    ],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilterMasteryPriority(val)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      filterMasteryPriority === val
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-indigo-50 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(selectedQuestionNumber !== 'ALL' ||
                filterTypeCognitive !== 'ALL' ||
                filterMasteryPriority !== 'ALL' ||
                selectedClass !== 'SEMUA') && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedQuestionNumber('ALL');
                    setInspectedQuestionNumber(null);
                    setFilterTypeCognitive('ALL');
                    setFilterMasteryPriority('ALL');
                    onSelectClass('SEMUA');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                >
                  Reset Semua Filter Soal &amp; Kelas
                </button>
              )}
            </div>

            {/* Interactive Number Grid Picker (Pilih Cepat Nomor Soal 1..N) */}
            {report.items.length > 0 && (
              <div className="pt-2 border-t border-indigo-200/60 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-indigo-950">
                    Klik Cepat Nomor Soal untuk Bedah Detail Soal &amp; Jawaban Siswa:
                  </span>
                  <span className="text-slate-500">
                    Hijau = Tuntas (≥70%) · Kuning = Penguatan (45–69%) · Merah = Remedial (&lt;45%)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedQuestionNumber('ALL');
                      setInspectedQuestionNumber(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                      !effectiveInspectedNum
                        ? 'bg-slate-900 text-amber-300 ring-2 ring-amber-400'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Semua Soal
                  </button>
                  {report.items.map((it) => {
                    const pct = Math.round(it.difficultyIndex * 100);
                    const isSelected = effectiveInspectedNum === it.questionNumber;
                    const colorCls =
                      pct >= 70
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                        : pct >= 45
                        ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                        : 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100';
                    return (
                      <button
                        key={it.questionId}
                        type="button"
                        onClick={() => {
                          setInspectedQuestionNumber(it.questionNumber);
                          setSelectedQuestionNumber(String(it.questionNumber));
                        }}
                        title={`Soal #${it.questionNumber} (${it.questionType} · ${it.cognitiveLevel}) — Daya Serap: ${pct}%`}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-300 scale-105'
                            : colorCls
                        }`}
                      >
                        #{it.questionNumber} ({pct}%)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* DETAILED SINGLE QUESTION INSPECTOR (WHEN A QUESTION IS SELECTED)  */}
          {/* ================================================================= */}
          {inspectedItem && (
            <div className="border-2 border-indigo-500 rounded-2xl overflow-hidden bg-gradient-to-b from-indigo-50/40 to-white shadow-sm space-y-5 p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-indigo-200 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-xs font-extrabold">
                      BEDAH SOAL NO. {inspectedItem.questionNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 font-mono text-xs font-bold">
                      {inspectedItem.questionCode} · {inspectedItem.questionType}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 text-xs font-bold">
                      Level {inspectedItem.cognitiveLevel}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-xs font-extrabold">
                      Kunci: {inspectedItem.correctKeys.join(', ')}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Indikator/Materi: {inspectedItem.topicSummary}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={inspectedItem.questionNumber <= 1}
                    onClick={() => {
                      const prev = Math.max(1, inspectedItem.questionNumber - 1);
                      setInspectedQuestionNumber(prev);
                      setSelectedQuestionNumber(String(prev));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    ← Soal Sebelumnya
                  </button>
                  <button
                    type="button"
                    disabled={inspectedItem.questionNumber >= report.items.length}
                    onClick={() => {
                      const next = Math.min(
                        report.items.length,
                        inspectedItem.questionNumber + 1
                      );
                      setInspectedQuestionNumber(next);
                      setSelectedQuestionNumber(String(next));
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    Soal Berikutnya →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedQuestionNumber('ALL');
                      setInspectedQuestionNumber(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                  >
                    Tutup Bedah Soal
                  </button>
                </div>
              </div>

              {/* 4 KPI Cards for this specific question */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-3.5 rounded-xl bg-white border border-blue-200">
                  <div className="text-[11px] font-bold text-blue-800 uppercase">
                    Daya Serap Soal ({selectedClass === 'SEMUA' ? 'Semua Kelas' : selectedClass})
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-blue-950 mt-1">
                    {Math.round(inspectedItem.difficultyIndex * 100)}%
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Kategori Kesukaran: <strong>{inspectedItem.difficultyCategory}</strong>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">
                    Rincian Jawaban Siswa
                  </div>
                  <div className="text-xs font-extrabold font-mono text-slate-900 mt-1.5 space-y-0.5">
                    <div className="text-emerald-700">
                      ✓ Benar Penuh: {inspectedItem.fullCorrectCount} siswa
                    </div>
                    {inspectedItem.partialCorrectCount > 0 && (
                      <div className="text-amber-700">
                        ◐ Benar Sebagian (Humanis): {inspectedItem.partialCorrectCount} siswa
                      </div>
                    )}
                    <div className="text-rose-700">
                      ✗ Salah: {inspectedItem.wrongCount} siswa
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-purple-200">
                  <div className="text-[11px] font-bold text-purple-800 uppercase">
                    Daya Beda (D) &amp; Korelasi
                  </div>
                  <div className="text-xl font-extrabold font-mono text-purple-950 mt-1">
                    D = {inspectedItem.discriminationIndex.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-purple-700">
                      ({inspectedItem.discriminationCategory})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Atas (PA): {inspectedItem.upperProportion} · Bawah (PB):{' '}
                    {inspectedItem.lowerProportion}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-amber-200">
                  <div className="text-[11px] font-bold text-amber-900 uppercase">
                    Status &amp; Rekomendasi Soal
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 mt-1">
                    {inspectedItem.remedialPriority}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Bank Soal: <strong>{inspectedItem.itemDecision}</strong>
                  </div>
                </div>
              </div>

              {/* Question Text + Options Distribution Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {inspectedQuestionObj && (
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>Redaksi Teks Soal &amp; Sebaran Pilihan Opsi Siswa</span>
                    </div>
                    {inspectedQuestionObj.data_opsi?.wacana && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <MathAndTableRenderer
                          content={inspectedQuestionObj.data_opsi.wacana}
                        />
                      </div>
                    )}
                    <div className="text-xs sm:text-sm text-slate-900 leading-relaxed">
                      <MathAndTableRenderer content={inspectedQuestionObj.teks_soal} />
                    </div>
                    <div className="space-y-2 pt-2">
                      {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                        const optText =
                          inspectedQuestionObj.data_opsi?.opsi?.[optKey] || '';
                        const stat = inspectedItem.optionStats.find(
                          (o) => o.option === optKey
                        );
                        const isKey = inspectedItem.correctKeys.includes(optKey);
                        return (
                          <div
                            key={optKey}
                            className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                              isKey
                                ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold'
                                : 'bg-slate-50/70 border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="font-mono font-extrabold">
                                {optKey}.
                              </span>
                              <div className="min-w-0">
                                <MathAndTableRenderer content={optText} />
                              </div>
                            </div>
                            {stat && (
                              <div className="shrink-0 text-right font-mono">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    isKey
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 text-slate-800'
                                  }`}
                                >
                                  {stat.totalCount} siswa ({stat.percentage}%)
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Perbandingan Capaian Soal Ini Antar Kelas */}
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>
                      Perbandingan Daya Serap Soal #{inspectedItem.questionNumber} Lintas Kelas
                    </span>
                  </div>

                  {perClassQuestionComparison.classList.length === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      Belum ada data lintas kelas untuk soal ini.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {perClassQuestionComparison.classList.map((clsName) => {
                        const cStat =
                          perClassQuestionComparison.mapByClass[clsName]?.[
                            inspectedItem.questionNumber
                          ];
                        if (!cStat) return null;
                        const isCurrentClass =
                          selectedClass.trim().toLowerCase() ===
                          clsName.trim().toLowerCase();
                        return (
                          <div
                            key={clsName}
                            onClick={() => onSelectClass(clsName)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer ${
                              isCurrentClass
                                ? 'bg-indigo-50/90 border-indigo-400 ring-1 ring-indigo-300'
                                : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                              <span>Kelas {clsName}</span>
                              <span
                                className={`font-mono font-extrabold ${
                                  cStat.masteryPercent >= 70
                                    ? 'text-emerald-700'
                                    : cStat.masteryPercent >= 45
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                Daya Serap: {cStat.masteryPercent}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                              <div
                                className={`h-full rounded-full ${
                                  cStat.masteryPercent >= 70
                                    ? 'bg-emerald-600'
                                    : cStat.masteryPercent >= 45
                                    ? 'bg-amber-500'
                                    : 'bg-rose-600'
                                }`}
                                style={{
                                  width: `${Math.max(4, cStat.masteryPercent)}%`,
                                }}
                              />
                            </div>
                            <div className="text-[11px] font-mono text-slate-600 mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="text-emerald-700 font-semibold">
                                ✓ Penuh: {cStat.fullCorrect}
                              </span>
                              {cStat.partialCorrect > 0 && (
                                <span className="text-amber-700 font-semibold">
                                  ◐ Parsial: {cStat.partialCorrect}
                                </span>
                              )}
                              <span className="text-rose-700 font-semibold">
                                ✗ Salah: {cStat.wrong}
                              </span>
                              <span className="text-slate-400">
                                ({cStat.respondents} siswa)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Daftar Siswa dan Jawaban Mereka pada Soal Terpilih */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                      Daftar Respons Siswa pada Soal No. {inspectedItem.questionNumber} (
                      {selectedClass === 'SEMUA'
                        ? 'Semua Kelas'
                        : `Kelas ${selectedClass}`}{' '}
                      — {inspectedQuestionStudentRows.length} Siswa)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Filter siswa yang menjawab Benar Penuh, Benar Sebagian (Parsial Humanis), atau Salah pada nomor soal ini.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        placeholder="Cari nama siswa..."
                        className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <select
                      value={studentAnswerFilter}
                      onChange={(e) =>
                        setStudentAnswerFilter(e.target.value as any)
                      }
                      className="px-2.5 py-1 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                    >
                      <option value="ALL">Semua Status Jawaban</option>
                      <option value="Benar Penuh">
                        ✓ Hanya Siswa Benar Penuh ({inspectedItem.fullCorrectCount})
                      </option>
                      <option value="Benar Sebagian">
                        ◐ Hanya Siswa Benar Sebagian ({inspectedItem.partialCorrectCount})
                      </option>
                      <option value="Salah">
                        ✗ Hanya Siswa Menjawab Salah ({inspectedItem.wrongCount})
                      </option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-800 font-bold">
                      <tr>
                        <th className="py-2 px-3 w-10 text-center">No</th>
                        <th className="py-2 px-3">Nama Siswa</th>
                        <th className="py-2 px-3">Kelas · Paket</th>
                        <th className="py-2 px-3 text-center">
                          Jawaban Siswa (Kunci: {inspectedItem.correctKeys.join(', ')})
                        </th>
                        <th className="py-2 px-3 text-center">Status Jawaban</th>
                        <th className="py-2 px-3 text-right">Poin Butir</th>
                        <th className="py-2 px-3 text-right">Nilai Total Ujian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inspectedQuestionStudentRows.map((row, idx) => (
                        <tr key={row.studentId} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-center font-mono text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {row.studentName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {row.studentClass} ·{' '}
                            <span className="font-mono font-bold text-indigo-700">
                              {row.packageCode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-extrabold">
                            {row.chosen.length > 0 ? row.chosen.join(', ') : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] ${
                                row.status === 'Benar Penuh'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : row.status === 'Benar Sebagian'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {row.status === 'Benar Penuh'
                                ? '✓ Benar Penuh'
                                : row.status === 'Benar Sebagian'
                                ? '◐ Benar Sebagian (Humanis)'
                                : '✗ Salah'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold">
                            +{row.earned} / {row.max}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-extrabold text-blue-800">
                            {row.finalScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* COMPLETE PER-QUESTION ANALYSIS TABLE                              */}
          {/* ================================================================= */}
          <div className="overflow-x-auto border border-indigo-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-indigo-50/80 border-b border-indigo-100 text-indigo-950 font-bold">
                  <th className="py-3 px-3 text-center w-14">No</th>
                  <th className="py-3 px-3 min-w-[220px]">
                    Indikator Soal &amp; Tipe Kognitif
                  </th>
                  <th className="py-3 px-2.5 text-center">Kunci</th>
                  <th className="py-3 px-3 text-right">
                    Daya Serap ({selectedClass === 'SEMUA' ? 'Semua' : selectedClass})
                  </th>
                  <th className="py-3 px-3 text-center">
                    Benar / Parsial / Salah
                  </th>
                  <th className="py-3 px-3 min-w-[230px]">
                    Sebaran Opsi Siswa (A / B / C / D / E)
                  </th>
                  <th className="py-3 px-3">Status Ketuntasan Soal</th>
                  <th className="py-3 px-3 text-right">Aksi Bedah Soal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredQuestionItems.map((item) => {
                  const masteryPct = Math.round(item.difficultyIndex * 100);
                  const isCurrentlyInspected =
                    effectiveInspectedNum === item.questionNumber;
                  return (
                    <tr
                      key={item.questionId}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isCurrentlyInspected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-mono font-extrabold text-slate-900">
                        #{item.questionNumber}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 line-clamp-2">
                          {item.topicSummary}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-slate-700">
                            {item.questionCode}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              item.questionType === 'Kompleks'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-100 text-blue-900'
                            }`}
                          >
                            {item.questionType}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              item.cognitiveLevel === 'HOTS'
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {item.cognitiveLevel}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono font-extrabold text-emerald-800">
                        {item.correctKeys.join(', ')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <div
                          className={`text-sm font-extrabold ${
                            masteryPct >= 70
                              ? 'text-emerald-700'
                              : masteryPct >= 45
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {masteryPct}%
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {item.difficultyCategory} · D:{item.discriminationIndex.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-[11px]">
                        <span className="text-emerald-700 font-bold" title="Benar Penuh">
                          ✓{item.fullCorrectCount}
                        </span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span
                          className="text-amber-700 font-bold"
                          title="Benar Sebagian (Parsial Humanis PG Kompleks)"
                        >
                          ◐{item.partialCorrectCount}
                        </span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="text-rose-700 font-bold" title="Salah">
                          ✗{item.wrongCount}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="grid grid-cols-5 gap-1">
                          {item.optionStats.map((opt) => (
                            <div
                              key={opt.option}
                              className={`p-1 rounded border text-center font-mono text-[10px] ${
                                opt.isKey
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-extrabold'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <div>
                                {opt.option}
                                {opt.isKey ? '*' : ''}
                              </div>
                              <div>{opt.percentage}%</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 font-bold">
                          {item.remedialPriority === 'Aman (Tuntas Klasikal)' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : item.remedialPriority ===
                            'Remedial Kelompok / Tutor Sebaya' ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          )}
                          <span
                            className={
                              item.remedialPriority === 'Aman (Tuntas Klasikal)'
                                ? 'text-emerald-800'
                                : item.remedialPriority ===
                                  'Remedial Kelompok / Tutor Sebaya'
                                ? 'text-amber-800'
                                : 'text-rose-800'
                            }
                          >
                            {item.remedialPriority}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentlyInspected) {
                              setInspectedQuestionNumber(null);
                              setSelectedQuestionNumber('ALL');
                            } else {
                              setInspectedQuestionNumber(item.questionNumber);
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                            isCurrentlyInspected
                              ? 'bg-slate-900 text-amber-300'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>
                            {isCurrentlyInspected
                              ? 'Tutup Bedah'
                              : 'Bedah Soal & Siswa'}
                          </span>
                        </button>
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
  );
};
