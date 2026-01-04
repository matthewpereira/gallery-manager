# Thumbnail Generation Implementation Plan

This document outlines strategies for implementing automatic thumbnail generation for the gallery manager to improve performance and reduce bandwidth usage.

## Current Problem

The gallery manager currently loads full-resolution images for:
- Album cover images in the grid view
- Image thumbnails in the album detail view

This results in:
- Slow initial page loads
- High bandwidth usage (dozens of MB per album view)
- Poor performance on mobile/slow connections

## Solution Approaches

### Option 1: Cloudflare Images (Recommended for Production)

**Best for:** Production deployment with budget for premium features

**Pros:**
- Automatic on-the-fly resizing
- Edge caching (ultra-fast delivery)
- No storage cost for thumbnails
- Simple URL-based API
- Perfect integration with R2

**Cons:**
- Additional cost (~$5/month for 100k images)
- Requires Cloudflare Images subscription

**Implementation:**

```typescript
// Add to R2Config in src/types/r2.ts
export interface R2Config {
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl?: string;
  cloudflareImagesEnabled?: boolean;  // Add this
  cloudflareImagesUrl?: string;       // Add this
}

// In R2Adapter.ts, add method for thumbnail URLs
private async getThumbnailUrl(key: string, variant = 'thumbnail'): Promise<string> {
  if (this.config.cloudflareImagesEnabled && this.config.cloudflareImagesUrl) {
    // Use Cloudflare Images with automatic variant generation
    return `${this.config.cloudflareImagesUrl}/${key}/${variant}`;
  }
  // Fallback to regular presigned URL
  return this.getPresignedUrl(key);
}

// Update imageMetadataToImage to use thumbnail URLs
private async imageMetadataToImage(imageId: string, metadata: R2ImageMetadata): Promise<Image> {
  const ext = this.getExtension('', metadata.mimeType);
  const key = metadata.albumId
    ? this.keys.albumImage(metadata.albumId, imageId, ext)
    : this.keys.standaloneImage(imageId, ext);

  const url = await this.getPresignedUrl(key);
  const thumbnailUrl = await this.getThumbnailUrl(key, 'thumbnail');

  return {
    id: imageId,
    url,
    thumbnailUrl, // Now uses optimized thumbnail
    // ... rest of properties
  };
}
```

**Setup Steps:**
1. Enable Cloudflare Images in Cloudflare dashboard
2. Configure R2 bucket to serve through Cloudflare Images
3. Define variants in Cloudflare Images:
   - `thumbnail`: 300x300px for grid views
   - `medium`: 800x800px for detail views
   - `large`: 1600x1600px for lightbox
4. Add environment variables:
   ```
   VITE_CLOUDFLARE_IMAGES_ENABLED=true
   VITE_CLOUDFLARE_IMAGES_URL=https://imagedelivery.net/your-account-id
   ```

---

### Option 2: Cloudflare Worker for On-Demand Thumbnails (Recommended)

**Best for:** Cost-effective solution that works with existing images

**Pros:**
- Free tier (100k requests/day)
- Works with all existing images immediately
- Edge caching (fast after first load)
- No storage cost
- No code changes to upload flow

**Cons:**
- Requires deploying a Worker
- Slight latency on first request (cached after)

**Implementation:**

**Step 1: Create Cloudflare Worker**

Create `workers/image-resizer/index.ts`:

```typescript
interface Env {
  R2_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const imagePath = url.searchParams.get('image');
    const width = parseInt(url.searchParams.get('w') || '300');
    const quality = parseInt(url.searchParams.get('q') || '85');

    if (!imagePath) {
      return new Response('Missing image parameter', { status: 400 });
    }

    // Fetch from R2
    const object = await env.R2_BUCKET.get(imagePath);
    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    // Use Cloudflare's automatic image resizing
    return new Response(object.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      cf: {
        image: {
          width,
          quality,
          format: 'jpeg',
          fit: 'scale-down',
        },
      },
    });
  },
};
```

