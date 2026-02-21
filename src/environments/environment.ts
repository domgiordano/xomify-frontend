export const environment = {
  production: true,
  baseCallbackUrl: 'https://xomify.xomware.com',
  spotifyClientId: '---',
  spotifyClientSecret: '---',
  apiAuthToken: '---',
  apiId: '---',
  get xomifyApiUrl(): string {
    return `https://${this.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  },
  logoBase64: '---',
};
