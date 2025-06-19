import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  // Add these to fix the URL issue
  trailingSlash: 'never',
  output: 'static',
  build: {
    format: 'file',
    rollupOptions: {
      external: ['@astrojs/rss']
    }
  }
});