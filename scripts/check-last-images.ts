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

async function downloadMetadata(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });
    const response = await client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (error: any) {
    console.error(`Error loading ${key}:`, error.message);
    return null;
  }
}

async function checkLastImages() {
  const albumMetadata: any = await downloadMetadata('albums/default/metadata.json');

  if (!albumMetadata) {
    console.error('Failed to load album metadata');
    return;
  }

  console.log(`Album has ${albumMetadata.imageIds.length} images`);
  console.log('\nLast 10 image IDs in metadata:');

  const lastImages = albumMetadata.imageIds.slice(-10);

  for (let i = 0; i < lastImages.length; i++) {
    const imageId = lastImages[i];
    const index = albumMetadata.imageIds.length - 10 + i;
    console.log(`  ${index + 1}. ${imageId}`);
  }

  console.log('\nChecking if metadata files exist:');

  for (let i = 0; i < lastImages.length; i++) {
    const imageId = lastImages[i];
    const index = albumMetadata.imageIds.length - 10 + i;
    const metadata = await downloadMetadata(`metadata/images/${imageId}.json`);

    if (metadata) {
      console.log(`  ✓ ${index + 1}. ${imageId}`);
    } else {
      console.log(`  ✗ ${index + 1}. ${imageId} - METADATA MISSING`);
    }
  }

  console.log('\nChecking images 73-84 (last batch that might not be loading):');
  const offset = 72; // Start at image 73 (0-indexed)
  const batch = albumMetadata.imageIds.slice(offset, offset + 12);

  for (let i = 0; i < batch.length; i++) {
    const imageId = batch[i];
    const index = offset + i;
    const metadata = await downloadMetadata(`metadata/images/${imageId}.json`);

    if (metadata) {
      console.log(`  ✓ Image ${index + 1}: ${imageId}`);
    } else {
      console.log(`  ✗ Image ${index + 1}: ${imageId} - METADATA MISSING`);
    }
  }
}

checkLastImages();
