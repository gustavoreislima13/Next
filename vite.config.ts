import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Expose process.env.API_KEY manually if needed, or rely on VITE_ prefix variables
    // For Vercel, system env vars are not automatically exposed to client unless prefixed with VITE_.
    // However, the provided SDK code guidelines use process.env.API_KEY. 
    // We map it here to ensure it works if the user sets VITE_API_KEY in Vercel.
    'process.env.API_KEY': JSON.stringify(process.env.VITE_API_KEY || process.env.API_KEY || '')
  }
});