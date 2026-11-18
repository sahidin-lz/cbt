import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Play,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Image as ImageIcon,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { ExamItem, QuestionItem } from '../../types/cbt';
import { getEffectiveExamSessionToken, getEffectiveMataPelajaran } from '../../utils/cbtLogic';
import { MathAndTableRenderer } from '../MathAndTableRenderer';

interface ExamDryRunModalProps {
  exam: ExamItem | null;
  questions: QuestionItem[];
  onClose: () => void;
}

interface ImageValidationItem {
  questionIndex: number;
  questionId: number;
  srcLabel: string;
  status: 'loading' | 'ok' | 'error';
}

function extractImageSources(text: string): string[] {
  const sources: string[] = [];
  if (!text) return sources;
  const tokenRegex = /\[IMG:([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match[1]) sources.push(match[1].trim());
  }
  const htmlImgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((match = htmlImgRegex.exec(text)) !== null) {
    if (match[1]) sources.push(match[1].trim());
  }
  return sources;
}

export const ExamDryRunModal: React.FC<ExamDryRunModalProps> = ({
  exam,
  questions,
  onClose,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [simAnswers, setSimAnswers] = useState<Record<string, string[]>>({});
  const [tokenCheckInput, setTokenCheckInput] = useState('');
  const [tokenVerified, setTokenVerified] = useState(false);
  const [imageChecks, setImageChecks] = useState<ImageValidationItem[]>([]);

  const activeQuestions = useMemo(() => {
    if (!exam) return [];
    return questions
      .filter((q) => Number(q.exam_id) === Number(exam.id) && !q.is_archived_version)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [exam, questions]);

  const effectiveToken = exam ? getEffectiveExamSessionToken(exam) : '';

  useEffect(() => {
    if (!exam) return;
    setCurrentIdx(0);
    setSimAnswers({});
    setTokenCheckInput(effectiveToken);
    setTokenVerified(false);

    const foundItems: Array<{ qIdx: number; qId: number; src: string }> = [];
    activeQuestions.forEach((q, idx) => {
      const combined = [
        q.data_opsi?.wacana || '',
        q.teks_soal || '',
        q.data_opsi?.opsi?.A || '',
        q.data_opsi?.opsi?.B || '',
        q.data_opsi?.opsi?.C || '',
        q.data_opsi?.opsi?.D || '',
        q.data_opsi?.opsi?.E || '',
      ].join(' ');
      extractImageSources(combined).forEach((src) => {
        foundItems.push({ qIdx: idx + 1, qId: q.id, src });
      });
    });

    if (foundItems.length === 0) {
      setImageChecks([]);
      return;
    }

    setImageChecks(
      foundItems.map((it) => ({
        questionIndex: it.qIdx,
        questionId: it.qId,
        srcLabel: it.src.slice(0, 60),
        status: 'loading',
      }))
    );

    let cancelled = false;
    foundItems.forEach((it, checkIndex) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImageChecks((prev) =>
          prev.map((row, idx) =>
            idx === checkIndex ? { ...row, status: 'ok' } : row
          )
        );
      };
      img.onerror = () => {
        if (cancelled) return;
        setImageChecks((prev) =>
          prev.map((row, idx) =>
            idx === checkIndex ? { ...row, status: 'error' } : row
          )
        );
      };
      img.src = it.src;
    });

    return () => {
      cancelled = true;
    };
  }, [exam, activeQuestions, effectiveToken]);

  const diagnosticWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (activeQuestions.length === 0) {
      warnings.push('Belum ada butir soal aktif di paket ujian ini.');
    }
    activeQuestions.forEach((q, idx) => {
      if (!q.teks_soal || !q.teks_soal.trim()) {
        warnings.push(`Soal #${idx + 1} memiliki teks pertanyaan kosong.`);
      }
      if (!q.data_opsi?.opsi?.A?.trim() || !q.data_opsi?.opsi?.B?.trim()) {
        warnings.push(`Soal #${idx + 1} opsi jawaban A atau B masih kosong.`);
      }
      if (!Array.isArray(q.kunci_jawaban) || q.kunci_jawaban.length === 0) {
        warnings.push(`Soal #${idx + 1} belum memiliki kunci jawaban.`);
      }
    });
    return warnings;
  }, [activeQuestions]);

  if (!exam) return null;

  const currentQuestion = activeQuestions[currentIdx] || null;
  const hasRichStimulus = Boolean(
    (currentQuestion?.data_opsi?.wacana &&
      (currentQuestion.data_opsi.wacana.trim().length > 120 ||
        /<table/i.test(currentQuestion.data_opsi.wacana) ||
        /<img/i.test(currentQuestion.data_opsi.wacana) ||
        /\[IMG:/i.test(currentQuestion.data_opsi.wacana))) ||
      (currentQuestion?.teks_soal &&
        (/<table/i.test(currentQuestion.teks_soal) ||
          /\[IMG:/i.test(currentQuestion.teks_soal)))
  );

  const okImageCount = imageChecks.filter((c) => c.status === 'ok').length;
  const errorImageCount = imageChecks.filter((c) => c.status === 'error').length;
  const isKompleks =
    currentQuestion?.tipe_soal === 'Kompleks' ||
    (currentQuestion?.kunci_jawaban?.length || 0) > 1;
  const selectedOpts = currentQuestion
    ? simAnswers[String(currentQuestion.id)] || []
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulasi Uji Coba Ujian Pra-Publikasi"
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-extrabold uppercase tracking-wider">
                Dry-Run · Simulasi Pra-Publikasi
              </span>
              <span className="font-mono text-cyan-200 font-bold">
                {getEffectiveMataPelajaran(exam)} · {exam.kode_paket || 'PAKET-A'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white mt-1">
              Coba Ujian: {exam.judul_ujian}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Tutup Simulasi</span>
          </button>
        </div>

        {/* Diagnostic Validation Strip */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs shrink-0">
          {/* Check 1: Token Validation */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                <span>Verifikasi Token Sesi</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Token aktif: <code className="font-mono font-bold text-indigo-800">{effectiveToken}</code>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="text"
                value={tokenCheckInput}
                onChange={(e) => {
                  setTokenCheckInput(e.target.value.toUpperCase());
                  setTokenVerified(false);
                }}
                className="w-20 px-2 py-1 text-[11px] font-mono font-bold uppercase border border-slate-300 rounded"
              />
              <button
                type="button"
                onClick={() =>
                  setTokenVerified(
                    tokenCheckInput.trim().toUpperCase() ===
                      effectiveToken.trim().toUpperCase()
                  )
                }
                className="px-2 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded cursor-pointer"
              >
                Tes
              </button>
            </div>
          </div>

          {/* Check 2: Images Validation */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Status Aset Gambar</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {imageChecks.length === 0
                  ? 'Tidak ada media gambar eksternal/inline'
                  : `${okImageCount}/${imageChecks.length} gambar termuat${
                      errorImageCount > 0 ? ` · ${errorImageCount} gagal` : ''
                    }`}
              </div>
            </div>
            {errorImageCount > 0 ? (
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                Periksa Gambar
              </span>
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
          </div>

          {/* Check 3: Question Structure */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Validasi Struktur Soal</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                {activeQuestions.length} butir siap ·{' '}
                {diagnosticWarnings.length === 0
                  ? 'Semua valid'
                  : `${diagnosticWarnings.length} catatan`}
              </div>
            </div>
            {diagnosticWarnings.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
          </div>
        </div>

        {(tokenVerified || diagnosticWarnings.length > 0) && (
          <div className="px-5 pt-3 space-y-2 shrink-0">
            {tokenVerified && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Token Sesi "{effectiveToken}" cocok & siap digunakan siswa!</span>
              </div>
            )}
            {diagnosticWarnings.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong className="block mb-0.5">Catatan Validasi Pra-Publikasi:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {diagnosticWarnings.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Interactive Exam Preview Body (Split-Screen when rich stimulus) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!currentQuestion ? (
            <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
              Belum ada butir soal pada paket ini untuk disimulasikan.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-extrabold font-mono">
                    SIMULASI SOAL #{currentIdx + 1} / {activeQuestions.length}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                    {isKompleks ? 'PG Kompleks' : 'PG Biasa'}
                  </span>
                  {hasRichStimulus && (
                    <span className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold">
                      Layout Split-Screen Aktif (Stimulus Kiri · Soal Kanan)
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Mode Simulasi — Tidak Menyimpan ke Database Nilai
                </div>
              </div>

              <div
                className={
                  hasRichStimulus
                    ? 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
                    : 'space-y-4'
                }
              >
                {currentQuestion.data_opsi?.wacana && (
                  <div
                    className={
                      hasRichStimulus
                        ? 'lg:col-span-6 lg:sticky lg:top-0 max-h-[55vh] overflow-y-auto bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-amber-50/30 border border-indigo-200/80 rounded-xl p-4 space-y-2'
                        : 'bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-amber-50/30 border border-indigo-200/80 rounded-xl p-4 space-y-2'
                    }
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-800">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>Wacana &amp; Stimulus Soal</span>
                    </div>
                    <div className="text-sm text-slate-800 leading-relaxed">
                      <MathAndTableRenderer content={currentQuestion.data_opsi.wacana} />
                    </div>
                  </div>
                )}

                <div className={hasRichStimulus ? 'lg:col-span-6 space-y-4' : 'space-y-4'}>
                  <div className="text-base font-bold text-slate-900 leading-relaxed">
                    <MathAndTableRenderer content={currentQuestion.teks_soal} />
                  </div>

                  <div className="space-y-2.5">
                    {(['A', 'B', 'C', 'D', 'E'] as const).map((optKey) => {
                      const optText = currentQuestion.data_opsi?.opsi?.[optKey];
                      if (!optText) return null;
                      const isSelected = selectedOpts.includes(optKey);
                      return (
                        <button
                          key={optKey}
                          type="button"
                          onClick={() => {
                            setSimAnswers((prev) => {
                              const prevArr = prev[String(currentQuestion.id)] || [];
                              if (!isKompleks) {
                                return { ...prev, [String(currentQuestion.id)]: [optKey] };
                              }
                              const nextArr = prevArr.includes(optKey)
                                ? prevArr.filter((k) => k !== optKey)
                                : [...prevArr, optKey].sort();
                              return { ...prev, [String(currentQuestion.id)]: nextArr };
                            });
                          }}
                          className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 border-blue-600 text-slate-900'
                              : 'bg-white border-slate-200 hover:border-blue-300 text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg font-mono text-xs font-extrabold flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {optKey}
                          </span>
                          <div className="flex-1 text-sm leading-relaxed pt-1">
                            <MathAndTableRenderer content={optText} inline />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Navigation Bar */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  {activeQuestions.map((q, idx) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className={`w-7 h-7 rounded text-[11px] font-mono font-bold border cursor-pointer ${
                        idx === currentIdx
                          ? 'bg-blue-600 text-white border-blue-600'
                          : (simAnswers[String(q.id)]?.length || 0) > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={currentIdx >= activeQuestions.length - 1}
                  onClick={() =>
                    setCurrentIdx((p) => Math.min(activeQuestions.length - 1, p + 1))
                  }
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40 cursor-pointer"
                >
                  Berikutnya
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-xs shrink-0">
          <span className="text-slate-600 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-emerald-600" />
            <span>Simulasi berjalan lokal di memori — jawaban percobaan tidak masuk ke rekap nilai siswa.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Selesai Simulasi
          </button>
        </div>
      </div>
    </div>
  );
};
