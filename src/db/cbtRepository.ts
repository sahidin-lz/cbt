import { db } from './index.ts';
import {
  users,
  students,
  exams,
  questions,
  results,
  AnalisisAI,
  QuestionDataOpsi,
} from './schema.ts';
import { eq, desc, inArray } from 'drizzle-orm';
import {
  parseQuestionsCsv,
  parseStudentsCsv,
  generateExamToken,
  isExamMatchedForStudentClass,
  calculateExamScore,
} from '../utils/cbtLogic.ts';

export async function getOrCreateAdminUser(uid: string, email: string, name?: string) {
  try {
    const res = await db
      .insert(users)
      .values({
        uid,
        email,
        name: name || email.split('@')[0],
        role: 'admin',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email, name: name || email.split('@')[0] },
      })
      .returning();
    return res[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateAdminUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getDashboardData() {
  try {
    const allExams = await db.select().from(exams).orderBy(desc(exams.id));
    const allStudents = await db.select().from(students).orderBy(desc(students.id));
    const allQuestions = await db.select().from(questions).orderBy(questions.id);
    const allResults = await db.select().from(results).orderBy(desc(results.created_at));

    return {
      exams: allExams,
      students: allStudents,
      questions: allQuestions,
      results: allResults,
    };
  } catch (error) {
    console.error('Database query failed in getDashboardData:', error);
    throw new Error('Gagal mengambil data dashboard dari database.', { cause: error });
  }
}

export async function createOrReplaceQuestionsFromCsv(
  examId: number,
  csvRows: ReturnType<typeof parseQuestionsCsv>['rows'],
  replaceExisting: boolean
) {
  try {
    if (replaceExisting) {
      await db.delete(questions).where(eq(questions.exam_id, examId));
    }

    const values = csvRows.map((row) => ({
      exam_id: examId,
      teks_soal: row.teks_soal,
      tipe_soal: row.jenis_soal,
      data_opsi: {
        id_soal_csv: row.id_soal,
        wacana: row.wacana,
        opsi: {
          A: row.opsi_a,
          B: row.opsi_b,
          C: row.opsi_c,
          D: row.opsi_d,
          E: row.opsi_e,
        },
      } satisfies QuestionDataOpsi,
      kunci_jawaban: row.kunci_jawaban,
      bobot: row.bobot,
    }));

    return await db.insert(questions).values(values).returning();
  } catch (error) {
    console.error('Database query failed in createOrReplaceQuestionsFromCsv:', error);
    throw new Error('Gagal menyimpan soal dari CSV ke database.', { cause: error });
  }
}

export async function createManualQuestionRecord(
  examId: number,
  teks_soal: string,
  tipe_soal: 'PG' | 'Kompleks',
  wacana: string,
  opsi: { A: string; B: string; C: string; D: string; E: string },
  kunci_jawaban: string[],
  bobot: number
) {
  try {
    const [inserted] = await db
      .insert(questions)
      .values({
        exam_id: examId,
        teks_soal: teks_soal.trim(),
        tipe_soal,
        data_opsi: {
          wacana: wacana.trim(),
          opsi,
        },
        kunci_jawaban,
        bobot,
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed in createManualQuestionRecord:', error);
    throw new Error('Gagal menambahkan butir soal baru.', { cause: error });
  }
}

export async function deleteQuestionRecord(questionId: number) {
  try {
    await db.delete(questions).where(eq(questions.id, questionId));
  } catch (error) {
    console.error('Database query failed in deleteQuestionRecord:', error);
    throw new Error('Gagal menghapus butir soal.', { cause: error });
  }
}

export async function addStudentRecord(nama: string, kelas: string, token: string) {
  try {
    const [inserted] = await db
      .insert(students)
      .values({
        nama: nama.trim(),
        kelas: kelas.trim(),
        token_ujian: token.toUpperCase().trim(),
        status_ujian: 'Belum Mulai',
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed in addStudentRecord:', error);
    throw new Error('Gagal menambahkan data siswa ke database.', { cause: error });
  }
}

export async function createStudentsFromCsv(
  csvRows: ReturnType<typeof parseStudentsCsv>['rows'],
  replaceExisting: boolean
) {
  try {
    if (replaceExisting) {
      await db.delete(students);
    }

    const existingStudents = await db.select().from(students);
    const usedTokens = new Set(existingStudents.map((s) => s.token_ujian));

    const values = csvRows.map((row) => {
      let token = row.token_ujian && !usedTokens.has(row.token_ujian)
        ? row.token_ujian
        : generateExamToken();
      while (usedTokens.has(token)) {
        token = generateExamToken();
      }
      usedTokens.add(token);

      return {
        nama: row.nama.trim(),
        kelas: row.kelas.trim(),
        token_ujian: token,
        status_ujian: 'Belum Mulai',
      };
    });

    return await db.insert(students).values(values).returning();
  } catch (error) {
    console.error('Database query failed in createStudentsFromCsv:', error);
    throw new Error('Gagal menyimpan data upload massal siswa ke database.', {
      cause: error,
    });
  }
}

export async function updateStudentRecord(studentId: number, nama: string, kelas: string) {
  try {
    const [updated] = await db
      .update(students)
      .set({
        nama: nama.trim(),
        kelas: kelas.trim(),
      })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updateStudentRecord:', error);
    throw new Error('Gagal memperbarui data siswa.', { cause: error });
  }
}

export async function regenerateStudentTokenRecord(studentId: number, newToken: string) {
  try {
    const [updated] = await db
      .update(students)
      .set({ token_ujian: newToken.toUpperCase(), status_ujian: 'Belum Mulai' })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in regenerateStudentTokenRecord:', error);
    throw new Error('Gagal memperbarui token ujian siswa.', { cause: error });
  }
}

export async function updateStudentStatusRecord(
  studentId: number,
  status_ujian: string
) {
  try {
    const [updated] = await db
      .update(students)
      .set({ status_ujian })
      .where(eq(students.id, studentId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updateStudentStatusRecord:', error);
    throw new Error('Gagal memperbarui status ujian siswa.', { cause: error });
  }
}

export async function bulkUpdateStudentStatusRecord(
  studentIds: number[],
  status_ujian: string
) {
  try {
    if (studentIds.length === 0) return [];
    return await db
      .update(students)
      .set({ status_ujian })
      .where(inArray(students.id, studentIds))
      .returning();
  } catch (error) {
    console.error('Database query failed in bulkUpdateStudentStatusRecord:', error);
    throw new Error('Gagal memperbarui status ujian siswa secara massal.', {
      cause: error,
    });
  }
}

export async function deleteStudentRecord(studentId: number) {
  try {
    await db.delete(students).where(eq(students.id, studentId));
  } catch (error) {
    console.error('Database query failed in deleteStudentRecord:', error);
    throw new Error('Gagal menghapus siswa.', { cause: error });
  }
}

export async function createNewExamRecord(
  judul_ujian: string,
  durasi_menit: number,
  target_tingkat: string = 'SEMUA',
  target_kelas: string = 'SEMUA'
) {
  try {
    const [created] = await db
      .insert(exams)
      .values({
        judul_ujian: judul_ujian.trim(),
        durasi_menit: Math.max(5, durasi_menit),
        target_tingkat: target_tingkat.trim() || 'SEMUA',
        target_kelas: target_kelas.trim() || 'SEMUA',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createNewExamRecord:', error);
    throw new Error('Gagal membuat paket ujian baru.', { cause: error });
  }
}

export async function updateExamRecord(
  examId: number,
  judul_ujian: string,
  durasi_menit: number,
  target_tingkat: string = 'SEMUA',
  target_kelas: string = 'SEMUA'
) {
  try {
    const [updated] = await db
      .update(exams)
      .set({
        judul_ujian: judul_ujian.trim(),
        durasi_menit: Math.max(5, durasi_menit),
        target_tingkat: target_tingkat.trim() || 'SEMUA',
        target_kelas: target_kelas.trim() || 'SEMUA',
      })
      .where(eq(exams.id, examId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in updateExamRecord:', error);
    throw new Error('Gagal memperbarui paket ujian.', { cause: error });
  }
}

export async function deleteExamRecord(examId: number) {
  try {
    await db.delete(exams).where(eq(exams.id, examId));
  } catch (error) {
    console.error('Database query failed in deleteExamRecord:', error);
    throw new Error('Gagal menghapus paket ujian.', { cause: error });
  }
}

export async function verifyStudentTokenForExam(
  namaInput: string,
  tokenInput: string,
  examIdInput?: number
) {
  try {
    const cleanToken = tokenInput.toUpperCase().trim();
    const matchedStudents = await db
      .select()
      .from(students)
      .where(eq(students.token_ujian, cleanToken));

    if (matchedStudents.length === 0) {
      return {
        error: 'Token Ujian tidak ditemukan di database siswa. Hubungi Guru/Pengawas Anda.',
      };
    }

    const student = matchedStudents[0];
    const cleanNama = namaInput.trim();
    if (!cleanNama) {
      return { error: 'Nama Siswa wajib diisi.' };
    }

    if (student.status_ujian === 'Diblokir') {
      return {
        error:
          'Akses ujian Anda sedang DIBLOKIR / DIKUNCI karena pelanggaran aturan keamanan (Anti-Cheat) atau dikunci oleh Pengawas. Silakan hubungi Guru Pengawas untuk membuka kunci status ujian Anda.',
      };
    }

    if (student.status_ujian === 'Selesai') {
      return {
        error:
          'Anda telah menyelesaikan ujian dengan Token ini (Status: Selesai). Hubungi Guru Pengawas jika status ujian Anda perlu di-reset ke Belum Mulai.',
      };
    }

    const allExams = await db.select().from(exams).orderBy(desc(exams.id));
    if (allExams.length === 0) {
      return {
        error: 'Belum ada Paket Ujian yang aktif. Silakan tunggu Guru mengaktifkan ujian.',
      };
    }

    // Filter exams that match this student's grade level (Tingkat 10/11/12) or specific class
    const matchedExams = allExams.filter((ex) =>
      isExamMatchedForStudentClass(ex, student.kelas)
    );

    if (matchedExams.length === 0) {
      return {
        error: `Tidak ditemukan Paket Ujian yang didistribusikan untuk kelas Anda (${student.kelas}). Hubungi Guru Pengawas.`,
      };
    }

    const activeExam =
      (examIdInput
        ? matchedExams.find((e) => e.id === examIdInput)
        : matchedExams[0]) || matchedExams[0];

    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.exam_id, activeExam.id))
      .orderBy(questions.id);

    if (examQuestions.length === 0) {
      return {
        error: `Paket ujian "${activeExam.judul_ujian}" untuk kelas ${student.kelas} belum memiliki butir soal. Silakan hubungi Guru.`,
      };
    }

    // Mark student status as Sedang Ujian
    const [updatedStudent] = await db
      .update(students)
      .set({
        nama: cleanNama,
        status_ujian: 'Sedang Ujian',
      })
      .where(eq(students.id, student.id))
      .returning();

    return {
      student: updatedStudent,
      exam: activeExam,
      availableExams: matchedExams,
      questions: examQuestions,
    };
  } catch (error) {
    console.error('Database query failed in verifyStudentTokenForExam:', error);
    throw new Error('Gagal memverifikasi sesi login ujian siswa.', { cause: error });
  }
}

export async function submitStudentExamResult(
  studentId: number,
  examId: number,
  jawabanSiswa: Record<string, string[]>,
  pelanggaranTab: number
) {
  try {
    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.exam_id, examId));

    const scoreSummary = calculateExamScore(examQuestions, jawabanSiswa);

    await db
      .update(students)
      .set({ status_ujian: 'Selesai' })
      .where(eq(students.id, studentId));

    const [savedResult] = await db
      .insert(results)
      .values({
        student_id: studentId,
        exam_id: examId,
        skor_angka: scoreSummary.normalizedScore,
        jawaban_siswa: jawabanSiswa,
        analisis_ai: null,
        pelanggaran_tab: pelanggaranTab,
      })
      .returning();

    return {
      result: savedResult,
      scoreSummary,
    };
  } catch (error) {
    console.error('Database query failed in submitStudentExamResult:', error);
    throw new Error('Gagal menyimpan hasil ujian siswa.', { cause: error });
  }
}

export async function saveAiAnalysisToResult(resultId: number, analisisAi: AnalisisAI) {
  try {
    const [updated] = await db
      .update(results)
      .set({
        analisis_ai: analisisAi,
        skor_angka: analisisAi.skor_akhir,
      })
      .where(eq(results.id, resultId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database query failed in saveAiAnalysisToResult:', error);
    throw new Error('Gagal menyimpan hasil analisis AI ke database.', { cause: error });
  }
}
