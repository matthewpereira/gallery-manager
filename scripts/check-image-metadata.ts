import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

async function getObject(key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || null;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') return null;
    console.error(`Error fetching ${key}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Checking image metadata for festivalle album\n');

  // Check the first image metadata
  const imageId = 'img_1767315921182_7hxgpn9nt';
  const metadataKey = `metadata/images/${imageId}.json`;

  console.log(`Checking metadata for ${imageId}...`);
  const metadata = await getObject(metadataKey);

  if (metadata) {
    const parsed = JSON.parse(metadata);
    console.log('\nImage Metadata:');
    console.log(`  ID: ${parsed.id}`);
    console.log(`  Album ID: ${parsed.albumId}`);
    console.log(`  Title: ${parsed.title || '(no title)'}`);
    console.log(`  MIME Type: ${parsed.mimeType}`);
    console.log(`  Size: ${parsed.size} bytes`);

    console.log('\n📍 Expected image path:');
    const ext = parsed.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    console.log(`  albums/${parsed.albumId}/images/${imageId}.${ext}`);

    console.log('\n📍 Actual image path:');
    console.log(`  albums/festivalle/images/${imageId}.jpg`);

    if (parsed.albumId !== 'festivalle') {
      console.log('\n❌ MISMATCH DETECTED!');
      console.log(`   Image metadata albumId: ${parsed.albumId}`);
      console.log(`   Expected albumId: festivalle`);
      console.log('\n💡 This explains why images are 404ing:');
      console.log(`   - Browser requests: albums/${parsed.albumId}/images/${imageId}.jpg`);
      console.log(`   - But file exists at: albums/festivalle/images/${imageId}.jpg`);
    } else {
      console.log('\n✅ Album IDs match!');
    }
  } else {
    console.log('❌ Image metadata not found');
  }
}

main().catch(console.error);