**Step 2: Deploy Worker**

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy worker
cd workers/image-resizer
wrangler deploy
```

**Step 3: Update R2Adapter**

```typescript
// Add to R2Config
export interface R2Config {
  // ... existing fields
  workerUrl?: string; // e.g., https://thumbnails.yourdomain.workers.dev
}

// In R2Adapter.ts
private async getThumbnailUrl(key: string, width = 300): Promise<string> {
  if (this.config.workerUrl) {
    // Use Worker for automatic resizing
    return `${this.config.workerUrl}/?image=${encodeURIComponent(key)}&w=${width}`;
  }
  // Fallback to full image
  return this.getPresignedUrl(key);
}
```

**Step 4: Add Environment Variable**

```bash
# .env.development and .env.production
VITE_R2_WORKER_URL=https://thumbnails.yourdomain.workers.dev
```

---

### Option 3: Client-Side Generation (Simple, No Cost)

**Best for:** New uploads only, minimal setup

**Pros:**
- Free
- No server infrastructure needed
- Works with existing R2 setup

**Cons:**
- Only works for new uploads
- Won't help with existing images
- Slower upload process

**Implementation:**

```typescript
// Add to R2Adapter.ts
private async generateThumbnail(
  file: File,
  maxWidth = 300,
  maxHeight = 300
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Calculate dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail'));
        },
        'image/jpeg',
        0.85 // 85% quality
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async uploadImage(file: File, options?: UploadOptions): Promise<Image> {
  // ... existing upload code ...

  // Generate and upload thumbnail
  const thumbnailBlob = await this.generateThumbnail(file);
  const thumbnailKey = this.keys.albumImageThumb(
    options?.albumId || 'standalone',
    imageId
  );

  const thumbnailBuffer = await thumbnailBlob.arrayBuffer();
  await this.client.send(
    new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: thumbnailKey,
      Body: new Uint8Array(thumbnailBuffer),
      ContentType: 'image/jpeg',
    })
  );

  // Store thumbnail URL in metadata
  imageMetadata.thumbnailUrl = await this.getPresignedUrl(thumbnailKey);

  // ... rest of upload code ...
}
```

**Add to R2 types:**

```typescript
// In src/types/r2.ts - add to R2ObjectKey interface
export interface R2ObjectKey {
  // ... existing keys
  albumImageThumb: (albumId: string, imageId: string) => string;
}

// In R2Adapter.ts - add to keys object
private keys = {
  // ... existing keys
  albumImageThumb: (albumId: string, imageId: string) =>
    `albums/${albumId}/thumbnails/${imageId}_thumb.jpg`,
};
```

---

### Option 4: Batch Processing Script for Existing Images

**Best for:** One-time migration of existing images

**Note:** This requires Node.js with `sharp` library (server-side only, not in browser)

**Implementation:**

Create `scripts/generate-thumbnails.ts`:

```typescript
import { R2Adapter } from '../src/services/storage/adapters/R2Adapter';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

