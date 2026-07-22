import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Test yapılandırması build (lib IIFE) config'inden ayrı: jsdom ortamı + preact.
export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
