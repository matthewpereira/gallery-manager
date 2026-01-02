#!/usr/bin/env tsx
/**
 * Inspect orphaned album folders to see what files they contain
 *
 * Usage:
 *   npm run inspect-orphans
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

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

    const albumId = prefix.Prefix.replace(/^albums\//, '').replace(/\/$/, '');
    const metadataKey = `albums/${albumId}/metadata.json`;

    try {
      await client.send(new GetObjectCommand({
        Bucket: config.bucketName,
        Key: metadataKey,
      }));
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        orphanedAlbums.push(albumId);
      }
    }
  }

  return orphanedAlbums;
}

async function inspectAlbum(albumId: string): Promise<void> {
  console.log(`\n📁 Album: ${albumId}`);
  console.log('─'.repeat(60));

  // List all files in the album folder
  const listCommand = new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: `albums/${albumId}/`,
  });

  const response = await client.send(listCommand);
  const objects = response.Contents || [];

  if (objects.length === 0) {
    console.log('   (empty folder)');
    return;
  }

  console.log(`   Found ${objects.length} file(s):\n`);

  // Group files by type
  const images: typeof objects = [];
  const thumbnails: typeof objects = [];
  const metadata: typeof objects = [];
  const other: typeof objects = [];

  for (const obj of objects) {
    if (!obj.Key) continue;

    if (obj.Key.includes('/images/')) {
      images.push(obj);
    } else if (obj.Key.includes('/thumbnails/')) {
      thumbnails.push(obj);
    } else if (obj.Key.endsWith('.json')) {
      metadata.push(obj);
    } else {
      other.push(obj);
    }
  }

  if (images.length > 0) {
    console.log(`   🖼️  Images (${images.length}):`);
    images.forEach(obj => {
      const filename = obj.Key!.split('/').pop();
      const size = (obj.Size! / 1024 / 1024).toFixed(2);
      console.log(`      - ${filename} (${size} MB)`);
    });
  }

  if (thumbnails.length > 0) {
    console.log(`\n   🔍 Thumbnails (${thumbnails.length}):`);
    thumbnails.forEach(obj => {
      const filename = obj.Key!.split('/').pop();
      console.log(`      - ${filename}`);
    });
  }

  if (metadata.length > 0) {
    console.log(`\n   📄 Metadata files (${metadata.length}):`);
    metadata.forEach(obj => {
      const filename = obj.Key!.split('/').pop();
      console.log(`      - ${filename}`);
    });
  }

  if (other.length > 0) {
    console.log(`\n   📎 Other files (${other.length}):`);
    other.forEach(obj => {
      const filename = obj.Key!.split('/').pop();
      console.log(`      - ${filename}`);
    });
  }

  // Calculate total size
  const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
  console.log(`\n   💾 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

async function main() {
  console.log('🔍 Finding orphaned album folders...\n');

  const orphanedAlbums = await findOrphanedAlbums();

  if (orphanedAlbums.length === 0) {
    console.log('✨ No orphaned albums found!');
    return;
  }

  console.log(`📊 Found ${orphanedAlbums.length} orphaned album(s):\n`);

  for (const albumId of orphanedAlbums) {
    await inspectAlbum(albumId);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 To delete these orphaned albums, run:');
  console.log('   npm run cleanup-orphans -- --delete\n');
}

main().catch(console.error);
