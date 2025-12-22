import { Auth0Client } from '@auth0/auth0-spa-js';
import type { User } from '@auth0/auth0-react';

export type ServiceType = 'auth0' | 'imgur';

interface ImgurAuthToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  account_username: string;
  account_id: number;
}

class AuthService {
  // Auth0 Configuration
  private readonly auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  private readonly auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
  private readonly auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  private readonly auth0RedirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI;
  private auth0Client: Auth0Client | null = null;
  private isAuth0Initialized = false;

  // Imgur Configuration
  private readonly imgurClientId = import.meta.env.VITE_IMGUR_CLIENT_ID;
  private readonly imgurClientSecret = import.meta.env.VITE_IMGUR_CLIENT_SECRET;
  private imgurToken: ImgurAuthToken | null = null;
  private readonly imgurTokenKey = 'imgur_auth_token';

  constructor() {
    if (!this.auth0ClientId) {
      throw new Error('Auth0 Client ID is not configured');
    }

    if (typeof window !== 'undefined') {
      this.initializeAuth0();
    }
  }

  private async initializeAuth0() {
    if (this.isAuth0Initialized) return;

    // Ensure we use the environment variable for redirect URI
    const redirectUri = this.auth0RedirectUri || window.location.origin;

    console.log('Auth0 Initialization:', {
      mode: import.meta.env.MODE,
      configuredRedirectUri: this.auth0RedirectUri,
      windowOrigin: window.location.origin,
      actualRedirectUri: redirectUri,
      domain: this.auth0Domain,
    });

    this.auth0Client = new Auth0Client({
      domain: this.auth0Domain,
      clientId: this.auth0ClientId,
      authorizationParams: {
        redirect_uri: redirectUri,
        audience: this.auth0Audience,
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });

    this.isAuth0Initialized = true;
  }

  /**
   * Initiate the Auth0 login flow
   * @param returnToPath The path to redirect to after login (should be a relative path)
   */
  async login(returnToPath: string = '/') {
    if (!this.auth0Client) await this.initializeAuth0();
    
    // Clean up the returnTo path to prevent redirect loops
    let returnTo = returnToPath;
    try {
      // Parse the URL to ensure it's a relative path
      const url = new URL(returnTo, window.location.origin);
      if (url.origin === window.location.origin) {
        // If it's a same-origin URL, use just the path and search params
        returnTo = url.pathname + url.search;
        
        // Remove any existing returnTo parameters to prevent loops
        const params = new URLSearchParams(url.search);
        params.delete('returnTo');
        if (params.toString()) {
          returnTo = `${url.pathname}?${params.toString()}`;
        } else {
          returnTo = url.pathname;
        }
      } else {
        // If it's an external URL, default to root
        returnTo = '/';
      }
    } catch (e) {
      console.error('Invalid returnTo URL, defaulting to /');
      returnTo = '/';
    }
    
    // Ensure returnTo is not empty
    if (!returnTo || returnTo === '/login') {
      returnTo = '/';
    }

    console.log('Initiating login with returnTo:', returnTo);

    await this.auth0Client?.loginWithRedirect({
      appState: { returnTo },
    });
  }

  /**
   * Handle the Auth0 callback after redirect
   * @returns An object containing the user and the returnTo URL from appState if available
   */
  async handleCallback() {
    if (!this.auth0Client) await this.initializeAuth0();
    if (!this.auth0Client) {
      throw new Error('Auth0 client not initialized');
    }
    
    try {
      // Handle the redirect from Auth0 and get the appState
      const result = await this.auth0Client.handleRedirectCallback();
      const appState = result?.appState as { returnTo?: string } | undefined;
      
      // Get the user info
      const user = await this.auth0Client.getUser();
      if (!user) {
        throw new Error('Failed to get user information');
      }
      
      // Clean up the URL by removing the Auth0 callback parameters
      const returnTo = appState?.returnTo || '/';
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (returnTo === '/' ? '' : returnTo)
      );
      
      return { 
        user, 
        returnTo,
        appState 
      };
    } catch (error) {
      console.error('Error handling Auth0 callback:', error);
      // Clean up the URL even if there's an error
      window.history.replaceState({}, document.title, window.location.pathname);
      throw error;
    }
  }

  /**
   * Get the current user's profile from Auth0
   */
  async getUserProfile(): Promise<User | undefined> {
    try {
      if (!this.auth0Client) await this.initializeAuth0();
      return await this.auth0Client?.getUser();
    } catch (error) {
      console.error('Error getting user profile:', error);
      return undefined;
    }
  }

