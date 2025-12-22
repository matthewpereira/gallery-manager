/**
 * Service for downloading albums and images with metadata preservation
 */
import JSZip from 'jszip';
import type { StorageProvider } from './storage/StorageProvider';
import type { Image } from '../types/models';
import type {
  DownloadOptions,
  DownloadProgress,
  ExportManifest,
  AlbumManifestEntry,
  ImageManifestEntry,
} from '../types/download';

export class DownloadService {
  private static readonly EXPORT_VERSION = '1.0.0';
  private static readonly MAX_CONCURRENT_DOWNLOADS = 3;

  private storage: StorageProvider;

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  /**
   * Downloads albums as a ZIP file with organized folders and metadata
   */
  async downloadAlbums(options: DownloadOptions): Promise<void> {
    const {
      albumIds,
      includeMetadata = true,
      progressCallback,
    } = options;

    const updateProgress = (progress: Partial<DownloadProgress>) => {
      if (progressCallback) {
        const baseProgress: DownloadProgress = {
          stage: 'preparing',
          albumsProcessed: 0,
          totalAlbums: 0,
          imagesProcessed: 0,
          totalImages: 0,
          percentage: 0,
          ...progress,
        };
        progressCallback(baseProgress);
      }
    };

    try {
      updateProgress({ stage: 'preparing', percentage: 0 });

      // Fetch all albums if no specific IDs provided
      const allAlbums = await this.storage.listAlbums();
      const albumsToDownload = albumIds
        ? allAlbums.filter(album => albumIds.includes(album.id))
        : allAlbums;

      if (albumsToDownload.length === 0) {
        throw new Error('No albums found to download');
      }

      updateProgress({
        totalAlbums: albumsToDownload.length,
        percentage: 5,
      });

      // Create ZIP structure
      const zip = new JSZip();
      const manifest: ExportManifest = {
        exportDate: new Date().toISOString(),
        exportVersion: DownloadService.EXPORT_VERSION,
        totalAlbums: albumsToDownload.length,
        totalImages: 0,
        albums: [],
      };

      let totalImagesProcessed = 0;
      let totalImagesCount = 0;

      // First pass: count total images
      for (const album of albumsToDownload) {
        totalImagesCount += album.imageCount;
      }

      updateProgress({
        stage: 'downloading',
        totalImages: totalImagesCount,
        percentage: 10,
      });

      // Process each album
      for (let albumIndex = 0; albumIndex < albumsToDownload.length; albumIndex++) {
        const album = albumsToDownload[albumIndex];

        updateProgress({
          currentAlbum: album.title,
          albumsProcessed: albumIndex,
          percentage: 10 + (albumIndex / albumsToDownload.length) * 70,
        });

        // Fetch full album details with images
        const albumWithImages = await this.storage.getAlbum(album.id);
        const images = albumWithImages.images || [];

        // Create album folder
        const folderName = this.sanitizeFolderName(album.title || `Album ${album.id}`);
        const albumFolder = zip.folder(`albums/${folderName}`);

        if (!albumFolder) {
          throw new Error(`Failed to create folder for album: ${folderName}`);
        }

        // Prepare album manifest entry
        const albumManifest: AlbumManifestEntry = {
          id: album.id,
          title: album.title,
          description: album.description,
          privacy: album.privacy,
          imageCount: album.imageCount,
          createdAt: album.createdAt.toISOString(),
          views: album.views,
          folderName,
          coverImageUrl: album.coverImageUrl,
          images: [],
          metadata: album.metadata, // Preserve provider-specific metadata
        };

        // Determine cover image ID if available
        if (album.coverImageUrl && images.length > 0) {
          // Try to find the cover image by matching URL
          const coverImage = images.find(img => album.coverImageUrl?.includes(img.id));
          if (coverImage) {
            albumManifest.coverImageId = coverImage.id;
          }
        }

        // Download images in batches
        const imageBatches = this.chunkArray(images, DownloadService.MAX_CONCURRENT_DOWNLOADS);

        for (const batch of imageBatches) {
          await Promise.all(
            batch.map(async (image) => {
              const imageFilename = this.generateImageFilename(
                album.title || `Album ${album.id}`,
                image,
                images.indexOf(image)
              );

              updateProgress({
                currentImage: imageFilename,
                imagesProcessed: totalImagesProcessed,
              });

              try {
                // Download image data
                const imageBlob = await this.downloadImage(image.url);
                albumFolder.file(imageFilename, imageBlob);

                // Add to album manifest
                const imageIndex = images.indexOf(image);
                const imageManifest: ImageManifestEntry = {
                  id: image.id,
                  filename: imageFilename,
                  originalUrl: image.url,
                  thumbnailUrl: image.thumbnailUrl,
                  title: image.title,
                  description: image.description,
                  size: image.size,
                  mimeType: image.mimeType,
                  width: image.width,
                  height: image.height,
                  createdAt: image.createdAt.toISOString(),
                  views: image.views,
                  animated: image.animated,
                  orderIndex: imageIndex, // Preserve order within album
                  originalFilename: image.metadata?.name, // Original filename from Imgur
                  metadata: image.metadata, // Preserve all provider-specific metadata
                };

                albumManifest.images.push(imageManifest);
                totalImagesProcessed++;
              } catch (error) {
                console.error(`Failed to download image ${image.id}:`, error);
                // Continue with other images even if one fails
              }
            })
          );
        }

        // Add album-specific metadata file if requested
        if (includeMetadata) {
          const albumMetadata = {
            ...albumManifest,
            images: albumManifest.images.map(img => ({
              ...img,
              // Keep URLs for reference
            })),
          };
          albumFolder.file(
            'album-metadata.json',
            JSON.stringify(albumMetadata, null, 2)
          );
        }

        manifest.albums.push(albumManifest);
        manifest.totalImages += albumManifest.images.length;
      }

      // Add master manifest
      updateProgress({
        stage: 'packaging',
        percentage: 85,
        currentAlbum: undefined,
        currentImage: undefined,
      });

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add README with instructions
      const readme = this.generateReadme(manifest);
      zip.file('README.txt', readme);

      // Generate and download ZIP
      updateProgress({
        stage: 'packaging',
        percentage: 90,
      });

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // Trigger download
      const downloadFilename = albumIds && albumIds.length === 1
        ? `${this.sanitizeFilename(albumsToDownload[0].title || 'album')}.zip`
        : `imgur-export-${new Date().toISOString().split('T')[0]}.zip`;

      this.triggerDownload(blob, downloadFilename);

      updateProgress({
        stage: 'complete',
        percentage: 100,
        albumsProcessed: albumsToDownload.length,
        imagesProcessed: totalImagesProcessed,
      });
    } catch (error) {
      updateProgress({
        stage: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      throw error;
    }
  }

  /**
   * Downloads a single image from URL
   */
  private async downloadImage(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    return response.blob();
  }

  /**
   * Generates a safe filename for an image
   */
  private generateImageFilename(albumTitle: string, image: Image, index: number): string {
    const sanitizedAlbum = this.sanitizeFilename(albumTitle);
    const imageTitle = image.title
      ? this.sanitizeFilename(image.title)
      : `Image ${String(index + 1).padStart(3, '0')}`;

    const extension = this.getExtensionFromMimeType(image.mimeType);
    return `${sanitizedAlbum} - ${imageTitle}${extension}`;
  }

  /**
   * Sanitizes a string for use as a folder name
   */
  private sanitizeFolderName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') // Replace invalid chars
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 200); // Limit length
  }

