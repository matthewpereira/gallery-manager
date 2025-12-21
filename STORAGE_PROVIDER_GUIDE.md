# Storage Provider Architecture Guide

## Overview

This gallery manager now uses a **provider-agnostic architecture** that allows you to easily swap between different storage backends (Imgur, Amazon S3, Google Drive, etc.) without changing application code.

## Architecture

### Core Components

```
src/
├── types/
│   ├── models.ts              # Normalized, provider-agnostic data models
│   └── imgur.ts               # Imgur-specific API types (for adapter use only)
├── services/
│   └── storage/
│       ├── StorageProvider.ts           # Interface defining provider contract
│       ├── ProviderFactory.ts           # Factory for creating provider instances
│       └── adapters/
│           ├── ImgurAdapter.ts          # Imgur implementation
│           └── S3Adapter.ts             # (Future) S3 implementation
├── contexts/
│   └── StorageContext.tsx     # React context for dependency injection
└── components/
    ├── AlbumGrid.tsx          # Uses normalized Album type
    ├── ImageGrid.tsx          # Uses normalized Image type
    └── AlbumView.tsx          # Uses useStorage() hook
```

### Data Flow

```
Component
    ↓ (uses)
useStorage() Hook
    ↓ (provides)
StorageProvider Interface
    ↓ (implemented by)
ImgurAdapter / S3Adapter / etc.
    ↓ (returns)
Normalized Models (Album, Image, etc.)
```

## Key Concepts

### 1. Normalized Data Models

All components work with **provider-agnostic types** defined in [src/types/models.ts](src/types/models.ts):

- `Album` - Generic album representation
- `AlbumDetail` - Album with images
- `Image` - Generic image representation
- `Privacy` - 'public' | 'private' | 'unlisted'

**Example:**
```typescript
interface Album {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  imageCount: number;
  createdAt: Date;
  privacy: Privacy;
  views?: number;
  metadata?: Record<string, any>; // Provider-specific data
}
```

### 2. StorageProvider Interface

All storage backends must implement the [StorageProvider](src/services/storage/StorageProvider.ts) interface:

```typescript
interface StorageProvider {
  // Album operations
  listAlbums(page?: number): Promise<Album[]>;
  getAlbum(id: string): Promise<AlbumDetail>;
  createAlbum(data: CreateAlbumRequest): Promise<Album>;
  updateAlbum(id: string, updates: UpdateAlbumRequest): Promise<Album>;
  deleteAlbum(id: string): Promise<boolean>;

  // Image operations
  listImages(page?: number): Promise<Image[]>;
  getImage(id: string): Promise<Image>;
  uploadImage(file: File, options?: UploadOptions): Promise<Image>;
  updateImage(id: string, updates: UpdateImageRequest): Promise<Image>;
  deleteImage(id: string): Promise<boolean>;

  // Album-Image relationships
  addImagesToAlbum(albumId: string, imageIds: string[]): Promise<boolean>;
  removeImagesFromAlbum(albumId: string, imageIds: string[]): Promise<boolean>;

  // Authentication
  isAuthenticated(): boolean;
  authenticate(): Promise<AuthResult>;
  refreshToken(): Promise<void>;
  getAccountInfo(): Promise<any>;
}
```

### 3. Adapter Pattern

Each storage backend has an **adapter** that:
1. Implements the `StorageProvider` interface
2. Translates between provider-specific APIs and normalized models
3. Handles provider-specific authentication and error handling

