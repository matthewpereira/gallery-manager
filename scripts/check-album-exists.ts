#!/usr/bin/env tsx
/**
 * Check if an album exists in R2 storage
 *
 * Usage:
 *   npm run check-album <albumId>
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

async function checkAlbumExists(albumId: string) {
  console.log(`\nChecking album: ${albumId}`);
  console.log('='.repeat(60));

  // Check for album metadata
  console.log('\n[1/2] Checking album metadata file...');
  const metadataKey = `albums/${albumId}/metadata.json`;
  try {
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: metadataKey,
    });
    await client.send(command);
    console.log(`  ✅ Found metadata at: ${metadataKey}`);
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      console.log(`  ❌ No metadata found at: ${metadataKey}`);
    } else {
      console.error(`  ⚠️  Error checking metadata:`, error.message);
    }
  }

  // List all files in album folder
  console.log('\n[2/2] Checking album folder...');
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: `albums/${albumId}/`,
  });

  try {
    const response = await client.send(listCommand);
    const objects = response.Contents || [];

    if (objects.length === 0) {
      console.log(`  ❌ No files found in: albums/${albumId}/`);
    } else {
      console.log(`  ✅ Found ${objects.length} file(s) in: albums/${albumId}/`);
      console.log('\n  Files:');
      objects.forEach(obj => {
        console.log(`    - ${obj.Key}`);
      });
    }
  } catch (error: any) {
    console.error(`  ⚠️  Error listing files:`, error.message);
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const albumId = process.argv[2];

  if (!albumId) {
    console.error('❌ Error: Please specify an album ID');
    console.error('\nUsage:');
    console.error('  npm run check-album <albumId>');
    console.error('\nExample:');
    console.error('  npm run check-album default');
    process.exit(1);
  }

  await checkAlbumExists(albumId);
}

main().catch(console.error);
