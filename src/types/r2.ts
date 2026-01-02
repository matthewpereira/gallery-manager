/**
 * Cloudflare R2 types and configuration
 * R2 uses S3-compatible API via AWS SDK
 */

import type { Privacy } from './models';

/**
 * R2 configuration from environment variables
 */
export interface R2Config {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl?: string; // Optional public URL for bucket (r2.dev or custom domain)
}

/**
 * Album metadata stored as JSON in R2
 * Stored at: albums/{albumId}/metadata.json
 */
export interface R2AlbumMetadata {
  id: string;
  title: string;
  description?: string;
  privacy: Privacy;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  date?: string; // Optional calendar date (ISO 8601 date string)
  imgurId?: string; // Original Imgur album ID for legacy bookmark support
  coverImageId?: string;
  coverImageUrl?: string; // Pre-computed cover image URL (public or presigned)
  imageIds: string[]; // Array of image IDs in this album
  imageCount: number;
}

/**
 * Image metadata stored as JSON in R2
 * Can be stored in S3 object metadata or separate file at: metadata/images/{imageId}.json
 */
export interface R2ImageMetadata {
  id: string;
  title?: string;
  description?: string;
  mimeType: string;
  size: number; // File size in bytes
  width: number;
  height: number;
  createdAt: string; // ISO 8601 date string
  albumId?: string; // Optional - if image belongs to an album
  animated?: boolean;
}

/**
 * R2 object key (path) structure
 */
export interface R2ObjectKey {
  // Album paths
  albumMetadata: (albumId: string) => string; // albums/{albumId}/metadata.json
  albumCover: (albumId: string, ext: string) => string; // albums/{albumId}/cover.{ext}
  albumImage: (albumId: string, imageId: string, ext: string) => string; // albums/{albumId}/images/{imageId}.{ext}
  albumImageThumb: (albumId: string, imageId: string) => string; // albums/{albumId}/thumbnails/{imageId}_thumb.jpg

  // Standalone image paths
  standaloneImage: (imageId: string, ext: string) => string; // images/{imageId}.{ext}

  // Metadata paths
  imageMetadata: (imageId: string) => string; // metadata/images/{imageId}.json
}

/**
 * Upload options for R2
 */
export interface R2UploadOptions {
  albumId?: string; // If specified, upload to album folder
  title?: string;
  description?: string;
  generateThumbnail?: boolean; // Future: auto-generate thumbnail
}

/**
 * Presigned URL options
 */
export interface R2PresignedUrlOptions {
  expiresIn?: number; // Seconds until URL expires (default: 3600)
}

/**
 * List objects options
 */
export interface R2ListOptions {
  prefix?: string; // Filter by prefix (folder path)
  maxKeys?: number; // Max results to return
  continuationToken?: string; // For pagination
}

/**
 * R2 list result
 */
export interface R2ListResult {
  objects: R2ObjectInfo[];
  isTruncated: boolean;
  continuationToken?: string;
}

/**
 * R2 object information
 */
export interface R2ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

/**
 * Master index of all albums for performance optimization
 * Stored at: albums/index.json
 * Reduces listAlbums() from ~170 metadata requests to 1 index request
 */
export interface R2AlbumIndex {
  albums: Record<string, R2AlbumMetadata>;
  version: number;
  lastUpdated: string; // ISO 8601 date string
}
