import axios, { type AxiosInstance } from 'axios';
import type { ImgurApiResponse, ImgurImage, ImgurAlbum } from '../types/imgur';
import { authService } from './auth';
import { cacheService, CACHE_KEYS, CACHE_DURATIONS } from './cache';

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
      const token = await authService.getValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        // Use client ID for public endpoints
        config.headers.Authorization = `Client-ID ${import.meta.env.VITE_IMGUR_CLIENT_ID}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid, logout user
          authService.logout();
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get current user's account images
   */
  async getAccountImages(page = 0): Promise<ImgurImage[]> {
    const cacheKey = `${CACHE_KEYS.IMAGES}_${page}`;
    
    return cacheService.get(
      cacheKey,
      async () => {
        const response = await this.api.get<ImgurApiResponse<ImgurImage[]>>(
          `/account/me/images/${page}`
        );
        return response.data.data;
      },
      {
        ttl: CACHE_DURATIONS.MEDIUM,
        persist: true,
        backgroundRefresh: true
      }
    );
  }

  /**
   * Get current user's albums
   */
  async getAccountAlbums(page = 0): Promise<ImgurAlbum[]> {
    const cacheKey = `${CACHE_KEYS.ALBUMS}_${page}`;
    
    return cacheService.get(
      cacheKey,
      async () => {
        const response = await this.api.get<ImgurApiResponse<ImgurAlbum[]>>(
          `/account/me/albums/${page}`
        );
        return response.data.data;
      },
      {
        ttl: CACHE_DURATIONS.MEDIUM,
        persist: true,
        backgroundRefresh: true
      }
    );
  }

  /**
   * Get album details with images
   */
  async getAlbum(albumId: string): Promise<ImgurAlbum> {
    try {
      const response = await this.api.get<ImgurApiResponse<ImgurAlbum>>(
        `/album/${albumId}`
      );
      return response.data.data;
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
   * Delete an image
   */
  async deleteImage(imageId: string): Promise<boolean> {
    try {
      const response = await this.api.delete<ImgurApiResponse<boolean>>(
        `/image/${imageId}`
      );
      
      // Invalidate related caches
      cacheService.invalidatePattern(CACHE_KEYS.IMAGES);
      cacheService.invalidatePattern(CACHE_KEYS.ALBUMS); // Albums may contain this image
      cacheService.invalidate(CACHE_KEYS.IMAGE_DETAIL(imageId));
      
      return response.data.data;
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw new Error('Failed to delete image');
    }
  }

  /**
   * Update image details
   */
  async updateImage(
    imageId: string, 
    updates: { title?: string; description?: string }
  ): Promise<boolean> {
    try {
      const response = await this.api.put<ImgurApiResponse<boolean>>(
        `/image/${imageId}`,
        updates
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to update image:', error);
      throw new Error('Failed to update image');
    }
  }

  /**
   * Create a new album
   */
  async createAlbum(data: {
    title?: string;
    description?: string;
    privacy?: 'public' | 'hidden' | 'secret';
    cover?: string;
  }): Promise<ImgurAlbum> {
    try {
      const response = await this.api.post<ImgurApiResponse<ImgurAlbum>>(
        '/album',
        data
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to create album:', error);
      throw new Error('Failed to create album');
    }
  }

  /**
   * Delete an album
   */
  async deleteAlbum(albumId: string): Promise<boolean> {
    try {
      const response = await this.api.delete<ImgurApiResponse<boolean>>(
        `/album/${albumId}`
      );
      
      // Invalidate related caches
      cacheService.invalidatePattern(CACHE_KEYS.ALBUMS);
      cacheService.invalidate(CACHE_KEYS.ALBUM_DETAIL(albumId));
      
      return response.data.data;
    } catch (error) {
      console.error('Failed to delete album:', error);
      throw new Error('Failed to delete album');
    }
  }

  /**
   * Add images to album
   */
  async addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    try {
      const response = await this.api.put<ImgurApiResponse<boolean>>(
        `/album/${albumId}/add`,
        { ids: imageIds }
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to add images to album:', error);
      throw new Error('Failed to add images to album');
    }
  }

  /**
   * Remove images from album
   */
  async removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    try {
      const response = await this.api.delete<ImgurApiResponse<boolean>>(
        `/album/${albumId}/remove_images`,
        { data: { ids: imageIds } }
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to remove images from album:', error);
      throw new Error('Failed to remove images from album');
    }
  }

  /**
   * Upload a new image
   */
  async uploadImage(
    file: File,
    options?: {
      title?: string;
      description?: string;
      album?: string;
    }
  ): Promise<ImgurImage> {
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      if (options?.title) formData.append('title', options.title);
      if (options?.description) formData.append('description', options.description);
      if (options?.album) formData.append('album', options.album);

      const response = await this.api.post<ImgurApiResponse<ImgurImage>>(
        '/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw new Error('Failed to upload image');
    }
  }

  /**
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
}

export const imgurService = new ImgurService();
