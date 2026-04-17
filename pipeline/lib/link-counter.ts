export interface LinkCounts {
  internalLinks: number;
  externalLinks: number;
}

/**
 * Count internal vs external links in markdown content.
 * Internal = same domain or relative URL. External = different domain.
 */
export function countLinks(markdown: string, pageDomain: string): LinkCounts {
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let internal = 0;
  let external = 0;
  let match;

  const normalizedDomain = pageDomain.replace(/^www\./, '').toLowerCase();

  while ((match = linkRegex.exec(markdown)) !== null) {
    const url = match[2];
    if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;

    try {
      const parsed = new URL(url, `https://${pageDomain}`);
      const linkDomain = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (linkDomain === normalizedDomain) {
        internal++;
      } else {
        external++;
      }
    } catch {
      if (url.startsWith('/') || !url.includes('://')) {
        internal++;
      }
    }
  }

  return { internalLinks: internal, externalLinks: external };
}
