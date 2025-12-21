import { useState, useEffect } from 'react';
import { authService } from '../services/auth';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await authService.isAuthenticated();
        setIsAuthenticated(isAuth);
        
        if (isAuth) {
          const userProfile = await authService.getUserProfile();
          setUser(userProfile);
        }
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = () => {
    // This will be handled by the Auth0Provider in the app
    window.location.href = '/login';
  };

  const logout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  const getToken = async () => {
    try {
      return await authService.getValidToken();
    } catch (error) {
      console.error('Error getting access token', error);
      return null;
    }
  };

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    getToken,
  };
};
