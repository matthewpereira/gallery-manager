interface Auth0Config {
  domain: string;
  clientId: string;
  authorizationParams: {
    redirect_uri: string;
    audience: string;
  };
  isConfigured: boolean;
}

export const auth0Config: Auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
  authorizationParams: {
    redirect_uri: import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
  },
  isConfigured: Boolean(
    import.meta.env.VITE_AUTH0_DOMAIN &&
    import.meta.env.VITE_AUTH0_CLIENT_ID &&
    import.meta.env.VITE_AUTH0_AUDIENCE
  ),
} as const;

if (!auth0Config.isConfigured) {
  console.error('Auth0 configuration is incomplete. Please check your .env file.');
}
