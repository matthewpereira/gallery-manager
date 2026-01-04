#!/usr/bin/env tsx
/**
 * Migration Script: Imgur Archive to Cloudflare R2
 *
 * This script migrates backed-up Imgur albums to Cloudflare R2 storage.
 * It preserves album structure, metadata, image order, and captions.
 *
 * Usage:
 *   npm run migrate:r2 <album-folder-name>
 *   npm run migrate:r2 0GS1Fkt-gatwick-airport-selfies
 *
 * Or migrate all albums:
 *   npm run migrate:r2 --all
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';

// Configuration from environment variables
const R2_CONFIG = {
  bucketName: process.env.VITE_R2_BUCKET_NAME || '',
  accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY || '',
  endpoint: process.env.VITE_R2_ENDPOINT || '',
};

// Validate configuration
if (!R2_CONFIG.bucketName || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.endpoint) {
  console.error('❌ Error: R2 configuration is incomplete. Check your .env file.');
  process.exit(1);
}

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_CONFIG.endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

// Archive directory
const ARCHIVE_DIR = '/Users/matthew/Developer/imgur-archive/albums';

/**
 * Imgur backup metadata types
 */
interface ImgurBackupImage {
  position: number;
  image_id: string;
  title: string | null;
  description: string | null;
  type: string;
  width: number;
  height: number;
  size: number;
  link: string;
  datetime: number;
  is_private: boolean;
}

interface ImgurBackupAlbum {
  album_id: string;
  album_name: string;
  title: string;
  description: string;
  datetime: number;
  views: number;
  images_count: number;
  cover_image_id: string;
  privacy: string;
  layout: string;
  images: ImgurBackupImage[];
}

/**
 * R2 metadata types (matching our R2Adapter structure)
 */
interface R2AlbumMetadata {
  id: string;
  title: string;
  description?: string;
  privacy: 'public' | 'private' | 'unlisted';
  createdAt: string;
  updatedAt: string;
  coverImageId?: string;
  imageIds: string[];
  imageCount: number;
}

interface R2ImageMetadata {
  id: string;
  title?: string;
  description?: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
  albumId?: string;
  animated?: boolean;
}

/**
 * Generate a unique ID for R2
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Map Imgur privacy to R2 privacy
 */
function mapPrivacy(imgurPrivacy: string): 'public' | 'private' | 'unlisted' {
  if (imgurPrivacy === 'public') return 'public';
  if (imgurPrivacy === 'hidden') return 'unlisted';
  return 'private';
}

/**
 * Upload a file to R2
 */
async function uploadToR2(key: string, filePath: string, contentType: string): Promise<void> {
  const fileContent = await fs.readFile(filePath);

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    Body: fileContent,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

/**
 * Upload JSON metadata to R2
 */
async function uploadMetadata(key: string, data: any): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
}

/**
 * Update the album index with a newly migrated album
 */
async function updateAlbumIndex(albumMetadata: R2AlbumMetadata): Promise<void> {
  const indexKey = 'albums/index.json';

  try {
    // Try to load existing index
    let index: any;
    try {
      const getCommand = new GetObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: indexKey,
      });
      const response = await s3Client.send(getCommand);
      const body = await response.Body?.transformToString();
      index = body ? JSON.parse(body) : { albums: {}, version: 1, lastUpdated: new Date().toISOString() };
    } catch (error: any) {
      // Index doesn't exist yet, create new one
      if (error.name === 'NoSuchKey') {
        index = {
          albums: {},
          version: 1,
          lastUpdated: new Date().toISOString(),
        };
      } else {
        throw error;
      }
    }

    // Update the album in the index
    index.albums[albumMetadata.id] = albumMetadata;
    index.lastUpdated = new Date().toISOString();

    // Save the updated index
    await uploadMetadata(indexKey, index);
  } catch (error) {
    console.error(`   ⚠️  Warning: Failed to update album index:`, error);
    console.error(`   💡 You can rebuild the index later with: npm run rebuild-index`);
    // Don't throw - index update failure shouldn't break the migration
  }
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1] : 'jpg';
}

/**
 * Find an album by its original Imgur ID
 * @param imgurId - The original Imgur album ID
 * @returns The R2 album ID if found, null if not found
 */
async function findAlbumByImgurId(imgurId: string): Promise<string | null> {
  const { ListObjectsV2Command, GetObjectCommand } = await import('@aws-sdk/client-s3');

  const listCommand = new ListObjectsV2Command({
    Bucket: R2_CONFIG.bucketName,
    Prefix: 'albums/',
    Delimiter: '/',
  });

  const response = await s3Client.send(listCommand);
  const albumPrefixes = response.CommonPrefixes || [];

  for (const prefix of albumPrefixes) {
    if (!prefix.Prefix) continue;
    const albumIdMatch = prefix.Prefix.match(/^albums\/([^/]+)\/$/);
    if (!albumIdMatch) continue;
    const albumId = albumIdMatch[1];

    try {
      const metadataKey = `albums/${albumId}/metadata.json`;
      const command = new GetObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: metadataKey,
      });
      const response = await s3Client.send(command);
      const body = await response.Body?.transformToString();
      if (!body) continue;
      const metadata = JSON.parse(body) as R2AlbumMetadata;

      if (metadata.imgurId === imgurId) {
        return albumId;
      }
    } catch (error) {
      // Skip albums with missing or invalid metadata
      continue;
    }
  }

  return null;
}

