// Incremental RSS service for optimized builds
import { fetchPodcastFeed, PODCAST_RSS_URL } from './rss.js';
import {
  loadBuildCache,
  saveBuildCache,
  getEpisodesToBuild,
  updateBuildCache,
  cleanupBuildCache,
  getBuildStats,
  getBuildConfig
} from '../utils/buildCache.js';
import type { Episode, Podcast } from '../types';

export interface IncrementalBuildResult {
  podcast: Podcast;
  episodes: Episode[];
  buildInfo: {
    strategy: 'full' | 'incremental' | 'pagination';
    isIncrementalBuild: boolean;
    totalEpisodes: number;
    builtEpisodes: number;
    skippedEpisodes: number;
    buildTime: number;
    cacheStats: ReturnType<typeof getBuildStats>;
  };
}

// Fetch podcast data with incremental build support
export async function fetchPodcastFeedIncremental(
  forceFullBuild: boolean = false
): Promise<IncrementalBuildResult> {
  const startTime = Date.now();
  
  console.log('🚀 Starting incremental podcast feed fetch...');
  
  // Load build cache
  const cache = await loadBuildCache();
  const buildConfig = getBuildConfig();
  
  // Update cache configuration
  cache.buildConfig = { ...cache.buildConfig, ...buildConfig };
  
  console.log('📊 Build cache loaded:', getBuildStats(cache));
  
  // Fetch full podcast data
  const fullPodcast = await fetchPodcastFeed(PODCAST_RSS_URL) as Podcast;
  
  if (!fullPodcast || !fullPodcast.episodes) {
    throw new Error('Failed to fetch podcast data');
  }
  
  // Clean up cache for removed episodes
  const cleanedCache = cleanupBuildCache(cache, fullPodcast.episodes);
  
  // Determine which episodes to build
  const buildDecision = getEpisodesToBuild(
    fullPodcast.episodes,
    cleanedCache,
    forceFullBuild
  );
  
  console.log(`📦 Build strategy: ${buildDecision.buildStrategy}`);
  console.log(`🔨 Episodes to build: ${buildDecision.episodesToBuild.length}/${fullPodcast.episodes.length}`);
  
  if (buildDecision.totalPages) {
    console.log(`📄 Pagination: Page ${buildDecision.currentPage}/${buildDecision.totalPages}`);
  }
  
  // Process episodes with incremental logic
  const processedEpisodes = await processEpisodesIncremental(
    buildDecision.episodesToBuild,
    fullPodcast,
    buildDecision.isIncrementalBuild
  );
  
  // Update build cache
  const updatedCache = updateBuildCache(
    cleanedCache,
    processedEpisodes,
    !buildDecision.isIncrementalBuild
  );
  
  // Save updated cache
  await saveBuildCache(updatedCache);
  
  const buildTime = Date.now() - startTime;
  const finalStats = getBuildStats(updatedCache);
  
  console.log(`✅ Build completed in ${buildTime}ms`);
  console.log('📈 Final stats:', finalStats);
  
  return {
    podcast: {
      ...fullPodcast,
      episodes: processedEpisodes
    },
    episodes: processedEpisodes,
    buildInfo: {
      strategy: buildDecision.buildStrategy,
      isIncrementalBuild: buildDecision.isIncrementalBuild,
      totalEpisodes: fullPodcast.episodes.length,
      builtEpisodes: processedEpisodes.length,
      skippedEpisodes: fullPodcast.episodes.length - processedEpisodes.length,
      buildTime,
      cacheStats: finalStats
    }
  };
}

