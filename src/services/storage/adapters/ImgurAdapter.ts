/**
 * Imgur Storage Provider Adapter
 *
 * Implements the StorageProvider interface for Imgur's API
 * Handles transformation between Imgur API responses and normalized data models
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { StorageProvider } from '../StorageProvider';
import type {
  Album,
  AlbumDetail,
  Image,
  CreateAlbumRequest,
  UpdateAlbumRequest,
  UploadOptions,
  UpdateImageRequest,
  AuthResult,
  Privacy
} from '../../../types/models';
import type { ImgurApiResponse, ImgurImage, ImgurAlbum } from '../../../types/imgur';
import { authService } from '../../auth';
import { cacheService, CACHE_KEYS, CACHE_DURATIONS } from '../../cache';

// Maximum number of retry attempts for failed requests
const MAX_RETRY_ATTEMPTS = 2;
// HTTP status codes that should trigger a retry
const RETRY_STATUS_CODES = [408, 500, 502, 503, 504];
const RATE_LIMIT_DELAY = 10000; // 10 seconds minimum delay for rate limits

/**
 * Calculates the delay for the next retry attempt using exponential backoff
 * with jitter to prevent thundering herd problem
 */
const calculateRetryDelay = (attempt: number, isRateLimit: boolean = false): number => {
  if (isRateLimit) {
    return RATE_LIMIT_DELAY + (Math.random() * 2000); // 10-12s for rate limits
  }

  const baseDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, etc.
  const jitter = Math.random() * 1000; // Add up to 1s of jitter
  return baseDelay + jitter;
};

export class ImgurAdapter implements StorageProvider {
  public readonly name = 'imgur';
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.imgur.com/3',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors for authentication and error handling
   */
  private setupInterceptors(): void {
    // Add request interceptor to include auth token
    this.api.interceptors.request.use(async (config) => {
      try {
        const isAccountEndpoint = config.url?.startsWith('/account');
        const isImageUpload = config.url?.startsWith('/image') && config.method === 'post';
        const isAlbumOperation = config.url?.startsWith('/album') && config.method === 'post';
        const isDeleteOperation = config.method === 'delete';
        const isUpdateOperation = config.method === 'put' || config.method === 'patch';

        // Require OAuth for: account endpoints, uploads, album operations, deletes, and updates
        const requiresOAuth = isAccountEndpoint || isImageUpload || isAlbumOperation || isDeleteOperation || isUpdateOperation;

        if (requiresOAuth) {
          const token = await authService.getValidToken('imgur');
          if (!token) {
            throw new Error('Imgur authentication required. Please sign in with Imgur.');
          }
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          config.headers.Authorization = `Client-ID ${import.meta.env.VITE_IMGUR_CLIENT_ID}`;
        }

        console.log(`[Imgur API] ${config.method?.toUpperCase()} ${config.url}`, {
          authType: requiresOAuth ? 'OAuth' : 'Client-ID',
        });

        return config;
      } catch (error) {
        console.error('Error setting up request authorization:', error);
        if (!config.url?.startsWith('/account')) {
          config.headers.Authorization = `Client-ID ${import.meta.env.VITE_IMGUR_CLIENT_ID}`;
          return config;
        }
        throw error;
      }
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          authService.logout();
          const authError = new Error('Authentication required');
          (authError as any).isAuthError = true;
          return Promise.reject(authError);
        }
        return Promise.reject(error);
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
      });

      if (error.isAuthError) {
        console.error(`${logPrefix} Authentication error, not retrying`);
        throw error;
      }

      const status = error.response?.status;
      const isNetworkError = !status;
      const isRateLimit = status === 429;
      const isRetryable = isNetworkError || RETRY_STATUS_CODES.includes(status) || isRateLimit;

