#!/usr/bin/env node

/**
 * Build Statistics Script
 * 
 * Shows detailed statistics about the build cache and performance
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const buildCacheFile = join(rootDir, '.astro', 'build-cache.json');

console.log('📊 MonkCast Build Statistics');
console.log('============================');

try {
  if (!existsSync(buildCacheFile)) {
    console.log('ℹ️  No build cache found. Run a build first.');
    process.exit(0);
  }

  const cacheData = JSON.parse(readFileSync(buildCacheFile, 'utf8'));
  const now = Date.now();
  
  // Basic statistics
  console.log('\n📈 Cache Overview:');
  console.log(`   Version: ${cacheData.version}`);
  console.log(`   Total Episodes: ${cacheData.totalEpisodes}`);
  console.log(`   Built Episodes: ${Object.keys(cacheData.builtEpisodes || {}).length}`);
  
  // Last build information
  if (cacheData.lastFullBuild) {
    const lastFullBuild = new Date(cacheData.lastFullBuild);
    const fullBuildAge = Math.round((now - cacheData.lastFullBuild) / (60 * 60 * 1000));
    console.log(`   Last Full Build: ${lastFullBuild.toLocaleString()} (${fullBuildAge}h ago)`);
  }
  
  if (cacheData.lastIncrementalBuild) {
    const lastIncBuild = new Date(cacheData.lastIncrementalBuild);
    const incBuildAge = Math.round((now - cacheData.lastIncrementalBuild) / (60 * 1000));
    console.log(`   Last Incremental: ${lastIncBuild.toLocaleString()} (${incBuildAge}m ago)`);
  }
  
  // Build history
  if (cacheData.buildHistory && cacheData.buildHistory.length > 0) {
    console.log('\n🏗️  Recent Builds:');
    cacheData.buildHistory.slice(-5).forEach((build, index) => {
      const date = new Date(build.timestamp).toLocaleString();
      const duration = Math.round(build.buildTime / 1000);
      console.log(`   ${index + 1}. ${build.strategy} - ${build.episodesBuilt} episodes - ${duration}s - ${date}`);
    });
    
    // Performance statistics
    const avgBuildTime = cacheData.buildHistory.reduce((sum, build) => sum + build.buildTime, 0) / cacheData.buildHistory.length;
    const successRate = (cacheData.buildHistory.filter(b => b.success).length / cacheData.buildHistory.length) * 100;
    
    console.log('\n⚡ Performance:');
    console.log(`   Average Build Time: ${Math.round(avgBuildTime / 1000)}s`);
    console.log(`   Success Rate: ${Math.round(successRate)}%`);
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  
  const cacheAge = now - (cacheData.lastFullBuild || 0);
  const cacheValidityMs = 6 * 60 * 60 * 1000; // 6 hours
  
  if (cacheAge > cacheValidityMs) {
    console.log('   ⚠️  Cache is stale - consider running a full build');
  }
  
  if (cacheData.totalEpisodes > 500) {
    console.log('   📄 Large episode count - paginated builds recommended');
  } else if (cacheData.totalEpisodes > 100) {
    console.log('   🔄 Medium episode count - incremental builds optimal');
  } else {
    console.log('   🔨 Small episode count - full builds are efficient');
  }
  
  // Build strategy recommendation
  const strategy = cacheData.totalEpisodes > 500 ? 'paginated' : 
                  cacheData.totalEpisodes > 100 ? 'incremental' : 'full';
  console.log(`   🎯 Recommended Strategy: ${strategy}`);
  
} catch (error) {
  console.error('❌ Failed to read build statistics:', error.message);
  process.exit(1);
}