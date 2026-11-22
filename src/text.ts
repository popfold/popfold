// The words a page shows in its own language. A translated page (popfoldFallback's `lang` and `text`) carries its
// translation file in <script id="popfold-text">; Popfold's own words in the browser go through t(), and so can a
// site's (words drawn on its art, say). A page without one shows every word as it is given.

let words: Map<string, string> | null = null;
const fold = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The page's translation of `s` (spaces folded to match), or `s` itself where the page has none. */
export function t(s: string): string {
  if (!words) {
    words = new Map();
    try {
      const el = typeof document === 'undefined' ? null : document.getElementById('popfold-text');
      if (el?.textContent) for (const [k, v] of Object.entries(JSON.parse(el.textContent) as Record<string, string>)) words.set(fold(k), v);
    } catch { /* a broken dictionary leaves the words as they are */ }
  }
  return words.get(fold(s)) ?? s;
}

/** The page's language, from <html lang> ('en' when it says none). */
export const pageLang = () => (typeof document === 'undefined' ? '' : document.documentElement.lang) || 'en';
