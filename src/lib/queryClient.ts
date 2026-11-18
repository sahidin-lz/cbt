import { QueryClient } from '@tanstack/react-query';

export const CBT_DASHBOARD_QUERY_KEY = ['cbt-dashboard-snapshot'] as const;
export const CBT_ARCHIVE_QUERY_KEY = ['cbt-exams-archive'] as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 menit cache memori agar navigasi antar menu 0 Firebase reads
      gcTime: 10 * 60_000, // Simpan cache di memori selama 10 menit
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
