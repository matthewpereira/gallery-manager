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
  private memoryCache = new Map<string, CacheEntry<unknown>>();
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
      persist = true
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
    const isFresh = cached && (now - cached.timestamp) < cached.ttl;
    
    // If we have fresh cached data, return it
    if (cached && isFresh) {
      return cached.data as T;
    }

    // Always try to fetch fresh data first, only use stale cache as fallback
    try {
      const data = await fetcher();
      this.set(key, data, { ttl, persist });
      return data;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      if (cached) {
        console.warn(`Using stale cache for ${key} after fetch failed:`, error);
        return cached.data as T;
      }
      throw error;
    }
  }

  /**
   * Fetch fresh data and cache it
   */
  // Removed unused fetchAndCache and refreshInBackground methods
  // to simplify the code and prevent potential retry loops

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
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      // Basic validation of the stored data shape
      if (parsed && typeof parsed === 'object' && 
          'data' in parsed && 
          'timestamp' in parsed && 
          'ttl' in parsed) {
        return parsed as CacheEntry<T>;
      }
      return null;
    } catch (error) {
      console.error(`Error reading from localStorage for key ${key}:`, error);
      return null;
    }
  }

  private setInStorage<T>(key: string, entry: CacheEntry<T>): void {
    try {
      // Ensure we're storing a valid CacheEntry
      const entryToStore: CacheEntry<unknown> = {
        data: entry.data,
        timestamp: entry.timestamp,
        ttl: entry.ttl
      };
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(entryToStore));
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
