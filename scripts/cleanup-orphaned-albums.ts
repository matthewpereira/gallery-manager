#!/usr/bin/env tsx
/**
 * Cleanup orphaned album folders (folders without metadata.json)
 *
 * Usage:
 *   npm run cleanup-orphans
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const config = {
  bucketName: process.env.VITE_R2_BUCKET_NAME!,
  accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY!,
  endpoint: process.env.VITE_R2_ENDPOINT!,
};

const client = new S3Client({
  region: 'auto',
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

async function findOrphanedAlbums(): Promise<string[]> {
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: 'albums/',
    Delimiter: '/',
  });

  const response = await client.send(listCommand);
  const prefixes = response.CommonPrefixes || [];

  const orphanedAlbums: string[] = [];

  for (const prefix of prefixes) {
    if (!prefix.Prefix) continue;

    // Extract album ID from prefix: "albums/album-id/" -> "album-id"
    const albumId = prefix.Prefix.replace(/^albums\//, '').replace(/\/$/, '');

    // Check if metadata file exists
    const metadataKey = `albums/${albumId}/metadata.json`;

    try {
      await client.send(new GetObjectCommand({
        Bucket: config.bucketName,
        Key: metadataKey,
      }));
      console.log(`✅ ${albumId} - has metadata`);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        console.log(`❌ ${albumId} - ORPHANED (no metadata)`);
        orphanedAlbums.push(albumId);
      }
    }
  }

  return orphanedAlbums;
}

async function deleteOrphanedAlbum(albumId: string): Promise<void> {
  console.log(`\n🗑️  Deleting orphaned album: ${albumId}`);

  // List all files in the album folder
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: `albums/${albumId}/`,
  });

  const response = await client.send(listCommand);
  const objects = response.Contents || [];

  if (objects.length === 0) {
    console.log(`   No files to delete`);
    return;
  }

  console.log(`   Found ${objects.length} file(s) to delete`);

  // Delete all files
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: config.bucketName,
    Delete: {
      Objects: objects.map(obj => ({ Key: obj.Key! })),
    },
  });

  await client.send(deleteCommand);
  console.log(`   ✅ Deleted ${objects.length} file(s)`);
}

async function main() {
  console.log('🔍 Scanning for orphaned album folders...\n');

  const orphanedAlbums = await findOrphanedAlbums();

  if (orphanedAlbums.length === 0) {
    console.log('\n✨ No orphaned albums found!');
    return;
  }

  console.log(`\n📊 Found ${orphanedAlbums.length} orphaned album(s):\n`);
  orphanedAlbums.forEach(id => console.log(`   - ${id}`));

  console.log('\n⚠️  These albums have files but no metadata.json');
  console.log('Would you like to delete them? (This cannot be undone!)');
  console.log('\nRe-run with --delete flag to proceed:\n');
  console.log('  npm run cleanup-orphans -- --delete\n');

  const shouldDelete = process.argv.includes('--delete');

  if (shouldDelete) {
    console.log('\n🗑️  Deleting orphaned albums...');

    for (const albumId of orphanedAlbums) {
      await deleteOrphanedAlbum(albumId);
    }

    console.log('\n✅ Cleanup complete!');
  }
}

main().catch(console.error);
