type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number; // time to live in milliseconds
};

type CacheOptions = {
  ttl?: number; // default 5 minutes
  persist?: boolean; // whether to persist to localStorage
  backgroundRefresh?: boolean; // whether to refresh in background when stale
};

class CacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly STORAGE_PREFIX = 'imgur_cache_';

  /**
   * Get data from cache or execute fetcher function
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const {
      ttl = this.DEFAULT_TTL,
      persist = true,
      backgroundRefresh = true
    } = options;

    // Check memory cache first
    let cached = this.memoryCache.get(key);
    
    // If not in memory, check localStorage
    if (!cached && persist) {
      const stored = this.getFromStorage(key);
      if (stored) {
        cached = stored;
        this.memoryCache.set(key, cached);
      }
    }

    const now = Date.now();
    
    // If we have cached data and it's still fresh, return it
    if (cached && (now - cached.timestamp) < cached.ttl) {
      return cached.data;
    }

    // If we have stale data and background refresh is enabled, return stale data
    // and refresh in background
    if (cached && backgroundRefresh) {
      this.refreshInBackground(key, fetcher, { ttl, persist });
      return cached.data;
    }

    // No cache or expired without background refresh - fetch fresh data
    return this.fetchAndCache(key, fetcher, { ttl, persist });
  }

  /**
   * Fetch fresh data and cache it
   */
  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    try {
      const data = await fetcher();
      this.set(key, data, options);
      return data;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      const stale = this.memoryCache.get(key) || this.getFromStorage(key);
      if (stale) {
        console.warn(`Failed to fetch ${key}, returning stale data:`, error);
        return stale.data;
      }
      throw error;
    }
  }

  /**
   * Refresh data in background
   */
  private async refreshInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<void> {
    try {
      const data = await fetcher();
      this.set(key, data, options);
    } catch (error) {
      console.warn(`Background refresh failed for ${key}:`, error);
    }
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const { ttl = this.DEFAULT_TTL, persist = true } = options;
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };

    this.memoryCache.set(key, entry);
    
    if (persist) {
      this.setInStorage(key, entry);
    }
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.memoryCache.delete(key);
    localStorage.removeItem(this.STORAGE_PREFIX + key);
  }

  /**
   * Invalidate multiple cache entries by pattern
   */
  invalidatePattern(pattern: string): void {
    // Invalidate memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidate localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_PREFIX) && key.includes(pattern)) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    
    // Clear localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    storageEntries: number;
    totalSize: number;
  } {
    const storageEntries = Object.keys(localStorage)
      .filter(key => key.startsWith(this.STORAGE_PREFIX)).length;
    
    // Rough size calculation for localStorage
    const totalSize = Object.keys(localStorage)
      .filter(key => key.startsWith(this.STORAGE_PREFIX))
      .reduce((size, key) => {
        const value = localStorage.getItem(key);
        return size + (value ? value.length : 0);
      }, 0);

    return {
      memoryEntries: this.memoryCache.size,
      storageEntries,
      totalSize
    };
  }

  private getFromStorage<T>(key: string): CacheEntry<T> | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_PREFIX + key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private setInStorage<T>(key: string, entry: CacheEntry<T>): void {
    try {
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
      // Handle localStorage quota exceeded
      console.warn('Failed to store in localStorage:', error);
      this.cleanupOldEntries();
    }
  }

  /**
   * Clean up old entries when storage is full
   */
  private cleanupOldEntries(): void {
    const entries: Array<{ key: string; timestamp: number }> = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_PREFIX)) {
        try {
          const entry = JSON.parse(localStorage.getItem(key) || '{}');
          entries.push({ key, timestamp: entry.timestamp || 0 });
        } catch {
          // Remove corrupted entries
          localStorage.removeItem(key);
        }
      }
    }

    // Sort by timestamp and remove oldest 25%
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.ceil(entries.length * 0.25);
    
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(entries[i].key);
    }
  }
}

export const cacheService = new CacheService();

// Cache keys for different data types
export const CACHE_KEYS = {
  ALBUMS: 'account_albums',
  IMAGES: 'account_images',
  ALBUM_DETAIL: (id: string) => `album_${id}`,
  IMAGE_DETAIL: (id: string) => `image_${id}`,
  ACCOUNT_INFO: 'account_info'
} as const;

// Cache durations
export const CACHE_DURATIONS = {
  SHORT: 2 * 60 * 1000,    // 2 minutes
  MEDIUM: 5 * 60 * 1000,   // 5 minutes
  LONG: 15 * 60 * 1000,    // 15 minutes
  VERY_LONG: 60 * 60 * 1000 // 1 hour
} as const;
