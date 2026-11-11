import { jsPDF } from 'jspdf';
import { ExamItem, QuestionItem, StudentItem, ResultItem } from '../types/cbt';
import {
  calculateExamScore,
  resolveSyncedStudentAnswersForExam,
  buildExcelHtmlTable,
  classifyQuestionCognitiveLevel,
} from './cbtLogic';

export interface AnBusoIdentity {
  namaSekolah: string;
  mataPelajaran: string;
  kelasRombel: string;
  namaTes: string;
  semesterTahunAjaran: string;
  namaPendidik: string;
  nipPendidik: string;
  tanggalUjian: string;
  kkm: number;
}

export interface AnBusoOptionStat {
  option: 'A' | 'B' | 'C' | 'D' | 'E';
  isKey: boolean;
  totalCount: number;
  percentage: number;
  upperCount: number;
  lowerCount: number;
  distractorStatus: 'Kunci Jawaban' | 'Berfungsi Baik' | 'Kurang Dipilih (0%)' | 'Perlu Revisi (Inversi)';
}

export interface AnBusoItemAnalysis {
  questionId: number;
  questionNumber: number;
  questionCode: string;
  questionType: 'PG' | 'Kompleks';
  cognitiveLevel: 'LOTS' | 'HOTS';
  topicSummary: string;
  questionText: string;
  correctKeys: string[];
  maxPoints: number;
  respondentCount: number;
  fullCorrectCount: number;
  partialCorrectCount: number;
  wrongCount: number;
  difficultyIndex: number; // P (0.00 - 1.00)
  difficultyCategory: 'Sukar' | 'Sedang' | 'Mudah';
  upperProportion: number; // PA
  lowerProportion: number; // PB
  discriminationIndex: number; // D = PA - PB (-1.00 to 1.00)
  pointBiserial: number; // r_pbi
  discriminationCategory:
    | 'Sangat Baik'
    | 'Baik'
    | 'Cukup'
    | 'Jelek'
    | 'Sangat Jelek (Negatif)';
  optionStats: AnBusoOptionStat[];
  effectiveDistractorCount: number;
  totalDistractorCount: number;
  itemDecision: 'Disimpan di Bank Soal' | 'Direvisi' | 'Dibuang / Diganti';
  decisionReason: string;
  remedialPriority: 'Aman (Tuntas Klasikal)' | 'Remedial Kelompok / Tutor Sebaya' | 'Remedial Klasikal (Ulang Konsep)';
}

export interface AnBusoStudentRemedialMap {
  studentId: number;
  studentName: string;
  studentClass: string;
  packageCode: string;
  rawEarned: number;
  rawMax: number;
  finalScore: number;
  groupRank: 'Kelompok Atas' | 'Kelompok Tengah' | 'Kelompok Bawah';
  isPassedKkm: boolean;
  statusKkm: 'Tuntas (Pengayaan)' | 'Belum Tuntas (Remedial)';
  masteredNumbers: number[];
  partialNumbers: number[];
  failedNumbers: number[];
  weakTopics: string[];
  recommendedAction: string;
  itemScores: Record<number, { chosen: string[]; earned: number; max: number; status: 'Benar Penuh' | 'Benar Sebagian' | 'Salah' }>;
}

export interface AnBusoTestSummary {
  totalRespondents: number;
  totalQuestions: number;
  upperGroupSize: number;
  lowerGroupSize: number;
  meanScore: number;
  stdDeviation: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  passRate: number;
  reliabilityAlpha: number;
  reliabilityCategory: 'Sangat Tinggi' | 'Tinggi' | 'Cukup' | 'Rendah' | 'Belum Memadai';
  bankSoalSummary: {
    savedCount: number;
    revisedCount: number;
    discardedCount: number;
  };
  difficultySummary: {
    mudahCount: number;
    sedangCount: number;
    sukarCount: number;
  };
}

export interface AnBusoCompleteReport {
  identity: AnBusoIdentity;
  summary: AnBusoTestSummary;
  items: AnBusoItemAnalysis[];
  studentRemedial: AnBusoStudentRemedialMap[];
}

function stripHtmlAndTruncate(text: string, maxLength = 68): string {
  const cleaned = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Konsep Materi Evaluasi';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function inferTopicFromQuestion(q: QuestionItem, index: number): string {
  const customId = q.data_opsi?.id_soal_csv;
  const plain = stripHtmlAndTruncate(q.teks_soal, 58);
  return customId ? `${customId}: ${plain}` : `Butir #${index + 1}: ${plain}`;
}

