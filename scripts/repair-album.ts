/**
 * Repair Album Script
 *
 * This script repairs an album by updating all image metadata to reference
 * the correct album ID. Use this when images fail to load due to incorrect
 * albumId references in the metadata.
 *
 * Usage:
 *   npm run repair-album <albumId>
 *
 * Example:
 *   npm run repair-album default
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

async function repairAlbum(albumId: string) {
  console.log(`\nRepairing album: ${albumId}`);
  console.log('=' .repeat(50));

  try {
    // Load album metadata to get the list of image IDs
    const metadataKey = keys.albumMetadata(albumId);
    console.log(`Loading album metadata from: ${metadataKey}`);

    const metadata: any = await downloadMetadata(metadataKey);
    console.log(`Found ${metadata.imageIds.length} images in album metadata`);

    let fixedCount = 0;
    const errors: string[] = [];

    // Update all image metadata to point to this album
    for (const imageId of metadata.imageIds) {
      try {
        const imageMetadataKey = keys.imageMetadata(imageId);
        const imageMetadata: any = await downloadMetadata(imageMetadataKey);

        // Check if albumId is wrong or missing
        if (imageMetadata.albumId !== albumId) {
          const oldAlbumId = imageMetadata.albumId || '(none)';
          console.log(`  Fixing ${imageId}: albumId "${oldAlbumId}" → "${albumId}"`);

          imageMetadata.albumId = albumId;
          await uploadMetadata(imageMetadataKey, imageMetadata);
          fixedCount++;
        } else {
          console.log(`  ${imageId}: already correct`);
        }
      } catch (error: any) {
        const errorMsg = `Failed to fix ${imageId}: ${error.message}`;
        console.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('REPAIR COMPLETE');
    console.log('='.repeat(50));
    console.log(`✓ Fixed ${fixedCount} image(s)`);

    if (errors.length > 0) {
      console.log(`✗ ${errors.length} error(s):`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

    console.log('\nYou can now reload the album in the app.\n');
  } catch (error: any) {
    console.error('\n❌ Repair failed:', error.message);
    process.exit(1);
  }
}

// Get album ID from command line
const albumId = process.argv[2];

if (!albumId) {
  console.error('Usage: npm run repair-album <albumId>');
  console.error('Example: npm run repair-album default');
  process.exit(1);
}

repairAlbum(albumId);
