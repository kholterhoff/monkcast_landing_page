#!/usr/bin/env node

/**
 * Clear Build Cache Script
 * 
 * Utility to clear the build cache and force a full rebuild
 */

import { existsSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const cacheDir = join(rootDir, '.astro');
const buildCacheFile = join(cacheDir, 'build-cache.json');
const distDir = join(rootDir, 'dist');

console.log('🧹 Clearing MonkCast Build Cache');
console.log('=================================');

try {
  // Clear build cache file
  if (existsSync(buildCacheFile)) {
    unlinkSync(buildCacheFile);
    console.log('✅ Build cache file cleared');
  } else {
    console.log('ℹ️  No build cache file found');
  }
  
  // Clear dist directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log('✅ Dist directory cleared');
  } else {
    console.log('ℹ️  No dist directory found');
  }
  
  // Clear Astro cache
  const astroCacheDir = join(rootDir, '.astro');
  if (existsSync(astroCacheDir)) {
    // Keep the directory but clear cache files
    const cacheFiles = [
      'content-assets.mjs',
      'content-modules.mjs',
      'content.d.ts',
      'data-store.json',
      'types.d.ts'
    ];
    
    cacheFiles.forEach(file => {
      const filePath = join(astroCacheDir, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`✅ Cleared ${file}`);
      }
    });
  }
  
  console.log('');
  console.log('🎉 Cache cleared successfully!');
  console.log('💡 Next build will be a full rebuild');
  
} catch (error) {
  console.error('❌ Failed to clear cache:', error.message);
  process.exit(1);
}