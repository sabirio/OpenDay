import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/src/lib/supabase') ||
            id.includes('\\src\\lib\\supabase') ||
            id.includes('/src/services/') ||
            id.includes('\\src\\services\\')
          ) {
            return 'vendor-supabase';
          }
          if (
            id.includes('@supabase') ||
            id.includes('_supabase') ||
            id.includes('supabase-js') ||
            id.includes('gotrue-js') ||
            id.includes('postgrest-js') ||
            id.includes('realtime-js') ||
            id.includes('storage-js')
          ) {
            return 'vendor-supabase';
          }
          if (/[\\/]react([\\/]|$)/.test(id) || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules')) {
            if (/[\\/]node_modules[\\/](recharts|lucide-react)[\\/]/.test(id)) {
              return 'vendor-ui';
            }
            return 'vendor';
          }
          if (id.includes('/src/engines/') || id.includes('\\src\\engines\\')) {
            return 'engines';
          }
          if (id.includes('/src/pages/') || id.includes('\\src\\pages\\')) {
            const name = id.split(/[\\/]/).pop()?.replace(/\.[jt]sx?$/, '');
            return name ? `page-${name}` : 'pages';
          }
        },
      },
    },
  },
})
