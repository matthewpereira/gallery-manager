#!/usr/bin/env tsx
/**
 * Delete a specific album from R2 storage
 *
 * Usage:
 *   npm run delete-album <albumId>
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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

const client = new S3Client({
  region: 'auto',
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

async function deleteAlbum(albumId: string, confirmDelete: boolean = false): Promise<void> {
  console.log(`\nDeleting album: ${albumId}`);
  console.log('='.repeat(60));

  // Check if album exists
  const metadataKey = `albums/${albumId}/metadata.json`;
  try {
    const getCommand = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: metadataKey,
    });
    await client.send(getCommand);
    console.log(`  ✅ Found metadata at: ${metadataKey}`);
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      console.log(`  ❌ No metadata found at: ${metadataKey}`);
      console.log(`  ⚠️  Album may not exist or may already be deleted`);
    } else {
      console.error(`  ⚠️  Error checking metadata:`, error.message);
    }
  }

  // List all files in album folder
  console.log(`\nListing files in: albums/${albumId}/`);
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: `albums/${albumId}/`,
  });

  const response = await client.send(listCommand);
  const objects = response.Contents || [];

  if (objects.length === 0) {
    console.log(`  ❌ No files found in: albums/${albumId}/`);
    console.log(`\n✅ Album folder is empty or doesn't exist`);
    return;
  }

  console.log(`  ✅ Found ${objects.length} file(s):`);
  objects.forEach(obj => {
    console.log(`    - ${obj.Key}`);
  });

  if (!confirmDelete) {
    console.log(`\n⚠️  DRY RUN - No files were deleted`);
    console.log(`\nTo actually delete these files, re-run with --confirm flag:\n`);
    console.log(`  npm run delete-album ${albumId} -- --confirm\n`);
    return;
  }

  // Delete all files
  console.log(`\n🗑️  Deleting ${objects.length} file(s)...`);
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: config.bucketName,
    Delete: {
      Objects: objects.map(obj => ({ Key: obj.Key! })),
    },
  });

  const deleteResult = await client.send(deleteCommand);

  if (deleteResult.Errors && deleteResult.Errors.length > 0) {
    console.error(`\n❌ Some files failed to delete:`);
    deleteResult.Errors.forEach(err => {
      console.error(`  - ${err.Key}: ${err.Code} - ${err.Message}`);
    });
  }

  if (deleteResult.Deleted && deleteResult.Deleted.length > 0) {
    console.log(`\n✅ Successfully deleted ${deleteResult.Deleted.length} file(s)`);
  }

  console.log('\n' + '='.repeat(60));
}

async function main() {
  const albumId = process.argv[2];

  if (!albumId) {
    console.error('❌ Error: Please specify an album ID');
    console.error('\nUsage:');
    console.error('  npm run delete-album <albumId>          # Dry run (preview)');
    console.error('  npm run delete-album <albumId> --confirm # Actually delete');
    console.error('\nExample:');
    console.error('  npm run delete-album default2');
    console.error('  npm run delete-album default2 -- --confirm');
    process.exit(1);
  }

  const confirmDelete = process.argv.includes('--confirm');

  await deleteAlbum(albumId, confirmDelete);
}

main().catch(console.error);
