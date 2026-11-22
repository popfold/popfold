// Which links a story may carry. Pure, so the browser's story card and the build's page writer agree.

/**
 * 'outside': http, https or mailto (opens in a new tab). 'inside': a link within the site, with no scheme
 * ("docs/guide", "./tour/", "/docs/", "#contact"); it opens in the same tab. null: anything else
 * (javascript:, data:, protocol-relative //host, backslash paths), which is dropped.
 */
export function linkKind(href: string): 'outside' | 'inside' | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return 'outside';
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//') || h.includes('\\')) return null;
  return 'inside';
}
