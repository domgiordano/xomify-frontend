// Environment configuration - EXAMPLE
// Copy this file to environment.dev.ts and fill in your values
// environment.dev.ts is gitignored so your secrets stay local

export const environment = {
  production: false,
  baseCallbackUrl: 'http://localhost:4200',
  spotifyClientId: 'YOUR_SPOTIFY_CLIENT_ID',
  spotifyClientSecret: 'YOUR_SPOTIFY_CLIENT_SECRET',
  apiAuthToken: 'YOUR_API_AUTH_TOKEN',
  apiId: 'YOUR_API_GATEWAY_ID',
  get xomifyApiUrl(): string {
    return `https://${this.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  },
  logoBase64: 'YOUR_BASE64_ENCODED_LOGO',
};
