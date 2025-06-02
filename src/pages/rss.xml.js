import rss from '@astrojs/rss';
import { fetchPodcastFeed } from '../utils/rss';

export async function GET(context) {
  const PODCAST_RSS_URL = 'https://www.podserve.fm/series/rss/8338/the-monkcast.rss';
  const podcast = await fetchPodcastFeed(PODCAST_RSS_URL);
  
  return rss({
    title: podcast.title || 'The MonkCast',
    description: podcast.description || 'Technology analysis and insights from the RedMonk team',
    site: context.site || 'https://monkcast.com',
    items: podcast.episodes.map(episode => ({
      title: episode.title,
      pubDate: new Date(episode.pubDate),
      description: episode.summary || episode.contentSnippet,
      link: `/episodes/${episode.guid}`,
      content: episode.content,
    })),
    customData: `
      <language>en-us</language>
      <itunes:author>${podcast.itunesAuthor || 'RedMonk'}</itunes:author>
      <itunes:image href="${podcast.image || 'https://redmonk.com/favicon.ico'}"/>
      <itunes:category text="Technology"/>
      <itunes:explicit>false</itunes:explicit>
    `,
  });
}