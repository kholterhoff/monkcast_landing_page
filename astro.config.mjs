import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  // Add these to fix the URL issue
  trailingSlash: 'never',
  output: 'static',
  site: 'https://monkcast.netlify.app',
  build: {
    format: 'file',
    // Enable incremental builds
    assets: '_astro',
    // Optimize for incremental builds
    inlineStylesheets: 'auto',
    // Split chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'episode-utils': ['src/utils/buildCache.ts', 'src/services/incrementalRss.ts'],
          'error-handling': ['src/utils/errorBoundary.ts']
        }
      }
    }
  },
  // Vite configuration for build optimization
  vite: {
    build: {
      // Enable build caching
      rollupOptions: {
        cache: true
      }
    }
  },
  // Experimental features for better incremental builds
  experimental: {
    contentCollectionCache: true
  }
});