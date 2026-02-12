
      import { fetchPodcastFeed, PODCAST_RSS_URL } from './src/services/rss.js';
      
      async function getCount() {
        try {
          const podcast = await fetchPodcastFeed(PODCAST_RSS_URL);
          console.log(podcast.episodes ? podcast.episodes.length : 0);
        } catch (error) {
          console.log(0);
        }
      }
      
      getCount();
    