// Simple script to validate the RSS feed
import { fetchPodcastFeed, PODCAST_RSS_URL } from '../services/rss';

async function validateRssFeed() {
  try {
    console.log('Validating RSS feed...');
    const podcast = await fetchPodcastFeed(PODCAST_RSS_URL);
    
    console.log('Podcast title:', podcast.title);
    console.log('Podcast description:', podcast.description);
    console.log('Podcast image:', podcast.image);
    console.log('Episodes count:', podcast.episodes?.length || 0);
    
    if (podcast.episodes && podcast.episodes.length > 0) {
      const firstEpisode = podcast.episodes[0];
      console.log('\nFirst episode details:');
      console.log('Title:', firstEpisode.title);
      console.log('Link:', firstEpisode.link);
      console.log('GUID:', firstEpisode.guid);
      console.log('Publication date:', firstEpisode.pubDate);
      console.log('Duration:', firstEpisode.duration);
      console.log('Image:', firstEpisode.image);
      
      if (firstEpisode.enclosure) {
        console.log('\nEnclosure details:');
        console.log('URL:', firstEpisode.enclosure.url);
        console.log('Type:', firstEpisode.enclosure.type);
        console.log('Length:', firstEpisode.enclosure.length);
      } else {
        console.error('ERROR: No enclosure found for the first episode!');
      }
    } else {
      console.error('ERROR: No episodes found in the podcast feed!');
    }
    
    console.log('\nRSS feed validation complete.');
  } catch (error) {
    console.error('Error validating RSS feed:', error);
  }
}

validateRssFeed();