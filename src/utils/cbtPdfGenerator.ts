import { jsPDF } from 'jspdf';
import {
  StudentItem,
  ResultItem,
  ExamItem,
  AnalisisAI,
  QuestionItem,
} from '../types/cbt';
import { extractTingkatFromKelas, calculateExamScore } from './cbtLogic';

export interface TokenCardPdfOptions {
  title?: string;
  subtitle?: string;
  kelasLabel?: string;
  exams?: ExamItem[];
  results?: ResultItem[];
  includeSummaryPage?: boolean;
}

export interface SingleStudentResultPdfParams {
  student: StudentItem;
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
 * 1. GENERATE KARTU PESERTA, TOKEN & HASIL NILAI UJIAN (GRID 8 KARTU PER HALAMAN + OPSIONAL REKAP TABEL)
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

  const resultsMap = new Map<number, ResultItem>();
  if (options.results) {
    options.results.forEach((r) => {
      const existing = resultsMap.get(Number(r.student_id));
      if (!existing || Number(r.id) > Number(existing.id)) {
        resultsMap.set(Number(r.student_id), r);
      }
    });
  }

  const examsMap = new Map<number, ExamItem>();
  if (options.exams) {
    options.exams.forEach((e) => examsMap.set(Number(e.id), e));
  }

  const nowStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const kelasHeader = options.kelasLabel || 'Semua Kelas';

  // Optional Page 1: Summary Table of Token & Score if requested and >1 student
  if (options.includeSummaryPage && students.length > 1) {
    drawSummaryTablePages(doc, students, resultsMap, examsMap, kelasHeader, nowStr);
    doc.addPage();
  }

  // Draw Grid of 8 Cards per A4 Page (2 columns x 4 rows)
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 10;
  const marginY = 18;
  const gapX = 6;
  const gapY = 5;
  const cardWidth = (pageWidth - marginX * 2 - gapX) / 2; // ~92mm
  const cardHeight = (pageHeight - marginY - 12 - gapY * 3) / 4; // ~63mm

  const cardsPerPage = 8;
  const totalCardPages = Math.ceil(students.length / cardsPerPage);

