import rss from '@astrojs/rss';
import { fetchPodcastFeed, PODCAST_RSS_URL } from '../services/rss';
import type { Podcast, Episode } from '../types';

// Debug function to log RSS feed data
function debugRssFeed(podcast: Podcast) {
  console.log('RSS Feed Debug:');
  console.log('Title:', podcast.title);
  console.log('Description:', podcast.description);
  console.log('Image:', podcast.image);
  console.log('Episodes count:', podcast.episodes?.length || 0);
  
  if (podcast.episodes && podcast.episodes.length > 0) {
    const firstEpisode = podcast.episodes[0];
    console.log('First episode title:', firstEpisode.title);
    console.log('First episode enclosure:', firstEpisode.enclosure);
    console.log('First episode image:', firstEpisode.image);
    console.log('First episode link:', firstEpisode.link);
  }
}

// Define iTunes namespace
const xmlns = {
  'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
  'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
  'xmlns:googleplay': 'http://www.google.com/schemas/play-podcasts/1.0',
  'xmlns:atom': 'http://www.w3.org/2005/Atom'
};

export interface AstroContext {
  site?: string;
}

export async function GET(context: AstroContext) {
  const podcast = await fetchPodcastFeed(PODCAST_RSS_URL) as Podcast;
  
  // Debug the podcast data
  debugRssFeed(podcast);
  const site = context.site || 'https://monkcast.com';
  
  return rss({
    xmlns,
    title: podcast.title || 'The MonkCast',
    description: podcast.description || 'Technology analysis and insights from the RedMonk team',
    site: site,
    items: podcast.episodes.map((episode: Episode) => {
      // Use the original enclosure from the source feed
      const enclosure = episode.enclosure ? {
        url: episode.enclosure.url,
        length: episode.enclosure.length || 0,
        type: episode.enclosure.type || 'audio/mpeg'
      } : undefined;
      
      // Debug enclosure
      if (enclosure) {
        console.log(`Enclosure for ${episode.title}:`, enclosure);
      } else {
        console.warn(`No enclosure found for episode: ${episode.title}`);
      }
      
      // Create a fallback enclosure if none exists
      const finalEnclosure = enclosure || {
        url: 'https://www.podserve.fm/episodes/download/8338/the-monkcast.mp3',
        length: 1000000,
        type: 'audio/mpeg'
      };
      
      return {
        title: episode.title,
        pubDate: new Date(episode.pubDate),
        description: episode.summary || episode.contentSnippet || '',
        link: episode.link || `${site}/episodes/${episode.guid || ''}`,
        content: episode.content,
        enclosure: finalEnclosure,
        customData: `
          <itunes:duration>${episode.duration || '00:00'}</itunes:duration>
          <itunes:image href="${episode.image || ''}"/>
          ${episode.season ? `<itunes:season>${episode.season}</itunes:season>` : ''}
          ${episode.episodeNumber ? `<itunes:episode>${episode.episodeNumber}</itunes:episode>` : ''}
        `
      };
    }),
    customData: `
      <language>en-us</language>
      <itunes:author>${podcast.itunesAuthor || 'RedMonk'}</itunes:author>
      <itunes:image href="${podcast.image || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg'}"/>
      <itunes:category text="Technology"/>
      <itunes:explicit>false</itunes:explicit>
      <itunes:owner>
        <itunes:name>RedMonk</itunes:name>
        <itunes:email>info@redmonk.com</itunes:email>
      </itunes:owner>
      <googleplay:author>RedMonk</googleplay:author>
      <googleplay:image href="${podcast.image || 'https://redmonk.com/wp-content/uploads/2018/07/Monkchips-1.jpg'}"/>
      <googleplay:category text="Technology"/>
      <googleplay:explicit>No</googleplay:explicit>
      <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
    `,
  });
}