  /**
   * Check if user is authenticated using Auth0
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      if (!this.auth0Client) await this.initializeAuth0();
      return await this.auth0Client?.isAuthenticated() || false;
    } catch (error) {
      console.error('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Get valid access token for the specified service
   */
  async getValidToken(service: ServiceType = 'auth0'): Promise<string | null> {
    if (service === 'imgur') {
      console.log('[AuthService] Getting Imgur token');
      return this.getImgurToken();
    }
    
    // Default to Auth0 for any other service
    try {
      if (!this.auth0Client) await this.initializeAuth0();
      const isAuthenticated = await this.auth0Client?.isAuthenticated();
      
      if (isAuthenticated) {
        console.log('[AuthService] Getting Auth0 token');
        const token = await this.auth0Client?.getTokenSilently();
        console.log('[AuthService] Got Auth0 token:', token ? '***' + token.slice(-5) : 'null');
        return token || null;
      }
      console.log('[AuthService] Not authenticated with Auth0');
      return null;
    } catch (error) {
      console.error('[AuthService] Error getting Auth0 access token:', error);
      return null;
    }
  }

  /**
   * Get Imgur access token
   */
  private async getImgurToken(): Promise<string | null> {
    // Try to get token from memory
    if (this.imgurToken) {
      console.log('[AuthService] Using in-memory Imgur token');
      return this.imgurToken.access_token;
    }

    // Try to load from localStorage
    const storedToken = localStorage.getItem(this.imgurTokenKey);
    if (storedToken) {
      try {
        const token = JSON.parse(storedToken);
        // Check if token is expired
        if (token.expires_at > Date.now()) {
          console.log('[AuthService] Using stored Imgur token, expires at:', new Date(token.expires_at).toISOString());
          this.imgurToken = token;
          return token.access_token;
        }
        console.log('[AuthService] Imgur token expired, refreshing...');
        // Token expired, try to refresh
        return this.refreshImgurToken(token.refresh_token);
      } catch (error) {
        console.error('Error parsing stored Imgur token:', error);
        localStorage.removeItem(this.imgurTokenKey);
      }
    }

    // No valid token found
    console.log('[AuthService] No valid Imgur token found, falling back to client ID');
    return this.imgurClientId; // Fall back to client ID for public endpoints
  }

  /**
   * Refresh Imgur access token using refresh token
   */
  private async refreshImgurToken(refreshToken: string): Promise<string | null> {
    console.log('[AuthService] Refreshing Imgur token...');
    try {
      const response = await fetch('https://api.imgur.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: this.imgurClientId,
          client_secret: this.imgurClientSecret,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const tokenData = await response.json();
      console.log('[AuthService] Successfully refreshed Imgur token, expires in:', tokenData.expires_in, 'seconds');
      return this.storeImgurToken(tokenData);
    } catch (error) {
      console.error('Error refreshing Imgur token:', error);
      // Clear invalid refresh token
      this.imgurToken = null;
      localStorage.removeItem(this.imgurTokenKey);
      return null;
    }
  }

  /**
   * Store Imgur token and return access token
   * This method is public to allow the AuthProvider to store tokens from OAuth redirects
   */
  public storeImgurToken(tokenData: any): string {
    const token = {
      ...tokenData,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
    };
    
    this.imgurToken = token;
    localStorage.setItem(this.imgurTokenKey, JSON.stringify(token));
    return token.access_token;
  }

  /**
   * Logout from all services
   */
  async logout(): Promise<void> {
    // Clear Imgur token
    this.imgurToken = null;
    localStorage.removeItem(this.imgurTokenKey);

    // Logout from Auth0
    if (this.auth0Client) {
      const logoutRedirectUri = this.auth0RedirectUri || window.location.origin;
      await this.auth0Client.logout({
        logoutParams: {
          returnTo: logoutRedirectUri,
        },
      });
    }
  }

  /**
   * Handle Imgur OAuth callback
   */
  async handleImgurCallback(code: string): Promise<void> {
    try {
      const response = await fetch('https://api.imgur.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.imgurClientId,
          client_secret: this.imgurClientSecret,
          grant_type: 'authorization_code',
          code: code,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = await response.json();
      this.storeImgurToken(tokenData);
    } catch (error) {
      console.error('Error handling Imgur OAuth callback:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();
