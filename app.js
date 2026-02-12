// RSS Feed URL
const RSS_URL = 'https://api.riverside.fm/hosting/tBthkY3f.rss';

// Host bios
const hostBios = {
    stephen: "Stephen O'Grady is an industry analyst with RedMonk. James and Stephen founded the firm in November of 2002, and have been doing that ever since. Previously, he worked for Keane, Dialogos (now defunct), Blue Hammock, and Illuminata. Stephen has a BA in History from Williams College, and married a beautiful girl from Middlebury College. He have no preference between Steve and Stephen. Knock yourself out. He lives in Freeport, Maine with an office in Portland. Contrary to popular belief, he's not actually from Boston (though most of his family is). He is, however, a Red Sox fan, born and raised.",
    james: "James is co-founder of RedMonk, the developer-focused industry analyst firm. Research and analysis into tech trends and directions. Enjoys working with anyone that wants to better understand software developers and what makes them tick. Came up with the term Progressive Delivery. Lives in London with his wife and 3 kids. Specialities: Developers, developers, developers.",
    rachel: "Rachel Stephens is a Research Director with RedMonk and has been with the firm since 2016. Rachel comes to RedMonk with a wealth of financial experience, and she applies this quantitative lens to her analysis. Her focus is broad (as it is for all of the RedMonk analysts), but she devotes a lot of time to emerging growth technologies. Before joining RedMonk, Rachel worked as a database administrator and financial analyst. Rachel holds an MBA with a Business Intelligence certification from Colorado State University and a BA in Finance from the University of Colorado. She is currently based in Denver, Colorado.",
    kate: "Kate Holterhoff, a senior industry analyst with RedMonk, has a background in frontend engineering, academic research, and technical communication. Kate comes to RedMonk from the digital marketing sector and brings with her expertise in frontend engineering, QA, accessibility, and scrum best practices. Before pursuing a career in the tech industry Kate taught writing and communication courses at several East Coast universities. She earned a PhD from Carnegie Mellon in 2016 and was awarded a postdoctoral fellowship (2016-2018) at Georgia Tech, where she is currently an affiliated researcher."
};

