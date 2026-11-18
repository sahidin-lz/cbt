import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signInWithPopup } from 'firebase/auth';
import {
  ExamItem,
  QuestionItem,
  StudentItem,
  ResultItem,
  AnalisisAI,
  ArchivedExamRecord,
} from '../types/cbt';
import {
  SAMPLE_CSV_TEMPLATE,
  SAMPLE_STUDENT_CSV_TEMPLATE,
  extractTingkatFromKelas,
  buildExcelHtmlTable,
  buildSemicolonCsv,
  generateStudentTemplateExcel,
  generateQuestionTemplateExcel,
  computeClassAnalytics,
  assignPackageVariantsToStudents,
  getEffectiveExamSessionToken,
  generateExamToken,
  getEffectiveMataPelajaran,
} from '../utils/cbtLogic';
import {
  resolveStudentPrecisionRecord,
  formatExamAttemptTimeShort,
  formatExamAttemptTimeFull,
} from '../utils/cbtPdfGenerator';
import {
  auth,
  googleAuthProvider,
  CbtSyncPulseData,
} from '../lib/firebase';
import {
  safeApiJson,
  saveExamCbt,
  softDeleteExamCbt,
  fetchArchivedExamsCbt,
  restoreArchivedExamCbt,
  toggleExamStatusCbt,
  updateExamSessionTokenCbt,
  saveStudentCbt,
  uploadStudentsCsvCbt,
  regenerateStudentTokenCbt,
  updateStudentStatusCbt,
  bulkUpdateStudentStatusCbt,
  batchAssignPackageVariantsCbt,
  deleteStudentCbt,
  renameClassCbt,
  deleteClassStudentsCbt,
  addManualQuestionCbt,
  updateManualQuestionCbt,
  uploadQuestionsCsvCbt,
  deleteQuestionCbt,
  clearExamQuestionsCbt,
  copyQuestionsToExamCbt,
  generateAiAnalysisCbt,
  recalculateAndSyncAllResultsCbt,
} from '../lib/cbtFirestoreService';
import {
  parseQuestionsFromFile,
  parseStudentsFromFile,
  generateWordQuestionTemplateTableDoc,
  generateWordQuestionTemplateNumberedDoc,
  exportQuestionsToWordDoc,
  convertImageFileToInlineToken,
} from '../utils/cbtFileParsers';
import { QuestionTargetField } from '../components/QuestionEquationAndImageHelper';
import { CBT_ARCHIVE_QUERY_KEY } from '../lib/queryClient';

export type AdminTabId =
  | 'ujian'
  | 'token_distribusi'
  | 'manajemen'
  | 'siswa'
  | 'soal'
  | 'laporan'
  | 'anbuso';

export const ADMIN_TAB_ROUTES: Record<AdminTabId, string> = {
  ujian: '/admin/ujian',
  token_distribusi: '/admin/distribusi',
  manajemen: '/admin/live-monitor',
  siswa: '/admin/siswa',
  soal: '/admin/bank-soal',
  laporan: '/admin/laporan',
  anbuso: '/admin/anbuso',
};

export function resolveAdminTabFromPathname(pathname: string): AdminTabId {
  const clean = pathname.toLowerCase();
  if (clean.includes('/distribusi')) return 'token_distribusi';
  if (clean.includes('/live-monitor')) return 'manajemen';
  if (clean.includes('/siswa')) return 'siswa';
  if (clean.includes('/bank-soal')) return 'soal';
  if (clean.includes('/laporan')) return 'laporan';
  if (clean.includes('/anbuso')) return 'anbuso';
  return 'ujian';
}

export function triggerBrowserDownload(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface AdminDashboardProps {
  exams: ExamItem[];
  questions: QuestionItem[];
  students: StudentItem[];
  results: ResultItem[];
  onRefreshData: () => Promise<void>;
  syncPulse?: CbtSyncPulseData | null;
  isSyncingFirebase?: boolean;
  onManualFirebaseSync?: () => Promise<void>;
}

interface AdminDashboardContextValue extends AdminDashboardProps {
  isAuthenticated: boolean;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  teacherUsername: string;
  setTeacherUsername: React.Dispatch<React.SetStateAction<string>>;
  teacherPassword: string;
  setTeacherPassword: React.Dispatch<React.SetStateAction<string>>;
  authError: string | null;
  teacherProfile: { name: string; email: string };
  handleTeacherFormLogin: (e: React.FormEvent) => void;
  handleGoogleTeacherSignIn: () => Promise<void>;

  activeTab: AdminTabId;
  setActiveTab: (tab: AdminTabId) => void;
  isSidebarMinimized: boolean;
  setIsSidebarMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;

  isTopMetricsMinimized: boolean;
  setIsTopMetricsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isSubMenuBarMinimized: boolean;
  setIsSubMenuBarMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isReportSummaryMinimized: boolean;
  setIsReportSummaryMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isReportLotsHotsMinimized: boolean;
  setIsReportLotsHotsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isReportClassTableMinimized: boolean;
  setIsReportClassTableMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isReportQuestionPanelMinimized: boolean;
  setIsReportQuestionPanelMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isReportStudentListMinimized: boolean;
  setIsReportStudentListMinimized: React.Dispatch<React.SetStateAction<boolean>>;

  isUjianFormMinimized: boolean;
  setIsUjianFormMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isUjianTableMinimized: boolean;
  setIsUjianTableMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isUjianChartMinimized: boolean;
  setIsUjianChartMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isSiswaClassPanelMinimized: boolean;
  setIsSiswaClassPanelMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isSiswaStatusPanelMinimized: boolean;
  setIsSiswaStatusPanelMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isSiswaFormMinimized: boolean;
  setIsSiswaFormMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isSiswaTableMinimized: boolean;
  setIsSiswaTableMinimized: React.Dispatch<React.SetStateAction<boolean>>;

  selectedExamId: number | null;
  setSelectedExamId: React.Dispatch<React.SetStateAction<number | null>>;
  isRecalculatingScores: boolean;
  recalcFeedback: string | null;
  handleRecalculateAllScores: () => Promise<void>;

  isBankSoalDetailOpen: boolean;
  setIsBankSoalDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showUploadPanel: boolean;
  setShowUploadPanel: React.Dispatch<React.SetStateAction<boolean>>;
  bankSoalDeleteModal: { examId: number; title: string; questionCount: number } | null;
  setBankSoalDeleteModal: React.Dispatch<
    React.SetStateAction<{ examId: number; title: string; questionCount: number } | null>
  >;
  isDeletingBankSoal: boolean;
  isClearingExamQuestions: boolean;
  bankSoalDetailRef: React.RefObject<HTMLDivElement | null>;
  bankSoalFeedback: { type: 'success' | 'error'; message: string } | null;
  setBankSoalFeedback: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; message: string } | null>
  >;

  newExamTitle: string;
  setNewExamTitle: React.Dispatch<React.SetStateAction<string>>;
  newExamDuration: string;
  setNewExamDuration: React.Dispatch<React.SetStateAction<string>>;
  newExamTargetTingkat: string;
  setNewExamTargetTingkat: React.Dispatch<React.SetStateAction<string>>;
  newExamTargetKelas: string;
  setNewExamTargetKelas: React.Dispatch<React.SetStateAction<string>>;
  newExamKategori: string;
  setNewExamKategori: React.Dispatch<React.SetStateAction<string>>;
  newExamStatus: 'AKTIF' | 'DRAF' | 'SELESAI';
  setNewExamStatus: React.Dispatch<React.SetStateAction<'AKTIF' | 'DRAF' | 'SELESAI'>>;
  newExamTargetRombel: string[];
  setNewExamTargetRombel: React.Dispatch<React.SetStateAction<string[]>>;
  filterExamKategori: string;
  setFilterExamKategori: React.Dispatch<React.SetStateAction<string>>;
  filterExamStatus: string;
  setFilterExamStatus: React.Dispatch<React.SetStateAction<string>>;
  newExamAcakSoal: boolean;
  setNewExamAcakSoal: React.Dispatch<React.SetStateAction<boolean>>;
  newExamAcakOpsi: boolean;
  setNewExamAcakOpsi: React.Dispatch<React.SetStateAction<boolean>>;
  newExamKodePaket: string;
  setNewExamKodePaket: React.Dispatch<React.SetStateAction<string>>;
  newExamMultiPaket: boolean;
  setNewExamMultiPaket: React.Dispatch<React.SetStateAction<boolean>>;
  newExamJumlahPaket: number;
  setNewExamJumlahPaket: React.Dispatch<React.SetStateAction<number>>;
  newExamTokenSesi: string;
  setNewExamTokenSesi: React.Dispatch<React.SetStateAction<string>>;
  newExamTampilkanNilai: boolean;
  setNewExamTampilkanNilai: React.Dispatch<React.SetStateAction<boolean>>;
  newExamPengumuman: string;
  setNewExamPengumuman: React.Dispatch<React.SetStateAction<string>>;
  newExamMataPelajaran: string;
  setNewExamMataPelajaran: React.Dispatch<React.SetStateAction<string>>;
  newExamDistribusiMode: string;
  setNewExamDistribusiMode: React.Dispatch<React.SetStateAction<string>>;
  inlineTokenEditExamId: number | null;
  setInlineTokenEditExamId: React.Dispatch<React.SetStateAction<number | null>>;
  inlineTokenEditValue: string;
  setInlineTokenEditValue: React.Dispatch<React.SetStateAction<string>>;
  isDistributingPackages: boolean;
  filterExamTingkat: string;
  setFilterExamTingkat: React.Dispatch<React.SetStateAction<string>>;
  filterExamMapel: string;
  setFilterExamMapel: React.Dispatch<React.SetStateAction<string>>;
  editingExamId: number | null;
  setEditingExamId: React.Dispatch<React.SetStateAction<number | null>>;
  isSavingExam: boolean;
  examFeedback: string | null;
  setExamFeedback: React.Dispatch<React.SetStateAction<string | null>>;

  studentInputMode: 'manual' | 'csv';
  setStudentInputMode: React.Dispatch<React.SetStateAction<'manual' | 'csv'>>;
  studentNameInput: string;
  setStudentNameInput: React.Dispatch<React.SetStateAction<string>>;
  studentNisnInput: string;
  setStudentNisnInput: React.Dispatch<React.SetStateAction<string>>;
  studentTingkatPreset: 'X' | 'XI' | 'XII';
  setStudentTingkatPreset: React.Dispatch<React.SetStateAction<'X' | 'XI' | 'XII'>>;
  studentClassInput: string;
  setStudentClassInput: React.Dispatch<React.SetStateAction<string>>;
  editingStudentId: number | null;
  setEditingStudentId: React.Dispatch<React.SetStateAction<number | null>>;
  studentCsvText: string;
  setStudentCsvText: React.Dispatch<React.SetStateAction<string>>;
  replaceExistingStudents: boolean;
  setReplaceExistingStudents: React.Dispatch<React.SetStateAction<boolean>>;
  isUploadingStudentsCsv: boolean;
  filterStudentTingkat: string;
  setFilterStudentTingkat: React.Dispatch<React.SetStateAction<string>>;
  filterKelas: string;
  setFilterKelas: React.Dispatch<React.SetStateAction<string>>;
  filterStudentMapel: string;
  setFilterStudentMapel: React.Dispatch<React.SetStateAction<string>>;
  filterStudentExamId: string;
  setFilterStudentExamId: React.Dispatch<React.SetStateAction<string>>;
  filterStudentStatus: string;
  setFilterStudentStatus: React.Dispatch<React.SetStateAction<string>>;
  isSavingStudent: boolean;
  studentFeedback: { type: 'success' | 'error'; message: string } | null;

  questionInputMode: 'manual' | 'csv';
  setQuestionInputMode: React.Dispatch<React.SetStateAction<'manual' | 'csv'>>;
  manualTipe: 'PG' | 'Kompleks';
  setManualTipe: React.Dispatch<React.SetStateAction<'PG' | 'Kompleks'>>;
  manualWacana: string;
  setManualWacana: React.Dispatch<React.SetStateAction<string>>;
  manualTeksSoal: string;
  setManualTeksSoal: React.Dispatch<React.SetStateAction<string>>;
  manualOpsiA: string;
  setManualOpsiA: React.Dispatch<React.SetStateAction<string>>;
  manualOpsiB: string;
  setManualOpsiB: React.Dispatch<React.SetStateAction<string>>;
  manualOpsiC: string;
  setManualOpsiC: React.Dispatch<React.SetStateAction<string>>;
  manualOpsiD: string;
  setManualOpsiD: React.Dispatch<React.SetStateAction<string>>;
  manualOpsiE: string;
  setManualOpsiE: React.Dispatch<React.SetStateAction<string>>;
  manualKunci: string[];
  setManualKunci: React.Dispatch<React.SetStateAction<string[]>>;
  manualBobot: string;
  setManualBobot: React.Dispatch<React.SetStateAction<string>>;
  editingQuestionId: number | null;
  isSavingQuestion: boolean;
  filterQuestionType: 'SEMUA' | 'PG' | 'Kompleks';
  setFilterQuestionType: React.Dispatch<React.SetStateAction<'SEMUA' | 'PG' | 'Kompleks'>>;
  searchQuestionQuery: string;
  setSearchQuestionQuery: React.Dispatch<React.SetStateAction<string>>;
  copyTargetExamId: number | null;
  setCopyTargetExamId: React.Dispatch<React.SetStateAction<number | null>>;
  isCopyingQuestions: boolean;

  bankSoalMapelFilter: string;
  setBankSoalMapelFilter: React.Dispatch<React.SetStateAction<string>>;
  bankSoalTingkatFilter: string;
  setBankSoalTingkatFilter: React.Dispatch<React.SetStateAction<string>>;
  questionViewMode: 'ringkas' | 'per_soal' | 'lengkap';
  setQuestionViewMode: React.Dispatch<React.SetStateAction<'ringkas' | 'per_soal' | 'lengkap'>>;
  expandedQuestionIds: number[];
  toggleExpandQuestion: (qId: number) => void;
  focusedQuestionIdx: number;
  setFocusedQuestionIdx: React.Dispatch<React.SetStateAction<number>>;
  questionPage: number;
  setQuestionPage: React.Dispatch<React.SetStateAction<number>>;
  questionsPerPage: number;
  setQuestionsPerPage: React.Dispatch<React.SetStateAction<number>>;

  csvText: string;
  setCsvText: React.Dispatch<React.SetStateAction<string>>;
  replaceExistingQuestions: boolean;
  setReplaceExistingQuestions: React.Dispatch<React.SetStateAction<boolean>>;
  quickExamTitle: string;
  setQuickExamTitle: React.Dispatch<React.SetStateAction<string>>;
  quickExamTingkat: string;
  setQuickExamTingkat: React.Dispatch<React.SetStateAction<string>>;
  uploadStatus: { type: 'success' | 'error'; message: string } | null;
  setUploadStatus: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; message: string } | null>
  >;
  isUploadingCsv: boolean;

  newClassNameInput: string;
  setNewClassNameInput: React.Dispatch<React.SetStateAction<string>>;
  renamingClassTarget: string | null;
  setRenamingClassTarget: React.Dispatch<React.SetStateAction<string | null>>;
  renameClassValue: string;
  setRenameClassValue: React.Dispatch<React.SetStateAction<string>>;

  filterResultTingkat: string;
  setFilterResultTingkat: React.Dispatch<React.SetStateAction<string>>;
  filterResultKelas: string;
  setFilterResultKelas: React.Dispatch<React.SetStateAction<string>>;
  filterResultMapel: string;
  setFilterResultMapel: React.Dispatch<React.SetStateAction<string>>;
  filterResultExamId: string;
  setFilterResultExamId: React.Dispatch<React.SetStateAction<string>>;
  analyzingResultId: number | null;
  isAnalyzingBatchClass: boolean;
  selectedAiModal: { studentName: string; studentClass: string; analysis: AnalisisAI } | null;
  setSelectedAiModal: React.Dispatch<
    React.SetStateAction<{ studentName: string; studentClass: string; analysis: AnalisisAI } | null>
  >;
  aiErrorBanner: string | null;

  dryRunExam: ExamItem | null;
  setDryRunExam: React.Dispatch<React.SetStateAction<ExamItem | null>>;
  archivedExams: ArchivedExamRecord[];
  isLoadingArchive: boolean;
  restoringArchiveId: string | null;
  handleRestoreArchivedExam: (archive: ArchivedExamRecord) => Promise<void>;
  refreshArchives: () => void;

  activeBankQuestions: QuestionItem[];
  currentExam: ExamItem | null;
  currentExamQuestions: QuestionItem[];
  filteredExamQuestions: QuestionItem[];
  formatDistribusiLabel: (tingkat: string, kelas: string) => string;
  uniqueClasses: string[];
  availableMataPelajaran: string[];
  resultMapelMatchedExams: ExamItem[];
  resultScopedListForAnalytics: ResultItem[];
  classAnalyticsData: ReturnType<typeof computeClassAnalytics>;
  filteredResults: ResultItem[];
  filteredExams: ExamItem[];
  studentScopedExams: ExamItem[];
  filteredStudents: StudentItem[];
  countTingkat10: number;
  countTingkat11: number;
  countTingkat12: number;
  countStatusBelumMulai: number;
  countStatusSedangUjian: number;
  countStatusSelesai: number;
  countStatusDiblokir: number;
  activeStudentsCount: number;

  handleSaveExam: (e: React.FormEvent) => Promise<void>;
  handleUpdateExamSessionToken: (exam: ExamItem, customToken?: string) => Promise<void>;
  handleToggleExamStatus: (exam: ExamItem, nextStatus: 'AKTIF' | 'DRAF' | 'SELESAI') => Promise<void>;
  handleBatchDistributePackages: (targetClass?: string) => Promise<void>;
  handleDeleteExam: (examId: number, title: string) => Promise<void>;
  handleClearBankSoalOnly: (examId: number, title: string) => Promise<void>;
  handleDeleteFullBankSoal: (examId: number, title: string) => Promise<void>;
  handleSaveStudent: (e: React.FormEvent) => Promise<void>;
  handleStudentCsvFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUploadStudentCsvSubmit: (e: React.FormEvent) => Promise<void>;
  handleDownloadSampleStudentCsv: () => void;
  handleDownloadStudentTemplateExcel: () => void;
  handleExportStudentsExcel: () => void;
  handleUpdateStudentStatus: (student: StudentItem, nextStatus: string) => Promise<void>;
  handleBulkUpdateStudentStatus: (nextStatus: string) => Promise<void>;
  handleRegenerateToken: (studentId: number, nama: string) => Promise<void>;
  handleDeleteStudent: (studentId: number, nama: string) => Promise<void>;
  handleToggleManualKunci: (letter: string) => void;
  handleAddNewClass: (e: React.FormEvent) => void;
  handleRenameClassSubmit: (oldName: string) => Promise<void>;
  handleDeleteClass: (kelasName: string) => Promise<void>;
  handleDownloadClassStudentsExcel: (targetKelasName?: string) => void;
  handleStartEditQuestion: (q: QuestionItem) => void;
  handleCancelEditQuestion: () => void;
  handleAddManualQuestion: (e: React.FormEvent) => Promise<void>;
  handleDeleteQuestion: (questionId: number) => Promise<void>;
  handleClearExamQuestions: () => Promise<void>;
  handleCopyQuestionsToExam: () => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUploadCsvSubmit: (e: React.FormEvent) => Promise<void>;
  handleDownloadSampleCsv: () => void;
  handleDownloadQuestionTemplateExcel: () => void;
  handleDownloadWordTemplateTable: () => void;
  handleDownloadWordTemplateNumbered: () => void;
  handleExportQuestionsWord: () => void;
  handleInsertSnippetToManualField: (field: QuestionTargetField, snippet: string) => void;
  handleRemoveImagesFromManualField: (field: QuestionTargetField) => void;
  handlePasteClipboardImage: (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    field: QuestionTargetField
  ) => Promise<void>;
  handleExportQuestionsExcel: (exportAllPackages?: boolean) => void;
  handleExportQuestionsCsv: () => void;
  handleExportResultsExcel: (scope?: 'filtered' | 'all' | { kelas: string }) => void;
  handleExportResultsCsv: (scope?: 'filtered' | 'all' | { kelas: string }) => void;
  handleExportClassSummaryExcel: () => void;
  handleGenerateAiAnalysis: (result: ResultItem) => Promise<void>;
  handleBatchAiAnalysisForList: (targetList: ResultItem[]) => Promise<void>;
}