      if (isRetryable && attempt < MAX_RETRY_ATTEMPTS) {
        const retryAfter = isRateLimit ? error.response?.headers?.['retry-after'] : null;
        const delay = retryAfter ? (parseInt(retryAfter, 10) * 1000) + 1000 :
                     calculateRetryDelay(attempt, isRateLimit);

        console.warn(`${logPrefix} Will retry in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry<T>(config, attempt + 1);
      }

      const apiError = new Error(error.message || 'API request failed');
      Object.assign(apiError, {
        details: {
          url: config.url,
          method: config.method,
          status,
          requestId
        },
        isApiError: true,
        requestId
      });
      throw apiError;
    }
  }

  /**
   * Invalidate relevant caches after modifications
   */
  private invalidateCaches(): void {
    cacheService.invalidatePattern(CACHE_KEYS.ALBUMS);
    cacheService.invalidatePattern(CACHE_KEYS.IMAGES);

    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEYS.ALBUM_DETAIL('')) ||
          key.startsWith(CACHE_KEYS.IMAGE_DETAIL(''))) {
        cacheService.invalidate(key);
      }
    });
  }

  // ========== Normalization Methods ==========

  /**
   * Normalize Imgur privacy value to standard Privacy type
   */
  private normalizePrivacy(imgurPrivacy: string): Privacy {
    switch (imgurPrivacy) {
      case 'public':
        return 'public';
      case 'hidden':
      case 'secret':
        return 'private';
      default:
        return 'unlisted';
    }
  }

  /**
   * Convert Imgur privacy to Imgur API format
   */
  private denormalizePrivacy(privacy: Privacy): string {
    switch (privacy) {
      case 'public':
        return 'public';
      case 'private':
        return 'secret';
      case 'unlisted':
        return 'hidden';
    }
  }

  /**
   * Normalize an Imgur album to the standard Album model
   */
  private normalizeAlbum(imgurAlbum: ImgurAlbum): Album {
    return {
      id: imgurAlbum.id,
      title: imgurAlbum.title || 'Untitled Album',
      description: imgurAlbum.description || undefined,
      coverImageUrl: imgurAlbum.cover ? `https://i.imgur.com/${imgurAlbum.cover}.jpg` : undefined,
      imageCount: imgurAlbum.images_count,
      createdAt: new Date(imgurAlbum.datetime * 1000),
      privacy: this.normalizePrivacy(imgurAlbum.privacy),
      views: imgurAlbum.views,
      metadata: {
        layout: imgurAlbum.layout,
        accountId: imgurAlbum.account_id,
        accountUrl: imgurAlbum.account_url,
        favorite: imgurAlbum.favorite,
        nsfw: imgurAlbum.nsfw,
        inGallery: imgurAlbum.in_gallery,
      }
    };
  }

  /**
   * Normalize an Imgur album with images to the standard AlbumDetail model
   */
  private normalizeAlbumDetail(imgurAlbum: ImgurAlbum): AlbumDetail {
    return {
      ...this.normalizeAlbum(imgurAlbum),
      images: (imgurAlbum.images || []).map(img => this.normalizeImage(img))
    };
  }

  /**
   * Normalize an Imgur image to the standard Image model
   */
  private normalizeImage(imgurImage: ImgurImage): Image {
    return {
      id: imgurImage.id,
      url: imgurImage.link,
      thumbnailUrl: imgurImage.link.replace(/\.(jpg|png|gif)$/, 'm.$1'),
      title: imgurImage.title || undefined,
      description: imgurImage.description || undefined,
      size: imgurImage.size,
      mimeType: imgurImage.type,
      width: imgurImage.width,
      height: imgurImage.height,
      createdAt: new Date(imgurImage.datetime * 1000),
      views: imgurImage.views,
      animated: imgurImage.animated,
      metadata: {
        deletehash: imgurImage.deletehash,
        name: imgurImage.name,
        bandwidth: imgurImage.bandwidth,
        favorite: imgurImage.favorite,
        nsfw: imgurImage.nsfw,
        accountId: imgurImage.account_id,
        accountUrl: imgurImage.account_url,
        inGallery: imgurImage.in_gallery,
        tags: imgurImage.tags,
      }
    };
  }

  // ========== StorageProvider Implementation ==========

  async listAlbums(page = 0): Promise<Album[]> {
    const cacheKey = `${CACHE_KEYS.ALBUMS}_${page}`;

    return cacheService.get(
      cacheKey,
      async () => {
        console.log('Fetching albums from Imgur API...');
        const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum[]>>({
          method: 'GET',
          url: `/account/me/albums/${page}`
        });

        const albums = (response.data || []).map(album => this.normalizeAlbum(album));
        console.log('Albums fetched successfully:', albums.length, 'albums');
        return albums;
      },
      {
        ttl: CACHE_DURATIONS.MEDIUM,
        persist: true,
        backgroundRefresh: true
      }
    );
  }

  async getAlbum(id: string, options?: { imageLimit?: number; imageOffset?: number }): Promise<AlbumDetail> {
    const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum>>({
      method: 'GET',
      url: `/album/${id}`
    });

    const albumDetail = this.normalizeAlbumDetail(response.data);

    // Apply pagination if requested
    if (options?.imageLimit !== undefined || options?.imageOffset !== undefined) {
      const offset = options.imageOffset ?? 0;
      const limit = options.imageLimit;
      albumDetail.images = limit !== undefined
        ? albumDetail.images.slice(offset, offset + limit)
        : albumDetail.images.slice(offset);

      console.log(`[ImgurAdapter] Loaded album ${id}: ${albumDetail.images.length} images (offset: ${offset}, total: ${response.data.images?.length || 0})`);
    }

    return albumDetail;
  }

