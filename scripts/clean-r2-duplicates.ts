#!/usr/bin/env tsx
/**
 * R2 Duplicate Cleanup Script
 *
 * Removes albums that were created without the user prefix
 * This is a SAFE cleanup - it only removes albums at the root level
 * and preserves all user-specific albums under users/{userId}/
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.development' });

const R2_CONFIG = {
  bucketName: process.env.VITE_R2_BUCKET_NAME || '',
  accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY || '',
  endpoint: process.env.VITE_R2_ENDPOINT || '',
};

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_CONFIG.endpoint,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

async function cleanupDuplicates() {
  console.log('🧹 R2 Duplicate Cleanup Tool');
  console.log('================================\n');
  console.log(`Bucket: ${R2_CONFIG.bucketName}\n`);

  // Find all objects that DON'T have the user prefix
  // Safe pattern: only delete objects starting with "albums/" or "metadata/"
  // This preserves everything under "users/"
  const prefixesToClean = ['albums/', 'metadata/'];
  const objectsToDelete: string[] = [];

  for (const prefix of prefixesToClean) {
    console.log(`📁 Checking ${prefix}...`);

    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: R2_CONFIG.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && !obj.Key.startsWith('users/')) {
            objectsToDelete.push(obj.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  if (objectsToDelete.length === 0) {
    console.log('✅ No duplicates found. Bucket is clean!\n');
    return;
  }

  console.log(`\n⚠️  Found ${objectsToDelete.length} objects to delete:\n`);

  // Group by folder for better readability
  const byFolder = new Map<string, string[]>();
  for (const key of objectsToDelete) {
    const folder = key.substring(0, key.lastIndexOf('/') + 1);
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
    }
    byFolder.get(folder)!.push(key);
  }

  for (const [folder, files] of byFolder) {
    console.log(`  ${folder} (${files.length} files)`);
  }

  console.log('\n🚨 IMPORTANT: This will DELETE these objects permanently!');
  console.log('   All objects under users/ will be preserved.\n');

  // Delete in batches of 1000 (S3/R2 limit)
  const batchSize = 1000;
  let deleted = 0;

  for (let i = 0; i < objectsToDelete.length; i += batchSize) {
    const batch = objectsToDelete.slice(i, i + batchSize);

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: R2_CONFIG.bucketName,
      Delete: {
        Objects: batch.map(key => ({ Key: key })),
        Quiet: false,
      },
    });

    const result = await s3Client.send(deleteCommand);
    deleted += result.Deleted?.length || 0;

    if (result.Errors && result.Errors.length > 0) {
      console.error('⚠️  Some objects failed to delete:');
      for (const error of result.Errors) {
        console.error(`  - ${error.Key}: ${error.Message}`);
      }
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} objects.`);
  console.log('   All user-specific albums under users/ are preserved.\n');
}

cleanupDuplicates().catch(console.error);
