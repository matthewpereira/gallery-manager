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
  const { user, getToken } = useAuth();

  const value = useMemo(() => {
    const providerType = getProviderTypeFromEnv();
    const provider = createStorageProvider(providerType);

    console.log(`[StorageProvider] Initialized ${provider.name} storage provider`);

    return {
      provider,
      providerName: provider.name
    };
  }, []);

  // Set authentication status and access token when user logs in/out
  useEffect(() => {
    const updateAuth = async () => {
      // Check if the provider supports setAuthenticated (Worker or R2 adapter)
      if ('setAuthenticated' in value.provider) {
        (value.provider as any).setAuthenticated(!!user);
        console.log(`[StorageContext] Set authentication status: ${!!user}`);
      }

      // Set access token for Worker adapter
      if ('setAccessToken' in value.provider) {
        if (user) {
          const token = await getToken();
          (value.provider as any).setAccessToken(token);
          console.log(`[StorageContext] Set access token: ${token ? 'present' : 'null'}`);
        } else {
          (value.provider as any).setAccessToken(null);
          console.log(`[StorageContext] Cleared access token`);
        }
      }
    };

    updateAuth();
  }, [user, getToken, value.provider]);

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
