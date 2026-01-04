/**
 * Rebuild Album Index Utility
 *
 * This script rebuilds the master album index (albums/index.json) from existing album folders.
 *
 * Run this script:
 * 1. After migrating from Imgur to R2
 * 2. If the index becomes corrupted
 * 3. To create the initial index for existing albums
 *
 * Usage:
 *   npm run rebuild-index
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { R2AlbumMetadata, R2AlbumIndex } from '../src/types/r2';

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

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_CONFIG.endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

async function main() {
  console.log('🔧 Album Index Rebuild Utility\n');

  try {
    console.log('📡 Connecting to R2...');
    console.log('🔄 Scanning albums and rebuilding index...\n');

    // List all album folders
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: 'albums/',
      Delimiter: '/',
    });

    const response = await s3Client.send(command);
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
        const metadataKey = `albums/${albumId}/metadata.json`;
        const getCommand = new GetObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: metadataKey,
        });
        const metadataResponse = await s3Client.send(getCommand);
        const metadataBody = await metadataResponse.Body?.transformToString();

        if (metadataBody) {
          const metadata: R2AlbumMetadata = JSON.parse(metadataBody);
          index.albums[albumId] = metadata;
          console.log(`  ✓ ${albumId} - "${metadata.title}" (${metadata.imageCount} images)`);
        }
      } catch (error: any) {
        const errorMsg = `Failed to load album ${albumId}: ${error.message}`;
        console.error(`  ✗ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Save the rebuilt index
    const putCommand = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: 'albums/index.json',
      Body: JSON.stringify(index, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    const albumCount = Object.keys(index.albums).length;
    console.log(`\n✅ Index rebuild complete!`);
    console.log(`📊 Albums indexed: ${albumCount}`);

    if (errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${errors.length}`);
      errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    } else {
      console.log('✨ No errors - all albums indexed successfully');
    }

    console.log('\n💡 The album index will now be used for fast album loading.');
    console.log(`   Expected performance: 1 request instead of ${albumCount}+ requests`);
  } catch (error) {
    console.error('\n❌ Failed to rebuild index:', error);
    process.exit(1);
  }
}

main();
