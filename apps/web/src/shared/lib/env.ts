export interface PublicWebEnv {
  readonly apiBaseUrl: string;
  readonly appName: string;
}

export function getPublicEnv(): PublicWebEnv {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
    appName: import.meta.env.VITE_APP_NAME || 'Tap',
  };
}