async function generateThumbnails() {
  const adapter = new R2Adapter();
  adapter.setAuthenticated(true);

  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.VITE_R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.VITE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.VITE_R2_SECRET_ACCESS_KEY!,
    },
  });

  // Get all albums
  console.log('📚 Fetching albums...');
  const albums = await adapter.listAlbums();
  console.log(`Found ${albums.length} albums\n`);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const album of albums) {
    console.log(`\n📁 Processing album: ${album.title} (${album.imageCount} images)`);
    const details = await adapter.getAlbum(album.id);

    for (const image of details.images || []) {
      try {
        // Skip if thumbnail already exists
        const thumbnailKey = `albums/${album.id}/thumbnails/${image.id}_thumb.jpg`;

        // Download original
        const getCmd = new GetObjectCommand({
          Bucket: process.env.VITE_R2_BUCKET_NAME!,
          Key: image.metadata?.r2Key || '',
        });
        const response = await client.send(getCmd);
        const buffer = Buffer.from(await response.Body!.transformToByteArray());

        // Generate thumbnail using sharp
        const thumbnail = await sharp(buffer)
          .resize(300, 300, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Upload thumbnail to R2
        const putCmd = new PutObjectCommand({
          Bucket: process.env.VITE_R2_BUCKET_NAME!,
          Key: thumbnailKey,
          Body: thumbnail,
          ContentType: 'image/jpeg',
        });
        await client.send(putCmd);

        totalProcessed++;
        console.log(`  ✓ ${image.id}`);
      } catch (error) {
        totalErrors++;
        console.error(`  ✗ ${image.id}:`, error);
      }
    }
  }

  console.log(`\n✅ Complete! Processed: ${totalProcessed}, Errors: ${totalErrors}`);
}

generateThumbnails().catch(console.error);
```

**Install dependencies:**

```bash
npm install --save-dev sharp @types/sharp
```

**Add script to package.json:**

```json
{
  "scripts": {
    "generate-thumbnails": "tsx --env-file=.env.development scripts/generate-thumbnails.ts"
  }
}
```

**Run:**

```bash
npm run generate-thumbnails
```

---

## Recommended Implementation Strategy

**Phase 1: Immediate (Cloudflare Worker)**
1. Deploy the Cloudflare Worker for on-demand resizing
2. Update R2Adapter to use Worker URLs for thumbnails
3. All existing images now have automatic thumbnails

**Phase 2: New Uploads (Client-Side Generation)**
1. Implement client-side thumbnail generation in uploadImage()
2. New uploads will have pre-generated thumbnails (faster than Worker)

**Phase 3: Optional Optimization**
1. Run batch script to pre-generate all thumbnails
2. Eliminates first-load latency for frequently viewed images
3. Consider upgrading to Cloudflare Images if usage justifies cost

---

## Expected Performance Improvements

### Before Thumbnails:
- Album grid: 50 albums × 2MB covers = **100MB** download
- Album detail: 100 images × 1MB each = **100MB** download
- Total: **200MB** for typical browsing session

### After Thumbnails:
- Album grid: 50 albums × 15KB thumbnails = **750KB** download
- Album detail: 100 images × 15KB thumbnails = **1.5MB** download
- Total: **2.25MB** for typical browsing session

**Result: 99% bandwidth reduction** 🎉

---

## Testing Plan

1. **Worker Testing:**
   ```bash
   # Test thumbnail generation
   curl "https://thumbnails.yourdomain.workers.dev/?image=albums/test/images/img123.jpg&w=300"
   ```

2. **Visual Testing:**
   - Verify thumbnail quality is acceptable
   - Check aspect ratios are preserved
   - Test with various image sizes and formats

3. **Performance Testing:**
   - Measure page load times before/after
   - Monitor Worker cache hit rates
   - Check bandwidth usage in browser DevTools

---

## Maintenance

### Monitoring:
- Track Cloudflare Worker usage (stay within free tier)
- Monitor cache hit rates (should be >90% after warmup)
- Watch for failed thumbnail generations

### Updates:
- Periodically review thumbnail sizes (adjust if needed)
- Consider adding more size variants (small, medium, large)
- Update Worker as Cloudflare features evolve

---

## Cost Analysis

| Solution | Monthly Cost | Setup Time | Ongoing Maintenance |
|----------|-------------|------------|---------------------|
| Cloudflare Images | ~$5-10 | 1 hour | Minimal |
| Cloudflare Worker | $0 (free tier) | 2 hours | Minimal |
| Client-Side Only | $0 | 3 hours | Low |
| Batch Processing | $0 | 4 hours | Medium (re-run for new images) |

**Recommended:** Start with Cloudflare Worker (free, works immediately)
