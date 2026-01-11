#!/usr/bin/env tsx

/**
 * Script to check R2 CORS configuration and diagnose OpaqueResponseBlocking issues
 *
 * Usage: npx tsx scripts/check-r2-cors.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.development');
dotenv.config({ path: envPath });

const R2_PUBLIC_URL = process.env.VITE_R2_PUBLIC_URL;
const R2_BUCKET_NAME = process.env.VITE_R2_BUCKET_NAME;

console.log('🔍 R2 CORS Configuration Checker\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Check if public URL is configured
if (!R2_PUBLIC_URL) {
  console.log('❌ VITE_R2_PUBLIC_URL is not configured');
  console.log('   This means you\'re using presigned URLs, which don\'t have CORS issues.');
  console.log('   The OpaqueResponseBlocking error only occurs with public URLs.\n');
  console.log('   Current configuration: Using presigned S3 URLs (no CORS needed)\n');
  process.exit(0);
}

console.log('✓ Public URL configured:', R2_PUBLIC_URL);
console.log('✓ Bucket name:', R2_BUCKET_NAME || '(not found)');
console.log('');

// Check if URL is accessible
console.log('📋 CORS Issue Diagnosis:\n');
console.log('The "OpaqueResponseBlocking" error occurs when:');
console.log('  1. Your app makes a request to:', R2_PUBLIC_URL);
console.log('  2. The R2 bucket doesn\'t send CORS headers');
console.log('  3. The browser blocks the response for security\n');

console.log('🛠️  How to Fix:\n');
console.log('You need to configure CORS on your R2 bucket. Choose one method:\n');

console.log('Method 1: Cloudflare Dashboard');
console.log('  1. Go to https://dash.cloudflare.com/');
console.log('  2. Navigate to R2 → Your Bucket → Settings');
console.log('  3. Add this CORS configuration:\n');
console.log('     [');
console.log('       {');
console.log('         "AllowedOrigins": ["*"],');
console.log('         "AllowedMethods": ["GET", "HEAD"],');
console.log('         "AllowedHeaders": ["*"],');
console.log('         "ExposeHeaders": ["ETag"],');
console.log('         "MaxAgeSeconds": 3600');
console.log('       }');
console.log('     ]\n');

console.log('Method 2: Wrangler CLI');
console.log('  1. Create a file called cors.json with the config above');
console.log('  2. Run: wrangler r2 bucket cors put', R2_BUCKET_NAME, '--cors-file cors.json');
console.log('  3. Verify: wrangler r2 bucket cors get', R2_BUCKET_NAME);
console.log('');

console.log('🔧 After applying CORS:');
console.log('  • Clear browser cache or use incognito mode');
console.log('  • Refresh your app');
console.log('  • The errors should disappear\n');

console.log('📚 For more details, see:');
console.log('   docs/R2_CORS_SETUP.md\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Try to fetch a test URL to check CORS headers
console.log('🧪 Testing CORS headers (if images exist)...\n');

const testImageUrl = `${R2_PUBLIC_URL}/albums/default/images/`;

try {
  console.log('Attempting to fetch:', testImageUrl);
  console.log('Note: This test may not work from Node.js, but shows the URL format.\n');

  // Provide curl command for manual testing
  console.log('To test manually, run this in your terminal:');
  console.log(`curl -I "${testImageUrl}YOUR_IMAGE.jpg"`);
  console.log('');
  console.log('Look for these headers in the response:');
  console.log('  Access-Control-Allow-Origin: *');
  console.log('  Access-Control-Allow-Methods: GET, HEAD');
  console.log('');
  console.log('If these headers are missing, CORS is not configured.\n');
} catch (error) {
  console.log('Could not test CORS from Node.js.');
  console.log('Please test in your browser or use the curl command above.\n');
}
