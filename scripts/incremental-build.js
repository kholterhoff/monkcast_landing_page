#!/usr/bin/env node

/**
 * Incremental Build Script for MonkCast
 * 
 * This script implements intelligent build strategies based on episode count:
 * - Full builds for small episode counts (< 100 episodes)
 * - Incremental builds for medium counts (100-500 episodes)
 * - Paginated builds for large counts (> 500 episodes)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const cacheDir = join(rootDir, '.astro');
const buildCacheFile = join(cacheDir, 'build-cache.json');

// Build configuration
const BUILD_CONFIG = {
  SMALL_THRESHOLD: 100,      // Full builds below this
  LARGE_THRESHOLD: 500,      // Paginated builds above this
  MAX_EPISODES_PER_BUILD: 50, // Episodes per incremental build
  CACHE_VALIDITY_HOURS: 6,   // Cache validity in hours
  PARALLEL_BUILDS: 3         // Number of parallel build processes
};

// Environment variables
const FORCE_FULL_BUILD = process.env.FORCE_FULL_BUILD === 'true';
const CI_BUILD = process.env.CI === 'true';
const MAX_EPISODES = process.env.MAX_EPISODES_PER_BUILD ? 
  parseInt(process.env.MAX_EPISODES_PER_BUILD, 10) : 
  BUILD_CONFIG.MAX_EPISODES_PER_BUILD;

console.log('🚀 MonkCast Incremental Build System');
console.log('=====================================');

async function main() {
  try {
    // Ensure cache directory exists
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // Load build cache
    const buildCache = loadBuildCache();
    
    // Get episode count and determine build strategy
    const episodeCount = await getEpisodeCount();
    const buildStrategy = determineBuildStrategy(episodeCount, buildCache);
    
    console.log(`📊 Episodes: ${episodeCount}`);
    console.log(`🎯 Strategy: ${buildStrategy.type}`);
    console.log(`⚡ Incremental: ${buildStrategy.incremental ? 'Yes' : 'No'}`);
    
    if (buildStrategy.batches) {
      console.log(`📦 Batches: ${buildStrategy.batches}`);
    }

    // Execute build strategy
    const buildResult = await executeBuildStrategy(buildStrategy, buildCache);
    
    // Update build cache
    updateBuildCache(buildCache, buildResult);
    
    console.log('✅ Build completed successfully!');
    console.log(`⏱️  Total time: ${buildResult.totalTime}ms`);
    console.log(`📈 Episodes built: ${buildResult.episodesBuilt}`);
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Load build cache from file
function loadBuildCache() {
  if (!existsSync(buildCacheFile)) {
    return {
      version: '1.0.0',
      lastFullBuild: 0,
      lastIncrementalBuild: 0,
      totalEpisodes: 0,
      builtEpisodes: {},
      buildHistory: []
    };
  }

  try {
    const cacheData = readFileSync(buildCacheFile, 'utf8');
    return JSON.parse(cacheData);
  } catch (error) {
    console.warn('⚠️  Failed to load build cache, starting fresh');
    return {
      version: '1.0.0',
      lastFullBuild: 0,
      lastIncrementalBuild: 0,
      totalEpisodes: 0,
      builtEpisodes: {},
      buildHistory: []
    };
  }
}

// Save build cache to file
function saveBuildCache(cache) {
  try {
    writeFileSync(buildCacheFile, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn('⚠️  Failed to save build cache:', error.message);
  }
}

// Get current episode count from RSS feed
async function getEpisodeCount() {
  try {
    // Fetch the RSS feed directly and count items
    const RSS_URL = 'https://api.riverside.fm/hosting/tBthkY3f.rss';
    const result = execSync(
      `node -e "fetch('${RSS_URL}').then(r=>r.text()).then(xml=>{const m=xml.match(/<item>/g);console.log(m?m.length:0)}).catch(()=>console.log(0))"`,
      { cwd: rootDir, encoding: 'utf8', timeout: 30000 }
    );
    return parseInt(result.trim(), 10) || 0;
  } catch (error) {
    console.warn('⚠️  Failed to get episode count, assuming 0');
    return 0;
  }
}

// Determine build strategy based on episode count and cache
function determineBuildStrategy(episodeCount, buildCache) {
  const now = Date.now();
  const cacheAge = now - buildCache.lastFullBuild;
  const cacheValidityMs = BUILD_CONFIG.CACHE_VALIDITY_HOURS * 60 * 60 * 1000;
  const isCacheStale = cacheAge > cacheValidityMs;
  
  // Force full build conditions
  if (FORCE_FULL_BUILD || isCacheStale || episodeCount <= BUILD_CONFIG.SMALL_THRESHOLD) {
    return {
      type: 'full',
      incremental: false,
      episodeCount,
      reason: FORCE_FULL_BUILD ? 'forced' : isCacheStale ? 'stale-cache' : 'small-count'
    };
  }
  
  // Large episode count - use pagination
  if (episodeCount > BUILD_CONFIG.LARGE_THRESHOLD) {
    const batches = Math.ceil(episodeCount / MAX_EPISODES);
    return {
      type: 'paginated',
      incremental: true,
      episodeCount,
      batches,
      episodesPerBatch: MAX_EPISODES,
      reason: 'large-count'
    };
  }
  
  // Medium episode count - incremental build
  return {
    type: 'incremental',
    incremental: true,
    episodeCount,
    maxEpisodes: MAX_EPISODES,
    reason: 'medium-count'
  };
}

// Execute the determined build strategy
async function executeBuildStrategy(strategy, buildCache) {
  const startTime = Date.now();
  
  switch (strategy.type) {
    case 'full':
      return await executeFullBuild(strategy, startTime);
      
    case 'incremental':
      return await executeIncrementalBuild(strategy, buildCache, startTime);
      
    case 'paginated':
      return await executePaginatedBuild(strategy, buildCache, startTime);
      
    default:
      throw new Error(`Unknown build strategy: ${strategy.type}`);
  }
}

// Execute full build
async function executeFullBuild(strategy, startTime) {
  console.log('🔨 Executing full build...');
  
  // Set environment variables for full build
  const env = {
    ...process.env,
    BUILD_STRATEGY: 'full',
    FORCE_FULL_BUILD: 'true'
  };
  
  execSync('npm run build:astro', { 
    cwd: rootDir, 
    stdio: 'inherit',
    env 
  });
  
  return {
    strategy: 'full',
    episodesBuilt: strategy.episodeCount,
    totalTime: Date.now() - startTime,
    success: true
  };
}

// Execute incremental build
async function executeIncrementalBuild(strategy, buildCache, startTime) {
  console.log('🔄 Executing incremental build...');
  
  // Set environment variables for incremental build
  const env = {
    ...process.env,
    BUILD_STRATEGY: 'incremental',
    MAX_EPISODES_PER_BUILD: strategy.maxEpisodes.toString(),
    LAST_BUILD_TIME: buildCache.lastIncrementalBuild.toString()
  };
  
  execSync('npm run build:astro', { 
    cwd: rootDir, 
    stdio: 'inherit',
    env 
  });
  
  return {
    strategy: 'incremental',
    episodesBuilt: Math.min(strategy.episodeCount, strategy.maxEpisodes),
    totalTime: Date.now() - startTime,
    success: true
  };
}

// Execute paginated build
async function executePaginatedBuild(strategy, buildCache, startTime) {
  console.log('📄 Executing paginated build...');
  
  const results = [];
  const batchSize = strategy.episodesPerBatch;
  
  // Determine which batch to build (round-robin based on time)
  const currentBatch = getCurrentBatchNumber(strategy.batches);
  
  console.log(`📦 Building batch ${currentBatch}/${strategy.batches}`);
  
  // Set environment variables for paginated build
  const env = {
    ...process.env,
    BUILD_STRATEGY: 'paginated',
    CURRENT_BATCH: currentBatch.toString(),
    TOTAL_BATCHES: strategy.batches.toString(),
    EPISODES_PER_BATCH: batchSize.toString()
  };
  
  execSync('npm run build:astro', { 
    cwd: rootDir, 
    stdio: 'inherit',
    env 
  });
  
  return {
    strategy: 'paginated',
    episodesBuilt: batchSize,
    totalTime: Date.now() - startTime,
    currentBatch,
    totalBatches: strategy.batches,
    success: true
  };
}

// Get current batch number for pagination (round-robin)
function getCurrentBatchNumber(totalBatches) {
  // Use current hour to determine batch (cycles every few hours)
  const currentHour = Math.floor(Date.now() / (60 * 60 * 1000));
  return (currentHour % totalBatches) + 1;
}

// Update build cache with results
function updateBuildCache(cache, buildResult) {
  const now = Date.now();
  
  cache.buildHistory = cache.buildHistory || [];
  cache.buildHistory.push({
    timestamp: now,
    strategy: buildResult.strategy,
    episodesBuilt: buildResult.episodesBuilt,
    buildTime: buildResult.totalTime,
    success: buildResult.success
  });
  
  // Keep only last 10 build records
  if (cache.buildHistory.length > 10) {
    cache.buildHistory = cache.buildHistory.slice(-10);
  }
  
  // Update timestamps
  if (buildResult.strategy === 'full') {
    cache.lastFullBuild = now;
  }
  cache.lastIncrementalBuild = now;
  
  // Update episode count
  if (buildResult.episodesBuilt > 0) {
    cache.totalEpisodes = Math.max(cache.totalEpisodes, buildResult.episodesBuilt);
  }
  
  saveBuildCache(cache);
}

// Run the main function
main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});