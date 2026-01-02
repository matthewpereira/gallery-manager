#!/usr/bin/env tsx
/**
 * R2 Bucket Contents Checker
 *
 * Lists all objects in the R2 bucket to understand the current structure
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
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

async function listAllObjects() {
  console.log('🔍 Checking R2 Bucket Contents');
  console.log('================================\n');
  console.log(`Bucket: ${R2_CONFIG.bucketName}\n`);

  let continuationToken: string | undefined;
  let totalObjects = 0;
  const objectsByFolder = new Map<string, string[]>();

  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          totalObjects++;

          // Extract folder path (everything before the last /)
          const folderPath = obj.Key.substring(0, obj.Key.lastIndexOf('/') + 1);

          if (!objectsByFolder.has(folderPath)) {
            objectsByFolder.set(folderPath, []);
          }
          objectsByFolder.get(folderPath)!.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Sort folders alphabetically
  const sortedFolders = Array.from(objectsByFolder.keys()).sort();

  console.log(`📊 Total Objects: ${totalObjects}\n`);
  console.log('📁 Folder Structure:\n');

  for (const folder of sortedFolders) {
    const files = objectsByFolder.get(folder)!;
    console.log(`  ${folder} (${files.length} files)`);

    // Show first 3 files as examples
    const examples = files.slice(0, 3);
    for (const file of examples) {
      const filename = file.substring(folder.length);
      console.log(`    - ${filename}`);
    }
    if (files.length > 3) {
      console.log(`    ... and ${files.length - 3} more`);
    }
    console.log();
  }
}

listAllObjects().catch(console.error);
