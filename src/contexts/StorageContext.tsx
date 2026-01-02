/**
 * Storage Context
 *
 * Provides dependency injection for the storage provider throughout the application
 * Allows components to access storage functionality without directly importing specific providers
 */

import { createContext, useContext, useMemo, useEffect, type PropsWithChildren } from 'react';
import type { StorageProvider } from '../services/storage/StorageProvider';
import { createStorageProvider, getProviderTypeFromEnv } from '../services/storage/ProviderFactory';
import { useAuth } from '../auth/AuthProvider';

interface StorageContextValue {
  provider: StorageProvider;
  providerName: string;
}

const StorageContext = createContext<StorageContextValue | null>(null);

/**
 * Storage Provider Context Provider
 * Wraps the application and provides storage provider access to all components
 */
export function StorageProviderContext({ children }: PropsWithChildren) {
  const { user } = useAuth();

  const value = useMemo(() => {
    const providerType = getProviderTypeFromEnv();
    const provider = createStorageProvider(providerType);

    console.log(`[StorageProvider] Initialized ${provider.name} storage provider`);

    return {
      provider,
      providerName: provider.name
    };
  }, []);

  // Set authentication status for R2 when user logs in/out
  useEffect(() => {
    if (value.providerName === 'r2' && 'setAuthenticated' in value.provider) {
      (value.provider as any).setAuthenticated(!!user);
      console.log(`[StorageContext] Set R2 authentication status: ${!!user}`);
    }
  }, [user, value.provider, value.providerName]);

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Hook to access the storage provider
 * @returns The current storage provider instance
 * @throws Error if used outside of StorageProviderContext
 */
export function useStorage(): StorageProvider {
  const context = useContext(StorageContext);

  if (!context) {
    throw new Error('useStorage must be used within StorageProviderContext');
  }

  return context.provider;
}

/**
 * Hook to get the current storage provider name
 * @returns The name of the current storage provider (e.g., 'imgur', 's3')
 * @throws Error if used outside of StorageProviderContext
 */
export function useStorageProvider(): string {
  const context = useContext(StorageContext);

  if (!context) {
    throw new Error('useStorageProvider must be used within StorageProviderContext');
  }

  return context.providerName;
}
