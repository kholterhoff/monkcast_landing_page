/**
 * Simple HTML sanitizer to ensure accessibility of injected content
 * This is a basic implementation - in production, use a library like DOMPurify
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  
  // Replace potentially problematic elements with more accessible alternatives
  let sanitized = html
    // Ensure all images have alt text
    .replace(/<img([^>]*)>/gi, (match, attributes) => {
      if (!/alt=["'][^"']*["']/i.test(attributes)) {
        return match.replace(/<img/i, '<img alt="Episode image"');
      }
      return match;
    })
    // Ensure all links have proper attributes
    .replace(/<a([^>]*)>/gi, (match, attributes) => {
      if (!/rel=["'][^"']*["']/i.test(attributes)) {
        return match.replace(/<a/i, '<a rel="noopener noreferrer"');
      }
      return match;
    })
    // Add proper heading structure
    .replace(/<h1([^>]*)>/gi, '<h3$1>')
    .replace(/<\/h1>/gi, '</h3>')
    // Ensure tables have proper accessibility
    .replace(/<table([^>]*)>/gi, '<table$1 role="grid">')
    // Add focus styles to interactive elements
    .replace(/<button([^>]*)>/gi, '<button$1 class="focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">')
    // Ensure iframes have titles
    .replace(/<iframe([^>]*)>/gi, (match, attributes) => {
      if (!/title=["'][^"']*["']/i.test(attributes)) {
        return match.replace(/<iframe/i, '<iframe title="Embedded content"');
      }
      return match;
    });
    
  return sanitized;
}

/**
 * Strip all HTML tags from a string, leaving only plain text
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}