/**
 * Migrate a single album to shared pool (no user isolation)
 * @param albumFolderName - The folder name in the archive directory
 * @param customAlbumId - Optional custom album ID (e.g., "vacation-2024")
 */
async function migrateAlbum(albumFolderName: string, customAlbumId?: string): Promise<void> {
  const albumPath = path.join(ARCHIVE_DIR, albumFolderName);

  console.log(`\n📁 Processing album: ${albumFolderName}`);

  // Read album metadata
  const metadataPath = path.join(albumPath, 'album_metadata.json');
  const metadataContent = await fs.readFile(metadataPath, 'utf-8');
  const imgurAlbum: ImgurBackupAlbum = JSON.parse(metadataContent);

  console.log(`   Title: ${imgurAlbum.title}`);
  console.log(`   Images: ${imgurAlbum.images_count}`);
  console.log(`   Privacy: ${imgurAlbum.privacy}`);
  console.log(`   Imgur ID: ${imgurAlbum.album_id}`);

  // Check if this album already exists (by Imgur ID)
  const existingAlbum = await findAlbumByImgurId(imgurAlbum.album_id);
  if (existingAlbum) {
    console.log(`   ⏭️  Album already migrated as "${existingAlbum}" - skipping`);
    return;
  }

  // Use custom album ID if provided, otherwise generate one
  const r2AlbumId = customAlbumId || generateId('album');
  console.log(`   🆔 Album ID: ${r2AlbumId}${customAlbumId ? ' (custom)' : ' (generated)'}`);

  // Process images
  const imageIds: string[] = [];
  let coverImageId: string | undefined;

  for (const imgurImage of imgurAlbum.images) {
    const r2ImageId = generateId('img');
    imageIds.push(r2ImageId);

    // Set cover image (first image if no cover specified)
    if (!coverImageId || imgurImage.image_id === imgurAlbum.cover_image_id) {
      coverImageId = r2ImageId;
    }

    // Find the image file in the backup
    const files = await fs.readdir(albumPath);
    const imageFile = files.find(f =>
      f.includes(imgurImage.image_id) &&
      !f.endsWith('.json') &&
      !f.endsWith('.txt')
    );

    if (!imageFile) {
      console.warn(`   ⚠️  Image file not found for ${imgurImage.image_id}, skipping...`);
      continue;
    }

    const imagePath = path.join(albumPath, imageFile);
    const ext = getExtension(imageFile);

    // Upload image to R2 shared pool
    const imageKey = `albums/${r2AlbumId}/images/${r2ImageId}.${ext}`;
    console.log(`   ⬆️  Uploading: ${imageFile} -> ${imageKey}`);
    await uploadToR2(imageKey, imagePath, imgurImage.type);

    // Create and upload image metadata
    const r2ImageMetadata: R2ImageMetadata = {
      id: r2ImageId,
      title: imgurImage.title || undefined,
      description: imgurImage.description || undefined,
      mimeType: imgurImage.type,
      size: imgurImage.size,
      width: imgurImage.width,
      height: imgurImage.height,
      createdAt: new Date(imgurImage.datetime * 1000).toISOString(),
      albumId: r2AlbumId,
      animated: imgurImage.type === 'image/gif' || imgurImage.type.includes('video'),
    };

    const imageMetadataKey = `metadata/images/${r2ImageId}.json`;
    await uploadMetadata(imageMetadataKey, r2ImageMetadata);
  }

  // Create and upload album metadata
  const r2AlbumMetadata: R2AlbumMetadata = {
    id: r2AlbumId,
    title: imgurAlbum.title || imgurAlbum.album_name,
    description: imgurAlbum.description || undefined,
    privacy: mapPrivacy(imgurAlbum.privacy),
    createdAt: new Date(imgurAlbum.datetime * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    imgurId: imgurAlbum.album_id, // Preserve original Imgur ID for legacy bookmarks
    coverImageId,
    imageIds,
    imageCount: imageIds.length,
  };

  const albumMetadataKey = `albums/${r2AlbumId}/metadata.json`;
  console.log(`   📝 Creating album metadata: ${albumMetadataKey}`);
  await uploadMetadata(albumMetadataKey, r2AlbumMetadata);

  // Update the album index
  console.log(`   📇 Updating album index...`);
  await updateAlbumIndex(r2AlbumMetadata);

  console.log(`   ✅ Album migrated successfully!`);
  console.log(`   📊 Stats: ${imageIds.length} images uploaded`);
  console.log(`   🆔 New R2 Album ID: ${r2AlbumId}`);
}

/**
 * Migrate all albums
 * @param skip - Number of albums to skip (for resuming migrations)
 * @param limit - Maximum number of albums to process (for batch processing)
 */
async function migrateAllAlbums(skip = 0, limit?: number): Promise<void> {
  const albumFolders = await fs.readdir(ARCHIVE_DIR);

  // Filter out hidden files and non-directories
  const validAlbums: string[] = [];
  for (const folder of albumFolders) {
    if (folder.startsWith('.')) continue;
    const folderPath = path.join(ARCHIVE_DIR, folder);
    const stat = await fs.stat(folderPath);
    if (stat.isDirectory()) {
      validAlbums.push(folder);
    }
  }

  console.log(`\n📦 Found ${validAlbums.length} albums in archive`);

  // Apply skip and limit
  const albumsToProcess = limit
    ? validAlbums.slice(skip, skip + limit)
    : validAlbums.slice(skip);

  if (skip > 0) {
    console.log(`   ⏭️  Skipping first ${skip} albums`);
  }
  if (limit) {
    console.log(`   🔢 Processing up to ${limit} albums`);
  }
  console.log(`   📝 Processing albums ${skip + 1} to ${skip + albumsToProcess.length} of ${validAlbums.length}\n`);

  let successful = 0;
  let failed = 0;

  for (let i = 0; i < albumsToProcess.length; i++) {
    const album = albumsToProcess[i];
    const globalIndex = skip + i + 1;

    console.log(`\n[${globalIndex}/${validAlbums.length}] Processing album ${i + 1}/${albumsToProcess.length}`);

    try {
      await migrateAlbum(album);
      successful++;
    } catch (error) {
      console.error(`   ❌ Error migrating ${album}:`, error);
      failed++;
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Processed: ${albumsToProcess.length}`);
  console.log(`   🔢 Total in archive: ${validAlbums.length}`);

  if (skip + albumsToProcess.length < validAlbums.length) {
    const remaining = validAlbums.length - (skip + albumsToProcess.length);
    console.log(`\n💡 To continue migration, run:`);
    console.log(`   npm run migrate:r2:all -- --skip=${skip + albumsToProcess.length}`);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  console.log('🚀 Imgur to R2 Migration Tool');
  console.log('================================\n');
  console.log(`📍 Archive Directory: ${ARCHIVE_DIR}`);
  console.log(`☁️  R2 Bucket: ${R2_CONFIG.bucketName}`);
  console.log(`📁 Albums stored in shared pool: albums/\n`);

  if (args.length === 0) {
    console.error('❌ Error: Please specify an album folder name or --all');
    console.error('\nUsage:');
    console.error('  npm run migrate:r2 <album-folder-name> [custom-album-id]');
    console.error('  npm run migrate:r2 0GS1Fkt-gatwick-airport-selfies');
    console.error('  npm run migrate:r2 0GS1Fkt-gatwick-airport-selfies gatwick-selfies');
    console.error('  npm run migrate:r2:all');
    console.error('  npm run migrate:r2:all -- --skip=100');
    console.error('  npm run migrate:r2:all -- --skip=100 --limit=50');
    console.error('\nOptions for --all:');
    console.error('  --skip=N    Skip first N albums (useful for resuming)');
    console.error('  --limit=N   Process at most N albums (useful for batching)');
    console.error('\nExamples:');
    console.error('  npm run migrate:r2 abc123-vacation vacation-2024');
    console.error('  npm run migrate:r2 def456-family-photos family');
    console.error('  npm run migrate:r2:all -- --skip=150         # Start from album 151');
    console.error('  npm run migrate:r2:all -- --limit=10         # Process first 10 albums');
    console.error('  npm run migrate:r2:all -- --skip=100 --limit=50  # Process albums 101-150');
    process.exit(1);
  }

  // Parse arguments
  let skip = 0;
  let limit: number | undefined;
  const nonFlagArgs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--skip=')) {
      skip = parseInt(arg.split('=')[1], 10);
      if (isNaN(skip) || skip < 0) {
        console.error('❌ Error: --skip must be a non-negative number');
        process.exit(1);
      }
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
      if (isNaN(limit) || limit <= 0) {
        console.error('❌ Error: --limit must be a positive number');
        process.exit(1);
      }
    } else {
      nonFlagArgs.push(arg);
    }
  }

  const albumName = nonFlagArgs[0];
  const customAlbumId = nonFlagArgs[1]; // Optional second argument for custom album ID

  try {
    if (albumName === '--all') {
      await migrateAllAlbums(skip, limit);
    } else {
      await migrateAlbum(albumName, customAlbumId);
    }

    console.log('\n✨ Migration completed!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
