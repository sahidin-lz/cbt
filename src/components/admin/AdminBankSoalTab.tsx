import React, { useMemo } from 'react';
import {
  FileText,
  BookOpen,
  Upload,
  Plus,
  Edit3,
  Trash2,
  Eye,
  Copy,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eraser,
} from 'lucide-react';
import { getEffectiveMataPelajaran } from '../../utils/cbtLogic';
import { QuestionEquationAndImageHelper } from '../QuestionEquationAndImageHelper';
import { MathAndTableRenderer } from '../MathAndTableRenderer';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminBankSoalTab: React.FC = () => {
  const {
    exams,
    activeBankQuestions,
    currentExam,
    currentExamQuestions,
    filteredExamQuestions,
    selectedExamId,
    setSelectedExamId,
    availableMataPelajaran,
    bankSoalMapelFilter,
    setBankSoalMapelFilter,
    bankSoalTingkatFilter,
    setBankSoalTingkatFilter,
    isBankSoalDetailOpen,
    setIsBankSoalDetailOpen,
    showUploadPanel,
    setShowUploadPanel,
    bankSoalDeleteModal,
    setBankSoalDeleteModal,
    isDeletingBankSoal,
    isClearingExamQuestions,
    bankSoalDetailRef,
    bankSoalFeedback,
    setBankSoalFeedback,
    questionInputMode,
    setQuestionInputMode,
    manualTipe,
    setManualTipe,
    manualWacana,
    setManualWacana,
    manualTeksSoal,
    setManualTeksSoal,
    manualOpsiA,
    setManualOpsiA,
    manualOpsiB,
    setManualOpsiB,
    manualOpsiC,
    setManualOpsiC,
    manualOpsiD,
    setManualOpsiD,
    manualOpsiE,
    setManualOpsiE,
    manualKunci,
    setManualKunci,
    manualBobot,
    setManualBobot,
    editingQuestionId,
    isSavingQuestion,
    filterQuestionType,
    setFilterQuestionType,
    searchQuestionQuery,
    setSearchQuestionQuery,
    copyTargetExamId,
    setCopyTargetExamId,
    isCopyingQuestions,
    questionViewMode,
    setQuestionViewMode,
    expandedQuestionIds,
    toggleExpandQuestion,
    focusedQuestionIdx,
    setFocusedQuestionIdx,
    questionPage,
    setQuestionPage,
    questionsPerPage,
    setQuestionsPerPage,
    csvText,
    setCsvText,
    replaceExistingQuestions,
    setReplaceExistingQuestions,
    quickExamTitle,
    setQuickExamTitle,
    quickExamTingkat,
    setQuickExamTingkat,
    uploadStatus,
    isUploadingCsv,
    formatDistribusiLabel,
    setDryRunExam,
    handleClearBankSoalOnly,
    handleDeleteFullBankSoal,
    handleToggleManualKunci,
    handleStartEditQuestion,
    handleCancelEditQuestion,
    handleAddManualQuestion,
    handleDeleteQuestion,
    handleClearExamQuestions,
    handleCopyQuestionsToExam,
    handleFileChange,
    handleUploadCsvSubmit,
    handleDownloadSampleCsv,
    handleDownloadQuestionTemplateExcel,
    handleDownloadWordTemplateTable,
    handleDownloadWordTemplateNumbered,
    handleExportQuestionsWord,
    handleInsertSnippetToManualField,
    handleRemoveImagesFromManualField,
    handlePasteClipboardImage,
    handleExportQuestionsExcel,
    handleExportQuestionsCsv,
  } = useAdminDashboard();

  const filteredBankPackages = useMemo(() => {
    return exams.filter((ex) => {
      const matchMapel =
        bankSoalMapelFilter === 'SEMUA' ||
        getEffectiveMataPelajaran(ex).toUpperCase() ===
          bankSoalMapelFilter.toUpperCase();
      const matchTingkat =
        bankSoalTingkatFilter === 'SEMUA' ||
        ex.target_tingkat === bankSoalTingkatFilter ||
        ex.target_tingkat === 'SEMUA';
      return matchMapel && matchTingkat;
    });
  }, [exams, bankSoalMapelFilter, bankSoalTingkatFilter]);

  const effectivePerPage =
    questionViewMode === 'lengkap' ? Math.max(questionsPerPage, 999) : questionsPerPage;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredExamQuestions.length / Math.max(1, effectivePerPage))
  );
  const safePage = Math.min(questionPage, totalPages);
  const paginatedQuestions = useMemo(() => {
    const start = (safePage - 1) * effectivePerPage;
    return filteredExamQuestions.slice(start, start + effectivePerPage);
  }, [filteredExamQuestions, safePage, effectivePerPage]);

  const focusedQuestion =
    filteredExamQuestions[focusedQuestionIdx] || filteredExamQuestions[0] || null;

  const openPackageDetail = (examId: number) => {
    setSelectedExamId(examId);
    setIsBankSoalDetailOpen(true);
    window.setTimeout(() => {
      bankSoalDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Paket Bank Soal */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
              <BookOpen className="w-4 h-4" />
              <span>05. Bank Soal Modular, Impor Word/Excel &amp; Versioning Aman</span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Kelola Paket Bank Soal ({exams.length} Paket · {activeBankQuestions.length} Butir Aktif)
            </h2>
            <p className="text-xs text-slate-600">
              Mengosongkan soal menjaga paket tetap tersimpan. Setelah upload, detail seluruh soal langsung terbuka memanjang agar mudah diperiksa. Edit soal pada ujian aktif otomatis membuat versi baru (<code className="font-mono font-bold text-indigo-700">soal_v2</code>) tanpa merusak riwayat nilai lama.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUploadPanel((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{showUploadPanel ? 'Tutup Panel Upload / Input' : 'Upload / Input Soal'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportQuestionsExcel(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Ekspor Semua (.xls)</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <select
            value={bankSoalMapelFilter}
            onChange={(e) => setBankSoalMapelFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="SEMUA">Semua Mata Pelajaran</option>
            {availableMataPelajaran.map((m) => (
              <option key={m} value={m}>
                Mapel: {m}
              </option>
            ))}
          </select>
          <select
            value={bankSoalTingkatFilter}
            onChange={(e) => setBankSoalTingkatFilter(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="SEMUA">Semua Tingkatan (X / XI / XII)</option>
            <option value="10">Tingkat 1 (Kelas X)</option>
            <option value="11">Tingkat 2 (Kelas XI)</option>
            <option value="12">Tingkat 3 (Kelas XII)</option>
          </select>
        </div>

        {(bankSoalFeedback || uploadStatus) && (
          <div
            role="status"
            className={`rounded-xl p-3.5 text-xs font-semibold flex items-start justify-between gap-3 border ${
              (bankSoalFeedback || uploadStatus)?.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="flex items-start gap-2">
              {(bankSoalFeedback || uploadStatus)?.type === 'error' ? (
                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span>{(bankSoalFeedback || uploadStatus)?.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBankSoalFeedback(null)}
              className="text-[11px] font-bold underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Daftar Kartu Paket Soal */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBankPackages.map((ex) => {
            const count = activeBankQuestions.filter(
              (q) => Number(q.exam_id) === Number(ex.id)
            ).length;
            const isSelected = currentExam?.id === ex.id;
            return (
              <div
                key={ex.id}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                        {ex.kode_paket || 'PAKET-A'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ex.status_ujian === 'AKTIF'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ex.status_ujian === 'SELESAI'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ex.status_ujian || 'DRAF'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                        {getEffectiveMataPelajaran(ex)}
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-900 truncate">
                      {ex.judul_ujian}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatDistribusiLabel(ex.target_tingkat, ex.target_kelas)} · {ex.durasi_menit} Menit
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-mono text-xs font-extrabold shrink-0">
                    {count} Soal
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openPackageDetail(ex.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Kelola / Detail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExamId(ex.id);
                      setShowUploadPanel(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Isi Soal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDryRunExam(ex)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                    title="Simulasi / Coba Ujian (Dry-Run) sebelum publikasi"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span>Coba Ujian</span>
                  </button>
                  <button
                    type="button"
                    disabled={count === 0 || isClearingExamQuestions}
                    onClick={() => handleClearBankSoalOnly(ex.id, ex.judul_ujian)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 disabled:opacity-40 cursor-pointer"
                    title="Kosongkan butir soal saja, paket ujian tetap tersimpan"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Kosongkan Soal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBankSoalDeleteModal({
                        examId: ex.id,
                        title: ex.judul_ujian,
                        questionCount: count,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer"
                    title="Hapus Paket & Bank Soal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel Upload Word/Excel/CSV & Input Manual */}
      {showUploadPanel && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-6 space-y-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {editingQuestionId
                  ? 'Edit Butir Soal (Otomatis Versioning Aman Jika Ujian Aktif)'
                  : `Tambah / Impor Soal ke Paket: ${currentExam?.judul_ujian || quickExamTitle}`}
              </h3>
              <p className="text-xs text-slate-500">
                Pilih paket tujuan di daftar atas atau buat cepat jika belum ada.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuestionInputMode('csv')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  questionInputMode === 'csv'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Upload Word / Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => setQuestionInputMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  questionInputMode === 'manual'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Input Soal Manual &amp; Rumus
              </button>
            </div>
          </div>

          {!currentExam && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Judul Paket Cepat (otomatis dibuat)
                </label>
                <input
                  type="text"
                  value={quickExamTitle}
                  onChange={(e) => setQuickExamTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Tingkatan Target
                </label>
                <select
                  value={quickExamTingkat}
                  onChange={(e) => setQuickExamTingkat(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg"
                >
                  <option value="SEMUA">Semua Tingkatan</option>
                  <option value="10">Tingkat 1 (X)</option>
                  <option value="11">Tingkat 2 (XI)</option>
                  <option value="12">Tingkat 3 (XII)</option>
                </select>
              </div>
            </div>
          )}

          {questionInputMode === 'csv' ? (
            <form onSubmit={handleUploadCsvSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQuestionTemplateExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Excel (.xls)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadWordTemplateTable}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Word Tabel (.doc)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadWordTemplateNumbered}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Word Bernomor (.doc)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50 rounded-xl p-6 text-center cursor-pointer transition-colors">
                  <Upload className="w-7 h-7 text-indigo-600 mb-2" />
                  <span className="text-xs font-extrabold text-slate-900">
                    Pilih File Soal (.docx, .xlsx, .xls, .csv)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Langsung memproses gambar, tabel, rumus &amp; otomatis membuka Detail Soal Lengkap.
                  </span>
                  <input
                    type="file"
                    accept=".docx,.doc,.xlsx,.xls,.csv,.txt"
                    onChange={handleFileChange}
                    disabled={isUploadingCsv}
                    className="hidden"
                  />
                </label>

                <div className="space-y-2">
                  <textarea
                    rows={5}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Atau tempelkan data CSV soal (pemisah titik koma ;) di sini..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceExistingQuestions}
                        onChange={(e) => setReplaceExistingQuestions(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Ganti / timpa soal lama di paket ini</span>
                    </label>
                    <button
                      type="submit"
                      disabled={isUploadingCsv}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl cursor-pointer"
                    >
                      {isUploadingCsv ? 'Mengimpor Soal...' : 'Impor Soal Sekarang'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddManualQuestion} className="space-y-4">
              <QuestionEquationAndImageHelper
                wacana={manualWacana}
                teksSoal={manualTeksSoal}
                opsiA={manualOpsiA}
                opsiB={manualOpsiB}
                opsiC={manualOpsiC}
                opsiD={manualOpsiD}
                opsiE={manualOpsiE}
                onInsertToField={handleInsertSnippetToManualField}
                onRemoveImagesFromField={handleRemoveImagesFromManualField}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tipe Soal
                  </label>
                  <select
                    value={manualTipe}
                    onChange={(e) => setManualTipe(e.target.value as 'PG' | 'Kompleks')}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                  >
                    <option value="PG">PG Biasa (1 Jawaban Benar)</option>
                    <option value="Kompleks">PG Kompleks (Multi-Jawaban Humanis)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Bobot Poin
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={manualBobot}
                    onChange={(e) => setManualBobot(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Kunci Jawaban
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                      const active = manualKunci.includes(letter);
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => handleToggleManualKunci(letter)}
                          className={`w-8 h-8 rounded-lg text-xs font-extrabold border cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Wacana / Stimulus Panjang / Gambar (Opsional — mendukung paste gambar Ctrl+V)
                </label>
                <textarea
                  rows={3}
                  value={manualWacana}
                  onChange={(e) => setManualWacana(e.target.value)}
                  onPaste={(e) => handlePasteClipboardImage(e, 'wacana')}
                  placeholder="Tulis teks wacana, tabel HTML, atau paste gambar stimulus di sini..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Teks Pertanyaan Utama (Wajib)
                </label>
                <textarea
                  rows={3}
                  value={manualTeksSoal}
                  onChange={(e) => setManualTeksSoal(e.target.value)}
                  onPaste={(e) => handlePasteClipboardImage(e, 'teks_soal')}
                  placeholder="Tulis pertanyaan soal..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { key: 'opsi_a' as const, label: 'Opsi A', val: manualOpsiA, set: setManualOpsiA },
                  { key: 'opsi_b' as const, label: 'Opsi B', val: manualOpsiB, set: setManualOpsiB },
                  { key: 'opsi_c' as const, label: 'Opsi C', val: manualOpsiC, set: setManualOpsiC },
                  { key: 'opsi_d' as const, label: 'Opsi D', val: manualOpsiD, set: setManualOpsiD },
                  { key: 'opsi_e' as const, label: 'Opsi E', val: manualOpsiE, set: setManualOpsiE },
                ].map((opt) => (
                  <div key={opt.key}>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {opt.label}
                    </label>
                    <input
                      type="text"
                      value={opt.val}
                      onChange={(e) => opt.set(e.target.value)}
                      onPaste={(e) => handlePasteClipboardImage(e, opt.key)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSavingQuestion}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl cursor-pointer"
                >
                  {isSavingQuestion
                    ? 'Menyimpan...'
                    : editingQuestionId
                      ? 'Simpan Perubahan (Auto-Version)'
                      : 'Simpan Butir Soal'}
                </button>
                {editingQuestionId && (
                  <button
                    type="button"
                    onClick={handleCancelEditQuestion}
                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                  >
                    Batal Edit
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Detail Lengkap Soal pada Paket Terpilih */}
      {currentExam && (
        <div
          ref={bankSoalDetailRef}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-xs font-extrabold">
                  {currentExam.kode_paket || 'PAKET-A'}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {currentExamQuestions.length} Butir Soal Aktif
                </span>
                <button
                  type="button"
                  onClick={() => setIsBankSoalDetailOpen((p) => !p)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer"
                >
                  {isBankSoalDetailOpen ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Ringkas Panel</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Buka Detail Soal</span>
                    </>
                  )}
                </button>
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Detail Bank Soal: {currentExam.judul_ujian}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDryRunExam(currentExam)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Coba Ujian (Dry-Run)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportQuestionsExcel(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportQuestionsWord}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Word</span>
              </button>
              <button
                type="button"
                onClick={handleExportQuestionsCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                disabled={currentExamQuestions.length === 0 || isClearingExamQuestions}
                onClick={handleClearExamQuestions}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 disabled:opacity-40 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Kosongkan Soal Paket Ini</span>
              </button>
            </div>
          </div>

          {/* Salin Soal ke Paket Lain & Filter Tampilan */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuestionQuery}
                  onChange={(e) => setSearchQuestionQuery(e.target.value)}
                  placeholder="Cari teks / wacana soal..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <select
                value={filterQuestionType}
                onChange={(e) =>
                  setFilterQuestionType(e.target.value as 'SEMUA' | 'PG' | 'Kompleks')
                }
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold"
              >
                <option value="SEMUA">Semua Tipe</option>
                <option value="PG">PG Biasa</option>
                <option value="Kompleks">PG Kompleks</option>
              </select>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {(
                  [
                    { id: 'lengkap', label: 'Detail Memanjang' },
                    { id: 'ringkas', label: 'Ringkas' },
                    { id: 'per_soal', label: 'Per Soal' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setQuestionViewMode(mode.id);
                      setIsBankSoalDetailOpen(true);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      questionViewMode === mode.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {exams.length > 1 && currentExamQuestions.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={copyTargetExamId ?? ''}
                  onChange={(e) =>
                    setCopyTargetExamId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg max-w-[200px]"
                >
                  <option value="">Salin ke Paket Lain...</option>
                  {exams
                    .filter((e) => e.id !== currentExam.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.judul_ujian}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!copyTargetExamId || isCopyingQuestions}
                  onClick={handleCopyQuestionsToExam}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isCopyingQuestions ? 'Menyalin...' : 'Salin'}</span>
                </button>
              </div>
            )}
          </div>

          {filteredExamQuestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-2">
              <p className="text-sm font-bold text-slate-700">
                Belum ada butir soal aktif pada paket ini.
              </p>
              <p className="text-xs text-slate-500">
                Paket ujian tetap aman tersimpan. Klik <strong>Upload / Input Soal</strong> untuk mengisi butir soal baru.
              </p>
            </div>
          ) : questionViewMode === 'per_soal' && focusedQuestion ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  Menampilkan Soal {focusedQuestionIdx + 1} dari {filteredExamQuestions.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={focusedQuestionIdx <= 0}
                    onClick={() => setFocusedQuestionIdx((i) => Math.max(0, i - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={focusedQuestionIdx >= filteredExamQuestions.length - 1}
                    onClick={() =>
                      setFocusedQuestionIdx((i) =>
                        Math.min(filteredExamQuestions.length - 1, i + 1)
                      )
                    }
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <QuestionDetailCard
                q={focusedQuestion}
                index={focusedQuestionIdx}
                isExpanded
                onEdit={() => handleStartEditQuestion(focusedQuestion)}
                onDelete={() => handleDeleteQuestion(focusedQuestion.id)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedQuestions.map((q, idx) => {
                const absIdx = (safePage - 1) * effectivePerPage + idx;
                const isExpanded =
                  questionViewMode === 'lengkap' ||
                  isBankSoalDetailOpen ||
                  expandedQuestionIds.includes(q.id);
                return (
                  <QuestionDetailCard
                    key={q.id}
                    q={q}
                    index={absIdx}
                    isExpanded={isExpanded}
                    onToggleExpand={
                      questionViewMode === 'ringkas'
                        ? () => toggleExpandQuestion(q.id)
                        : undefined
                    }
                    onEdit={() => handleStartEditQuestion(q)}
                    onDelete={() => handleDeleteQuestion(q.id)}
                  />
                );
              })}

              {totalPages > 1 && questionViewMode !== 'lengkap' && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Halaman {safePage} / {totalPages} ({filteredExamQuestions.length} soal)
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={questionsPerPage}
                      onChange={(e) => {
                        setQuestionsPerPage(Number(e.target.value));
                        setQuestionPage(1);
                      }}
                      className="px-2 py-1 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value={10}>10 / hal</option>
                      <option value={25}>25 / hal</option>
                      <option value={50}>50 / hal</option>
                      <option value={999}>Semua</option>
                    </select>
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setQuestionPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setQuestionPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Konfirmasi Hapus Paket / Kosongkan Soal */}
      {bankSoalDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-base font-extrabold text-slate-900">
                  Kelola Penghapusan Paket Bank Soal
                </h4>
                <p className="text-xs text-slate-600">
                  Paket <strong>{bankSoalDeleteModal.title}</strong> memiliki{' '}
                  <strong>{bankSoalDeleteModal.questionCount} butir soal</strong>. Anda dapat mengosongkan soal saja agar paket tetap ada, atau menghapus permanen (tersimpan di Arsip 30 Hari).
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBankSoalDeleteModal(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isClearingExamQuestions}
                onClick={() =>
                  handleClearBankSoalOnly(
                    bankSoalDeleteModal.examId,
                    bankSoalDeleteModal.title
                  )
                }
                className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl cursor-pointer"
              >
                Kosongkan Soal Saja
              </button>
              <button
                type="button"
                disabled={isDeletingBankSoal}
                onClick={() =>
                  handleDeleteFullBankSoal(
                    bankSoalDeleteModal.examId,
                    bankSoalDeleteModal.title
                  )
                }
                className="px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
              >
                {isDeletingBankSoal ? 'Menghapus...' : 'Hapus Paket (Arsip 30 Hari)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface QuestionDetailCardProps {
  q: ReturnType<typeof useAdminDashboard>['activeBankQuestions'][number];
  index: number;
  isExpanded: boolean;
  onToggleExpand?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const QuestionDetailCard: React.FC<QuestionDetailCardProps> = ({
  q,
  index,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}) => {
  const isKompleks = q.tipe_soal === 'Kompleks' || (q.kunci_jawaban?.length || 0) > 1;
  return (
    <div className="border border-slate-200 rounded-xl p-4 sm:p-5 bg-white space-y-3 hover:border-indigo-300 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-extrabold">
            No. {index + 1}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
            {q.data_opsi?.id_soal_csv || `Q-${q.id}`}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              isKompleks
                ? 'bg-violet-100 text-violet-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {isKompleks ? 'PG Kompleks' : 'PG Biasa'} · Bobot {q.bobot || (isKompleks ? 3 : 2)}
          </span>
          {(q.version || 1) > 1 && (
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-extrabold">
              {q.version_label || `soal_v${q.version}`}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-bold">
            Kunci: {q.kunci_jawaban?.join(', ') || '-'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              {isExpanded ? 'Tutup' : 'Detail'}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="text-sm font-semibold text-slate-900">
        <MathAndTableRenderer content={q.teks_soal} />
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          {q.data_opsi?.wacana && (
            <div className="rounded-lg bg-indigo-50/50 border border-indigo-200 p-3 text-xs text-slate-800">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 mb-1">
                Wacana / Stimulus
              </div>
              <MathAndTableRenderer content={q.data_opsi.wacana} />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
              const val = q.data_opsi?.opsi?.[optKey];
              if (!val) return null;
              const isKunci = q.kunci_jawaban?.includes(optKey);
              return (
                <div
                  key={optKey}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                    isKunci
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded font-mono font-extrabold flex items-center justify-center shrink-0 ${
                      isKunci
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {optKey}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <MathAndTableRenderer content={val} inline />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBankSoalTab;
