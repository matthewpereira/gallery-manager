import React, { useState, useEffect } from 'react';
import { Database, Clock, HardDrive } from 'lucide-react';
import { cacheService } from '../services/cache';

export const CacheStats: React.FC = () => {
  const [stats, setStats] = useState<{
    memoryEntries: number;
    storageEntries: number;
    totalSize: number;
  } | null>(null);

  useEffect(() => {
    const updateStats = () => {
      setStats(cacheService.getStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!stats) return null;

  return (
    <div className="bg-muted/50 rounded-lg p-3 mb-6">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          {stats.memoryEntries} in memory
        </div>
        <div className="flex items-center gap-1">
          <HardDrive className="w-3 h-3" />
          {stats.storageEntries} stored
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatBytes(stats.totalSize)} cached
        </div>
      </div>
    </div>
  );
};
