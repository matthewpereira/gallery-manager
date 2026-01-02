/**
 * Cloudflare R2 Storage Adapter
 *
 * Implements the StorageProvider interface using Cloudflare R2 (S3-compatible storage)
 * R2 provides free egress (bandwidth) which is ideal for image galleries
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
import type {
  R2Config,
  R2AlbumMetadata,
  R2ImageMetadata,
  R2AlbumIndex,
} from '../../../types/r2';

interface CachedUrl {
  url: string;
  expiresAt: number; // Unix timestamp
}

export class R2Adapter implements StorageProvider {
  readonly name = 'r2';
  private client: S3Client;
  private config: R2Config;
  private authenticated: boolean = false;
  private urlCache: Map<string, CachedUrl> = new Map();

  constructor() {
    // Load configuration from environment variables
    this.config = {
      bucketName: import.meta.env.VITE_R2_BUCKET_NAME,
      accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
      endpoint: import.meta.env.VITE_R2_ENDPOINT,
      publicUrl: import.meta.env.VITE_R2_PUBLIC_URL,
    };

    // Validate configuration
    if (!this.config.bucketName || !this.config.accessKeyId || !this.config.secretAccessKey || !this.config.endpoint) {
      throw new Error('R2 configuration is incomplete. Check environment variables.');
    }

    // Initialize S3 client for R2
    this.client = new S3Client({
      region: 'auto', // R2 uses 'auto' as region
      endpoint: this.config.endpoint,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  /**
   * Mark user as authenticated (called by StorageContext)
   * This allows access to the shared album pool
   */
  setAuthenticated(authenticated: boolean): void {
    this.authenticated = authenticated;
    console.log(`[R2Adapter] Authentication status: ${authenticated}`);
  }

  /**
   * Ensure user is authenticated before allowing operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new Error('User not authenticated. Please log in to access storage.');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Generate object keys for R2 storage structure (shared pool)
   */
  private keys = {
    albumIndex: () => `albums/index.json`,
    albumMetadata: (albumId: string) => `albums/${albumId}/metadata.json`,
    albumImage: (albumId: string, imageId: string, ext: string) => `albums/${albumId}/images/${imageId}.${ext}`,
    standaloneImage: (imageId: string, ext: string) => `images/${imageId}.${ext}`,
    imageMetadata: (imageId: string) => `metadata/images/${imageId}.json`,
  };

  /**
   * Generate a unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Validate custom album ID
   */
  private validateCustomId(customId: string): void {
    if (customId.length < 3 || customId.length > 20) {
      throw new Error('Custom ID must be between 3 and 20 characters');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(customId)) {
      throw new Error('Custom ID can only contain letters, numbers, and underscores');
    }

    // Ensure custom IDs don't conflict with system prefixes
    if (customId.startsWith('album_') || customId.startsWith('img_')) {
      throw new Error('Custom ID cannot start with reserved prefixes (album_, img_)');
    }
  }

  /**
   * Check if an album ID already exists
   */
  private async albumExists(albumId: string): Promise<boolean> {
    try {
      const metadataKey = this.keys.albumMetadata(albumId);
      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: metadataKey,
      });
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file extension from filename or mime type
   */
  private getExtension(filename: string, mimeType: string): string {
    // Try to get from filename first
    const match = filename.match(/\.([^.]+)$/);
    if (match) return match[1];

    // Fallback to mime type
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    return mimeToExt[mimeType] || 'jpg';
  }

  /**
   * Upload JSON metadata to R2
   */
  private async uploadMetadata(key: string, data: any): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    });
    await this.client.send(command);
  }

  /**
   * Download and parse JSON metadata from R2
   */
  private async downloadMetadata<T>(key: string): Promise<T> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });
      const response = await this.client.send(command);
      const body = await response.Body?.transformToString();
      if (!body) throw new Error('Empty metadata file');
      return JSON.parse(body) as T;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        throw new Error(`Metadata not found: ${key}`);
      }
      throw error;
    }
  }

  /**
   * Generate presigned URL for private image access
   */
  private async getPresignedUrl(key: string, expiresIn = 7200): Promise<string> {
    // If public URL is configured, use it (no signing needed)
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${key}`;
    }

    // Check cache first
    const now = Date.now();
    const cached = this.urlCache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.url;
    }

    // Otherwise, generate presigned URL (2 hour expiration)
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });

    // Cache the URL (subtract 5 minutes as safety buffer)
    this.urlCache.set(key, {
      url,
      expiresAt: now + (expiresIn - 300) * 1000,
    });

    return url;
  }

  /**
   * Convert R2 image metadata to normalized Image model
   */
  private async imageMetadataToImage(imageId: string, metadata: R2ImageMetadata): Promise<Image> {
    const ext = this.getExtension('', metadata.mimeType);
    const key = metadata.albumId
      ? this.keys.albumImage(metadata.albumId, imageId, ext)
      : this.keys.standaloneImage(imageId, ext);

    const url = await this.getPresignedUrl(key);

    return {
      id: imageId,
      url,
      thumbnailUrl: url, // TODO: Generate actual thumbnails
      title: metadata.title,
      description: metadata.description,
      size: metadata.size,
      mimeType: metadata.mimeType,
      width: metadata.width,
      height: metadata.height,
      createdAt: new Date(metadata.createdAt),
      animated: metadata.animated,
      metadata: {
        albumId: metadata.albumId,
        r2Key: key,
      },
    };
  }

  /**
   * Convert R2 album metadata to normalized Album model
   */
  private albumMetadataToAlbum(metadata: R2AlbumMetadata, coverImageUrl?: string): Album {
    return {
      id: metadata.id,
      title: metadata.title,
      description: metadata.description,
      coverImageUrl,
      imageCount: metadata.imageCount,
      createdAt: new Date(metadata.createdAt),
      date: metadata.date ? new Date(metadata.date) : undefined,
      imgurId: metadata.imgurId,
      privacy: metadata.privacy,
      metadata: {
        updatedAt: metadata.updatedAt,
        coverImageId: metadata.coverImageId,
      },
    };
  }

  // ============================================================================
  // Album Index Operations
  // ============================================================================

  /**
   * Load the album index from R2
   * Returns undefined if index doesn't exist (first run or corrupted)
   */
  private async loadAlbumIndex(): Promise<R2AlbumIndex | undefined> {
    try {
      const indexKey = this.keys.albumIndex();
      const index = await this.downloadMetadata<R2AlbumIndex>(indexKey);
      console.log(`[R2Adapter] Loaded album index (version ${index.version}, ${Object.keys(index.albums).length} albums)`);
      return index;
    } catch (error: any) {
      if (error.message?.includes('Metadata not found')) {
        console.log('[R2Adapter] No album index found - will need to rebuild');
        return undefined;
      }
      console.error('[R2Adapter] Failed to load album index:', error);
      return undefined;
    }
  }

  /**
   * Save the album index to R2
   */
  private async saveAlbumIndex(index: R2AlbumIndex): Promise<void> {
    const indexKey = this.keys.albumIndex();
    await this.uploadMetadata(indexKey, index);
    console.log(`[R2Adapter] Saved album index (version ${index.version}, ${Object.keys(index.albums).length} albums)`);
  }

  /**
   * Update a single album in the index
   * If index doesn't exist, this will create it with just this album
   */
  private async updateAlbumInIndex(albumMetadata: R2AlbumMetadata): Promise<void> {
    try {
      let index = await this.loadAlbumIndex();

      if (!index) {
        // Index doesn't exist - create a new one
        index = {
          albums: {},
          version: 1,
          lastUpdated: new Date().toISOString(),
        };
      }

      // Update the album in the index
      index.albums[albumMetadata.id] = albumMetadata;
      index.lastUpdated = new Date().toISOString();

      await this.saveAlbumIndex(index);
    } catch (error) {
      console.error('[R2Adapter] Failed to update album in index:', error);
      // Don't throw - index update failure shouldn't break the operation
    }
  }

  /**
   * Remove an album from the index
   */
  private async removeAlbumFromIndex(albumId: string): Promise<void> {
    try {
      const index = await this.loadAlbumIndex();

      if (!index) {
        console.warn('[R2Adapter] Cannot remove from index - index does not exist');
        return;
      }

      delete index.albums[albumId];
      index.lastUpdated = new Date().toISOString();

      await this.saveAlbumIndex(index);
    } catch (error) {
      console.error('[R2Adapter] Failed to remove album from index:', error);
      // Don't throw - index update failure shouldn't break the operation
    }
  }

  /**
   * Rebuild the entire album index by scanning all album folders
   * Use this for:
   * - Initial setup (first time using R2)
   * - Recovery after index corruption
   * - Migration from old system
   */
  async rebuildAlbumIndex(): Promise<{ albumCount: number; errors: string[] }> {
    this.ensureAuthenticated();

    console.log('[R2Adapter] Starting album index rebuild...');

    try {
      // List all album folders
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: 'albums/',
        Delimiter: '/',
      });

      const response = await this.client.send(command);
      const albumPrefixes = response.CommonPrefixes || [];

      const index: R2AlbumIndex = {
        albums: {},
        version: 1,
        lastUpdated: new Date().toISOString(),
      };

      const errors: string[] = [];

      // Load metadata for each album
      for (const prefix of albumPrefixes) {
        if (!prefix.Prefix) continue;

        const albumIdMatch = prefix.Prefix.match(/^albums\/([^/]+)\/$/);
        if (!albumIdMatch) continue;

        const albumId = albumIdMatch[1];

        try {
          const metadataKey = this.keys.albumMetadata(albumId);
          const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);
          index.albums[albumId] = metadata;
        } catch (error: any) {
          const errorMsg = `Failed to load album ${albumId}: ${error.message}`;
          console.error(`[R2Adapter] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      // Save the rebuilt index
      await this.saveAlbumIndex(index);

      const albumCount = Object.keys(index.albums).length;
      console.log(`[R2Adapter] Index rebuild complete: ${albumCount} albums, ${errors.length} errors`);

      return { albumCount, errors };
    } catch (error: any) {
      console.error('[R2Adapter] Failed to rebuild album index:', error);
      throw new Error(`Failed to rebuild album index: ${error.message}`);
    }
  }

  // ============================================================================
  // Album Operations
  // ============================================================================

  /**
   * Resolve an Imgur album ID to the current R2 album ID
   * This allows legacy bookmarks like ?shortcode or /a/shortcode to still work
   */
  async resolveImgurId(imgurId: string): Promise<string | null> {
    this.ensureAuthenticated();

    try {
      // List all album metadata files
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: 'albums/',
        Delimiter: '/',
      });

      const response = await this.client.send(command);
      const albumPrefixes = response.CommonPrefixes || [];

      // Search through all albums for one with matching imgurId
      for (const prefix of albumPrefixes) {
        if (!prefix.Prefix) continue;

        const albumIdMatch = prefix.Prefix.match(/^albums\/([^/]+)\/$/);
        if (!albumIdMatch) continue;

        const albumId = albumIdMatch[1];

        try {
          const metadataKey = this.keys.albumMetadata(albumId);
          const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

          if (metadata.imgurId === imgurId) {
            console.log(`[R2Adapter] Resolved Imgur ID "${imgurId}" to album "${albumId}"`);
            return albumId;
          }
        } catch (error) {
          // Skip albums we can't read
          continue;
        }
      }

      console.log(`[R2Adapter] No album found with Imgur ID "${imgurId}"`);
      return null;
    } catch (error) {
      console.error(`Failed to resolve Imgur ID "${imgurId}":`, error);
      return null;
    }
  }

  async listAlbums(page?: number): Promise<Album[]> {
    this.ensureAuthenticated();

    try {
      // Try to load from index first (1 request instead of 170+)
      const index = await this.loadAlbumIndex();

      if (index) {
        console.log(`[R2Adapter] Using album index for listAlbums (${Object.keys(index.albums).length} albums)`);

        // Convert index metadata to Album objects
        const albums: Album[] = Object.values(index.albums).map(metadata =>
          this.albumMetadataToAlbum(metadata, metadata.coverImageUrl)
        );

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

      // Fallback: Index doesn't exist - scan folders (legacy mode)
      console.log('[R2Adapter] Index not found - falling back to folder scanning (will be slow)');
      console.log('[R2Adapter] Run rebuildAlbumIndex() to create index for faster loading');

      // List all album metadata files in shared pool
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: 'albums/',
        Delimiter: '/',
      });

      const response = await this.client.send(command);
      const albums: Album[] = [];

      // Get list of album IDs from common prefixes (folders)
      const albumPrefixes = response.CommonPrefixes || [];

      // Determine if we should load cover URLs
      // Skip cover URLs when loading ALL albums (no pagination) for performance
      // Load cover URLs only when paginating (smaller subset)
      const shouldLoadCoverUrls = page !== undefined;

      for (const prefix of albumPrefixes) {
        if (!prefix.Prefix) continue;

        // Extract album ID from prefix: "albums/{albumId}/"
        const albumIdMatch = prefix.Prefix.match(/^albums\/([^/]+)\/$/);
        if (!albumIdMatch) continue;

        const albumId = albumIdMatch[1];

        try {
          // Load album metadata
          const metadataKey = this.keys.albumMetadata(albumId);
          const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

          // Only load cover URLs if paginating (performance optimization)
          let coverImageUrl: string | undefined;

          if (shouldLoadCoverUrls) {
            // Use stored cover URL if available, otherwise generate it (legacy albums)
            coverImageUrl = metadata.coverImageUrl;

            if (!coverImageUrl && metadata.coverImageId) {
              // Legacy album without pre-computed cover URL - generate it
              const coverMetadataKey = this.keys.imageMetadata(metadata.coverImageId);
              try {
                const coverMetadata = await this.downloadMetadata<R2ImageMetadata>(coverMetadataKey);
                const coverExt = this.getExtension('', coverMetadata.mimeType);
                const coverKey = this.keys.albumImage(albumId, metadata.coverImageId, coverExt);
                coverImageUrl = await this.getPresignedUrl(coverKey);
              } catch (error) {
                console.warn(`[R2Adapter] Failed to get cover image for album ${albumId}:`, error);
              }
            }
          }

          albums.push(this.albumMetadataToAlbum(metadata, coverImageUrl));
        } catch (error) {
          console.error(`Failed to load album ${albumId}:`, error);
          // Continue with other albums
        }
      }

      // Sort by creation date (newest first)
      albums.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Apply pagination if requested
      if (page !== undefined) {
        const pageSize = 50;
        const start = page * pageSize;
        return albums.slice(start, start + pageSize);
      }

      return albums;
    } catch (error) {
      console.error('Failed to list albums:', error);
      throw new Error('Failed to list albums from R2');
    }
  }

  async getAlbum(id: string, options?: { imageLimit?: number; imageOffset?: number }): Promise<AlbumDetail> {
    this.ensureAuthenticated();

    try {
      // Load album metadata
      const metadataKey = this.keys.albumMetadata(id);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      // Determine which images to load based on options
      const offset = options?.imageOffset ?? 0;
      const limit = options?.imageLimit;
      const imageIdsToLoad = limit !== undefined
        ? metadata.imageIds.slice(offset, offset + limit)
        : metadata.imageIds.slice(offset);

      console.log(`[R2Adapter] Loading album ${id}: ${imageIdsToLoad.length} images (offset: ${offset}, total: ${metadata.imageIds.length})`);

      // Load images in parallel using Promise.all
      const imagePromises = imageIdsToLoad.map(async (imageId) => {
        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);
          const imageMetadata = await this.downloadMetadata<R2ImageMetadata>(imageMetadataKey);
          const image = await this.imageMetadataToImage(imageId, imageMetadata);
          return image;
        } catch (error) {
          console.error(`Failed to load image ${imageId}:`, error);
          return null; // Return null for failed images
        }
      });

      // Wait for all images to load in parallel
      const imageResults = await Promise.all(imagePromises);

      // Filter out any null results (failed images)
      const images = imageResults.filter((img): img is Image => img !== null);

      // Get cover image URL
      let coverImageUrl: string | undefined;
      if (metadata.coverImageId) {
        const coverImage = images.find(img => img.id === metadata.coverImageId);
        coverImageUrl = coverImage?.url;
      }

      const album = this.albumMetadataToAlbum(metadata, coverImageUrl);

      return {
        ...album,
        images,
      };
    } catch (error: any) {
      console.error(`Failed to get album ${id}:`, error);
      throw new Error(`Album not found: ${id}`);
    }
  }

  async createAlbum(data: CreateAlbumRequest): Promise<Album> {
    this.ensureAuthenticated();

    // Determine album ID: use custom ID if provided, otherwise generate one
    let albumId: string;
    if (data.customId) {
      // Validate custom ID format
      this.validateCustomId(data.customId);

      // Check if custom ID already exists
      const exists = await this.albumExists(data.customId);
      if (exists) {
        throw new Error('Album ID already exists. Please choose a different ID.');
      }

      albumId = data.customId;
    } else {
      albumId = this.generateId('album');
    }

    const now = new Date().toISOString();

    // Pre-compute cover image URL if cover ID is provided
    let coverImageUrl: string | undefined;
    if (data.coverId) {
      try {
        const coverMetadataKey = this.keys.imageMetadata(data.coverId);
        const coverMetadata = await this.downloadMetadata<R2ImageMetadata>(coverMetadataKey);
        const coverExt = this.getExtension('', coverMetadata.mimeType);
        const coverKey = this.keys.albumImage(albumId, data.coverId, coverExt);
        coverImageUrl = await this.getPresignedUrl(coverKey);
      } catch (error) {
        console.warn(`[R2Adapter] Failed to pre-compute cover URL for album ${albumId}:`, error);
      }
    }

    const metadata: R2AlbumMetadata = {
      id: albumId,
      title: data.title || 'Untitled Album',
      description: data.description,
      privacy: data.privacy || 'private',
      createdAt: now,
      updatedAt: now,
      coverImageId: data.coverId,
      coverImageUrl,
      imageIds: [],
      imageCount: 0,
    };

    // Upload album metadata
    const metadataKey = this.keys.albumMetadata(albumId);
    await this.uploadMetadata(metadataKey, metadata);

    // Update the index with the new album
    await this.updateAlbumInIndex(metadata);

    return this.albumMetadataToAlbum(metadata, coverImageUrl);
  }

  async updateAlbum(id: string, updates: UpdateAlbumRequest): Promise<Album> {
    this.ensureAuthenticated();

    try {
      // Load existing metadata
      const metadataKey = this.keys.albumMetadata(id);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      // Check if cover image changed
      const coverImageChanged = updates.coverId !== undefined && updates.coverId !== metadata.coverImageId;

      // Pre-compute cover image URL if cover changed
      let coverImageUrl: string | undefined = metadata.coverImageUrl;
      const finalCoverId = updates.coverId !== undefined ? updates.coverId : metadata.coverImageId;

      if (coverImageChanged && finalCoverId) {
        try {
          const coverMetadataKey = this.keys.imageMetadata(finalCoverId);
          const coverMetadata = await this.downloadMetadata<R2ImageMetadata>(coverMetadataKey);
          const coverExt = this.getExtension('', coverMetadata.mimeType);
          const coverKey = this.keys.albumImage(id, finalCoverId, coverExt);
          coverImageUrl = await this.getPresignedUrl(coverKey);
        } catch (error) {
          console.warn(`[R2Adapter] Failed to pre-compute cover URL for album ${id}:`, error);
          coverImageUrl = undefined;
        }
      } else if (coverImageChanged && !finalCoverId) {
        // Cover was removed
        coverImageUrl = undefined;
      }

      // Apply updates
      const updatedMetadata: R2AlbumMetadata = {
        ...metadata,
        title: updates.title !== undefined ? updates.title : metadata.title,
        description: updates.description !== undefined ? updates.description : metadata.description,
        privacy: updates.privacy !== undefined ? updates.privacy : metadata.privacy,
        coverImageId: finalCoverId,
        coverImageUrl,
        date: updates.date !== undefined ? (updates.date ? updates.date.toISOString() : undefined) : metadata.date,
        updatedAt: new Date().toISOString(),
      };

      // Upload updated metadata
      await this.uploadMetadata(metadataKey, updatedMetadata);

      // Update the index with the updated album
      await this.updateAlbumInIndex(updatedMetadata);

      return this.albumMetadataToAlbum(updatedMetadata, coverImageUrl);
    } catch (error) {
      console.error(`Failed to update album ${id}:`, error);
      throw new Error(`Failed to update album: ${id}`);
    }
  }

  async deleteAlbum(id: string): Promise<boolean> {
    this.ensureAuthenticated();

    try {
      // Load album metadata to get list of images
      const metadataKey = this.keys.albumMetadata(id);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      // Delete all objects in the album folder
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: `albums/${id}/`,
      });

      const listResponse = await this.client.send(listCommand);
      const objects = listResponse.Contents || [];

      if (objects.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: objects.map(obj => ({ Key: obj.Key! })),
          },
        });
        await this.client.send(deleteCommand);
      }

      // Delete image metadata files
      for (const imageId of metadata.imageIds) {
        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);
          const deleteMetadataCommand = new DeleteObjectCommand({
            Bucket: this.config.bucketName,
            Key: imageMetadataKey,
          });
          await this.client.send(deleteMetadataCommand);
        } catch (error) {
          console.error(`Failed to delete image metadata ${imageId}:`, error);
          // Continue deleting other files
        }
      }

      // Remove the album from the index
      await this.removeAlbumFromIndex(id);

      return true;
    } catch (error) {
      console.error(`Failed to delete album ${id}:`, error);
      throw new Error(`Failed to delete album: ${id}`);
    }
  }

  async renameAlbum(oldId: string, newId: string, onProgress?: (status: string, percent: number) => void): Promise<Album> {
    this.ensureAuthenticated();

    // Validate the new ID format
    this.validateCustomId(newId);

    try {
      onProgress?.('Checking album...', 0);

      // Check if source album exists
      const oldMetadataKey = this.keys.albumMetadata(oldId);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(oldMetadataKey);

      // Check if target album ID already exists
      const targetExists = await this.albumExists(newId);
      if (targetExists) {
        throw new Error(`Album with ID "${newId}" already exists. Please choose a different ID.`);
      }

      onProgress?.('Listing files...', 5);

      // List all objects in the old album folder
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: `albums/${oldId}/`,
      });

      const listResponse = await this.client.send(listCommand);
      const objects = listResponse.Contents || [];

      console.log(`[R2Adapter] Renaming album "${oldId}" to "${newId}" - copying ${objects.length} objects`);

      // Copy all objects to new location with error tracking
      const copyErrors: string[] = [];
      const totalFiles = objects.length;

      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj.Key) continue;

        const percent = 10 + Math.floor((i / totalFiles) * 40); // 10-50%
        onProgress?.(`Copying files (${i + 1}/${totalFiles})...`, percent);

        const newKey = obj.Key.replace(`albums/${oldId}/`, `albums/${newId}/`);

        try {
          const copyCommand = new CopyObjectCommand({
            Bucket: this.config.bucketName,
            CopySource: `${this.config.bucketName}/${obj.Key}`,
            Key: newKey,
          });

          await this.client.send(copyCommand);
          console.log(`[R2Adapter] Copied ${obj.Key} to ${newKey}`);
        } catch (error: any) {
          const errorMsg = `Failed to copy ${obj.Key}: ${error.message}`;
          console.error(`[R2Adapter] ${errorMsg}`);
          copyErrors.push(errorMsg);
        }
      }

      // If any copies failed, abort the operation
      if (copyErrors.length > 0) {
        throw new Error(`Failed to copy ${copyErrors.length} file(s) during rename:\n${copyErrors.join('\n')}`);
      }

      onProgress?.('Updating album metadata...', 50);

      // Update and save album metadata with new ID
      const newMetadata: R2AlbumMetadata = {
        ...metadata,
        id: newId,
        updatedAt: new Date().toISOString(),
      };

      const newMetadataKey = this.keys.albumMetadata(newId);
      await this.uploadMetadata(newMetadataKey, newMetadata);

      // Update all image metadata files to reference the new album ID
      console.log(`[R2Adapter] Updating image metadata for ${metadata.imageIds.length} images...`);
      const metadataUpdateErrors: string[] = [];
      const totalImages = metadata.imageIds.length;

      for (let i = 0; i < metadata.imageIds.length; i++) {
        const imageId = metadata.imageIds[i];
        const percent = 55 + Math.floor((i / totalImages) * 30); // 55-85%
        onProgress?.(`Updating metadata (${i + 1}/${totalImages})...`, percent);

        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);

          // Try to load existing metadata, but don't fail if it doesn't exist
          let imageMetadata: R2ImageMetadata;
          try {
            imageMetadata = await this.downloadMetadata<R2ImageMetadata>(imageMetadataKey);
            const oldAlbumId = imageMetadata.albumId;
            console.log(`[R2Adapter] Updating image metadata for ${imageId}: "${oldAlbumId}" → "${newId}"`);
          } catch (downloadError) {
            // Metadata doesn't exist - this shouldn't happen in a rename, but handle it
            console.warn(`[R2Adapter] Image metadata not found for ${imageId}, this indicates a corrupted album. Skipping update.`);
            metadataUpdateErrors.push(`Metadata file missing for ${imageId}`);
            continue;
          }

          // Update the albumId to the new album ID
          imageMetadata.albumId = newId;
          await this.uploadMetadata(imageMetadataKey, imageMetadata);

          console.log(`[R2Adapter] ✓ Updated metadata for ${imageId}`);
        } catch (error: any) {
          const errorMsg = `Failed to update image metadata for ${imageId}: ${error.message}`;
          console.error(`[R2Adapter] ${errorMsg}`);
          metadataUpdateErrors.push(errorMsg);
        }
      }

      // CRITICAL: If metadata updates failed, abort before deleting old album
      if (metadataUpdateErrors.length > 0) {
        const errorMessage = `${metadataUpdateErrors.length} image metadata files could not be updated. Album rename aborted to prevent data loss. Missing metadata: ${metadataUpdateErrors.join(', ')}`;
        console.error(`[R2Adapter] ${errorMessage}`);
        throw new Error(errorMessage);
      }

      onProgress?.('Verifying changes...', 85);

      // Verify the new album was created successfully by trying to read it
      try {
        await this.downloadMetadata<R2AlbumMetadata>(newMetadataKey);
        console.log(`[R2Adapter] Successfully verified new album metadata at ${newMetadataKey}`);
      } catch (error: any) {
        throw new Error(`Failed to verify new album after rename. The new album may not have been created properly: ${error.message}`);
      }

      onProgress?.('Cleaning up old files...', 90);

      // Only delete the old album folder after confirming the new one exists
      // IMPORTANT: Don't use deleteAlbum() because it deletes image metadata files,
      // which we just updated to reference the new album ID
      console.log(`[R2Adapter] Deleting old album folder "${oldId}"`);
      const deleteListCommand = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: `albums/${oldId}/`,
      });

      console.log(`[R2Adapter] Listing objects to delete with prefix: albums/${oldId}/`);
      const deleteListResponse = await this.client.send(deleteListCommand);
      const objectsToDelete = deleteListResponse.Contents || [];

      console.log(`[R2Adapter] Found ${objectsToDelete.length} objects to delete from old album folder`);
      if (objectsToDelete.length > 0) {
        console.log(`[R2Adapter] Objects to delete:`, objectsToDelete.map(obj => obj.Key));

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: objectsToDelete.map(obj => ({ Key: obj.Key! })),
          },
        });

        const deleteResult = await this.client.send(deleteCommand);
        console.log(`[R2Adapter] Delete result:`, deleteResult);
        console.log(`[R2Adapter] Deleted ${objectsToDelete.length} objects from old album folder`);

        // Check for errors in deletion
        if (deleteResult.Errors && deleteResult.Errors.length > 0) {
          console.error(`[R2Adapter] Some objects failed to delete:`, deleteResult.Errors);
        }
      } else {
        console.warn(`[R2Adapter] No objects found to delete in albums/${oldId}/ - this may indicate the old album was already deleted or the prefix is incorrect`);
      }

      onProgress?.('Updating index...', 95);

      // Update the index: remove old ID and add new ID
      await this.removeAlbumFromIndex(oldId);
      await this.updateAlbumInIndex(newMetadata);

      onProgress?.('Complete!', 100);
      console.log(`[R2Adapter] Successfully renamed album from "${oldId}" to "${newId}"`);

      return this.albumMetadataToAlbum(newMetadata);
    } catch (error: any) {
      console.error(`[R2Adapter] Failed to rename album from ${oldId} to ${newId}:`, error);

      // Provide more helpful error messages
      if (error.message?.includes('Metadata not found')) {
        throw new Error(`Album "${oldId}" not found. It may have already been renamed or deleted.`);
      }

      throw error;
    }
  }

  // ============================================================================
  // Image Operations
  // ============================================================================

  async listImages(page?: number): Promise<Image[]> {
    this.ensureAuthenticated();

    try {
      // List all image metadata files
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: 'metadata/images/',
      });

      const response = await this.client.send(command);
      const images: Image[] = [];

      const objects = response.Contents || [];

      for (const obj of objects) {
        if (!obj.Key) continue;

        // Extract image ID from key: "metadata/images/{imageId}.json"
        const match = obj.Key.match(/^metadata\/images\/([^/]+)\.json$/);
        if (!match) continue;

        const imageId = match[1];

        try {
          const metadata = await this.downloadMetadata<R2ImageMetadata>(obj.Key);
          const image = await this.imageMetadataToImage(imageId, metadata);
          images.push(image);
        } catch (error) {
          console.error(`Failed to load image ${imageId}:`, error);
          // Continue with other images
        }
      }

      // Sort by creation date (newest first)
      images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      // Apply pagination if requested
      if (page !== undefined) {
        const pageSize = 50;
        const start = page * pageSize;
        return images.slice(start, start + pageSize);
      }

      return images;
    } catch (error) {
      console.error('Failed to list images:', error);
      throw new Error('Failed to list images from R2');
    }
  }

  async getImage(id: string): Promise<Image> {
    this.ensureAuthenticated();

    try {
      const metadataKey = this.keys.imageMetadata(id);
      const metadata = await this.downloadMetadata<R2ImageMetadata>(metadataKey);
      return await this.imageMetadataToImage(id, metadata);
    } catch (error) {
      console.error(`Failed to get image ${id}:`, error);
      throw new Error(`Image not found: ${id}`);
    }
  }

  async uploadImage(file: File, options?: UploadOptions): Promise<Image> {
    this.ensureAuthenticated();

    try {
      const imageId = this.generateId('img');
      const ext = this.getExtension(file.name, file.type);

      // Determine storage key based on whether it's in an album
      const key = options?.albumId
        ? this.keys.albumImage(options.albumId, imageId, ext)
        : this.keys.standaloneImage(imageId, ext);

      // Get image dimensions
      const dimensions = await this.getImageDimensions(file);

      // Convert File to ArrayBuffer for upload
      const fileBuffer = await file.arrayBuffer();

      // Upload image file to R2
      const uploadCommand = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: new Uint8Array(fileBuffer),
        ContentType: file.type,
      });
      await this.client.send(uploadCommand);

      // Create and upload image metadata
      const imageMetadata: R2ImageMetadata = {
        id: imageId,
        title: options?.title,
        description: options?.description,
        mimeType: file.type,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
        albumId: options?.albumId,
        animated: file.type === 'image/gif' || file.type === 'image/webp',
      };

      const metadataKey = this.keys.imageMetadata(imageId);
      await this.uploadMetadata(metadataKey, imageMetadata);

      // If uploading to an album, update album metadata
      if (options?.albumId) {
        await this.addImagesToAlbum(options.albumId, [imageId]);
      }

      return await this.imageMetadataToImage(imageId, imageMetadata);
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw new Error('Failed to upload image to R2');
    }
  }

  /**
   * Get image dimensions from file
   */
  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
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

  async updateImage(id: string, updates: UpdateImageRequest): Promise<Image> {
    this.ensureAuthenticated();

    try {
      // Load existing metadata
      const metadataKey = this.keys.imageMetadata(id);
      const metadata = await this.downloadMetadata<R2ImageMetadata>(metadataKey);

      // Apply updates
      const updatedMetadata: R2ImageMetadata = {
        ...metadata,
        title: updates.title !== undefined ? updates.title : metadata.title,
        description: updates.description !== undefined ? updates.description : metadata.description,
      };

      // Upload updated metadata
      await this.uploadMetadata(metadataKey, updatedMetadata);

      return await this.imageMetadataToImage(id, updatedMetadata);
    } catch (error) {
      console.error(`Failed to update image ${id}:`, error);
      throw new Error(`Failed to update image: ${id}`);
    }
  }

  async deleteImage(id: string): Promise<boolean> {
    this.ensureAuthenticated();

    try {
      // Load image metadata
      const metadataKey = this.keys.imageMetadata(id);
      const metadata = await this.downloadMetadata<R2ImageMetadata>(metadataKey);

      // Delete image file
      const ext = this.getExtension('', metadata.mimeType);
      const imageKey = metadata.albumId
        ? this.keys.albumImage(metadata.albumId, id, ext)
        : this.keys.standaloneImage(id, ext);

      const deleteImageCommand = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: imageKey,
      });
      await this.client.send(deleteImageCommand);

      // Delete metadata file
      const deleteMetadataCommand = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: metadataKey,
      });
      await this.client.send(deleteMetadataCommand);

      // If image was in an album, remove it from album metadata
      if (metadata.albumId) {
        await this.removeImagesFromAlbum(metadata.albumId, [id]);
      }

      return true;
    } catch (error) {
      console.error(`Failed to delete image ${id}:`, error);
      throw new Error(`Failed to delete image: ${id}`);
    }
  }

  // ============================================================================
  // Album-Image Relationship Operations
  // ============================================================================

  async addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    this.ensureAuthenticated();

    try {
      // Load album metadata
      const metadataKey = this.keys.albumMetadata(albumId);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      // Add new image IDs (avoid duplicates)
      const updatedImageIds = [...new Set([...metadata.imageIds, ...imageIds])];

      // Update album metadata
      const updatedMetadata: R2AlbumMetadata = {
        ...metadata,
        imageIds: updatedImageIds,
        imageCount: updatedImageIds.length,
        updatedAt: new Date().toISOString(),
      };

      await this.uploadMetadata(metadataKey, updatedMetadata);

      // Update each image's metadata to reference the album
      for (const imageId of imageIds) {
        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);
          const imageMetadata = await this.downloadMetadata<R2ImageMetadata>(imageMetadataKey);

          if (imageMetadata.albumId !== albumId) {
            imageMetadata.albumId = albumId;
            await this.uploadMetadata(imageMetadataKey, imageMetadata);

            // TODO: Move image file to album folder if it's in standalone location
          }
        } catch (error) {
          console.error(`Failed to update image ${imageId}:`, error);
          // Continue with other images
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to add images to album ${albumId}:`, error);
      throw new Error(`Failed to add images to album: ${albumId}`);
    }
  }

  async removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean> {
    this.ensureAuthenticated();

    try {
      // Load album metadata
      const metadataKey = this.keys.albumMetadata(albumId);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      // Remove image IDs
      const updatedImageIds = metadata.imageIds.filter(id => !imageIds.includes(id));

      // Update album metadata
      const updatedMetadata: R2AlbumMetadata = {
        ...metadata,
        imageIds: updatedImageIds,
        imageCount: updatedImageIds.length,
        updatedAt: new Date().toISOString(),
        // Clear cover if it was one of the removed images
        coverImageId: imageIds.includes(metadata.coverImageId || '')
          ? undefined
          : metadata.coverImageId,
      };

      await this.uploadMetadata(metadataKey, updatedMetadata);

      // Update each image's metadata to remove album reference
      for (const imageId of imageIds) {
        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);
          const imageMetadata = await this.downloadMetadata<R2ImageMetadata>(imageMetadataKey);

          if (imageMetadata.albumId === albumId) {
            imageMetadata.albumId = undefined;
            await this.uploadMetadata(imageMetadataKey, imageMetadata);

            // TODO: Move image file to standalone location if needed
          }
        } catch (error) {
          console.error(`Failed to update image ${imageId}:`, error);
          // Continue with other images
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to remove images from album ${albumId}:`, error);
      throw new Error(`Failed to remove images from album: ${albumId}`);
    }
  }

  // ============================================================================
  // Utility / Repair Operations
  // ============================================================================

  /**
   * Repair an album by scanning its folder and updating image metadata
   * Use this to fix albums where image metadata points to wrong album IDs
   */
  async repairAlbum(albumId: string): Promise<{ fixed: number; errors: string[] }> {
    this.ensureAuthenticated();

    console.log(`[R2Adapter] Starting repair for album "${albumId}"`);

    try {
      // Load album metadata to get the list of image IDs
      const metadataKey = this.keys.albumMetadata(albumId);
      const metadata = await this.downloadMetadata<R2AlbumMetadata>(metadataKey);

      console.log(`[R2Adapter] Found ${metadata.imageIds.length} images in album metadata`);

      let fixedCount = 0;
      const errors: string[] = [];

      // Update all image metadata to point to this album
      for (const imageId of metadata.imageIds) {
        try {
          const imageMetadataKey = this.keys.imageMetadata(imageId);
          const imageMetadata = await this.downloadMetadata<R2ImageMetadata>(imageMetadataKey);

          // Check if albumId is wrong or missing
          if (imageMetadata.albumId !== albumId) {
            const oldAlbumId = imageMetadata.albumId || '(none)';
            console.log(`[R2Adapter] Fixing ${imageId}: albumId "${oldAlbumId}" → "${albumId}"`);

            imageMetadata.albumId = albumId;
            await this.uploadMetadata(imageMetadataKey, imageMetadata);
            fixedCount++;
          } else {
            console.log(`[R2Adapter] ${imageId}: already correct`);
          }
        } catch (error: any) {
          const errorMsg = `Failed to fix ${imageId}: ${error.message}`;
          console.error(`[R2Adapter] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`[R2Adapter] Repair complete: fixed ${fixedCount} images, ${errors.length} errors`);

      return { fixed: fixedCount, errors };
    } catch (error: any) {
      console.error(`[R2Adapter] Failed to repair album ${albumId}:`, error);
      throw new Error(`Failed to repair album: ${error.message}`);
    }
  }

  // ============================================================================
  // Authentication Operations
  // ============================================================================

  isAuthenticated(): boolean {
    // R2 uses API keys, so authentication is always true if config is valid
    return !!(this.config.accessKeyId && this.config.secretAccessKey);
  }

  async authenticate(): Promise<AuthResult> {
    // R2 doesn't require OAuth flow - authentication is via API keys
    return {
      success: this.isAuthenticated(),
      message: this.isAuthenticated() ? 'Authenticated with R2 API keys' : 'R2 API keys not configured',
    };
  }

  async refreshToken(): Promise<void> {
    // R2 API keys don't expire, no refresh needed
    return;
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async getAccountInfo(): Promise<any> {
    // R2 doesn't have a direct account info endpoint
    // Return basic info based on configuration
    return {
      provider: 'r2',
      bucket: this.config.bucketName,
      endpoint: this.config.endpoint,
      authenticated: this.isAuthenticated(),
    };
  }
}
