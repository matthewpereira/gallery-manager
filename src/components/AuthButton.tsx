import React from 'react';
import { LogIn, LogOut } from 'lucide-react';
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
        className="flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    );
  }

  return (
    <button 
      onClick={handleLogin}
      className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-md transition-colors font-medium"
    >
      <LogIn className="w-4 h-4" />
      Connect to Imgur
    </button>
  );
};