  students.forEach((student, idx) => {
    const posInPage = idx % cardsPerPage;
    const currentCardPage = Math.floor(idx / cardsPerPage) + 1;

    if (idx > 0 && posInPage === 0) {
      doc.addPage();
    }

    // Draw Page Top Header on first card of the page
    if (posInPage === 0) {
      doc.setFillColor(30, 58, 138); // Deep royal blue
      doc.rect(0, 0, pageWidth, 12, 'F');
      doc.setFillColor(16, 185, 129); // Emerald accent line
      doc.rect(0, 12, pageWidth, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text(
        cleanPdfText(
          `KARTU TOKEN & NILAI PESERTA CBT SOSIOLOGI SMA — ${kelasHeader.toUpperCase()}`
        ),
        marginX,
        7.8
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        `Halaman Kartu ${currentCardPage}/${totalCardPages}  |  Cetak: ${cleanPdfText(nowStr)}`,
        pageWidth - marginX,
        7.8,
        { align: 'right' }
      );
    }

    const col = posInPage % 2;
    const row = Math.floor(posInPage / 2);
    const x = marginX + col * (cardWidth + gapX);
    const y = marginY + row * (cardHeight + gapY);

    const res = resultsMap.get(Number(student.id));
    const score = res ? res.skor_angka : null;
    const kodePaket = cleanPdfText(
      student.kode_soal || student.variasi_paket || 'PAKET-A'
    );
    const tingkat = extractTingkatFromKelas(student.kelas);

    // Card outer border & subtle background
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.5, 2.5, 'FD');

    // Card Top Banner (Colorful header inside card)
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.roundedRect(x, y, cardWidth, 11.5, 2.5, 2.5, 'F');
    doc.rect(x, y + 8, cardWidth, 3.5, 'F'); // square bottom corners of header

    // Accent stripe under card header
    doc.setFillColor(245, 158, 11); // Amber-500
    doc.rect(x, y + 11.5, cardWidth, 1, 'F');

    // Card Header Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('KARTU PESERTA & TOKEN CBT SOSIOLOGI', x + 3.5, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(219, 234, 254);
    doc.text(
      `Sistem Asesmen Sosiologi SMA ${tingkat !== 'LAINNYA' ? `- Kelas ${tingkat}` : ''}`,
      x + 3.5,
      y + 9.2
    );

    // Package Code Badge in Top Right of Card
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x + cardWidth - 21, y + 2.5, 18, 6.2, 1.2, 1.2, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(255, 255, 255);
    doc.text(kodePaket, x + cardWidth - 12, y + 6.7, { align: 'center' });

    // Student Identity Section
    const bodyY = y + 16.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('NAMA LENGKAP PESERTA:', x + 3.5, bodyY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    const cleanName = cleanPdfText(student.nama);
    const truncatedName =
      cleanName.length > 34 ? cleanName.slice(0, 32) + '...' : cleanName;
    doc.text(truncatedName, x + 3.5, bodyY + 4.3);

    // Kelas & Status Row
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('KELAS / ROMBEL:', x + 3.5, bodyY + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 64, 175);
    doc.text(cleanPdfText(student.kelas), x + 3.5, bodyY + 14);

    // Token Box (Left-Center Highlight) & Score Box (Right Highlight)
    const boxY = bodyY + 17.5;
    const tokenBoxW = 46;
    const scoreBoxW = cardWidth - 7 - tokenBoxW - 3;

    // Token Box
    doc.setFillColor(239, 246, 255); // Blue-50
    doc.setDrawColor(147, 197, 253); // Blue-300
    doc.setLineWidth(0.35);
    doc.roundedRect(x + 3.5, boxY, tokenBoxW, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(37, 99, 235);
    doc.text('TOKEN LOGIN UJIAN (6 DIGIT)', x + 3.5 + tokenBoxW / 2, boxY + 4.2, {
      align: 'center',
    });

    doc.setFont('courier', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      cleanPdfText(student.token_ujian),
      x + 3.5 + tokenBoxW / 2,
      boxY + 11.8,
      { align: 'center' }
    );

    // Score / Status Box on the right
    const badgeStyle = getScoreBadgeColors(score);
    const scoreBoxX = x + 3.5 + tokenBoxW + 3;
    doc.setFillColor(...badgeStyle.bg);
    doc.setDrawColor(...badgeStyle.border);
    doc.roundedRect(scoreBoxX, boxY, scoreBoxW, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...badgeStyle.text);
    doc.text('HASIL NILAI CBT', scoreBoxX + scoreBoxW / 2, boxY + 4.2, {
      align: 'center',
    });

    if (typeof score === 'number') {
      doc.setFont('courier', 'bold');
      doc.setFontSize(12.5);
      doc.text(`${score}/100`, scoreBoxX + scoreBoxW / 2, boxY + 10.5, {
        align: 'center',
      });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.text(
        cleanPdfText(badgeStyle.label),
        scoreBoxX + scoreBoxW / 2,
        boxY + 14.3,
        { align: 'center' }
      );
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(
        cleanPdfText(student.status_ujian || 'Belum Mulai'),
        scoreBoxX + scoreBoxW / 2,
        boxY + 10.2,
        { align: 'center' }
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.text('Siap Digunakan', scoreBoxX + scoreBoxW / 2, boxY + 14, {
        align: 'center',
      });
    }

    // Card Footer Instructions
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Alur Login: 1. Pilih Kelas -> 2. Pilih Nama Peserta -> 3. Masukkan 6 Digit Token',
      x + cardWidth / 2,
      y + cardHeight - 2.5,
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
 * Helper to draw summary table pages before the cards
 */
function drawSummaryTablePages(
  doc: jsPDF,
  students: StudentItem[],
  resultsMap: Map<number, ResultItem>,
  examsMap: Map<number, ExamItem>,
  kelasHeader: string,
  nowStr: string
): void {
  const pageWidth = 210;
  const marginX = 12;

  // Calculate stats
  const scores: number[] = [];
  students.forEach((s) => {
    const r = resultsMap.get(Number(s.id));
    if (r && typeof r.skor_angka === 'number') {
      scores.push(r.skor_angka);
    }
  });

  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;
  const minScore = scores.length > 0 ? Math.min(...scores) : null;

  const rowsPerPage = 28;
  const totalPages = Math.ceil(students.length / rowsPerPage);

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage();

    // Top Header Banner
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 22, pageWidth, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(
      'REKAPITULASI KARTU TOKEN & HASIL NILAI CBT SOSIOLOGI',
      marginX,
      10
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(219, 234, 254);
    doc.text(
      cleanPdfText(
        `Filter Kelas: ${kelasHeader}  |  Total Peserta: ${students.length} Siswa  |  Tanggal Cetak: ${nowStr}`
      ),
      marginX,
      16.5
    );

    let startY = 29;

    // KPI Summary Boxes on Page 1
    if (p === 0) {
      const kpiW = (pageWidth - marginX * 2 - 9) / 4;
      const kpis = [
        {
          label: 'TOTAL PESERTA',
          val: `${students.length} Siswa`,
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
          label: 'RATA-RATA KELAS',
          val: avgScore !== null ? `${avgScore} / 100` : '-',
          bg: [245, 243, 255] as [number, number, number],
          text: [91, 33, 182] as [number, number, number],
        },
        {
          label: 'TERTINGGI / TERENDAH',
          val: maxScore !== null ? `${maxScore} / ${minScore}` : '- / -',
          bg: [255, 251, 235] as [number, number, number],
          text: [146, 64, 14] as [number, number, number],
        },
      ];

      kpis.forEach((k, idx) => {
        const kx = marginX + idx * (kpiW + 3);
        doc.setFillColor(...k.bg);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(kx, startY, kpiW, 14, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(k.label, kx + 3, startY + 5);

        doc.setFont('courier', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...k.text);
        doc.text(k.val, kx + 3, startY + 11.2);
      });

      startY += 19;
    }

    // Table Header
    const colWidths = [10, 62, 28, 22, 22, 22, 20]; // Total = 186mm
    const headers = [
      'NO',
      'NAMA LENGKAP SISWA',
      'KELAS',
      'TOKEN',
      'PAKET',
      'STATUS',
      'NILAI',
    ];

    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, startY, pageWidth - marginX * 2, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);

    let cx = marginX;
    headers.forEach((h, i) => {
      doc.text(h, cx + 2, startY + 5.3);
      cx += colWidths[i];
    });

    startY += 8;

    const slice = students.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    slice.forEach((st, idx) => {
      const globalIdx = p * rowsPerPage + idx + 1;
      const res = resultsMap.get(Number(st.id));
      const rowH = 7.4;

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, startY, pageWidth - marginX * 2, rowH, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, startY + rowH, pageWidth - marginX, startY + rowH);

      let rx = marginX;
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(String(globalIdx), rx + 2, startY + 5);
      rx += colWidths[0];

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const nameStr = cleanPdfText(st.nama);
      doc.text(
        nameStr.length > 33 ? nameStr.slice(0, 31) + '...' : nameStr,
        rx + 2,
        startY + 5
      );
      rx += colWidths[1];

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(cleanPdfText(st.kelas).slice(0, 15), rx + 2, startY + 5);
      rx += colWidths[2];

      doc.setFont('courier', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(cleanPdfText(st.token_ujian), rx + 2, startY + 5);
      rx += colWidths[3];

      doc.setFont('courier', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(
        cleanPdfText(st.kode_soal || st.variasi_paket || 'PAKET-A'),
        rx + 2,
        startY + 5
      );
      rx += colWidths[4];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const stStatus = cleanPdfText(st.status_ujian || 'Belum Mulai');
      doc.text(stStatus, rx + 2, startY + 5);
      rx += colWidths[5];

      doc.setFont('courier', 'bold');
      doc.setFontSize(8.2);
      if (res && typeof res.skor_angka === 'number') {
        doc.setTextColor(6, 95, 70);
        doc.text(`${res.skor_angka}/100`, rx + 2, startY + 5);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('-', rx + 2, startY + 5);
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
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text('KARTU HASIL NILAI & TOKEN UJIAN CBT SOSIOLOGI', marginX + 22, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(219, 234, 254);
  doc.text(
    'Sistem Asesmen & Evaluasi Kompetensi Sosiologi SMA Terverifikasi',
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
  doc.text('IDENTITAS PESERTA & KARTU TOKEN UJIAN', marginX + 5, y + 6.5);

  doc.setDrawColor(226, 232, 240);
  doc.line(marginX + 5, y + 9, marginX + leftW - 5, y + 9);

  const infoRows: Array<[string, string]> = [
    ['Nama Peserta', cleanPdfText(student.nama)],
    ['Kelas / Rombel', cleanPdfText(student.kelas)],
    ['Mata Ujian', cleanPdfText(exam?.judul_ujian || 'Asesmen Sosiologi SMA')],
    [
      'Kode Paket Soal',
      cleanPdfText(
        student.kode_soal || student.variasi_paket || exam?.kode_paket || 'PAKET-A'
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
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, marginX + 5, ry);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const trimmedVal = val.length > 36 ? val.slice(0, 34) + '...' : val;
    doc.text(`:  ${trimmedVal}`, marginX + 34, ry);
    ry += 5.5;
  });

  // Token Pill inside Left Box
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(marginX + leftW - 34, y + 11.5, 29, 14, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(37, 99, 235);
  doc.text('TOKEN PESERTA', marginX + leftW - 19.5, y + 15.8, { align: 'center' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanPdfText(student.token_ujian), marginX + leftW - 19.5, y + 22.8, {
    align: 'center',
  });

  // Right Box: Hero Score Card
  const badgeStyle = getScoreBadgeColors(score);
  const rightX = marginX + leftW + 5;
  doc.setFillColor(...badgeStyle.bg);
  doc.setDrawColor(...badgeStyle.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(rightX, y, rightW, 46, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...badgeStyle.text);
  doc.text('NILAI AKHIR CBT SOSIOLOGI', rightX + rightW / 2, y + 8, {
    align: 'center',
  });

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
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Dokumen Resmi CBT — ${cleanPdfText(student.nama)} (${cleanPdfText(student.kelas)})`,
      marginX,
      285.5
    );
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text(
      `Token: ${cleanPdfText(student.token_ujian)} | Skor: ${score}/100 | Hal. ${pageNum}`,
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
