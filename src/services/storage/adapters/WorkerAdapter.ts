/**
 * Worker API Storage Adapter
 *
 * Implements the StorageProvider interface using the Cloudflare Worker API.
 * This adapter communicates with the textsite-r2-worker which handles all R2
 * operations server-side, keeping credentials secure.
 *
 * Benefits:
 * - No credentials exposed in frontend
 * - No CORS issues (Worker handles R2 access)
 * - Auth0 JWT authentication for write operations
 */

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
} from '../../../types/models';

interface WorkerConfig {
  apiUrl: string;
}

interface WorkerAlbumResponse {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  date?: string;
  imgurId?: string;
  imageCount?: number;
  coverImageUrl?: string;
  images?: WorkerImageResponse[];
  totalImages?: number;
}

interface WorkerImageResponse {
  id: string;
  url: string;
  thumbnailUrl: string;
  title?: string;
  description?: string;
  size: number;
  type: string;
  width: number;
  height: number;
  datetime: number;
  animated?: boolean;
}

export class WorkerAdapter implements StorageProvider {
  readonly name = 'worker';
  private config: WorkerConfig;
  private accessToken: string | null = null;
  private authenticated: boolean = false;

  constructor() {
    this.config = {
      apiUrl: import.meta.env.VITE_R2_API_URL || 'https://textsite-r2-api.matthewpereira.workers.dev',
    };

    if (!this.config.apiUrl) {
      throw new Error('Worker API URL is not configured. Set VITE_R2_API_URL in your environment.');
    }
  }

  /**
   * Set the Auth0 access token for authenticated requests
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
    console.log(`[WorkerAdapter] Access token ${token ? 'set' : 'cleared'}`);
  }

  /**
   * Mark user as authenticated
   */
  setAuthenticated(authenticated: boolean): void {
    this.authenticated = authenticated;
    console.log(`[WorkerAdapter] Authentication status: ${authenticated}`);
  }

