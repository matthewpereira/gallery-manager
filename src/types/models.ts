/**
 * Normalized data models for the gallery manager
 * These are provider-agnostic and can be used with Imgur, S3, or any other storage provider
 */

export type Privacy = 'public' | 'private' | 'unlisted';

export interface Album {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  imageCount: number;
  createdAt: Date;
  privacy: Privacy;
  views?: number;
  metadata?: Record<string, any>; // Provider-specific data
}

export interface AlbumDetail extends Album {
  images: Image[];
}

export interface Image {
  id: string;
  url: string;
  thumbnailUrl: string;
  title?: string;
  description?: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  createdAt: Date;
  views?: number;
  animated?: boolean;
  metadata?: Record<string, any>; // Provider-specific data
}

export interface CreateAlbumRequest {
  title?: string;
  description?: string;
  privacy?: Privacy;
  coverId?: string;
}

export interface UpdateAlbumRequest {
  title?: string;
  description?: string;
  privacy?: Privacy;
  coverId?: string;
  imageIds?: string[];
}

export interface UploadOptions {
  albumId?: string;
  title?: string;
  description?: string;
}

export interface UpdateImageRequest {
  title?: string;
  description?: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
}