// Fetch featured image from RedMonk blog post
async function fetchRedMonkFeaturedImage(url) {
    try {
        console.log('🔍 Fetching featured image from:', url);
        
        // Try multiple CORS proxies
        const proxies = [
            `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];
        
        let html = null;
        
        for (const proxyUrl of proxies) {
            try {
                console.log('Trying proxy:', proxyUrl);
                const response = await fetch(proxyUrl);
                
                if (!response.ok) {
                    console.warn(`Proxy failed with status ${response.status}`);
                    continue;
                }
                
                const data = await response.json();
                html = data.contents || data;
                
                if (html && typeof html === 'string' && html.includes('<html')) {
                    console.log('✅ Successfully fetched HTML');
                    break;
                }
            } catch (err) {
                console.warn('Proxy error:', err.message);
                continue;
            }
        }
        
        if (!html) {
            throw new Error('All proxies failed');
        }
        
        // Parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Debug: log what we found
        console.log('Parsed document title:', doc.querySelector('title')?.textContent);
        
        // Try multiple selectors for featured images in priority order
        let imageUrl = null;
        
        // 1. Try og:image meta tag (most reliable for WordPress)
        const ogImage = doc.querySelector('meta[property="og:image"]');
        if (ogImage) {
            imageUrl = ogImage.getAttribute('content');
            console.log('✅ Found og:image:', imageUrl);
        }
        
        // 2. Try twitter:image meta tag
        if (!imageUrl) {
            const twitterImage = doc.querySelector('meta[name="twitter:image"]');
            if (twitterImage) {
                imageUrl = twitterImage.getAttribute('content');
                console.log('✅ Found twitter:image:', imageUrl);
            }
        }
        
        // 3. Try WordPress featured image class
        if (!imageUrl) {
            const wpFeatured = doc.querySelector('.wp-post-image');
            if (wpFeatured) {
                imageUrl = wpFeatured.getAttribute('src') || wpFeatured.getAttribute('data-src');
                console.log('✅ Found wp-post-image:', imageUrl);
            }
        }
        
        // 4. Try featured image in post content
        if (!imageUrl) {
            const featuredImg = doc.querySelector('.featured-image img, .post-thumbnail img');
            if (featuredImg) {
                imageUrl = featuredImg.getAttribute('src') || featuredImg.getAttribute('data-src');
                console.log('✅ Found featured-image:', imageUrl);
            }
        }
        
        // Debug: log all meta tags if we haven't found an image
        if (!imageUrl) {
            console.log('🔍 All meta tags:', Array.from(doc.querySelectorAll('meta')).map(m => ({
                property: m.getAttribute('property'),
                name: m.getAttribute('name'),
                content: m.getAttribute('content')
            })));
        }
        
        if (imageUrl) {
            // Make sure URL is absolute
            if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
            } else if (imageUrl.startsWith('/')) {
                imageUrl = 'https://redmonk.com' + imageUrl;
            }
            
            // Clean up any query parameters that might break the image
            imageUrl = imageUrl.split('?')[0];
            
            console.log('🎉 Successfully extracted featured image:', imageUrl);
            return imageUrl;
        }
        
        console.warn('⚠️ No featured image found in page');
        throw new Error('No featured image found');
    } catch (error) {
        console.error('❌ Error fetching featured image:', error.message);
        return 'src/assets/monkcast_logo.png';
    }
}

// Parse RSS feed with multiple fallback strategies
async function fetchEpisodes() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const episodesListEl = document.getElementById('episodes-list');
    const latestLoadingEl = document.getElementById('latest-loading');
    const latestErrorEl = document.getElementById('latest-error');
    const latestContentEl = document.getElementById('latest-episode-content');

    try {
        console.log('Fetching RSS feed...');
        
        // Try multiple CORS proxies in order
        const proxies = [
            { url: `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`, type: 'json' },
            { url: `https://corsproxy.io/?${encodeURIComponent(RSS_URL)}`, type: 'text' },
            { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RSS_URL)}`, type: 'text' }
        ];
        
        let xmlText = null;
        let lastError = null;
        
        for (const proxy of proxies) {
            try {
                console.log('Trying proxy:', proxy.url);
                const response = await fetch(proxy.url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                if (proxy.type === 'json') {
                    const data = await response.json();
                    xmlText = data.contents;
                } else {
                    xmlText = await response.text();
                }
                
                if (xmlText && xmlText.includes('<?xml')) {
                    console.log('Successfully fetched RSS feed');
                    break;
                }
            } catch (err) {
                console.warn('Proxy failed:', err.message);
                lastError = err;
                continue;
            }
        }
        
        if (!xmlText) {
            throw lastError || new Error('All proxies failed');
        }
        
        // Parse XML
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');
        
        // Check for parsing errors
        const parserError = xml.querySelector('parsererror');
        if (parserError) {
            throw new Error('XML parsing failed');
        }
        
        const items = xml.querySelectorAll('item');
        console.log(`Found ${items.length} episodes`);
        
        if (items.length === 0) {
            throw new Error('No episodes found in feed');
        }
        
        const episodes = [];

        // Process episodes - use itunes:image from RSS feed
        for (let index = 0; index < Math.min(items.length, 10); index++) {
            const item = items[index];
            
            const title = item.querySelector('title')?.textContent || 'Untitled Episode';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            const description = item.querySelector('description')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            const guid = item.querySelector('guid')?.textContent || '';
            
            // Get image from itunes:image in the RSS feed
            let imageUrl = 'src/assets/monkcast_logo.png';
            const itunesImage = item.querySelector('image');
            
            if (itunesImage) {
                const href = itunesImage.getAttribute('href');
                if (href) {
                    imageUrl = href;
                    console.log(`✅ Found itunes:image for "${title}":`, imageUrl);
                }
            }
            
            // Check if the link is a RedMonk URL for the episode link
            let redmonkUrl = '';
            if (link && link.includes('redmonk.com/')) {
                redmonkUrl = link;
            }
            
            // Try to extract episode-specific URLs from description
            let youtubeUrl = null;
            let spotifyUrl = null;
            let appleUrl = null;
            
            // Look for YouTube links in description
            const youtubeMatch = description.match(/https?:\/\/(www\.)?youtu(\.be|be\.com)\/(watch\?v=|embed\/)?([a-zA-Z0-9_-]+)/);
            if (youtubeMatch) {
                const videoId = youtubeMatch[4];
                youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Found YouTube URL for "${title}":`, youtubeUrl);
            }

            episodes.push({
                title,
                pubDate: formatDate(pubDate),
                description: stripHtml(description),
                link: redmonkUrl || link,
                image: imageUrl,
                guid: guid,
                youtubeUrl: youtubeUrl,
                spotifyUrl: spotifyUrl,
                appleUrl: appleUrl
            });
        }

        loadingEl.style.display = 'none';
        latestLoadingEl.style.display = 'none';
        
        if (episodes.length > 0) {
            // Render latest episode
            renderLatestEpisode(episodes[0]);
            // Render remaining episodes
            renderEpisodes(episodes.slice(1));
        } else {
            throw new Error('No episodes to display');
        }
    } catch (error) {
        console.error('Error fetching episodes:', error);
        loadingEl.style.display = 'none';
        latestLoadingEl.style.display = 'none';
        errorEl.textContent = `Unable to load episodes: ${error.message}. Please try again later.`;
        errorEl.style.display = 'block';
        latestErrorEl.textContent = `Unable to load latest episode: ${error.message}. Please try again later.`;
        latestErrorEl.style.display = 'block';
        
        // Show fallback message with link
        episodesListEl.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <p style="margin-bottom: 1rem;">Having trouble loading episodes?</p>
                <a href="https://www.podserve.fm/series/8338/the-monkcast" 
                   target="_blank" 
                   rel="noopener noreferrer" 
                   class="btn btn-primary">
                    View All Episodes
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12h14"></path>
                        <path d="m12 5 7 7-7 7"></path>
                    </svg>
                </a>
            </div>
        `;
    }
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Strip HTML tags
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// Render latest episode
function renderLatestEpisode(episode) {
    const latestContentEl = document.getElementById('latest-episode-content');
    
    if (!episode) {
        latestContentEl.innerHTML = '<p style="text-align: center; padding: 2rem;">No latest episode available.</p>';
        return;
    }
    
    // Create video container
    const videoContainer = document.createElement('div');
    videoContainer.className = 'latest-episode-video';
    
    // Add "New Episode" badge
    const badge = document.createElement('div');
    badge.className = 'latest-episode-badge';
    badge.textContent = 'New Episode';
    videoContainer.appendChild(badge);
    
    // Add YouTube iframe if available
    if (episode.youtubeUrl) {
        const iframe = document.createElement('iframe');
        const videoId = episode.youtubeUrl.match(/[?&]v=([^&]+)/)?.[1] || episode.youtubeUrl.split('/').pop();
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.title = episode.title;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;
        videoContainer.appendChild(iframe);
    }
    
    // Create info container
    const infoContainer = document.createElement('div');
    infoContainer.className = 'latest-episode-info';
    
    const date = document.createElement('div');
    date.className = 'latest-episode-date';
    date.textContent = episode.pubDate;
    
    const title = document.createElement('h2');
    title.className = 'latest-episode-title';
    title.textContent = episode.title;
    
    const description = document.createElement('p');
    description.className = 'latest-episode-description';
    description.textContent = episode.description;
    
    // Create platform buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'latest-episode-buttons';
    
    // Spotify button
    const spotifyBtn = document.createElement('a');
    spotifyBtn.href = episode.spotifyUrl || 'https://open.spotify.com/show/1lzmSLf4O2trpJApYOBeVC';
    spotifyBtn.target = '_blank';
    spotifyBtn.rel = 'noopener noreferrer';
    spotifyBtn.className = 'episode-platform-btn spotify-btn';
    spotifyBtn.title = episode.spotifyUrl ? 'Listen to this episode on Spotify' : 'Listen on Spotify';
    spotifyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
    `;
    
    // YouTube button
    const youtubeBtn = document.createElement('a');
    youtubeBtn.href = episode.youtubeUrl || 'https://www.youtube.com/playlist?list=PL3BD98E8oOJlqtze7Cyf196PnvB3z12A4';
    youtubeBtn.target = '_blank';
    youtubeBtn.rel = 'noopener noreferrer';
    youtubeBtn.className = 'episode-platform-btn youtube-btn';
    youtubeBtn.title = episode.youtubeUrl ? 'Watch this episode on YouTube' : 'Watch on YouTube';
    youtubeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
    `;
    
    // Apple Podcasts button
    const appleBtn = document.createElement('a');
    appleBtn.href = episode.appleUrl || 'https://podcasts.apple.com/us/podcast/the-monkcast/id1712805847';
    appleBtn.target = '_blank';
    appleBtn.rel = 'noopener noreferrer';
    appleBtn.className = 'episode-platform-btn apple-btn';
    appleBtn.title = episode.appleUrl ? 'Listen to this episode on Apple Podcasts' : 'Listen on Apple Podcasts';
    appleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.99 2C6.472 2 2 6.477 2 12c0 5.523 4.472 10 9.99 10C17.52 22 22 17.523 22 12c0-5.523-4.48-10-10.01-10zm.01 3.5c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3 1.343-3 3-3zm0 2c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm0 3.5c1.381 0 2.5 1.119 2.5 2.5v.5c0 1.933-.567 3.5-2.5 3.5S9.5 15.433 9.5 13.5V13c0-1.381 1.119-2.5 2.5-2.5zm0 1.5c-.552 0-1 .448-1 1v.5c0 1.381.567 2.5 1.5 2.5s1.5-1.119 1.5-2.5V13c0-.552-.448-1-1-1z"/>
        </svg>
    `;
    
    buttonsContainer.appendChild(spotifyBtn);
    buttonsContainer.appendChild(youtubeBtn);
    buttonsContainer.appendChild(appleBtn);
    
    infoContainer.appendChild(date);
    infoContainer.appendChild(title);
    infoContainer.appendChild(description);
    infoContainer.appendChild(buttonsContainer);
    
    latestContentEl.appendChild(videoContainer);
    latestContentEl.appendChild(infoContainer);
    
    console.log('Rendered latest episode');
}