  /**
   * Sanitizes a string for use as a filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/\.+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 150);
  }

  /**
   * Gets file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/tiff': '.tiff',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    };
    return mimeMap[mimeType.toLowerCase()] || '.jpg';
  }

  /**
   * Splits array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Triggers browser download of blob
   */
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates a README file with export information
   */
  private generateReadme(manifest: ExportManifest): string {
    return `Imgur Gallery Export
=====================

Export Date: ${new Date(manifest.exportDate).toLocaleString()}
Export Version: ${manifest.exportVersion}
Total Albums: ${manifest.totalAlbums}
Total Images: ${manifest.totalImages}

Contents
--------

This archive contains your Imgur albums organized into folders with preserved metadata.

Structure:
  manifest.json          - Complete catalog with all metadata and original URLs
  README.txt             - This file
  albums/
    [Album Name]/
      album-metadata.json  - Album-specific metadata
      [Album Name] - [Image Title].jpg  - Individual images

Manifest Format
---------------

The manifest.json file contains complete information for migration to other services:

ALBUM METADATA:
- id, title, description, privacy settings
- Creation date, view counts
- Cover image ID and URL
- Image count
- Provider-specific metadata (Imgur layout, favorites, NSFW flags, etc.)

IMAGE METADATA:
- id, title, description
- Dimensions (width, height), file size, MIME type
- Original Imgur URLs (full size and thumbnail)
- Creation date, view counts, animated flag
- Order index (position within album) - CRITICAL for preserving your organization
- Original filename (when uploaded to Imgur)
- Provider-specific metadata (deletehash, tags, bandwidth, etc.)

Migration to Other Services
---------------------------

This export is designed to be service-agnostic. You can use it to migrate to:
- Amazon S3 + CloudFront
- Google Cloud Storage
- Cloudflare R2
- Self-hosted solutions
- Any image hosting service

The manifest provides everything needed:
1. All images are downloaded as actual files
2. Order within albums is preserved (orderIndex field)
3. Cover images are identified (coverImageId field)
4. All metadata can be imported to new service
5. Original URLs preserved for reference/verification

Migration Script Example:
- Read manifest.json to get album structure
- For each album, create album/collection in new service
- Upload images in orderIndex order
- Set titles, descriptions from manifest
- Set cover image using coverImageId
- Preserve privacy settings

Album Metadata Files
-------------------

Each album folder contains an album-metadata.json file with:
- Complete album information
- Full list of images in that album with all metadata
- Useful for per-album processing or migration

Notes
-----

- Images are named: "[Album Name] - [Image Title].ext"
- Folder names are sanitized for filesystem compatibility
- All dates are in ISO 8601 format
- Original URLs are preserved for future reference
- Image order is preserved via orderIndex (0-based)
- Provider metadata includes Imgur-specific fields that may be useful
`;
  }
}
