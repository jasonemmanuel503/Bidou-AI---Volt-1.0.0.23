import { useState, useEffect } from 'react';
import { persistence } from '../services/persistence';

export interface PlatformStats {
  totalUsers: number;
  paidUsers: number;
  updatedAt: string;
}

export function usePlatformStats(): {
  stats: PlatformStats;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 2000,
    paidUsers: 140,
    updatedAt: new Date().toISOString(),
  });
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStats = async () => {
    try {
      const data = await persistence.getPlatformStats();
      setStats(data);
    } catch (err) {
      console.warn('[usePlatformStats] Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Subscribe to live changes via Realtime (or local fallback)
    const unsubscribe = persistence.subscribeToPlatformStats((updated) => {
      setStats((prev) => ({
        ...prev,
        ...updated,
        updatedAt: new Date().toISOString(),
      }));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { stats, loading, refetch: fetchStats };
}
