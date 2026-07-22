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
          // The Export Engine's PDF stack (@react-pdf/renderer plus its
          // font-shaping/layout/compression subtree — fontkit, brotli,
          // unicode-trie, yoga-layout, @noble/*, etc.) is only ever reached
          // through dynamic import() (see
          // components/weekly/WeeklyReportExportButton.jsx). It gets its own
          // chunk name, separate from the generic 'vendor' bucket below, so
          // Rollup doesn't merge it into code that IS loaded eagerly and
          // defeat the lazy-loading — see the (deep, version-shifting)
          // package list below rather than a single scoped-package check,
          // since most of the actual size comes from unscoped transitive
          // dependencies of @react-pdf/pdfkit and @react-pdf/font.
          if (/[\\/]node_modules[\\/](@react-pdf|@noble[\\/]hashes|@noble[\\/]ciphers|fontkit|yoga-layout|brotli|restructure|unicode-trie|unicode-properties|tiny-inflate|browserify-zlib|png-js|jay-peg|linebreak|bidi-js|hyphen|dfa|deep-equal|clone|base64-js|js-md5|is-url|queue|emoji-regex-xs|abs-svg-path|color-string|normalize-svg-path|parse-svg-path|svg-arc-to-cubic-bezier|vite-compatible-readable-stream)[\\/]/.test(id)) {
            return 'vendor-pdf';
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