// Render episodes
function renderEpisodes(episodes) {
    const episodesListEl = document.getElementById('episodes-list');
    
    if (episodes.length === 0) {
        episodesListEl.innerHTML = '<p style="text-align: center; padding: 2rem;">No episodes available.</p>';
        return;
    }
    
    episodes.forEach(episode => {
        const card = document.createElement('article');
        card.className = 'episode-card';
        
        // Create elements safely to avoid XSS
        const img = document.createElement('img');
        img.src = episode.image;
        img.alt = episode.title;
        img.loading = 'lazy';
        img.onerror = function() {
            this.src = 'src/assets/monkcast_logo.png';
        };
        
        const content = document.createElement('div');
        content.className = 'episode-content';
        
        const date = document.createElement('div');
        date.className = 'episode-date';
        date.textContent = episode.pubDate;
        
        const title = document.createElement('h3');
        title.className = 'episode-title';
        title.textContent = episode.title;
        
        const summary = document.createElement('p');
        summary.className = 'episode-summary';
        summary.textContent = episode.description;
        
        // Create platform buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'episode-buttons';
        
        // Spotify button - use episode-specific URL if available, otherwise show URL
        const spotifyBtn = document.createElement('a');
        spotifyBtn.href = episode.spotifyUrl || 'https://open.spotify.com/show/1lzmSLf4O2trpJApYOBeVC';
        spotifyBtn.target = '_blank';
        spotifyBtn.rel = 'noopener noreferrer';
        spotifyBtn.className = 'episode-platform-btn spotify-btn';
        spotifyBtn.title = episode.spotifyUrl ? 'Listen to this episode on Spotify' : 'Listen on Spotify';
        spotifyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
        `;
        
        // YouTube button - use episode-specific URL if available, otherwise playlist URL
        const youtubeBtn = document.createElement('a');
        youtubeBtn.href = episode.youtubeUrl || 'https://www.youtube.com/playlist?list=PL3BD98E8oOJlqtze7Cyf196PnvB3z12A4';
        youtubeBtn.target = '_blank';
        youtubeBtn.rel = 'noopener noreferrer';
        youtubeBtn.className = 'episode-platform-btn youtube-btn';
        youtubeBtn.title = episode.youtubeUrl ? 'Watch this episode on YouTube' : 'Watch on YouTube';
        youtubeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
        `;
        
        // Apple Podcasts button - use episode-specific URL if available, otherwise show URL
        const appleBtn = document.createElement('a');
        appleBtn.href = episode.appleUrl || 'https://podcasts.apple.com/us/podcast/the-monkcast/id1712805847';
        appleBtn.target = '_blank';
        appleBtn.rel = 'noopener noreferrer';
        appleBtn.className = 'episode-platform-btn apple-btn';
        appleBtn.title = episode.appleUrl ? 'Listen to this episode on Apple Podcasts' : 'Listen on Apple Podcasts';
        
        const appleImg = document.createElement('img');
        appleImg.src = 'src/assets/platforms/apple Podcast.png';
        appleImg.alt = 'Apple Podcasts';
        appleImg.style.width = '24px';
        appleImg.style.height = '24px';
        appleBtn.appendChild(appleImg);
        
        buttonsContainer.appendChild(spotifyBtn);
        buttonsContainer.appendChild(youtubeBtn);
        buttonsContainer.appendChild(appleBtn);
        
        content.appendChild(date);
        content.appendChild(title);
        content.appendChild(summary);
        content.appendChild(buttonsContainer);
        
        card.appendChild(img);
        card.appendChild(content);
        
        episodesListEl.appendChild(card);
    });
    
    console.log(`Rendered ${episodes.length} episodes`);
}

// Toggle host bio
function toggleHostBio(card) {
    const bioEl = card.querySelector('.host-bio');
    const hostKey = card.dataset.host;
    const readMoreEl = bioEl.querySelector('.read-more');
    
    if (readMoreEl.textContent.includes('Read more')) {
        // Show full bio
        bioEl.innerHTML = `${hostBios[hostKey]} <span class="read-more"><svg class="arrow-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg> Show less</span>`;
    } else {
        // Show short bio
        const shortBio = hostBios[hostKey].split(' ').slice(0, 10).join(' ');
        bioEl.innerHTML = `${shortBio}<span class="ellipsis">...</span> <span class="read-more">Read more <svg class="arrow-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>`;
    }
    
    // Re-attach click handler
    const newReadMore = bioEl.querySelector('.read-more');
    newReadMore.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleHostBio(card);
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Fetch episodes
    fetchEpisodes();
    
    // Setup host card interactions
    document.querySelectorAll('.host-card').forEach(card => {
        card.addEventListener('click', () => toggleHostBio(card));
        
        const readMore = card.querySelector('.read-more');
        readMore.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleHostBio(card);
        });
    });
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
});
