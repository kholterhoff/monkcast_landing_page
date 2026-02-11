// Build cache management for incremental builds
import { createHash } from 'crypto';
import type { Episode, Podcast } from '../types';

export interface EpisodeBuildCache {
  guid: string;
  title: string;
  pubDate: string;
  contentHash: string;
  lastBuilt: number;
  buildVersion: string;
}

export interface BuildCacheManifest {
  version: string;
  lastFullBuild: number;
  totalEpisodes: number;
  episodes: Record<string, EpisodeBuildCache>;
  buildConfig: {
    maxEpisodesPerBuild: number;
    incrementalThreshold: number;
    cacheValidityHours: number;
  };
}

// Default build configuration
const DEFAULT_BUILD_CONFIG = {
  maxEpisodesPerBuild: 50, // Limit episodes per build
  incrementalThreshold: 100, // Start incremental builds after this many episodes
  cacheValidityHours: 24, // Cache validity in hours
};

// Build cache file path (would be in .astro or build directory)
const CACHE_FILE_PATH = '.astro/build-cache.json';

// Generate content hash for an episode
export function generateEpisodeHash(episode: Episode): string {
  const content = JSON.stringify({
    title: episode.title,
    summary: episode.summary,
    content: episode.content,
    pubDate: episode.pubDate,
    duration: episode.duration,
    enclosure: episode.enclosure,
    image: episode.image
  });
  
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// Load build cache from storage
export async function loadBuildCache(): Promise<BuildCacheManifest> {
  try {
    // In a real implementation, this would read from file system
    // For now, return default cache structure
    const defaultCache: BuildCacheManifest = {
      version: '1.0.0',
      lastFullBuild: 0,
      totalEpisodes: 0,
      episodes: {},
      buildConfig: DEFAULT_BUILD_CONFIG
    };

    // In browser environment, try localStorage
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('monkcast-build-cache');
      if (cached) {
        return { ...defaultCache, ...JSON.parse(cached) };
      }
    }

    return defaultCache;
  } catch (error) {
    console.warn('Failed to load build cache:', error);
    return {
      version: '1.0.0',
      lastFullBuild: 0,
      totalEpisodes: 0,
      episodes: {},
      buildConfig: DEFAULT_BUILD_CONFIG
    };
  }
}

// Save build cache to storage
export async function saveBuildCache(cache: BuildCacheManifest): Promise<void> {
  try {
    // In browser environment, use localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('monkcast-build-cache', JSON.stringify(cache));
    }
    
    // In Node.js environment, would write to file
    console.log('Build cache updated:', {
      totalEpisodes: cache.totalEpisodes,
      cachedEpisodes: Object.keys(cache.episodes).length,
      lastFullBuild: new Date(cache.lastFullBuild).toISOString()
    });
  } catch (error) {
    console.warn('Failed to save build cache:', error);
  }
}

// Determine which episodes need to be built
export function getEpisodesToBuild(
  episodes: Episode[],
  cache: BuildCacheManifest,
  forceFullBuild: boolean = false
): {
  episodesToBuild: Episode[];
  isIncrementalBuild: boolean;
  buildStrategy: 'full' | 'incremental' | 'pagination';
  totalPages?: number;
  currentPage?: number;
} {
  const now = Date.now();
  const cacheValidityMs = cache.buildConfig.cacheValidityHours * 60 * 60 * 1000;
  const isCacheStale = now - cache.lastFullBuild > cacheValidityMs;
  
  // Force full build if requested or cache is stale
  if (forceFullBuild || isCacheStale || episodes.length <= cache.buildConfig.incrementalThreshold) {
    return {
      episodesToBuild: episodes,
      isIncrementalBuild: false,
      buildStrategy: 'full'
    };
  }

  // Check if we need pagination for large episode counts
  if (episodes.length > cache.buildConfig.maxEpisodesPerBuild) {
    const totalPages = Math.ceil(episodes.length / cache.buildConfig.maxEpisodesPerBuild);
    const currentPage = getCurrentBuildPage(cache);
    const startIndex = (currentPage - 1) * cache.buildConfig.maxEpisodesPerBuild;
    const endIndex = startIndex + cache.buildConfig.maxEpisodesPerBuild;
    
    return {
      episodesToBuild: episodes.slice(startIndex, endIndex),
      isIncrementalBuild: true,
      buildStrategy: 'pagination',
      totalPages,
      currentPage
    };
  }

  // Incremental build - only build changed episodes
  const changedEpisodes = episodes.filter(episode => {
    const guid = episode.guid || generateEpisodeHash(episode);
    const cachedEpisode = cache.episodes[guid];
    
    if (!cachedEpisode) {
      return true; // New episode
    }
    
    const currentHash = generateEpisodeHash(episode);
    return currentHash !== cachedEpisode.contentHash; // Content changed
  });

  return {
    episodesToBuild: changedEpisodes,
    isIncrementalBuild: true,
    buildStrategy: 'incremental'
  };
}