// Process episodes with incremental optimizations
async function processEpisodesIncremental(
  episodes: Episode[],
  podcast: Podcast,
  isIncremental: boolean
): Promise<Episode[]> {
  const processedEpisodes: Episode[] = [];
  const batchSize = isIncremental ? 10 : 5; // Smaller batches for incremental builds
  
  console.log(`🔄 Processing ${episodes.length} episodes in batches of ${batchSize}`);
  
  // Process episodes in batches to avoid overwhelming external APIs
  for (let i = 0; i < episodes.length; i += batchSize) {
    const batch = episodes.slice(i, i + batchSize);
    
    console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(episodes.length / batchSize)}`);
    
    const batchPromises = batch.map(async (episode, index) => {
      try {
        // Add small delay to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return await processEpisodeWithCache(episode, podcast, isIncremental);
      } catch (error) {
        console.warn(`Failed to process episode: ${episode.title}`, error);
        return episode; // Return original episode if processing fails
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    processedEpisodes.push(...batchResults);
    
    // Add delay between batches
    if (i + batchSize < episodes.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return processedEpisodes;
}

// Process individual episode with caching
async function processEpisodeWithCache(
  episode: Episode,
  podcast: Podcast,
  isIncremental: boolean
): Promise<Episode> {
  // For incremental builds, we can skip some expensive operations
  // if the episode content hasn't changed significantly
  
  const processedEpisode = {
    ...episode,
    // Ensure required fields have defaults
    title: episode.title || 'Untitled Episode',
    summary: episode.summary || episode.contentSnippet || 'No description available',
    image: episode.image || podcast.image || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg',
    guid: episode.guid || `episode-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    pubDate: episode.pubDate || new Date().toISOString(),
    formattedDate: episode.formattedDate || formatDate(episode.pubDate),
    duration: episode.duration || '',
    enclosure: episode.enclosure || null,
    link: episode.link || '',
    content: episode.content || episode.summary || ''
  };
  
  // Skip expensive image processing for incremental builds
  if (!isIncremental && episode.content) {
    try {
      // Only extract cover images for full builds to save time
      const redmonkUrl = episode.content.match(/https?:\/\/redmonk\.com\/blog\/[^\s"']+/)?.[0];
      if (redmonkUrl && !processedEpisode.image.includes('redmonk.com')) {
        // In a real implementation, this would extract the cover image
        // For now, we'll skip this expensive operation in incremental builds
        console.log(`Skipping image extraction for incremental build: ${episode.title}`);
      }
    } catch (error) {
      console.warn('Failed to extract cover image:', error);
    }
  }
  
  return processedEpisode;
}

// Simple date formatting helper
function formatDate(dateString?: string): string {
  if (!dateString) return 'Date unavailable';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return 'Date unavailable';
  }
}

// Get paginated episodes for static path generation
export async function getPaginatedEpisodes(
  page: number = 1,
  pageSize: number = 50
): Promise<{
  episodes: Episode[];
  totalPages: number;
  currentPage: number;
  totalEpisodes: number;
}> {
  const result = await fetchPodcastFeedIncremental();
  const allEpisodes = result.podcast.episodes;
  
  const totalPages = Math.ceil(allEpisodes.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const episodes = allEpisodes.slice(startIndex, endIndex);
  
  return {
    episodes,
    totalPages,
    currentPage: page,
    totalEpisodes: allEpisodes.length
  };
}

// Get recent episodes for homepage
export async function getRecentEpisodes(limit: number = 10): Promise<Episode[]> {
  const result = await fetchPodcastFeedIncremental();
  return result.podcast.episodes.slice(0, limit);
}

// Get episode by ID with caching
export async function getEpisodeById(id: string): Promise<Episode | null> {
  const result = await fetchPodcastFeedIncremental();
  return result.podcast.episodes.find(ep => ep.guid === id) || null;
}

// Force a full rebuild (useful for CI/CD or manual triggers)
export async function forceFullRebuild(): Promise<IncrementalBuildResult> {
  console.log('🔄 Forcing full rebuild...');
  return await fetchPodcastFeedIncremental(true);
}

// Get build information without fetching episodes
export async function getBuildInfo(): Promise<{
  cacheStats: ReturnType<typeof getBuildStats>;
  buildConfig: ReturnType<typeof getBuildConfig>;
  shouldRebuild: boolean;
}> {
  const cache = await loadBuildCache();
  const buildConfig = getBuildConfig();
  const stats = getBuildStats(cache);
  
  const now = Date.now();
  const cacheValidityMs = buildConfig.cacheValidityHours * 60 * 60 * 1000;
  const shouldRebuild = now - cache.lastFullBuild > cacheValidityMs;
  
  return {
    cacheStats: stats,
    buildConfig,
    shouldRebuild
  };
}