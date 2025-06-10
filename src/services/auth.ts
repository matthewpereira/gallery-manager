import type { ImgurAuthToken } from '../types/imgur';

class AuthService {
  private readonly clientId = import.meta.env.VITE_IMGUR_CLIENT_ID;
  private readonly clientSecret = import.meta.env.VITE_IMGUR_CLIENT_SECRET;
  private readonly redirectUri = import.meta.env.VITE_IMGUR_REDIRECT_URI;
  private readonly storageKey = 'imgur_auth_token';

  constructor() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      console.warn('Imgur API credentials not configured. Please check your .env file.');
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state: this.generateState(),
    });

    return `https://api.imgur.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<ImgurAuthToken> {
    const formData = new FormData();
    formData.append('client_id', this.clientId);
    formData.append('client_secret', this.clientSecret);
    formData.append('grant_type', 'authorization_code');
    formData.append('code', code);
    formData.append('redirect_uri', this.redirectUri);

    const response = await fetch('https://api.imgur.com/oauth2/token', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      throw new Error(`Failed to exchange authorization code for token: ${response.status} ${errorText}`);
    }

    const token: ImgurAuthToken = await response.json();
    this.saveToken(token);
    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<ImgurAuthToken> {
    const currentToken = this.getToken();
    if (!currentToken?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const formData = new FormData();
    formData.append('refresh_token', currentToken.refresh_token);
    formData.append('client_id', this.clientId);
    formData.append('client_secret', this.clientSecret);
    formData.append('grant_type', 'refresh_token');

    const response = await fetch('https://api.imgur.com/oauth2/token', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const newToken: ImgurAuthToken = await response.json();
    this.saveToken(newToken);
    return newToken;
  }

  /**
   * Save token to localStorage
   */
  private saveToken(token: ImgurAuthToken): void {
    const tokenWithExpiry = {
      ...token,
      expires_at: Date.now() + (token.expires_in * 1000),
    };
    localStorage.setItem(this.storageKey, JSON.stringify(tokenWithExpiry));
  }

  /**
   * Get token from localStorage
   */
  getToken(): (ImgurAuthToken & { expires_at: number }) | null {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  /**
   * Check if user is authenticated and token is valid
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired (with 5 minute buffer)
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() < (token.expires_at - fiveMinutes);
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    const token = this.getToken();
    if (!token) return null;

    if (this.isAuthenticated()) {
      return token.access_token;
    }

    // Try to refresh token
    try {
      const newToken = await this.refreshToken();
      return newToken.access_token;
    } catch {
      // Refresh failed, user needs to re-authenticate
      this.logout();
      return null;
    }
  }

  /**
   * Clear stored token
   */
  logout(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Generate random state for OAuth security
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

export const authService = new AuthService();
