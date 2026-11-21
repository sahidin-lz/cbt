import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Award,
  Download,
  Sparkles,
  BarChart3,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  extractTingkatFromKelas,
  getEffectiveMataPelajaran,
  getEffectiveExamSessionToken,
  isExamMatchedForStudentClass,
} from '../../utils/cbtLogic';
import { resolveStudentPrecisionRecord } from '../../utils/cbtPdfGenerator';
import { useAdminDashboard } from '../../context/AdminDashboardContext';

export const AdminProfilKelasTab: React.FC = () => {
  const {
    exams,
    questions,
    students,
    results,
    uniqueClasses,
    availableMataPelajaran,
    classAnalyticsData,
    handleDownloadClassStudentsExcel,
    kkmConfig,
    updateKkmConfig,
    getKkmForKelas,
  } = useAdminDashboard();

  const [selectedClass, setSelectedClass] = useState<string>(
    uniqueClasses.length > 0 ? uniqueClasses[0] : ''
  );
  const [selectedMapelFilter, setSelectedMapelFilter] = useState<string>('SEMUA');
  const [copiedTokenExamId, setCopiedTokenExamId] = useState<number | null>(null);

  // Sync selectedClass automatically when uniqueClasses finishes loading from Firestore
  useEffect(() => {
    if (uniqueClasses.length === 0) return;
    const stillExists = uniqueClasses.some(
      (c) => c.trim().toLowerCase() === selectedClass.trim().toLowerCase()
    );
    if (!selectedClass || !stillExists) {
      setSelectedClass(uniqueClasses[0]);
    }
  }, [uniqueClasses, selectedClass]);

  const effectiveClass = selectedClass || uniqueClasses[0] || '';
  const classKkm = getKkmForKelas(effectiveClass);
  const classTingkat = extractTingkatFromKelas(effectiveClass);

  // Students belonging to selected class
  const classStudents = useMemo(() => {
    if (!effectiveClass) return [];
    return students.filter(
      (s) => s.kelas.trim().toLowerCase() === effectiveClass.trim().toLowerCase()
    );
  }, [students, effectiveClass]);

  // Exams assigned to or matched for this class
  const classMatchedExams = useMemo(() => {
    if (!effectiveClass) return [];
    return exams.filter((ex) => {
      const matchMapel =
        selectedMapelFilter === 'SEMUA' ||
        getEffectiveMataPelajaran(ex).toUpperCase() ===
          selectedMapelFilter.toUpperCase();
      const matchClass = isExamMatchedForStudentClass(ex, effectiveClass);
      return matchMapel && matchClass;
    });
  }, [exams, effectiveClass, selectedMapelFilter]);

  // Results for students in this class
  const classStudentIds = useMemo(
    () => new Set(classStudents.map((s) => s.id)),
    [classStudents]
  );
  const classResults = useMemo(() => {
    return results.filter((r) => classStudentIds.has(r.student_id));
  }, [results, classStudentIds]);

  // Analytics summary for this specific class (synced with dynamic KKM)
  const classSummaryStats = useMemo(() => {
    const found = classAnalyticsData.perClass.find(
      (c) => c.kelas.trim().toLowerCase() === effectiveClass.trim().toLowerCase()
    );
    return (
      found || {
        kelas: effectiveClass,
        tingkat: classTingkat,
        totalStudents: classStudents.length,
        resultCount: classResults.length,
        averageScore: 0,
        lotsScore: 0,
        hotsScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passCount: 0,
        passRate: 0,
        gradeDistribution: { A: 0, B: 0, C: 0, D: 0 },
        analyzedCount: 0,
      }
    );
  }, [
    classAnalyticsData,
    effectiveClass,
    classTingkat,
    classStudents.length,
    classResults.length,
  ]);

  // Dynamic KKM-aligned score distribution ranges for Recharts
  const scoreDistributionData = useMemo(() => {
    const lowCut = Math.max(40, Math.min(55, classKkm - 15));
    const highCut = Math.max(classKkm + 10, 85);
    let rangeD = 0;
    let rangeC = 0;
    let rangeB = 0;
    let rangeA = 0;

    classStudents.forEach((st) => {
      const rec = resolveStudentPrecisionRecord({
        student: st,
        allStudents: students,
        exams,
        questions,
        results,
      });
      if (rec.score !== null) {
        const sc = rec.score;
        if (sc < lowCut) rangeD++;
        else if (sc < classKkm) rangeC++;
        else if (sc < highCut) rangeB++;
        else rangeA++;
      }
    });

    return [
      { range: `0–${lowCut - 1} (D)`, jumlah: rangeD, color: '#ef4444' },
      { range: `${lowCut}–${classKkm - 1} (C)`, jumlah: rangeC, color: '#f59e0b' },
      { range: `${classKkm}–${highCut - 1} (B)`, jumlah: rangeB, color: '#3b82f6' },
      { range: `${highCut}–100 (A)`, jumlah: rangeA, color: '#10b981' },
    ];
  }, [classStudents, students, exams, questions, results, classKkm]);

  // All classes average score comparison data for Recharts
  const classComparisonData = useMemo(() => {
    return classAnalyticsData.perClass.map((item) => ({
      kelas: item.kelas,
      rataRata: item.averageScore,
      tuntas: item.passRate,
      kkm: getKkmForKelas(item.kelas),
      isCurrent:
        item.kelas.trim().toLowerCase() === effectiveClass.trim().toLowerCase(),
    }));
  }, [classAnalyticsData, effectiveClass, getKkmForKelas]);

  const handleCopySessionToken = (examId: number, tokenStr: string) => {
    try {
      navigator.clipboard.writeText(tokenStr);
      setCopiedTokenExamId(examId);
      setTimeout(() => setCopiedTokenExamId(null), 1800);
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header & Class Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-extrabold text-teal-700 uppercase tracking-wider">
              <Users className="w-4 h-4" />
              <span>05. Profil Kelas, Pengaturan KKM Jenjang &amp; Visualisasi Nilai</span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Profil Rombel Kelas: {effectiveClass || 'Belum Ada Kelas'} ({classStudents.length} Peserta Didik)
            </h2>
            <p className="text-xs text-slate-600">
              Lihat paket ujian yang dilaksanakan kelas ini, token sesi ujian, token login masing-masing siswa, standar KKM jenjang (Saat ini KKM: <strong>{classKkm}</strong>), dan grafik distribusi nilai otomatis.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {effectiveClass && (
              <button
                type="button"
                onClick={() => handleDownloadClassStudentsExcel(effectiveClass)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-2xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Ekspor Rekap Kelas (.xls)</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Pilih Rombel / Kelas
            </label>
            <select
              value={effectiveClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3.5 py-2 text-xs font-extrabold bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            >
              {uniqueClasses.length === 0 ? (
                <option value="">Belum ada kelas terdaftar</option>
              ) : (
                uniqueClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    Kelas {cls} (KKM {getKkmForKelas(cls)})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Filter Mata Pelajaran
            </label>
            <select
              value={selectedMapelFilter}
              onChange={(e) => setSelectedMapelFilter(e.target.value)}
              className="px-3.5 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
            >
              <option value="SEMUA">Semua Mata Pelajaran</option>
              {availableMataPelajaran.map((m) => (
                <option key={m} value={m}>
                  Mapel: {m}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-950">
              KKM Aktif Tingkat {classTingkat === 'LAINNYA' ? 'Umum' : classTingkat}:{' '}
              <strong className="font-mono text-amber-800">{classKkm}</strong>
            </span>
          </div>
        </div>

        {/* Class KPI Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80">
            <div className="text-[10px] font-bold text-blue-800 uppercase">Rata-Rata Kelas</div>
            <div className="text-2xl font-extrabold font-mono text-blue-950 mt-1">
              {classSummaryStats.averageScore}
              <span className="text-xs font-sans text-slate-500 font-semibold"> /100</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">
              Ketuntasan (KKM &ge; {classKkm})
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-950 mt-1">
              {classSummaryStats.passCount} Siswa{' '}
              <span className="text-xs font-sans text-emerald-700 font-bold">
                ({classSummaryStats.passRate}%)
              </span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80">
            <div className="text-[10px] font-bold text-amber-800 uppercase">
              Nilai Tertinggi / Terendah
            </div>
            <div className="text-lg font-extrabold font-mono text-amber-950 mt-1">
              {classSummaryStats.highestScore}{' '}
              <span className="text-slate-400">/</span> {classSummaryStats.lowestScore}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200/80">
            <div className="text-[10px] font-bold text-purple-800 uppercase">
              Peserta Selesai Ujian
            </div>
            <div className="text-2xl font-extrabold font-mono text-purple-950 mt-1">
              {classSummaryStats.resultCount}{' '}
              <span className="text-xs font-sans text-slate-500 font-semibold">
                / {classStudents.length} siswa
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pengaturan KKM per Jenjang / Tingkatan */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Pengaturan KKM (Kriteria Ketuntasan Minimal) per Jenjang Kelas</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Setiap jenjang kelas dapat memiliki batas KKM berbeda. Perubahan otomatis memperbarui status Tuntas/Belum Tuntas pada Profil Kelas, Grafik, dan Ekspor Laporan (0 kuota Firestore).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ['10', 'Kelas X / Tingkat 1 (Fase E)'],
            ['11', 'Kelas XI / Tingkat 2 (Fase F)'],
            ['12', 'Kelas XII / Tingkat 3 (Fase F Lanjutan)'],
          ].map(([tingkatKey, label]) => {
            const currentVal =
              typeof kkmConfig === 'object' && kkmConfig !== null
                ? (kkmConfig[tingkatKey] ?? kkmConfig['DEFAULT'] ?? 70)
                : 70;
            const isCurrentTier = classTingkat === tingkatKey;
            return (
              <div
                key={tingkatKey}
                className={`p-4 rounded-xl border space-y-2 transition-colors ${
                  isCurrentTier
                    ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-200'
                    : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800">{label}</div>
                  {isCurrentTier && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 text-[9px] font-extrabold uppercase">
                      Jenjang Aktif
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentVal}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      updateKkmConfig(tingkatKey, v);
                    }}
                    className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 font-semibold">Skor (0–100)</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Siswa dengan nilai &ge; <strong>{currentVal}</strong> dinyatakan Tuntas.
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* RECHARTS DATA VISUALIZATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Distribusi Rentang Nilai Siswa di Kelas Ini */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>Distribusi Rentang Nilai Kelas {effectiveClass}</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold">
              Batas KKM: {classKkm}
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={scoreDistributionData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(val: any) => [`${val} Siswa`, 'Jumlah']}
                />
                <Bar dataKey="jumlah" radius={[6, 6, 0, 0]}>
                  {scoreDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Komparasi Rata-Rata Nilai Antar Kelas */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              <span>Komparasi Rata-Rata Nilai Antar Kelas</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold">
              Garis KKM: {classKkm}
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={classComparisonData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="kelas"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={30}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(val: any, name: any) => [
                    name === 'rataRata' ? `${val} / 100` : `${val}%`,
                    name === 'rataRata' ? 'Rata-Rata Skor' : 'Tingkat Ketuntasan',
                  ]}
                />
                <ReferenceLine
                  y={classKkm}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: `KKM ${classKkm}`,
                    position: 'right',
                    fill: '#b45309',
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="rataRata" radius={[6, 6, 0, 0]}>
                  {classComparisonData.map((entry, index) => (
                    <Cell
                      key={`comp-cell-${index}`}
                      fill={entry.isCurrent ? '#2563eb' : '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Daftar Ujian & Token Sesi pada Kelas Ini */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <span>
              Paket Ujian &amp; Token Sesi untuk Kelas {effectiveClass} ({classMatchedExams.length} Ujian)
            </span>
          </h3>
        </div>

        {classMatchedExams.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Belum ada paket ujian yang dijadwalkan khusus untuk kelas {effectiveClass}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classMatchedExams.map((ex) => {
              const effectiveToken = getEffectiveExamSessionToken(ex);
              return (
                <div
                  key={ex.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-bold">
                          {ex.kode_paket || 'PAKET-A'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                          {getEffectiveMataPelajaran(ex)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ex.status_ujian === 'AKTIF'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {ex.status_ujian || 'DRAF'}
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-slate-900">{ex.judul_ujian}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Durasi: {ex.durasi_menit} Menit · Kategori: {ex.kategori_ujian || 'PH'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                    <span className="text-slate-600 font-medium">Token Sesi Ujian:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded bg-slate-900 text-amber-300 font-mono font-extrabold tracking-wider">
                        {effectiveToken}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopySessionToken(ex.id, effectiveToken)}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                        title="Salin Token Sesi Ujian"
                      >
                        {copiedTokenExamId === ex.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabel Token Login Siswa & Nilai Akhir Kelas Ini */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900">
            Daftar Token Login Akun &amp; Hasil Nilai Siswa Kelas {effectiveClass}
          </h3>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
            KKM Kelas Ini: &ge; {classKkm}
          </span>
        </div>

        {classStudents.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Tidak ada siswa terdaftar di kelas {effectiveClass}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 uppercase tracking-wider text-[10px]">
                  <th className="p-3">No</th>
                  <th className="p-3">Absen &amp; Ganjil/Genap</th>
                  <th className="p-3">Nama Siswa &amp; NISN</th>
                  <th className="p-3">Token Login Akun</th>
                  <th className="p-3">Paket Soal</th>
                  <th className="p-3">Status Ujian</th>
                  <th className="p-3">Nilai Akhir (0–100)</th>
                  <th className="p-3">Predikat &amp; Ketuntasan (KKM {classKkm})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.map((st, idx) => {
                  const rec = resolveStudentPrecisionRecord({
                    student: st,
                    allStudents: students,
                    exams,
                    questions,
                    results,
                  });
                  const isTuntas = rec.score !== null && rec.score >= classKkm;
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
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
                      <td className="p-3 font-mono font-bold text-blue-700">
                        {st.password_login || st.token_ujian || '-'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-[10px] font-bold">
                          {rec.kodePaket || st.kode_soal || 'PAKET-A'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] ${
                            st.status_ujian === 'Selesai'
                              ? 'bg-emerald-100 text-emerald-900'
                              : st.status_ujian === 'Sedang Ujian'
                                ? 'bg-blue-100 text-blue-900'
                                : st.status_ujian === 'Diblokir'
                                  ? 'bg-red-100 text-red-900'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {st.status_ujian}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-extrabold text-slate-900">
                        {rec.score !== null ? `${rec.score}` : '-'}
                      </td>
                      <td className="p-3">
                        {rec.score !== null ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800">{rec.predikatLabel}</span>
                            <div
                              className={`text-[10px] font-bold ${
                                isTuntas ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {isTuntas
                                ? `Tuntas (≥ ${classKkm})`
                                : `Belum Tuntas (< ${classKkm})`}
                            </div>
                          </div>
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
        )}
      </div>
    </div>
  );
};

export default AdminProfilKelasTab;
