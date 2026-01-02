/**
 * Diagnose Album Script
 *
 * This script investigates what's wrong with an album by checking:
 * - Album metadata existence
 * - Image files in the album folder
 * - Image metadata files
 * - Mismatches between them
 *
 * Usage:
 *   npm run diagnose-album <albumId>
 *
 * Example:
 *   npm run diagnose-album default
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

const keys = {
  albumMetadata: (albumId: string) => `albums/${albumId}/metadata.json`,
  imageMetadata: (imageId: string) => `metadata/images/${imageId}.json`,
};

async function downloadMetadata<T>(key: string): Promise<T | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });
    const response = await client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

async function diagnoseAlbum(albumId: string) {
  console.log(`\nDiagnosing album: ${albumId}`);
  console.log('='.repeat(70));

  try {
    // 1. Check album metadata
    console.log('\n[1/4] Checking album metadata...');
    const albumMetadata: any = await downloadMetadata(keys.albumMetadata(albumId));

    if (!albumMetadata) {
      console.log('  ❌ Album metadata not found!');
      return;
    }

    console.log(`  ✓ Album metadata found`);
    console.log(`  - Title: ${albumMetadata.title || '(none)'}`);
    console.log(`  - ${albumMetadata.imageIds.length} images listed in metadata`);

    // 2. Check actual image files
    console.log('\n[2/4] Scanning actual image files in R2...');
    const listCommand = new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: `albums/${albumId}/images/`,
    });
    const listResponse = await client.send(listCommand);
    const imageFiles = listResponse.Contents || [];

    console.log(`  ✓ Found ${imageFiles.length} actual image files in R2`);

    // Extract image IDs from files
    const fileImageIds = new Set<string>();
    imageFiles.forEach(file => {
      if (!file.Key) return;
      const match = file.Key.match(/\/images\/([^/]+)\.[^.]+$/);
      if (match) fileImageIds.add(match[1]);
    });

    // 3. Check image metadata files
    console.log('\n[3/4] Checking image metadata files...');
    let metadataExists = 0;
    let metadataMissing = 0;
    let metadataHasCaption = 0;

    const sampleMissing: string[] = [];
    const sampleWithCaptions: Array<{id: string; caption: string}> = [];

    for (const imageId of albumMetadata.imageIds) {
      const metadata: any = await downloadMetadata(keys.imageMetadata(imageId));

      if (metadata) {
        metadataExists++;
        if (metadata.description) {
          metadataHasCaption++;
          if (sampleWithCaptions.length < 3) {
            sampleWithCaptions.push({
              id: imageId,
              caption: metadata.description.substring(0, 50)
            });
          }
        }
      } else {
        metadataMissing++;
        if (sampleMissing.length < 5) {
          sampleMissing.push(imageId);
        }
      }
    }

    console.log(`  ✓ ${metadataExists} metadata files exist`);
    console.log(`  ✗ ${metadataMissing} metadata files missing`);
    console.log(`  📝 ${metadataHasCaption} images have captions/descriptions`);

    if (sampleWithCaptions.length > 0) {
      console.log('\n  Sample captions found:');
      sampleWithCaptions.forEach(({id, caption}) => {
        console.log(`    - ${id}: "${caption}..."`);
      });
    }

    if (sampleMissing.length > 0) {
      console.log('\n  Sample missing metadata:');
      sampleMissing.forEach(id => console.log(`    - ${id}`));
      if (metadataMissing > sampleMissing.length) {
        console.log(`    ... and ${metadataMissing - sampleMissing.length} more`);
      }
    }

    // 4. Compare album metadata vs actual files
    console.log('\n[4/4] Comparing album metadata vs actual files...');

    const inMetadataNotInFiles = albumMetadata.imageIds.filter((id: string) => !fileImageIds.has(id));
    const inFilesNotInMetadata = Array.from(fileImageIds).filter(id => !albumMetadata.imageIds.includes(id));

    if (inMetadataNotInFiles.length > 0) {
      console.log(`  ⚠️  ${inMetadataNotInFiles.length} images in metadata but not in R2 files`);
    }

    if (inFilesNotInMetadata.length > 0) {
      console.log(`  ⚠️  ${inFilesNotInMetadata.length} files in R2 but not in album metadata`);
    }

    if (inMetadataNotInFiles.length === 0 && inFilesNotInMetadata.length === 0) {
      console.log(`  ✓ Album metadata and actual files are in sync`);
    }

    // Summary and recommendations
    console.log('\n' + '='.repeat(70));
    console.log('DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));

    if (metadataMissing === 0) {
      console.log('✓ All image metadata files exist');
      console.log('\n💡 Recommendation: Run `npm run repair-album ${albumId}`');
      console.log('   This will fix any incorrect albumId references.');
    } else if (metadataHasCaption > 0) {
      console.log(`⚠️  ${metadataMissing} metadata files are missing`);
      console.log(`📝 ${metadataHasCaption} images have captions that would be preserved`);
      console.log('\n💡 Recommendation: Manual recovery needed');
      console.log('   1. Check if metadata exists elsewhere (different folder/backup)');
      console.log('   2. If not, rebuilding will lose captions for missing metadata');
    } else {
      console.log(`❌ ${metadataMissing} metadata files are missing`);
      console.log(`✓ No captions/descriptions found - safe to rebuild`);
      console.log('\n💡 Recommendation: Run `npm run rebuild-album ${albumId}`');
      console.log('   This will create new metadata files from the actual image files.');
    }

    console.log();

  } catch (error: any) {
    console.error('\n❌ Diagnosis failed:', error.message);
    process.exit(1);
  }
}

// Get album ID from command line
const albumId = process.argv[2];

if (!albumId) {
  console.error('Usage: npm run diagnose-album <albumId>');
  console.error('Example: npm run diagnose-album default');
  process.exit(1);
}

diagnoseAlbum(albumId);
