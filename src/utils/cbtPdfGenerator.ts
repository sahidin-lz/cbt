import { jsPDF } from 'jspdf';
import {
  StudentItem,
  ResultItem,
  ExamItem,
  AnalisisAI,
  QuestionItem,
} from '../types/cbt';
import {
  extractTingkatFromKelas,
  calculateExamScore,
  getEffectiveExamSessionToken,
  getEffectiveMataPelajaran,
  getStudentAbsenInfoInClass,
  resolveStudentExamPackagesBySubject,
} from './cbtLogic';

export interface TokenCardPdfOptions {
  title?: string;
  subtitle?: string;
  kelasLabel?: string;
  exams?: ExamItem[];
  results?: ResultItem[];
  questions?: QuestionItem[];
  allStudents?: StudentItem[];
  preferredExamId?: number | string | null;
  includeSummaryPage?: boolean;
}

export interface SingleStudentResultPdfParams {
  student: StudentItem;
  allStudents?: StudentItem[];
  exams?: ExamItem[];
  exam?: ExamItem | null;
  score: number;
  kategori: string;
  answeredCount?: number;
  totalQuestions?: number;
  tabViolations?: number;
  aiAnalysis?: AnalisisAI | null;
  submittedAt?: string;
  questions?: QuestionItem[];
  studentAnswers?: Record<string, string[]>;
}

export interface StudentSubjectTokenInfo {
  examId: number;
  mataPelajaran: string;
  kodePaket: string;
  namaPaketSoal: string;
  tokenUjian: string;
  statusExam: string;
  distribusiReason: string;
}

export interface StudentPrecisionRecord {
  student: StudentItem;
  noAbsen: number;
  isGanjil: boolean;
  ganjilGenapLabel: 'GANJIL' | 'GENAP';
  tingkat: '10' | '11' | '12' | 'LAINNYA';
  tokenLogin: string;
  tokenSistemAsli: string;
  hasCustomPassword: boolean;
  kodePaket: string;
  namaPaketSoal: string;
  mataPelajaran: string;
  paketLengkapLabel: string;
  tokenUjianHariIni: string;
  allSubjectPackages: StudentSubjectTokenInfo[];
  allSubjectTokensLabel: string;
  assignedExam: ExamItem | null;
  matchedResult: ResultItem | null;
  score: number | null;
  predikatLabel: string;
  statusLabel: string;
  pelanggaranTab: number;
}

/**
 * Resolves 100% precise student card & table data:
 * - Attendance Number (No. Absen) & Ganjil/Genap within the student's class
 * - Token Login Akun Siswa (`password_login || token_ujian`)
 * - Exact Paket Soal received (`kodePaket`, `namaPaketSoal`, `mataPelajaran`)
 * - Exact Token Sesi Ujian for that Paket Soal today (`token_sesi`)
 * - Exact Nilai Akhir (`0-100`), Predikat, and Status Ujian (`Selesai` / `Sedang Ujian` / `Belum Mulai` / `Diblokir`)
 */
