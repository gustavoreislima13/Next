import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Safely retrieve the API key from environment variables
  // Priority: VITE_API_KEY -> API_KEY
  // Security: Only expose keys starting with 'AIza' (browser keys). Block other formats (service accounts).
  const getSafeApiKey = () => {
    const rawKey = env.VITE_API_KEY || env.API_KEY || '';
    if (rawKey && rawKey.startsWith('AIza')) {
      return rawKey;
    }
    return '';
  };

  return {
    plugins: [react()],
    define: {
      // Expose process.env.API_KEY manually for the SDK code guidelines.
      // We explicitly set it to the safe version.
      'process.env.API_KEY': JSON.stringify(getSafeApiKey())
    }
  };
});
