import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Download,
  Trash2,
  RotateCcw,
  Upload,
  CheckCircle2,
  Layers,
  Shuffle,
  Unlock,
  Ban,
  Edit3,
} from 'lucide-react';
import { extractTingkatFromKelas, getEffectiveMataPelajaran } from '../../utils/cbtLogic';
import {
  downloadStudentTokenCardsPdf,
  resolveStudentPrecisionRecord,
} from '../../utils/cbtPdfGenerator';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminSiswaTab: React.FC = () => {
  const {
    exams,
    questions,
    students,
    results,
    filteredStudents,
    studentScopedExams,
    uniqueClasses,
    availableMataPelajaran,
    classAnalyticsData,
    isSubMenuBarMinimized,
    setIsSubMenuBarMinimized,
    isSiswaTableMinimized,
    setIsSiswaTableMinimized,
    isSiswaFormMinimized,
    setIsSiswaFormMinimized,
    isSiswaStatusPanelMinimized,
    setIsSiswaStatusPanelMinimized,
    isSiswaClassPanelMinimized,
    setIsSiswaClassPanelMinimized,
    newClassNameInput,
    setNewClassNameInput,
    renamingClassTarget,
    setRenamingClassTarget,
    renameClassValue,
    setRenameClassValue,
    filterStudentTingkat,
    setFilterStudentTingkat,
    filterKelas,
    setFilterKelas,
    filterStudentMapel,
    setFilterStudentMapel,
    filterStudentExamId,
    setFilterStudentExamId,
    filterStudentStatus,
    setFilterStudentStatus,
    countStatusBelumMulai,
    countStatusSedangUjian,
    countStatusSelesai,
    countStatusDiblokir,
    studentInputMode,
    setStudentInputMode,
    studentNameInput,
    setStudentNameInput,
    studentNisnInput,
    setStudentNisnInput,
    studentTingkatPreset,
    setStudentTingkatPreset,
    studentClassInput,
    setStudentClassInput,
    editingStudentId,
    setEditingStudentId,
    studentCsvText,
    setStudentCsvText,
    replaceExistingStudents,
    setReplaceExistingStudents,
    isUploadingStudentsCsv,
    isSavingStudent,
    studentFeedback,
    isDistributingPackages,
    handleAddNewClass,
    handleRenameClassSubmit,
    handleDeleteClass,
    handleDownloadClassStudentsExcel,
    handleExportStudentsExcel,
    handleBulkUpdateStudentStatus,
    handleSaveStudent,
    handleStudentCsvFileChange,
    handleUploadStudentCsvSubmit,
    handleDownloadSampleStudentCsv,
    handleDownloadStudentTemplateExcel,
    handleBatchDistributePackages,
    handleUpdateStudentStatus,
    handleRegenerateToken,
    handleDeleteStudent,
  } = useAdminDashboard();

  return (
    <div className="space-y-6">
      {/* Sub-Tab Eksklusif Modul 03 (Hanya 1 sub-tab terbuka agar halaman tidak memanjang) */}
      <div className="bg-white border border-emerald-200/80 rounded-2xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs">
        {!isSubMenuBarMinimized ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-emerald-950 mr-1">
              Sub-Tab Database Siswa:
            </span>
            <button
              type="button"
              onClick={() => {
                setIsSiswaTableMinimized(false);
                setIsSiswaFormMinimized(true);
                setIsSiswaStatusPanelMinimized(true);
                setIsSiswaClassPanelMinimized(true);
              }}
              className={`px-3 py-1.5 rounded-xl font-extrabold border transition-all cursor-pointer ${
                !isSiswaTableMinimized
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              03A. Tabel Database Siswa ({filteredStudents.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSiswaTableMinimized(true);
                setIsSiswaFormMinimized(false);
                setIsSiswaStatusPanelMinimized(true);
                setIsSiswaClassPanelMinimized(true);
              }}
              className={`px-3 py-1.5 rounded-xl font-extrabold border transition-all cursor-pointer ${
                !isSiswaFormMinimized
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              03B. Form Input/Upload Siswa
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSiswaTableMinimized(true);
                setIsSiswaFormMinimized(true);
                setIsSiswaStatusPanelMinimized(false);
                setIsSiswaClassPanelMinimized(true);
              }}
              className={`px-3 py-1.5 rounded-xl font-extrabold border transition-all cursor-pointer ${
                !isSiswaStatusPanelMinimized
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              03C. Status &amp; Kartu Token
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSiswaTableMinimized(true);
                setIsSiswaFormMinimized(true);
                setIsSiswaStatusPanelMinimized(true);
                setIsSiswaClassPanelMinimized(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-extrabold border transition-all cursor-pointer ${
                !isSiswaClassPanelMinimized
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              03D. Manajemen Rombel ({classAnalyticsData.perClass.length})
            </button>
          </div>
        ) : (
          <span className="text-xs font-extrabold text-emerald-950">
            Sub-Tab Modul 03 Database Siswa
          </span>
        )}

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] font-semibold text-slate-500">
            Mode Tab Terpisah (1 tampilan aktif)
          </span>
          <button
            type="button"
            onClick={() => setIsSubMenuBarMinimized((p) => !p)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
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

      {/* Panel Manajemen Kelas / Rombel (Eksklusif Sub-Tab 03D) */}
      {!isSiswaClassPanelMinimized && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Sub-Panel 03A · Administrasi Rombongan Belajar
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Manajemen Kelas / Rombel (Kelas X, XI, XII)
              </h2>
              {!isSiswaClassPanelMinimized && (
                <p className="text-xs text-blue-200/90 mt-0.5">
                  Buat daftar kelas/rombel baru, ubah nama kelas secara massal, reset status ujian satu kelas penuh, atau unduh daftar siswa &amp; token per kelas maupun semua kelas.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              <button
                type="button"
                onClick={() => setIsSiswaClassPanelMinimized((p) => !p)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-amber-300 cursor-pointer"
              >
                {isSiswaClassPanelMinimized ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Buka Rombel ({classAnalyticsData.perClass.length})</span>
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

          {!isSiswaClassPanelMinimized && (
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
                          <tr key={clsItem.kelas} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                              {isRenaming ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    aria-label={`Ubah nama kelas ${clsItem.kelas}`}
                                    value={renameClassValue}
                                    onChange={(e) => setRenameClassValue(e.target.value)}
                                    className="px-2 py-1 text-xs border border-blue-400 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRenameClassSubmit(clsItem.kelas)}
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
                              Selesai: <strong>{clsItem.statusCounts.selesai}</strong> · Aktif:{' '}
                              <strong>{clsItem.statusCounts.sedangUjian}</strong> · Blokir:{' '}
                              <strong className="text-red-700">
                                {clsItem.statusCounts.diblokir}
                              </strong>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-mono font-bold text-blue-700">
                              {clsItem.resultCount > 0 ? `${clsItem.averageScore}/100` : '-'}
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterStudentTingkat('SEMUA');
                                    setFilterKelas(clsItem.kelas);
                                    setIsSiswaClassPanelMinimized(true);
                                    setIsSiswaTableMinimized(false);
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
                                      questions,
                                      results,
                                      allStudents: students,
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
                                  onClick={() => handleDownloadClassStudentsExcel(clsItem.kelas)}
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
                                  onClick={() => handleDeleteClass(clsItem.kelas)}
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
          )}
        </div>
      )}

      {/* Baris Ringkasan & Manajemen Status Ujian Siswa (Eksklusif Sub-Tab 03C) */}
      {!isSiswaStatusPanelMinimized && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Sub-Panel 03B · Kontrol Status Peserta &amp; Kartu Token Ujian
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Manajemen Status Ujian Siswa &amp; Export Excel Terpisah per Kolom
              </h2>
              {!isSiswaStatusPanelMinimized && (
                <p className="text-xs text-blue-200/90 mt-0.5 max-w-4xl">
                  Pantau dan kelola status peserta ujian secara real-time: buka kunci siswa yang terblokir Anti-Cheat, reset status siswa yang sudah selesai agar bisa login ulang, atau unduh daftar Nama, Kelas &amp; Token dalam kolom Excel terpisah maupun PDF Kartu Token.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsSiswaStatusPanelMinimized((p) => !p)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-amber-300 cursor-pointer shrink-0"
            >
              {isSiswaStatusPanelMinimized ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Buka Status &amp; Kartu Token</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          </div>

          {!isSiswaStatusPanelMinimized && (
            <>
              <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-emerald-50/50 border-b border-indigo-100 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={filteredStudents.length === 0}
                  onClick={() =>
                    downloadStudentTokenCardsPdf(filteredStudents, {
                      kelasLabel:
                        filterKelas !== 'SEMUA' ? `Kelas ${filterKelas}` : 'Semua Kelas',
                      exams: studentScopedExams,
                      questions,
                      results,
                      allStudents: students,
                      preferredExamId:
                        filterStudentExamId !== 'SEMUA'
                          ? Number(filterStudentExamId)
                          : undefined,
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
                    onClick={() => handleDownloadClassStudentsExcel(filterKelas)}
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
                    ['Belum Mulai', 'Belum Mulai', countStatusBelumMulai, 'text-slate-700'],
                    ['Sedang Ujian', 'Sedang Ujian', countStatusSedangUjian, 'text-amber-700'],
                    ['Selesai', 'Selesai Ujian', countStatusSelesai, 'text-emerald-700'],
                    ['Diblokir', 'Diblokir (Anti-Cheat)', countStatusDiblokir, 'text-red-700'],
                  ] as const
                ).map(([statusKey, label, countVal, textColor]) => {
                  const isSelected = filterStudentStatus === statusKey;
                  return (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => {
                        setFilterStudentStatus(statusKey);
                        setIsSiswaStatusPanelMinimized(true);
                        setIsSiswaTableMinimized(false);
                      }}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-600 ring-1 ring-blue-600'
                          : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-500">{label}</div>
                      <div
                        className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${textColor}`}
                      >
                        {countVal}{' '}
                        <span className="text-xs font-normal text-slate-500">siswa</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Switcher Tambah 1 Siswa vs Upload Massal Siswa Excel/CSV (Eksklusif Sub-Tab 03B) */}
      {!isSiswaFormMinimized && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 transition-all">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
              Sub-Panel 03C · Input &amp; Upload Siswa
            </span>
            <button
              type="button"
              onClick={() => setIsSiswaFormMinimized((p) => !p)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              {isSiswaFormMinimized ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Buka Form Input/Upload</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          </div>

          {!isSiswaFormMinimized && (
            <>
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
                      {editingStudentId ? 'Edit Data Siswa' : 'Tambah Siswa ke Database'}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Pilih tingkatan kelas (X, XI, atau XII) dan masukkan nama siswa.
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
                            if (!studentClassInput.toUpperCase().startsWith(prefix + ' ')) {
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
                      Unduh template Excel rapi di bawah (Kolom A: Nama Siswa, Kolom B: Kelas terpisah otomatis saat dibuka di Microsoft Excel).
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
                      Struktur 2 Kolom Terpisah (Nama Siswa &amp; Kelas):
                    </div>
                    <code className="block font-mono text-[11px] text-blue-700">
                      Kolom A: nama_siswa &nbsp;|&nbsp; Kolom B: kelas
                    </code>
                    <p className="text-[11px] text-slate-500">
                      Mendukung pemisah titik koma (<code className="font-mono">;</code>), koma (
                      <code className="font-mono">,</code>), atau salin-tempel langsung 2 kolom dari tabel Microsoft Excel.
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
                      Langsung upload otomatis saat file dipilih. Mendukung Excel (.xlsx &amp; .xls), CSV, dan TSV.
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
                      onChange={(e) => setReplaceExistingStudents(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Kosongkan data siswa lama sebelum mengimpor daftar baru ini</span>
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
            </>
          )}
        </div>
      )}

      {/* Tabel Database Siswa (Eksklusif Sub-Tab 03A) */}
      {!isSiswaTableMinimized && (
        <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs transition-all">
          <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Sub-Panel 03D · Daftar Peserta &amp; Kode Paket Terkunci
              </div>
              <h2 className="text-base font-extrabold text-white mt-0.5">
                Database Siswa ({filteredStudents.length} Peserta)
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200">
                {uniqueClasses.length} Kelas / Rombel
              </span>
              <button
                type="button"
                onClick={() => setIsSiswaTableMinimized((p) => !p)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-amber-300 cursor-pointer"
              >
                {isSiswaTableMinimized ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Buka Tabel ({filteredStudents.length})</span>
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

          {!isSiswaTableMinimized && (
            <>
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
                      <option value="SEMUA">Semua Kelas / Rombel</option>
                      {uniqueClasses.map((kls) => (
                        <option key={kls} value={kls}>
                          {kls}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Filter Mata Pelajaran (Mapel) */}
                  <select
                    aria-label="Filter Mata Pelajaran Siswa"
                    value={filterStudentMapel}
                    onChange={(e) => {
                      setFilterStudentMapel(e.target.value);
                      setFilterStudentExamId('SEMUA');
                    }}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-indigo-200 rounded-lg text-indigo-950"
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

                  {/* Filter Paket Ujian */}
                  {exams.length > 0 && (
                    <select
                      aria-label="Filter Paket Ujian Siswa"
                      value={filterStudentExamId}
                      onChange={(e) => setFilterStudentExamId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg text-slate-800"
                    >
                      <option value="SEMUA">Semua Paket Ujian</option>
                      {exams
                        .filter(
                          (ex) =>
                            filterStudentMapel === 'SEMUA' ||
                            getEffectiveMataPelajaran(ex).toUpperCase() ===
                              filterStudentMapel.toUpperCase()
                        )
                        .map((ex) => (
                          <option key={ex.id} value={String(ex.id)}>
                            {ex.judul_ujian} ({getEffectiveMataPelajaran(ex)})
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
                      {isDistributingPackages ? 'Membagi Paket...' : 'Bagi Multi-Paket (A/B)'}
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
                      <strong>Upload Massal Siswa (Excel / CSV)</strong> pada Sub-Tab 03B untuk mengisi daftar siswa Kelas X, XI, dan XII.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-3.5">Nama Siswa</th>
                          <th className="py-3 px-3.5">Kelas · No. Absen</th>
                          <th className="py-3 px-3.5">Token Login &amp; Token Ujian</th>
                          <th className="py-3 px-3.5">Paket Soal &amp; Nilai</th>
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
                          const rec = resolveStudentPrecisionRecord({
                            student: st,
                            allStudents: students,
                            exams: studentScopedExams,
                            questions,
                            results,
                            preferredExamId:
                              filterStudentExamId !== 'SEMUA'
                                ? Number(filterStudentExamId)
                                : undefined,
                          });

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
                                <div>
                                  <span className="font-semibold text-slate-900">
                                    {st.kelas}
                                  </span>
                                  {tkt !== 'LAINNYA' && (
                                    <span className="text-slate-500"> · Tingkat {tkt}</span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1">
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                    Absen #{rec.noAbsen} ({rec.ganjilGenapLabel})
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase text-slate-500 w-11">
                                      Login:
                                    </span>
                                    <code className="font-mono font-bold text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                      {rec.tokenLogin}
                                    </code>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase text-amber-800 w-11">
                                      Ujian:
                                    </span>
                                    <code className="font-mono font-bold text-xs text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
                                      {rec.tokenUjianHariIni}
                                    </code>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 w-fit">
                                    <Layers className="w-3 h-3 text-indigo-600 shrink-0" />
                                    <span>{rec.kodePaket}</span>
                                  </span>
                                  <span
                                    className="text-[11px] font-semibold text-slate-700 truncate max-w-[190px]"
                                    title={`${rec.namaPaketSoal} (${rec.mataPelajaran})`}
                                  >
                                    {rec.namaPaketSoal} ({rec.mataPelajaran})
                                  </span>
                                  {rec.hasRetakeHistory &&
                                  rec.initialScore !== null &&
                                  rec.retakeScore !== null ? (
                                    <div className="flex flex-col gap-0.5 mt-0.5 p-1.5 rounded-md bg-indigo-50/80 border border-indigo-200 text-[10px] font-mono">
                                      <span className="font-bold text-slate-700">
                                        Sebelum ({rec.initialTimeShort}):{' '}
                                        <strong className="text-indigo-900">
                                          {rec.initialScore}/100
                                        </strong>
                                      </span>
                                      <span className="font-extrabold text-emerald-800">
                                        Sesudah ({rec.retakeTimeShort}):{' '}
                                        <strong className="text-emerald-900">
                                          {rec.retakeScore}/100 ({rec.predikatLabel})
                                        </strong>
                                      </span>
                                    </div>
                                  ) : rec.score !== null ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] font-mono font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                                        Nilai: {rec.score}/100 ({rec.predikatLabel}) ·{' '}
                                        {rec.initialTimeShort}
                                      </span>
                                      {rec.isRescheduledRetakePending && (
                                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded w-fit">
                                          Dijadwalkan Ulang (Nilai Awal Tersimpan)
                                        </span>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <select
                                      aria-label={`Ubah status ujian ${st.nama}`}
                                      value={st.status_ujian}
                                      onChange={(e) =>
                                        handleUpdateStudentStatus(st, e.target.value)
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
                                      <option value="Belum Mulai">Belum Mulai</option>
                                      <option value="Sedang Ujian">Sedang Ujian</option>
                                      <option value="Selesai">Selesai</option>
                                      <option value="Diblokir">Diblokir</option>
                                    </select>

                                    {isBlocked && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateStudentStatus(st, 'Sedang Ujian')
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
                                        onClick={() => handleUpdateStudentStatus(st, 'Diblokir')}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded cursor-pointer"
                                      >
                                        <Ban className="w-3 h-3" />
                                        Blokir
                                      </button>
                                    )}

                                    {(isFinished || isOngoing) && (
                                      <button
                                        type="button"
                                        title="Jadwalkan Ulang / Ujian Ulang (Nilai pertama tetap tersimpan, nilai ujian ulang akan ditambahkan berdasarkan waktu ujian)"
                                        onClick={() =>
                                          handleUpdateStudentStatus(st, 'Belum Mulai')
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        {isFinished ? 'Jadwalkan Ulang' : 'Reset'}
                                      </button>
                                    )}
                                  </div>
                                  {st.live_telemetry && (
                                    <div className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1 flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-indigo-900">
                                        Soal #{st.live_telemetry.current_question_no}/
                                        {st.live_telemetry.total_questions || '-'}
                                      </span>
                                      <span>·</span>
                                      <span className="text-emerald-700 font-semibold">
                                        Dijawab {st.live_telemetry.answered_count}/
                                        {st.live_telemetry.total_questions || '-'}
                                      </span>
                                      {((st.live_telemetry.inspect_attempts || 0) > 0 ||
                                        st.live_telemetry.devtools_open) && (
                                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                                          Inspect: {st.live_telemetry.inspect_attempts || 0}x
                                        </span>
                                      )}
                                    </div>
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
                                        questions,
                                        results,
                                        allStudents: students,
                                        includeSummaryPage: true,
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
                                    onClick={() => handleRegenerateToken(st.id, st.nama)}
                                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    Token Baru
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStudentInputMode('manual');
                                      setIsSiswaFormMinimized(false);
                                      setIsSiswaTableMinimized(true);
                                      setIsSiswaStatusPanelMinimized(true);
                                      setIsSiswaClassPanelMinimized(true);
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
                                    onClick={() => handleDeleteStudent(st.id, st.nama)}
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminSiswaTab;
