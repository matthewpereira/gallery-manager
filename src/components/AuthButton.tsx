import React from 'react';
import { authService } from '../services/auth';

interface AuthButtonProps {
  isAuthenticated: boolean;
  onAuthChange: (authenticated: boolean) => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({ 
  isAuthenticated, 
  onAuthChange 
}) => {
  const handleLogin = () => {
    const authUrl = authService.getAuthUrl();
    window.location.href = authUrl;
  };

  const handleLogout = () => {
    authService.logout();
    onAuthChange(false);
  };

  if (isAuthenticated) {
    return (
      <button 
        onClick={handleLogout}
        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
      >
        Logout
      </button>
    );
  }

  return (
    <button 
      onClick={handleLogin}
      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
    >
      Connect to Imgur
    </button>
  );
};
