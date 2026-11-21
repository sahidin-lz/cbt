import React, { useState } from 'react';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Lock,
  Play,
  Shuffle,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  FlaskConical,
  Archive,
  RotateCcw,
} from 'lucide-react';
import {
  SOSIOLOGI_EXAM_CATEGORIES,
  DAFTAR_MATA_PELAJARAN_SMA,
  extractTingkatFromKelas,
  getEffectiveMataPelajaran,
  getEffectiveExamSessionToken,
  generateExamToken,
} from '../../utils/cbtLogic';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminUjianTab: React.FC = () => {
  const {
    exams,
    activeBankQuestions,
    filteredExams,
    uniqueClasses,
    availableMataPelajaran,
    setActiveTab,
    isSubMenuBarMinimized,
    setIsSubMenuBarMinimized,
    isUjianFormMinimized,
    setIsUjianFormMinimized,
    isUjianTableMinimized,
    setIsUjianTableMinimized,
    editingExamId,
    setEditingExamId,
    newExamTitle,
    setNewExamTitle,
    newExamDuration,
    setNewExamDuration,
    newExamTargetTingkat,
    setNewExamTargetTingkat,
    newExamTargetKelas,
    setNewExamTargetKelas,
    newExamKategori,
    setNewExamKategori,
    newExamStatus,
    setNewExamStatus,
    newExamTargetRombel,
    setNewExamTargetRombel,
    filterExamKategori,
    setFilterExamKategori,
    filterExamStatus,
    setFilterExamStatus,
    newExamAcakSoal,
    setNewExamAcakSoal,
    newExamAcakOpsi,
    setNewExamAcakOpsi,
    newExamKodePaket,
    setNewExamKodePaket,
    newExamMultiPaket,
    setNewExamMultiPaket,
    newExamJumlahPaket,
    setNewExamJumlahPaket,
    newExamTokenSesi,
    setNewExamTokenSesi,
    newExamTampilkanNilai,
    setNewExamTampilkanNilai,
    newExamPengumuman,
    setNewExamPengumuman,
    newExamMataPelajaran,
    setNewExamMataPelajaran,
    newExamDistribusiMode,
    setNewExamDistribusiMode,
    inlineTokenEditExamId,
    setInlineTokenEditExamId,
    inlineTokenEditValue,
    setInlineTokenEditValue,
    filterExamTingkat,
    setFilterExamTingkat,
    filterExamMapel,
    setFilterExamMapel,
    isSavingExam,
    examFeedback,
    setSelectedExamId,
    setShowUploadPanel,
    setIsBankSoalDetailOpen,
    formatDistribusiLabel,
    handleSaveExam,
    handleUpdateExamSessionToken,
    handleToggleExamStatus,
    handleDeleteExam,
    setDryRunExam,
    archivedExams,
    isLoadingArchive,
    restoringArchiveId,
    handleRestoreArchivedExam,
    refreshArchives,
  } = useAdminDashboard();

  const [isArchivePanelOpen, setIsArchivePanelOpen] = useState(false);

  return (
    <>
      <div className="bg-white border border-blue-200/80 rounded-2xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        {!isSubMenuBarMinimized ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold text-blue-950 px-2">
              Sub-Tab Jadwal &amp; Paket Ujian:
            </span>
            <button
              type="button"
              onClick={() => {
                setIsUjianTableMinimized(false);
                setIsUjianFormMinimized(true);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                !isUjianTableMinimized
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              01-1. Daftar Paket Ujian ({filteredExams.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setIsUjianTableMinimized(true);
                setIsUjianFormMinimized(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                !isUjianFormMinimized
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              01-2. {editingExamId ? 'Edit Paket Ujian' : 'Form Buat Paket Ujian'}
            </button>
            <button
              type="button"
              onClick={() => setIsArchivePanelOpen((p) => !p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                isArchivePanelOpen
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              01-3. Arsip 30 Hari ({archivedExams.length})
            </button>
          </div>
        ) : (
          <span className="text-xs font-extrabold text-blue-950 px-2">
            Sub-Tab Menu 01 Jadwal &amp; Paket Ujian
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline text-[11px] font-semibold text-slate-500">
            Mode Tab Terpisah (1 tampilan aktif)
          </span>
          <button
            type="button"
            onClick={() => setIsSubMenuBarMinimized((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Minimize / Buka Baris Kontrol Sub-Tab"
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

      {/* ===================================================================== */}
      {/* TAB 1: MANAJEMEN UJIAN & DISTRIBUSI SOAL KE 3 TINGKATAN KELAS          */}
      {/* ===================================================================== */}
      <div className="space-y-6">
        {/* Panduan Alur Distribusi Soal 3 Tingkatan — hanya tampil di sub-tab Form Paket */}
        {!isUjianFormMinimized && (
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
        )}

        {/* Form Buat / Edit Paket Ujian & Distribusi Tingkat (Eksklusif Sub-Tab 01-2) */}
        {!isUjianFormMinimized && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 transition-all">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {editingExamId
                  ? '01A-1. Edit Paket & Distribusi Ujian'
                  : '01A-1. Buat Paket Ujian per Tingkatan'}
              </h2>
              <button
                type="button"
                onClick={() => setIsUjianFormMinimized((p) => !p)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
              >
                {isUjianFormMinimized ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Buka Form</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Minimize</span>
                  </>
                )}
              </button>
            </div>

            {!isUjianFormMinimized && (
              <form onSubmit={handleSaveExam} className="space-y-4">
                <div>
                  <label
                    htmlFor="exam-mapel-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Mata Pelajaran Ujian (Multi-Mapel)
                  </label>
                  <select
                    id="exam-mapel-select"
                    value={newExamMataPelajaran}
                    onChange={(e) => setNewExamMataPelajaran(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-semibold bg-indigo-50/50 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {DAFTAR_MATA_PELAJARAN_SMA.map((mp) => (
                      <option key={mp} value={mp}>
                        Mata Pelajaran: {mp}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="exam-title-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Judul / Nama Paket Ujian
                  </label>
                  <input
                    id="exam-title-input"
                    type="text"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                    placeholder="Contoh: PTS Sosiologi — Kelompok Sosial & Perubahan"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Kategori Momen Ujian Sosiologi */}
                <div>
                  <label
                    htmlFor="exam-kategori-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Kategori Momen Ujian Sosiologi
                  </label>
                  <select
                    id="exam-kategori-select"
                    value={newExamKategori}
                    onChange={(e) => setNewExamKategori(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {SOSIOLOGI_EXAM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Siklus Sesi Ujian (Draf vs Aktif) */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <label className="block text-xs font-semibold text-slate-800">
                    Status Sesi Ujian (Kapan Siswa Boleh Masuk?)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewExamStatus('DRAF')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                        newExamStatus === 'DRAF'
                          ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-400'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>DRAF (Bank Soal)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-1 leading-tight">
                        Siswa belum bisa melihat atau masuk. Aman untuk persiapan upload soal.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewExamStatus('AKTIF')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                        newExamStatus === 'AKTIF'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>AKTIF (Buka Sesi)</span>
                      </div>
                      <p className="text-[10px] font-normal text-slate-500 mt-1 leading-tight">
                        Sesi langsung terbuka bagi siswa kelas bersangkutan untuk memulai ujian.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="exam-tingkat-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Target Tingkatan Kelas Sosiologi
                  </label>
                  <select
                    id="exam-tingkat-select"
                    value={newExamTargetTingkat}
                    onChange={(e) => {
                      setNewExamTargetTingkat(e.target.value);
                      setNewExamTargetRombel([]);
                    }}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="10">Tingkat 1 — Kelas X / Fase E</option>
                    <option value="11">Tingkat 2 — Kelas XI / Fase F</option>
                    <option value="12">Tingkat 3 — Kelas XII / Fase F Lanjutan</option>
                    <option value="SEMUA">Semua Tingkatan (Lintas Kelas)</option>
                  </select>
                </div>

                {/* Target Rombel Spesifik */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Target Rombel Spesifik (Opsional)
                    </label>
                    {newExamTargetRombel.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewExamTargetRombel([])}
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                      >
                        Pilih Semua Rombel
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    {newExamTargetRombel.length === 0
                      ? 'Berlaku untuk SEMUA rombel pada tingkat ini.'
                      : `Dibatasi hanya untuk ${newExamTargetRombel.length} rombel terpilih:`}
                  </p>
                  {uniqueClasses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      {uniqueClasses
                        .filter((kls) => {
                          if (newExamTargetTingkat === 'SEMUA') return true;
                          return extractTingkatFromKelas(kls) === newExamTargetTingkat;
                        })
                        .map((kls) => {
                          const isChecked = newExamTargetRombel.includes(kls);
                          return (
                            <button
                              key={kls}
                              type="button"
                              onClick={() => {
                                setNewExamTargetRombel((prev) =>
                                  isChecked
                                    ? prev.filter((c) => c !== kls)
                                    : [...prev, kls]
                                );
                              }}
                              className={`px-2 py-0.5 text-xs rounded-md border font-medium cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isChecked ? '✓ ' : ''}
                              {kls}
                            </button>
                          );
                        })}
                    </div>
                  )}
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

                {/* Konfigurasi Pengacakan Soal & Multi-Paket (Anti-Mencontek) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Shuffle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Mekanisme Pengacakan & Multi-Paket Soal</span>
                  </div>

                  <div>
                    <label
                      htmlFor="exam-kode-paket-input"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Kode Soal / Paket Utama
                    </label>
                    <input
                      id="exam-kode-paket-input"
                      type="text"
                      value={newExamKodePaket}
                      onChange={(e) => setNewExamKodePaket(e.target.value.toUpperCase())}
                      placeholder="Contoh: PAKET-A, PAKET-B, UTAMA"
                      className="w-full px-3 py-1.5 text-xs font-mono font-semibold border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="exam-distribusi-mode-select"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Aturan Distribusi Paket Soal ke Siswa
                    </label>
                    <select
                      id="exam-distribusi-mode-select"
                      value={newExamDistribusiMode}
                      onChange={(e) => setNewExamDistribusiMode(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-md"
                    >
                      <option value="OTOMATIS_GANJIL_GENAP">
                        Otomatis Ganjil-Genap per Kelas (Jika ≥2 Paket Mapel Sama)
                      </option>
                      <option value="KHUSUS_GANJIL">
                        Khusus Siswa Absen GANJIL (1, 3, 5...) di Setiap Kelas
                      </option>
                      <option value="KHUSUS_GENAP">
                        Khusus Siswa Absen GENAP (2, 4, 6...) di Setiap Kelas
                      </option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-200/80">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamAcakSoal}
                        onChange={(e) => setNewExamAcakSoal(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">Acak Urutan Butir Soal</span>
                        <p className="text-[11px] text-slate-500">
                          Nomor butir soal diacak otomatis per siswa sekelas.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamAcakOpsi}
                        onChange={(e) => setNewExamAcakOpsi(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">Acak Pilihan Opsi A-E</span>
                        <p className="text-[11px] text-slate-500">
                          Pilihan A-E diacak otomatis (skor tetap 100% akurat sesuai kunci).
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newExamMultiPaket}
                        onChange={(e) => setNewExamMultiPaket(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <span className="font-semibold text-slate-800">
                          Mode Multi-Paket (Beda Soal Sekelas / Angkatan)
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Siswa sekelas otomatis dibagi ke varian paket/kode soal yang berbeda (A vs B).
                        </p>
                      </div>
                    </label>

                    {newExamMultiPaket && (
                      <div className="pl-6 pt-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Jumlah Varian Paket Soal:
                        </label>
                        <select
                          value={newExamJumlahPaket}
                          onChange={(e) => setNewExamJumlahPaket(Number(e.target.value))}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value={2}>2 Varian (Paket A & Paket B)</option>
                          <option value={3}>3 Varian (Paket A, B, C)</option>
                          <option value={4}>4 Varian (Paket A, B, C, D)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Token Sesi Ujian (Diberikan Guru Setiap Akan Ujian) & Pengumuman */}
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-indigo-950">
                      Token Sesi Ujian &amp; Portal Siswa
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                      Kontrol Guru
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="exam-token-sesi-input"
                      className="block text-[11px] font-semibold text-indigo-950 mb-1"
                    >
                      Token Sesi Ujian (Diinput Siswa Saat Klik &ldquo;Mulai Ujian&rdquo;)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="exam-token-sesi-input"
                        type="text"
                        maxLength={12}
                        value={newExamTokenSesi}
                        onChange={(e) =>
                          setNewExamTokenSesi(
                            e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
                          )
                        }
                        placeholder="Misal: SOS10A"
                        className="flex-1 px-3 py-1.5 text-xs font-mono font-extrabold tracking-widest uppercase bg-white border border-indigo-300 text-indigo-900 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setNewExamTokenSesi(generateExamToken())}
                        className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-800 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-md cursor-pointer shrink-0 flex items-center gap-1"
                        title="Buat Token Sesi Ujian acak 6 karakter baru"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Acak Token</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-indigo-800/80 mt-1 leading-tight">
                      Token ini dapat Bapak/Ibu ubah kapan saja setiap akan mulai sesi ujian.
                    </p>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1 border-t border-indigo-200/60">
                    <input
                      type="checkbox"
                      checked={newExamTampilkanNilai}
                      onChange={(e) => setNewExamTampilkanNilai(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-indigo-600 rounded border-indigo-300"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-indigo-950">
                        Tampilkan Hasil &amp; Nilai di Akun Siswa
                      </span>
                      <p className="text-[10px] text-indigo-800/80">
                        Jika aktif, siswa dapat melihat skor &amp; mengunduh PDF pembahasan di menu Hasil Ujian.
                      </p>
                    </div>
                  </label>

                  <div>
                    <label
                      htmlFor="exam-pengumuman-input"
                      className="block text-[11px] font-semibold text-indigo-950 mb-1"
                    >
                      Pengumuman Ujian di Beranda Siswa (Opsional)
                    </label>
                    <textarea
                      id="exam-pengumuman-input"
                      rows={2}
                      value={newExamPengumuman}
                      onChange={(e) => setNewExamPengumuman(e.target.value)}
                      placeholder="Contoh: Kerjakan dengan jujur dan teliti. Waktu ujian 60 menit."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
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
                        setNewExamKategori('Penilaian Harian (PH / Kuis)');
                        setNewExamStatus('DRAF');
                        setNewExamTargetRombel([]);
                        setNewExamAcakSoal(true);
                        setNewExamAcakOpsi(true);
                        setNewExamKodePaket('PAKET-A');
                        setNewExamMultiPaket(false);
                        setNewExamJumlahPaket(2);
                        setNewExamTokenSesi(generateExamToken());
                        setNewExamTampilkanNilai(true);
                        setNewExamPengumuman('');
                      }}
                      className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
            )}

            {examFeedback && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-800">
                {examFeedback}
              </div>
            )}
          </div>
        )}

        {/* Tabel Daftar Paket Ujian per Tingkatan (Eksklusif Sub-Tab 01-1) */}
        {!isUjianTableMinimized && (
          <div className="bg-white border border-indigo-200/80 rounded-2xl overflow-hidden shadow-xs transition-all">
            <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-4 text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Sub-Panel 01A-2 · Manajemen Sesi &amp; Distribusi Paket
                </div>
                <h2 className="text-base font-extrabold text-white mt-0.5">
                  Daftar Distribusi Paket Ujian ({filteredExams.length} Paket)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/20 text-xs font-mono font-bold text-amber-200">
                  Total Soal: {activeBankQuestions.length} Butir
                </span>
                <button
                  type="button"
                  onClick={() => setIsUjianTableMinimized((p) => !p)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-amber-300 cursor-pointer"
                >
                  {isUjianTableMinimized ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Buka Tabel ({filteredExams.length})</span>
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

            {!isUjianTableMinimized && (
              <>
                {examFeedback && (
                  <div className="mx-6 mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-800">
                    {examFeedback}
                  </div>
                )}

                {/* Dedicated Full-Width Filter Bar: Tingkatan, Kategori, & Status */}
                <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-slate-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2.5">
                  {/* Segmented Filter per Tingkatan */}
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-white rounded-lg border border-indigo-200 shadow-2xs">
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
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          filterExamTingkat === val
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Filter Mata Pelajaran (Mapel) */}
                    <select
                      value={filterExamMapel}
                      onChange={(e) => setFilterExamMapel(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-indigo-200 rounded-lg cursor-pointer text-indigo-950"
                      aria-label="Filter Mata Pelajaran Ujian"
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

                    {/* Filter Status Ujian */}
                    <select
                      value={filterExamStatus}
                      onChange={(e) => setFilterExamStatus(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg cursor-pointer text-slate-800"
                      aria-label="Filter Status Ujian"
                    >
                      <option value="SEMUA">Semua Status</option>
                      <option value="AKTIF">Hanya Sesi Aktif</option>
                      <option value="DRAF">Hanya Draf (Bank Soal)</option>
                      <option value="SELESAI">Hanya Selesai</option>
                    </select>

                    {/* Filter Kategori Momen */}
                    <select
                      value={filterExamKategori}
                      onChange={(e) => setFilterExamKategori(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-indigo-200 rounded-lg cursor-pointer text-slate-800"
                      aria-label="Filter Kategori Momen Ujian"
                    >
                      <option value="SEMUA">Semua Kategori Momen</option>
                      {SOSIOLOGI_EXAM_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-6">
                  {filteredExams.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm font-semibold text-slate-700">
                        Belum Ada Paket Ujian pada Filter Ini
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Buat paket ujian Sosiologi untuk Tingkat 1 (Kelas X), Tingkat 2 (Kelas XI), atau Tingkat 3 (Kelas XII) pada formulir pembuatan paket.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-indigo-100 rounded-xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-indigo-50/80 border-b border-indigo-100 text-xs font-bold text-indigo-950">
                            <th className="py-3 px-4">Judul &amp; Kode Paket</th>
                            <th className="py-3 px-4">Kategori &amp; Status Sesi</th>
                            <th className="py-3 px-4">Distribusi Tingkat &amp; Rombel</th>
                            <th className="py-3 px-4 text-right">Durasi</th>
                            <th className="py-3 px-4 text-right">Bank Soal</th>
                            <th className="py-3 px-4 text-right">Aksi Sesi &amp; Distribusi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-sm">
                          {filteredExams.map((ex) => {
                            const qCount = activeBankQuestions.filter(
                              (q) => Number(q.exam_id) === Number(ex.id)
                            ).length;
                            const isAktif = (ex.status_ujian || 'DRAF') === 'AKTIF';
                            const isSelesai = ex.status_ujian === 'SELESAI';

                            return (
                              <tr key={ex.id} className="hover:bg-slate-50/80">
                                <td className="py-3.5 px-4 font-semibold text-slate-900">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white">
                                      Mapel: {getEffectiveMataPelajaran(ex)}
                                    </span>
                                    {ex.distribusi_paket_mode === 'KHUSUS_GANJIL' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900">
                                        Khusus Absen Ganjil
                                      </span>
                                    )}
                                    {ex.distribusi_paket_mode === 'KHUSUS_GENAP' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                        Khusus Absen Genap
                                      </span>
                                    )}
                                  </div>
                                  <div>{ex.judul_ujian}</div>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      <Layers className="w-3 h-3 text-blue-600" />
                                      <span>{ex.kode_paket || 'PAKET-A'}</span>
                                    </span>
                                    {ex.acak_soal !== false && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Shuffle className="w-2.5 h-2.5" />
                                        <span>Acak Soal</span>
                                      </span>
                                    )}
                                    {ex.acak_opsi !== false && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                        <span>Acak Opsi</span>
                                      </span>
                                    )}
                                    {ex.mode_multi_paket && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                        <span>Multi-Paket ({ex.jumlah_paket || 2} Varian)</span>
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 text-xs">
                                  <div>
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      {ex.kategori_ujian || 'Penilaian Harian (PH / Kuis)'}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                    {isAktif ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                        AKTIF (Dibuka)
                                      </span>
                                    ) : isSelesai ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                                        SELESAI (Arsip)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                        <Lock className="w-2.5 h-2.5 text-amber-700" />
                                        DRAF (Bank Soal)
                                      </span>
                                    )}

                                    {isAktif ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleExamStatus(ex, 'DRAF')}
                                        title="Tutup sesi ujian ini agar siswa tidak bisa masuk (kembalikan ke Draf)"
                                        className="px-2 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded cursor-pointer transition-colors"
                                      >
                                        Tutup / Draf
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleExamStatus(ex, 'AKTIF')}
                                        title="Buka sesi ujian ini sekarang agar siswa bisa memasukkan token dan mengerjakan"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer shadow-xs transition-colors"
                                      >
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                        Buka Ujian
                                      </button>
                                    )}
                                  </div>

                                  {/* Token Sesi Ujian Control right inside the row */}
                                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      Token Sesi:
                                    </span>
                                    {inlineTokenEditExamId === ex.id ? (
                                      <div className="inline-flex items-center gap-1">
                                        <input
                                          type="text"
                                          maxLength={12}
                                          value={inlineTokenEditValue}
                                          onChange={(e) =>
                                            setInlineTokenEditValue(
                                              e.target.value
                                                .toUpperCase()
                                                .replace(/[^A-Z0-9-]/g, '')
                                            )
                                          }
                                          className="w-20 px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase border border-indigo-400 rounded bg-white text-indigo-950"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateExamSessionToken(
                                              ex,
                                              inlineTokenEditValue
                                            )
                                          }
                                          className="px-1.5 py-0.5 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer"
                                        >
                                          Simpan
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setInlineTokenEditExamId(null)}
                                          className="px-1.5 py-0.5 text-[10px] text-slate-600 bg-slate-100 rounded cursor-pointer"
                                        >
                                          Batal
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <code className="px-2 py-0.5 rounded bg-indigo-950 text-amber-300 font-mono text-[11px] font-extrabold tracking-wider">
                                          {getEffectiveExamSessionToken(ex)}
                                        </code>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateExamSessionToken(ex)}
                                          title="Acak Token Sesi Ujian baru untuk ujian ini"
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded cursor-pointer"
                                        >
                                          <RefreshCw className="w-2.5 h-2.5" />
                                          <span>Acak</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInlineTokenEditExamId(ex.id);
                                            setInlineTokenEditValue(
                                              getEffectiveExamSessionToken(ex)
                                            );
                                          }}
                                          title="Atur sendiri kode Token Sesi Ujian"
                                          className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                                        >
                                          Set Token
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 text-xs text-slate-700">
                                  <div className="font-semibold text-blue-700">
                                    {formatDistribusiLabel(
                                      ex.target_tingkat,
                                      ex.target_kelas
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {Array.isArray(ex.target_rombel) && ex.target_rombel.length > 0
                                      ? `Rombel: ${ex.target_rombel.join(', ')}`
                                      : 'Semua Rombel Tingkat Ini'}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                                  {ex.durasi_menit} Menit
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                                  {qCount} Soal
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setDryRunExam(ex)}
                                      title="Coba Ujian (Dry-Run Simulasi) sebelum publikasi untuk memastikan gambar & token berjalan normal"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <FlaskConical className="w-3.5 h-3.5" />
                                      <span>Coba Ujian</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedExamId(ex.id);
                                        setShowUploadPanel(qCount === 0);
                                        setActiveTab('soal');
                                        setIsBankSoalDetailOpen(true);
                                      }}
                                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      Kelola Soal
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingExamId(ex.id);
                                        setIsUjianFormMinimized(false);
                                        setIsUjianTableMinimized(true);
                                        setNewExamTitle(ex.judul_ujian);
                                        setNewExamDuration(String(ex.durasi_menit));
                                        setNewExamTargetTingkat(ex.target_tingkat || 'SEMUA');
                                        setNewExamTargetKelas(ex.target_kelas || 'SEMUA');
                                        setNewExamKategori(
                                          ex.kategori_ujian || 'Penilaian Harian (PH / Kuis)'
                                        );
                                        setNewExamStatus((ex.status_ujian as any) || 'DRAF');
                                        setNewExamTargetRombel(
                                          Array.isArray(ex.target_rombel) ? ex.target_rombel : []
                                        );
                                        setNewExamAcakSoal(ex.acak_soal !== false);
                                        setNewExamAcakOpsi(ex.acak_opsi !== false);
                                        setNewExamKodePaket(ex.kode_paket || 'PAKET-A');
                                        setNewExamMultiPaket(Boolean(ex.mode_multi_paket));
                                        setNewExamJumlahPaket(ex.jumlah_paket || 2);
                                        setNewExamTokenSesi(
                                          ex.token_sesi || getEffectiveExamSessionToken(ex)
                                        );
                                        setNewExamTampilkanNilai(ex.tampilkan_nilai !== false);
                                        setNewExamPengumuman(ex.pengumuman || '');
                                        setNewExamMataPelajaran(getEffectiveMataPelajaran(ex));
                                        setNewExamDistribusiMode(
                                          ex.distribusi_paket_mode || 'OTOMATIS_GANJIL_GENAP'
                                        );
                                      }}
                                      aria-label={`Edit ujian ${ex.judul_ujian}`}
                                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExam(ex.id, ex.judul_ujian)}
                                      aria-label={`Hapus ujian ${ex.judul_ujian}`}
                                      title="Hapus Paket (Masuk Arsip 30 Hari sebelum penghapusan permanen)"
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

        {/* Panel Arsip Terhapus (Soft-Delete 30 Hari dengan Restore) */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                  Arsip Paket Ujian Terhapus (Retensi 30 Hari)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Paket yang dihapus aman tersimpan di arsip selama 30 hari sebelum dibersihkan otomatis agar audit nilai &amp; cetak rapor tetap terjaga.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                {archivedExams.length} Arsip
              </span>
              {isArchivePanelOpen && (
                <button
                  type="button"
                  onClick={refreshArchives}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer text-slate-700"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingArchive ? 'animate-spin' : ''}`} />
                  Muat Ulang
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsArchivePanelOpen((p) => !p)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                {isArchivePanelOpen ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Tutup Arsip</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Lihat Arsip ({archivedExams.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isArchivePanelOpen && (
            <div className="p-5">
              {archivedExams.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  Belum ada paket ujian di arsip penghapusan (retensi 30 hari).
                </div>
              ) : (
                <div className="space-y-2.5">
                  {archivedExams.map((arc) => {
                    const isRestoring = restoringArchiveId === arc.id;
                    return (
                      <div
                        key={arc.id}
                        className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-900 text-amber-300 font-mono">
                              {arc.exam_data?.kode_paket || 'PAKET'}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {arc.exam_data?.judul_ujian || arc.judul_ujian || `Paket #${arc.exam_id}`}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2 font-mono">
                            <span>{arc.questions_data?.length || 0} Butir Soal</span>
                            <span>·</span>
                            <span>{arc.results_data?.length || 0} Riwayat Nilai</span>
                            <span>·</span>
                            <span>
                              Dihapus:{' '}
                              {arc.deletedAt
                                ? new Date(arc.deletedAt).toLocaleDateString('id-ID')
                                : '-'}
                            </span>
                            <span>·</span>
                            <span className="text-amber-800 font-semibold">
                              Kedaluwarsa TTL:{' '}
                              {arc.purgeAt
                                ? new Date(arc.purgeAt).toLocaleDateString('id-ID')
                                : '30 hari'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isRestoring}
                          onClick={() => handleRestoreArchivedExam(arc)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer shrink-0 shadow-2xs"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                          <span>{isRestoring ? 'Memulihkan...' : 'Pulihkan Paket'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminUjianTab;
