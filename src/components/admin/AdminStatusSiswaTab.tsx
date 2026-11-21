import React, { useState, useMemo } from 'react';
import {
  Users,
  Unlock,
  Ban,
  RotateCcw,
  KeyRound,
  Trash2,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  Edit3,
  Activity,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Zap,
  FolderCog,
} from 'lucide-react';
import { resolveStudentPrecisionRecord } from '../../utils/cbtPdfGenerator';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminStatusSiswaTab: React.FC = () => {
  const {
    exams,
    questions,
    results,
    students,
    filteredStudents,
    uniqueClasses,
    filterStudentTingkat,
    setFilterStudentTingkat,
    filterKelas,
    setFilterKelas,
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
    newClassNameInput,
    setNewClassNameInput,
    renamingClassTarget,
    setRenamingClassTarget,
    renameClassValue,
    setRenameClassValue,
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
    handleUpdateStudentStatus,
    handleRegenerateToken,
    handleDeleteStudent,
    setActiveTab,
  } = useAdminDashboard();

  const [selectedStudentForLog, setSelectedStudentForLog] = useState<
    (typeof students)[number] | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isStudentFormOpen, setIsStudentFormOpen] = useState(false);
  const [isClassManagerOpen, setIsClassManagerOpen] = useState(false);

  const visibleStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredStudents;
    return filteredStudents.filter(
      (st) =>
        st.nama.toLowerCase().includes(q) ||
        st.kelas.toLowerCase().includes(q) ||
        (st.nisn || '').toLowerCase().includes(q) ||
        (st.token_ujian || '').toLowerCase().includes(q) ||
        (st.password_login || '').toLowerCase().includes(q)
    );
  }, [filteredStudents, searchQuery]);

  const blockedStudentsCountInScope = useMemo(
    () => visibleStudents.filter((s) => s.status_ujian === 'Diblokir').length,
    [visibleStudents]
  );

  const handleBulkUnblockBlockedOnly = async () => {
    const blockedList = visibleStudents.filter((s) => s.status_ujian === 'Diblokir');
    if (blockedList.length === 0) return;
    for (const st of blockedList) {
      await handleUpdateStudentStatus(st, 'Sedang Ujian');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Interactive Status Counter Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>04. Status Siswa, Buka Blokir Pengawas &amp; Database Peserta</span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Kontrol Status Ujian, Buka Blokir Anti-Cheat &amp; Data Peserta ({students.length} Siswa)
            </h2>
            <p className="text-xs text-slate-600">
              Menu khusus untuk memantau status ujian (Belum Mulai, Sedang Ujian, Selesai, Diblokir), membuka blokir peserta seketika, menjadwalkan Ujian Ulang (otomatis tukar paket A ↔ B), reset token login akun, serta kelola rombel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportStudentsExcel()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Ekspor Database (.xls)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('token_distribusi')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer"
              title="Cetak kartu token dan atur token sesi ujian di Modul 02"
            >
              <KeyRound className="w-4 h-4" />
              <span>Kartu Token → Modul 02</span>
            </button>
          </div>
        </div>

        {/* 4 Interactive Status Counter Cards (Click to Filter!) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() =>
              setFilterStudentStatus(
                filterStudentStatus === 'Belum Mulai' ? 'SEMUA' : 'Belum Mulai'
              )
            }
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
              filterStudentStatus === 'Belum Mulai'
                ? 'bg-slate-200/80 border-slate-500 ring-2 ring-slate-300'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold text-slate-600 uppercase">Belum Mulai</div>
              <div className="text-xl font-extrabold font-mono text-slate-900 mt-0.5">
                {countStatusBelumMulai}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterStudentStatus(
                filterStudentStatus === 'Sedang Ujian' ? 'SEMUA' : 'Sedang Ujian'
              )
            }
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
              filterStudentStatus === 'Sedang Ujian'
                ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300'
                : 'bg-blue-50 border-blue-200 hover:bg-blue-100/70'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold text-blue-700 uppercase">Sedang Ujian</div>
              <div className="text-xl font-extrabold font-mono text-blue-900 mt-0.5">
                {countStatusSedangUjian}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-200 text-blue-800 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterStudentStatus(
                filterStudentStatus === 'Selesai' ? 'SEMUA' : 'Selesai'
              )
            }
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
              filterStudentStatus === 'Selesai'
                ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-300'
                : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Selesai</div>
              <div className="text-xl font-extrabold font-mono text-emerald-900 mt-0.5">
                {countStatusSelesai}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-200 text-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterStudentStatus(
                filterStudentStatus === 'Diblokir' ? 'SEMUA' : 'Diblokir'
              )
            }
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
              filterStudentStatus === 'Diblokir'
                ? 'bg-red-100 border-red-500 ring-2 ring-red-300'
                : 'bg-red-50 border-red-200 hover:bg-red-100/70'
            }`}
          >
            <div>
              <div className="text-[10px] font-bold text-red-700 uppercase">
                Diblokir (Anti-Cheat)
              </div>
              <div className="text-xl font-extrabold font-mono text-red-900 mt-0.5">
                {countStatusDiblokir}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-red-200 text-red-800 flex items-center justify-center">
              <Ban className="w-4 h-4" />
            </div>
          </button>
        </div>

        {/* Filters & Bulk Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama / NISN / token..."
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl w-48 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={filterStudentTingkat}
              onChange={(e) => setFilterStudentTingkat(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="SEMUA">Semua Tingkatan</option>
              <option value="10">Kelas X (10)</option>
              <option value="11">Kelas XI (11)</option>
              <option value="12">Kelas XII (12)</option>
            </select>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="SEMUA">Semua Kelas / Rombel</option>
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  Kelas {cls}
                </option>
              ))}
            </select>
            <select
              value={filterStudentStatus}
              onChange={(e) => setFilterStudentStatus(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="SEMUA">Semua Status Ujian</option>
              <option value="Belum Mulai">Belum Mulai</option>
              <option value="Sedang Ujian">Sedang Ujian</option>
              <option value="Selesai">Selesai</option>
              <option value="Diblokir">Diblokir</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {blockedStudentsCountInScope > 0 && (
              <button
                type="button"
                onClick={handleBulkUnblockBlockedOnly}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Buka Blokir Semua ({blockedStudentsCountInScope})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleBulkUpdateStudentStatus('Belum Mulai')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
            >
              Reset Filter → &ldquo;Belum Mulai&rdquo;
            </button>
            <button
              type="button"
              onClick={() => setIsStudentFormOpen((p) => !p)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isStudentFormOpen ? 'Tutup Form Siswa' : 'Tambah / Impor Siswa'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsClassManagerOpen((p) => !p)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 cursor-pointer"
            >
              <FolderCog className="w-3.5 h-3.5" />
              <span>Kelola Rombel ({uniqueClasses.length})</span>
            </button>
          </div>
        </div>

        {studentFeedback && (
          <div
            role="status"
            className={`rounded-xl p-3 text-xs font-semibold border ${
              studentFeedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            {studentFeedback.message}
          </div>
        )}
      </div>

      {/* Collapsible Kelola Rombel / Kelas */}
      {isClassManagerOpen && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FolderCog className="w-4 h-4 text-emerald-600" />
              <span>Kelola Daftar Rombel / Kelas ({uniqueClasses.length} Kelas)</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsClassManagerOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Tutup
            </button>
          </div>

          <form onSubmit={handleAddNewClass} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newClassNameInput}
              onChange={(e) => setNewClassNameInput(e.target.value)}
              placeholder="Tambah nama kelas baru (contoh: X-4 atau XI Soshum 2)"
              className="flex-1 min-w-[220px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              + Tambah Kelas
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {uniqueClasses.map((cls) => (
              <div
                key={cls}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              >
                {renamingClassTarget === cls ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRenameClassSubmit(cls);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={renameClassValue}
                      onChange={(e) => setRenameClassValue(e.target.value)}
                      className="px-2 py-0.5 text-xs bg-white border border-blue-400 rounded w-28"
                    />
                    <button
                      type="submit"
                      className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold cursor-pointer"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingClassTarget(null)}
                      className="text-[10px] text-slate-500 cursor-pointer"
                    >
                      Batal
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="font-bold text-slate-800">{cls}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingClassTarget(cls);
                        setRenameClassValue(cls);
                      }}
                      className="p-0.5 text-slate-500 hover:text-blue-700 cursor-pointer"
                      title="Ganti nama kelas"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClass(cls)}
                      className="p-0.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      title="Hapus kelas & semua siswanya"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Form Tambah / Edit / Upload Siswa */}
      {(isStudentFormOpen || Boolean(editingStudentId)) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900">
              {editingStudentId
                ? 'Edit Data Peserta Didik'
                : 'Tambah / Impor Siswa & Rombel Baru'}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStudentInputMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  studentInputMode === 'manual'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Input Manual
              </button>
              <button
                type="button"
                onClick={() => setStudentInputMode('csv')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  studentInputMode === 'csv'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Upload Excel / CSV Siswa
              </button>
            </div>
          </div>

          {studentInputMode === 'manual' ? (
            <form
              onSubmit={handleSaveStudent}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nama Lengkap Siswa
                </label>
                <input
                  type="text"
                  required
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="Contoh: Sitti Aisyah"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  NISN / No Induk
                </label>
                <input
                  type="text"
                  value={studentNisnInput}
                  onChange={(e) => setStudentNisnInput(e.target.value)}
                  placeholder="Nomor Induk Siswa"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Kelas / Rombel
                </label>
                <input
                  type="text"
                  required
                  value={studentClassInput}
                  onChange={(e) => setStudentClassInput(e.target.value)}
                  placeholder="Contoh: XI Soshum 1"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  disabled={isSavingStudent}
                  className="flex-1 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  {isSavingStudent
                    ? 'Menyimpan...'
                    : editingStudentId
                      ? 'Simpan Perubahan'
                      : 'Tambah Siswa'}
                </button>
                {editingStudentId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStudentId(null);
                      setStudentNameInput('');
                      setStudentNisnInput('');
                    }}
                    className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleUploadStudentCsvSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStudentTemplateExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Excel (.xls)</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSampleStudentCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template CSV</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50 rounded-xl p-5 text-center cursor-pointer">
                  <Upload className="w-6 h-6 text-emerald-600 mb-2" />
                  <span className="text-xs font-extrabold text-slate-900">
                    Pilih File Data Siswa (.xlsx, .xls, .csv)
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={handleStudentCsvFileChange}
                    disabled={isUploadingStudentsCsv}
                    className="hidden"
                  />
                </label>

                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={studentCsvText}
                    onChange={(e) => setStudentCsvText(e.target.value)}
                    placeholder="Atau tempelkan baris CSV siswa di sini..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceExistingStudents}
                        onChange={(e) => setReplaceExistingStudents(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Ganti / timpa database siswa lama</span>
                    </label>
                    <button
                      type="submit"
                      disabled={isUploadingStudentsCsv}
                      className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      {isUploadingStudentsCsv ? 'Mengimpor...' : 'Impor Siswa'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tabel Daftar Siswa & Kontrol Status Blokir */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            <span>
              Daftar Status Siswa &amp; Kontrol Buka Blokir ({visibleStudents.length} Peserta)
            </span>
          </h3>
          <button
            type="button"
            onClick={() => handleDownloadClassStudentsExcel(filterKelas)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Filter Ini</span>
          </button>
        </div>

        {visibleStudents.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl text-slate-500 text-xs">
            Belum ada data siswa yang sesuai dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 uppercase tracking-wider text-[10px]">
                  <th className="p-3">No</th>
                  <th className="p-3">Absen</th>
                  <th className="p-3">Nama Siswa &amp; NISN</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Token Login Akun</th>
                  <th className="p-3">Paket Soal</th>
                  <th className="p-3">Status Ujian &amp; Pelanggaran Anti-Cheat</th>
                  <th className="p-3 text-right">Aksi Pengawas / Buka Blokir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStudents.map((st, idx) => {
                  const rec = resolveStudentPrecisionRecord({
                    student: st,
                    allStudents: students,
                    exams,
                    questions,
                    results,
                  });
                  const isBlocked = st.status_ujian === 'Diblokir';
                  const tabViolations = st.live_telemetry?.tab_violations || 0;
                  const inspectAttempts = st.live_telemetry?.inspect_attempts || 0;
                  const hasLog =
                    tabViolations > 0 ||
                    inspectAttempts > 0 ||
                    Boolean(st.live_telemetry?.last_action);
                  return (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isBlocked ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3">
                        <span className="font-mono font-extrabold text-indigo-700">
                          #{rec.noAbsen}
                        </span>{' '}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            rec.isGanjil ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                          }`}
                        >
                          {rec.ganjilGenapLabel}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900">{st.nama}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {st.nisn || `ID-#${st.id}`}
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{st.kelas}</td>
                      <td className="p-3 font-mono font-bold text-blue-700">
                        {st.password_login || st.token_ujian || '-'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-[11px] font-bold">
                          {st.kode_soal || 'PAKET-A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              isBlocked
                                ? 'bg-red-100 text-red-900 border border-red-300'
                                : st.status_ujian === 'Sedang Ujian'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                  : st.status_ujian === 'Selesai'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {st.status_ujian}
                          </span>
                          {(tabViolations > 0 || inspectAttempts > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                              {tabViolations > 0 && (
                                <span className="text-amber-800 font-bold">
                                  Tab/Blur: {tabViolations}x
                                </span>
                              )}
                              {inspectAttempts > 0 && (
                                <span className="text-rose-700 font-bold">
                                  Inspect: {inspectAttempts}x
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isBlocked ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateStudentStatus(st, 'Sedang Ujian')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs cursor-pointer"
                              title="Buka Blokir & Lanjutkan Ujian (jawaban & sisa waktu tetap aman)"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Buka Blokir</span>
                            </button>
                          ) : st.status_ujian === 'Selesai' ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateStudentStatus(st, 'Belum Mulai')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] cursor-pointer"
                              title="Jadwalkan Ujian Ulang (Reset ke Belum Mulai & otomatis tukar paket A ↔ B)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Ujian Ulang</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateStudentStatus(st, 'Diblokir')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-[11px] cursor-pointer"
                              title="Blokir Akses Ujian Siswa"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Blokir</span>
                            </button>
                          )}

                          {hasLog && (
                            <button
                              type="button"
                              onClick={() => setSelectedStudentForLog(st)}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer"
                              title="Lihat Detail Log Pelanggaran & Aktivitas Anti-Cheat"
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentId(st.id);
                              setStudentNameInput(st.nama);
                              setStudentNisnInput(st.nisn || '');
                              setStudentClassInput(st.kelas);
                              setStudentInputMode('manual');
                              setIsStudentFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="Edit Data Siswa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRegenerateToken(st.id, st.nama)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="Regenerasi Token Login Akun"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(st.id, st.nama)}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                            title="Hapus Siswa"
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

      {/* Modal Detail Log Pelanggaran Anti-Cheat */}
      {selectedStudentForLog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Rekam Jejak Keamanan &amp; Anti-Cheat Siswa
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                  {selectedStudentForLog.nama} ({selectedStudentForLog.kelas})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentForLog(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-800 uppercase">Pindah Tab / Blur</div>
                <div className="text-lg font-mono font-extrabold text-amber-950 mt-0.5">
                  {selectedStudentForLog.live_telemetry?.tab_violations || 0}x
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <div className="text-[10px] font-bold text-rose-800 uppercase">Inspect / Shortcut</div>
                <div className="text-lg font-mono font-extrabold text-rose-950 mt-0.5">
                  {selectedStudentForLog.live_telemetry?.inspect_attempts || 0}x
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-600 uppercase">Status Saat Ini</div>
                <div className="text-sm font-extrabold text-slate-900 mt-1">
                  {selectedStudentForLog.status_ujian}
                </div>
              </div>
            </div>

            {selectedStudentForLog.live_telemetry?.last_action && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Aktivitas Terakhir Tercatat
                </div>
                <div className="font-semibold text-slate-900">
                  {selectedStudentForLog.live_telemetry.last_action}
                </div>
                {selectedStudentForLog.live_telemetry.device_info && (
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    Perangkat: {selectedStudentForLog.live_telemetry.device_info}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-800">
                Kronologi Log Aktivitas ({selectedStudentForLog.live_telemetry?.recent_logs?.length || 0} entri)
              </div>
              {(selectedStudentForLog.live_telemetry?.recent_logs || []).length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  Belum ada rincian log kronologi tambahan.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {(selectedStudentForLog.live_telemetry?.recent_logs || []).map((log, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                        log.action === 'violation' || log.action === 'blocked'
                          ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span className="font-mono text-[10px] text-slate-500 shrink-0 mt-0.5">
                        {log.timestamp}
                      </span>
                      <span className="leading-snug">{log.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              {selectedStudentForLog.status_ujian === 'Diblokir' && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleUpdateStudentStatus(selectedStudentForLog, 'Sedang Ujian');
                    setSelectedStudentForLog(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Buka Blokir Sekarang</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedStudentForLog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStatusSiswaTab;
