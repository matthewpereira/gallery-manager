/**
 * Detect Image Metadata Mismatches
 *
 * This script scans all albums and detects image metadata files
 * where the albumId doesn't match the album folder they're in.
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { R2AlbumMetadata, R2ImageMetadata } from '../src/types/r2';

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

async function getObject(key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || null;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') return null;
    throw error;
  }
}

async function main() {
  console.log('🔍 Detecting Image Metadata Mismatches\n');

  // 1. List all album folders
  console.log('📡 Scanning albums...');
  const listCommand = new ListObjectsV2Command({
    Bucket: R2_CONFIG.bucketName,
    Prefix: 'albums/',
    Delimiter: '/',
  });

  const response = await s3Client.send(listCommand);
  const albumPrefixes = response.CommonPrefixes || [];

  const albumIds: string[] = [];
  for (const prefix of albumPrefixes) {
    if (!prefix.Prefix) continue;
    const albumIdMatch = prefix.Prefix.match(/^albums\/([^/]+)\/$/);
    if (albumIdMatch) {
      albumIds.push(albumIdMatch[1]);
    }
  }

  console.log(`   Found ${albumIds.length} albums\n`);

  // 2. Check each album for mismatches
  const mismatches: { [albumId: string]: { imageId: string; wrongAlbumId: string }[] } = {};
  let totalImages = 0;
  let totalMismatches = 0;

  for (let i = 0; i < albumIds.length; i++) {
    const albumId = albumIds[i];
    const progress = `[${i + 1}/${albumIds.length}]`;

    try {
      // Load album metadata
      const albumMetadataKey = `albums/${albumId}/metadata.json`;
      const albumData = await getObject(albumMetadataKey);

      if (!albumData) {
        console.log(`  ${progress} ⚠️  ${albumId} - no metadata`);
        continue;
      }

      const albumMetadata: R2AlbumMetadata = JSON.parse(albumData);
      const imageIds = albumMetadata.imageIds;
      totalImages += imageIds.length;

      // Check a sample of images (first 5 to avoid too many API calls)
      const sampleSize = Math.min(5, imageIds.length);
      let albumMismatches = 0;

      for (let j = 0; j < sampleSize; j++) {
        const imageId = imageIds[j];
        const metadataKey = `metadata/images/${imageId}.json`;

        try {
          const metadataData = await getObject(metadataKey);
          if (!metadataData) continue;

          const metadata: R2ImageMetadata = JSON.parse(metadataData);

          if (metadata.albumId !== albumId) {
            if (!mismatches[albumId]) {
              mismatches[albumId] = [];
            }
            mismatches[albumId].push({
              imageId,
              wrongAlbumId: metadata.albumId || '(no albumId)',
            });
            albumMismatches++;
            totalMismatches++;
          }
        } catch (error) {
          // Ignore individual image errors
        }
      }

      if (albumMismatches > 0) {
        console.log(`  ${progress} ❌ ${albumId} - ${albumMismatches}/${sampleSize} sampled images have mismatches`);
      } else {
        console.log(`  ${progress} ✓ ${albumId} - ${imageIds.length} images (sample checked)`);
      }
    } catch (error: any) {
      console.log(`  ${progress} ⚠️  ${albumId} - error: ${error.message}`);
    }
  }

  // 3. Report results
  console.log('\n' + '='.repeat(60));
  console.log('📊 Scan Results:');
  console.log(`   Albums scanned: ${albumIds.length}`);
  console.log(`   Total images: ${totalImages}`);
  console.log(`   Mismatches found: ${totalMismatches}`);

  if (Object.keys(mismatches).length > 0) {
    console.log('\n❌ Albums with mismatches:');
    for (const [albumId, issues] of Object.entries(mismatches)) {
      console.log(`\n   ${albumId}:`);
      issues.forEach(({ imageId, wrongAlbumId }) => {
        console.log(`     - ${imageId}: references "${wrongAlbumId}" instead of "${albumId}"`);
      });
    }

    console.log('\n💡 To fix these mismatches, you can:');
    console.log('   1. Run fix-festivalle-metadata.ts for the festivalle album');
    console.log('   2. Create similar fix scripts for other affected albums');
    console.log('   3. Or manually update the image metadata files');
  } else {
    console.log('\n✅ No mismatches detected!');
    console.log('   All sampled images reference their correct album IDs.');
  }
}

main().catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
