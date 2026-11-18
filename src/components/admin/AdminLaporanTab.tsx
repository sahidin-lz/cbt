import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  getEffectiveMataPelajaran,
  resolveSyncedStudentAnswersForExam,
} from '../../utils/cbtLogic';
import {
  downloadStudentTokenCardsPdf,
  downloadSingleStudentResultPdf,
  formatExamAttemptTimeShort,
  formatExamAttemptTimeFull,
} from '../../utils/cbtPdfGenerator';
import { ClassPerformanceLotsHotsChart } from '../ClassPerformanceLotsHotsChart';
import { QuestionLevelReportPanel } from '../QuestionLevelReportPanel';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminLaporanTab: React.FC = () => {
  const {
    exams,
    questions,
    students,
    results,
    onRefreshData,
    teacherProfile,
    isSubMenuBarMinimized,
    setIsSubMenuBarMinimized,
    isReportSummaryMinimized,
    setIsReportSummaryMinimized,
    isReportLotsHotsMinimized,
    setIsReportLotsHotsMinimized,
    isReportClassTableMinimized,
    setIsReportClassTableMinimized,
    isReportQuestionPanelMinimized,
    setIsReportQuestionPanelMinimized,
    isReportStudentListMinimized,
    setIsReportStudentListMinimized,
    filterResultTingkat,
    setFilterResultTingkat,
    filterResultKelas,
    setFilterResultKelas,
    filterResultMapel,
    setFilterResultMapel,
    filterResultExamId,
    setFilterResultExamId,
    uniqueClasses,
    availableMataPelajaran,
    resultMapelMatchedExams,
    resultScopedListForAnalytics,
    classAnalyticsData,
    filteredResults,
    isRecalculatingScores,
    recalcFeedback,
    handleRecalculateAllScores,
    analyzingResultId,
    isAnalyzingBatchClass,
    setSelectedAiModal,
    aiErrorBanner,
    handleExportResultsExcel,
    handleExportResultsCsv,
    handleExportClassSummaryExcel,
    handleGenerateAiAnalysis,
    handleBatchAiAnalysisForList,
  } = useAdminDashboard();

  return (
    <>
      {/* ===================================================================== */}
      {/* KONTROL SUB-TAB EKSKLUSIF MENU 06: LAPORAN & REKAP NILAI KELAS         */}
      {/* ===================================================================== */}
      <div className="bg-white border border-purple-200/80 rounded-2xl p-2.5 shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isSubMenuBarMinimized ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold text-purple-950 mr-1 px-1">
                Sub-Tab Laporan &amp; Rekap Nilai:
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsReportStudentListMinimized(false);
                  setIsReportSummaryMinimized(true);
                  setIsReportLotsHotsMinimized(true);
                  setIsReportClassTableMinimized(true);
                  setIsReportQuestionPanelMinimized(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                  !isReportStudentListMinimized
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                6A. Daftar Nilai &amp; Evaluasi Siswa ({filteredResults.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReportStudentListMinimized(true);
                  setIsReportSummaryMinimized(false);
                  setIsReportLotsHotsMinimized(true);
                  setIsReportClassTableMinimized(true);
                  setIsReportQuestionPanelMinimized(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                  !isReportSummaryMinimized
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                6B. Statistik Sekolah &amp; Export
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReportStudentListMinimized(true);
                  setIsReportSummaryMinimized(true);
                  setIsReportLotsHotsMinimized(false);
                  setIsReportClassTableMinimized(true);
                  setIsReportQuestionPanelMinimized(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                  !isReportLotsHotsMinimized
                    ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                6C. Visualisasi Performa Kelas: LOTS vs HOTS
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReportStudentListMinimized(true);
                  setIsReportSummaryMinimized(true);
                  setIsReportLotsHotsMinimized(true);
                  setIsReportClassTableMinimized(false);
                  setIsReportQuestionPanelMinimized(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                  !isReportClassTableMinimized
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                6D. Rekapitulasi Per Kelas ({classAnalyticsData.perClass.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReportStudentListMinimized(true);
                  setIsReportSummaryMinimized(true);
                  setIsReportLotsHotsMinimized(true);
                  setIsReportClassTableMinimized(true);
                  setIsReportQuestionPanelMinimized(false);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                  !isReportQuestionPanelMinimized
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                6E. Analisis Per Kelas &amp; Per Soal
              </button>
            </div>
          ) : (
            <span className="text-xs font-extrabold text-purple-950 px-2">
              Sub-Tab Menu 06 Laporan &amp; Rekap Nilai
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] font-semibold text-slate-500">
              Mode Tab Terpisah (1 tampilan aktif)
            </span>
            <button
              type="button"
              onClick={() => setIsSubMenuBarMinimized((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              {isSubMenuBarMinimized ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Buka Sub-Tab</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 4: ANALISIS & DOWNLOAD HASIL UJIAN SISWA PER KELAS DAN SEMUANYA    */}
      {/* ===================================================================== */}
      <div className="space-y-6">
        {/* Panel Rekapitulasi Analisis & Download Per Kelas dan Semua Kelas (tampil hanya untuk sub-tab 6B/6C/6D) */}
        {(!isReportSummaryMinimized ||
          !isReportLotsHotsMinimized ||
          !isReportClassTableMinimized) && (
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Sub-Modul 5A &amp; 5B · Pusat Pelaporan &amp; Evaluasi Akademik Per Kelas
                </div>
                <h2 className="text-lg font-extrabold text-white mt-0.5">
                  Analisis Statistik, Grafik LOTS/HOTS &amp; Rekapitulasi Per Kelas
                </h2>
                {!isReportSummaryMinimized && (
                  <p className="text-xs text-blue-200/90 mt-1 max-w-4xl leading-relaxed">
                    Lihat analisis capaian nilai rata-rata, ketuntasan, sebaran predikat (A/B/C/D), serta unduh laporan hasil ujian siswa baik{' '}
                    <strong className="text-amber-300">per kelas (rombel)</strong> maupun{' '}
                    <strong className="text-amber-300">semua kelas sekaligus</strong> dalam format PDF, Excel (.xls) &amp; CSV.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsReportSummaryMinimized((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-amber-300 cursor-pointer"
                >
                  {isReportSummaryMinimized ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Buka Statistik</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Minimize Statistik</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportLotsHotsMinimized((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-emerald-300 cursor-pointer"
                >
                  {isReportLotsHotsMinimized ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Buka LOTS vs HOTS</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Minimize LOTS vs HOTS</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportClassTableMinimized((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white cursor-pointer"
                >
                  {isReportClassTableMinimized ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Buka Tabel Kelas</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Minimize Tabel Kelas</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Dedicated Full-Width Export & Action Bar */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 border-b border-indigo-100 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadStudentTokenCardsPdf(students, {
                    kelasLabel: 'Semua Kelas',
                    exams,
                    questions,
                    results,
                    allStudents: students,
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
                disabled={students.length === 0 && results.length === 0}
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
                  className={`w-3.5 h-3.5 ${isRecalculatingScores ? 'animate-spin' : ''}`}
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

              {/* 4 Kartu Ringkasan Statistik Keseluruhan (Sub-Modul 5A-1) */}
              {!isReportSummaryMinimized && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50/40 border border-blue-200/90 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                      Rata-Rata Skor Sekolah
                    </div>
                    <div className="text-2xl font-extrabold font-mono tabular-nums text-blue-950 mt-1">
                      {classAnalyticsData.overall.averageScore}
                      <span className="text-xs font-semibold font-sans text-blue-700 ml-1">
                        / 100
                      </span>
                    </div>
                    <div className="w-full h-2 bg-blue-200/60 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, classAnalyticsData.overall.averageScore)
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] font-medium text-slate-600 mt-1.5">
                      Tertinggi:{' '}
                      <strong className="font-mono text-emerald-700">
                        {classAnalyticsData.overall.highestScore}
                      </strong>{' '}
                      · Terendah:{' '}
                      <strong className="font-mono text-rose-700">
                        {classAnalyticsData.overall.lowestScore}
                      </strong>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 border border-emerald-200/90 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Tingkat Ketuntasan KKM (&ge; 70)
                    </div>
                    <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-950 mt-1">
                      {classAnalyticsData.overall.passRate}%
                    </div>
                    <div className="w-full h-2 bg-emerald-200/60 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(4, classAnalyticsData.overall.passRate)
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] font-medium text-slate-600 mt-1.5">
                      <strong className="font-mono text-emerald-800">
                        {classAnalyticsData.overall.passCount}
                      </strong>{' '}
                      dari{' '}
                      <strong className="font-mono text-slate-800">
                        {classAnalyticsData.overall.resultCount}
                      </strong>{' '}
                      peserta tuntas
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-orange-50/40 border border-amber-200/90 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                      Sebaran Predikat (A / B / C / D)
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums text-xs font-extrabold mt-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        A: {classAnalyticsData.overall.gradeDistribution.A}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        B: {classAnalyticsData.overall.gradeDistribution.B}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        C: {classAnalyticsData.overall.gradeDistribution.C}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                        D: {classAnalyticsData.overall.gradeDistribution.D}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-2">
                      A (&ge;85), B (70–84), C (55–69), D (&lt;55)
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 via-white to-indigo-50/40 border border-purple-200/90 shadow-2xs">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                      Cakupan Evaluasi LOTS vs HOTS
                    </div>
                    <div className="text-2xl font-extrabold font-mono tabular-nums text-purple-950 mt-1">
                      {classAnalyticsData.overall.analyzedCount}
                      <span className="text-xs font-semibold font-sans text-purple-700 ml-1">
                        / {classAnalyticsData.overall.resultCount} hasil
                      </span>
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={results.length === 0 || isAnalyzingBatchClass}
                        onClick={() => handleBatchAiAnalysisForList(results)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>
                          {isAnalyzingBatchClass
                            ? 'Sedang Menyusun Evaluasi...'
                            : 'Evaluasi Semua Peserta'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Visualisasi Performa Kelas: Komparasi LOTS vs HOTS (Eksklusif Sub-Tab 6C) */}
              {!isReportLotsHotsMinimized && (
                <ClassPerformanceLotsHotsChart
                  classAnalytics={classAnalyticsData}
                  questions={questions}
                  exams={exams}
                  selectedClassFilter={filterResultKelas}
                  isMinimized={false}
                  onToggleMinimize={() => {
                    setIsReportLotsHotsMinimized(true);
                    setIsReportStudentListMinimized(false);
                  }}
                  onSelectClass={(kls) => {
                    setFilterResultTingkat('SEMUA');
                    setFilterResultKelas(kls);
                  }}
                />
              )}

              {/* Tabel Rekapitulasi Analisis & Download Per Kelas (Sub-Modul 5B) */}
              {!isReportClassTableMinimized && classAnalyticsData.perClass.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 px-4 py-2.5 rounded-xl border border-indigo-100">
                    <div>
                      <h3 className="text-sm font-extrabold text-indigo-950">
                        Tabel Analisis Capaian &amp; Download Hasil Ujian Per Kelas
                      </h3>
                      <span className="text-[11px] font-mono font-semibold text-indigo-700">
                        {classAnalyticsData.perClass.length} Kelas Terdaftar · Filter Mapel:{' '}
                        {filterResultMapel === 'SEMUA'
                          ? 'Semua Mata Pelajaran'
                          : filterResultMapel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Filter Rekap Kelas Per Mata Pelajaran"
                        value={filterResultMapel}
                        onChange={(e) => {
                          setFilterResultMapel(e.target.value);
                          setFilterResultExamId('SEMUA');
                        }}
                        className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-bold text-indigo-950 cursor-pointer"
                      >
                        <option value="SEMUA">
                          Semua Mata Pelajaran ({availableMataPelajaran.length} Mapel)
                        </option>
                        {availableMataPelajaran.map((mp) => (
                          <option key={mp} value={mp}>
                            Mapel: {mp}
                          </option>
                        ))}
                      </select>

                      {resultMapelMatchedExams.length > 0 && (
                        <select
                          aria-label="Filter Rekap Kelas Per Paket Ujian"
                          value={filterResultExamId}
                          onChange={(e) => setFilterResultExamId(e.target.value)}
                          className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-medium text-slate-800 cursor-pointer"
                        >
                          <option value="SEMUA">Semua Paket Ujian</option>
                          {resultMapelMatchedExams.map((ex) => (
                            <option key={ex.id} value={String(ex.id)}>
                              {ex.judul_ujian} ({getEffectiveMataPelajaran(ex)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                          <th className="py-3 px-3.5">Kelas / Rombel</th>
                          <th className="py-3 px-3.5 text-right">Peserta Selesai</th>
                          <th className="py-3 px-3.5 text-right">Rata-Rata Skor</th>
                          <th className="py-3 px-3.5 text-right">LOTS vs HOTS</th>
                          <th className="py-3 px-3.5 text-right">Max / Min</th>
                          <th className="py-3 px-3.5 text-right">Ketuntasan</th>
                          <th className="py-3 px-3.5">Sebaran A / B / C / D</th>
                          <th className="py-3 px-3.5 text-right">
                            Download &amp; Analisis Per Kelas
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {classAnalyticsData.perClass.map((cls) => {
                          const clsResults = resultScopedListForAnalytics.filter((r) => {
                            const st = students.find((s) => s.id === r.student_id);
                            return (
                              st &&
                              st.kelas.trim().toLowerCase() ===
                                cls.kelas.trim().toLowerCase()
                            );
                          });
                          return (
                            <tr key={cls.kelas} className="hover:bg-slate-50/80">
                              <td className="py-3 px-3.5 font-semibold text-slate-900">
                                {cls.kelas}{' '}
                                {cls.tingkat !== 'LAINNYA' && (
                                  <span className="text-slate-500 font-normal">
                                    (Tingkat {cls.tingkat})
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono tabular-nums">
                                <strong>{cls.resultCount}</strong> / {cls.totalStudents} siswa
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
                                A:{cls.gradeDistribution.A} · B:{cls.gradeDistribution.B} · C:
                                {cls.gradeDistribution.C} · D:{cls.gradeDistribution.D}
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFilterResultTingkat('SEMUA');
                                      setFilterResultKelas(cls.kelas);
                                      setIsReportClassTableMinimized(true);
                                      setIsReportStudentListMinimized(false);
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
                                        exams:
                                          resultMapelMatchedExams.length > 0
                                            ? resultMapelMatchedExams
                                            : exams,
                                        questions,
                                        results,
                                        allStudents: students,
                                        preferredExamId:
                                          filterResultExamId !== 'SEMUA'
                                            ? Number(filterResultExamId)
                                            : undefined,
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
                                      cls.totalStudents === 0 && clsResults.length === 0
                                    }
                                    onClick={() =>
                                      handleExportResultsExcel({ kelas: cls.kelas })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    Excel Kelas (.xls)
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      cls.totalStudents === 0 && clsResults.length === 0
                                    }
                                    onClick={() =>
                                      handleExportResultsCsv({ kelas: cls.kelas })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 disabled:opacity-40 rounded cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    CSV Kelas
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      clsResults.length === 0 || isAnalyzingBatchClass
                                    }
                                    onClick={() => handleBatchAiAnalysisForList(clsResults)}
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
        )}

        {/* ================================================================= */}
        {/* SUB-MODUL 5C: ANALISIS PER KELAS & PER BUTIR SOAL TERPADU (6E)    */}
        {/* ================================================================= */}
        {!isReportQuestionPanelMinimized && (
          <QuestionLevelReportPanel
            exams={exams}
            questions={questions}
            students={students}
            results={results}
            selectedClass={filterResultKelas}
            onSelectClass={(kls) => {
              setFilterResultTingkat('SEMUA');
              setFilterResultKelas(kls);
            }}
            selectedMapel={filterResultMapel}
            onSelectMapel={(mp) => {
              setFilterResultMapel(mp);
              setFilterResultExamId('SEMUA');
            }}
            selectedExamId={filterResultExamId}
            onSelectExamId={(exId) => setFilterResultExamId(exId)}
            uniqueClasses={uniqueClasses}
            availableMataPelajaran={availableMataPelajaran}
            teacherName={teacherProfile.name}
            isMinimized={false}
            onToggleMinimize={() => {
              setIsReportQuestionPanelMinimized(true);
              setIsReportStudentListMinimized(false);
            }}
          />
        )}

        {/* Tabel Detail Hasil Ujian Siswa (Eksklusif Sub-Tab 6A) */}
        {!isReportStudentListMinimized && (
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
            {/* Full-Width Colorful Institutional Header Banner (Never Squished) */}
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    Sub-Modul 5D · Daftar Nilai, Pembahasan Soal &amp; Evaluasi Kognitif Siswa
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                    Daftar Nilai &amp; Evaluasi Capaian Peserta (
                    {filterResultKelas === 'SEMUA'
                      ? 'Semua Kelas'
                      : `Kelas ${filterResultKelas}`}{' '}
                    — {filteredResults.length} Peserta)
                  </h2>
                  {!isReportStudentListMinimized && (
                    <p className="text-xs text-blue-200/90 mt-0.5">
                      Pilih filter Kelas/Rombel di bawah untuk melihat nilai akhir, mengunduh PDF Nilai lengkap beserta rincian soal &amp; jawaban siswa, atau mengunduh Excel kelas.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200 shrink-0">
                    {filteredResults.length} Hasil Ujian
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsReportStudentListMinimized((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white cursor-pointer"
                  >
                    {isReportStudentListMinimized ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-amber-300" />
                        <span>Buka Daftar Nilai</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                        <span>Minimize</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {!isReportStudentListMinimized && (
              <>
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
                      className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-semibold text-slate-800 cursor-pointer"
                    >
                      <option value="SEMUA">Semua Kelas / Rombel</option>
                      {uniqueClasses.map((kls) => (
                        <option key={kls} value={kls}>
                          Kelas {kls}
                        </option>
                      ))}
                    </select>

                    {/* Dropdown Filter Mata Pelajaran (Mapel) */}
                    <select
                      aria-label="Filter Hasil Per Mata Pelajaran"
                      value={filterResultMapel}
                      onChange={(e) => {
                        setFilterResultMapel(e.target.value);
                        setFilterResultExamId('SEMUA');
                      }}
                      className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-bold text-indigo-950 cursor-pointer"
                    >
                      <option value="SEMUA">
                        Semua Mata Pelajaran ({availableMataPelajaran.length} Mapel)
                      </option>
                      {availableMataPelajaran.map((mp) => (
                        <option key={mp} value={mp}>
                          Mapel: {mp}
                        </option>
                      ))}
                    </select>

                    {/* Dropdown Filter Paket Ujian */}
                    {exams.length > 0 && (
                      <select
                        aria-label="Filter Hasil Per Paket Ujian"
                        value={filterResultExamId}
                        onChange={(e) => setFilterResultExamId(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-medium text-slate-800 cursor-pointer"
                      >
                        <option value="SEMUA">Semua Paket Ujian</option>
                        {resultMapelMatchedExams.map((ex) => (
                          <option key={ex.id} value={String(ex.id)}>
                            {ex.judul_ujian} ({getEffectiveMataPelajaran(ex)})
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
                        Hasil nilai dan analisis AI akan otomatis tercatat di sini setelah siswa login menggunakan Token Ujian dan mengumpulkan jawaban.
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
                            const st = students.find((s) => s.id === resItem.student_id);
                            const ex = exams.find((e) => e.id === resItem.exam_id);
                            const isBusy = analyzingResultId === resItem.id;
                            const hasAi = Boolean(resItem.analisis_ai);

                            const sameStudentExamAttempts = results
                              .filter(
                                (r) =>
                                  Number(r.student_id) === Number(resItem.student_id) &&
                                  Number(r.exam_id) === Number(resItem.exam_id)
                              )
                              .sort((a, b) => {
                                const tA = a.created_at ? Date.parse(a.created_at) : 0;
                                const tB = b.created_at ? Date.parse(b.created_at) : 0;
                                if (tA !== tB) return tA - tB;
                                return Number(a.id) - Number(b.id);
                              });
                            const hasMultipleAttempts = sameStudentExamAttempts.length > 1;
                            const attemptIndex = sameStudentExamAttempts.findIndex(
                              (r) => Number(r.id) === Number(resItem.id)
                            );
                            const firstAttempt = sameStudentExamAttempts[0] || null;
                            const latestAttempt =
                              sameStudentExamAttempts.length > 1
                                ? sameStudentExamAttempts[sameStudentExamAttempts.length - 1]
                                : null;
                            const isRetakeRow = hasMultipleAttempts && attemptIndex > 0;

                            return (
                              <tr
                                key={resItem.id}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  hasMultipleAttempts
                                    ? isRetakeRow
                                      ? 'bg-emerald-50/25'
                                      : 'bg-indigo-50/20'
                                    : ''
                                }`}
                              >
                                <td className="py-3.5 px-4 font-semibold text-slate-900">
                                  <div>{st?.nama || `Siswa #${resItem.student_id}`}</div>
                                  {hasMultipleAttempts && (
                                    <span
                                      className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                        isRetakeRow
                                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                          : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                      }`}
                                    >
                                      {isRetakeRow
                                        ? `NILAI SESUDAH (UJIAN ULANG #${attemptIndex})`
                                        : 'NILAI SEBELUM (UJIAN AWAL)'}
                                    </span>
                                  )}
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
                                  <div className="font-semibold text-slate-900">
                                    {ex?.judul_ujian || `Ujian #${resItem.exam_id}`}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono font-bold border border-indigo-200">
                                      {resItem.kode_soal ||
                                        st?.kode_soal ||
                                        ex?.kode_paket ||
                                        'PAKET-A'}
                                    </span>
                                    <span>·</span>
                                    <span>{getEffectiveMataPelajaran(ex)}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-600 mt-1">
                                    Waktu Ujian:{' '}
                                    <strong className="text-slate-800">
                                      {formatExamAttemptTimeFull(resItem.created_at)}
                                    </strong>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold">
                                  <div className="inline-flex flex-col items-end gap-1">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-sm font-extrabold ${
                                        resItem.skor_angka >= 85
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : resItem.skor_angka >= 70
                                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                                            : resItem.skor_angka >= 55
                                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                                              : 'bg-rose-50 text-rose-800 border-rose-200'
                                      }`}
                                    >
                                      {resItem.skor_angka}
                                      <span className="text-[11px] font-normal opacity-75 ml-0.5">
                                        /100
                                      </span>
                                    </span>
                                    {hasMultipleAttempts && firstAttempt && latestAttempt && (
                                      <div className="text-[10px] font-mono bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-slate-700 text-right">
                                        <div>
                                          Sebelum ({formatExamAttemptTimeShort(firstAttempt.created_at)}):{' '}
                                          <strong>{firstAttempt.skor_angka}</strong>
                                        </div>
                                        <div className="text-emerald-800">
                                          Sesudah ({formatExamAttemptTimeShort(latestAttempt.created_at)}):{' '}
                                          <strong>{latestAttempt.skor_angka}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-xs font-mono tabular-nums">
                                  {resItem.pelanggaran_tab > 0 ? (
                                    <span className="text-amber-700 font-semibold">
                                      {resItem.pelanggaran_tab}x Pindah Tab
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700">0 Pelanggaran</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-xs">
                                  <div className="font-bold text-slate-800">
                                    {resItem.analisis_ai?.kategori_nilai ||
                                      (resItem.skor_angka >= 85
                                        ? 'Sangat Baik (A)'
                                        : resItem.skor_angka >= 70
                                          ? 'Baik (B)'
                                          : resItem.skor_angka >= 55
                                            ? 'Cukup (C)'
                                            : 'Perlu Bimbingan (D)')}
                                  </div>
                                  {hasAi ? (
                                    <span className="text-[11px] text-emerald-700 font-semibold">
                                      Evaluasi LOTS/HOTS Tersedia
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-500">
                                      {resItem.skor_angka >= 70
                                        ? 'Tuntas (≥70)'
                                        : 'Perlu Remedial (<70)'}
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
                                            (q) =>
                                              Number(q.exam_id) === Number(resItem.exam_id)
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
                                            answeredCount: Object.keys(
                                              syncedAnswersForPdf
                                            ).filter((k) => syncedAnswersForPdf[k]?.length > 0)
                                              .length,
                                            totalQuestions: examQuestionsForPdf.length,
                                            tabViolations: resItem.pelanggaran_tab,
                                            aiAnalysis: resItem.analisis_ai,
                                            questions: examQuestionsForPdf,
                                            studentAnswers: syncedAnswersForPdf,
                                            allStudents: students,
                                            exams,
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
                                        onClick={() => handleGenerateAiAnalysis(resItem)}
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
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminLaporanTab;
