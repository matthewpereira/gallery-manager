#!/usr/bin/env tsx
/**
 * R2 CORS Configuration Script
 *
 * Configures CORS policy on the R2 bucket to allow browser access to images
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
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

async function setupCORS() {
  console.log('🔧 R2 CORS Configuration Tool');
  console.log('================================\n');
  console.log(`Bucket: ${R2_CONFIG.bucketName}\n`);

  // Define CORS rules
  const corsRules = {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedOrigins: [
          'http://localhost:5173',
          'http://localhost:4173',
          'https://matthewpereira.github.io',
        ],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3000,
      },
    ],
  };

  try {
    // Check current CORS configuration
    console.log('📋 Checking current CORS configuration...\n');
    try {
      const currentCors = await s3Client.send(
        new GetBucketCorsCommand({ Bucket: R2_CONFIG.bucketName })
      );
      console.log('Current CORS rules:', JSON.stringify(currentCors.CORSRules, null, 2));
    } catch (error: any) {
      if (error.name === 'NoSuchCORSConfiguration') {
        console.log('No CORS configuration found.');
      } else {
        throw error;
      }
    }

    // Apply new CORS configuration
    console.log('\n🔧 Applying new CORS configuration...\n');
    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: R2_CONFIG.bucketName,
        CORSConfiguration: corsRules,
      })
    );

    console.log('✅ CORS configuration applied successfully!\n');
    console.log('Configured rules:');
    console.log('  - Allowed Origins:');
    corsRules.CORSRules[0].AllowedOrigins.forEach(origin => {
      console.log(`    • ${origin}`);
    });
    console.log('  - Allowed Methods: GET, HEAD');
    console.log('  - Allowed Headers: *');
    console.log('  - Max Age: 3000 seconds\n');

    console.log('🎉 Your browser can now access images from R2!\n');
  } catch (error) {
    console.error('❌ Failed to configure CORS:', error);
    process.exit(1);
  }
}

setupCORS().catch(console.error);