export function resolveStudentPrecisionRecord(params: {
  student: StudentItem;
  allStudents?: StudentItem[];
  exams?: ExamItem[];
  results?: ResultItem[];
  questions?: QuestionItem[];
  preferredExamId?: number | string | null;
}): StudentPrecisionRecord {
  const {
    student,
    allStudents = [student],
    exams = [],
    results = [],
    questions = [],
    preferredExamId = null,
  } = params;

  const rosterPool = allStudents.length > 0 ? allStudents : [student];
  const absenInfo = getStudentAbsenInfoInClass(student, rosterPool);
  const tingkat = extractTingkatFromKelas(student.kelas);

  const tokenSistemAsli = (student.token_ujian || '-').trim().toUpperCase();
  const rawPass = (student.password_login || '').trim();
  const tokenLogin = rawPass ? rawPass : tokenSistemAsli;
  const hasCustomPassword =
    Boolean(rawPass) && rawPass.toUpperCase() !== tokenSistemAsli;

  // Match student result (by student_id first, then by preferredExamId if specified, with safe name fallback)
  let studentResults = results.filter(
    (r) => Number(r.student_id) === Number(student.id)
  );
  if (studentResults.length === 0 && results.length > 0) {
    const cleanTargetName = (student.nama || '').trim().toLowerCase();
    if (cleanTargetName) {
      studentResults = results.filter(
        (r) =>
          (r.analisis_ai?.nama_siswa || '').trim().toLowerCase() ===
          cleanTargetName
      );
    }
  }

  let matchedResult: ResultItem | null = null;
  if (
    preferredExamId !== null &&
    preferredExamId !== undefined &&
    String(preferredExamId) !== '' &&
    String(preferredExamId) !== 'SEMUA'
  ) {
    const forPreferred = studentResults.filter(
      (r) => Number(r.exam_id) === Number(preferredExamId)
    );
    if (forPreferred.length > 0) {
      matchedResult = forPreferred.reduce((best, cur) =>
        Number(cur.id) >= Number(best.id) ? cur : best
      );
    }
  }
  if (!matchedResult && studentResults.length > 0) {
    matchedResult = studentResults.reduce((best, cur) =>
      Number(cur.id) >= Number(best.id) ? cur : best
    );
  }

  const score =
    matchedResult &&
    typeof matchedResult.skor_angka === 'number' &&
    !Number.isNaN(matchedResult.skor_angka)
      ? matchedResult.skor_angka
      : null;

  let predikatLabel = '-';
  if (score !== null) {
    if (score >= 85) predikatLabel = 'Sangat Baik (A)';
    else if (score >= 70) predikatLabel = 'Baik (B)';
    else if (score >= 55) predikatLabel = 'Cukup (C)';
    else predikatLabel = 'Perlu Penguatan (D)';
  }

  let statusLabel = student.status_ujian || 'Belum Mulai';
  if (student.status_ujian === 'Diblokir') {
    statusLabel = 'Diblokir';
  } else if (score !== null || student.status_ujian === 'Selesai') {
    statusLabel = 'Selesai';
  } else if (student.status_ujian === 'Sedang Ujian') {
    statusLabel = 'Sedang Ujian';
  } else {
    statusLabel = 'Belum Mulai';
  }

  // Resolve subject allocations (merge active and non-finished draft packages so multi-package Ganjil/Genap is always accurate)
  const activeAllocations = resolveStudentExamPackagesBySubject({
    student,
    allStudents: rosterPool,
    exams,
    questions,
    requireActive: true,
    onlyPackagesWithQuestions: false,
  });

  const allAllocations = resolveStudentExamPackagesBySubject({
    student,
    allStudents: rosterPool,
    exams,
    questions,
    requireActive: false,
    onlyPackagesWithQuestions: false,
  });

  // Prefer allAllocations when a subject has more packages in allAllocations (e.g., 2 packages where 1 is still DRAF) or when activeAllocations is empty
  const mergedAllocMap = new Map<string, (typeof allAllocations)[0]>();
  for (const alloc of activeAllocations) {
    mergedAllocMap.set(alloc.mataPelajaran.toUpperCase(), alloc);
  }
  for (const alloc of allAllocations) {
    const key = alloc.mataPelajaran.toUpperCase();
    const existing = mergedAllocMap.get(key);
    if (
      !existing ||
      alloc.allPackagesInSubject.length > existing.allPackagesInSubject.length
    ) {
      mergedAllocMap.set(key, alloc);
    }
  }
  const effectiveAllocations = Array.from(mergedAllocMap.values());

  const allSubjectPackages: StudentSubjectTokenInfo[] = effectiveAllocations.map(
    (alloc) => ({
      examId: Number(alloc.assignedExam.id),
      mataPelajaran: alloc.mataPelajaran,
      kodePaket: alloc.assignedPackageCode,
      namaPaketSoal: alloc.assignedExam.judul_ujian,
      tokenUjian: getEffectiveExamSessionToken(alloc.assignedExam),
      statusExam: alloc.assignedExam.status_ujian || 'AKTIF',
      distribusiReason: alloc.distributionReason,
    })
  );

  // Choose primary package for this student
  let chosenInfo: StudentSubjectTokenInfo | null = null;
  let assignedExam: ExamItem | null = null;

  if (
    preferredExamId !== null &&
    preferredExamId !== undefined &&
    String(preferredExamId) !== '' &&
    String(preferredExamId) !== 'SEMUA'
  ) {
    const explicitExam = exams.find(
      (e) => Number(e.id) === Number(preferredExamId)
    );
    const matchedSubj = allSubjectPackages.find(
      (p) => Number(p.examId) === Number(preferredExamId)
    );
    if (matchedSubj && explicitExam) {
      chosenInfo = matchedSubj;
      assignedExam = explicitExam;
    } else if (explicitExam) {
      assignedExam = explicitExam;
      const mapel = getEffectiveMataPelajaran(explicitExam);
      const subjAlloc = effectiveAllocations.find(
        (a) => a.mataPelajaran.toUpperCase() === mapel.toUpperCase()
      );
      chosenInfo = {
        examId: Number(explicitExam.id),
        mataPelajaran: mapel,
        kodePaket:
          subjAlloc?.assignedPackageCode ||
          explicitExam.kode_paket ||
          student.kode_soal ||
          'PAKET-A',
        namaPaketSoal: explicitExam.judul_ujian,
        tokenUjian: getEffectiveExamSessionToken(explicitExam),
        statusExam: explicitExam.status_ujian || 'AKTIF',
        distribusiReason: subjAlloc?.distributionReason || 'Paket Terpilih',
      };
    }
  }

  // If student already completed an exam and no preferredExamId overrode it, check if that exam is in allSubjectPackages or exams
  if (!chosenInfo && matchedResult) {
    const resExam = exams.find(
      (e) => Number(e.id) === Number(matchedResult!.exam_id)
    );
    const fromAlloc = allSubjectPackages.find(
      (p) => Number(p.examId) === Number(matchedResult!.exam_id)
    );
    if (fromAlloc && resExam) {
      chosenInfo = {
        ...fromAlloc,
        kodePaket: matchedResult.kode_soal || fromAlloc.kodePaket,
      };
      assignedExam = resExam;
    } else if (resExam) {
      assignedExam = resExam;
      const mapel = getEffectiveMataPelajaran(resExam);
      const subjAlloc = effectiveAllocations.find(
        (a) => a.mataPelajaran.toUpperCase() === mapel.toUpperCase()
      );
      chosenInfo = {
        examId: Number(resExam.id),
        mataPelajaran: mapel,
        kodePaket:
          matchedResult.kode_soal ||
          subjAlloc?.assignedPackageCode ||
          resExam.kode_paket ||
          student.kode_soal ||
          'PAKET-A',
        namaPaketSoal: resExam.judul_ujian,
        tokenUjian: getEffectiveExamSessionToken(resExam),
        statusExam: resExam.status_ujian || 'AKTIF',
        distribusiReason: subjAlloc?.distributionReason || 'Ujian Selesai',
      };
    }
  }

  if (!chosenInfo && allSubjectPackages.length > 0) {
    // Prefer an AKTIF package first if available
    const activePkg =
      allSubjectPackages.find(
        (p) => (p.statusExam || 'AKTIF').toUpperCase() === 'AKTIF'
      ) || allSubjectPackages[0];
    chosenInfo = activePkg;
    assignedExam =
      exams.find((e) => Number(e.id) === Number(activePkg.examId)) || null;
  }

  // Ultimate fallback if no exam matched the class filter but exams exist in the system
  if (!chosenInfo && exams.length > 0) {
    const fallbackExam =
      exams.find((e) => (e.status_ujian || 'AKTIF').toUpperCase() === 'AKTIF') ||
      exams[0];
    assignedExam = fallbackExam;
    const mapel = getEffectiveMataPelajaran(fallbackExam);
    const code =
      matchedResult?.kode_soal ||
      student.kode_soal ||
      fallbackExam.kode_paket ||
      (absenInfo.isGanjil ? 'PAKET-A' : 'PAKET-B');
    chosenInfo = {
      examId: Number(fallbackExam.id),
      mataPelajaran: mapel,
      kodePaket: code,
      namaPaketSoal: fallbackExam.judul_ujian,
      tokenUjian: getEffectiveExamSessionToken(fallbackExam),
      statusExam: fallbackExam.status_ujian || 'AKTIF',
      distribusiReason: `Absen #${absenInfo.noAbsen} (${absenInfo.ganjilGenapLabel})`,
    };
    if (allSubjectPackages.length === 0) {
      allSubjectPackages.push(chosenInfo);
    }
  }

  const kodePaket = (
    chosenInfo?.kodePaket ||
    matchedResult?.kode_soal ||
    student.kode_soal ||
    student.variasi_paket ||
    (absenInfo.isGanjil ? 'PAKET-A' : 'PAKET-B')
  )
    .trim()
    .toUpperCase();

  const namaPaketSoal = (
    chosenInfo?.namaPaketSoal ||
    assignedExam?.judul_ujian ||
    kodePaket
  ).trim();

  const mataPelajaran = (
    chosenInfo?.mataPelajaran ||
    getEffectiveMataPelajaran(assignedExam)
  ).trim();

  const tokenUjianHariIni = (
    chosenInfo?.tokenUjian ||
    (assignedExam ? getEffectiveExamSessionToken(assignedExam) : tokenSistemAsli)
  )
    .trim()
    .toUpperCase();

  const paketLengkapLabel =
    namaPaketSoal.toUpperCase() === kodePaket
      ? `${kodePaket} (${mataPelajaran})`
      : `${namaPaketSoal} [${kodePaket}]`;

  const allSubjectTokensLabel =
    allSubjectPackages.length > 0
      ? allSubjectPackages
          .map(
            (p) =>
              `${p.mataPelajaran} (${p.namaPaketSoal} · ${p.kodePaket}): Token Ujian = ${p.tokenUjian}`
          )
          .join('   |   ')
      : `${mataPelajaran} (${paketLengkapLabel}): Token Ujian = ${tokenUjianHariIni}`;

  return {
    student,
    noAbsen: absenInfo.noAbsen,
    isGanjil: absenInfo.isGanjil,
    ganjilGenapLabel: absenInfo.ganjilGenapLabel,
    tingkat,
    tokenLogin,
    tokenSistemAsli,
    hasCustomPassword,
    kodePaket,
    namaPaketSoal,
    mataPelajaran,
    paketLengkapLabel,
    tokenUjianHariIni,
    allSubjectPackages,
    allSubjectTokensLabel,
    assignedExam,
    matchedResult,
    score,
    predikatLabel,
    statusLabel,
    pelanggaranTab: matchedResult?.pelanggaran_tab || 0,
  };
}

