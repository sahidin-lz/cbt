import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ComposedChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  ClassAnalyticsItem,
  classifyQuestionCognitiveLevel,
  extractTingkatFromKelas,
} from '../utils/cbtLogic';
import { ExamItem, QuestionItem } from '../types/cbt';

interface ClassPerformanceLotsHotsChartProps {
  classAnalytics: {
    perClass: ClassAnalyticsItem[];
    overall: ClassAnalyticsItem;
  };
  questions: QuestionItem[];
  exams: ExamItem[];
  selectedClassFilter?: string;
  onSelectClass?: (kelas: string) => void;
}

interface ChartRowData {
  kelas: string;
  shortKelas: string;
  tingkat: string;
  lotsScore: number;
  hotsScore: number;
  averageScore: number;
  passRate: number;
  cognitiveGap: number;
  resultCount: number;
  totalStudents: number;
  isProjected: boolean;
}

export const ClassPerformanceLotsHotsChart: React.FC<
  ClassPerformanceLotsHotsChartProps
> = ({
  classAnalytics,
  questions,
  exams,
  selectedClassFilter = 'SEMUA',
  onSelectClass,
}) => {
  const [chartType, setChartType] = useState<'bar' | 'composed' | 'radar'>(
    'bar'
  );
  const [tingkatFilter, setTingkatFilter] = useState<
    'SEMUA' | '10' | '11' | '12'
  >('SEMUA');

  // Count how many classes and total students actually have submitted results
  const classesWithActualResults = useMemo(
    () => classAnalytics.perClass.filter((c) => c.resultCount > 0).length,
    [classAnalytics.perClass]
  );

  const totalActualResults = classAnalytics.overall.resultCount;

  // Question bank LOTS vs HOTS breakdown
  const questionBankStats = useMemo(() => {
    let lotsCount = 0;
    let hotsCount = 0;
    for (const q of questions) {
      if (classifyQuestionCognitiveLevel(q) === 'HOTS') {
        hotsCount++;
      } else {
        lotsCount++;
      }
    }
    const total = lotsCount + hotsCount;
    const lotsPct = total > 0 ? Math.round((lotsCount / total) * 100) : 0;
    const hotsPct = total > 0 ? Math.round((hotsCount / total) * 100) : 0;

    // Per-exam breakdown
    const perExam = exams.map((ex) => {
      const exQs = questions.filter((q) => q.exam_id === ex.id);
      const exLots = exQs.filter(
        (q) => classifyQuestionCognitiveLevel(q) === 'LOTS'
      ).length;
      const exHots = exQs.filter(
        (q) => classifyQuestionCognitiveLevel(q) === 'HOTS'
      ).length;
      return {
        examTitle:
          ex.judul_ujian.length > 22
            ? `${ex.judul_ujian.slice(0, 20)}…`
            : ex.judul_ujian,
        fullTitle: ex.judul_ujian,
        tingkat: ex.target_tingkat || 'SEMUA',
        lotsCount: exLots,
        hotsCount: exHots,
        totalQuestions: exQs.length,
      };
    });

    return {
      lotsCount,
      hotsCount,
      total,
      lotsPct,
      hotsPct,
      perExam,
    };
  }, [questions, exams]);

  // Build chart data rows strictly from real class results (0 when no student has taken the exam yet)
  const chartData: ChartRowData[] = useMemo(() => {
    const baseClasses = classAnalytics.perClass.filter((cls) => {
      if (tingkatFilter === 'SEMUA') return true;
      return cls.tingkat === tingkatFilter;
    });

    return baseClasses.map((cls) => ({
      kelas: cls.kelas,
      shortKelas: cls.shortKelas,
      tingkat: cls.tingkat === 'LAINNYA' ? 'Umum' : `Kelas ${cls.tingkat}`,
      lotsScore: cls.resultCount > 0 ? cls.lotsScore : 0,
      hotsScore: cls.resultCount > 0 ? cls.hotsScore : 0,
      averageScore: cls.resultCount > 0 ? cls.averageScore : 0,
      passRate: cls.resultCount > 0 ? cls.passRate : 0,
      cognitiveGap: cls.resultCount > 0 ? cls.cognitiveGap : 0,
      resultCount: cls.resultCount,
      totalStudents: cls.totalStudents,
      isProjected: false,
    }));
  }, [classAnalytics.perClass, tingkatFilter]);

  // Aggregate summary metrics strictly across classes with actual submitted results
  const summaryStats = useMemo(() => {
    const activeRows = chartData.filter((r) => r.resultCount > 0);

    if (activeRows.length === 0) {
      return {
        avgLots: 0,
        avgHots: 0,
        gap: 0,
        avgOverall: 0,
        avgPassRate: 0,
      };
    }

    const avgLots =
      Math.round(
        (activeRows.reduce((acc, r) => acc + r.lotsScore, 0) /
          activeRows.length) *
          10
      ) / 10;
    const avgHots =
      Math.round(
        (activeRows.reduce((acc, r) => acc + r.hotsScore, 0) /
          activeRows.length) *
          10
      ) / 10;
    const avgOverall =
      Math.round(
        (activeRows.reduce((acc, r) => acc + r.averageScore, 0) /
          activeRows.length) *
          10
      ) / 10;
    const avgPassRate = Math.round(
      activeRows.reduce((acc, r) => acc + r.passRate, 0) / activeRows.length
    );

    return {
      avgLots,
      avgHots,
      gap: Math.round((avgLots - avgHots) * 10) / 10,
      avgOverall,
      avgPassRate,
    };
  }, [chartData]);

  // Radar profile data for the 5 cognitive dimensions
  const radarData = useMemo(() => {
    return [
      {
        metric: 'LOTS (C1–C3)',
        skorSekolah: summaryStats.avgLots,
        targetKkm: 75,
      },
      {
        metric: 'HOTS (C4–C6)',
        skorSekolah: summaryStats.avgHots,
        targetKkm: 70,
      },
      {
        metric: 'Rata-Rata Nilai',
        skorSekolah: summaryStats.avgOverall,
        targetKkm: 72,
      },
      {
        metric: 'Ketuntasan (%)',
        skorSekolah: summaryStats.avgPassRate,
        targetKkm: 80,
      },
      {
        metric: 'Porsi Soal HOTS',
        skorSekolah: questionBankStats.hotsPct || 0,
        targetKkm: 50,
      },
    ];
  }, [summaryStats, questionBankStats.hotsPct]);

  return (
    <section
      aria-label="Visualisasi Performa Kelas LOTS vs HOTS"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Top Header & Controls */}
      <div className="flex flex-col gap-3.5 pb-4 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500">
            Analisis Kognitif Taksonomi Bloom · Grafik Interaktif Recharts
          </div>
          <h2 className="text-lg font-bold text-slate-900 mt-0.5">
            Visualisasi Performa Kelas: Komparasi LOTS vs HOTS
          </h2>
          <p className="text-xs text-slate-600 mt-0.5 max-w-4xl">
            Membandingkan capaian kemampuan berpikir tingkat rendah{' '}
            <strong>LOTS (Lower-Order Thinking Skills: C1–C3 / PG Biasa)</strong>{' '}
            terhadap kemampuan berpikir tingkat tinggi{' '}
            <strong>
              HOTS (Higher-Order Thinking Skills: C4–C6 / PG Kompleks &amp; Analisis Wacana)
            </strong>{' '}
            di setiap kelas.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Segmented Control: Jenis Grafik */}
          <div
            role="group"
            aria-label="Pilih Jenis Grafik"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            {(
              [
                ['bar', 'Grafik Batang (LOTS vs HOTS)'],
                ['composed', 'Tren Ketuntasan & Gap'],
                ['radar', 'Profil Radar & Bank Soal'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartType(mode)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  chartType === mode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Segmented Control: Filter Tingkatan */}
          <div
            role="group"
            aria-label="Filter Tingkatan Grafik"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            {(
              [
                ['SEMUA', 'Semua Tingkat'],
                ['10', 'Kelas X'],
                ['11', 'Kelas XI'],
                ['12', 'Kelas XII'],
              ] as const
            ).map(([tkt, label]) => (
              <button
                key={tkt}
                type="button"
                onClick={() => setTingkatFilter(tkt)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tingkatFilter === tkt
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Info Status Data Aktual */}
          <div className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-slate-50 border-slate-200 text-slate-700">
            Data Aktual: {totalActualResults} Siswa Selesai ({classesWithActualResults} Kelas)
          </div>
        </div>
      </div>

      {/* 4 Kartu Metrik Kognitif LOTS vs HOTS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs text-slate-500">
            Rata-Rata Capaian LOTS (C1–C3)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
            {totalActualResults > 0 ? summaryStats.avgLots : 0}
            <span className="text-xs font-normal text-slate-500">/100</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {totalActualResults > 0
              ? `Berdasarkan ${totalActualResults} hasil siswa · ${questionBankStats.lotsCount} soal LOTS`
              : `Belum ada siswa mengerjakan · ${questionBankStats.lotsCount} butir soal LOTS`}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs text-slate-500">
            Rata-Rata Capaian HOTS (C4–C6)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-teal-700 mt-1">
            {totalActualResults > 0 ? summaryStats.avgHots : 0}
            <span className="text-xs font-normal text-slate-500">/100</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {totalActualResults > 0
              ? `Berdasarkan ${totalActualResults} hasil siswa · ${questionBankStats.hotsCount} soal HOTS`
              : `Belum ada siswa mengerjakan · ${questionBankStats.hotsCount} butir soal HOTS`}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs text-slate-500">
            Selisih / Gap Kognitif (LOTS − HOTS)
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {totalActualResults > 0
              ? summaryStats.gap > 0
                ? `+${summaryStats.gap}`
                : summaryStats.gap
              : 0}
            <span className="text-xs font-normal text-slate-500"> poin</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {totalActualResults === 0
              ? 'Masih kosong (menunggu siswa menyelesaikan ujian)'
              : Math.abs(summaryStats.gap) <= 10
                ? 'Proporsi penalaran LOTS & HOTS seimbang'
                : 'Perlu penguatan latihan soal analisis wacana (HOTS)'}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-xs text-slate-500">
            Distribusi Kognitif Bank Soal ({questionBankStats.total} Soal)
          </div>
          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-1.5">
            LOTS: {questionBankStats.lotsCount} ({questionBankStats.lotsPct}%) · HOTS:{' '}
            {questionBankStats.hotsCount} ({questionBankStats.hotsPct}%)
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Target KKM: 70/100 · Ketuntasan Aktual: {summaryStats.avgPassRate}%
          </div>
        </div>
      </div>

      {/* Empty State Notice when 0 students have completed the exam */}
      {totalActualResults === 0 && (
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            <strong>Status Data Kelas Masih Kosong (0 Siswa Selesai):</strong>{' '}
            Belum ada siswa yang mengumpulkan ujian. Grafik capaian LOTS vs HOTS
            di setiap kelas bernilai <strong>0</strong> dan akan terisi otomatis
            begitu siswa menyelesaikan ujian.
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            Hasil Ujian Masuk: 0 Peserta
          </span>
        </div>
      )}

      {/* Main Recharts Canvas */}
      {chartType === 'bar' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Perbandingan Skor <strong>LOTS (Biru)</strong> vs{' '}
              <strong>HOTS (Teal)</strong> vs <strong>Rata-Rata Kelas (Abu)</strong>{' '}
              per Rombel (Skala 0–100, Garis KKM = 70)
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {classesWithActualResults > 0
                ? `${classesWithActualResults} kelas memiliki hasil ujian masuk`
                : 'Belum ada hasil ujian masuk (Semua Kelas: 0)'}
            </span>
          </div>

          <div className="h-[360px] w-full min-w-0 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 20, left: 0, bottom: 24 }}
                onClick={(state) => {
                  if (
                    state &&
                    state.activeLabel &&
                    onSelectClass
                  ) {
                    const matched = chartData.find(
                      (c) =>
                        c.shortKelas === state.activeLabel ||
                        c.kelas === state.activeLabel
                    );
                    if (matched) {
                      onSelectClass(matched.kelas);
                    }
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="shortKelas"
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                  interval={0}
                  angle={chartData.length > 5 ? -12 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                  height={50}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                  unit=""
                />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#0F172A',
                  }}
                  formatter={(value: any, name: any, props: any) => {
                    const count = props?.payload?.resultCount || 0;
                    const suffix =
                      count > 0
                        ? ` (${count} siswa selesai)`
                        : ' (Belum ada siswa mengerjakan)';
                    return [`${value}/100${suffix}`, name];
                  }}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as
                      | ChartRowData
                      | undefined;
                    if (!row) return String(label);
                    return `${row.kelas} (${row.tingkat}) · ${row.resultCount}/${row.totalStudents} Siswa Selesai`;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <ReferenceLine
                  y={70}
                  stroke="#DC2626"
                  strokeDasharray="4 4"
                  label={{
                    value: 'KKM (70)',
                    position: 'insideTopRight',
                    fill: '#DC2626',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Bar
                  dataKey="lotsScore"
                  name="Skor LOTS (C1–C3)"
                  fill="#2563EB"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                />
                <Bar
                  dataKey="hotsScore"
                  name="Skor HOTS (C4–C6)"
                  fill="#0D9488"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                />
                <Bar
                  dataKey="averageScore"
                  name="Rata-Rata Skor Akhir"
                  fill="#64748B"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {chartType === 'composed' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Komparasi Batang <strong>LOTS vs HOTS</strong> dengan Garis{' '}
              <strong>Tingkat Ketuntasan Kelas (%)</strong> serta Selisih Kognitif
            </span>
          </div>

          <div className="h-[360px] w-full min-w-0 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: 20, left: 0, bottom: 24 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="shortKelas"
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                  interval={0}
                  angle={chartData.length > 5 ? -12 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                  height={50}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                />
                <ReferenceLine y={70} stroke="#DC2626" strokeDasharray="4 4" />
                <Bar
                  dataKey="lotsScore"
                  name="Skor LOTS (C1–C3)"
                  fill="#2563EB"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                />
                <Bar
                  dataKey="hotsScore"
                  name="Skor HOTS (C4–C6)"
                  fill="#0D9488"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  name="Ketuntasan Kelas (%)"
                  stroke="#16A34A"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#16A34A' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {chartType === 'radar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800">
              Profil Keseimbangan Kognitif Sekolah vs Standar KKM
            </h3>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  data={radarData}
                >
                  <PolarGrid stroke="#CBD5E1" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: '#64748B', fontSize: 10 }}
                  />
                  <Radar
                    name="Capaian Kognitif Kelas"
                    dataKey="skorSekolah"
                    stroke="#2563EB"
                    fill="#2563EB"
                    fillOpacity={0.35}
                  />
                  <Radar
                    name="Standar Target KKM"
                    dataKey="targetKkm"
                    stroke="#0D9488"
                    fill="#0D9488"
                    fillOpacity={0.15}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800">
              Sebaran Butir Soal LOTS vs HOTS per Paket Ujian
            </h3>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    questionBankStats.perExam.length > 0
                      ? questionBankStats.perExam
                      : [
                          {
                            examTitle: 'Bank Soal Aktif',
                            fullTitle: 'Bank Soal Aktif',
                            tingkat: 'SEMUA',
                            lotsCount: questionBankStats.lotsCount,
                            hotsCount: questionBankStats.hotsCount,
                            totalQuestions: questionBankStats.total,
                          },
                        ]
                  }
                  margin={{ top: 12, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis
                    dataKey="examTitle"
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#475569', fontSize: 11 }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="lotsCount"
                    name="Jumlah Soal LOTS (C1–C3)"
                    fill="#2563EB"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                  <Bar
                    dataKey="hotsCount"
                    name="Jumlah Soal HOTS (C4–C6)"
                    fill="#0D9488"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Footer Rincian Kognitif Cepat per Kelas */}
      <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            <strong>Keterangan:</strong> Klik batang kelas pada grafik untuk
            menyaring tabel rincian nilai kelas di bawah.
          </span>
          {selectedClassFilter !== 'SEMUA' && onSelectClass && (
            <button
              type="button"
              onClick={() => onSelectClass('SEMUA')}
              className="text-blue-700 hover:text-blue-800 font-semibold underline cursor-pointer"
            >
              Reset Filter Kelas ({selectedClassFilter})
            </button>
          )}
        </div>
        <div className="font-mono text-[11px] text-slate-500">
          LOTS = PG Faktual/Konseptual · HOTS = PG Kompleks &amp; Analisis Wacana
        </div>
      </div>
    </section>
  );
};
