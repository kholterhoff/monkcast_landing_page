# The MonkCast - Vanilla HTML/CSS/JS Version

A simple, framework-free podcast website built with vanilla HTML, CSS, and JavaScript.

## What Changed

This is a complete refactor from the Astro-based version to pure vanilla web technologies:

- **No build process** - Just open `index.html` in a browser
- **No dependencies** - No npm packages, no node_modules
- **No framework** - Pure HTML, CSS, and JavaScript
- **Client-side RSS fetching** - Episodes load dynamically from the RSS feed
- **Simpler deployment** - Upload to any static host

## Structure

```
├── index.html          # Main HTML file
├── styles.css          # All styles
├── app.js             # JavaScript for RSS fetching and interactions
├── public/            # Static assets (favicon)
└── src/assets/        # Images (logos, platform icons, host photos)
```

## Features

- Responsive design that works on all devices
- RSS feed parsing to display latest episodes
- Interactive host bios (click to expand)
- Smooth animations and transitions
- Newsletter signup integration
- YouTube video embed
- Platform links (Apple Podcasts, Spotify, etc.)

## How to Run

### Option 1: Open Directly
Simply open `index.html` in your web browser.

### Option 2: Local Server (Recommended)
For better CORS handling, use a local server:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (if you have npx)
npx serve

# PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

## Deployment

Upload these files to any static hosting service:

- **Netlify**: Drag and drop the folder
- **Vercel**: `vercel --prod`
- **GitHub Pages**: Push to a repo and enable Pages
- **AWS S3**: Upload to a bucket with static hosting enabled
- **Any web server**: Just upload the files

## Notes

- RSS feed is fetched client-side using a CORS proxy (allorigins.win)
- Images are loaded from the existing `src/assets/` directory
- No image optimization (images load as-is)
- Episodes are limited to the 10 most recent

## Browser Support

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Comparison with Astro Version

### What You Lose:
- Build-time RSS fetching (slower initial load)
- Automatic image optimization
- Component reusability
- TypeScript support
- Incremental builds

### What You Gain:
- Simplicity - no build process
- No dependencies to maintain
- Easier to understand and modify
- Faster development iteration
- Works anywhere without setup

## Customization

- Edit `index.html` to change content
- Modify `styles.css` to adjust styling
- Update `app.js` to change behavior
- Replace images in `src/assets/` with your own

## License

Same as the original project.
