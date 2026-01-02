#!/usr/bin/env tsx
/**
 * R2 Complete Cleanup Script
 *
 * DANGER: This removes ALL objects from the R2 bucket
 * Use this to start with a clean slate
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

async function cleanAll() {
  console.log('🧹 R2 Complete Cleanup Tool');
  console.log('================================\n');
  console.log(`Bucket: ${R2_CONFIG.bucketName}\n`);
  console.log('⚠️  WARNING: This will delete ALL objects in the bucket!\n');

  const objectsToDelete: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          objectsToDelete.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  if (objectsToDelete.length === 0) {
    console.log('✅ Bucket is already empty!\n');
    return;
  }

  console.log(`Found ${objectsToDelete.length} objects to delete.\n`);
  console.log('Deleting...\n');

  // Delete in batches of 1000 (S3/R2 limit)
  const batchSize = 1000;
  let deleted = 0;

  for (let i = 0; i < objectsToDelete.length; i += batchSize) {
    const batch = objectsToDelete.slice(i, i + batchSize);

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: R2_CONFIG.bucketName,
      Delete: {
        Objects: batch.map(key => ({ Key: key })),
        Quiet: true,
      },
    });

    const result = await s3Client.send(deleteCommand);
    deleted += result.Deleted?.length || 0;

    console.log(`  Deleted ${deleted}/${objectsToDelete.length} objects...`);

    if (result.Errors && result.Errors.length > 0) {
      console.error('⚠️  Some objects failed to delete:');
      for (const error of result.Errors) {
        console.error(`  - ${error.Key}: ${error.Message}`);
      }
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} objects.`);
  console.log('   Bucket is now empty and ready for fresh migrations.\n');
}

cleanAll().catch(console.error);