const AdminDashboardContext = createContext<AdminDashboardContextValue | null>(null);

export const AdminDashboardProvider: React.FC<
  AdminDashboardProps & { children: React.ReactNode }
> = ({
  exams,
  questions,
  students,
  results,
  onRefreshData,
  syncPulse,
  isSyncingFirebase = false,
  onManualFirebaseSync,
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cbt_teacher_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<{
    name: string;
    email: string;
  }>({
    name: 'Sahidin',
    email: 'sahidin30@gmail.com',
  });

  const activeTab = resolveAdminTabFromPathname(location.pathname);

  const setActiveTab = (tab: AdminTabId) => {
    try {
      localStorage.setItem('cbt_teacher_active_tab', tab);
    } catch {}
    navigate(ADMIN_TAB_ROUTES[tab]);
  };

  useEffect(() => {
    try {
      localStorage.setItem('cbt_teacher_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cbt_admin_sidebar_minimized') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('cbt_admin_sidebar_minimized', String(isSidebarMinimized));
    } catch {}
  }, [isSidebarMinimized]);

  const [isTopMetricsMinimized, setIsTopMetricsMinimized] = useState<boolean>(false);
  const [isSubMenuBarMinimized, setIsSubMenuBarMinimized] = useState<boolean>(false);
  const [isReportSummaryMinimized, setIsReportSummaryMinimized] = useState<boolean>(true);
  const [isReportLotsHotsMinimized, setIsReportLotsHotsMinimized] = useState<boolean>(true);
  const [isReportClassTableMinimized, setIsReportClassTableMinimized] = useState<boolean>(true);
  const [isReportQuestionPanelMinimized, setIsReportQuestionPanelMinimized] = useState<boolean>(true);
  const [isReportStudentListMinimized, setIsReportStudentListMinimized] = useState<boolean>(false);

  const [isUjianFormMinimized, setIsUjianFormMinimized] = useState<boolean>(true);
  const [isUjianTableMinimized, setIsUjianTableMinimized] = useState<boolean>(false);
  const [isUjianChartMinimized, setIsUjianChartMinimized] = useState<boolean>(true);
  const [isSiswaClassPanelMinimized, setIsSiswaClassPanelMinimized] = useState<boolean>(true);
  const [isSiswaStatusPanelMinimized, setIsSiswaStatusPanelMinimized] = useState<boolean>(true);
  const [isSiswaFormMinimized, setIsSiswaFormMinimized] = useState<boolean>(true);
  const [isSiswaTableMinimized, setIsSiswaTableMinimized] = useState<boolean>(false);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [isRecalculatingScores, setIsRecalculatingScores] = useState(false);
  const [recalcFeedback, setRecalcFeedback] = useState<string | null>(null);

  const [dryRunExam, setDryRunExam] = useState<ExamItem | null>(null);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);

  const {
    data: archivedExams = [],
    isLoading: isLoadingArchive,
    refetch: refetchArchives,
  } = useQuery<ArchivedExamRecord[]>({
    queryKey: CBT_ARCHIVE_QUERY_KEY,
    queryFn: fetchArchivedExamsCbt,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const refreshArchives = () => {
    refetchArchives();
  };

  const handleRestoreArchivedExam = async (archive: ArchivedExamRecord) => {
    setRestoringArchiveId(archive.id);
    setExamFeedback(null);
    try {
      const outcome = await restoreArchivedExamCbt(archive);
      setExamFeedback(
        `Paket ujian "${outcome.exam.judul_ujian}" berhasil dipulihkan dari Arsip 30 Hari (${outcome.questions.length} butir soal & ${outcome.results.length} nilai).`
      );
      queryClient.invalidateQueries({ queryKey: CBT_ARCHIVE_QUERY_KEY });
      await onRefreshData();
    } catch (err: any) {
      setExamFeedback(err?.message || 'Gagal memulihkan paket ujian dari arsip.');
    } finally {
      setRestoringArchiveId(null);
    }
  };

  const handleRecalculateAllScores = async () => {
    setIsRecalculatingScores(true);
    setRecalcFeedback(null);
    try {
      const outcome = await recalculateAndSyncAllResultsCbt({
        results,
        questions,
        students,
        exams,
      });
      await onRefreshData();
      const classSummary =
        outcome.updatedClasses && outcome.updatedClasses.length > 0
          ? ` (Kelas: ${outcome.updatedClasses.join(', ')})`
          : '';
      setRecalcFeedback(
        outcome.updatedCount > 0
          ? `Berhasil memperbarui & menyinkronkan ${outcome.updatedCount} dari ${outcome.totalResults} nilai serta Analisis Humanis peserta ujian sebelumnya${classSummary} dengan Standar Penilaian Humanis PG Kompleks.`
          : `Seluruh ${outcome.totalResults} nilai & Analisis Kognitif Humanis peserta ujian${classSummary} (termasuk Kelas 11 Soshum Putri & 10 Abu Bakar) sudah tersinkronisasi optimal.`
      );
    } catch (err: any) {
      setRecalcFeedback(err?.message || 'Gagal menghitung ulang nilai siswa.');
    } finally {
      setIsRecalculatingScores(false);
    }
  };

  const [isBankSoalDetailOpen, setIsBankSoalDetailOpen] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [bankSoalDeleteModal, setBankSoalDeleteModal] = useState<{
    examId: number;
    title: string;
    questionCount: number;
  } | null>(null);
  const [isDeletingBankSoal, setIsDeletingBankSoal] = useState(false);
  const [isClearingExamQuestions, setIsClearingExamQuestions] = useState(false);
  const bankSoalDetailRef = useRef<HTMLDivElement | null>(null);
  const [bankSoalFeedback, setBankSoalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (exams.length > 0 && selectedExamId === null) {
      setSelectedExamId(exams[0].id);
    } else if (
      exams.length > 0 &&
      selectedExamId !== null &&
      !exams.some((e) => e.id === selectedExamId)
    ) {
      setSelectedExamId(exams[0].id);
    } else if (exams.length === 0) {
      setSelectedExamId(null);
    }
  }, [exams, selectedExamId]);

  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDuration, setNewExamDuration] = useState('60');
  const [newExamTargetTingkat, setNewExamTargetTingkat] = useState<string>('10');
  const [newExamTargetKelas, setNewExamTargetKelas] = useState<string>('SEMUA');
  const [newExamKategori, setNewExamKategori] = useState<string>('Penilaian Harian (PH / Kuis)');
  const [newExamStatus, setNewExamStatus] = useState<'AKTIF' | 'DRAF' | 'SELESAI'>('DRAF');
  const [newExamTargetRombel, setNewExamTargetRombel] = useState<string[]>([]);
  const [filterExamKategori, setFilterExamKategori] = useState<string>('SEMUA');
  const [filterExamStatus, setFilterExamStatus] = useState<string>('SEMUA');
  const [newExamAcakSoal, setNewExamAcakSoal] = useState<boolean>(true);
  const [newExamAcakOpsi, setNewExamAcakOpsi] = useState<boolean>(true);
  const [newExamKodePaket, setNewExamKodePaket] = useState<string>('PAKET-A');
  const [newExamMultiPaket, setNewExamMultiPaket] = useState<boolean>(false);
  const [newExamJumlahPaket, setNewExamJumlahPaket] = useState<number>(2);
  const [newExamTokenSesi, setNewExamTokenSesi] = useState<string>(() => generateExamToken());
  const [newExamTampilkanNilai, setNewExamTampilkanNilai] = useState<boolean>(true);
  const [newExamPengumuman, setNewExamPengumuman] = useState<string>('');
  const [newExamMataPelajaran, setNewExamMataPelajaran] = useState<string>('Sosiologi');
  const [newExamDistribusiMode, setNewExamDistribusiMode] = useState<string>('OTOMATIS_GANJIL_GENAP');
  const [inlineTokenEditExamId, setInlineTokenEditExamId] = useState<number | null>(null);
  const [inlineTokenEditValue, setInlineTokenEditValue] = useState<string>('');
  const [isDistributingPackages, setIsDistributingPackages] = useState(false);
  const [filterExamTingkat, setFilterExamTingkat] = useState<string>('SEMUA');
  const [filterExamMapel, setFilterExamMapel] = useState<string>('SEMUA');
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [examFeedback, setExamFeedback] = useState<string | null>(null);

  const [studentInputMode, setStudentInputMode] = useState<'manual' | 'csv'>('manual');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentNisnInput, setStudentNisnInput] = useState('');
  const [studentTingkatPreset, setStudentTingkatPreset] = useState<'X' | 'XI' | 'XII'>('X');
  const [studentClassInput, setStudentClassInput] = useState('X MIPA 1');
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [studentCsvText, setStudentCsvText] = useState('');
  const [replaceExistingStudents, setReplaceExistingStudents] = useState(false);
  const [isUploadingStudentsCsv, setIsUploadingStudentsCsv] = useState(false);
  const [filterStudentTingkat, setFilterStudentTingkat] = useState<string>('SEMUA');
  const [filterKelas, setFilterKelas] = useState<string>('SEMUA');
  const [filterStudentMapel, setFilterStudentMapel] = useState<string>('SEMUA');
  const [filterStudentExamId, setFilterStudentExamId] = useState<string>('SEMUA');
  const [filterStudentStatus, setFilterStudentStatus] = useState<string>('SEMUA');
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [questionInputMode, setQuestionInputMode] = useState<'manual' | 'csv'>('manual');
  const [manualTipe, setManualTipe] = useState<'PG' | 'Kompleks'>('PG');
  const [manualWacana, setManualWacana] = useState('');
  const [manualTeksSoal, setManualTeksSoal] = useState('');
  const [manualOpsiA, setManualOpsiA] = useState('');
  const [manualOpsiB, setManualOpsiB] = useState('');
  const [manualOpsiC, setManualOpsiC] = useState('');
  const [manualOpsiD, setManualOpsiD] = useState('');
  const [manualOpsiE, setManualOpsiE] = useState('');
  const [manualKunci, setManualKunci] = useState<string[]>(['A']);
  const [manualBobot, setManualBobot] = useState('2');
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  const [filterQuestionType, setFilterQuestionType] = useState<'SEMUA' | 'PG' | 'Kompleks'>('SEMUA');
  const [searchQuestionQuery, setSearchQuestionQuery] = useState('');
  const [copyTargetExamId, setCopyTargetExamId] = useState<number | null>(null);
  const [isCopyingQuestions, setIsCopyingQuestions] = useState(false);

  const [bankSoalMapelFilter, setBankSoalMapelFilter] = useState<string>('SEMUA');
  const [bankSoalTingkatFilter, setBankSoalTingkatFilter] = useState<string>('SEMUA');
  const [questionViewMode, setQuestionViewMode] = useState<'ringkas' | 'per_soal' | 'lengkap'>('ringkas');
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<number[]>([]);
  const [focusedQuestionIdx, setFocusedQuestionIdx] = useState<number>(0);
  const [questionPage, setQuestionPage] = useState<number>(1);
  const [questionsPerPage, setQuestionsPerPage] = useState<number>(10);

  const toggleExpandQuestion = (qId: number) => {
    setExpandedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  const [csvText, setCsvText] = useState('');
  const [replaceExistingQuestions, setReplaceExistingQuestions] = useState(false);
  const [quickExamTitle, setQuickExamTitle] = useState('Ujian CBT Sosiologi');
  const [quickExamTingkat, setQuickExamTingkat] = useState<string>('SEMUA');
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  const [customClasses, setCustomClasses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('eduassess_custom_classes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newClassNameInput, setNewClassNameInput] = useState('');
  const [renamingClassTarget, setRenamingClassTarget] = useState<string | null>(null);
  const [renameClassValue, setRenameClassValue] = useState('');

  const [filterResultTingkat, setFilterResultTingkat] = useState<string>('SEMUA');
  const [filterResultKelas, setFilterResultKelas] = useState<string>('SEMUA');
  const [filterResultMapel, setFilterResultMapel] = useState<string>('SEMUA');
  const [filterResultExamId, setFilterResultExamId] = useState<string>('SEMUA');
  const [analyzingResultId, setAnalyzingResultId] = useState<number | null>(null);
  const [isAnalyzingBatchClass, setIsAnalyzingBatchClass] = useState(false);
  const [selectedAiModal, setSelectedAiModal] = useState<{
    studentName: string;
    studentClass: string;
    analysis: AnalisisAI;
  } | null>(null);
  const [aiErrorBanner, setAiErrorBanner] = useState<string | null>(null);

  // Active non-archived questions for Bank Soal editing & package counts (preserves versioned historical questions in `questions` for reports)
  const activeBankQuestions = useMemo(
    () => questions.filter((q) => !q.is_archived_version),
    [questions]
  );

  const currentExam =
    exams.find((e) => e.id === selectedExamId) || exams[0] || null;
  const currentExamQuestions = useMemo(
    () =>
      activeBankQuestions
        .filter((q) => currentExam && Number(q.exam_id) === Number(currentExam.id))
        .sort((a, b) => Number(a.id) - Number(b.id)),
    [activeBankQuestions, currentExam]
  );
  const filteredExamQuestions = useMemo(
    () =>
      currentExamQuestions.filter((q) => {
        const matchType =
          filterQuestionType === 'SEMUA' || q.tipe_soal === filterQuestionType;
        const qText = `${q.teks_soal} ${q.data_opsi?.wacana || ''} ${q.data_opsi?.id_soal_csv || ''}`.toLowerCase();
        const matchSearch =
          !searchQuestionQuery.trim() ||
          qText.includes(searchQuestionQuery.trim().toLowerCase());
        return matchType && matchSearch;
      }),
    [currentExamQuestions, filterQuestionType, searchQuestionQuery]
  );

  useEffect(() => {
    setQuestionPage(1);
    setFocusedQuestionIdx(0);
  }, [selectedExamId, filterQuestionType, searchQuestionQuery]);

  const formatDistribusiLabel = (tingkat: string, kelas: string) => {
    if (kelas && kelas !== 'SEMUA') return `Khusus Kelas ${kelas}`;
    if (tingkat === '10') return 'Tingkat 1 (Kelas X / 10)';
    if (tingkat === '11') return 'Tingkat 2 (Kelas XI / 11)';
    if (tingkat === '12') return 'Tingkat 3 (Kelas XII / 12)';
    return 'Semua Tingkatan (X, XI, XII)';
  };

  const uniqueClasses = useMemo(
    () =>
      Array.from(
        new Set([
          ...students.map((s) => s.kelas.trim()).filter(Boolean),
          ...customClasses.map((c) => c.trim()).filter(Boolean),
        ])
      ).sort((a, b) => {
        const tA = extractTingkatFromKelas(a);
        const tB = extractTingkatFromKelas(b);
        if (tA !== tB) return tA.localeCompare(tB);
        return a.localeCompare(b);
      }),
    [students, customClasses]
  );

  const availableMataPelajaran = useMemo(() => {
    const list = Array.from(
      new Set(exams.map((ex) => getEffectiveMataPelajaran(ex)).filter(Boolean))
    );
    if (list.length === 0) list.push('Sosiologi');
    return list;
  }, [exams]);

  const resultMapelMatchedExams =
    filterResultMapel === 'SEMUA'
      ? exams
      : exams.filter(
          (ex) =>
            getEffectiveMataPelajaran(ex).toUpperCase() ===
            filterResultMapel.toUpperCase()
        );

  const resultScopedListForAnalytics = results.filter((resItem) => {
    const ex = exams.find((e) => Number(e.id) === Number(resItem.exam_id));
    const resMapel = getEffectiveMataPelajaran(ex);
    const matchMapel =
      filterResultMapel === 'SEMUA' ||
      resMapel.toUpperCase() === filterResultMapel.toUpperCase();
    const matchExam =
      filterResultExamId === 'SEMUA' ||
      String(resItem.exam_id) === filterResultExamId;
    return matchMapel && matchExam;
  });

  const classAnalyticsData = computeClassAnalytics(
    students,
    resultScopedListForAnalytics,
    customClasses,
    questions
  );

  const filteredResults = results.filter((resItem) => {
    const st = students.find((s) => s.id === resItem.student_id);
    const ex = exams.find((e) => Number(e.id) === Number(resItem.exam_id));
    const sKelas = st?.kelas || '';
    const sTingkat = extractTingkatFromKelas(sKelas);
    const resMapel = getEffectiveMataPelajaran(ex);
    const matchTingkat =
      filterResultTingkat === 'SEMUA' || sTingkat === filterResultTingkat;
    const matchKelas =
      filterResultKelas === 'SEMUA' ||
      sKelas.trim().toLowerCase() === filterResultKelas.trim().toLowerCase();
    const matchMapel =
      filterResultMapel === 'SEMUA' ||
      resMapel.toUpperCase() === filterResultMapel.toUpperCase();
    const matchExam =
      filterResultExamId === 'SEMUA' ||
      String(resItem.exam_id) === filterResultExamId;
    return matchTingkat && matchKelas && matchMapel && matchExam;
  });

  const filteredExams = exams.filter((e) => {
    const matchTingkat =
      filterExamTingkat === 'SEMUA' ||
      e.target_tingkat === filterExamTingkat ||
      e.target_tingkat === 'SEMUA';
    const matchMapel =
      filterExamMapel === 'SEMUA' ||
      getEffectiveMataPelajaran(e).toUpperCase() === filterExamMapel.toUpperCase();
    const matchKategori =
      filterExamKategori === 'SEMUA' ||
      (e.kategori_ujian || 'Penilaian Harian (PH / Kuis)') === filterExamKategori;
    const matchStatus =
      filterExamStatus === 'SEMUA' || (e.status_ujian || 'DRAF') === filterExamStatus;
    return matchTingkat && matchMapel && matchKategori && matchStatus;
  });

  const studentScopedExams = (() => {
    const byMapel =
      filterStudentMapel === 'SEMUA'
        ? exams
        : exams.filter(
            (ex) =>
              getEffectiveMataPelajaran(ex).toUpperCase() ===
              filterStudentMapel.toUpperCase()
          );
    if (filterStudentExamId === 'SEMUA') return byMapel.length > 0 ? byMapel : exams;
    const byId = byMapel.filter((ex) => String(ex.id) === filterStudentExamId);
    return byId.length > 0 ? byId : byMapel.length > 0 ? byMapel : exams;
  })();

  const filteredStudents = students.filter((s) => {
    const sTingkat = extractTingkatFromKelas(s.kelas);
    const matchTingkat =
      filterStudentTingkat === 'SEMUA' || sTingkat === filterStudentTingkat;
    const matchKelas = filterKelas === 'SEMUA' || s.kelas === filterKelas;
    const matchStatus =
      filterStudentStatus === 'SEMUA' || s.status_ujian === filterStudentStatus;
    return matchTingkat && matchKelas && matchStatus;
  });

  const countTingkat10 = students.filter((s) => extractTingkatFromKelas(s.kelas) === '10').length;
  const countTingkat11 = students.filter((s) => extractTingkatFromKelas(s.kelas) === '11').length;
  const countTingkat12 = students.filter((s) => extractTingkatFromKelas(s.kelas) === '12').length;

  const countStatusBelumMulai = students.filter((s) => s.status_ujian === 'Belum Mulai').length;
  const countStatusSedangUjian = students.filter((s) => s.status_ujian === 'Sedang Ujian').length;
  const countStatusSelesai = students.filter((s) => s.status_ujian === 'Selesai').length;
  const countStatusDiblokir = students.filter((s) => s.status_ujian === 'Diblokir').length;
  const activeStudentsCount = countStatusSedangUjian;

  const handleTeacherFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const cleanEmail = teacherUsername.trim().toLowerCase();
    const cleanPin = teacherPassword.trim();

    if (!cleanEmail || !cleanPin) {
      setAuthError('Silakan masukkan Email Guru dan PIN Akses.');
      return;
    }

    if (cleanEmail === 'sahidin30@gmail.com' && cleanPin === '949321') {
      setTeacherProfile({ name: 'Sahidin', email: 'sahidin30@gmail.com' });
      setIsAuthenticated(true);
      try {
        localStorage.setItem('cbt_teacher_auth', 'true');
        localStorage.setItem('cbt_active_portal', 'teacher');
      } catch {}
      setTeacherPassword('');
    } else {
      setAuthError('Email atau PIN Guru tidak sesuai.');
    }
  };

  const handleGoogleTeacherSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const userEmail = (cred.user.email || '').toLowerCase();
      if (userEmail && userEmail !== 'sahidin30@gmail.com') {
        setAuthError('Akses ditolak: Hanya akun sahidin30@gmail.com yang diizinkan masuk.');
        return;
      }
      const idToken = await cred.user.getIdToken();
      await safeApiJson('/api/auth/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setTeacherProfile({
        name: cred.user.displayName || 'Sahidin',
        email: cred.user.email || 'sahidin30@gmail.com',
      });
      setIsAuthenticated(true);
      try {
        localStorage.setItem('cbt_teacher_auth', 'true');
        localStorage.setItem('cbt_active_portal', 'teacher');
      } catch {}
    } catch {
      setAuthError('Login Google dibatalkan. Silakan masuk menggunakan Email & PIN Guru di atas.');
    }
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim()) return;
    setIsSavingExam(true);
    setExamFeedback(null);

    const payload = {
      judul_ujian: newExamTitle.trim(),
      durasi_menit: Number(newExamDuration) || 60,
      target_tingkat: newExamTargetTingkat,
      target_kelas: newExamTargetKelas.trim() || 'SEMUA',
      kategori_ujian: newExamKategori,
      status_ujian: newExamStatus,
      target_rombel: newExamTargetRombel,
      acak_soal: newExamAcakSoal,
      acak_opsi: newExamAcakOpsi,
      kode_paket: newExamKodePaket.trim() || 'PAKET-A',
      mode_multi_paket: newExamMultiPaket,
      jumlah_paket: newExamJumlahPaket,
      token_sesi: newExamTokenSesi.trim().toUpperCase() || generateExamToken(),
      tampilkan_nilai: newExamTampilkanNilai,
      pengumuman: newExamPengumuman.trim(),
      mata_pelajaran: newExamMataPelajaran.trim() || 'Sosiologi',
      distribusi_paket_mode: newExamDistribusiMode || 'OTOMATIS_GANJIL_GENAP',
    };

    try {
      const savedExam = await saveExamCbt(payload, editingExamId);
      if (editingExamId) {
        setExamFeedback(
          `Paket ujian "${savedExam.judul_ujian}" [${savedExam.mata_pelajaran} · ${savedExam.status_ujian || 'DRAF'}] berhasil diperbarui (Token Sesi Ujian: ${savedExam.token_sesi}).`
        );
        setEditingExamId(null);
        setNewExamTitle('');
        setNewExamDuration('60');
        setNewExamTargetTingkat('10');
        setNewExamTargetKelas('SEMUA');
        setNewExamKategori('Penilaian Harian (PH / Kuis)');
        setNewExamStatus('DRAF');
        setNewExamTargetRombel([]);
        setNewExamAcakSoal(true);
        setNewExamAcakOpsi(true);
        setNewExamKodePaket('PAKET-A');
        setNewExamMultiPaket(false);
        setNewExamJumlahPaket(2);
        setNewExamTokenSesi(generateExamToken());
        setNewExamTampilkanNilai(true);
        setNewExamPengumuman('');
        setNewExamMataPelajaran('Sosiologi');
        setNewExamDistribusiMode('OTOMATIS_GANJIL_GENAP');
      } else {
        setExamFeedback(
          `Paket ujian "${savedExam.judul_ujian}" [${savedExam.mata_pelajaran} · ${savedExam.status_ujian || 'DRAF'}] berhasil dibuat dengan Token Sesi Ujian: ${savedExam.token_sesi}.`
        );
        setSelectedExamId(savedExam.id);
        setNewExamTitle('');
        setNewExamDuration('60');
        setNewExamKategori('Penilaian Harian (PH / Kuis)');
        setNewExamStatus('DRAF');
        setNewExamTargetRombel([]);
        setNewExamAcakSoal(true);
        setNewExamAcakOpsi(true);
        setNewExamKodePaket('PAKET-A');
        setNewExamMultiPaket(false);
        setNewExamJumlahPaket(2);
        setNewExamTokenSesi(generateExamToken());
        setNewExamTampilkanNilai(true);
        setNewExamPengumuman('');
      }
      await onRefreshData();
      setIsUjianFormMinimized(true);
      setIsUjianTableMinimized(false);
      setIsUjianChartMinimized(true);
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleUpdateExamSessionToken = async (exam: ExamItem, customToken?: string) => {
    setExamFeedback(null);
    try {
      const updated = await updateExamSessionTokenCbt(exam, customToken);
      setInlineTokenEditExamId(null);
      setInlineTokenEditValue('');
      setExamFeedback(
        `Token Sesi Ujian untuk "${updated.judul_ujian}" berhasil diperbarui menjadi: ${updated.token_sesi}. Berikan token ini kepada siswa saat ujian dimulai.`
      );
      await onRefreshData();
    } catch (err: any) {
      setExamFeedback(err.message || 'Gagal memperbarui Token Sesi Ujian.');
    }
  };

  const handleToggleExamStatus = async (
    exam: ExamItem,
    nextStatus: 'AKTIF' | 'DRAF' | 'SELESAI'
  ) => {
    setExamFeedback(null);
    try {
      await toggleExamStatusCbt(exam, nextStatus);
      setExamFeedback(
        nextStatus === 'AKTIF'
          ? `Sesi ujian "${exam.judul_ujian}" kini AKTIF! Token Sesi Ujian: ${getEffectiveExamSessionToken(exam)}. Siswa sudah bisa memilih ujian ini di menu Jadwal Ujian.`
          : nextStatus === 'DRAF'
            ? `Sesi ujian "${exam.judul_ujian}" kini berstatus DRAF (Tersimpan di Bank Soal, siswa tidak bisa melihat).`
            : `Sesi ujian "${exam.judul_ujian}" telah DITUTUP (Arsip).`
      );
      await onRefreshData();
    } catch (err: any) {
      setExamFeedback(err.message || 'Gagal mengubah status ujian.');
    }
  };

  const handleBatchDistributePackages = async (targetClass?: string) => {
    const targetPool = targetClass
      ? students.filter((s) => s.kelas.trim() === targetClass.trim())
      : filteredStudents;
    if (targetPool.length === 0) return;
    setIsDistributingPackages(true);
    setStudentFeedback(null);
    try {
      const assigned = assignPackageVariantsToStudents(
        targetPool,
        2,
        ['PAKET-A', 'PAKET-B', 'PAKET-C', 'PAKET-D'],
        exams
      );
      await batchAssignPackageVariantsCbt(assigned);
      setStudentFeedback({
        type: 'success',
        message: `Berhasil mendistribusikan kode paket soal secara proporsional untuk ${assigned.length} siswa pada setiap kelas & angkatan!`,
      });
      await onRefreshData();
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || 'Gagal mendistribusikan multi-paket siswa.',
      });
    } finally {
      setIsDistributingPackages(false);
    }
  };

  // Pillar 4: Deep Delete with 30-day Soft-Delete Archive
  const handleDeleteExam = async (examId: number, title: string) => {
    setExamFeedback(null);
    const targetExam = exams.find((e) => Number(e.id) === Number(examId));
    if (targetExam) {
      await softDeleteExamCbt({ exam: targetExam, questions, results });
      queryClient.invalidateQueries({ queryKey: CBT_ARCHIVE_QUERY_KEY });
      setExamFeedback(
        `Paket ujian "${title}" dipindahkan ke Arsip Terhapus (30 Hari) dan dibersihkan secara asinkron.`
      );
    }
    await onRefreshData();
  };

  const handleClearBankSoalOnly = async (examId: number, title: string) => {
    setIsDeletingBankSoal(true);
    setBankSoalFeedback(null);
    setUploadStatus(null);
    try {
      const removedCount = await clearExamQuestionsCbt(examId, questions);
      setBankSoalFeedback({
        type: 'success',
        message: `Seluruh butir soal (${removedCount} soal) pada Bank Soal "${title}" berhasil dikosongkan. Paket ujian tetap tersimpan.`,
      });
      setBankSoalDeleteModal(null);
      await onRefreshData();
    } catch (err: any) {
      setBankSoalFeedback({
        type: 'error',
        message: err.message || 'Gagal mengosongkan butir soal pada bank soal.',
      });
    } finally {
      setIsDeletingBankSoal(false);
    }
  };

  const handleDeleteFullBankSoal = async (examId: number, title: string) => {
    setIsDeletingBankSoal(true);
    setBankSoalFeedback(null);
    setUploadStatus(null);
    try {
      const targetExam = exams.find((e) => Number(e.id) === Number(examId));
      if (targetExam) {
        await softDeleteExamCbt({ exam: targetExam, questions, results });
        queryClient.invalidateQueries({ queryKey: CBT_ARCHIVE_QUERY_KEY });
      }
      setBankSoalDeleteModal(null);
      setIsBankSoalDetailOpen(false);
      if (selectedExamId === examId) {
        const remaining = exams.filter((e) => e.id !== examId);
        setSelectedExamId(remaining.length > 0 ? remaining[0].id : null);
      }
      setBankSoalFeedback({
        type: 'success',
        message: `Bank Soal "${title}" beserta seluruh butir soalnya telah dipindahkan ke Arsip Terhapus (30 Hari) & dibersihkan bertahap.`,
      });
      await onRefreshData();
    } catch (err: any) {
      setBankSoalFeedback({
        type: 'error',
        message: err.message || 'Gagal menghapus Bank Soal dari sistem.',
      });
    } finally {
      setIsDeletingBankSoal(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentNameInput.trim() || !studentClassInput.trim()) return;
    setIsSavingStudent(true);
    setStudentFeedback(null);

    try {
      const existingSt = editingStudentId
        ? students.find((s) => s.id === editingStudentId)
        : undefined;
      const savedStudent = await saveStudentCbt(
        {
          nama: studentNameInput.trim(),
          kelas: studentClassInput.trim(),
          nisn: studentNisnInput.trim() || undefined,
        },
        editingStudentId,
        existingSt
      );

      if (editingStudentId) {
        setStudentFeedback({ type: 'success', message: 'Data siswa berhasil diperbarui.' });
        setEditingStudentId(null);
        setStudentNameInput('');
        setStudentNisnInput('');
      } else {
        setStudentFeedback({
          type: 'success',
          message: `Siswa "${savedStudent.nama}" (${savedStudent.kelas}) berhasil disimpan dengan Token Login: ${savedStudent.token_ujian}`,
        });
        setStudentNameInput('');
        setStudentNisnInput('');
      }
      await onRefreshData();
    } finally {
      setIsSavingStudent(false);
    }
  };

  const executeStudentCsvUpload = async (rawCsvContent: string, sourceLabel?: string) => {
    if (!rawCsvContent.trim()) {
      setStudentFeedback({
        type: 'error',
        message: 'Silakan pilih file Excel/CSV siswa atau tempelkan daftar Nama & Kelas.',
      });
      return;
    }

    setIsUploadingStudentsCsv(true);
    setStudentFeedback(null);
    try {
      const outcome = await uploadStudentsCsvCbt(
        rawCsvContent,
        replaceExistingStudents,
        students
      );
      setStudentFeedback({
        type: 'success',
        message: `${sourceLabel ? `File "${sourceLabel}" diproses: ` : ''}Berhasil mengimpor ${outcome.insertedCount} siswa beserta Token Ujian unik 6 karakter ke database.`,
      });
      setStudentCsvText('');
      await onRefreshData();
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || 'Gagal mengimpor file siswa.',
      });
    } finally {
      setIsUploadingStudentsCsv(false);
    }
  };

  const handleStudentCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    e.target.value = '';
    setIsUploadingStudentsCsv(true);
    setStudentFeedback(null);
    try {
      const outcome = await parseStudentsFromFile(file);
      if (outcome.rows.length === 0) {
        setStudentFeedback({
          type: 'error',
          message:
            outcome.errors.join(' | ') ||
            `File "${fileName}" tidak memiliki data siswa yang valid.`,
        });
        return;
      }
      setStudentCsvText(outcome.csvRepresentation);
      await executeStudentCsvUpload(
        outcome.csvRepresentation,
        `${fileName} (${outcome.formatDetected})`
      );
    } catch (err: any) {
      setStudentFeedback({
        type: 'error',
        message: err.message || `Gagal membaca file siswa "${fileName}".`,
      });
    } finally {
      setIsUploadingStudentsCsv(false);
    }
  };

  const handleUploadStudentCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeStudentCsvUpload(studentCsvText);
  };

  const handleDownloadSampleStudentCsv = () => {
    triggerBrowserDownload(
      SAMPLE_STUDENT_CSV_TEMPLATE,
      'Template_Siswa_Kolom_Terpisah.csv',
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadStudentTemplateExcel = () => {
    triggerBrowserDownload(
      generateStudentTemplateExcel(),
      'Template_Siswa_3_Tingkatan.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleExportStudentsExcel = () => {
    const targetList = filteredStudents.length > 0 ? filteredStudents : students;
    const rows = targetList.map((st, idx) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      const rec = resolveStudentPrecisionRecord({
        student: st,
        allStudents: students,
        exams,
        questions,
        results,
      });
      return [
        idx + 1,
        `${rec.noAbsen} (${rec.ganjilGenapLabel})`,
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? 'Umum' : `Tingkat ${tkt}`,
        rec.tokenLogin,
        rec.kodePaket,
        `${rec.namaPaketSoal} (${rec.mataPelajaran})`,
        rec.tokenUjianHariIni,
        rec.statusLabel,
        rec.score !== null ? rec.score : '-',
        rec.predikatLabel,
      ];
    });
    const html = buildExcelHtmlTable(
      'Database Siswa, Token Login, Paket Soal, Token Ujian & Nilai CBT',
      [
        'No',
        'No. Absen (Ganjil/Genap)',
        'nama_siswa',
        'kelas',
        'Tingkatan Kelas',
        'Token Login Akun',
        'Kode Paket Soal',
        'Nama Paket Soal & Mapel',
        'Token Ujian Hari Ini',
        'Status Ujian',
        'Nilai Akhir (0-100)',
        'Predikat',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      'Database_Siswa_Token_Login_Token_Ujian_dan_Nilai_CBT.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleUpdateStudentStatus = async (student: StudentItem, nextStatus: string) => {
    setStudentFeedback(null);
    await updateStudentStatusCbt(student, nextStatus);
    setStudentFeedback({
      type: 'success',
      message: `Status ujian siswa "${student.nama}" (${student.kelas}) berhasil diubah menjadi "${nextStatus}".`,
    });
    await onRefreshData();
  };

  const handleBulkUpdateStudentStatus = async (nextStatus: string) => {
    if (filteredStudents.length === 0) return;
    setStudentFeedback(null);
    await bulkUpdateStudentStatusCbt(filteredStudents, nextStatus);
    setStudentFeedback({
      type: 'success',
      message: `Status ${filteredStudents.length} siswa pada filter aktif berhasil diatur menjadi "${nextStatus}".`,
    });
    await onRefreshData();
  };

  const handleRegenerateToken = async (studentId: number, nama: string) => {
    setStudentFeedback(null);
    const target = students.find((s) => s.id === studentId);
    if (!target) return;
    const updated = await regenerateStudentTokenCbt(target);
    setStudentFeedback({
      type: 'success',
      message: `Token baru untuk ${nama}: ${updated.token_ujian} (Status di-reset ke Belum Mulai)`,
    });
    await onRefreshData();
  };

  const handleDeleteStudent = async (studentId: number, nama: string) => {
    setStudentFeedback(null);
    await deleteStudentCbt(studentId, nama);
    setStudentFeedback({
      type: 'success',
      message: `Data siswa "${nama}" telah dihapus dari database.`,
    });
    await onRefreshData();
  };

  const handleToggleManualKunci = (letter: string) => {
    if (manualTipe === 'PG') {
      setManualKunci([letter]);
    } else {
      setManualKunci((prev) =>
        prev.includes(letter) ? prev.filter((k) => k !== letter) : [...prev, letter].sort()
      );
    }
  };

  const saveCustomClassesToStorage = (nextList: string[]) => {
    setCustomClasses(nextList);
    try {
      localStorage.setItem('eduassess_custom_classes', JSON.stringify(nextList));
    } catch {}
  };

  const handleAddNewClass = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newClassNameInput.trim();
    if (!clean) return;
    if (!uniqueClasses.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      saveCustomClassesToStorage([...customClasses, clean]);
    }
    setStudentClassInput(clean);
    setNewClassNameInput('');
    setStudentFeedback({
      type: 'success',
      message: `Kelas / Rombel "${clean}" berhasil ditambahkan ke daftar kelas aktif.`,
    });
  };

  const handleRenameClassSubmit = async (oldName: string) => {
    const cleanNew = renameClassValue.trim();
    if (!cleanNew || cleanNew === oldName) {
      setRenamingClassTarget(null);
      return;
    }
    const updatedCount = await renameClassCbt(oldName, cleanNew, students);
    saveCustomClassesToStorage(
      customClasses.map((c) => (c.toLowerCase() === oldName.toLowerCase() ? cleanNew : c))
    );
    setRenamingClassTarget(null);
    setRenameClassValue('');
    if (filterKelas === oldName) setFilterKelas(cleanNew);
    setStudentFeedback({
      type: 'success',
      message: `Nama kelas "${oldName}" berhasil diubah menjadi "${cleanNew}" (${updatedCount} siswa diperbarui).`,
    });
    await onRefreshData();
  };

  const handleDeleteClass = async (kelasName: string) => {
    const deletedCount = await deleteClassStudentsCbt(kelasName, students);
    saveCustomClassesToStorage(
      customClasses.filter((c) => c.toLowerCase() !== kelasName.toLowerCase())
    );
    if (filterKelas === kelasName) setFilterKelas('SEMUA');
    setStudentFeedback({
      type: 'success',
      message: `Kelas "${kelasName}" dihapus (${deletedCount} data siswa di kelas tersebut turut dihapus).`,
    });
    await onRefreshData();
  };

  const handleDownloadClassStudentsExcel = (targetKelasName?: string) => {
    const list = targetKelasName
      ? students.filter((s) => s.kelas.trim().toLowerCase() === targetKelasName.toLowerCase())
      : filteredStudents.length > 0
        ? filteredStudents
        : students;
    const rows = list.map((st, idx) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      const rec = resolveStudentPrecisionRecord({
        student: st,
        allStudents: students,
        exams,
        questions,
        results,
      });
      return [
        idx + 1,
        `${rec.noAbsen} (${rec.ganjilGenapLabel})`,
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? 'Umum' : `Tingkat ${tkt}`,
        rec.tokenLogin,
        rec.kodePaket,
        `${rec.namaPaketSoal} (${rec.mataPelajaran})`,
        rec.tokenUjianHariIni,
        rec.statusLabel,
        rec.score !== null ? rec.score : '-',
        rec.predikatLabel,
      ];
    });
    const label = targetKelasName || 'Semua_Kelas';
    const html = buildExcelHtmlTable(
      `Data Token Login, Token Ujian & Nilai Siswa ${label}`,
      [
        'No',
        'No. Absen (Ganjil/Genap)',
        'nama_siswa',
        'kelas',
        'Tingkatan Kelas',
        'Token Login Akun',
        'Kode Paket Soal',
        'Nama Paket Soal & Mapel',
        'Token Ujian Hari Ini',
        'Status Ujian',
        'Nilai Akhir (0-100)',
        'Predikat',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      `Database_Siswa_Token_dan_Nilai_${label.replace(/[^a-zA-Z0-9]+/g, '_')}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const ensureActiveExamForQuestions = async (): Promise<ExamItem> => {
    if (currentExam) return currentExam;
    const createdExam = await saveExamCbt({
      judul_ujian: quickExamTitle.trim() || 'Ujian CBT Sosiologi',
      durasi_menit: 60,
      target_tingkat: quickExamTingkat || 'SEMUA',
      target_kelas: 'SEMUA',
    });
    setSelectedExamId(createdExam.id);
    return createdExam;
  };

  const handleStartEditQuestion = (q: QuestionItem) => {
    setShowUploadPanel(true);
    setQuestionInputMode('manual');
    setEditingQuestionId(q.id);
    const isKompleks = q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
    setManualTipe(isKompleks ? 'Kompleks' : 'PG');
    setManualBobot(String(q.bobot || (isKompleks ? 3 : 2)));
    setManualWacana(q.data_opsi?.wacana || '');
    setManualTeksSoal(q.teks_soal || '');
    setManualOpsiA(q.data_opsi?.opsi?.A || '');
    setManualOpsiB(q.data_opsi?.opsi?.B || '');
    setManualOpsiC(q.data_opsi?.opsi?.C || '');
    setManualOpsiD(q.data_opsi?.opsi?.D || '');
    setManualOpsiE(q.data_opsi?.opsi?.E || '');
    setManualKunci(q.kunci_jawaban?.length ? q.kunci_jawaban : ['A']);
    setUploadStatus(null);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
    setManualWacana('');
    setManualTeksSoal('');
    setManualOpsiA('');
    setManualOpsiB('');
    setManualOpsiC('');
    setManualOpsiD('');
    setManualOpsiE('');
    setManualKunci(['A']);
  };

  const handleAddManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTeksSoal.trim() || !manualOpsiA.trim() || !manualOpsiB.trim()) {
      setUploadStatus({
        type: 'error',
        message: 'Teks soal dan minimal opsi jawaban wajib diisi.',
      });
      return;
    }

    setIsSavingQuestion(true);
    setUploadStatus(null);
    try {
      const targetExam = await ensureActiveExamForQuestions();
      if (editingQuestionId) {
        const updatedQuestion = await updateManualQuestionCbt({
          questionId: editingQuestionId,
          examId: targetExam.id,
          tipe_soal: manualTipe,
          wacana: manualWacana,
          teks_soal: manualTeksSoal,
          opsi: {
            A: manualOpsiA,
            B: manualOpsiB,
            C: manualOpsiC,
            D: manualOpsiD,
            E: manualOpsiE,
          },
          kunci_jawaban: manualKunci,
          bobot: Number(manualBobot) || (manualTipe === 'Kompleks' ? 3 : 2),
        });
        const createdNewVersion = (updatedQuestion.version || 1) > 1;
        setUploadStatus({
          type: 'success',
          message: createdNewVersion
            ? `Versi soal baru (${updatedQuestion.version_label || `soal_v${updatedQuestion.version}`}) berhasil dibuat pada "${targetExam.judul_ujian}". Riwayat nilai ujian siswa sebelumnya tetap aman!`
            : `Butir soal berhasil diperbarui pada paket "${targetExam.judul_ujian}".`,
        });
        setEditingQuestionId(null);
      } else {
        await addManualQuestionCbt({
          examId: targetExam.id,
          tipe_soal: manualTipe,
          wacana: manualWacana,
          teks_soal: manualTeksSoal,
          opsi: {
            A: manualOpsiA,
            B: manualOpsiB,
            C: manualOpsiC,
            D: manualOpsiD,
            E: manualOpsiE,
          },
          kunci_jawaban: manualKunci,
          bobot: Number(manualBobot) || (manualTipe === 'Kompleks' ? 3 : 2),
        });
        setUploadStatus({
          type: 'success',
          message: `Butir soal baru berhasil ditambahkan ke ujian "${targetExam.judul_ujian}".`,
        });
      }
      setManualWacana('');
      setManualTeksSoal('');
      setManualOpsiA('');
      setManualOpsiB('');
      setManualOpsiC('');
      setManualOpsiD('');
      setManualOpsiE('');
      setManualKunci(['A']);
      await onRefreshData();
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || 'Gagal menyimpan soal.',
      });
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: number) => {
    await deleteQuestionCbt(questionId);
    if (editingQuestionId === questionId) handleCancelEditQuestion();
    await onRefreshData();
  };

  const handleClearExamQuestions = async () => {
    if (!currentExam || isClearingExamQuestions) return;
    setIsClearingExamQuestions(true);
    setUploadStatus(null);
    setBankSoalFeedback(null);
    try {
      const removedCount = await clearExamQuestionsCbt(currentExam.id, questions);
      const msg = `Seluruh butir soal (${removedCount} butir) pada paket "${currentExam.judul_ujian}" berhasil dikosongkan. Paket soal tetap tersimpan dan siap diisi ulang.`;
      setUploadStatus({ type: 'success', message: msg });
      setBankSoalFeedback({ type: 'success', message: msg });
      await onRefreshData();
    } catch (err: any) {
      const errMsg = err?.message || 'Gagal mengosongkan soal pada paket ini.';
      setUploadStatus({ type: 'error', message: errMsg });
      setBankSoalFeedback({ type: 'error', message: errMsg });
    } finally {
      setIsClearingExamQuestions(false);
    }
  };

  const handleCopyQuestionsToExam = async () => {
    if (!currentExam || !copyTargetExamId || currentExamQuestions.length === 0) return;
    const destExam = exams.find((e) => e.id === copyTargetExamId);
    if (!destExam) return;
    setIsCopyingQuestions(true);
    setUploadStatus(null);
    try {
      const copied = await copyQuestionsToExamCbt(destExam.id, currentExamQuestions);
      setUploadStatus({
        type: 'success',
        message: `Berhasil menyalin ${copied} butir soal ke paket ujian "${destExam.judul_ujian}".`,
      });
      await onRefreshData();
    } finally {
      setIsCopyingQuestions(false);
    }
  };

  const executeQuestionsCsvUpload = async (rawCsvContent: string, sourceFileName?: string) => {
    if (!rawCsvContent.trim()) {
      setUploadStatus({
        type: 'error',
        message: 'Pilih file CSV/Excel soal atau tempelkan daftar soal terlebih dahulu.',
      });
      return;
    }

    setIsUploadingCsv(true);
    setUploadStatus(null);
    setBankSoalFeedback(null);

    try {
      const targetExam = await ensureActiveExamForQuestions();
      const outcome = await uploadQuestionsCsvCbt(
        targetExam.id,
        rawCsvContent,
        replaceExistingQuestions,
        questions
      );
      const successMsg = `${
        sourceFileName ? `File "${sourceFileName}" langsung diupload: ` : ''
      }Berhasil mengimpor ${outcome.insertedCount} butir soal ke paket "${targetExam.judul_ujian}" (${formatDistribusiLabel(
        targetExam.target_tingkat,
        targetExam.target_kelas
      )}). Detail seluruh soal ditampilkan lengkap di bawah.`;
      setUploadStatus({ type: 'success', message: successMsg });
      setBankSoalFeedback({ type: 'success', message: successMsg });
      setCsvText('');
      setSelectedExamId(targetExam.id);
      setActiveTab('soal');
      setIsBankSoalDetailOpen(true);
      setShowUploadPanel(false);
      setQuestionViewMode('lengkap');
      setQuestionsPerPage(999);
      setQuestionPage(1);
      setFilterQuestionType('SEMUA');
      setSearchQuestionQuery('');
      await onRefreshData();
      window.setTimeout(() => {
        bankSoalDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || 'Gagal mengunggah file soal.',
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    e.target.value = '';
    setIsUploadingCsv(true);
    setUploadStatus(null);
    try {
      const outcome = await parseQuestionsFromFile(file);
      if (outcome.rows.length === 0) {
        setUploadStatus({
          type: 'error',
          message:
            outcome.errors.join(' | ') ||
            `File "${fileName}" tidak memiliki butir soal yang terbaca. Pastikan terdapat kolom soal dan pilihan jawaban.`,
        });
        return;
      }
      setCsvText(outcome.csvRepresentation);
      await executeQuestionsCsvUpload(
        outcome.csvRepresentation,
        `${fileName} (${outcome.formatDetected})`
      );
    } catch (err: any) {
      setUploadStatus({
        type: 'error',
        message: err.message || `Gagal memproses file soal "${fileName}".`,
      });
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleUploadCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeQuestionsCsvUpload(csvText);
  };

  const handleDownloadSampleCsv = () => {
    triggerBrowserDownload(SAMPLE_CSV_TEMPLATE, 'Template_Soal_CBT_Kolom_Terpisah.csv', 'text/csv;charset=utf-8;');
  };

  const handleDownloadQuestionTemplateExcel = () => {
    triggerBrowserDownload(generateQuestionTemplateExcel(), 'Template_Soal_CBT_11_Kolom.xls', 'application/vnd.ms-excel;charset=utf-8;');
  };

  const handleDownloadWordTemplateTable = () => {
    triggerBrowserDownload(generateWordQuestionTemplateTableDoc(), 'Template_Word_Tabel_Soal_CBT_Rumus_Gambar.doc', 'application/msword;charset=utf-8;');
  };

  const handleDownloadWordTemplateNumbered = () => {
    triggerBrowserDownload(generateWordQuestionTemplateNumberedDoc(), 'Template_Word_Nomor_Soal_CBT_Rumus_Gambar.doc', 'application/msword;charset=utf-8;');
  };

  const handleExportQuestionsWord = () => {
    const targetQuestions = currentExamQuestions.length > 0 ? currentExamQuestions : activeBankQuestions;
    const examTitle = currentExam?.judul_ujian || 'Semua Paket Ujian CBT';
    const examSlug = examTitle.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
    triggerBrowserDownload(exportQuestionsToWordDoc(examTitle, targetQuestions), `Bank_Soal_Word_${examSlug}.doc`, 'application/msword;charset=utf-8;');
  };

  const handleInsertSnippetToManualField = (field: QuestionTargetField, snippet: string) => {
    const appendWithSpace = (prev: string) => (prev.trim() ? `${prev.trim()} ${snippet}` : snippet);
    if (field === 'teks_soal') setManualTeksSoal(appendWithSpace);
    else if (field === 'wacana') setManualWacana(appendWithSpace);
    else if (field === 'opsi_a') setManualOpsiA(appendWithSpace);
    else if (field === 'opsi_b') setManualOpsiB(appendWithSpace);
    else if (field === 'opsi_c') setManualOpsiC(appendWithSpace);
    else if (field === 'opsi_d') setManualOpsiD(appendWithSpace);
    else if (field === 'opsi_e') setManualOpsiE(appendWithSpace);
  };

  const handleRemoveImagesFromManualField = (field: QuestionTargetField) => {
    const stripImg = (prev: string) => prev.replace(/\[IMG:[^\]]+\]/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (field === 'teks_soal') setManualTeksSoal(stripImg);
    else if (field === 'wacana') setManualWacana(stripImg);
    else if (field === 'opsi_a') setManualOpsiA(stripImg);
    else if (field === 'opsi_b') setManualOpsiB(stripImg);
    else if (field === 'opsi_c') setManualOpsiC(stripImg);
    else if (field === 'opsi_d') setManualOpsiD(stripImg);
    else if (field === 'opsi_e') setManualOpsiE(stripImg);
  };

  const handlePasteClipboardImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    field: QuestionTargetField
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const token = await convertImageFileToInlineToken(file);
            handleInsertSnippetToManualField(field, token);
          } catch {}
        }
        return;
      }
    }
  };

  const handleExportQuestionsExcel = (exportAllPackages = false) => {
    const targetQuestions =
      exportAllPackages || currentExamQuestions.length === 0 ? activeBankQuestions : currentExamQuestions;
    const rows = targetQuestions.map((q, idx) => {
      const ex = exams.find((e) => e.id === q.exam_id);
      const isKompleks = q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      const logikaPenilaian = isKompleks
        ? 'PG Kompleks: Benar Semua = 3 Poin, Benar Sebagian = 1-2 Poin, Salah = 0 Poin'
        : 'PG Biasa: Benar = 2 Poin, Salah = 0 Poin';
      return [
        q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`,
        isKompleks ? 'Kompleks' : 'PG',
        q.data_opsi?.wacana || '',
        q.teks_soal,
        q.data_opsi?.opsi?.A || '',
        q.data_opsi?.opsi?.B || '',
        q.data_opsi?.opsi?.C || '',
        q.data_opsi?.opsi?.D || '',
        q.data_opsi?.opsi?.E || '',
        q.kunci_jawaban.join(','),
        q.bobot || (isKompleks ? 3 : 2),
        ex?.judul_ujian || `Ujian #${q.exam_id}`,
        logikaPenilaian,
      ];
    });
    const html = buildExcelHtmlTable(
      'Bank Soal CBT',
      [
        'id_soal',
        'jenis_soal',
        'wacana',
        'teks_soal',
        'opsi_a',
        'opsi_b',
        'opsi_c',
        'opsi_d',
        'opsi_e',
        'kunci_jawaban',
        'bobot',
        'paket_ujian',
        'keterangan_logika_skor',
      ],
      rows
    );
    const examSlug = exportAllPackages
      ? 'Semua_Paket_Ujian'
      : (currentExam?.judul_ujian || 'Semua_Paket').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
    triggerBrowserDownload(html, `Bank_Soal_${examSlug}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
  };

  const handleExportQuestionsCsv = () => {
    const targetQuestions = currentExamQuestions.length > 0 ? currentExamQuestions : activeBankQuestions;
    const rows = targetQuestions.map((q, idx) => {
      const isKompleks = q.tipe_soal === 'Kompleks' || q.kunci_jawaban.length > 1;
      return [
        q.data_opsi?.id_soal_csv || `SOAL-${String(idx + 1).padStart(2, '0')}`,
        isKompleks ? 'Kompleks' : 'PG',
        q.data_opsi?.wacana || '',
        q.teks_soal,
        q.data_opsi?.opsi?.A || '',
        q.data_opsi?.opsi?.B || '',
        q.data_opsi?.opsi?.C || '',
        q.data_opsi?.opsi?.D || '',
        q.data_opsi?.opsi?.E || '',
        q.kunci_jawaban.join(','),
        q.bobot || (isKompleks ? 3 : 2),
      ];
    });
    const csvContent = buildSemicolonCsv(
      ['id_soal', 'jenis_soal', 'wacana', 'teks_soal', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e', 'kunci_jawaban', 'bobot'],
      rows
    );
    const examSlug = (currentExam?.judul_ujian || 'Semua_Paket').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
    triggerBrowserDownload(csvContent, `Bank_Soal_${examSlug}.csv`, 'text/csv;charset=utf-8;');
  };

  const buildResultReportRows = (targetResultsList: ResultItem[], rosterStudentsList: StudentItem[] = []) => {
    const sortedList = [...targetResultsList].sort((a, b) => {
      const stA = students.find((s) => s.id === a.student_id);
      const stB = students.find((s) => s.id === b.student_id);
      const klsCmp = (stA?.kelas || '').localeCompare(stB?.kelas || '');
      if (klsCmp !== 0) return klsCmp;
      return (stA?.nama || '').localeCompare(stB?.nama || '');
    });

    const submittedStudentIds = new Set<number>();
    const submittedRows = sortedList.map((resItem) => {
      submittedStudentIds.add(resItem.student_id);
      const st = students.find((s) => s.id === resItem.student_id);
      const ex = exams.find((e) => e.id === resItem.exam_id);
      const tkt = st ? extractTingkatFromKelas(st.kelas) : 'LAINNYA';
      const rec = st
        ? resolveStudentPrecisionRecord({
            student: st,
            allStudents: students,
            exams,
            questions,
            results,
            preferredExamId: resItem.exam_id,
          })
        : null;
      const ai = resItem.analisis_ai;
      const ketuntasan = resItem.skor_angka >= 70 ? 'Tuntas (>=70)' : 'Belum Tuntas (<70)';
      const baseKategori =
        ai?.kategori_nilai ||
        (resItem.skor_angka >= 85
          ? 'Sangat Baik (A)'
          : resItem.skor_angka >= 70
            ? 'Baik (B)'
            : resItem.skor_angka >= 55
              ? 'Cukup (C)'
              : 'Perlu Bimbingan (D)');

      const matchedAttemptInfo = rec?.attemptHistory.find((a) => Number(a.id) === Number(resItem.id));
      const waktuUjianText = formatExamAttemptTimeFull(resItem.created_at);
      const kategori =
        rec && rec.hasRetakeHistory
          ? `${matchedAttemptInfo?.attemptLabel || 'Ujian'} [${waktuUjianText}] · ${baseKategori} (Sebelum [${rec.initialTimeShort}]: ${rec.initialScore} -> Sesudah [${rec.retakeTimeShort}]: ${rec.retakeScore})`
          : `${baseKategori} [Waktu: ${waktuUjianText}]`;

      const ringkasanJawaban = Object.entries(resItem.jawaban_siswa || {})
        .map(([qId, keys]) => `#${qId}:${(keys || []).join('')}`)
        .join(' ');

      const kodePaket = resItem.kode_soal || ex?.kode_paket || rec?.kodePaket || st?.kode_soal || 'PAKET-A';
      const tokenUjianSesi = ex ? getEffectiveExamSessionToken(ex) : rec?.tokenUjianHariIni || '-';

      return [
        rec ? `${rec.noAbsen} (${rec.ganjilGenapLabel})` : '-',
        st?.nama || `Siswa #${resItem.student_id}`,
        st?.kelas || '-',
        tkt === 'LAINNYA' ? '-' : `Tingkat ${tkt}`,
        rec?.tokenLogin || st?.password_login || st?.token_ujian || '-',
        kodePaket,
        ex?.judul_ujian || rec?.namaPaketSoal || `Ujian #${resItem.exam_id}`,
        tokenUjianSesi,
        rec && rec.hasRetakeHistory
          ? `${resItem.skor_angka} (Awal: ${rec.initialScore} -> Ulang: ${rec.retakeScore})`
          : resItem.skor_angka,
        kategori,
        ketuntasan,
        `${resItem.pelanggaran_tab || 0}x Pindah Tab`,
        ringkasanJawaban || '-',
        ai?.evaluasi_hots || 'Belum Dianalisis AI',
        ai?.analisis_kompetensi?.kekuatan?.join(' | ') || '-',
        ai?.analisis_kompetensi?.kelemahan?.join(' | ') || '-',
        ai?.rekomendasi_belajar?.join(' | ') || '-',
      ];
    });

    const pendingStudents = rosterStudentsList
      .filter((s) => !submittedStudentIds.has(s.id))
      .sort((a, b) => {
        const klsCmp = a.kelas.localeCompare(b.kelas);
        if (klsCmp !== 0) return klsCmp;
        return a.nama.localeCompare(b.nama);
      });

    const pendingRows = pendingStudents.map((st) => {
      const tkt = extractTingkatFromKelas(st.kelas);
      const rec = resolveStudentPrecisionRecord({
        student: st,
        allStudents: students,
        exams,
        questions,
        results,
      });
      return [
        `${rec.noAbsen} (${rec.ganjilGenapLabel})`,
        st.nama,
        st.kelas,
        tkt === 'LAINNYA' ? '-' : `Tingkat ${tkt}`,
        rec.tokenLogin,
        rec.kodePaket,
        `${rec.namaPaketSoal} (${rec.mataPelajaran})`,
        rec.tokenUjianHariIni,
        '-',
        st.status_ujian || 'Belum Mulai',
        'Belum Mengumpulkan Ujian',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ];
    });

    return [...submittedRows, ...pendingRows].map((row, idx) => [idx + 1, ...row]);
  };

  const RESULT_REPORT_HEADERS = [
    'No',
    'No. Absen (Ganjil/Genap)',
    'Nama Siswa',
    'Kelas',
    'Tingkatan',
    'Token Login Akun',
    'Kode Paket Soal',
    'Paket Soal & Mapel Didapat',
    'Token Ujian Hari Ini',
    'Skor Akhir (0-100)',
    'Kategori / Status Ujian',
    'Status Ketuntasan',
    'Log Anti-Cheat',
    'Rekaman Jawaban Siswa',
    'Evaluasi Kognitif HOTS',
    'Kekuatan Kompetensi',
    'Kelemahan Kognitif',
    '3 Rekomendasi Belajar',
  ];

  const resolveScopeResultsAndRoster = (scope: 'filtered' | 'all' | { kelas: string } = 'all') => {
    let targetResults = results;
    let targetRoster = students;
    let label = 'Semua_Kelas';

    if (typeof scope === 'object' && scope.kelas) {
      label = `Kelas_${scope.kelas}`;
      const normKls = scope.kelas.trim().toLowerCase();
      targetRoster = students.filter((s) => s.kelas.trim().toLowerCase() === normKls);
      targetResults = results.filter((r) => {
        const st = students.find((s) => s.id === r.student_id);
        return st && st.kelas.trim().toLowerCase() === normKls;
      });
    } else if (scope === 'filtered') {
      targetResults = filteredResults;
      if (filterResultKelas !== 'SEMUA') {
        label = `Kelas_${filterResultKelas}`;
        const normKls = filterResultKelas.trim().toLowerCase();
        targetRoster = students.filter((s) => s.kelas.trim().toLowerCase() === normKls);
      } else if (filterResultTingkat !== 'SEMUA') {
        label = `Tingkat_${filterResultTingkat}`;
        targetRoster = students.filter((s) => extractTingkatFromKelas(s.kelas) === filterResultTingkat);
      } else {
        label = 'Filter_Aktif';
        targetRoster = students;
      }
    }

    return { targetResults, targetRoster, label };
  };

  const handleExportResultsExcel = (scope: 'filtered' | 'all' | { kelas: string } = 'all') => {
    const { targetResults, targetRoster, label } = resolveScopeResultsAndRoster(scope);
    const rows = buildResultReportRows(targetResults, targetRoster);
    const html = buildExcelHtmlTable(`Hasil ${label}`, RESULT_REPORT_HEADERS, rows);
    const safeSlug = label.replace(/[^a-zA-Z0-9]+/g, '_');
    triggerBrowserDownload(html, `Laporan_Hasil_Ujian_${safeSlug}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
  };

  const handleExportResultsCsv = (scope: 'filtered' | 'all' | { kelas: string } = 'all') => {
    const { targetResults, targetRoster, label } = resolveScopeResultsAndRoster(scope);
    const rows = buildResultReportRows(targetResults, targetRoster);
    const csvContent = buildSemicolonCsv(RESULT_REPORT_HEADERS, rows);
    const safeSlug = label.replace(/[^a-zA-Z0-9]+/g, '_');
    triggerBrowserDownload(csvContent, `Laporan_Hasil_Ujian_${safeSlug}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportClassSummaryExcel = () => {
    const rows = [...classAnalyticsData.perClass, classAnalyticsData.overall].map((item, idx) => [
      idx + 1,
      item.kelas,
      item.tingkat === 'LAINNYA' ? 'Semua Tingkat' : `Tingkat ${item.tingkat}`,
      item.totalStudents,
      item.resultCount,
      item.averageScore,
      item.lotsScore,
      item.hotsScore,
      item.highestScore,
      item.lowestScore,
      `${item.passCount} Siswa (${item.passRate}%)`,
      item.gradeDistribution.A,
      item.gradeDistribution.B,
      item.gradeDistribution.C,
      item.gradeDistribution.D,
      `${item.analyzedCount}/${item.resultCount} Teranalisis`,
    ]);
    const html = buildExcelHtmlTable(
      'Rekap Analisis Kelas',
      [
        'No',
        'Nama Kelas / Rombel',
        'Tingkatan',
        'Total Siswa Terdaftar',
        'Peserta Selesai Ujian',
        'Rata-Rata Nilai',
        'Rata-Rata LOTS (C1-C3)',
        'Rata-Rata HOTS (C4-C6)',
        'Nilai Tertinggi',
        'Nilai Terendah',
        'Ketuntasan (>=70)',
        'Predikat A (85-100)',
        'Predikat B (70-84)',
        'Predikat C (55-69)',
        'Predikat D (<55)',
        'Status Evaluasi AI',
      ],
      rows
    );
    triggerBrowserDownload(
      html,
      'Rekapitulasi_Analisis_Nilai_Per_Kelas_dan_Semua.xls',
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const handleGenerateAiAnalysis = async (result: ResultItem) => {
    const student = students.find((s) => s.id === result.student_id);
    const examObj = exams.find((e) => Number(e.id) === Number(result.exam_id));
    const examForResult = questions.filter((q) => Number(q.exam_id) === Number(result.exam_id));
    if (!student) return;

    const answeredCount = Object.keys(result.jawaban_siswa || {}).filter(
      (k) => Array.isArray(result.jawaban_siswa[k]) && result.jawaban_siswa[k].length > 0
    ).length;

    if (result.skor_angka === 0 || answeredCount === 0) {
      setAiErrorBanner(`Skor 0: Analisis AI tidak tersedia untuk hasil ujian kosong (${student.nama}).`);
      return;
    }

    setAnalyzingResultId(result.id);
    setAiErrorBanner(null);

    try {
      const data = await generateAiAnalysisCbt({
        resultId: result.id,
        nama_siswa: student.nama,
        questions: examForResult,
        jawaban_siswa: result.jawaban_siswa,
        existingResult: result,
        student,
        exam: examObj,
      });
      await onRefreshData();
      setSelectedAiModal({
        studentName: student.nama,
        studentClass: student.kelas,
        analysis: data,
      });
    } catch (err: any) {
      setAiErrorBanner(err.message || 'Gagal menjalankan analisis AI.');
    } finally {
      setAnalyzingResultId(null);
    }
  };

  const handleBatchAiAnalysisForList = async (targetList: ResultItem[]) => {
    const validTargets = targetList.filter((resItem) => {
      const answeredCount = Object.keys(resItem.jawaban_siswa || {}).filter(
        (k) => Array.isArray(resItem.jawaban_siswa[k]) && resItem.jawaban_siswa[k].length > 0
      ).length;
      return resItem.skor_angka > 0 && answeredCount > 0;
    });

    if (validTargets.length === 0) {
      setAiErrorBanner('Tidak ada hasil ujian dengan skor > 0 untuk dianalisis oleh AI.');
      return;
    }

    setIsAnalyzingBatchClass(true);
    setAiErrorBanner(null);
    try {
      for (const resItem of validTargets) {
        const student = students.find((s) => s.id === resItem.student_id);
        const examObj = exams.find((e) => Number(e.id) === Number(resItem.exam_id));
        const examForResult = questions.filter((q) => Number(q.exam_id) === Number(resItem.exam_id));
        if (!student) continue;
        await generateAiAnalysisCbt({
          resultId: resItem.id,
          nama_siswa: student.nama,
          questions: examForResult,
          jawaban_siswa: resItem.jawaban_siswa,
          existingResult: resItem,
          student,
          exam: examObj,
        });
      }
      await onRefreshData();
    } catch (err: any) {
      setAiErrorBanner(err.message || 'Gagal menjalankan analisis AI massal.');
    } finally {
      setIsAnalyzingBatchClass(false);
    }
  };

  const value: AdminDashboardContextValue = {
    exams,
    questions,
    students,
    results,
    onRefreshData,
    syncPulse,
    isSyncingFirebase,
    onManualFirebaseSync,
    isAuthenticated,
    setIsAuthenticated,
    teacherUsername,
    setTeacherUsername,
    teacherPassword,
    setTeacherPassword,
    authError,
    teacherProfile,
    handleTeacherFormLogin,
    handleGoogleTeacherSignIn,
    activeTab,
    setActiveTab,
    isSidebarMinimized,
    setIsSidebarMinimized,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isTopMetricsMinimized,
    setIsTopMetricsMinimized,
    isSubMenuBarMinimized,
    setIsSubMenuBarMinimized,
    isReportSummaryMinimized,
    setIsReportSummaryMinimized,
    isReportLotsHotsMinimized,
    setIsReportLotsHotsMinimized,
    isReportClassTableMinimized,
    setIsReportClassTableMinimized,
    isReportQuestionPanelMinimized,
    setIsReportQuestionPanelMinimized,
    isReportStudentListMinimized,
    setIsReportStudentListMinimized,
    isUjianFormMinimized,
    setIsUjianFormMinimized,
    isUjianTableMinimized,
    setIsUjianTableMinimized,
    isUjianChartMinimized,
    setIsUjianChartMinimized,
    isSiswaClassPanelMinimized,
    setIsSiswaClassPanelMinimized,
    isSiswaStatusPanelMinimized,
    setIsSiswaStatusPanelMinimized,
    isSiswaFormMinimized,
    setIsSiswaFormMinimized,
    isSiswaTableMinimized,
    setIsSiswaTableMinimized,
    selectedExamId,
    setSelectedExamId,
    isRecalculatingScores,
    recalcFeedback,
    handleRecalculateAllScores,
    isBankSoalDetailOpen,
    setIsBankSoalDetailOpen,
    showUploadPanel,
    setShowUploadPanel,
    bankSoalDeleteModal,
    setBankSoalDeleteModal,
    isDeletingBankSoal,
    isClearingExamQuestions,
    bankSoalDetailRef,
    bankSoalFeedback,
    setBankSoalFeedback,
    newExamTitle,
    setNewExamTitle,
    newExamDuration,
    setNewExamDuration,
    newExamTargetTingkat,
    setNewExamTargetTingkat,
    newExamTargetKelas,
    setNewExamTargetKelas,
    newExamKategori,
    setNewExamKategori,
    newExamStatus,
    setNewExamStatus,
    newExamTargetRombel,
    setNewExamTargetRombel,
    filterExamKategori,
    setFilterExamKategori,
    filterExamStatus,
    setFilterExamStatus,
    newExamAcakSoal,
    setNewExamAcakSoal,
    newExamAcakOpsi,
    setNewExamAcakOpsi,
    newExamKodePaket,
    setNewExamKodePaket,
    newExamMultiPaket,
    setNewExamMultiPaket,
    newExamJumlahPaket,
    setNewExamJumlahPaket,
    newExamTokenSesi,
    setNewExamTokenSesi,
    newExamTampilkanNilai,
    setNewExamTampilkanNilai,
    newExamPengumuman,
    setNewExamPengumuman,
    newExamMataPelajaran,
    setNewExamMataPelajaran,
    newExamDistribusiMode,
    setNewExamDistribusiMode,
    inlineTokenEditExamId,
    setInlineTokenEditExamId,
    inlineTokenEditValue,
    setInlineTokenEditValue,
    isDistributingPackages,
    filterExamTingkat,
    setFilterExamTingkat,
    filterExamMapel,
    setFilterExamMapel,
    editingExamId,
    setEditingExamId,
    isSavingExam,
    examFeedback,
    setExamFeedback,
    studentInputMode,
    setStudentInputMode,
    studentNameInput,
    setStudentNameInput,
    studentNisnInput,
    setStudentNisnInput,
    studentTingkatPreset,
    setStudentTingkatPreset,
    studentClassInput,
    setStudentClassInput,
    editingStudentId,
    setEditingStudentId,
    studentCsvText,
    setStudentCsvText,
    replaceExistingStudents,
    setReplaceExistingStudents,
    isUploadingStudentsCsv,
    filterStudentTingkat,
    setFilterStudentTingkat,
    filterKelas,
    setFilterKelas,
    filterStudentMapel,
    setFilterStudentMapel,
    filterStudentExamId,
    setFilterStudentExamId,
    filterStudentStatus,
    setFilterStudentStatus,
    isSavingStudent,
    studentFeedback,
    questionInputMode,
    setQuestionInputMode,
    manualTipe,
    setManualTipe,
    manualWacana,
    setManualWacana,
    manualTeksSoal,
    setManualTeksSoal,
    manualOpsiA,
    setManualOpsiA,
    manualOpsiB,
    setManualOpsiB,
    manualOpsiC,
    setManualOpsiC,
    manualOpsiD,
    setManualOpsiD,
    manualOpsiE,
    setManualOpsiE,
    manualKunci,
    setManualKunci,
    manualBobot,
    setManualBobot,
    editingQuestionId,
    isSavingQuestion,
    filterQuestionType,
    setFilterQuestionType,
    searchQuestionQuery,
    setSearchQuestionQuery,
    copyTargetExamId,
    setCopyTargetExamId,
    isCopyingQuestions,
    bankSoalMapelFilter,
    setBankSoalMapelFilter,
    bankSoalTingkatFilter,
    setBankSoalTingkatFilter,
    questionViewMode,
    setQuestionViewMode,
    expandedQuestionIds,
    toggleExpandQuestion,
    focusedQuestionIdx,
    setFocusedQuestionIdx,
    questionPage,
    setQuestionPage,
    questionsPerPage,
    setQuestionsPerPage,
    csvText,
    setCsvText,
    replaceExistingQuestions,
    setReplaceExistingQuestions,
    quickExamTitle,
    setQuickExamTitle,
    quickExamTingkat,
    setQuickExamTingkat,
    uploadStatus,
    setUploadStatus,
    isUploadingCsv,
    newClassNameInput,
    setNewClassNameInput,
    renamingClassTarget,
    setRenamingClassTarget,
    renameClassValue,
    setRenameClassValue,
    filterResultTingkat,
    setFilterResultTingkat,
    filterResultKelas,
    setFilterResultKelas,
    filterResultMapel,
    setFilterResultMapel,
    filterResultExamId,
    setFilterResultExamId,
    analyzingResultId,
    isAnalyzingBatchClass,
    selectedAiModal,
    setSelectedAiModal,
    aiErrorBanner,
    dryRunExam,
    setDryRunExam,
    archivedExams,
    isLoadingArchive,
    restoringArchiveId,
    handleRestoreArchivedExam,
    refreshArchives,
    activeBankQuestions,
    currentExam,
    currentExamQuestions,
    filteredExamQuestions,
    formatDistribusiLabel,
    uniqueClasses,
    availableMataPelajaran,
    resultMapelMatchedExams,
    resultScopedListForAnalytics,
    classAnalyticsData,
    filteredResults,
    filteredExams,
    studentScopedExams,
    filteredStudents,
    countTingkat10,
    countTingkat11,
    countTingkat12,
    countStatusBelumMulai,
    countStatusSedangUjian,
    countStatusSelesai,
    countStatusDiblokir,
    activeStudentsCount,
    handleSaveExam,
    handleUpdateExamSessionToken,
    handleToggleExamStatus,
    handleBatchDistributePackages,
    handleDeleteExam,
    handleClearBankSoalOnly,
    handleDeleteFullBankSoal,
    handleSaveStudent,
    handleStudentCsvFileChange,
    handleUploadStudentCsvSubmit,
    handleDownloadSampleStudentCsv,
    handleDownloadStudentTemplateExcel,
    handleExportStudentsExcel,
    handleUpdateStudentStatus,
    handleBulkUpdateStudentStatus,
    handleRegenerateToken,
    handleDeleteStudent,
    handleToggleManualKunci,
    handleAddNewClass,
    handleRenameClassSubmit,
    handleDeleteClass,
    handleDownloadClassStudentsExcel,
    handleStartEditQuestion,
    handleCancelEditQuestion,
    handleAddManualQuestion,
    handleDeleteQuestion,
    handleClearExamQuestions,
    handleCopyQuestionsToExam,
    handleFileChange,
    handleUploadCsvSubmit,
    handleDownloadSampleCsv,
    handleDownloadQuestionTemplateExcel,
    handleDownloadWordTemplateTable,
    handleDownloadWordTemplateNumbered,
    handleExportQuestionsWord,
    handleInsertSnippetToManualField,
    handleRemoveImagesFromManualField,
    handlePasteClipboardImage,
    handleExportQuestionsExcel,
    handleExportQuestionsCsv,
    handleExportResultsExcel,
    handleExportResultsCsv,
    handleExportClassSummaryExcel,
    handleGenerateAiAnalysis,
    handleBatchAiAnalysisForList,
  };

  return (
    <AdminDashboardContext.Provider value={value}>
      {children}
    </AdminDashboardContext.Provider>
  );
};

export function useAdminDashboard(): AdminDashboardContextValue {
  const ctx = useContext(AdminDashboardContext);
  if (!ctx) {
    throw new Error('useAdminDashboard must be used inside AdminDashboardProvider');
  }
  return ctx;
}
