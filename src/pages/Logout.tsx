import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const Logout = () => {
  const { logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      // If authenticated, log out
      logout();
    } else {
      // If not authenticated, redirect to home
      navigate('/');
    }
  }, [isAuthenticated, logout, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Signing out...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You are being signed out of your account
          </p>
        </div>
        <div className="mt-8 flex justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
        </div>
      </div>
    </div>
  );
};

export default Logout;