function stripMarkupForPdf(input: string | undefined | null): string {
  if (!input) return '-';
  const stripped = String(input)
    .replace(/\[IMG:[^\]]+\]/gi, ' [Gambar Ilustrasi Soal] ')
    .replace(/<img\b[^>]*>/gi, ' [Gambar Ilustrasi Soal] ')
    .replace(/\[(?:RUMUS|EQ):([^\]]+)\]/gi, '$1')
    .replace(/\\ce\{([^{}]+)\}/g, '$1')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\vec\{([^{}]+)\}/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\$+/g, '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
    .replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, 'akar_$1($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\rightleftharpoons/g, ' <=> ')
    .replace(/\\rightarrow|\\to/g, ' -> ')
    .replace(/\\leftarrow/g, ' <- ')
    .replace(/\\pm/g, '+/-')
    .replace(/\\times/g, ' x ')
    .replace(/\\cdot/g, ' . ')
    .replace(/\\Delta/g, 'Delta ')
    .replace(/\\Omega/g, ' Ohm ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
  return cleanPdfText(stripped);
}

/**
 * Helper to sanitize text for standard PDF fonts (Latin1 safe)
 */
function cleanPdfText(input: string | undefined | null): string {
  if (!input) return '-';
  return String(input)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, ' | ')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')
    .trim();
}

function getScoreBadgeColors(score: number | null | undefined): {
  bg: [number, number, number];
  border: [number, number, number];
  text: [number, number, number];
  label: string;
} {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return {
      bg: [241, 245, 249],
      border: [203, 213, 225],
      text: [71, 85, 105],
      label: 'Belum Ujian',
    };
  }
  if (score >= 85) {
    return {
      bg: [236, 253, 245],
      border: [16, 185, 129],
      text: [6, 95, 70],
      label: 'Sangat Baik (A)',
    };
  }
  if (score >= 70) {
    return {
      bg: [239, 246, 255],
      border: [59, 130, 246],
      text: [30, 64, 175],
      label: 'Baik (B)',
    };
  }
  if (score >= 55) {
    return {
      bg: [255, 251, 235],
      border: [245, 158, 11],
      text: [146, 64, 14],
      label: 'Cukup (C)',
    };
  }
  return {
    bg: [254, 242, 242],
    border: [239, 68, 68],
    text: [153, 27, 27],
    label: 'Perlu Penguatan (D)',
  };
}

/**
 * 1. GENERATE KARTU PESERTA, TOKEN LOGIN, TOKEN UJIAN & HASIL NILAI UJIAN (GRID 8 KARTU PER HALAMAN + REKAP TABEL PRESISI)
 */
