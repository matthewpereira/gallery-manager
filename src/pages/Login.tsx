import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authService } from '../services/auth';

export const Login = () => {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  useEffect(() => {
    const loginWithAuth0 = async () => {
      try {
        // Check if we're in the callback from Auth0
        if (window.location.search.includes('code=')) {
          // Handle the callback from Auth0
          await authService.handleCallback();
          window.location.href = returnTo;
        } else {
          // Redirect to Auth0 login
          const redirectUri = `${window.location.origin}?returnTo=${encodeURIComponent(returnTo)}`;
          await authService.login(redirectUri);
        }
      } catch (error) {
        console.error('Login error:', error);
        // Redirect to home on error
        window.location.href = '/';
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