  /**
   * Make an authenticated request to the Worker API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
    };

    // Add Authorization header for authenticated requests
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Add Content-Type for JSON requests
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Ensure user is authenticated before allowing write operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new Error('User not authenticated. Please log in to access storage.');
    }
    if (!this.accessToken) {
      throw new Error('No access token available. Please log in again.');
    }
  }

  /**
   * Convert Worker API album response to normalized Album model
   */
  private toAlbum(data: WorkerAlbumResponse): Album {
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      coverImageUrl: data.coverImageUrl,
      imageCount: data.imageCount || data.totalImages || 0,
      createdAt: new Date(data.createdAt),
      date: data.date ? new Date(data.date) : undefined,
      imgurId: data.imgurId,
      privacy: 'private', // Worker API doesn't expose privacy yet
    };
  }

  /**
   * Convert Worker API image response to normalized Image model
   */
  private toImage(data: WorkerImageResponse): Image {
    return {
      id: data.id,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl,
      title: data.title,
      description: data.description,
      size: data.size,
      mimeType: data.type,
      width: data.width,
      height: data.height,
      createdAt: new Date(data.datetime * 1000),
      animated: data.animated,
    };
  }

  // ============================================================================
  // Album Operations
  // ============================================================================

  async listAlbums(page?: number): Promise<Album[]> {
    this.ensureAuthenticated();

    const response = await this.request<{ albums: WorkerAlbumResponse[] }>('/api/albums');
    let albums = response.albums.map(a => this.toAlbum(a));

    // Sort by creation date (newest first)
    albums.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination if requested
    if (page !== undefined) {
      const pageSize = 50;
      const start = page * pageSize;
      return albums.slice(start, start + pageSize);
    }

    return albums;
  }

  async getAlbum(id: string, options?: { imageLimit?: number; imageOffset?: number }): Promise<AlbumDetail> {
    this.ensureAuthenticated();

    const params = new URLSearchParams();
    if (options?.imageLimit !== undefined) {
      params.set('limit', options.imageLimit.toString());
    }
    if (options?.imageOffset !== undefined) {
      params.set('offset', options.imageOffset.toString());
    }

    const endpoint = `/api/albums/${encodeURIComponent(id)}${params.toString() ? `?${params}` : ''}`;
    const data = await this.request<WorkerAlbumResponse>(endpoint);

    return {
      ...this.toAlbum(data),
      images: (data.images || []).map(img => this.toImage(img)),
    };
  }

  async createAlbum(data: CreateAlbumRequest): Promise<Album> {
    this.ensureAuthenticated();

    const response = await this.request<WorkerAlbumResponse>('/api/albums', {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        privacy: data.privacy,
        coverId: data.coverId,
        customId: data.customId,
      }),
    });

    // Invalidate cache
    await this.invalidateCache();

    return this.toAlbum(response);
  }

  async updateAlbum(id: string, updates: UpdateAlbumRequest): Promise<Album> {
    this.ensureAuthenticated();

    const response = await this.request<WorkerAlbumResponse>(`/api/albums/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: updates.title,
        description: updates.description,
        privacy: updates.privacy,
        coverId: updates.coverId,
        date: updates.date ? updates.date.toISOString() : updates.date,
      }),
    });

    return this.toAlbum(response);
  }

  async deleteAlbum(id: string): Promise<boolean> {
    this.ensureAuthenticated();

    await this.request<{ success: boolean }>(`/api/albums/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    // Invalidate cache
    await this.invalidateCache();

    return true;
  }

  async renameAlbum(_oldId: string, _newId: string, _onProgress?: (status: string, percent: number) => void): Promise<Album> {
    this.ensureAuthenticated();

    // The Worker API doesn't have a dedicated rename endpoint yet.
    // For now, we can't rename albums through the Worker API.
    // This would require adding a rename endpoint to the worker.
    throw new Error('Album renaming is not yet supported through the Worker API. This feature requires direct R2 access.');
  }

  async resolveImgurId(imgurId: string): Promise<string | null> {
    this.ensureAuthenticated();

    try {
      // List all albums and search for matching imgurId
      const response = await this.request<{ albums: WorkerAlbumResponse[] }>('/api/albums');
      const match = response.albums.find(a => a.imgurId === imgurId);
      return match?.id || null;
    } catch (error) {
      console.error(`Failed to resolve Imgur ID "${imgurId}":`, error);
      return null;
    }
  }

  // ============================================================================
  // Image Operations
  // ============================================================================

  async listImages(_page?: number): Promise<Image[]> {
    this.ensureAuthenticated();

    // The Worker API doesn't have a standalone images endpoint.
    // Images are always fetched as part of albums.
    // For now, return empty array - this could be implemented if needed.
    console.warn('[WorkerAdapter] listImages is not implemented - images are fetched with albums');
    return [];
  }

  async getImage(_id: string): Promise<Image> {
    this.ensureAuthenticated();

    // The Worker API doesn't have a get-single-image endpoint.
    // This would require adding one to the worker.
    throw new Error('Getting individual images is not yet supported through the Worker API.');
  }

  async uploadImage(file: File, options?: UploadOptions): Promise<Image> {
    this.ensureAuthenticated();

    if (!options?.albumId) {
      throw new Error('Album ID is required for image upload');
    }

    // Get image dimensions
    const dimensions = await this.getImageDimensions(file);

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('width', dimensions.width.toString());
    formData.append('height', dimensions.height.toString());
    if (options.title) {
      formData.append('title', options.title);
    }
    if (options.description) {
      formData.append('description', options.description);
    }

    // Upload via Worker API
    const url = `${this.config.apiUrl}/api/albums/${encodeURIComponent(options.albumId)}/images`;
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    const data = await response.json();

    // Convert response to Image model
    // The worker returns R2ImageMetadata, not the full image response
    const imageUrl = `${this.config.apiUrl}/api/images/${encodeURIComponent(`albums/${options.albumId}/images/${data.id}.${this.getExtension(data.mimeType)}`)}`;

    return {
      id: data.id,
      url: imageUrl,
      thumbnailUrl: imageUrl,
      title: data.title,
      description: data.description,
      size: data.size,
      mimeType: data.mimeType,
      width: data.width,
      height: data.height,
      createdAt: new Date(data.createdAt),
      animated: data.animated,
    };
  }

  /**
   * Get image dimensions from file
   */
  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    return mimeToExt[mimeType] || 'jpg';
  }

  async updateImage(_id: string, _updates: UpdateImageRequest): Promise<Image> {
    this.ensureAuthenticated();

    // We need the album ID to update an image through the Worker API.
    // This is a limitation - the caller would need to provide it.
    throw new Error('Updating images requires the album ID. Use updateImageInAlbum instead.');
  }

  /**
   * Update image metadata within an album
   */
  async updateImageInAlbum(albumId: string, imageId: string, updates: UpdateImageRequest): Promise<Image> {
    this.ensureAuthenticated();

    const data = await this.request<any>(`/api/albums/${encodeURIComponent(albumId)}/images/${encodeURIComponent(imageId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    const imageUrl = `${this.config.apiUrl}/api/images/${encodeURIComponent(`albums/${albumId}/images/${imageId}.${this.getExtension(data.mimeType)}`)}`;

    return {
      id: data.id,
      url: imageUrl,
      thumbnailUrl: imageUrl,
      title: data.title,
      description: data.description,
      size: data.size,
      mimeType: data.mimeType,
      width: data.width,
      height: data.height,
      createdAt: new Date(data.createdAt),
      animated: data.animated,
    };
  }

  async deleteImage(_id: string): Promise<boolean> {
    this.ensureAuthenticated();

    // We need the album ID to delete an image through the Worker API.
    throw new Error('Deleting images requires the album ID. Use deleteImageFromAlbum instead.');
  }

  /**
   * Delete image from an album
   */
  async deleteImageFromAlbum(albumId: string, imageId: string): Promise<boolean> {
    this.ensureAuthenticated();

    await this.request<{ success: boolean }>(`/api/albums/${encodeURIComponent(albumId)}/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    });

    return true;
  }

  // ============================================================================
  // Album-Image Relationship Operations
  // ============================================================================

  async addImagesToAlbum(_albumId: string, _imageIds: string[]): Promise<boolean> {
    // The Worker API handles images as part of albums automatically.
    // Adding existing images to albums would require a new endpoint.
    console.warn('[WorkerAdapter] addImagesToAlbum is not implemented - use uploadImage with albumId');
    return false;
  }

  async removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    this.ensureAuthenticated();

    // Delete each image from the album
    for (const imageId of imageIds) {
      await this.deleteImageFromAlbum(albumId, imageId);
    }

    return true;
  }

  // ============================================================================
  // Authentication Operations
  // ============================================================================

  isAuthenticated(): boolean {
    return this.authenticated && !!this.accessToken;
  }

  async authenticate(): Promise<AuthResult> {
    // Authentication is handled by Auth0 externally.
    // This adapter receives the token via setAccessToken().
    return {
      success: this.isAuthenticated(),
      message: this.isAuthenticated() ? 'Authenticated with Worker API' : 'Not authenticated',
    };
  }

  async refreshToken(): Promise<void> {
    // Token refresh is handled by Auth0 externally.
    return;
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async getAccountInfo(): Promise<any> {
    return {
      provider: 'worker',
      apiUrl: this.config.apiUrl,
      authenticated: this.isAuthenticated(),
    };
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  /**
   * Invalidate the Worker's album cache
   */
  private async invalidateCache(): Promise<void> {
    try {
      await fetch(`${this.config.apiUrl}/api/cache/invalidate`, {
        method: 'POST',
      });
      console.log('[WorkerAdapter] Cache invalidated');
    } catch (error) {
      console.warn('[WorkerAdapter] Failed to invalidate cache:', error);
    }
  }
}
