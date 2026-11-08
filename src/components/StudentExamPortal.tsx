import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  ShieldAlert,
  BookOpen,
  Award,
  RotateCcw,
} from 'lucide-react';
import { ExamItem, QuestionItem, StudentItem, AnalisisAI } from '../types/cbt';
import { calculateExamScore } from '../utils/cbtLogic';

interface StudentExamPortalProps {
  exams: ExamItem[];
  onExamCompleted: () => void;
}

export const StudentExamPortal: React.FC<StudentExamPortalProps> = ({
  exams,
  onExamCompleted,
}) => {
  const [namaInput, setNamaInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active Exam Session State
  const [activeStudent, setActiveStudent] = useState<StudentItem | null>(null);
  const [activeExam, setActiveExam] = useState<ExamItem | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuestionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  // Anti-cheat tab switch detection
  const [tabViolations, setTabViolations] = useState(0);
  const [showCheatBanner, setShowCheatBanner] = useState(false);
  const [lastViolationTime, setLastViolationTime] = useState<string | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<{
    resultId: number;
    skor: number;
    kategori: string;
    rawEarned: number;
    rawMax: number;
    aiResult: AnalisisAI | null;
  } | null>(null);
  const [isGeneratingStudentAi, setIsGeneratingStudentAi] = useState(false);

  useEffect(() => {
    if (exams.length > 0 && !selectedExamId) {
      setSelectedExamId(String(exams[0].id));
    }
  }, [exams, selectedExamId]);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!namaInput.trim()) {
      setLoginError('Silakan masukkan Nama Lengkap Siswa terlebih dahulu.');
      return;
    }
    if (!tokenInput.trim() || tokenInput.trim().length !== 6) {
      setLoginError('Token Ujian harus terdiri dari 6 karakter alfanumerik.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/exam/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: namaInput.trim(),
          token_ujian: tokenInput.toUpperCase().trim(),
          examId: selectedExamId ? Number(selectedExamId) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Gagal memulai sesi ujian.');
        return;
      }

      setActiveStudent(data.student);
      setActiveExam(data.exam);
      setExamQuestions(data.questions || []);
      setRemainingSeconds((data.exam?.durasi_menit || 60) * 60);
      setCurrentIndex(0);
      setAnswers({});
      setTabViolations(0);
      setSubmittedSummary(null);
    } catch (err: any) {
      setLoginError(err.message || 'Terjadi kesalahan koneksi ke server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const triggerViolation = useCallback(() => {
    if (!activeStudent || submittedSummary) return;
    setTabViolations((prev) => prev + 1);
    setShowCheatBanner(true);
    setLastViolationTime(new Date().toLocaleTimeString('id-ID'));
  }, [activeStudent, submittedSummary]);

  // Basic Anti-Cheat: Detect window blur and visibilitychange
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const handleBlur = () => {
      triggerViolation();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerViolation();
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeStudent, submittedSummary, triggerViolation]);

  const handleSubmitExam = useCallback(async () => {
    if (!activeStudent || !activeExam || isSubmitting) return;
    setIsSubmitting(true);
    setConfirmSubmitModal(false);

    try {
      const res = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: activeStudent.id,
          examId: activeExam.id,
          jawabanSiswa: answers,
          pelanggaranTab: tabViolations,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setSubmittedSummary({
          resultId: data.result.id,
          skor: data.scoreSummary.normalizedScore,
          kategori: data.scoreSummary.kategoriNilai,
          rawEarned: data.scoreSummary.rawEarned,
          rawMax: data.scoreSummary.rawMax,
          aiResult: null,
        });
        onExamCompleted();
      } else {
        const localSummary = calculateExamScore(examQuestions, answers);
        setSubmittedSummary({
          resultId: 0,
          skor: localSummary.normalizedScore,
          kategori: localSummary.kategoriNilai,
          rawEarned: localSummary.rawEarned,
          rawMax: localSummary.rawMax,
          aiResult: null,
        });
      }
    } catch {
      const localSummary = calculateExamScore(examQuestions, answers);
      setSubmittedSummary({
        resultId: 0,
        skor: localSummary.normalizedScore,
        kategori: localSummary.kategoriNilai,
        rawEarned: localSummary.rawEarned,
        rawMax: localSummary.rawMax,
        aiResult: null,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeStudent,
    activeExam,
    answers,
    tabViolations,
    isSubmitting,
    examQuestions,
    onExamCompleted,
  ]);

  // Countdown Timer Effect
  useEffect(() => {
    if (!activeStudent || submittedSummary) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeStudent, submittedSummary, handleSubmitExam]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  };

  // Option selection handler for PG Biasa (Radio) and PG Kompleks (Checkbox)
  const handleSelectOption = (
    questionId: number,
    optionKey: string,
    tipeSoal: string
  ) => {
    const qKey = String(questionId);
    const isKompleks = tipeSoal.toLowerCase().includes('kompleks');

    setAnswers((prev) => {
      const currentSelected = prev[qKey] || [];
      if (!isKompleks) {
        return { ...prev, [qKey]: [optionKey] };
      } else {
        const exists = currentSelected.includes(optionKey);
        const nextSelected = exists
          ? currentSelected.filter((k) => k !== optionKey)
          : [...currentSelected, optionKey].sort();
        return { ...prev, [qKey]: nextSelected };
      }
    });
  };

  const handleRequestInstantAiEvaluation = async () => {
    if (!activeStudent || !submittedSummary) return;
    setIsGeneratingStudentAi(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId: submittedSummary.resultId || undefined,
          nama_siswa: activeStudent.nama,
          questions: examQuestions,
          jawaban_siswa: answers,
        }),
      });
      const aiData = await res.json();
      if (res.ok) {
        setSubmittedSummary((prev) =>
          prev ? { ...prev, aiResult: aiData } : null
        );
        onExamCompleted();
      }
    } catch (error) {
      console.error('Error requesting AI evaluation:', error);
    } finally {
      setIsGeneratingStudentAi(false);
    }
  };

  // 1. RENDER COMPLETED EXAM SUMMARY SCREEN
  if (activeStudent && submittedSummary) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <p className="text-xs font-medium text-emerald-700">
                Ujian Telah Diselesaikan · Token {activeStudent.token_ujian}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                Hasil Ujian: {activeStudent.nama}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Kelas {activeStudent.kelas} · {activeExam?.judul_ujian}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-500">Skor Akhir CBT</div>
              <div className="text-4xl font-bold font-mono tabular-nums text-blue-700">
                {submittedSummary.skor}
                <span className="text-lg text-slate-400 font-normal">/100</span>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {submittedSummary.kategori} · Poin Mentah {submittedSummary.rawEarned}/
                {submittedSummary.rawMax}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-sm text-slate-700">
              <span>Soal Dijawab: </span>
              <strong className="font-mono tabular-nums">
                {Object.keys(answers).filter((k) => answers[k]?.length > 0).length} /{' '}
                {examQuestions.length}
              </strong>
              <span className="mx-2 text-slate-300">·</span>
              <span>Log Pindah Tab (Anti-Cheat): </span>
              <strong className="font-mono tabular-nums text-amber-700">
                {tabViolations} kali
              </strong>
            </div>

            <div className="flex items-center gap-3">
              {!submittedSummary.aiResult && (
                <button
                  type="button"
                  onClick={handleRequestInstantAiEvaluation}
                  disabled={isGeneratingStudentAi}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isGeneratingStudentAi
                    ? 'Menganalisis Kognitif (Gemini AI)...'
                    : 'Generate AI Analysis Sekarang'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveStudent(null);
                  setSubmittedSummary(null);
                  setNamaInput('');
                  setTokenInput('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Kembali ke Login Siswa
              </button>
            </div>
          </div>

          {submittedSummary.aiResult && (
            <div className="mt-6 border border-slate-200 rounded-xl p-6 bg-slate-50/60 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">
                    Hasil Evaluasi AI Evaluator (LOTS vs HOTS)
                  </h2>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500">
                  Evaluasi Kognitif HOTS
                </h3>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                  {submittedSummary.aiResult.evaluasi_hots}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-emerald-700">
                    Kekuatan Kompetensi
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                    {submittedSummary.aiResult.analisis_kompetensi.kekuatan.map(
                      (item, i) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-amber-700">
                    Area Penguatan (Kelemahan)
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-700 list-disc list-inside">
                    {submittedSummary.aiResult.analisis_kompetensi.kelemahan.map(
                      (item, i) => (
                        <li key={i}>{item}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-700">
                  3 Rekomendasi Belajar Terarah
                </h4>
                <ol className="mt-2 space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
                  {submittedSummary.aiResult.rekomendasi_belajar.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. RENDER DEDICATED STUDENT LOGIN SCREEN (CLEAN, SEPARATED FROM TEACHER, NO DUMMY TOKENS)
  if (!activeStudent) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="text-xs font-medium text-blue-700">
              Halaman Login Peserta Ujian CBT
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1.5 tracking-tight">
              Masuk Ruang Ujian Siswa
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Masukkan Nama Siswa dan 6 karakter Token Ujian unik Anda. Sistem
              otomatis memuat paket soal sesuai tingkatan kelas Anda (Kelas X,
              XI, atau XII).
            </p>
          </div>

          <form onSubmit={handleStartExam} className="space-y-5">

            <div>
              <label
                htmlFor="student-name-input"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Nama Siswa
              </label>
              <input
                id="student-name-input"
                type="text"
                value={namaInput}
                onChange={(e) => setNamaInput(e.target.value)}
                placeholder="Masukkan Nama Lengkap Anda"
                className="w-full px-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor="student-token-input"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Token Ujian (6 Karakter Alfanumerik)
              </label>
              <input
                id="student-token-input"
                type="text"
                maxLength={6}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                placeholder="Masukkan 6 Karakter Token"
                className="w-full px-4 py-2.5 text-base font-mono tracking-widest uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            {loginError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              {isLoggingIn ? 'Memverifikasi Token...' : 'Mulai Ujian Sekarang'}
            </button>
          </form>

          <div className="pt-5 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>Dukungan Soal: PG Biasa & PG Kompleks</span>
            <span>Proteksi Anti-Cheat Pindah Tab Aktif</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. RENDER ACTIVE EXAM INTERFACE
  const currentQuestion = examQuestions[currentIndex];
  const currentQId = currentQuestion ? String(currentQuestion.id) : '';
  const selectedOptions = answers[currentQId] || [];
  const isKompleks =
    currentQuestion?.tipe_soal.toLowerCase().includes('kompleks') || false;
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] && answers[k].length > 0
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 space-y-4">
      {/* Top Exam Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            Peserta: <strong className="text-slate-800">{activeStudent.nama}</strong> ·{' '}
            <span>Kelas {activeStudent.kelas}</span> · Token{' '}
            <span className="font-mono font-semibold text-blue-700">
              {activeStudent.token_ujian}
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-0.5">
            {activeExam?.judul_ujian}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
            <ShieldAlert
              className={`w-4 h-4 ${
                tabViolations > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            />
            <span>
              Peringatan Tab:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {tabViolations}
              </strong>
            </span>
          </div>

          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono tabular-nums text-base font-bold ${
              remainingSeconds < 300
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-slate-900 border-slate-900 text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span aria-label="Sisa Waktu Ujian">{formatTimer(remainingSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Anti-Cheat Alert Banner when student switches tab / blurs window */}
      {showCheatBanner && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                Peringatan Integritas Ujian (Anti-Cheat Terdeteksi)
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                Sistem mendeteksi Anda berpindah tab atau keluar dari jendela ujian
                pada pukul{' '}
                <span className="font-mono font-semibold">{lastViolationTime}</span>.
                Total pelanggaran tercatat:{' '}
                <strong className="font-mono">{tabViolations} kali</strong> dan
                dilaporkan ke Dashboard Guru.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCheatBanner(false)}
            className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-200/70 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Saya Mengerti & Lanjutkan
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      {currentQuestion ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Stage */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-blue-700">
                  SOAL NO. {currentIndex + 1} / {examQuestions.length}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-xs font-medium text-slate-600">
                  {isKompleks
                    ? 'Pilihan Ganda Kompleks (Pilih >1 Jawaban Benar · Bobot Maks 3 Poin)'
                    : 'Pilihan Ganda Biasa (1 Jawaban Benar · Bobot 2 Poin)'}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Kode: {currentQuestion.data_opsi?.id_soal_csv || `Q-${currentQuestion.id}`}
              </span>
            </div>

            {currentQuestion.data_opsi?.wacana && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Wacana / Stimulus Soal</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {currentQuestion.data_opsi.wacana}
                </p>
              </div>
            )}

            <div className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed">
              {currentQuestion.teks_soal}
            </div>

            <div className="space-y-3 pt-1">
              {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                const optText = currentQuestion.data_opsi?.opsi?.[optKey];
                if (!optText) return null;
                const isSelected = selectedOptions.includes(optKey);

                return (
                  <label
                    key={optKey}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-600 text-slate-900'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <input
                      type={isKompleks ? 'checkbox' : 'radio'}
                      name={`question-${currentQuestion.id}`}
                      value={optKey}
                      checked={isSelected}
                      onChange={() =>
                        handleSelectOption(
                          currentQuestion.id,
                          optKey,
                          currentQuestion.tipe_soal
                        )
                      }
                      className="mt-1 h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <div className="flex-1 text-sm leading-relaxed">
                      <span className="font-mono font-bold text-slate-900 mr-2">
                        {optKey}.
                      </span>
                      <span>{optText}</span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-6 border-t border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Soal Sebelumnya
              </button>

              {currentIndex < examQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(examQuestions.length - 1, prev + 1)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Soal Selanjutnya
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSubmitModal(true)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Selesaikan & Kumpulkan Ujian
                </button>
              )}
            </div>
          </div>

          {/* Right Question Navigation Matrix */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Navigasi Nomor Soal
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Terjawab:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {answeredCount} / {examQuestions.length}
                </strong>{' '}
                butir soal
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2.5">
              {examQuestions.map((q, idx) => {
                const qAns = answers[String(q.id)] || [];
                const isAnswered = qAns.length > 0;
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Pilih Soal Nomor ${idx + 1}`}
                    className={`h-11 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors flex flex-col items-center justify-center cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'
                        : isAnswered
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isAnswered && (
                      <span className="text-[10px] font-normal truncate max-w-[36px]">
                        {qAns.join(',')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>Biru Solid:</span>
                <span className="font-medium text-slate-900">Soal Sedang Dibuka</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Hijau Muda:</span>
                <span className="font-medium text-emerald-700">Sudah Dijawab</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Abu-abu:</span>
                <span className="font-medium text-slate-500">Belum Dijawab</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmSubmitModal(true)}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Kumpulkan Jawaban Sekarang
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirmation Dialog before Final Submit */}
      {confirmSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Konfirmasi Pengumpulan Ujian
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Anda telah menjawab{' '}
              <strong className="font-mono text-slate-900">
                {answeredCount} dari {examQuestions.length}
              </strong>{' '}
              soal. Apakah Anda yakin ingin mengakhiri ujian dan mengirim jawaban?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
              >
                {isSubmitting ? 'Mengirim Jawaban...' : 'Ya, Kumpulkan Jawaban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
