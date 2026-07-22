import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Library mode: tek IIFE dosyası. Host sayfaya <script> ile girer,
// custom element'i kendisi kaydeder. Preact bundle'a gömülür (external değil).
export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'GreenGoldWidget',
      formats: ['iife'],
      fileName: () => 'green-gold-widget.v1.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    // CSS Shadow DOM içine JS'ten enjekte edildiği için ayrı .css çıktısı yok.
    cssCodeSplit: false,
  },
});
