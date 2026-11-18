import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  AdminDashboardProvider,
  AdminDashboardProps,
} from '../context/AdminDashboardContext';
import { AdminLayout } from './admin/AdminLayout';

const AdminUjianTab = lazy(() => import('./admin/AdminUjianTab'));
const AdminDistribusiTab = lazy(() => import('./admin/AdminDistribusiTab'));
const AdminLiveMonitorTab = lazy(() => import('./admin/AdminLiveMonitorTab'));
const AdminSiswaTab = lazy(() => import('./admin/AdminSiswaTab'));
const AdminBankSoalTab = lazy(() => import('./admin/AdminBankSoalTab'));
const AdminLaporanTab = lazy(() => import('./admin/AdminLaporanTab'));
const AdminAnBusoTab = lazy(() => import('./admin/AdminAnBusoTab'));

const TabSuspenseFallback: React.FC = () => (
  <div className="bg-white border border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-slate-600 shadow-2xs">
    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
    <div className="text-xs font-bold tracking-wide text-slate-700">
      Memuat modul konsol guru...
    </div>
  </div>
);

export const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
  return (
    <AdminDashboardProvider {...props}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="ujian" replace />} />
          <Route
            path="ujian"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminUjianTab />
              </Suspense>
            }
          />
          <Route
            path="distribusi"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminDistribusiTab />
              </Suspense>
            }
          />
          <Route
            path="live-monitor"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminLiveMonitorTab />
              </Suspense>
            }
          />
          <Route
            path="siswa"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminSiswaTab />
              </Suspense>
            }
          />
          <Route
            path="bank-soal"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminBankSoalTab />
              </Suspense>
            }
          />
          <Route
            path="laporan"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminLaporanTab />
              </Suspense>
            }
          />
          <Route
            path="anbuso"
            element={
              <Suspense fallback={<TabSuspenseFallback />}>
                <AdminAnBusoTab />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="ujian" replace />} />
        </Route>
      </Routes>
    </AdminDashboardProvider>
  );
};

export default AdminDashboard;
