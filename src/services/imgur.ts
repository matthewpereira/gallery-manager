import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ImgurApiResponse, ImgurImage, ImgurAlbum } from '../types/imgur';
import { authService } from './auth';
import { cacheService, CACHE_KEYS, CACHE_DURATIONS } from './cache';

// Maximum number of retry attempts for failed requests
const MAX_RETRY_ATTEMPTS = 2;
// HTTP status codes that should trigger a retry
const RETRY_STATUS_CODES = [408, 500, 502, 503, 504]; // Note: 429 is handled separately
const RATE_LIMIT_DELAY = 10000; // 10 seconds minimum delay for rate limits

/**
 * Calculates the delay for the next retry attempt using exponential backoff
 * with jitter to prevent thundering herd problem
 */
const calculateRetryDelay = (attempt: number, isRateLimit: boolean = false): number => {
  if (isRateLimit) {
    // For rate limits, use a longer base delay
    return RATE_LIMIT_DELAY + (Math.random() * 2000); // 10-12s for rate limits
  }
  
  const baseDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, etc.
  const jitter = Math.random() * 1000; // Add up to 1s of jitter
  return baseDelay + jitter;
};

class ImgurService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.imgur.com/3',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.api.interceptors.request.use(async (config) => {
      try {
        // Determine which token to use based on the endpoint
        const isAccountEndpoint = config.url?.startsWith('/account');
        const isImageUpload = config.url?.startsWith('/image') && config.method === 'upload';
        
        if (isAccountEndpoint || isImageUpload) {
          // For account-related endpoints and uploads, use Imgur OAuth token
          const token = await authService.getValidToken('imgur');
          if (!token) {
            throw new Error('Imgur authentication required. Please sign in with Imgur.');
          }
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          // For public endpoints, use client ID
          config.headers.Authorization = `Client-ID ${import.meta.env.VITE_IMGUR_CLIENT_ID}`;
        }
        
        console.log(`[Imgur API] ${config.method?.toUpperCase()} ${config.url}`, {
          authType: isAccountEndpoint || isImageUpload ? 'OAuth' : 'Client-ID',
          hasToken: !!(isAccountEndpoint || isImageUpload)
        });
        
        return config;
      } catch (error) {
        console.error('Error setting up request authorization:', error);
        // For public endpoints, fall back to client ID
        if (!config.url?.startsWith('/account')) {
          config.headers.Authorization = `Client-ID ${import.meta.env.VITE_IMGUR_CLIENT_ID}`;
          return config;
        }
        throw error; // Re-throw for protected endpoints
      }
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid, logout user
          authService.logout();
          // Create a special error that won't trigger retries
          const authError = new Error('Authentication required');
          (authError as any).isAuthError = true;
          return Promise.reject(authError);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get current user's account images with retry logic
   */
  async getAccountImages(page = 0): Promise<ImgurImage[]> {
    const cacheKey = `${CACHE_KEYS.IMAGES}_${page}`;
    
    return cacheService.get(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<ImgurApiResponse<ImgurImage[]>>({
          method: 'GET',
          url: `/account/me/images/${page}`
        });
        return response.data || [];
      },
      {
        ttl: CACHE_DURATIONS.MEDIUM,
        persist: true,
        backgroundRefresh: true
      }
    );
  }

  /**
   * Makes an API request with retry logic
   */
  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
    attempt = 0
  ): Promise<T> {
    // Add a unique request ID to track the same request across retries
    const requestId = Math.random().toString(36).substring(2, 8);
    const logPrefix = `[Req ${requestId}][Attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS + 1}]`;
    
    console.log(`${logPrefix} Starting request to ${config.url}`, { 
      method: config.method,
      params: config.params 
    });
    
    try {
      const response = await this.api.request<T>(config);
      console.log(`${logPrefix} Request succeeded`);
      return response.data;
    } catch (error: any) {
      console.error(`${logPrefix} Request failed:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Special case: Don't retry auth errors
      if (error.isAuthError) {
        console.error(`${logPrefix} Authentication error, not retrying`);
        throw error;
      }

      const status = error.response?.status;
      const isNetworkError = !status;
      const isRateLimit = status === 429;
      const isRetryable = isNetworkError || RETRY_STATUS_CODES.includes(status) || isRateLimit;
      
      console.log(`${logPrefix} Error details:`, {
        status: status || 'Network Error',
        isNetworkError,
        isRateLimit,
        isRetryable,
        retryableStatuses: RETRY_STATUS_CODES,
        errorMessage: error.message,
        rateLimit: error.response?.headers?.['x-ratelimit-remaining']
      });
      
      // Handle retryable errors
      if (isRetryable && attempt < MAX_RETRY_ATTEMPTS) {
        const retryAfter = isRateLimit ? error.response?.headers?.['retry-after'] : null;
        const delay = retryAfter ? (parseInt(retryAfter, 10) * 1000) + 1000 : 
                     calculateRetryDelay(attempt, isRateLimit);
        
        const retryMessage = isRateLimit 
          ? `Rate limited. Will retry in ${delay}ms...`
          : `Will retry in ${delay}ms...`;
          
        console.warn(`${logPrefix} ${retryMessage}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry<T>(config, attempt + 1);
      }
      
      // For non-retryable errors or after max attempts
      const errorDetails = {
        url: config.url,
        method: config.method,
        status,
        statusText: error.response?.statusText,
        error: error.message,
        isRetryable,
        attempt: attempt + 1,
        maxAttempts: MAX_RETRY_ATTEMPTS + 1,
        requestId
      };
      
      if (isRetryable) {
        console.error(`${logPrefix} API request failed after all retry attempts:`, errorDetails);
      } else {
        console.error(`${logPrefix} API request failed with non-retryable error:`, errorDetails);
      }
      
      const apiError = new Error(error.message || 'API request failed');
      Object.assign(apiError, { 
        details: errorDetails,
        isApiError: true,
        requestId
      });
      throw apiError;
    }
  }

  /**
   * Get current user's albums with retry logic
   */
  async getAccountAlbums(page = 0): Promise<ImgurAlbum[]> {
    const cacheKey = `${CACHE_KEYS.ALBUMS}_${page}`;
    
    try {
      return await cacheService.get(
        cacheKey,
        async () => {
          try {
            console.log('Fetching albums from Imgur API...');
            const token = await authService.getValidToken();
            console.log('Using token:', token ? 'Token available' : 'No token, using client ID');
            
            const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum[]>>({
              method: 'GET',
              url: `/account/me/albums/${page}`
            });
            
            console.log('Albums fetched successfully:', response.data?.length || 0, 'albums');
            return response.data || [];
          } catch (error: any) {
            console.error('Error fetching albums:', error.message);
            throw new Error('Failed to fetch albums. Please check your authentication and try again.');
          }
        },
        {
          ttl: CACHE_DURATIONS.MEDIUM,
          persist: true,
          backgroundRefresh: true
        }
      );
    } catch (error) {
      console.error('Cache error when fetching albums:', error);
      throw error;
    }
  }

  /**
   * Get album details with images with retry logic
   */
  async getAlbum(albumId: string): Promise<ImgurAlbum> {
    try {
      const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum>>({
        method: 'GET',
        url: `/album/${albumId}`
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch album:', error);
      throw new Error('Failed to fetch album details');
    }
  }

  /**
   * Get image details
   */
  async getImage(imageId: string): Promise<ImgurImage> {
    try {
      const response = await this.api.get<ImgurApiResponse<ImgurImage>>(
        `/image/${imageId}`
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch image:', error);
      throw new Error('Failed to fetch image details');
    }
  }

  /**
   * Delete an image with retry logic
   */
  async deleteImage(imageId: string): Promise<boolean> {
    try {
      await this.requestWithRetry({
        method: 'DELETE',
        url: `/image/${imageId}`
      });
      
      this.invalidateCaches();
      return true;
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw new Error('Failed to delete image. Please try again.');
    }
  }

  /**
   * Update an image's details with retry logic
   */
  async updateImage(imageId: string, updates: { title?: string; description?: string }): Promise<boolean> {
    try {
      const response = await this.requestWithRetry<ImgurApiResponse<boolean>>({
        method: 'POST',
        url: `/image/${imageId}`,
        data: updates
      });
      
      this.invalidateCaches();
      return response.data;
    } catch (error) {
      console.error('Failed to update image:', error);
      throw new Error('Failed to update image. Please try again.');
    }
  }

  /**
   * Create a new album with retry logic
   */
  async createAlbum(data: {
    title?: string;
    description?: string;
    privacy?: 'public' | 'hidden' | 'secret';
    cover?: string;
  }): Promise<ImgurAlbum> {
    try {
      const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum>>({
        method: 'POST',
        url: '/album',
        data
      });
      
      this.invalidateCaches();
      return response.data;
    } catch (error) {
      console.error('Failed to create album:', error);
      throw new Error('Failed to create album. Please try again.');
    }
  }

  /**
   * Delete an album with retry logic
   */
  async deleteAlbum(albumId: string): Promise<boolean> {
    try {
      await this.requestWithRetry({
        method: 'DELETE',
        url: `/album/${albumId}`
      });
      
      this.invalidateCaches();
      return true;
    } catch (error) {
      console.error('Failed to delete album:', error);
      throw new Error('Failed to delete album. Please try again.');
    }
  }

  /**
   * Add images to album with retry logic
   */
  async addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    try {
      const response = await this.requestWithRetry<ImgurApiResponse<boolean>>({
        method: 'POST',
        url: `/album/${albumId}/add`,
        data: { ids: imageIds }
      });
      
      this.invalidateCaches();
      return response.data;
    } catch (error) {
      console.error('Failed to add images to album:', error);
      throw new Error('Failed to add images to album. Please try again.');
    }
  }

  /**
   * Remove images from album with retry logic
   */
  async removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    try {
      const response = await this.requestWithRetry<ImgurApiResponse<boolean>>({
        method: 'DELETE',
        url: `/album/${albumId}/remove_images`,
        data: { ids: imageIds }
      });
      
      this.invalidateCaches();
      return response.data;
    } catch (error) {
      console.error('Failed to remove images from album:', error);
      throw new Error('Failed to remove images from album. Please try again.');
    }
  }

  /**
   * Upload an image to Imgur with retry logic
   */
  async uploadImage(file: File, options: { album?: string; title?: string; description?: string } = {}): Promise<ImgurImage> {
    const formData = new FormData();
    formData.append('image', file);
    
    if (options.album) formData.append('album', options.album);
    if (options.title) formData.append('title', options.title);
    if (options.description) formData.append('description', options.description);

    try {
      const response = await this.requestWithRetry<ImgurApiResponse<ImgurImage>>({
        method: 'POST',
        url: '/image',
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Invalidate relevant caches
      this.invalidateCaches();

      return response.data;
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw new Error('Failed to upload image. Please try again.');
    }
  }

  /**
   * Get account info with retry logic
   * Get account info
   */
  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.api.get('/account/me');
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch account info:', error);
      throw new Error('Failed to fetch account information');
    }
  }

  /**
   * Invalidate relevant caches after modifications
   */
  private invalidateCaches(): void {
    // Invalidate all album and image caches
    cacheService.invalidatePattern(CACHE_KEYS.ALBUMS);
    cacheService.invalidatePattern(CACHE_KEYS.IMAGES);
    
    // Clear any specific album or image caches
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEYS.ALBUM_DETAIL('')) || 
          key.startsWith(CACHE_KEYS.IMAGE_DETAIL(''))) {
        cacheService.invalidate(key);
      }
    });
  }
}

export const imgurService = new ImgurService();