  async createAlbum(data: CreateAlbumRequest): Promise<Album> {
    const imgurData = {
      title: data.title,
      description: data.description,
      privacy: data.privacy ? this.denormalizePrivacy(data.privacy) : undefined,
      cover: data.coverId,
    };

    const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum>>({
      method: 'POST',
      url: '/album',
      data: imgurData
    });

    this.invalidateCaches();
    return this.normalizeAlbum(response.data);
  }

  async updateAlbum(id: string, updates: UpdateAlbumRequest): Promise<Album> {
    const imgurUpdates = {
      title: updates.title,
      description: updates.description,
      privacy: updates.privacy ? this.denormalizePrivacy(updates.privacy) : undefined,
      cover: updates.coverId,
      ids: updates.imageIds,
    };

    const response = await this.requestWithRetry<ImgurApiResponse<ImgurAlbum>>({
      method: 'POST',
      url: `/album/${id}`,
      data: imgurUpdates
    });

    this.invalidateCaches();
    return this.normalizeAlbum(response.data);
  }

  async deleteAlbum(id: string): Promise<boolean> {
    await this.requestWithRetry({
      method: 'DELETE',
      url: `/album/${id}`
    });

    this.invalidateCaches();
    return true;
  }

  async listImages(page = 0): Promise<Image[]> {
    const cacheKey = `${CACHE_KEYS.IMAGES}_${page}`;

    return cacheService.get(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<ImgurApiResponse<ImgurImage[]>>({
          method: 'GET',
          url: `/account/me/images/${page}`
        });

        return (response.data || []).map(img => this.normalizeImage(img));
      },
      {
        ttl: CACHE_DURATIONS.MEDIUM,
        persist: true,
        backgroundRefresh: true
      }
    );
  }

  async getImage(id: string): Promise<Image> {
    const response = await this.api.get<ImgurApiResponse<ImgurImage>>(
      `/image/${id}`
    );

    return this.normalizeImage(response.data.data);
  }

  async uploadImage(file: File, options: UploadOptions = {}): Promise<Image> {
    const formData = new FormData();
    formData.append('image', file);

    if (options.albumId) formData.append('album', options.albumId);
    if (options.title) formData.append('title', options.title);
    if (options.description) formData.append('description', options.description);

    const response = await this.requestWithRetry<ImgurApiResponse<ImgurImage>>({
      method: 'POST',
      url: '/image',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    this.invalidateCaches();
    return this.normalizeImage(response.data);
  }

  async updateImage(id: string, updates: UpdateImageRequest): Promise<Image> {
    const response = await this.requestWithRetry<ImgurApiResponse<ImgurImage>>({
      method: 'POST',
      url: `/image/${id}`,
      data: updates
    });

    this.invalidateCaches();
    return this.normalizeImage(response.data);
  }

  async deleteImage(id: string): Promise<boolean> {
    await this.requestWithRetry({
      method: 'DELETE',
      url: `/image/${id}`
    });

    this.invalidateCaches();
    return true;
  }

  async addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    const response = await this.requestWithRetry<ImgurApiResponse<boolean>>({
      method: 'POST',
      url: `/album/${albumId}/add`,
      data: { ids: imageIds }
    });

    this.invalidateCaches();
    return response.data;
  }

  async removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    const response = await this.requestWithRetry<ImgurApiResponse<boolean>>({
      method: 'DELETE',
      url: `/album/${albumId}/remove_images`,
      data: { ids: imageIds }
    });

    this.invalidateCaches();
    return response.data;
  }

  isAuthenticated(): boolean {
    // Check if Imgur token exists in localStorage
    const token = localStorage.getItem('imgur_auth_token');
    return !!token;
  }

  async authenticate(): Promise<AuthResult> {
    // Imgur OAuth flow is handled by authService
    // This method could redirect to OAuth or check current auth status
    if (this.isAuthenticated()) {
      return { success: true };
    }

    return {
      success: false,
      message: 'Please authenticate with Imgur through the login flow'
    };
  }

  async refreshToken(): Promise<void> {
    // Token refresh is handled by authService via interceptor
    // This is a placeholder for the interface requirement
    return Promise.resolve();
  }

  async getAccountInfo(): Promise<any> {
    const response = await this.api.get('/account/me');
    return response.data.data;
  }
}