export function downloadStudentTokenCardsPdf(
  students: StudentItem[],
  options: TokenCardPdfOptions = {}
): void {
  if (!students || students.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const rosterPool =
    options.allStudents && options.allStudents.length > 0
      ? options.allStudents
      : students;

  const precisionRecords: StudentPrecisionRecord[] = students.map((st) =>
    resolveStudentPrecisionRecord({
      student: st,
      allStudents: rosterPool,
      exams: options.exams || [],
      results: options.results || [],
      questions: options.questions || [],
      preferredExamId: options.preferredExamId,
    })
  );

  const nowStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const kelasHeader = options.kelasLabel || 'Semua Kelas';

  // Optional Page 1: Summary Table of Token Login, Paket Soal, Token Ujian & Score if requested and >1 student
  if (options.includeSummaryPage && precisionRecords.length > 1) {
    drawSummaryTablePages(doc, precisionRecords, kelasHeader, nowStr);
    doc.addPage();
  }

  // Draw Grid of 8 Cards per A4 Page (2 columns x 4 rows)
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 10;
  const marginY = 18;
  const gapX = 6;
  const gapY = 5;
  const cardWidth = (pageWidth - marginX * 2 - gapX) / 2; // 92mm
  const cardHeight = (pageHeight - marginY - 12 - gapY * 3) / 4; // 63mm

  const cardsPerPage = 8;
  const totalCardPages = Math.ceil(precisionRecords.length / cardsPerPage);

  precisionRecords.forEach((rec, idx) => {
    const posInPage = idx % cardsPerPage;
    const currentCardPage = Math.floor(idx / cardsPerPage) + 1;

    if (idx > 0 && posInPage === 0) {
      doc.addPage();
    }

    // Draw Page Top Header on first card of the page (truncated cleanly so left and right never overlap)
    if (posInPage === 0) {
      doc.setFillColor(30, 58, 138); // Deep royal blue
      doc.rect(0, 0, pageWidth, 12, 'F');
      doc.setFillColor(16, 185, 129); // Emerald accent line
      doc.rect(0, 12, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      const rawLeftHeader = cleanPdfText(
        `KARTU TOKEN LOGIN, TOKEN UJIAN & NILAI CBT — ${kelasHeader.toUpperCase()}`
      );
      const safeLeftHeader =
        rawLeftHeader.length > 64
          ? rawLeftHeader.slice(0, 62) + '...'
          : rawLeftHeader;
      doc.text(safeLeftHeader, marginX, 7.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(
        `Hal. Kartu ${currentCardPage}/${totalCardPages}  |  Cetak: ${cleanPdfText(nowStr)}`,
        pageWidth - marginX,
        7.8,
        { align: 'right' }
      );
    }

    const col = posInPage % 2;
    const row = Math.floor(posInPage / 2);
    const x = marginX + col * (cardWidth + gapX);
    const y = marginY + row * (cardHeight + gapY);

    const {
      student,
      noAbsen,
      ganjilGenapLabel,
      tokenLogin,
      kodePaket,
      namaPaketSoal,
      mataPelajaran,
      tokenUjianHariIni,
      score,
      statusLabel,
    } = rec;

    // Card outer border & subtle background
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

    // Card Top Banner (Colorful header inside card)
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.roundedRect(x, y, cardWidth, 11.2, 2.5, 2.5, 'F');
    doc.rect(x, y + 8, cardWidth, 3.2, 'F'); // square bottom corners of header

    // Accent stripe under card header
    doc.setFillColor(245, 158, 11); // Amber-500
    doc.rect(x, y + 11.2, cardWidth, 0.9, 'F');

    // Card Header Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('KARTU PESERTA, TOKEN LOGIN & TOKEN UJIAN CBT', x + 3.2, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.1);
    doc.setTextColor(219, 234, 254);
    const subBannerText = cleanPdfText(
      `Mapel: ${mataPelajaran}  |  Absen #${noAbsen} (${ganjilGenapLabel})`
    );
    doc.text(
      subBannerText.length > 44 ? subBannerText.slice(0, 42) + '...' : subBannerText,
      x + 3.2,
      y + 8.9
    );

    // Package Code Badge in Top Right of Card
    const badgeW = Math.min(24, Math.max(17, kodePaket.length * 2.1 + 4));
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(
      x + cardWidth - badgeW - 2.8,
      y + 2.3,
      badgeW,
      6.4,
      1.2,
      1.2,
      'F'
    );
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(251, 191, 36); // Amber-400 text
    doc.text(
      cleanPdfText(kodePaket).slice(0, 11),
      x + cardWidth - badgeW / 2 - 2.8,
      y + 6.5,
      { align: 'center' }
    );

    // Student Identity & Assigned Package Section
    const bodyY = y + 15.2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text('NAMA PESERTA UJIAN:', x + 3.2, bodyY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(30, 64, 175);
    const klsShort = cleanPdfText(student.kelas);
    doc.text(
      klsShort.length > 22 ? klsShort.slice(0, 20) + '..' : klsShort,
      x + cardWidth - 3.2,
      bodyY,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    const cleanName = cleanPdfText(`${noAbsen}. ${student.nama}`);
    const truncatedName =
      cleanName.length > 36 ? cleanName.slice(0, 34) + '...' : cleanName;
    doc.text(truncatedName, x + 3.2, bodyY + 4.1);

    // Assigned Paket Soal Strip (Indigo-50 highlight bar showing exact Paket Soal & Mapel)
    const pkgBarY = bodyY + 6.2;
    doc.setFillColor(238, 242, 255); // Indigo-50
    doc.setDrawColor(199, 210, 254); // Indigo-200
    doc.setLineWidth(0.28);
    doc.roundedRect(x + 3.2, pkgBarY, cardWidth - 6.4, 8.2, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(67, 56, 202); // Indigo-700
    doc.text(
      `PAKET SOAL DIDAPAT (${ganjilGenapLabel}):`,
      x + 5,
      pkgBarY + 3.1
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(15, 23, 42);
    const fullPkgTitle = cleanPdfText(
      `[${kodePaket}] ${namaPaketSoal} (${mataPelajaran})`
    );
    doc.text(
      fullPkgTitle.length > 46 ? fullPkgTitle.slice(0, 44) + '...' : fullPkgTitle,
      x + 5,
      pkgBarY + 6.7
    );

    // 3 Precision Highlight Boxes Side-by-Side:
    // 1) TOKEN LOGIN AKUN   2) TOKEN UJIAN HARI INI   3) NILAI & STATUS CBT
    const boxY = bodyY + 16;
    const innerW = cardWidth - 6.4; // 85.6mm
    const boxGap = 2;
    const singleBoxW = (innerW - boxGap * 2) / 3; // ~27.2mm
    const boxH = 16.2;

    // BOX 1: TOKEN LOGIN AKUN SISWA (Blue)
    const box1X = x + 3.2;
    doc.setFillColor(239, 246, 255); // Blue-50
    doc.setDrawColor(147, 197, 253); // Blue-300
    doc.setLineWidth(0.32);
    doc.roundedRect(box1X, boxY, singleBoxW, boxH, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(29, 78, 216);
    doc.text('TOKEN LOGIN AKUN', box1X + singleBoxW / 2, boxY + 3.8, {
      align: 'center',
    });

    doc.setFont('courier', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      cleanPdfText(tokenLogin).slice(0, 10),
      box1X + singleBoxW / 2,
      boxY + 10.3,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.9);
    doc.setTextColor(71, 85, 105);
    doc.text('Login Portal Siswa', box1X + singleBoxW / 2, boxY + 14.3, {
      align: 'center',
    });

    // BOX 2: TOKEN UJIAN HARI INI / SESUAI PAKET SOAL (Amber / Gold Highlight)
    const box2X = box1X + singleBoxW + boxGap;
    doc.setFillColor(255, 251, 235); // Amber-50
    doc.setDrawColor(245, 158, 11); // Amber-500
    doc.setLineWidth(0.35);
    doc.roundedRect(box2X, boxY, singleBoxW, boxH, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(180, 83, 9); // Amber-700
    doc.text('TOKEN UJIAN HARI INI', box2X + singleBoxW / 2, boxY + 3.8, {
      align: 'center',
    });

    doc.setFont('courier', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(120, 53, 15); // Amber-900
    doc.text(
      cleanPdfText(tokenUjianHariIni).slice(0, 10),
      box2X + singleBoxW / 2,
      boxY + 10.3,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.9);
    doc.setTextColor(146, 64, 14);
    const shortPkgTag = cleanPdfText(`Sesuai ${kodePaket}`);
    doc.text(
      shortPkgTag.length > 16 ? shortPkgTag.slice(0, 16) : shortPkgTag,
      box2X + singleBoxW / 2,
      boxY + 14.3,
      { align: 'center' }
    );

    // BOX 3: HASIL NILAI / STATUS UJIAN CBT (Right)
    const badgeStyle = getScoreBadgeColors(score);
    const box3X = box2X + singleBoxW + boxGap;
    doc.setFillColor(...badgeStyle.bg);
    doc.setDrawColor(...badgeStyle.border);
    doc.setLineWidth(0.32);
    doc.roundedRect(box3X, boxY, singleBoxW, boxH, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(...badgeStyle.text);
    doc.text('NILAI & STATUS CBT', box3X + singleBoxW / 2, boxY + 3.8, {
      align: 'center',
    });

    if (typeof score === 'number') {
      doc.setFont('courier', 'bold');
      doc.setFontSize(10.5);
      doc.text(`${score}/100`, box3X + singleBoxW / 2, boxY + 10.1, {
        align: 'center',
      });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.8);
      doc.text(
        cleanPdfText(badgeStyle.label),
        box3X + singleBoxW / 2,
        boxY + 14.3,
        { align: 'center' }
      );
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(
        cleanPdfText(statusLabel),
        box3X + singleBoxW / 2,
        boxY + 10.1,
        { align: 'center' }
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.9);
      doc.text('Siap Digunakan', box3X + singleBoxW / 2, boxY + 14.3, {
        align: 'center',
      });
    }

    // Card Footer Instructions with exact tokens
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.4);
    doc.setTextColor(71, 85, 105);
    const footerInstruction = cleanPdfText(
      `1. Login Akun (${tokenLogin}) -> 2. Pilih Paket ${kodePaket} -> 3. Masukkan Token Ujian (${tokenUjianHariIni})`
    );
    doc.text(
      footerInstruction.length > 68
        ? footerInstruction.slice(0, 66) + '..'
        : footerInstruction,
      x + cardWidth / 2,
      y + cardHeight - 2.2,
      { align: 'center' }
    );
  });

  const safeFileSlug = cleanPdfText(kelasHeader)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`kartu-token-dan-nilai-cbt-${safeFileSlug || 'semua'}.pdf`);
}

/**
 * Helper to draw precision summary table pages before the cards
 */
function drawSummaryTablePages(
  doc: jsPDF,
  records: StudentPrecisionRecord[],
  kelasHeader: string,
  nowStr: string
): void {
  const pageWidth = 210;
  const marginX = 12;
  const tableWidth = pageWidth - marginX * 2; // 186mm

  // Calculate score stats
  const scores: number[] = [];
  records.forEach((rec) => {
    if (typeof rec.score === 'number') {
      scores.push(rec.score);
    }
  });

  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;
  const minScore = scores.length > 0 ? Math.min(...scores) : null;

  // Collect distinct Paket Soal & Token Ujian Hari Ini present in this class/group
  const distinctPackagesMap = new Map<
    string,
    {
      kodePaket: string;
      namaPaketSoal: string;
      mataPelajaran: string;
      tokenUjian: string;
      count: number;
    }
  >();

  records.forEach((rec) => {
    const key = `${rec.kodePaket}__${rec.namaPaketSoal}__${rec.tokenUjianHariIni}`;
    const existing = distinctPackagesMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      distinctPackagesMap.set(key, {
        kodePaket: rec.kodePaket,
        namaPaketSoal: rec.namaPaketSoal,
        mataPelajaran: rec.mataPelajaran,
        tokenUjian: rec.tokenUjianHariIni,
        count: 1,
      });
    }
  });
  const distinctPackages = Array.from(distinctPackagesMap.values());
  const primaryTokenSummary =
    distinctPackages.length === 1
      ? `${distinctPackages[0].tokenUjian} (${distinctPackages[0].kodePaket})`
      : distinctPackages
          .slice(0, 2)
          .map((d) => `${d.kodePaket}:${d.tokenUjian}`)
          .join(' | ');

  const rowsPerPage = 25;
  const totalPages = Math.ceil(records.length / rowsPerPage);

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();

    // Top Header Banner
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 22, pageWidth, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'REKAPITULASI TOKEN LOGIN, TOKEN UJIAN, PAKET SOAL & NILAI CBT',
      marginX,
      9.8
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(219, 234, 254);
    doc.text(
      cleanPdfText(
        `Filter Kelas: ${kelasHeader}  |  Total Peserta: ${records.length} Siswa  |  Tanggal Cetak: ${nowStr}`
      ),
      marginX,
      16.5
    );

    let startY = 27.5;

    // KPI Summary Boxes & Active Package Token Banner on Page 1
    if (p === 0) {
      const kpiW = (tableWidth - 9) / 4;
      const kpis = [
        {
          label: 'TOTAL PESERTA',
          val: `${records.length} Siswa`,
          bg: [239, 246, 255] as [number, number, number],
          text: [30, 64, 175] as [number, number, number],
        },
        {
          label: 'SUDAH DINILAI',
          val: `${scores.length} Siswa`,
          bg: [236, 253, 245] as [number, number, number],
          text: [6, 95, 70] as [number, number, number],
        },
        {
          label: 'RATA-RATA & MAX/MIN',
          val:
            avgScore !== null
              ? `${avgScore} (${maxScore}/${minScore})`
              : '- (- / -)',
          bg: [245, 243, 255] as [number, number, number],
          text: [91, 33, 182] as [number, number, number],
        },
        {
          label: 'TOKEN UJIAN HARI INI',
          val: cleanPdfText(primaryTokenSummary || '-').slice(0, 18),
          bg: [255, 251, 235] as [number, number, number],
          text: [180, 83, 9] as [number, number, number],
        },
      ];

      kpis.forEach((k, idx) => {
        const kx = marginX + idx * (kpiW + 3);
        doc.setFillColor(...k.bg);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(kx, startY, kpiW, 13, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(k.label, kx + 2.8, startY + 4.6);

        doc.setFont('courier', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(...k.text);
        doc.text(k.val, kx + 2.8, startY + 10.3);
      });

      startY += 15.5;

      // Active Paket Soal & Token Ujian Hari Ini Reference Box
      const pkgLines = distinctPackages.map(
        (d) =>
          `[${d.mataPelajaran}] ${d.namaPaketSoal} (${d.kodePaket} - ${d.count} Siswa)  ->  TOKEN UJIAN HARI INI: ${d.tokenUjian}`
      );
      const bannerH = Math.min(18, 5.5 + Math.min(pkgLines.length, 3) * 3.8);
      doc.setFillColor(255, 251, 235); // Amber-50
      doc.setDrawColor(245, 158, 11); // Amber-500
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX, startY, tableWidth, bannerH, 1.8, 1.8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(146, 64, 14);
      doc.text(
        'DAFTAR PAKET SOAL & TOKEN SESI UJIAN HARI INI (SESUAI DISTRIBUSI PESERTA):',
        marginX + 3,
        startY + 4.2
      );

      doc.setFont('courier', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      pkgLines.slice(0, 3).forEach((line, lIdx) => {
        const cleanLine = cleanPdfText(line);
        doc.text(
          cleanLine.length > 105 ? cleanLine.slice(0, 103) + '...' : cleanLine,
          marginX + 3,
          startY + 8.2 + lIdx * 3.6
        );
      });

      startY += bannerH + 3;
    }

    // Precision 7-Column Table Header (Total = 186mm)
    // 1. NO (12mm) | 2. NAMA LENGKAP SISWA (48mm) | 3. KELAS (23mm) | 4. PAKET SOAL DIDAPAT (40mm) | 5. TOKEN LOGIN (20mm) | 6. TOKEN UJIAN (20mm) | 7. NILAI & STATUS (23mm)
    const colWidths = [12, 48, 23, 40, 20, 20, 23];
    const headers = [
      'NO',
      'NAMA LENGKAP SISWA',
      'KELAS',
      'PAKET SOAL DIDAPAT',
      'TOKEN LOGIN',
      'TOKEN UJIAN',
      'NILAI / STATUS',
    ];

    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, startY, tableWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);

    let cx = marginX;
    headers.forEach((h, i) => {
      doc.text(h, cx + 1.5, startY + 5.2);
      cx += colWidths[i];
    });

    startY += 8;

    const slice = records.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    slice.forEach((rec, idx) => {
      const rowH = 7.4;

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, startY, tableWidth, rowH, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, startY + rowH, pageWidth - marginX, startY + rowH);

      let rx = marginX;

      // 1. NO ABSEN + GANJIL/GENAP
      doc.setFont('courier', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${rec.noAbsen} ${rec.isGanjil ? 'Gjl' : 'Gnp'}`,
        rx + 1.5,
        startY + 5
      );
      rx += colWidths[0];

      // 2. NAMA LENGKAP SISWA
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      const nameStr = cleanPdfText(rec.student.nama);
      doc.text(
        nameStr.length > 27 ? nameStr.slice(0, 25) + '..' : nameStr,
        rx + 1.5,
        startY + 5
      );
      rx += colWidths[1];

      // 3. KELAS
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(51, 65, 85);
      doc.text(cleanPdfText(rec.student.kelas).slice(0, 13), rx + 1.5, startY + 5);
      rx += colWidths[2];

      // 4. PAKET SOAL DIDAPAT (Kode Paket + Judul Paket Soal)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(55, 48, 163); // Indigo-800
      const pkgText = cleanPdfText(`[${rec.kodePaket}] ${rec.namaPaketSoal}`);
      doc.text(
        pkgText.length > 25 ? pkgText.slice(0, 23) + '..' : pkgText,
        rx + 1.5,
        startY + 5
      );
      rx += colWidths[3];

      // 5. TOKEN LOGIN AKUN SISWA
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(29, 78, 216); // Blue-700
      doc.text(cleanPdfText(rec.tokenLogin).slice(0, 9), rx + 1.5, startY + 5);
      rx += colWidths[4];

      // 6. TOKEN UJIAN HARI INI (SESUAI PAKET SOAL)
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(180, 83, 9); // Amber-700
      doc.text(
        cleanPdfText(rec.tokenUjianHariIni).slice(0, 9),
        rx + 1.5,
        startY + 5
      );
      rx += colWidths[5];

      // 7. NILAI & STATUS
      if (typeof rec.score === 'number') {
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(6, 95, 70);
        const shortGrade =
          rec.score >= 85
            ? 'A'
            : rec.score >= 70
              ? 'B'
              : rec.score >= 55
                ? 'C'
                : 'D';
        doc.text(`${rec.score}/100 (${shortGrade})`, rx + 1.5, startY + 5);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(100, 116, 139);
        doc.text(cleanPdfText(rec.statusLabel).slice(0, 13), rx + 1.5, startY + 5);
      }

      startY += rowH;
    });
  }
}

/**
 * 2. GENERATE SERTIFIKAT / KARTU HASIL NILAI & EVALUASI INDIVIDU SISWA (.PDF)
 */
export function downloadSingleStudentResultPdf(
  params: SingleStudentResultPdfParams
): void {
  const {
    student,
    allStudents,
    exams,
    exam,
    score,
    kategori,
    answeredCount,
    totalQuestions,
    tabViolations = 0,
    aiAnalysis,
    submittedAt,
    questions = [],
    studentAnswers = {},
  } = params;

  const precision = resolveStudentPrecisionRecord({
    student,
    allStudents: allStudents && allStudents.length > 0 ? allStudents : [student],
    exams: exams && exams.length > 0 ? exams : exam ? [exam] : [],
    preferredExamId: exam?.id ?? null,
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Outer Decorative Border
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(8, 8, pageWidth - 16, 281, 3, 3, 'S');

  // Top Colorful Institutional Banner
  doc.setFillColor(30, 58, 138); // Deep Royal Blue
  doc.roundedRect(10, 10, pageWidth - 20, 32, 2.5, 2.5, 'F');
  doc.setFillColor(16, 185, 129); // Emerald Accent Strip
  doc.rect(10, 40, pageWidth - 20, 2, 'F');

  // Emblem Box
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX + 2, 16, 16, 16, 2, 2, 'F');
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text('CBT', marginX + 10, 25.5, { align: 'center' });

  // Banner Text
  const mapelUpper = cleanPdfText(precision.mataPelajaran || 'SOSIOLOGI').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `KARTU HASIL NILAI & TOKEN UJIAN CBT ${mapelUpper}`.slice(0, 52),
    marginX + 22,
    21
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(219, 234, 254);
  doc.text(
    `Sistem Asesmen & Evaluasi Kompetensi SMA — Mapel: ${cleanPdfText(precision.mataPelajaran)}`,
    marginX + 22,
    27
  );

  const dateText =
    submittedAt ||
    new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  doc.setFontSize(7.5);
  doc.setTextColor(167, 243, 208);
  doc.text(`Tanggal Dokumen: ${cleanPdfText(dateText)}`, marginX + 22, 33);

  // Student Identity & Token Card Box + Hero Score Box
  let y = 49;

  // Left Box: Student Identity & Token Card (Width 116mm)
  const leftW = 116;
  const rightW = contentWidth - leftW - 5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, y, leftW, 46, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(37, 99, 235);
  doc.text(
    'IDENTITAS PESERTA, PAKET SOAL & TOKEN UJIAN',
    marginX + 5,
    y + 6.5
  );

  doc.setDrawColor(226, 232, 240);
  doc.line(marginX + 5, y + 9, marginX + leftW - 5, y + 9);

  const infoRows: Array<[string, string]> = [
    [
      'Nama Peserta',
      cleanPdfText(
        `${student.nama} (Absen #${precision.noAbsen} ${precision.ganjilGenapLabel})`
      ),
    ],
    ['Kelas / Rombel', cleanPdfText(student.kelas)],
    [
      'Paket Soal Didapat',
      cleanPdfText(
        `[${precision.kodePaket}] ${exam?.judul_ujian || precision.namaPaketSoal}`
      ),
    ],
    [
      'Token Login & Ujian',
      cleanPdfText(
        `Login: ${precision.tokenLogin}  |  Token Ujian: ${precision.tokenUjianHariIni}`
      ),
    ],
    [
      'Integritas Ujian',
      tabViolations > 0
        ? `${tabViolations} Catatan Pindah Tab`
        : '0 Pelanggaran (Tertib & Jujur)',
    ],
  ];

  let ry = y + 14.5;
  infoRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(100, 116, 139);
    doc.text(label, marginX + 4.5, ry);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const trimmedVal = val.length > 32 ? val.slice(0, 30) + '..' : val;
    doc.text(`: ${trimmedVal}`, marginX + 31, ry);
    ry += 5.5;
  });

  // Two stacked precision token pills on the right of Left Box (Token Login & Token Ujian)
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(marginX + leftW - 31, y + 11, 27, 14, 1.8, 1.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(37, 99, 235);
  doc.text('TOKEN LOGIN', marginX + leftW - 17.5, y + 15, { align: 'center' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    cleanPdfText(precision.tokenLogin).slice(0, 8),
    marginX + leftW - 17.5,
    y + 21.8,
    { align: 'center' }
  );

  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(marginX + leftW - 31, y + 27, 27, 14, 1.8, 1.8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(180, 83, 9);
  doc.text('TOKEN UJIAN', marginX + leftW - 17.5, y + 31, { align: 'center' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(120, 53, 15);
  doc.text(
    cleanPdfText(precision.tokenUjianHariIni).slice(0, 8),
    marginX + leftW - 17.5,
    y + 37.8,
    { align: 'center' }
  );

  // Right Box: Hero Score Card
  const badgeStyle = getScoreBadgeColors(score);
  const rightX = marginX + leftW + 5;
  doc.setFillColor(...badgeStyle.bg);
  doc.setDrawColor(...badgeStyle.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(rightX, y, rightW, 46, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...badgeStyle.text);
  doc.text(
    `NILAI AKHIR CBT ${mapelUpper}`.slice(0, 26),
    rightX + rightW / 2,
    y + 8,
    {
      align: 'center',
    }
  );

  doc.setFont('courier', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...badgeStyle.text);
  doc.text(`${score}`, rightX + rightW / 2, y + 24, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Skala Nilai 0 - 100', rightX + rightW / 2, y + 30.5, {
    align: 'center',
  });

  // Predikat Pill
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(rightX + 6, y + 34, rightW - 12, 8, 1.8, 1.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...badgeStyle.text);
  doc.text(
    cleanPdfText(kategori || badgeStyle.label),
    rightX + rightW / 2,
    y + 39.2,
    { align: 'center' }
  );

  y += 53;

  // Visual Score Progress Bar
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginX, y, contentWidth, 9, 2, 2, 'F');
  const barWidth = Math.max(6, Math.min(100, score)) * ((contentWidth - 2) / 100);
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(marginX + 1, y + 1, barWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(score >= 30 ? 255 : 30, score >= 30 ? 255 : 41, score >= 30 ? 255 : 59);
  doc.text(
    `Capaian Skor Akhir: ${score}/100${
      typeof answeredCount === 'number' && typeof totalQuestions === 'number'
        ? `  (${answeredCount} dari ${totalQuestions} Soal Terjawab)`
        : ''
    }`,
    marginX + 5,
    y + 5.8
  );

  y += 15;

  // Cognitive Evaluation Section (if available)
  if (aiAnalysis) {
    doc.setFillColor(238, 242, 255); // Indigo-50
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(marginX, y, contentWidth, 8.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 48, 163);
    doc.text(
      'RINGKASAN EVALUASI KOMPETENSI SOSIOLOGI (LOTS & HOTS)',
      marginX + 4,
      y + 5.7
    );
    y += 12;

    // Evaluasi HOTS Narrative
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('1. Analisis Penalaran Kognitif Sosiologi:', marginX, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const hotsLines = doc.splitTextToSize(
      cleanPdfText(aiAnalysis.evaluasi_hots),
      contentWidth - 4
    );
    doc.text(hotsLines.slice(0, 6), marginX + 2, y);
    y += Math.min(hotsLines.length, 6) * 4.2 + 4;

    // Kekuatan & Area Penguatan Side-by-Side
    const colW = (contentWidth - 4) / 2;
    const boxH = 42;

    // Kekuatan Box
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(marginX, y, colW, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(6, 95, 70);
    doc.text('Kekuatan Kompetensi Materi', marginX + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(30, 41, 59);
    let ky = y + 11;
    (aiAnalysis.analisis_kompetensi?.kekuatan || []).slice(0, 3).forEach((item) => {
      const wrapped = doc.splitTextToSize(`- ${cleanPdfText(item)}`, colW - 8);
      doc.text(wrapped.slice(0, 3), marginX + 4, ky);
      ky += Math.min(wrapped.length, 3) * 3.8 + 1.5;
    });

    // Kelemahan Box
    const rightColX = marginX + colW + 4;
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(rightColX, y, colW, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(146, 64, 14);
    doc.text('Materi yang Perlu Diperkuat', rightColX + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(30, 41, 59);
    let wy = y + 11;
    (aiAnalysis.analisis_kompetensi?.kelemahan || []).slice(0, 3).forEach((item) => {
      const wrapped = doc.splitTextToSize(`- ${cleanPdfText(item)}`, colW - 8);
      doc.text(wrapped.slice(0, 3), rightColX + 4, wy);
      wy += Math.min(wrapped.length, 3) * 3.8 + 1.5;
    });

    y += boxH + 6;

    // 3 Rekomendasi Belajar Box
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(marginX, y, contentWidth, 38, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text('3 Rekomendasi Belajar Sosiologi Terarah:', marginX + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    let recY = y + 11.5;
    (aiAnalysis.rekomendasi_belajar || []).slice(0, 3).forEach((rec, i) => {
      const wrapped = doc.splitTextToSize(
        `${i + 1}. ${cleanPdfText(rec)}`,
        contentWidth - 8
      );
      doc.text(wrapped.slice(0, 2), marginX + 4, recY);
      recY += Math.min(wrapped.length, 2) * 4 + 1.5;
    });
  } else {
    // Summary Verification Box when AI Evaluation has not been generated yet
    const evalSummary =
      questions.length > 0
        ? calculateExamScore(questions, studentAnswers)
        : null;
    const fullRightCount = evalSummary
      ? evalSummary.breakdown.filter((b) => b.status === 'Benar Penuh').length
      : 0;
    const partialRightCount = evalSummary
      ? evalSummary.breakdown.filter((b) => b.status === 'Benar Sebagian')
          .length
      : 0;
    const wrongOrEmptyCount = evalSummary
      ? evalSummary.breakdown.filter((b) => b.status === 'Salah').length
      : 0;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, y, contentWidth, 38, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text(
      'RINGKASAN CAPAIAN BUTIR SOAL & BUKTI HASIL UJIAN CBT',
      marginX + 5,
      y + 7.5
    );

    if (evalSummary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(6, 95, 70);
      doc.text(
        `Benar Penuh: ${fullRightCount} Soal`,
        marginX + 5,
        y + 14.5
      );
      doc.setTextColor(180, 83, 9);
      doc.text(
        `Benar Sebagian (PGK): ${partialRightCount} Soal`,
        marginX + 52,
        y + 14.5
      );
      doc.setTextColor(190, 18, 60);
      doc.text(
        `Salah / Kosong: ${wrongOrEmptyCount} Soal`,
        marginX + 114,
        y + 14.5
      );
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105);
    const noteLines = doc.splitTextToSize(
      'Dokumen ini merupakan bukti resmi penyelesaian ujian CBT beserta rincian lengkap lembar jawaban siswa per butir soal di halaman berikutnya agar siswa dapat mempelajari kembali letak jawaban benar maupun konsep yang masih keliru.',
      contentWidth - 10
    );
    doc.text(noteLines, marginX + 5, y + (evalSummary ? 21 : 15));
  }

  // Page 1 Footer Stamp
  const drawPageFooter = (pageNum: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, 281, pageWidth - marginX, 281);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Dokumen Resmi CBT — ${cleanPdfText(student.nama)} (${cleanPdfText(student.kelas)})`,
      marginX,
      285.5
    );
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.text(
      `Login: ${cleanPdfText(precision.tokenLogin)} | Token Ujian: ${cleanPdfText(precision.tokenUjianHariIni)} | Paket: ${cleanPdfText(precision.kodePaket)} | Skor: ${score}/100 | Hal. ${pageNum}`,
      pageWidth - marginX,
      285.5,
      { align: 'right' }
    );
  };

  let currentPageNumber = 1;
  drawPageFooter(currentPageNumber);

  // =========================================================================
  // HALAMAN RINCIAN SOAL, OPSI JAWABAN SISWA, KUNCI & STATUS BENAR/SALAH
  // =========================================================================
  if (questions && questions.length > 0) {
    const scoreBreakdown = calculateExamScore(questions, studentAnswers);
    const breakdownMap = new Map<string, (typeof scoreBreakdown.breakdown)[0]>();
    scoreBreakdown.breakdown.forEach((b) =>
      breakdownMap.set(String(b.questionId), b)
    );

    const drawReviewPageHeader = () => {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.roundedRect(8, 8, pageWidth - 16, 281, 3, 3, 'S');

      doc.setFillColor(30, 58, 138);
      doc.roundedRect(10, 10, pageWidth - 20, 18, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(255, 255, 255);
      doc.text(
        'RINCIAN LEMBAR JAWABAN SISWA, TEKS SOAL & PEMBAHASAN KUNCI JAWABAN',
        marginX,
        17.5
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(219, 234, 254);
      doc.text(
        `Peserta: ${cleanPdfText(student.nama)} (${cleanPdfText(student.kelas)})  |  Ujian: ${cleanPdfText(exam?.judul_ujian || 'CBT')}  |  Nilai Akhir: ${score}/100  |  Poin Mentah: ${scoreBreakdown.rawEarned}/${scoreBreakdown.rawMax}`,
        marginX,
        23.5
      );
      return 33;
    };

    doc.addPage('a4', 'portrait');
    currentPageNumber++;
    let curY = drawReviewPageHeader();

    // Legend Box at top of first review page
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, curY, contentWidth, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(6, 95, 70);
    doc.text('[BENAR PENUH] = Jawaban Tepat 100%', marginX + 3, curY + 5.2);
    doc.setTextColor(180, 83, 9);
    doc.text(
      '[BENAR SEBAGIAN] = Dapat Poin Parsial (PG Kompleks)',
      marginX + 60,
      curY + 5.2
    );
    doc.setTextColor(190, 18, 60);
    doc.text(
      '[SALAH / KOSONG] = Belum Tepat (0 Poin)',
      marginX + 132,
      curY + 5.2
    );
    curY += 11;

    const optionKeys: ('A' | 'B' | 'C' | 'D' | 'E')[] = ['A', 'B', 'C', 'D', 'E'];

    questions.forEach((q, idx) => {
      const qIdStr = String(q.id);
      const qEval = breakdownMap.get(qIdStr);
      const chosenRaw = studentAnswers[qIdStr] || [];
      const chosen = Array.isArray(chosenRaw)
        ? chosenRaw.map((c) => c.toUpperCase().trim())
        : [];
      const correctKeys = (q.kunci_jawaban || []).map((k) =>
        k.toUpperCase().trim()
      );
      const status = qEval?.status || 'Salah';
      const earned = qEval?.earnedPoints ?? 0;
      const maxPts = qEval?.maxPoints ?? (q.tipe_soal === 'Kompleks' ? 3 : 2);
      const isKompleks = (q.tipe_soal || '').toLowerCase().includes('kompleks');

      // Prepare optional stimulus / wacana lines (FULL, NO TRUNCATION)
      const rawWacana = q.data_opsi?.wacana ? String(q.data_opsi.wacana).trim() : '';
      const wacanaLines: string[] = rawWacana
        ? (doc.splitTextToSize(
            `Wacana / Stimulus: ${stripMarkupForPdf(rawWacana)}`,
            contentWidth - 10
          ) as string[])
        : [];

      // Prepare full question text lines (FULL, NO TRUNCATION)
      const qTextClean = stripMarkupForPdf(q.teks_soal);
      const qTextLines = doc.splitTextToSize(
        qTextClean,
        contentWidth - 8
      ) as string[];

      // Prepare full options lines (FULL, NO TRUNCATION)
      const optRows: Array<{
        key: 'A' | 'B' | 'C' | 'D' | 'E';
        lines: string[];
        isChosen: boolean;
        isKey: boolean;
      }> = [];

      optionKeys.forEach((optKey) => {
        const rawOpt = q.data_opsi?.opsi?.[optKey];
        if (!rawOpt && rawOpt !== '') return;
        const isChosen = chosen.includes(optKey);
        const isKey = correctKeys.includes(optKey);

        let tagSuffix = '';
        if (isChosen && isKey) {
          tagSuffix = '  [Dipilih Siswa - BENAR]';
        } else if (isChosen && !isKey) {
          tagSuffix = '  [Dipilih Siswa - KURANG TEPAT]';
        } else if (!isChosen && isKey) {
          tagSuffix = '  [Kunci Jawaban Benar]';
        }

        const optClean = `${optKey}. ${stripMarkupForPdf(rawOpt)}${tagSuffix}`;
        const wrappedOpt = doc.splitTextToSize(
          optClean,
          contentWidth - 14
        ) as string[];
        optRows.push({
          key: optKey,
          lines: wrappedOpt,
          isChosen,
          isKey,
        });
      });

      const totalWacanaHeight =
        wacanaLines.length > 0 ? wacanaLines.length * 3.6 + 4.5 : 0;
      const totalQTextHeight = qTextLines.length * 3.8 + 2;
      const totalOptLines = optRows.reduce((acc, r) => acc + r.lines.length, 0);
      const totalOptsHeight = totalOptLines * 3.6 + optRows.length * 1.4;
      const estimatedCardHeight =
        9 + totalWacanaHeight + totalQTextHeight + totalOptsHeight + 8.5;

      // If the question fits on a single page but would overflow the current page, start a new page first
      if (curY + Math.min(estimatedCardHeight, 55) > 274 || (estimatedCardHeight <= 238 && curY + estimatedCardHeight > 274)) {
        drawPageFooter(currentPageNumber);
        doc.addPage('a4', 'portrait');
        currentPageNumber++;
        curY = drawReviewPageHeader();
      }

      const applyCardColors = () => {
        if (status === 'Benar Penuh') {
          doc.setFillColor(240, 253, 244);
          doc.setDrawColor(134, 239, 172);
        } else if (status === 'Benar Sebagian') {
          doc.setFillColor(255, 251, 235);
          doc.setDrawColor(252, 211, 77);
        } else {
          doc.setFillColor(255, 241, 242);
          doc.setDrawColor(253, 164, 175);
        }
        doc.setLineWidth(0.35);
      };

      // If the entire question card fits on the current page, draw the full rounded card upfront
      const fitsInCurrentPage = curY + estimatedCardHeight <= 275;
      if (fitsInCurrentPage) {
        applyCardColors();
        doc.roundedRect(marginX, curY, contentWidth, estimatedCardHeight, 2, 2, 'FD');
      }

      const ensurePageSpace = (neededMm: number) => {
        if (innerY + neededMm > 272) {
          drawPageFooter(currentPageNumber);
          doc.addPage('a4', 'portrait');
          currentPageNumber++;
          curY = drawReviewPageHeader();
          innerY = curY + 4;
        }
      };

      // Card Header Strip
      let innerY = curY + 5.5;
      if (!fitsInCurrentPage) {
        applyCardColors();
        doc.roundedRect(marginX, curY, contentWidth, 8, 1.5, 1.5, 'FD');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Soal #${idx + 1}  (${isKompleks ? 'PG Kompleks / Multi-Jawaban' : 'Pilihan Ganda'})`,
        marginX + 3.5,
        innerY
      );

      // Status & Points Badge on Right
      const statusLabel =
        status === 'Benar Penuh'
          ? `BENAR PENUH (+${earned}/${maxPts} Poin)`
          : status === 'Benar Sebagian'
          ? `BENAR SEBAGIAN (+${earned}/${maxPts} Poin)`
          : `SALAH / BELUM TEPAT (0/${maxPts} Poin)`;

      if (status === 'Benar Penuh') {
        doc.setTextColor(6, 95, 70);
      } else if (status === 'Benar Sebagian') {
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setTextColor(190, 18, 60);
      }
      doc.text(statusLabel, marginX + contentWidth - 3.5, innerY, {
        align: 'right',
      });

      innerY += 4.5;

      // Render Stimulus / Wacana (if present) line by line so it is NEVER truncated
      if (wacanaLines.length > 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        wacanaLines.forEach((line) => {
          ensurePageSpace(4.2);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          doc.setTextColor(51, 65, 85);
          doc.text(line, marginX + 4, innerY);
          innerY += 3.6;
        });
        innerY += 1.5;
      }

      // Render Question Text line by line so it is NEVER truncated
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      qTextLines.forEach((line) => {
        ensurePageSpace(4.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(15, 23, 42);
        doc.text(line, marginX + 4, innerY);
        innerY += 3.8;
      });
      innerY += 1.5;

      // Render Options A-E line by line so they are NEVER truncated
      optRows.forEach((optRow) => {
        optRow.lines.forEach((optLine) => {
          ensurePageSpace(4.2);
          if (optRow.isChosen && optRow.isKey) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(6, 95, 70); // Green
          } else if (optRow.isChosen && !optRow.isKey) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(190, 18, 60); // Red
          } else if (!optRow.isChosen && optRow.isKey) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(29, 78, 216); // Blue highlight for missed key
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
          }
          doc.setFontSize(7.4);
          doc.text(optLine, marginX + 7, innerY);
          innerY += 3.6;
        });
        innerY += 1.2;
      });

      // Summary Footer inside Question Card
      ensurePageSpace(7);
      doc.setDrawColor(203, 213, 225);
      doc.line(
        marginX + 3.5,
        innerY - 0.5,
        marginX + contentWidth - 3.5,
        innerY - 0.5
      );
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(15, 23, 42);
      const chosenDisplay =
        chosen.length > 0 ? chosen.join(', ') : '(Tidak Dijawab / Kosong)';
      const keyDisplay = correctKeys.join(', ');
      doc.text(
        `Jawaban Siswa: [ ${chosenDisplay} ]    |    Kunci Jawaban: [ ${keyDisplay} ]`,
        marginX + 4,
        innerY + 3.6
      );

      curY = fitsInCurrentPage ? curY + estimatedCardHeight + 3.5 : innerY + 7;
    });

    drawPageFooter(currentPageNumber);
  }

  const safeName = cleanPdfText(student.nama)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`kartu-nilai-cbt-${safeName || student.token_ujian}.pdf`);
}
