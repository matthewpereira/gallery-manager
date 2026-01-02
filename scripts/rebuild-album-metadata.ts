/**
 * Rebuild Album Metadata Script
 *
 * This script scans an album folder, finds all images, and creates metadata files for them.
 * Use this when the image metadata files are missing but the images exist in R2.
 *
 * Usage:
 *   npm run rebuild-album <albumId>
 *
 * Example:
 *   npm run rebuild-album default
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

// Load environment variables from .env.development
const config = {
  bucketName: process.env.VITE_R2_BUCKET_NAME!,
  accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY!,
  endpoint: process.env.VITE_R2_ENDPOINT!,
};

// Validate configuration
if (!config.bucketName || !config.accessKeyId || !config.secretAccessKey || !config.endpoint) {
  console.error('❌ Missing R2 configuration in .env.development');
  console.error('Required variables: VITE_R2_BUCKET_NAME, VITE_R2_ACCESS_KEY_ID, VITE_R2_SECRET_ACCESS_KEY, VITE_R2_ENDPOINT');
  process.exit(1);
}

// Initialize S3 client for R2
const client = new S3Client({
  region: 'auto',
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

// Helper functions
const keys = {
  albumMetadata: (albumId: string) => `albums/${albumId}/metadata.json`,
  imageMetadata: (imageId: string) => `metadata/images/${imageId}.json`,
};

async function downloadMetadata<T>(key: string): Promise<T> {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  const response = await client.send(command);
  const body = await response.Body?.transformToString();
  if (!body) throw new Error('Empty metadata file');
  return JSON.parse(body) as T;
}

async function uploadMetadata(key: string, data: any): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });
  await client.send(command);
}

function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1] : 'jpg';
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return mimeTypes[ext.toLowerCase()] || 'image/jpeg';
}

async function rebuildAlbum(albumId: string) {
  console.log(`\nRebuilding metadata for album: ${albumId}`);
  console.log('='.repeat(50));

  try {
    // Load album metadata to get the list of image IDs
    const metadataKey = keys.albumMetadata(albumId);
    console.log(`Loading album metadata from: ${metadataKey}`);

    const albumMetadata: any = await downloadMetadata(metadataKey);
    console.log(`Found ${albumMetadata.imageIds.length} images in album metadata`);

    // List all actual image files in the album folder
    const listCommand = new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: `albums/${albumId}/images/`,
    });

    const listResponse = await client.send(listCommand);
    const imageFiles = listResponse.Contents || [];

    console.log(`Found ${imageFiles.length} actual image files in R2`);

    let createdCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Create metadata for each image file
    for (const file of imageFiles) {
      if (!file.Key) continue;

      // Extract image ID from key: "albums/{albumId}/images/{imageId}.{ext}"
      const match = file.Key.match(/\/images\/([^/]+)\.([^.]+)$/);
      if (!match) {
        console.log(`  ⚠️  Skipping ${file.Key} (couldn't parse filename)`);
        continue;
      }

      const [, imageId, ext] = match;
      const imageMetadataKey = keys.imageMetadata(imageId);

      try {
        // Check if metadata already exists
        try {
          await downloadMetadata(imageMetadataKey);
          console.log(`  ✓ ${imageId}: metadata already exists`);
          skippedCount++;
          continue;
        } catch {
          // Metadata doesn't exist, we'll create it
        }

        // Get file info
        const headCommand = new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: file.Key,
        });
        const headResponse = await client.send(headCommand);

        // Create image metadata
        const imageMetadata = {
          id: imageId,
          title: undefined,
          description: undefined,
          mimeType: getMimeType(ext),
          size: headResponse.ContentLength || 0,
          width: 0, // We can't determine this without downloading the image
          height: 0,
          createdAt: headResponse.LastModified?.toISOString() || new Date().toISOString(),
          albumId: albumId,
          animated: ext === 'gif' || ext === 'webp',
        };

        await uploadMetadata(imageMetadataKey, imageMetadata);
        console.log(`  ✓ Created metadata for ${imageId}`);
        createdCount++;
      } catch (error: any) {
        const errorMsg = `Failed to create metadata for ${imageId}: ${error.message}`;
        console.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('REBUILD COMPLETE');
    console.log('='.repeat(50));
    console.log(`✓ Created ${createdCount} metadata file(s)`);
    console.log(`⚠ Skipped ${skippedCount} (already exist)`);

    if (errors.length > 0) {
      console.log(`✗ ${errors.length} error(s):`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

    console.log('\nYou can now reload the album in the app.\n');
  } catch (error: any) {
    console.error('\n❌ Rebuild failed:', error.message);
    process.exit(1);
  }
}

// Get album ID from command line
const albumId = process.argv[2];

if (!albumId) {
  console.error('Usage: npm run rebuild-album <albumId>');
  console.error('Example: npm run rebuild-album default');
  process.exit(1);
}

rebuildAlbum(albumId);
