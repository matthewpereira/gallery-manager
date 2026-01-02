#!/usr/bin/env tsx
/**
 * Test the albumExists check
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

async function albumExists(albumId: string): Promise<boolean> {
  try {
    const metadataKey = `albums/${albumId}/metadata.json`;
    console.log(`Checking for: ${metadataKey}`);

    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: metadataKey,
    });

    const result = await client.send(command);
    console.log(`✅ File exists! Size: ${result.ContentLength} bytes`);
    return true;
  } catch (error: any) {
    console.log(`Error: ${error.name} - ${error.message}`);

    if (error.name === 'NoSuchKey') {
      console.log(`❌ File does not exist`);
      return false;
    }

    console.error(`⚠️  Unexpected error:`, error);
    throw error;
  }
}

async function main() {
  const albumId = process.argv[2] || 'default';

  console.log(`\nTesting albumExists('${albumId}')...\n`);

  const exists = await albumExists(albumId);

  console.log(`\nResult: ${exists}\n`);
}

main().catch(console.error);
