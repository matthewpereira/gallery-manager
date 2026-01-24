/**
 * Storage Provider Factory
 *
 * Creates and configures storage provider instances based on the provider type
 */

import type { StorageProvider } from './StorageProvider';
import { ImgurAdapter } from './adapters/ImgurAdapter';
import { WorkerAdapter } from './adapters/WorkerAdapter';

export type ProviderType = 'imgur' | 'r2' | 'worker' | 's3' | 'gdrive';

/**
 * Create a storage provider instance based on the provider type
 * @param type - The type of storage provider to create
 * @returns A configured storage provider instance
 */
export function createStorageProvider(type: ProviderType = 'imgur'): StorageProvider {
  switch (type) {
    case 'imgur':
      return new ImgurAdapter();

    case 'r2':
    case 'worker':
      // Both 'r2' and 'worker' now use the WorkerAdapter
      // The WorkerAdapter communicates with the Cloudflare Worker API
      // which handles R2 access server-side (no credentials in frontend)
      return new WorkerAdapter();

    case 's3':
      // Future implementation
      throw new Error('S3 storage provider not yet implemented');

    case 'gdrive':
      // Future implementation
      throw new Error('Google Drive storage provider not yet implemented');

    default:
      throw new Error(`Unknown storage provider type: ${type}`);
  }
}

/**
 * Get the storage provider type from environment variables
 * Defaults to 'imgur' if not specified or invalid
 */
export function getProviderTypeFromEnv(): ProviderType {
  const envProvider = import.meta.env.VITE_STORAGE_PROVIDER as string;

  if (!envProvider) {
    return 'imgur';
  }

  const normalized = envProvider.toLowerCase();

  if (normalized === 'imgur' || normalized === 'r2' || normalized === 'worker' || normalized === 's3' || normalized === 'gdrive') {
    return normalized as ProviderType;
  }

  console.warn(`Invalid VITE_STORAGE_PROVIDER value: ${envProvider}. Defaulting to 'imgur'`);
  return 'imgur';
}
