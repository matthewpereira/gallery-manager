import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';

export const Login = () => {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  useEffect(() => {
    const loginWithAuth0 = async () => {
      try {
        // Don't handle callbacks here - AuthProvider handles all callbacks
        // Just initiate login if we're not in a callback flow
        if (!window.location.search.includes('code=')) {
          // Redirect to Auth0 login - just pass the returnTo path
          await authService.login(returnTo);
        }
        // If we have code=, do nothing - AuthProvider will handle it
      } catch (error) {
        console.error('Login error:', error);
      }
    };

    loginWithAuth0();
  }, [returnTo]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Signing in...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Redirecting to the login page
          </p>
        </div>
        <div className="mt-8 flex justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
        </div>
      </div>
    </div>
  );
};

export default Login;