/**
 * Computes full AnBuso psychometric analysis:
 * 1. Difficulty Index (P)
 * 2. Discrimination Index (D = PA - PB) & Point-Biserial Correlation (r_pbi)
 * 3. Option & Distractor Effectiveness (A-E)
 * 4. Test Reliability (Cronbach's Alpha / KR-20 generalization for polytomous + dichotomous items)
 * 5. Objective Item Bank Decision (Disimpan / Direvisi / Dibuang)
 * 6. Personal Student Remedial Mapping per item & concept
 */
export function computeAnBusoAnalysis(params: {
  identity: AnBusoIdentity;
  exam?: ExamItem | null;
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  customAnswerOverrides?: Record<number, Record<string, string[]>>;
  customKeyOverrides?: Record<number, string[]>;
  customTopics?: Record<number, string>;
}): AnBusoCompleteReport {
  const {
    identity,
    exam,
    questions,
    students,
    results,
    customAnswerOverrides = {},
    customKeyOverrides = {},
    customTopics = {},
  } = params;

  const studentMap = new Map<number, StudentItem>();
  students.forEach((s) => studentMap.set(Number(s.id), s));

  // Normalize questions with any custom key overrides
  const effectiveQuestions: QuestionItem[] = questions.map((q) => {
    const overrideKey = customKeyOverrides[Number(q.id)];
    if (overrideKey && overrideKey.length > 0) {
      return { ...q, kunci_jawaban: overrideKey };
    }
    return q;
  });

  // Deduplicate results per student (keep highest/latest)
  const studentLatestResult = new Map<number, ResultItem>();
  results.forEach((r) => {
    const sid = Number(r.student_id);
    const existing = studentLatestResult.get(sid);
    if (!existing || Number(r.skor_angka) >= Number(existing.skor_angka)) {
      studentLatestResult.set(sid, r);
    }
  });

  // Evaluate each student's synced answers against effectiveQuestions
  interface EvaluatedStudent {
    studentId: number;
    studentName: string;
    studentClass: string;
    packageCode: string;
    syncedAnswers: Record<string, string[]>;
    rawEarned: number;
    rawMax: number;
    finalScore: number;
    perQuestion: Record<
      number,
      {
        chosen: string[];
        earned: number;
        max: number;
        ratio: number;
        status: 'Benar Penuh' | 'Benar Sebagian' | 'Salah';
      }
    >;
  }

  const evaluatedStudents: EvaluatedStudent[] = [];

  studentLatestResult.forEach((res, sid) => {
    const student = studentMap.get(sid);
    const studentName = student?.nama || `Peserta #${sid}`;
    const studentClass = student?.kelas || identity.kelasRombel || '-';
    const packageCode =
      res.kode_soal || student?.kode_soal || student?.variasi_paket || 'PAKET-A';

    // Sync answers from shuffled options if student & exam exist
    const baseSyncedAnswers =
      customAnswerOverrides[sid] ||
      resolveSyncedStudentAnswersForExam({
        questions: effectiveQuestions,
        jawabanSiswa: res.jawaban_siswa || {},
        student: student || null,
        exam: exam || null,
        recordedScore: res.skor_angka,
      });

    const scoreSummary = calculateExamScore(effectiveQuestions, baseSyncedAnswers);
    const perQuestion: EvaluatedStudent['perQuestion'] = {};

    scoreSummary.breakdown.forEach((b) => {
      const qId = Number(b.questionId);
      const rawChosen = baseSyncedAnswers[String(b.questionId)] || [];
      perQuestion[qId] = {
        chosen: Array.isArray(rawChosen) ? rawChosen : [],
        earned: b.earnedPoints,
        max: b.maxPoints,
        ratio: b.maxPoints > 0 ? b.earnedPoints / b.maxPoints : 0,
        status: b.status,
      };
    });

    evaluatedStudents.push({
      studentId: sid,
      studentName,
      studentClass,
      packageCode,
      syncedAnswers: baseSyncedAnswers,
      rawEarned: scoreSummary.rawEarned,
      rawMax: scoreSummary.rawMax,
      finalScore: scoreSummary.normalizedScore,
      perQuestion,
    });
  });

  // Sort students descending by finalScore (then rawEarned, then name) for Upper/Lower group split
  const sortedByScore = [...evaluatedStudents].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.rawEarned !== a.rawEarned) return b.rawEarned - a.rawEarned;
    return a.studentName.localeCompare(b.studentName, 'id');
  });

  const N = sortedByScore.length;
  // Standard psychometric group size: 27% for N >= 20, or 50% split for small classes
  const groupSize =
    N === 0
      ? 0
      : N >= 20
      ? Math.max(1, Math.round(N * 0.27))
      : Math.max(1, Math.floor(N / 2));

  const upperGroupSet = new Set<number>(
    sortedByScore.slice(0, groupSize).map((s) => s.studentId)
  );
  const lowerGroupSet = new Set<number>(
    sortedByScore
      .slice(Math.max(groupSize, N - groupSize))
      .map((s) => s.studentId)
  );

  // Overall score statistics
  const scores = sortedByScore.map((s) => s.finalScore);
  const meanScore =
    N > 0 ? Number((scores.reduce((a, b) => a + b, 0) / N).toFixed(2)) : 0;
  const varianceTotalScore =
    N > 1
      ? scores.reduce((acc, val) => acc + Math.pow(val - meanScore, 2), 0) / N
      : 0;
  const stdDeviation = Number(Math.sqrt(varianceTotalScore).toFixed(2));
  const highestScore = N > 0 ? Math.max(...scores) : 0;
  const lowestScore = N > 0 ? Math.min(...scores) : 0;

  // Raw score variance for Cronbach's Alpha
  const rawTotals = sortedByScore.map((s) => s.rawEarned);
  const rawMean =
    N > 0 ? rawTotals.reduce((a, b) => a + b, 0) / N : 0;
  const rawTotalVariance =
    N > 1
      ? rawTotals.reduce((acc, val) => acc + Math.pow(val - rawMean, 2), 0) / N
      : 0;

  let sumItemVariances = 0;

  // Analyze each question item
  const items: AnBusoItemAnalysis[] = effectiveQuestions.map((q, idx) => {
    const qId = Number(q.id);
    const maxPoints =
      typeof q.bobot === 'number' && q.bobot > 0
        ? q.bobot
        : q.tipe_soal === 'Kompleks'
        ? 3
        : 2;
    const correctKeys = (q.kunci_jawaban || []).map((k) => k.toUpperCase());
    const topicSummary =
      customTopics[qId]?.trim() || inferTopicFromQuestion(q, idx);
    const cognitiveLevel = classifyQuestionCognitiveLevel(q);

    let fullCorrectCount = 0;
    let partialCorrectCount = 0;
    let wrongCount = 0;

    let sumRatioAll = 0;
    let sumRatioUpper = 0;
    let sumRatioLower = 0;
    let upperCountActual = 0;
    let lowerCountActual = 0;

    const itemEarnedScores: number[] = [];
    const itemRatios: number[] = [];

    const optCounts: Record<'A' | 'B' | 'C' | 'D' | 'E', { total: number; upper: number; lower: number }> = {
      A: { total: 0, upper: 0, lower: 0 },
      B: { total: 0, upper: 0, lower: 0 },
      C: { total: 0, upper: 0, lower: 0 },
      D: { total: 0, upper: 0, lower: 0 },
      E: { total: 0, upper: 0, lower: 0 },
    };

    sortedByScore.forEach((st) => {
      const qRes = st.perQuestion[qId];
      const earned = qRes ? qRes.earned : 0;
      const ratio = qRes ? qRes.ratio : 0;
      const status = qRes ? qRes.status : 'Salah';
      const chosen = qRes ? qRes.chosen : [];

      itemEarnedScores.push(earned);
      itemRatios.push(ratio);

      if (status === 'Benar Penuh') fullCorrectCount++;
      else if (status === 'Benar Sebagian') partialCorrectCount++;
      else wrongCount++;

      sumRatioAll += ratio;

      const isUpper = upperGroupSet.has(st.studentId);
      const isLower = lowerGroupSet.has(st.studentId);
      if (isUpper) {
        sumRatioUpper += ratio;
        upperCountActual++;
      }
      if (isLower) {
        sumRatioLower += ratio;
        lowerCountActual++;
      }

      chosen.forEach((opt) => {
        const cleanOpt = opt.toUpperCase().trim() as 'A' | 'B' | 'C' | 'D' | 'E';
        if (optCounts[cleanOpt]) {
          optCounts[cleanOpt].total++;
          if (isUpper) optCounts[cleanOpt].upper++;
          if (isLower) optCounts[cleanOpt].lower++;
        }
      });
    });

    // Item variance for Cronbach's Alpha
    if (N > 1) {
      const itemMean =
        itemEarnedScores.reduce((a, b) => a + b, 0) / N;
      const itemVar =
        itemEarnedScores.reduce((acc, v) => acc + Math.pow(v - itemMean, 2), 0) /
        N;
      sumItemVariances += itemVar;
    }

    // 1. Difficulty Index (P)
    const difficultyIndex =
      N > 0 ? Number((sumRatioAll / N).toFixed(2)) : 0;
    let difficultyCategory: AnBusoItemAnalysis['difficultyCategory'] = 'Sedang';
    if (difficultyIndex <= 0.3) {
      difficultyCategory = 'Sukar';
    } else if (difficultyIndex > 0.7) {
      difficultyCategory = 'Mudah';
    }

    // 2. Discrimination Index (D = PA - PB)
    const upperProportion =
      upperCountActual > 0
        ? Number((sumRatioUpper / upperCountActual).toFixed(2))
        : 0;
    const lowerProportion =
      lowerCountActual > 0
        ? Number((sumRatioLower / lowerCountActual).toFixed(2))
        : 0;
    const discriminationIndex = Number(
      (upperProportion - lowerProportion).toFixed(2)
    );

    // Point-Biserial correlation (r_pbi) between item ratio and total score
    let pointBiserial = 0;
    if (N > 1 && stdDeviation > 0) {
      const meanRatio = sumRatioAll / N;
      const stdRatio = Math.sqrt(
        itemRatios.reduce((acc, r) => acc + Math.pow(r - meanRatio, 2), 0) / N
      );
      if (stdRatio > 0) {
        let cov = 0;
        for (let i = 0; i < N; i++) {
          cov += (itemRatios[i] - meanRatio) * (scores[i] - meanScore);
        }
        cov /= N;
        pointBiserial = Number((cov / (stdRatio * stdDeviation)).toFixed(2));
      }
    }

    let discriminationCategory: AnBusoItemAnalysis['discriminationCategory'] =
      'Cukup';
    if (discriminationIndex >= 0.4) {
      discriminationCategory = 'Sangat Baik';
    } else if (discriminationIndex >= 0.3) {
      discriminationCategory = 'Baik';
    } else if (discriminationIndex >= 0.2) {
      discriminationCategory = 'Cukup';
    } else if (discriminationIndex >= 0) {
      discriminationCategory = 'Jelek';
    } else {
      discriminationCategory = 'Sangat Jelek (Negatif)';
    }

    // 3. Option & Distractor Effectiveness (A-E)
    const optionKeys: ('A' | 'B' | 'C' | 'D' | 'E')[] = ['A', 'B', 'C', 'D', 'E'];
    let effectiveDistractorCount = 0;
    let totalDistractorCount = 0;

    const optionStats: AnBusoOptionStat[] = optionKeys.map((opt) => {
      const isKey = correctKeys.includes(opt);
      const totalCount = optCounts[opt].total;
      const percentage =
        N > 0 ? Number(((totalCount / N) * 100).toFixed(1)) : 0;
      const upperCount = optCounts[opt].upper;
      const lowerCount = optCounts[opt].lower;

      let distractorStatus: AnBusoOptionStat['distractorStatus'] = 'Kunci Jawaban';
      if (!isKey) {
        totalDistractorCount++;
        if (totalCount === 0) {
          distractorStatus = 'Kurang Dipilih (0%)';
        } else if (upperCount > lowerCount && totalCount >= 2) {
          distractorStatus = 'Perlu Revisi (Inversi)';
        } else {
          distractorStatus = 'Berfungsi Baik';
          effectiveDistractorCount++;
        }
      }

      return {
        option: opt,
        isKey,
        totalCount,
        percentage,
        upperCount,
        lowerCount,
        distractorStatus,
      };
    });

    // 4. Objective Item Bank Decision
    let itemDecision: AnBusoItemAnalysis['itemDecision'] = 'Disimpan di Bank Soal';
    let decisionReason = 'Daya beda dan tingkat kesukaran proporsional.';

    if (discriminationIndex < 0.1 && N >= 4 && difficultyIndex < 0.9) {
      itemDecision = 'Dibuang / Diganti';
      decisionReason =
        discriminationIndex < 0
          ? 'Daya beda negatif (kelompok bawah justru lebih tinggi dari kelompok atas).'
          : 'Daya beda terlalu rendah (< 0.10), tidak mampu membedakan penguasaan siswa.';
    } else if (
      discriminationIndex < 0.25 ||
      difficultyIndex < 0.15 ||
      (difficultyIndex < 0.85 && effectiveDistractorCount === 0 && N >= 4)
    ) {
      itemDecision = 'Direvisi';
      if (difficultyIndex < 0.15) {
        decisionReason = 'Soal terlalu sukar (< 0.15), periksa kejelasan redaksi dan pengecoh.';
      } else if (effectiveDistractorCount === 0 && N >= 4) {
        decisionReason = 'Pengecoh (distraktor) kurang berfungsi efektif menarik perhatian.';
      } else {
        decisionReason = 'Daya beda cukup/marginal, disarankan penyempurnaan opsi pengecoh.';
      }
    }

    // 5. Class Remedial Priority per Question
    let remedialPriority: AnBusoItemAnalysis['remedialPriority'] =
      'Aman (Tuntas Klasikal)';
    if (difficultyIndex < 0.45) {
      remedialPriority = 'Remedial Klasikal (Ulang Konsep)';
    } else if (difficultyIndex < 0.7) {
      remedialPriority = 'Remedial Kelompok / Tutor Sebaya';
    }

    return {
      questionId: qId,
      questionNumber: idx + 1,
      questionCode: q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`,
      questionType: (q.tipe_soal || '').toLowerCase().includes('kompleks')
        ? 'Kompleks'
        : 'PG',
      cognitiveLevel,
      topicSummary,
      questionText: q.teks_soal,
      correctKeys,
      maxPoints,
      respondentCount: N,
      fullCorrectCount,
      partialCorrectCount,
      wrongCount,
      difficultyIndex,
      difficultyCategory,
      upperProportion,
      lowerProportion,
      discriminationIndex,
      pointBiserial,
      discriminationCategory,
      optionStats,
      effectiveDistractorCount,
      totalDistractorCount,
      itemDecision,
      decisionReason,
      remedialPriority,
    };
  });

  // Compute Cronbach's Alpha reliability coefficient
  const k = effectiveQuestions.length;
  let reliabilityAlpha = 0;
  if (k > 1 && rawTotalVariance > 0 && N > 1) {
    const rawAlpha = (k / (k - 1)) * (1 - sumItemVariances / rawTotalVariance);
    reliabilityAlpha = Number(Math.max(0, Math.min(1, rawAlpha)).toFixed(3));
  }

  let reliabilityCategory: AnBusoTestSummary['reliabilityCategory'] =
    'Belum Memadai';
  if (reliabilityAlpha >= 0.8) reliabilityCategory = 'Sangat Tinggi';
  else if (reliabilityAlpha >= 0.7) reliabilityCategory = 'Tinggi';
  else if (reliabilityAlpha >= 0.6) reliabilityCategory = 'Cukup';
  else if (reliabilityAlpha >= 0.4) reliabilityCategory = 'Rendah';

  // Map personal remedial per student
  const kkm = Number(identity.kkm) || 70;
  const studentRemedial: AnBusoStudentRemedialMap[] = sortedByScore.map((st) => {
    const isPassedKkm = st.finalScore >= kkm;
    const groupRank: AnBusoStudentRemedialMap['groupRank'] = upperGroupSet.has(
      st.studentId
    )
      ? 'Kelompok Atas'
      : lowerGroupSet.has(st.studentId)
      ? 'Kelompok Bawah'
      : 'Kelompok Tengah';

    const masteredNumbers: number[] = [];
    const partialNumbers: number[] = [];
    const failedNumbers: number[] = [];
    const weakTopics: string[] = [];
    const itemScores: AnBusoStudentRemedialMap['itemScores'] = {};

    items.forEach((item) => {
      const qEval = st.perQuestion[item.questionId];
      const status = qEval ? qEval.status : 'Salah';
      itemScores[item.questionNumber] = {
        chosen: qEval ? qEval.chosen : [],
        earned: qEval ? qEval.earned : 0,
        max: item.maxPoints,
        status,
      };

      if (status === 'Benar Penuh') {
        masteredNumbers.push(item.questionNumber);
      } else if (status === 'Benar Sebagian') {
        partialNumbers.push(item.questionNumber);
        if (weakTopics.length < 4) {
          weakTopics.push(`No.${item.questionNumber} (Parsial)`);
        }
      } else {
        failedNumbers.push(item.questionNumber);
        if (weakTopics.length < 5) {
          weakTopics.push(item.topicSummary);
        }
      }
    });

    let recommendedAction = '';
    if (isPassedKkm && failedNumbers.length === 0 && partialNumbers.length === 0) {
      recommendedAction =
        'Pengayaan Mandiri & Tutor Sebaya (Menguasai seluruh indikator soal).';
    } else if (isPassedKkm) {
      recommendedAction = `Tuntas KKM — Penguatan mandiri spesifik pada butir No. ${[
        ...failedNumbers,
        ...partialNumbers,
      ]
        .slice(0, 8)
        .join(', ')}.`;
    } else if (failedNumbers.length <= Math.ceil(k * 0.35)) {
      recommendedAction = `Bimbingan Khusus / Tugas Terstruktur pada butir No. ${failedNumbers
        .slice(0, 10)
        .join(', ')}.`;
    } else {
      recommendedAction = `Pembelajaran Ulang (Remedial Teaching) & Tes Ulang pada butir No. ${failedNumbers
        .slice(0, 12)
        .join(', ')}.`;
    }

    return {
      studentId: st.studentId,
      studentName: st.studentName,
      studentClass: st.studentClass,
      packageCode: st.packageCode,
      rawEarned: st.rawEarned,
      rawMax: st.rawMax,
      finalScore: st.finalScore,
      groupRank,
      isPassedKkm,
      statusKkm: isPassedKkm
        ? 'Tuntas (Pengayaan)'
        : 'Belum Tuntas (Remedial)',
      masteredNumbers,
      partialNumbers,
      failedNumbers,
      weakTopics,
      recommendedAction,
      itemScores,
    };
  });

  const passCount = studentRemedial.filter((s) => s.isPassedKkm).length;
  const passRate = N > 0 ? Math.round((passCount / N) * 100) : 0;

  const savedCount = items.filter(
    (i) => i.itemDecision === 'Disimpan di Bank Soal'
  ).length;
  const revisedCount = items.filter((i) => i.itemDecision === 'Direvisi').length;
  const discardedCount = items.filter(
    (i) => i.itemDecision === 'Dibuang / Diganti'
  ).length;

  const mudahCount = items.filter((i) => i.difficultyCategory === 'Mudah').length;
  const sedangCount = items.filter(
    (i) => i.difficultyCategory === 'Sedang'
  ).length;
  const sukarCount = items.filter((i) => i.difficultyCategory === 'Sukar').length;

  return {
    identity,
    summary: {
      totalRespondents: N,
      totalQuestions: k,
      upperGroupSize: upperGroupSet.size,
      lowerGroupSize: lowerGroupSet.size,
      meanScore,
      stdDeviation,
      highestScore,
      lowestScore,
      passCount,
      passRate,
      reliabilityAlpha,
      reliabilityCategory,
      bankSoalSummary: {
        savedCount,
        revisedCount,
        discardedCount,
      },
      difficultySummary: {
        mudahCount,
        sedangCount,
        sukarCount,
      },
    },
    items,
    studentRemedial,
  };
}

/**
 * Generates an Excel-compatible (.xls) AnBuso report containing:
 * - Identitas Tes & Statistik Reliabilitas
 * - Analisis Statistik Butir Soal (Tingkat Kesukaran, Daya Beda, Efektivitas Pengecoh A-E, Keputusan Bank Soal)
 * - Pemetaan Remedial Personal Siswa per Butir Soal
 */
export function generateAnBusoExcelReport(report: AnBusoCompleteReport): string {
  const { identity, summary, items, studentRemedial } = report;

  const headers = [
    'No Butir',
    'Kode Soal',
    'Tipe',
    'Level Kognitif',
    'Kunci Jawaban',
    'Indikator / Konsep Materi',
    'Benar Penuh',
    'Benar Sebagian',
    'Salah',
    'Indeks Kesukaran (P)',
    'Kategori Kesukaran',
    'Proporsi Atas (PA)',
    'Proporsi Bawah (PB)',
    'Daya Beda (D)',
    'Korelasi (r_pbi)',
    'Kategori Daya Beda',
    'Opsi A (%)',
    'Opsi B (%)',
    'Opsi C (%)',
    'Opsi D (%)',
    'Opsi E (%)',
    'Pengecoh Efektif',
    'Keputusan Bank Soal',
    'Prioritas Remedial Kelas',
  ];

  const rows: (string | number)[][] = items.map((item) => {
    const optMap: Record<string, string> = {};
    item.optionStats.forEach((o) => {
      optMap[o.option] = `${o.totalCount} (${o.percentage}%)${
        o.isKey ? ' *' : ''
      }`;
    });

    return [
      item.questionNumber,
      item.questionCode,
      item.questionType,
      item.cognitiveLevel,
      item.correctKeys.join(', '),
      item.topicSummary,
      item.fullCorrectCount,
      item.partialCorrectCount,
      item.wrongCount,
      item.difficultyIndex,
      item.difficultyCategory,
      item.upperProportion,
      item.lowerProportion,
      item.discriminationIndex,
      item.pointBiserial,
      item.discriminationCategory,
      optMap.A || '0 (0%)',
      optMap.B || '0 (0%)',
      optMap.C || '0 (0%)',
      optMap.D || '0 (0%)',
      optMap.E || '0 (0%)',
      `${item.effectiveDistractorCount}/${item.totalDistractorCount}`,
      item.itemDecision,
      item.remedialPriority,
    ];
  });

  // Append remedial mapping section at the bottom of the sheet
  rows.push([]);
  rows.push([
    'PEMETAAN REMEDIAL PERSONAL SISWA PER BUTIR SOAL (ANBUSO)',
    `Sekolah: ${identity.namaSekolah}`,
    `Mapel: ${identity.mataPelajaran}`,
    `Kelas: ${identity.kelasRombel}`,
    `KKM: ${identity.kkm}`,
    `Reliabilitas Alpha: ${summary.reliabilityAlpha} (${summary.reliabilityCategory})`,
  ]);
  rows.push([
    'No',
    'Nama Siswa',
    'Kelas',
    'Paket Soal',
    'Kelompok Skor',
    'Skor Mentah',
    'Nilai Akhir',
    'Status Ketuntasan KKM',
    'Butir Soal Belum Tuntas (Salah)',
    'Butir Soal Parsial (PGK)',
    'Butir Soal Tuntas (Benar Penuh)',
    'Rekomendasi Tindak Lanjut Individual',
  ]);

  studentRemedial.forEach((st, idx) => {
    rows.push([
      idx + 1,
      st.studentName,
      st.studentClass,
      st.packageCode,
      st.groupRank,
      `${st.rawEarned}/${st.rawMax}`,
      st.finalScore,
      st.statusKkm,
      st.failedNumbers.length > 0 ? st.failedNumbers.join(', ') : 'Tidak Ada',
      st.partialNumbers.length > 0 ? st.partialNumbers.join(', ') : 'Tidak Ada',
      st.masteredNumbers.length > 0 ? st.masteredNumbers.join(', ') : '-',
      st.recommendedAction,
    ]);
  });

  return buildExcelHtmlTable(
    `AnBuso — ${identity.namaTes} (${identity.kelasRombel})`,
    headers,
    rows
  );
}

function sanitizePdfString(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '-';
  return String(input)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, ' | ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim();
}

/**
 * Generates a print-ready official PDF report for AnBuso (Analisis Butir Soal & Pemetaan Remedial Personal)
 * using native jsPDF drawing primitives.
 */
export function downloadAnBusoPdfReport(report: AnBusoCompleteReport): void {
  const { identity, summary, items, studentRemedial } = report;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const drawTopHeader = (title: string, subtitle: string, bg: [number, number, number]) => {
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(10, 10, 277, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(sanitizePdfString(title), 14, 17.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(sanitizePdfString(subtitle), 14, 23);
    doc.text(
      sanitizePdfString(
        `Pendidik: ${identity.namaPendidik}  |  Semester/TA: ${identity.semesterTahunAjaran}  |  KKM: ${identity.kkm}  |  Reliabilitas Tes (Alpha): ${summary.reliabilityAlpha} (${summary.reliabilityCategory})`
      ),
      14,
      27.5
    );
  };

  drawTopHeader(
    'LAPORAN ANALISIS BUTIR SOAL (ANBUSO) & EVALUASI KUALITAS INSTRUMEN TES',
    `${identity.namaSekolah}  |  Mata Pelajaran: ${identity.mataPelajaran}  |  Kelas/Rombel: ${identity.kelasRombel}  |  Tes: ${identity.namaTes}`,
    [30, 58, 138]
  );

  // Summary Stat Strip Box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(10, 33, 277, 12, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(
    sanitizePdfString(
      `Responden: ${summary.totalRespondents} Siswa (Atas: ${summary.upperGroupSize}, Bawah: ${summary.lowerGroupSize})   |   Jumlah Soal: ${summary.totalQuestions} Butir   |   Rata-Rata: ${summary.meanScore} (SD: ${summary.stdDeviation})   |   Ketuntasan: ${summary.passRate}% (${summary.passCount}/${summary.totalRespondents})`
    ),
    14,
    38
  );
  doc.setFont('helvetica', 'normal');
  doc.text(
    sanitizePdfString(
      `Keputusan Bank Soal: Simpan = ${summary.bankSoalSummary.savedCount} Butir, Direvisi = ${summary.bankSoalSummary.revisedCount} Butir, Dibuang = ${summary.bankSoalSummary.discardedCount} Butir   |   Sebaran Kesukaran: Mudah = ${summary.difficultySummary.mudahCount}, Sedang = ${summary.difficultySummary.sedangCount}, Sukar = ${summary.difficultySummary.sukarCount}`
    ),
    14,
    43
  );

  // Table 1: Item Psychometric Analysis
  const colWidths1 = [10, 20, 16, 15, 68, 16, 20, 18, 14, 24, 34, 22];
  const headers1 = [
    'No',
    'Kode',
    'Tipe',
    'Kunci',
    'Indikator / Konsep Soal',
    'Indeks P',
    'Kesukaran',
    'Daya Beda',
    'r_pbi',
    'Kualitas D',
    'Pengecoh Efektif',
    'Keputusan',
  ];

  const drawTable1Header = (y: number) => {
    doc.setFillColor(30, 64, 175);
    doc.rect(10, y, 277, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    let x = 10;
    headers1.forEach((h, i) => {
      doc.text(h, x + 1.5, y + 4.8);
      x += colWidths1[i];
    });
    return y + 7;
  };

  let curY = drawTable1Header(48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);

  items.forEach((item, idx) => {
    if (curY > 192) {
      doc.addPage('a4', 'landscape');
      drawTopHeader(
        'LAPORAN ANALISIS BUTIR SOAL (ANBUSO) — LANJUTAN TABEL BUTIR SOAL',
        `${identity.namaSekolah}  |  Mata Pelajaran: ${identity.mataPelajaran}  |  Kelas: ${identity.kelasRombel}`,
        [30, 58, 138]
      );
      curY = drawTable1Header(34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(10, curY, 277, 6.5, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, curY, 277, 6.5, 'S');

    const rowVals = [
      String(item.questionNumber),
      sanitizePdfString(item.questionCode).slice(0, 12),
      item.questionType,
      item.correctKeys.join(','),
      sanitizePdfString(item.topicSummary).slice(0, 42),
      item.difficultyIndex.toFixed(2),
      item.difficultyCategory,
      item.discriminationIndex.toFixed(2),
      item.pointBiserial.toFixed(2),
      sanitizePdfString(item.discriminationCategory).slice(0, 14),
      `${item.effectiveDistractorCount}/${item.totalDistractorCount} Opsi Baik`,
      sanitizePdfString(item.itemDecision.replace('Disimpan di ', '')),
    ];

    doc.setTextColor(15, 23, 42);
    let x = 10;
    rowVals.forEach((val, i) => {
      doc.text(val, x + 1.5, curY + 4.4);
      x += colWidths1[i];
    });
    curY += 6.5;
  });

  // Page 2: Personal Remedial Mapping per Student
  doc.addPage('a4', 'landscape');
  drawTopHeader(
    'PEMETAAN KEBUTUHAN REMEDIAL PERSONAL SISWA PER BUTIR SOAL (ANBUSO)',
    `${identity.namaSekolah}  |  Mata Pelajaran: ${identity.mataPelajaran}  |  Kelas/Rombel: ${identity.kelasRombel}  |  Batas KKM: ${identity.kkm}`,
    [15, 118, 110]
  );

  const colWidths2 = [10, 48, 28, 18, 20, 15, 28, 42, 68];
  const headers2 = [
    'No',
    'Nama Lengkap Siswa',
    'Kelas',
    'Paket',
    'Kelompok',
    'Nilai',
    'Status KKM',
    'Butir Belum Dikuasai (Salah)',
    'Rekomendasi Remedial & Tindak Lanjut Individual',
  ];

  const drawTable2Header = (y: number) => {
    doc.setFillColor(15, 118, 110);
    doc.rect(10, y, 277, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    let x = 10;
    headers2.forEach((h, i) => {
      doc.text(h, x + 1.5, y + 4.8);
      x += colWidths2[i];
    });
    return y + 7;
  };

  let curY2 = drawTable2Header(34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);

  studentRemedial.forEach((st, idx) => {
    if (curY2 > 192) {
      doc.addPage('a4', 'landscape');
      drawTopHeader(
        'PEMETAAN KEBUTUHAN REMEDIAL PERSONAL SISWA — LANJUTAN',
        `${identity.namaSekolah}  |  Mata Pelajaran: ${identity.mataPelajaran}  |  Kelas/Rombel: ${identity.kelasRombel}`,
        [15, 118, 110]
      );
      curY2 = drawTable2Header(34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(10, curY2, 277, 6.5, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, curY2, 277, 6.5, 'S');

    const failedText =
      st.failedNumbers.length > 0
        ? `No. ${st.failedNumbers.slice(0, 10).join(', ')}${
            st.failedNumbers.length > 10 ? '...' : ''
          }`
        : 'Tidak ada (Tuntas Butir)';

    const rowVals2 = [
      String(idx + 1),
      sanitizePdfString(st.studentName).slice(0, 28),
      sanitizePdfString(st.studentClass).slice(0, 16),
      sanitizePdfString(st.packageCode).slice(0, 10),
      sanitizePdfString(st.groupRank.replace('Kelompok ', '')),
      String(st.finalScore),
      sanitizePdfString(st.statusKkm),
      sanitizePdfString(failedText).slice(0, 26),
      sanitizePdfString(st.recommendedAction).slice(0, 46),
    ];

    doc.setTextColor(15, 23, 42);
    let x = 10;
    rowVals2.forEach((val, i) => {
      doc.text(val, x + 1.5, curY2 + 4.4);
      x += colWidths2[i];
    });
    curY2 += 6.5;
  });

  const cleanClass = (identity.kelasRombel || 'Semua_Kelas')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  doc.save(`Laporan_AnBuso_${cleanClass}.pdf`);
}

