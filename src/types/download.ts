/**
 * Types for album and image download/export functionality
 */

export interface DownloadProgress {
  stage: 'preparing' | 'downloading' | 'packaging' | 'complete' | 'error';
  currentAlbum?: string;
  currentImage?: string;
  albumsProcessed: number;
  totalAlbums: number;
  imagesProcessed: number;
  totalImages: number;
  percentage: number;
  error?: string;
}

export interface ImageManifestEntry {
  id: string;
  filename: string; // Local filename in the ZIP
  originalUrl: string;
  thumbnailUrl: string;
  title?: string;
  description?: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
  views?: number;
  animated?: boolean;
  orderIndex: number; // Position within the album (0-based)
  originalFilename?: string; // Original filename when uploaded
  metadata?: Record<string, any>; // Provider-specific metadata (e.g., Imgur deletehash, tags, etc.)
}

export interface AlbumManifestEntry {
  id: string;
  title: string;
  description?: string;
  privacy: 'public' | 'private' | 'unlisted';
  imageCount: number;
  createdAt: string;
  views?: number;
  folderName: string; // Folder name in the ZIP
  coverImageId?: string; // ID of the cover image
  coverImageUrl?: string; // URL of the cover image
  images: ImageManifestEntry[];
  metadata?: Record<string, any>; // Provider-specific metadata
}

export interface ExportManifest {
  exportDate: string;
  exportVersion: string; // Schema version for future compatibility
  totalAlbums: number;
  totalImages: number;
  albums: AlbumManifestEntry[];
}

export interface DownloadOptions {
  albumIds?: string[]; // If undefined, download all albums
  includeMetadata: boolean;
  progressCallback?: (progress: DownloadProgress) => void;
}