**Example: ImgurAdapter**
```typescript
class ImgurAdapter implements StorageProvider {
  async listAlbums(page = 0): Promise<Album[]> {
    // Call Imgur API
    const response = await this.api.get(`/account/me/albums/${page}`);

    // Transform Imgur response to normalized Album[]
    return response.data.map(imgurAlbum => this.normalizeAlbum(imgurAlbum));
  }

  private normalizeAlbum(imgurAlbum: ImgurAlbum): Album {
    return {
      id: imgurAlbum.id,
      title: imgurAlbum.title || 'Untitled Album',
      coverImageUrl: imgurAlbum.cover
        ? `https://i.imgur.com/${imgurAlbum.cover}.jpg`
        : undefined,
      imageCount: imgurAlbum.images_count,
      createdAt: new Date(imgurAlbum.datetime * 1000),
      privacy: this.normalizePrivacy(imgurAlbum.privacy),
      views: imgurAlbum.views,
      metadata: { /* Imgur-specific fields */ }
    };
  }
}
```

### 4. Dependency Injection

Components access storage via the **useStorage() hook**:

```typescript
function MyComponent() {
  const storage = useStorage(); // Returns current StorageProvider

  const loadAlbums = async () => {
    const albums = await storage.listAlbums();
    // albums is Album[], not ImgurAlbum[]
  };
}
```

## Adding a New Storage Provider (e.g., S3)

### Step 1: Create the Adapter

Create `src/services/storage/adapters/S3Adapter.ts`:

```typescript
import { StorageProvider } from '../StorageProvider';
import type { Album, AlbumDetail, Image, /* ... */ } from '../../../types/models';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export class S3Adapter implements StorageProvider {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      region: import.meta.env.VITE_AWS_REGION,
      credentials: {
        accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
      }
    });
    this.bucketName = import.meta.env.VITE_AWS_BUCKET_NAME;
  }

  async listAlbums(page = 0): Promise<Album[]> {
    // List S3 "folders" (prefixes) as albums
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Delimiter: '/',
      MaxKeys: 50,
      StartAfter: page > 0 ? `page_${page}` : undefined
    });

    const response = await this.s3Client.send(command);

    // Transform S3 prefixes to Album[]
    return (response.CommonPrefixes || []).map(prefix =>
      this.normalizeAlbum(prefix)
    );
  }

  private normalizeAlbum(s3Prefix: any): Album {
    // Convert S3 folder to Album format
    return {
      id: s3Prefix.Prefix,
      title: s3Prefix.Prefix.replace(/\/$/, ''),
      imageCount: 0, // Would need separate call to count
      createdAt: new Date(),
      privacy: 'private',
      metadata: { s3Prefix: s3Prefix.Prefix }
    };
  }

  async uploadImage(file: File, options?: UploadOptions): Promise<Image> {
    const key = options?.albumId
      ? `${options.albumId}/${file.name}`
      : file.name;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: file.type,
      Metadata: {
        title: options?.title || '',
        description: options?.description || ''
      }
    });

    await this.s3Client.send(command);

    return this.normalizeImage({
      key,
      size: file.size,
      contentType: file.type,
      // ... other S3 metadata
    });
  }

  // Implement remaining StorageProvider methods...
  async getAlbum(id: string): Promise<AlbumDetail> { /* ... */ }
  async createAlbum(data: CreateAlbumRequest): Promise<Album> { /* ... */ }
  async deleteAlbum(id: string): Promise<boolean> { /* ... */ }
  // ... etc
}
```

### Step 2: Register in ProviderFactory

Update [src/services/storage/ProviderFactory.ts](src/services/storage/ProviderFactory.ts):

```typescript
import { S3Adapter } from './adapters/S3Adapter';

export type ProviderType = 'imgur' | 's3' | 'gdrive';

