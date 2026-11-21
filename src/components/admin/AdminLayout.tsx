import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Users,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
  Lock,
  LogIn,
  ClipboardList,
  LogOut,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  KeyRound,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import {
  useAdminDashboard,
  ADMIN_TAB_ROUTES,
} from '../../context/AdminDashboardContext';
import { ExamDryRunModal } from './ExamDryRunModal';

export const AdminLayout: React.FC = () => {
  const {
    exams,
    questions,
    students,
    results,
    activeBankQuestions,
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
    setIsBankSoalDetailOpen,
    availableMataPelajaran,
    countTingkat10,
    countTingkat11,
    countTingkat12,
    activeStudentsCount,
    onRefreshData,
    syncPulse,
    isSyncingFirebase,
    onManualFirebaseSync,
    selectedAiModal,
    setSelectedAiModal,
    dryRunExam,
    setDryRunExam,
    uniqueClasses,
  } = useAdminDashboard();

  // Separate Teacher Login Page
  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto w-full py-6 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xs">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 text-slate-600 text-xs font-semibold uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-blue-600" />
              <span>Otorisasi Pengawas &amp; Guru CBT</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1.5 tracking-tight">
              Portal Manajemen Ujian
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Masuk untuk mengelola jadwal ujian, distribusi paket soal, pemantauan peserta, serta analisis evaluasi kognitif.
            </p>
          </div>

          <form onSubmit={handleTeacherFormLogin} className="space-y-4">
            <div>
              <label
                htmlFor="teacher-username-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email Pengawas / Guru
              </label>
              <input
                id="teacher-username-input"
                type="email"
                value={teacherUsername}
                onChange={(e) => setTeacherUsername(e.target.value)}
                placeholder="nama@sekolah.sch.id"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="teacher-password-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                PIN Otorisasi (6 Digit)
              </label>
              <input
                id="teacher-password-input"
                type="password"
                value={teacherPassword}
                onChange={(e) => setTeacherPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              Masuk ke Konsol Guru
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleGoogleTeacherSignIn}
              className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-blue-600" />
              <span>Masuk dengan Akun Google Institusi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const teacherSidebarMenus = [
    {
      id: 'ujian' as const,
      to: ADMIN_TAB_ROUTES.ujian,
      matchIds: ['ujian'],
      num: '01',
      title: 'Jadwal & Paket Ujian',
      subtitle: 'Kelola Paket, Mapel & Rombel',
      badge: `${exams.length} PKT`,
      icon: ClipboardList,
      activeClass:
        'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-xs ring-2 ring-blue-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-blue-50 text-blue-600 border border-blue-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-blue-50 text-blue-700 border border-blue-200/70',
    },
    {
      id: 'token_distribusi' as const,
      to: ADMIN_TAB_ROUTES.token_distribusi,
      matchIds: ['token_distribusi'],
      num: '02',
      title: 'Token & Distribusi Paket',
      subtitle: 'Token Sesi, Ganjil-Genap & Kartu',
      badge: 'TOKEN',
      icon: KeyRound,
      activeClass:
        'bg-gradient-to-r from-rose-600 to-pink-600 text-white border-rose-500 shadow-xs ring-2 ring-rose-300/60',
      iconBoxActive: 'bg-white/20 text-amber-200',
      iconBoxIdle: 'bg-rose-50 text-rose-600 border border-rose-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-rose-50 text-rose-800 border border-rose-200/70',
    },
    {
      id: 'manajemen' as const,
      to: ADMIN_TAB_ROUTES.manajemen,
      matchIds: ['manajemen'],
      num: '03',
      title: 'Live Monitor & Anti-Cheat',
      subtitle: 'Radar Web, Blokir & Per Kelas',
      badge: activeStudentsCount > 0 ? `${activeStudentsCount} LIVE` : 'RADAR',
      icon: Layers,
      activeClass:
        'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-500 shadow-xs ring-2 ring-indigo-300/60',
      iconBoxActive: 'bg-white/20 text-emerald-300',
      iconBoxIdle: 'bg-indigo-50 text-indigo-600 border border-indigo-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle:
        activeStudentsCount > 0
          ? 'bg-emerald-600 text-white animate-pulse'
          : 'bg-indigo-600 text-white',
    },
    {
      id: 'status_siswa' as const,
      to: ADMIN_TAB_ROUTES.status_siswa,
      matchIds: ['status_siswa'],
      num: '04',
      title: 'Status Siswa & Blokir',
      subtitle: 'Buka Blokir, Reset Token & Rombel',
      badge: `${students.length}`,
      icon: Users,
      activeClass:
        'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-xs ring-2 ring-emerald-300/60',
      iconBoxActive: 'bg-white/20 text-amber-200',
      iconBoxIdle: 'bg-emerald-50 text-emerald-600 border border-emerald-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-emerald-50 text-emerald-800 border border-emerald-200/70',
    },
    {
      id: 'profil_kelas' as const,
      to: ADMIN_TAB_ROUTES.profil_kelas,
      matchIds: ['profil_kelas'],
      num: '05',
      title: 'Profil Kelas & Rekap',
      subtitle: 'Ujian, Token Sesi & Nilai per Kelas',
      badge: `${uniqueClasses.length} KLS`,
      icon: BookOpen,
      activeClass:
        'bg-gradient-to-r from-teal-600 to-cyan-700 text-white border-teal-500 shadow-xs ring-2 ring-teal-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-teal-50 text-teal-700 border border-teal-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-teal-50 text-teal-800 border border-teal-200/70',
    },
    {
      id: 'soal' as const,
      to: ADMIN_TAB_ROUTES.soal,
      matchIds: ['soal'],
      num: '06',
      title: 'Bank Soal & Upload Word',
      subtitle: 'Kelola Soal, Rumus & Gambar',
      badge: `${activeBankQuestions.length}`,
      icon: FileSpreadsheet,
      activeClass:
        'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-500 shadow-xs ring-2 ring-amber-300/60',
      iconBoxActive: 'bg-white/20 text-white',
      iconBoxIdle: 'bg-amber-50 text-amber-600 border border-amber-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-amber-50 text-amber-800 border border-amber-200/70',
    },
    {
      id: 'laporan' as const,
      to: ADMIN_TAB_ROUTES.laporan,
      matchIds: ['laporan'],
      num: '07',
      title: 'Laporan & Rekap Nilai',
      subtitle: 'Nilai Humanis, LOTS/HOTS & PDF',
      badge: `${results.length}`,
      icon: Sparkles,
      activeClass:
        'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-xs ring-2 ring-purple-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-purple-50 text-purple-600 border border-purple-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-purple-50 text-purple-800 border border-purple-200/70',
    },
    {
      id: 'anbuso' as const,
      to: ADMIN_TAB_ROUTES.anbuso,
      matchIds: ['anbuso'],
      num: '08',
      title: 'Analisis AnBuso & Remedial',
      subtitle: 'Daya Beda, Pengecoh & Remedial',
      badge: 'ANBUSO',
      icon: BarChart3,
      activeClass:
        'bg-gradient-to-r from-cyan-600 to-blue-700 text-white border-cyan-500 shadow-xs ring-2 ring-cyan-300/60',
      iconBoxActive: 'bg-white/20 text-amber-300',
      iconBoxIdle: 'bg-cyan-50 text-cyan-600 border border-cyan-200/70',
      badgeActive: 'bg-white/20 text-white',
      badgeIdle: 'bg-cyan-50 text-cyan-800 border border-cyan-200/70',
    },
  ];

  const activeMenuObj =
    teacherSidebarMenus.find((m) => m.matchIds.includes(activeTab)) ||
    teacherSidebarMenus[0];

  return (
    <div className="max-w-[1440px] mx-auto py-5 px-3 sm:px-6">
      <div className="flex flex-col lg:flex-row items-start gap-5">
        {/* LEFT COLLAPSIBLE SIDEBAR NAVIGATION WITH REACT ROUTER NAVLINKS */}
        <aside
          aria-label="Menu Utama Konsol Guru Samping Kiri"
          className={`w-full lg:sticky lg:top-20 shrink-0 transition-all duration-300 ease-in-out ${
            isSidebarMinimized ? 'lg:w-20' : 'lg:w-72'
          }`}
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-3.5 border-b border-indigo-900 flex items-center justify-between gap-2">
              {!isSidebarMinimized && (
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                    Menu Utama Guru
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    8 Menu Mandiri CBT
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsSidebarMinimized((prev) => !prev)}
                title={
                  isSidebarMinimized
                    ? 'Buka / Perlebar Menu Samping Kiri'
                    : 'Minimize / Kecilkan Menu Samping Kiri'
                }
                className={`hidden lg:inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-xs transition-all cursor-pointer ${
                  isSidebarMinimized ? 'w-full py-2 px-2 flex-col' : 'px-2.5 py-1.5'
                }`}
              >
                {isSidebarMinimized ? (
                  <>
                    <PanelLeftOpen className="w-4 h-4 text-amber-300" />
                    <span className="text-[9px] uppercase tracking-wider text-amber-300">
                      Buka
                    </span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-4 h-4 text-amber-300" />
                    <span className="text-[11px]">Minimize</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                {isMobileSidebarOpen ? (
                  <>
                    <PanelLeftClose className="w-4 h-4" />
                    <span>Tutup Menu</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="w-4 h-4" />
                    <span>Buka Menu ({activeMenuObj.title})</span>
                  </>
                )}
              </button>
            </div>

            <nav
              aria-label="Navigasi Modul Konsol Guru"
              className={`${
                isMobileSidebarOpen ? 'block' : 'hidden lg:block'
              } p-2.5 space-y-1.5 bg-gradient-to-b from-slate-50/70 to-white`}
            >
              {teacherSidebarMenus.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    title={`${item.num}. ${item.title} — ${item.subtitle} (${item.badge})`}
                    onClick={() => {
                      if (item.id === 'soal') {
                        setIsBankSoalDetailOpen(false);
                      }
                      setIsMobileSidebarOpen(false);
                    }}
                    className={({ isActive }) =>
                      `w-full rounded-xl border transition-all cursor-pointer flex items-center ${
                        isSidebarMinimized
                          ? 'lg:justify-center lg:p-2.5 p-3 justify-between'
                          : 'p-2.5 justify-between gap-2.5'
                      } ${
                        isActive
                          ? item.activeClass
                          : 'bg-white hover:bg-slate-100/80 text-slate-800 border-slate-200/90 hover:border-blue-300'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`flex items-center ${
                            isSidebarMinimized
                              ? 'lg:flex-col lg:gap-1 gap-2.5'
                              : 'gap-2.5 min-w-0'
                          }`}
                        >
                          <div
                            className={`p-2 rounded-xl shrink-0 relative ${
                              isActive ? item.iconBoxActive : item.iconBoxIdle
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          {isSidebarMinimized ? (
                            <span
                              className={`hidden lg:block text-[10px] font-mono font-extrabold leading-none ${
                                isActive ? 'text-white' : 'text-slate-600'
                              }`}
                            >
                              {item.num}
                            </span>
                          ) : null}

                          <div
                            className={`text-left min-w-0 ${
                              isSidebarMinimized ? 'lg:hidden block' : 'block'
                            }`}
                          >
                            <div className="text-xs font-extrabold leading-snug">
                              {item.num}. {item.title}
                            </div>
                            <div
                              className={`text-[11px] leading-tight mt-0.5 ${
                                isActive ? 'text-white/85' : 'text-slate-500'
                              }`}
                            >
                              {item.subtitle}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono tabular-nums rounded-md font-extrabold shrink-0 ${
                            isSidebarMinimized ? 'lg:hidden inline-block' : 'inline-block'
                          } ${isActive ? item.badgeActive : item.badgeIdle}`}
                        >
                          {item.badge}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}

              <div className="pt-2.5 mt-2 border-t border-slate-200 space-y-1.5">
                {onManualFirebaseSync && (
                  <button
                    type="button"
                    onClick={onManualFirebaseSync}
                    disabled={isSyncingFirebase}
                    title="Sinkronkan Database ke Cloud"
                    className={`w-full rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold text-xs transition-colors cursor-pointer flex items-center ${
                      isSidebarMinimized
                        ? 'lg:justify-center lg:p-2.5 px-3 py-2 gap-2'
                        : 'px-3 py-2 gap-2'
                    }`}
                  >
                    <RefreshCw
                      className={`w-4 h-4 text-indigo-600 shrink-0 ${
                        isSyncingFirebase ? 'animate-spin' : ''
                      }`}
                    />
                    <span className={isSidebarMinimized ? 'lg:hidden' : ''}>
                      {isSyncingFirebase ? 'Menyinkronkan...' : 'Sinkronkan Data'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsAuthenticated(false);
                    try {
                      localStorage.removeItem('cbt_teacher_auth');
                      localStorage.removeItem('cbt_teacher_active_tab');
                    } catch {}
                  }}
                  title="Keluar dari Konsol Guru"
                  className={`w-full rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors cursor-pointer flex items-center ${
                    isSidebarMinimized
                      ? 'lg:justify-center lg:p-2.5 px-3 py-2 gap-2'
                      : 'px-3 py-2 gap-2'
                  }`}
                >
                  <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className={isSidebarMinimized ? 'lg:hidden' : ''}>
                    Keluar Konsol Guru
                  </span>
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* RIGHT MAIN WORKSPACE AREA */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-emerald-400 via-cyan-400 to-indigo-500" />
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-5 py-4 border-b border-indigo-900/80">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsSidebarMinimized((prev) => !prev)}
                    title={
                      isSidebarMinimized
                        ? 'Buka Lebar Menu Samping Kiri'
                        : 'Minimize / Kecilkan Menu Samping Kiri'
                    }
                    className="hidden lg:inline-flex items-center justify-center p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-amber-300 transition-colors cursor-pointer shrink-0 mt-0.5"
                  >
                    {isSidebarMinimized ? (
                      <PanelLeftOpen className="w-4 h-4" />
                    ) : (
                      <PanelLeftClose className="w-4 h-4" />
                    )}
                  </button>

                  <div className="min-w-0 space-y-1">
                    {/* Breadcrumb Navigation */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-extrabold uppercase tracking-wider shadow-2xs">
                        <span>Portal Admin</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-cyan-300/80 shrink-0" />
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-cyan-200 font-bold">
                        <span>
                          Modul {activeMenuObj.num}: {activeMenuObj.title}
                        </span>
                      </span>
                      <span className="hidden md:inline-block font-mono text-[10px] text-blue-300/80 bg-white/5 px-2 py-0.5 rounded">
                        {activeMenuObj.to}
                      </span>
                      <span className="text-blue-200/90 hidden sm:inline">
                        · Pengawas:{' '}
                        <strong className="text-white font-semibold">
                          {teacherProfile.name}
                        </strong>
                      </span>
                    </div>

                    <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug">
                      {activeMenuObj.num}. {activeMenuObj.title}{' '}
                      <span className="font-normal text-blue-200/90 text-xs sm:text-sm">
                        — {activeMenuObj.subtitle} Multi-Mapel &amp; Evaluasi Akademik
                      </span>
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onRefreshData}
                    title="Muat ulang data ujian, status peserta, dan nilai terbaru dari server (Hemat Kuota)"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-bold text-xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Refresh Data</span>
                  </button>
                  {activeTab !== 'manajemen' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('manajemen')}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold text-xs transition-colors cursor-pointer"
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>Pantau Peserta ({activeStudentsCount} Ujian)</span>
                    </button>
                  )}
                  {syncPulse?.lastSyncedAt && (
                    <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-[11px] font-mono tabular-nums text-cyan-200">
                      Sync: {new Date(syncPulse.lastSyncedAt).toLocaleTimeString('id-ID')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTopMetricsMinimized((prev) => !prev)}
                    title="Minimize / Buka Kartu Ringkasan Metrik Atas"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-amber-300 cursor-pointer transition-colors"
                  >
                    {isTopMetricsMinimized ? (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>Buka Ringkasan</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Minimize Ringkasan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {!isTopMetricsMinimized && (
              <div className="p-3.5 bg-slate-50/60 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-blue-200/90 shadow-2xs flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                      Paket Ujian Aktif
                    </div>
                    <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                      {exams.length}{' '}
                      <span className="text-[11px] font-semibold font-sans text-slate-500">
                        paket ({availableMataPelajaran.length} mapel)
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-violet-200/90 shadow-2xs flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                      Sebaran 3 Tingkatan
                    </div>
                    <div className="text-xs font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                      X: {countTingkat10} <span className="text-slate-300">|</span> XI:{' '}
                      {countTingkat11} <span className="text-slate-300">|</span> XII:{' '}
                      {countTingkat12}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200/80 text-violet-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-amber-200/90 shadow-2xs flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                      Total Bank Soal
                    </div>
                    <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                      {activeBankQuestions.length}{' '}
                      <span className="text-[11px] font-semibold font-sans text-slate-500">
                        butir soal
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200/90 shadow-2xs flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                      Hasil Ujian Masuk
                    </div>
                    <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                      {results.length}{' '}
                      <span className="text-[11px] font-semibold font-sans text-slate-500">
                        selesai
                      </span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Lazy Route Content */}
          <Outlet />

          {/* Modal Detail Evaluasi Capaian Kognitif */}
          {selectedAiModal && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
            >
              <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-semibold text-blue-700">
                      Laporan Evaluasi Kognitif Sosiologi · LOTS vs HOTS
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-1">
                      {selectedAiModal.analysis.nama_siswa} ({selectedAiModal.studentClass})
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                      {selectedAiModal.analysis.skor_akhir}/100
                    </div>
                    <div className="text-xs text-slate-600">
                      {selectedAiModal.analysis.kategori_nilai}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500">
                      Evaluasi Penalaran HOTS (Higher Order Thinking Skills)
                    </h4>
                    <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                      {selectedAiModal.analysis.evaluasi_hots}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <h5 className="text-xs font-bold text-emerald-700">
                        Kekuatan Kompetensi Siswa
                      </h5>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                        {selectedAiModal.analysis.analisis_kompetensi.kekuatan.map((k, idx) => (
                          <li key={idx}>{k}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <h5 className="text-xs font-bold text-amber-700">
                        Kelemahan Kognitif Siswa
                      </h5>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                        {selectedAiModal.analysis.analisis_kompetensi.kelemahan.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-200">
                    <h5 className="text-xs font-bold text-blue-800">
                      3 Rekomendasi Belajar Terarah
                    </h5>
                    <ol className="mt-2 space-y-1.5 text-xs text-slate-800 list-decimal list-inside">
                      {selectedAiModal.analysis.rekomendasi_belajar.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedAiModal(null)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Tutup Laporan Evaluasi
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Dry-Run Pra-Publikasi ("Coba Ujian") */}
          <ExamDryRunModal
            exam={dryRunExam}
            questions={questions}
            onClose={() => setDryRunExam(null)}
          />
        </div>
      </div>
    </div>
  );
};
