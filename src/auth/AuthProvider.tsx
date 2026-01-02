import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  login: () => void;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const callbackProcessedRef = useRef(false);

  // Handle Imgur OAuth callback
  const handleImgurCallback = useCallback(async (hash: string) => {
    try {
      console.log('[AuthProvider] Handling Imgur OAuth callback, hash:', hash);
      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      const expiresIn = params.get('expires_in');
      const tokenType = params.get('token_type');
      const refreshToken = params.get('refresh_token');
      const accountUsername = params.get('account_username');
      const accountId = params.get('account_id');

      console.log('[AuthProvider] Parsed Imgur OAuth params:', {
        hasAccessToken: !!accessToken,
        accountUsername,
        accountId
      });

      if (accessToken) {
        // Store the token in the auth service
        authService.storeImgurToken({
          access_token: accessToken,
          refresh_token: refreshToken || '',
          expires_in: parseInt(expiresIn || '0', 10),
          token_type: tokenType || 'bearer',
          account_username: accountUsername || '',
          account_id: parseInt(accountId || '0', 10)
        });

        console.log('[AuthProvider] Successfully authenticated with Imgur, stored token');

        // Update auth state directly without reload
        setIsAuthenticated(true);

        // Clean the hash from URL by navigating without it
        const cleanPath = window.location.pathname + window.location.search;
        console.log('[AuthProvider] Cleaning URL, navigating to:', cleanPath || '/');
        navigate(cleanPath || '/', { replace: true });
      } else {
        console.error('[AuthProvider] No access token found in Imgur callback');
      }
    } catch (error) {
      console.error('[AuthProvider] Error handling Imgur OAuth callback:', error);
    }
  }, [navigate]);

  // Combined auth check: handles callbacks and initial auth state
  useEffect(() => {
    const initAuth = async () => {
      console.log('[AuthProvider] initAuth - URL:', window.location.href);

      // Priority 1: Check if this is an Auth0 callback
      if (window.location.search.includes('code=') &&
          window.location.search.includes('state=')) {

        // Prevent duplicate processing in StrictMode
        if (callbackProcessedRef.current) {
          console.log('[AuthProvider] Skipping duplicate Auth0 callback processing');
          return;
        }
        callbackProcessedRef.current = true;

        try {
          console.log('[AuthProvider] Processing Auth0 callback');
          setIsLoading(true);

          // Handle the Auth0 callback and get the returnTo URL
          const { user: userProfile, returnTo } = await authService.handleCallback();

          // Update the user state
          setUser(userProfile);
          setIsAuthenticated(true);

          // Always navigate to clean up the URL (removes code/state params)
          if (returnTo && returnTo !== '/') {
            try {
              // Ensure returnTo is a valid path on our domain
              const url = new URL(returnTo, window.location.origin);
              if (url.origin === window.location.origin) {
                console.log('[AuthProvider] Navigating to returnTo:', url.pathname + url.search);
                navigate(url.pathname + url.search, { replace: true });
              } else {
                console.log('[AuthProvider] Invalid origin, navigating to home');
                navigate('/', { replace: true });
              }
            } catch (e) {
              console.error('Invalid returnTo URL, redirecting to home:', e);
              navigate('/', { replace: true });
            }
          } else {
            // No returnTo or returnTo is root - navigate to root to clean URL
            console.log('[AuthProvider] No returnTo, navigating to home');
            navigate('/', { replace: true });
          }
        } catch (error) {
          console.error('Error handling Auth0 callback:', error);
          setIsAuthenticated(false);
          setIsLoading(false);
          navigate('/login', { replace: true });
        } finally {
          setIsLoading(false);
        }
        return; // Exit early after handling callback
      }

      // Priority 2: Check for Imgur OAuth callback in the URL hash
      if (window.location.hash.includes('access_token=')) {
        console.log('[AuthProvider] Processing Imgur OAuth callback');
        await handleImgurCallback(window.location.hash);
        setIsLoading(false);
        return; // Exit early after handling callback
      }

      // Priority 3: Normal auth check (not a callback)
      try {
        console.log('[AuthProvider] Checking authentication status');
        const isAuth = await authService.isAuthenticated();
        setIsAuthenticated(isAuth);

        if (isAuth) {
          const userProfile = await authService.getUserProfile();
          setUser(userProfile);
          console.log('[AuthProvider] User authenticated:', userProfile?.email);
        } else {
          console.log('[AuthProvider] User not authenticated');
        }
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [navigate, handleImgurCallback]); // Only run on mount

  const login = async (returnToPath?: string) => {
    try {
      // Determine the return path - use the provided one, or current location, or root
      let returnTo = returnToPath;
      if (!returnTo || returnTo === '/login') {
        returnTo = location.pathname === '/login' ? '/' : location.pathname + location.search;
      }
      
      // Ensure returnTo is a relative path and doesn't contain multiple returnTo params
      try {
        const url = new URL(returnTo, window.location.origin);
        if (url.origin === window.location.origin) {
          // Remove any existing returnTo parameters to prevent loops
          const params = new URLSearchParams(url.search);
          params.delete('returnTo');
          returnTo = url.pathname + (params.toString() ? `?${params.toString()}` : '');
        } else {
          // If it's an external URL, default to root
          returnTo = '/';
        }
      } catch (e) {
        console.error('Invalid returnTo URL, defaulting to /');
        returnTo = '/';
      }
      
      // If we're already on the login page, don't include the current path as returnTo
      if (location.pathname === '/login') {
        returnTo = '/';
      }
      
      // Call the auth service with the cleaned up returnTo URL
      await authService.login(returnTo);
    } catch (error) {
      console.error('Login error:', error);
      // Redirect to home on error
      navigate('/');
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setIsAuthenticated(false);
      setUser(null);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      setIsAuthenticated(false);
      setUser(null);
      navigate('/');
    }
  };

  const getToken = async () => {
    try {
      return await authService.getValidToken();
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  };

  const value = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
