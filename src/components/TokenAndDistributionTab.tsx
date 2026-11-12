import React, { useState, useMemo } from 'react';
import {
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Layers,
  Shuffle,
  Users,
  BookOpen,
  Play,
  Lock,
  Save,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem } from '../types/cbt';
import {
  DAFTAR_MATA_PELAJARAN_SMA,
  extractTingkatFromKelas,
  generateExamToken,
  getEffectiveExamSessionToken,
  getEffectiveMataPelajaran,
  getStudentAbsenInfoInClass,
  getStudentLoginClasses,
  isExamMatchedForStudentClass,
  resolveStudentExamPackagesBySubject,
} from '../utils/cbtLogic';
import {
  saveExamCbt,
  toggleExamStatusCbt,
  updateExamSessionTokenCbt,
  batchAssignPackageVariantsCbt,
} from '../lib/cbtFirestoreService';

interface TokenAndDistributionTabProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  onRefreshData: () => Promise<void>;
}

export const TokenAndDistributionTab: React.FC<TokenAndDistributionTabProps> = ({
  exams,
  questions,
  students,
  onRefreshData,
}) => {
  // Filter states for Token Ujian section
  const [filterMapel, setFilterMapel] = useState<string>('SEMUA');
  const [filterTingkat, setFilterTingkat] = useState<string>('SEMUA');
  const [customTokenInputs, setCustomTokenInputs] = useState<Record<number, string>>({});
  const [updatingTokenExamId, setUpdatingTokenExamId] = useState<number | null>(null);
  const [isBatchRandomizingTokens, setIsBatchRandomizingTokens] = useState(false);
  const [copiedExamId, setCopiedExamId] = useState<number | null>(null);
  const [tokenFeedback, setTokenFeedback] = useState<string | null>(null);

  // Distribution Editor State for selected Exam Package
  const [selectedDistExamId, setSelectedDistExamId] = useState<number>(() =>
    exams.length > 0 ? exams[0].id : 0
  );
  const selectedDistExam = useMemo(
    () => exams.find((e) => Number(e.id) === Number(selectedDistExamId)) || exams[0] || null,
    [exams, selectedDistExamId]
  );

  const [distMapel, setDistMapel] = useState<string>(
    () => getEffectiveMataPelajaran(exams[0])
  );
  const [customMapelInput, setCustomMapelInput] = useState<string>('');
  const [distKodePaket, setDistKodePaket] = useState<string>(
    () => exams[0]?.kode_paket || 'PAKET-A'
  );
  const [distMode, setDistMode] = useState<string>(
    () => exams[0]?.distribusi_paket_mode || 'OTOMATIS_GANJIL_GENAP'
  );
  const [distTargetTingkat, setDistTargetTingkat] = useState<string>(
    () => exams[0]?.target_tingkat || '10'
  );
  const [distTargetRombel, setDistTargetRombel] = useState<string[]>(
    () => exams[0]?.target_rombel || []
  );
  const [distTargetSiswaIds, setDistTargetSiswaIds] = useState<number[]>(
    () => exams[0]?.target_siswa_ids || []
  );
  const [distFilterClassForManual, setDistFilterClassForManual] = useState<string>('SEMUA');
  const [isSavingDist, setIsSavingDist] = useState(false);
  const [distFeedback, setDistFeedback] = useState<string | null>(null);

  // Live Preview Class & Subject State
  const classOptions = useMemo(() => getStudentLoginClasses(students), [students]);
  const [previewKelas, setPreviewKelas] = useState<string>(() =>
    classOptions.length > 0 ? classOptions[0].kelas : ''
  );
  const [isSyncingClassPackages, setIsSyncingClassPackages] = useState(false);

  // Sync editor fields when teacher picks a different exam in the distribution editor
  const handleSelectDistExam = (examId: number) => {
    setSelectedDistExamId(examId);
    const found = exams.find((e) => Number(e.id) === Number(examId));
    if (found) {
      const mapel = getEffectiveMataPelajaran(found);
      if (DAFTAR_MATA_PELAJARAN_SMA.includes(mapel as any)) {
        setDistMapel(mapel);
        setCustomMapelInput('');
      } else {
        setDistMapel('LAINNYA');
        setCustomMapelInput(mapel);
      }
      setDistKodePaket(found.kode_paket || 'PAKET-A');
      setDistMode(found.distribusi_paket_mode || 'OTOMATIS_GANJIL_GENAP');
      setDistTargetTingkat(found.target_tingkat || '10');
      setDistTargetRombel(Array.isArray(found.target_rombel) ? found.target_rombel : []);
      setDistTargetSiswaIds(Array.isArray(found.target_siswa_ids) ? found.target_siswa_ids : []);
      setDistFeedback(null);
    }
  };

  // All distinct subjects present across exams
  const availableSubjects = useMemo(() => {
    const set = new Set<string>(['Sosiologi']);
    exams.forEach((ex) => {
      set.add(getEffectiveMataPelajaran(ex));
    });
    return Array.from(set);
  }, [exams]);

  const filteredTokenExams = useMemo(() => {
    return exams.filter((ex) => {
      const mapel = getEffectiveMataPelajaran(ex);
      if (filterMapel !== 'SEMUA' && mapel.toUpperCase() !== filterMapel.toUpperCase()) {
        return false;
      }
      if (filterTingkat !== 'SEMUA' && ex.target_tingkat !== filterTingkat) {
        return false;
      }
      return true;
    });
  }, [exams, filterMapel, filterTingkat]);

  const handleRandomizeSingleToken = async (exam: ExamItem) => {
    setUpdatingTokenExamId(exam.id);
    setTokenFeedback(null);
    try {
      const newToken = generateExamToken();
      await updateExamSessionTokenCbt(exam, newToken);
      setCustomTokenInputs((prev) => ({ ...prev, [exam.id]: newToken }));
      await onRefreshData();
      setTokenFeedback(
        `Token Sesi Ujian untuk "${exam.judul_ujian}" (${getEffectiveMataPelajaran(exam)}) berhasil diperbarui menjadi: ${newToken}`
      );
    } finally {
      setUpdatingTokenExamId(null);
    }
  };

  const handleSaveCustomToken = async (exam: ExamItem) => {
    const raw = (customTokenInputs[exam.id] ?? exam.token_sesi ?? '').trim().toUpperCase();
    if (raw.length < 4) {
      setTokenFeedback('Token Sesi Ujian minimal terdiri dari 4 karakter (contoh: SOS10A).');
      return;
    }
    setUpdatingTokenExamId(exam.id);
    setTokenFeedback(null);
    try {
      await updateExamSessionTokenCbt(exam, raw);
      await onRefreshData();
      setTokenFeedback(
        `Token Sesi Ujian untuk "${exam.judul_ujian}" berhasil disimpan menjadi: ${raw}`
      );
    } finally {
      setUpdatingTokenExamId(null);
    }
  };

  const handleBatchRandomizeAllActiveTokens = async () => {
    const targets = filteredTokenExams.length > 0 ? filteredTokenExams : exams;
    if (targets.length === 0) return;
    setIsBatchRandomizingTokens(true);
    setTokenFeedback(null);
    try {
      for (const ex of targets) {
        const nextTok = generateExamToken();
        await updateExamSessionTokenCbt(ex, nextTok);
      }
      await onRefreshData();
      setTokenFeedback(
        `Berhasil mengacak ulang Token Sesi Ujian untuk ${targets.length} paket ujian sekaligus.`
      );
    } finally {
      setIsBatchRandomizingTokens(false);
    }
  };

  const handleCopyToken = (examId: number, tokenStr: string) => {
    try {
      navigator.clipboard.writeText(tokenStr);
      setCopiedExamId(examId);
      setTimeout(() => setCopiedExamId(null), 2000);
    } catch {}
  };

  const handleSaveDistributionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDistExam) return;
    setIsSavingDist(true);
    setDistFeedback(null);
    try {
      const finalMapel =
        distMapel === 'LAINNYA'
          ? customMapelInput.trim() || 'Mata Pelajaran Umum'
          : distMapel.trim() || 'Sosiologi';

      await saveExamCbt(
        {
          judul_ujian: selectedDistExam.judul_ujian,
          durasi_menit: selectedDistExam.durasi_menit,
          target_tingkat: distTargetTingkat,
          target_kelas:
            distTargetRombel.length === 1 ? distTargetRombel[0] : 'SEMUA',
          kategori_ujian: selectedDistExam.kategori_ujian,
          status_ujian: selectedDistExam.status_ujian || 'AKTIF',
          target_rombel: distTargetRombel,
          acak_soal: selectedDistExam.acak_soal,
          acak_opsi: selectedDistExam.acak_opsi,
          kode_paket: distKodePaket.trim().toUpperCase() || 'PAKET-A',
          mode_multi_paket:
            distMode === 'OTOMATIS_GANJIL_GENAP'
              ? true
              : Boolean(selectedDistExam.mode_multi_paket),
          jumlah_paket: selectedDistExam.jumlah_paket || 2,
          token_sesi:
            selectedDistExam.token_sesi ||
            getEffectiveExamSessionToken(selectedDistExam),
          tampilkan_nilai: selectedDistExam.tampilkan_nilai !== false,
          pengumuman: selectedDistExam.pengumuman || '',
          mata_pelajaran: finalMapel,
          distribusi_paket_mode: distMode,
          target_siswa_ids:
            distMode === 'MANUAL_SISWA' ? distTargetSiswaIds : [],
        },
        selectedDistExam.id
      );

      await onRefreshData();
      setDistFeedback(
        `Pengaturan distribusi paket "${selectedDistExam.judul_ujian}" (Mapel: ${finalMapel}, Kode: ${distKodePaket}, Mode: ${distMode}) berhasil disimpan!`
      );
    } catch (err: any) {
      setDistFeedback(err?.message || 'Gagal menyimpan distribusi paket ujian.');
    } finally {
      setIsSavingDist(false);
    }
  };

  // Eligible students for the selected exam's grade/rombel (used in MANUAL_SISWA picker)
  const eligibleStudentsForDistExam = useMemo(() => {
    return students
      .filter((st) => {
        if (
          distFilterClassForManual !== 'SEMUA' &&
          st.kelas.trim().toUpperCase() !== distFilterClassForManual.toUpperCase()
        ) {
          return false;
        }
        if (distTargetRombel.length > 0) {
          return distTargetRombel.some(
            (r) => r.trim().toUpperCase() === st.kelas.trim().toUpperCase()
          );
        }
        if (distTargetTingkat !== 'SEMUA') {
          return extractTingkatFromKelas(st.kelas) === distTargetTingkat;
        }
        return true;
      })
      .sort((a, b) => {
        const c = a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
        if (c !== 0) return c;
        return a.nama.localeCompare(b.nama, 'id');
      });
  }, [students, distTargetTingkat, distTargetRombel, distFilterClassForManual]);

  const handleSelectParityStudents = (parity: 'GANJIL' | 'GENAP' | 'SEMUA' | 'RESET') => {
    if (parity === 'RESET') {
      setDistTargetSiswaIds([]);
      return;
    }
    if (parity === 'SEMUA') {
      setDistTargetSiswaIds(eligibleStudentsForDistExam.map((s) => Number(s.id)));
      return;
    }
    const matchedIds: number[] = [];
    for (const st of eligibleStudentsForDistExam) {
      const info = getStudentAbsenInfoInClass(st, students);
      if (parity === 'GANJIL' && info.isGanjil) matchedIds.push(Number(st.id));
      if (parity === 'GENAP' && !info.isGanjil) matchedIds.push(Number(st.id));
    }
    setDistTargetSiswaIds(matchedIds);
  };

  // Students in the selected preview class with their resolved packages per subject
  const previewClassStudents = useMemo(() => {
    const activeKls = previewKelas || (classOptions[0]?.kelas ?? '');
    if (!activeKls) return [];
    const list = students
      .filter((s) => s.kelas.trim().toLowerCase() === activeKls.trim().toLowerCase())
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

    return list.map((st, idx) => {
      const noAbsen = idx + 1;
      const isGanjil = noAbsen % 2 === 1;
      const subjectAllocations = resolveStudentExamPackagesBySubject({
        student: st,
        allStudents: students,
        exams,
        questions,
        requireActive: false,
      });
      return {
        student: st,
        noAbsen,
        isGanjil,
        ganjilGenapLabel: isGanjil ? 'GANJIL' : 'GENAP',
        subjectAllocations,
      };
    });
  }, [previewKelas, classOptions, students, exams, questions]);

  const handleSyncPreviewClassToStudentDatabase = async () => {
    if (previewClassStudents.length === 0) return;
    setIsSyncingClassPackages(true);
    setDistFeedback(null);
    try {
      const updatedList: StudentItem[] = previewClassStudents.map((row) => {
        const primaryAlloc = row.subjectAllocations[0];
        const code =
          primaryAlloc?.assignedPackageCode ||
          (row.isGanjil ? 'PAKET-A' : 'PAKET-B');
        const letter = primaryAlloc?.variantLetter || (row.isGanjil ? 'A' : 'B');
        return {
          ...row.student,
          kode_soal: code,
          variasi_paket: letter,
        };
      });
      await batchAssignPackageVariantsCbt(updatedList);
      await onRefreshData();
      setDistFeedback(
        `Berhasil menyinkronkan distribusi Ganjil-Genap / Paket Soal ke database ${updatedList.length} siswa di kelas ${previewKelas || classOptions[0]?.kelas}!`
      );
    } finally {
      setIsSyncingClassPackages(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* BAGIAN 1: MENU KHUSUS TOMBOL TOKEN SESI UJIAN (SEMUA MAPEL & PAKET)    */}
      {/* ===================================================================== */}
      <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 px-6 py-5 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Menu Khusus Token Sesi Ujian &amp; Multi-Mapel</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Pusat Kendali Token Ujian (Diberikan Guru Setiap Akan Ujian)
            </h2>
            <p className="text-xs text-blue-200 max-w-3xl leading-relaxed">
              Di menu ini Bapak/Ibu Guru dapat melihat, menyalin, mengubah manual, atau mengacak ulang{' '}
              <strong>Token Sesi Ujian</strong> untuk setiap Mata Pelajaran dan Paket Soal tanpa perlu mencari di menu lain.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleBatchRandomizeAllActiveTokens}
              disabled={isBatchRandomizingTokens || exams.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw
                className={`w-4 h-4 ${isBatchRandomizingTokens ? 'animate-spin' : ''}`}
              />
              <span>
                {isBatchRandomizingTokens
                  ? 'Mengacak Semua Token...'
                  : 'Acak Ulang Semua Token Ujian'}
              </span>
            </button>
          </div>
        </div>

        {/* Filter Bar Mata Pelajaran & Tingkatan */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>Filter Mata Pelajaran:</span>
            </span>
            <button
              type="button"
              onClick={() => setFilterMapel('SEMUA')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                filterMapel === 'SEMUA'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50'
              }`}
            >
              Semua Mapel ({exams.length})
            </button>
            {availableSubjects.map((subj) => (
              <button
                key={subj}
                type="button"
                onClick={() => setFilterMapel(subj)}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  filterMapel.toUpperCase() === subj.toUpperCase()
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(['SEMUA', '10', '11', '12'] as const).map((tkt) => (
              <button
                key={tkt}
                type="button"
                onClick={() => setFilterTingkat(tkt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  filterTingkat === tkt
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tkt === 'SEMUA' ? 'Semua Tingkat' : `Kelas ${tkt}`}
              </button>
            ))}
          </div>
        </div>

        {tokenFeedback && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{tokenFeedback}</span>
            </span>
            <button
              type="button"
              onClick={() => setTokenFeedback(null)}
              className="text-emerald-700 hover:underline text-[11px] cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Daftar Kartu Token Sesi Ujian */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTokenExams.map((ex) => {
            const currentToken = getEffectiveExamSessionToken(ex);
            const mapelName = getEffectiveMataPelajaran(ex);
            const isAktif = (ex.status_ujian || 'AKTIF') === 'AKTIF';
            const qCount = questions.filter((q) => Number(q.exam_id) === Number(ex.id)).length;
            const distModeLabel =
              ex.distribusi_paket_mode === 'KHUSUS_GANJIL'
                ? 'Khusus Absen Ganjil'
                : ex.distribusi_paket_mode === 'KHUSUS_GENAP'
                  ? 'Khusus Absen Genap'
                  : ex.distribusi_paket_mode === 'MANUAL_SISWA'
                    ? `Siswa Terpilih (${ex.target_siswa_ids?.length || 0} Siswa)`
                    : 'Otomatis Ganjil-Genap / Proporsional Kelas';

            return (
              <div
                key={ex.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                  isAktif
                    ? 'bg-gradient-to-br from-white via-indigo-50/30 to-blue-50/40 border-indigo-200 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 opacity-90'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-600 text-white">
                        Mapel: {mapelName}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                        {ex.kode_paket || 'PAKET-A'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800">
                        {ex.target_tingkat === 'SEMUA'
                          ? 'Semua Tingkat'
                          : `Kelas ${ex.target_tingkat}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        await toggleExamStatusCbt(ex, isAktif ? 'DRAF' : 'AKTIF');
                        await onRefreshData();
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer transition-colors ${
                        isAktif
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                      }`}
                    >
                      {isAktif ? (
                        <>
                          <Play className="w-3 h-3" />
                          <span>SESI AKTIF (Klik untuk Draf)</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>DRAF (Klik untuk Aktifkan)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <h3 className="text-base font-extrabold text-slate-900">
                    {ex.judul_ujian}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>
                      Soal: <strong>{qCount} Butir</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Durasi: <strong>{ex.durasi_menit} Menit</strong>
                    </span>
                    <span>·</span>
                    <span className="text-indigo-700 font-semibold">
                      Distribusi: {distModeLabel}
                    </span>
                  </div>
                </div>

                {/* Big Prominent Session Token Box */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      Token Sesi Ujian Aktif (Umumkan ke Siswa)
                    </div>
                    <div className="text-2xl font-mono font-extrabold tracking-widest text-white mt-0.5">
                      {currentToken}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyToken(ex.id, currentToken)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                    >
                      {copiedExamId === ex.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={updatingTokenExamId === ex.id}
                      onClick={() => handleRandomizeSingleToken(ex)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          updatingTokenExamId === ex.id ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Acak Token Baru</span>
                    </button>
                  </div>
                </div>

                {/* Manual Token Input Row */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    maxLength={12}
                    value={customTokenInputs[ex.id] ?? ''}
                    onChange={(e) =>
                      setCustomTokenInputs((prev) => ({
                        ...prev,
                        [ex.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                      }))
                    }
                    placeholder={`Ketik token kustom (saat ini: ${currentToken})`}
                    className="flex-1 px-3 py-1.5 text-xs font-mono font-bold uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <button
                    type="button"
                    disabled={
                      updatingTokenExamId === ex.id ||
                      !(customTokenInputs[ex.id] || '').trim()
                    }
                    onClick={() => handleSaveCustomToken(ex)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer"
                  >
                    Set Token Manual
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BAGIAN 2: PENGATURAN DISTRIBUSI PAKET SOAL MULTI-MAPEL & GANJIL-GENAP */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="space-y-1 border-b border-slate-200 pb-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
              <Shuffle className="w-3.5 h-3.5" />
              <span>Atur Distribusi Paket Soal &amp; Mata Pelajaran</span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900">
              Distribusikan Paket Soal ke Kelas / Ganjil-Genap / Siswa
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pilih paket ujian di bawah untuk mengatur <strong>Mata Pelajaran</strong> dan{' '}
              <strong>Siapa yang Menerima Paket Soal Ini</strong> (Otomatis Ganjil-Genap per Kelas, Khusus Absen Ganjil, Khusus Absen Genap, atau Pilih Siswa Tertentu).
            </p>
          </div>

          {exams.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              Belum ada Paket Ujian. Silakan buat Paket Ujian terlebih dahulu di menu Distribusi Ujian.
            </div>
          ) : (
            <form onSubmit={handleSaveDistributionSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  1. Pilih Paket Ujian yang Akan Diatur Distribusinya
                </label>
                <select
                  value={selectedDistExam?.id || ''}
                  onChange={(e) => handleSelectDistExam(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      [{getEffectiveMataPelajaran(ex)} · {ex.kode_paket || 'PAKET-A'}] {ex.judul_ujian} (Kelas {ex.target_tingkat})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    2. Mata Pelajaran Ujian
                  </label>
                  <select
                    value={distMapel}
                    onChange={(e) => setDistMapel(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {DAFTAR_MATA_PELAJARAN_SMA.map((mp) => (
                      <option key={mp} value={mp}>
                        {mp}
                      </option>
                    ))}
                    <option value="LAINNYA">+ Ketik Mata Pelajaran Lainnya...</option>
                  </select>
                  {distMapel === 'LAINNYA' && (
                    <input
                      type="text"
                      value={customMapelInput}
                      onChange={(e) => setCustomMapelInput(e.target.value)}
                      placeholder="Ketik nama Mata Pelajaran..."
                      className="mt-1.5 w-full px-3 py-1.5 text-xs border border-indigo-300 rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    3. Kode Paket Soal
                  </label>
                  <input
                    type="text"
                    value={distKodePaket}
                    onChange={(e) => setDistKodePaket(e.target.value.toUpperCase())}
                    placeholder="Contoh: PAKET-A / PAKET-B"
                    className="w-full px-3 py-2 text-xs font-mono font-extrabold uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
              </div>

              {/* Mode Pembagian Paket ke Siswa */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  4. Aturan Pembagian Paket Soal ke Siswa
                </label>

                <div className="space-y-2">
                  {[
                    {
                      id: 'OTOMATIS_GANJIL_GENAP',
                      title: 'Otomatis Ganjil-Genap / Proporsional per Kelas (Rekomendasi)',
                      desc: 'Jika ada 2 paket soal pada Mapel yang sama, otomatis Absen Ganjil (1, 3, 5...) mendapat Paket 1 (A) dan Absen Genap (2, 4, 6...) mendapat Paket 2 (B) di setiap kelas.',
                    },
                    {
                      id: 'KHUSUS_GANJIL',
                      title: 'Khusus Siswa Nomor Absen GANJIL (1, 3, 5, 7...)',
                      desc: 'Paket soal ini dikunci khusus hanya untuk siswa bernomor urut absen GANJIL di setiap kelas.',
                    },
                    {
                      id: 'KHUSUS_GENAP',
                      title: 'Khusus Siswa Nomor Absen GENAP (2, 4, 6, 8...)',
                      desc: 'Paket soal ini dikunci khusus hanya untuk siswa bernomor urut absen GENAP di setiap kelas.',
                    },
                    {
                      id: 'MANUAL_SISWA',
                      title: 'Pilih Daftar Siswa Tertentu Secara Spesifik',
                      desc: 'Pilih / centang langsung nama-nama siswa yang ditugaskan mengerjakan paket soal ini.',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        distMode === opt.id
                          ? 'bg-indigo-50/80 border-indigo-400 text-indigo-950 ring-1 ring-indigo-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="distMode"
                        value={opt.id}
                        checked={distMode === opt.id}
                        onChange={() => setDistMode(opt.id)}
                        className="mt-0.5 text-indigo-600"
                      />
                      <div>
                        <div className="font-extrabold">{opt.title}</div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Pemilih Siswa Manual jika mode MANUAL_SISWA */}
              {distMode === 'MANUAL_SISWA' && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Pilih Siswa Penerima Paket ({distTargetSiswaIds.length} Terpilih)
                    </span>
                    <select
                      value={distFilterClassForManual}
                      onChange={(e) => setDistFilterClassForManual(e.target.value)}
                      className="px-2 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded-md"
                    >
                      <option value="SEMUA">Semua Kelas Target</option>
                      {classOptions.map((c) => (
                        <option key={c.kelas} value={c.kelas}>
                          {c.kelas}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectParityStudents('GANJIL')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-800 hover:bg-indigo-200 cursor-pointer"
                    >
                      Pilih Semua Absen Ganjil
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectParityStudents('GENAP')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer"
                    >
                      Pilih Semua Absen Genap
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectParityStudents('SEMUA')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                    >
                      Pilih Semua ({eligibleStudentsForDistExam.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectParityStudents('RESET')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                    {eligibleStudentsForDistExam.map((st) => {
                      const abs = getStudentAbsenInfoInClass(st, students);
                      const checked = distTargetSiswaIds.includes(Number(st.id));
                      return (
                        <label
                          key={st.id}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-indigo-50/50 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setDistTargetSiswaIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== Number(st.id))
                                    : [...prev, Number(st.id)]
                                );
                              }}
                              className="rounded text-indigo-600"
                            />
                            <span className="font-mono text-[11px] font-bold text-slate-500">
                              #{abs.noAbsen}
                            </span>
                            <span className="font-semibold text-slate-800 truncate">
                              {st.nama}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-500">{st.kelas}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                abs.isGanjil
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {abs.ganjilGenapLabel}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingDist}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSavingDist
                    ? 'Menyimpan Distribusi...'
                    : 'Simpan Pengaturan Mapel & Distribusi Paket'}
                </span>
              </button>

              {distFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
                  {distFeedback}
                </div>
              )}
            </form>
          )}
        </div>

        {/* =================================================================== */}
        {/* BAGIAN 3: SIMULASI & PEMETAAN LANGSUNG GANJIL-GENAP PER KELAS       */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Peta Pembagian Paket Soal Siswa Per Kelas (Ganjil-Genap &amp; Multi-Mapel)</span>
              </div>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                Daftar Penerima Paket Soal Berdasarkan Nomor Urut Absen Kelas
              </h3>
            </div>

            <button
              type="button"
              onClick={handleSyncPreviewClassToStudentDatabase}
              disabled={isSyncingClassPackages || previewClassStudents.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>
                {isSyncingClassPackages
                  ? 'Menyinkronkan...'
                  : 'Terapkan Kode Paket ke Kelas Ini'}
              </span>
            </button>
          </div>

          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700">
                Pilih Kelas / Rombel:
              </label>
              <select
                value={previewKelas || (classOptions[0]?.kelas ?? '')}
                onChange={(e) => setPreviewKelas(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                {classOptions.map((c) => (
                  <option key={c.kelas} value={c.kelas}>
                    {c.kelas} ({c.studentCount} Siswa)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                Absen Ganjil (1, 3, 5...) → Paket 1 (A)
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                Absen Genap (2, 4, 6...) → Paket 2 (B)
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                <tr className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-4">No. Absen</th>
                  <th className="py-2.5 px-4">Nama Siswa</th>
                  <th className="py-2.5 px-4">Ganjil / Genap</th>
                  <th className="py-2.5 px-4">Paket Soal per Mata Pelajaran yang Diterima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {previewClassStudents.map((row) => (
                  <tr key={row.student.id} className="hover:bg-blue-50/40">
                    <td className="py-2.5 px-4 font-mono font-extrabold text-slate-800">
                      #{row.noAbsen}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-900">{row.student.nama}</div>
                      <div className="text-[11px] text-slate-500">
                        Kelas {row.student.kelas} · Token Login:{' '}
                        <span className="font-mono font-semibold text-blue-700">
                          {row.student.password_login || row.student.token_ujian}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold font-mono ${
                          row.isGanjil
                            ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        ABSEN {row.ganjilGenapLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {row.subjectAllocations.length === 0 ? (
                        <span className="text-slate-400 italic">
                          Belum ada paket ujian untuk kelas ini
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.subjectAllocations.map((alloc) => (
                            <div
                              key={`${row.student.id}_${alloc.mataPelajaran}`}
                              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-1.5"
                            >
                              <BookOpen className="w-3 h-3 text-indigo-600 shrink-0" />
                              <span className="font-bold text-slate-800">
                                {alloc.mataPelajaran}:
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-extrabold">
                                {alloc.assignedPackageCode}
                              </span>
                              <span className="text-[11px] text-slate-600 truncate max-w-[160px]">
                                ({alloc.assignedExam.judul_ujian})
                              </span>
                              <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                Token: {getEffectiveExamSessionToken(alloc.assignedExam)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
