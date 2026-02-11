# Incremental Build System

The MonkCast website implements an intelligent incremental build system designed to handle growing episode counts efficiently while maintaining fast build times and optimal user experience.

## Overview

As podcast episode counts grow, traditional static site generators can become slow and resource-intensive. Our incremental build system addresses this by implementing multiple build strategies based on content size and change patterns.

## Build Strategies

###1. Full Build (`build:full`)
- **When**: Episode count < 100 or forced rebuild
- **Behavior**: Builds all episodes and content
- **Use case**: Initial builds, major updates, cache invalidation
- **Performance**: ~30-60 seconds for small sites

### 2. Incremental Build (`build:incremental`)
- **When**: Episode count 100-500
- **Behavior**: Only builds changed/new episodes
- **Use case**: Regular updates, content changes
- **Performance**: ~10-30 seconds for typical updates

### 3. Paginated Build (`build:paginated`)
- **When**: Episode count > 500
- **Behavior**: Builds episodes in batches across multiple deployments
- **Use case**: Large podcast archives
- **Performance**: ~15-45seconds per batch

## Configuration

### Environment Variables

```bash
# Build strategy (auto, full, incremental, paginated)
BUILD_STRATEGY=auto

# Maximum episodes per build
MAX_EPISODES_PER_BUILD=50

# Threshold for switching to incremental builds
INCREMENTAL_THRESHOLD=100

# Force full rebuild
FORCE_FULL_BUILD=false

# Pagination settings (for paginated builds)
CURRENT_BATCH=1
TOTAL_BATCHES=10
EPISODES_PER_BATCH=50
```

### Build Scripts

```json
{
  "scripts": {
    "build": "npm run build:incremental",
    "build:full": "FORCE_FULL_BUILD=true astro build",
    "build:incremental": "node scripts/incremental-build.js",
    "build:astro": "astro build",
    "cache:clear": "node scripts/clear-build-cache.js",
    "cache:stats": "node scripts/build-stats.js"
  }
}
```

## How It Works

### 1. Build Cache Management

The system maintains a build cache (`.astro/build-cache.json`) that tracks:
- Episode metadata and content hashes
- Last build timestamps
- Build performance metrics
- Episode change detection

### 2. Content Change Detection

Episodes are tracked using content hashes that include:
- Title, summary, and content
- Publication date and duration
- Audio file information
- Associated images

### 3. Smart Episode Selection

Based on the build strategy:
- **Full**: All episodes
- **Incremental**: Only changed episodes + recent episodes
- **Paginated**: Specific batch based on round-robin scheduling

### 4. Error Boundaries

Comprehensive error handling ensures builds don't fail:
- Fallback to cached content
- Graceful degradation for missing episodes
- Circuit breaker pattern for external API failures

## Performance Optimizations

### Build-Time Optimizations
- Parallel episode processing
- Batch API requests with rate limiting
- Efficient content hashing
- Smart cache invalidation

### Runtime Optimizations
- Lazy loading of episode content
- Optimized image processing
- CDN-friendly caching headers
- Progressive enhancement

## Monitoring and Debugging

### Build Monitor Component
- Real-time build status display
- Performance metrics
- Cache hit rates
- Build strategy information

### Build Statistics
```bash
npm run cache:stats
```

Shows:
- Cache overview and hit rates
- Recent build history
- Performance metrics
- Recommendations

### Cache Management
```bash
# Clear all caches
npm run cache:clear

# View detailed statistics
npm run cache:stats
```

## Deployment Integration

### Netlify Configuration
The system integrates with Netlify's build system:
- Production builds use incremental strategy
- Deploy previews use limited episode counts
- Branch deploys force full rebuilds

### GitHub Actions
Automated testing for all build strategies:
- Full build testing
- Incremental build validation
- Performance benchmarking
- Cache effectiveness testing

## Best Practices

### For Small Podcasts (<100 episodes)
- Use full builds for simplicity
- Enable build monitoring in development
- Regular cache clearing not necessary

### For Medium Podcasts (100-500 episodes)
- Use incremental builds
- Monitor cache hit rates
- Clear cache weekly or after major changes

### For Large Podcasts (> 500 episodes)
- Use paginated builds
- Implement content archiving strategy
- Monitor build performance closely
- Consider CDN optimization

## Troubleshooting

### Build Failures
1. Check build logs for specific errors
2. Clear build cache: `npm run cache:clear`
3. Force full rebuild: `npm run build:full`
4. Check API connectivity and rate limits

### Performance Issues
1. Review cache hit rates: `npm run cache:stats`
2. Adjust `MAX_EPISODES_PER_BUILD` if needed
3. Monitor external API response times
4. Consider pagination for large episode counts

### Cache Issues
1. Clear cache if data seems stale
2. Check cache validity settings
3. Verify content hash generation
4. Review build strategy selection logic

## Future Enhancements

### Planned Features
- [ ] Intelligent batch sizing based on content complexity
- [ ] Multi-region build distribution
- [ ] Advanced caching strategies (Redis, CDN)
- [ ] Real-time build status API
- [ ] Automated performance optimization

### Experimental Features
- [ ] Machine learning-based build optimization
- [ ] Predictive content caching
- [ ] Dynamic episode prioritization
- [ ] Build time estimation

## API Reference

### Build Cache API
```typescript
// Load build cache
const cache = await loadBuildCache();

// Determine build strategy
const strategy = getEpisodesToBuild(episodes, cache);

// Update cache after build
const updatedCache = updateBuildCache(cache, builtEpisodes);
```

### Incremental RSS API
```typescript
// Fetch with incremental support
const result = await fetchPodcastFeedIncremental();

// Get paginated episodes
const page = await getPaginatedEpisodes(1, 50);

// Force full rebuild
const fullResult = await forceFullRebuild();
```

## Contributing

When contributing to the incremental build system:

1. Test all build strategies locally
2. Run performance benchmarks
3. Update cache logic carefully
4. Add appropriate error handling
5. Update documentation

## Support

For issues with the incremental build system:
1. Check the troubleshooting guide
2. Review build logs and statistics
3. Test with different build strategies
4. Open an issue with detailed information