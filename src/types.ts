export interface Episode {
  title: string;
  pubDate: string;
  formattedDate: string;
  duration: string;
  summary?: string;
  contentSnippet?: string;
  content: string;
  image: string;
  season?: string;
  episodeNumber?: string;
  guid: string;
  redmonkUrl?: string;
  link?: string;
  enclosure?: {
    url: string;
    length?: number;
    type?: string;
  };
}

export interface Podcast {
  title: string;
  description: string;
  link: string;
  image: string;
  itunesAuthor: string;
  episodes: Episode[];
}