export function createStorageProvider(type: ProviderType = 'imgur'): StorageProvider {
  switch (type) {
    case 'imgur':
      return new ImgurAdapter();

    case 's3':
      return new S3Adapter(); // ✅ Add this

    case 'gdrive':
      throw new Error('Google Drive not yet implemented');

    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}
```

### Step 3: Configure Environment Variables

Add to `.env`:

```bash
# Storage Provider Selection
VITE_STORAGE_PROVIDER=s3  # Change from 'imgur' to 's3'

# S3 Configuration
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=your_access_key
VITE_AWS_SECRET_ACCESS_KEY=your_secret_key
VITE_AWS_BUCKET_NAME=my-gallery-bucket
```

### Step 4: Install Dependencies

```bash
npm install @aws-sdk/client-s3
```

### That's it! 🎉

The entire application will now use S3 for storage. No component code needs to change.

## Configuration

### Switching Providers

Change the `VITE_STORAGE_PROVIDER` environment variable:

```bash
# Use Imgur
VITE_STORAGE_PROVIDER=imgur

# Use S3
VITE_STORAGE_PROVIDER=s3

# Use Google Drive (when implemented)
VITE_STORAGE_PROVIDER=gdrive
```

The provider is selected at application startup via [ProviderFactory.getProviderTypeFromEnv()](src/services/storage/ProviderFactory.ts:36).

## Benefits of This Architecture

✅ **Flexibility** - Swap storage backends without code changes
✅ **Testability** - Mock `StorageProvider` interface for testing
✅ **Maintainability** - Provider-specific code isolated in adapters
✅ **Type Safety** - TypeScript ensures adapter compatibility
✅ **Consistency** - All components work with same data model
✅ **Scalability** - Easy to add new providers

## Migration Guide

### Before (Tightly Coupled)
```typescript
import { imgurService } from '../services/imgur';
import type { ImgurAlbum } from '../types/imgur';

function AlbumList() {
  const [albums, setAlbums] = useState<ImgurAlbum[]>([]);

  useEffect(() => {
    imgurService.getAccountAlbums().then(setAlbums);
  }, []);

  return (
    <div>
      {albums.map(album => (
        <div key={album.id}>
          <h3>{album.title}</h3>
          <p>{album.images_count} images</p>
        </div>
      ))}
    </div>
  );
}
```

### After (Provider Agnostic)
```typescript
import { useStorage } from '../contexts/StorageContext';
import type { Album } from '../types/models';

function AlbumList() {
  const storage = useStorage(); // ✅ Injected provider
  const [albums, setAlbums] = useState<Album[]>([]); // ✅ Normalized type

  useEffect(() => {
    storage.listAlbums().then(setAlbums); // ✅ Provider method
  }, [storage]);

  return (
    <div>
      {albums.map(album => (
        <div key={album.id}>
          <h3>{album.title}</h3>
          <p>{album.imageCount} images</p> {/* ✅ Normalized property */}
        </div>
      ))}
    </div>
  );
}
```

## Metadata Field

The `metadata` field in normalized models stores **provider-specific data** that doesn't fit the common model:

```typescript
// Imgur-specific metadata
{
  id: 'abc123',
  title: 'My Album',
  metadata: {
    deletehash: 'xyz789',
    layout: 'blog',
    favorite: false,
    nsfw: false,
    inGallery: true
  }
}

// S3-specific metadata
{
  id: 'my-folder/',
  title: 'My Folder',
  metadata: {
    s3Prefix: 'my-folder/',
    etag: '"abc123def456"',
    versionId: 'v1'
  }
}
```

Access metadata in components only when needed:
```typescript
const imgurDeleteHash = album.metadata?.deletehash;
const s3VersionId = album.metadata?.versionId;
```

## Testing

### Mock Provider for Tests
```typescript
import { StorageProvider } from '../services/storage/StorageProvider';

const mockProvider: StorageProvider = {
  name: 'mock',
  listAlbums: jest.fn().mockResolvedValue([
    { id: '1', title: 'Test Album', imageCount: 5, /* ... */ }
  ]),
  getAlbum: jest.fn(),
  createAlbum: jest.fn(),
  // ... implement all methods
};

// In test
<StorageContext.Provider value={{ provider: mockProvider, providerName: 'mock' }}>
  <YourComponent />
</StorageContext.Provider>
```

## Future Enhancements

### Multi-Provider Support
Support **multiple providers simultaneously**:
```typescript
const imgurStorage = useStorage('imgur');
const s3Storage = useStorage('s3');

// User can view albums from both providers
const allAlbums = [
  ...(await imgurStorage.listAlbums()),
  ...(await s3Storage.listAlbums())
];
```

### Provider-Specific Features
Add optional interface extensions:
```typescript
interface CloudFrontProvider extends StorageProvider {
  getCloudFrontUrl(imageId: string): string;
  invalidateCache(paths: string[]): Promise<void>;
}

// In component
if ('getCloudFrontUrl' in storage) {
  const cdnUrl = storage.getCloudFrontUrl(image.id);
}
```

## Troubleshooting

**Issue:** Type errors after migration
**Solution:** Ensure all components use normalized types (`Album`, `Image`) instead of provider-specific types (`ImgurAlbum`, `ImgurImage`)

**Issue:** Provider not loading
**Solution:** Check `VITE_STORAGE_PROVIDER` is set correctly and provider is registered in ProviderFactory

**Issue:** Authentication failing
**Solution:** Each provider handles auth differently. Ensure provider-specific env vars are set (e.g., `VITE_AWS_ACCESS_KEY_ID` for S3)

## References

- [StorageProvider.ts](src/services/storage/StorageProvider.ts) - Interface definition
- [ImgurAdapter.ts](src/services/storage/adapters/ImgurAdapter.ts) - Reference implementation
- [models.ts](src/types/models.ts) - Normalized data types
- [ProviderFactory.ts](src/services/storage/ProviderFactory.ts) - Provider instantiation
- [StorageContext.tsx](src/contexts/StorageContext.tsx) - Dependency injection

---

**Questions?** Review the existing ImgurAdapter implementation as a reference when building new providers.