// Get current build page for pagination
function getCurrentBuildPage(cache: BuildCacheManifest): number {
  // Simple round-robin pagination
  const lastBuildHour = Math.floor(cache.lastFullBuild / (60 * 60 * 1000));
  const currentHour = Math.floor(Date.now() / (60 * 60 * 1000));
  const hoursSinceLastBuild = currentHour - lastBuildHour;
  
  // Cycle through pages every few hours
  return (hoursSinceLastBuild % 10) + 1;
}

// Update build cache with newly built episodes
export function updateBuildCache(
  cache: BuildCacheManifest,
  builtEpisodes: Episode[],
  isFullBuild: boolean = false
): BuildCacheManifest {
  const now = Date.now();
  const buildVersion = now.toString();

  const updatedCache = { ...cache };

  // Update episode cache entries
  builtEpisodes.forEach(episode => {
    const guid = episode.guid || generateEpisodeHash(episode);
    const contentHash = generateEpisodeHash(episode);
    
    updatedCache.episodes[guid] = {
      guid,
      title: episode.title || 'Untitled',
      pubDate: episode.pubDate || new Date().toISOString(),
      contentHash,
      lastBuilt: now,
      buildVersion
    };
  });

  // Update manifest metadata
  if (isFullBuild) {
    updatedCache.lastFullBuild = now;
    updatedCache.totalEpisodes = builtEpisodes.length;
  } else {
    updatedCache.totalEpisodes = Math.max(
      updatedCache.totalEpisodes,
      Object.keys(updatedCache.episodes).length
    );
  }

  return updatedCache;
}

// Clean up old cache entries
export function cleanupBuildCache(
  cache: BuildCacheManifest,
  currentEpisodes: Episode[]
): BuildCacheManifest {
  const currentGuids = new Set(
    currentEpisodes.map(ep => ep.guid || generateEpisodeHash(ep))
  );
  
  const cleanedCache = { ...cache };
  
  // Remove cache entries for episodes that no longer exist
  Object.keys(cleanedCache.episodes).forEach(guid => {
    if (!currentGuids.has(guid)) {
      delete cleanedCache.episodes[guid];
    }
  });

  return cleanedCache;
}

// Get build statistics
export function getBuildStats(cache: BuildCacheManifest): {
  totalEpisodes: number;
  cachedEpisodes: number;
  lastFullBuild: string;
  cacheHitRate: number;
  buildStrategy: string;
} {
  const cachedCount = Object.keys(cache.episodes).length;
  const cacheHitRate = cache.totalEpisodes > 0 
    ? (cachedCount / cache.totalEpisodes) * 100 
    : 0;

  let buildStrategy = 'full';
  if (cache.totalEpisodes > cache.buildConfig.incrementalThreshold) {
    buildStrategy = cache.totalEpisodes > cache.buildConfig.maxEpisodesPerBuild 
      ? 'pagination' 
      : 'incremental';
  }

  return {
    totalEpisodes: cache.totalEpisodes,
    cachedEpisodes: cachedCount,
    lastFullBuild: new Date(cache.lastFullBuild).toISOString(),
    cacheHitRate: Math.round(cacheHitRate),
    buildStrategy
  };
}

// Environment-specific build configuration
export function getBuildConfig(): typeof DEFAULT_BUILD_CONFIG {
  const config = { ...DEFAULT_BUILD_CONFIG };
  
  // Adjust based on environment
  if (process.env.NODE_ENV === 'production') {
    config.maxEpisodesPerBuild = 100; // More episodes in production
    config.cacheValidityHours = 6; // Shorter cache in production
  }
  
  if (process.env.CI === 'true') {
    config.maxEpisodesPerBuild = 200; // Even more in CI
    config.incrementalThreshold = 50; // Lower threshold in CI
  }

  // Allow environment variable overrides
  if (process.env.MAX_EPISODES_PER_BUILD) {
    config.maxEpisodesPerBuild = parseInt(process.env.MAX_EPISODES_PER_BUILD, 10);
  }
  
  if (process.env.INCREMENTAL_THRESHOLD) {
    config.incrementalThreshold = parseInt(process.env.INCREMENTAL_THRESHOLD, 10);
  }

  return config;
}