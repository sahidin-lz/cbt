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
  kode_soal?: string; // e.g. 'PAKET-A' | 'PAKET-B' | 'KODE-01'
  variasi_paket?: string; // 'A' | 'B' | 'C' | 'D'
  created_at?: string;
  authorUid?: string;
  updatedAt?: string;
}

export interface ExamItem {
  id: number;
  judul_ujian: string;
  durasi_menit: number;
  target_tingkat: string;
  target_kelas: string;
  acak_soal?: boolean; // Acak urutan nomor butir soal per siswa
  acak_opsi?: boolean; // Acak urutan opsi jawaban A-E per siswa
  kode_paket?: string; // Kode paket default (misal 'PAKET-A', 'PAKET-B', 'UTAMA')
  mode_multi_paket?: boolean; // Mode variasi paket soal per angkatan/kelas (A/B/C)
  jumlah_paket?: number; // Jumlah varian paket (2, 3, atau 4)
  created_at?: string;
  authorUid?: string;
  updatedAt?: string;
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
    opsi_original_map?: Record<string, string>; // Maps shuffled option key back to original key
    variasi_paket?: string; // 'A' | 'B' | 'SEMUA'
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
  kode_soal?: string;
  created_at?: string;
  authorUid?: string;
  updatedAt?: string;
}
