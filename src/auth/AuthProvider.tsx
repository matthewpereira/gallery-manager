import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

        // Remove the hash from the URL and navigate to home
        const cleanPath = window.location.pathname + window.location.search;
        console.log('[AuthProvider] Redirecting to:', cleanPath || '/');

        // Use navigate instead of window.location to avoid full page reload
        navigate(cleanPath || '/', { replace: true });

        // Force a small delay to ensure storage is complete before reload
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        console.error('[AuthProvider] No access token found in Imgur callback');
      }
    } catch (error) {
      console.error('[AuthProvider] Error handling Imgur OAuth callback:', error);
    }
  }, [navigate]);

  // Handle the Auth0 callback after redirect
  useEffect(() => {
    const handleAuthCallback = async () => {
      // Check if this is a callback from Auth0
      if (window.location.search.includes('code=') && 
          window.location.search.includes('state=')) {
        try {
          setIsLoading(true);
          
          // Handle the Auth0 callback and get the returnTo URL
          const { user: userProfile, returnTo } = await authService.handleCallback();
          
          // Update the user state
          setUser(userProfile);
          setIsAuthenticated(true);
          
          // Navigate to the returnTo URL if it's different from the current path
          if (returnTo && returnTo !== window.location.pathname) {
            try {
              // Ensure returnTo is a valid path on our domain
              const url = new URL(returnTo, window.location.origin);
              if (url.origin === window.location.origin) {
                navigate(url.pathname + url.search, { replace: true });
              } else {
                navigate('/', { replace: true });
              }
            } catch (e) {
              console.error('Invalid returnTo URL, redirecting to home:', e);
              navigate('/', { replace: true });
            }
          }
        } catch (error) {
          console.error('Error handling Auth0 callback:', error);
          setIsAuthenticated(false);
          navigate('/login', { replace: true });
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    handleAuthCallback();
  }, [navigate]);
  
  // Check authentication status on mount and on location change
  useEffect(() => {
    const checkAuth = async () => {
      console.log('[AuthProvider] checkAuth - URL:', window.location.href);
      console.log('[AuthProvider] checkAuth - Hash:', window.location.hash);
      console.log('[AuthProvider] checkAuth - Search:', window.location.search);

      // Skip if we're in the middle of handling an Auth0 callback
      if (window.location.search.includes('code=') &&
          window.location.search.includes('state=')) {
        console.log('[AuthProvider] Skipping checkAuth - Auth0 callback in progress');
        return;
      }

      // Check for Imgur OAuth callback in the URL hash
      if (window.location.hash.includes('access_token=')) {
        console.log('[AuthProvider] Detected Imgur OAuth callback in hash');
        await handleImgurCallback(window.location.hash);
        return;
      }

      try {
        const isAuth = await authService.isAuthenticated();
        setIsAuthenticated(isAuth);
        
        if (isAuth) {
          const userProfile = await authService.getUserProfile();
          setUser(userProfile);
          
          // Only process returnTo if we're not already on the target page
          const params = new URLSearchParams(location.search);
          const returnTo = params.get('returnTo');
          
          if (returnTo && returnTo !== location.pathname) {
            try {
              const url = new URL(returnTo, window.location.origin);
              if (url.origin === window.location.origin) {
                // Remove the returnTo parameter to prevent loops
                params.delete('returnTo');
                const newSearch = params.toString();
                const returnPath = url.pathname + (newSearch ? `?${newSearch}` : '');
                
                if (returnPath !== location.pathname + location.search) {
                  navigate(returnPath, { replace: true });
                }
              }
            } catch (e) {
              console.error('Invalid returnTo URL:', returnTo);
            }
          }
        } else if (!['/login', '/callback', '/'].includes(location.pathname)) {
          // Only redirect to login if not already on login, callback, or home page
          const returnTo = location.pathname + location.search;
          if (returnTo !== '/login' && returnTo !== window.location.pathname + window.location.search) {
            navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          }
        }
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setIsAuthenticated(false);
        
        // If there's an error, redirect to login
        if (!['/login', '/callback'].includes(location.pathname)) {
          const returnTo = location.pathname + location.search;
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
    
    // Set up an interval to check authentication status periodically
    const intervalId = setInterval(checkAuth, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, [location, navigate]);

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
