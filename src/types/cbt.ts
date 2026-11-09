export type StudentExamStatus =
  | 'Belum Mulai'
  | 'Sedang Ujian'
  | 'Selesai'
  | 'Diblokir';

export interface StudentItem {
  id: number;
  nama: string;
  kelas: string;
  token_ujian: string;
  status_ujian: StudentExamStatus | string;
  created_at?: string;
}

export interface ExamItem {
  id: number;
  judul_ujian: string;
  durasi_menit: number;
  target_tingkat: string;
  target_kelas: string;
  created_at?: string;
}

export interface QuestionItem {
  id: number;
  exam_id: number;
  teks_soal: string;
  tipe_soal: 'PG' | 'Kompleks' | string;
  data_opsi: {
    id_soal_csv?: string;
    wacana?: string;
    opsi: {
      A: string;
      B: string;
      C: string;
      D: string;
      E: string;
    };
  };
  kunci_jawaban: string[];
  bobot: number;
}

export interface AnalisisAI {
  nama_siswa: string;
  skor_akhir: number;
  kategori_nilai: string;
  analisis_kompetensi: {
    kekuatan: string[];
    kelemahan: string[];
  };
  evaluasi_hots: string;
  rekomendasi_belajar: string[];
}

export interface ResultItem {
  id: number;
  student_id: number;
  exam_id: number;
  skor_angka: number;
  jawaban_siswa: Record<string, string[]>;
  analisis_ai: AnalisisAI | null;
  pelanggaran_tab: number;
  created_at?: string;
}
