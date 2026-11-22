// The little card that tells a piece's story (src/stories.ts). Used by the site and Popfold Studio.
// Opens next to where the piece was clicked (a bottom sheet on phones); Esc, the close button or a click
// elsewhere closes it.
//
// Its colours and fonts are CSS variables a site sets on :root (all optional):
//   --pf-card-bg  --pf-card-ink  --pf-card-accent (kicker text, buttons)  --pf-card-tag  --pf-card-focus
//   --pf-card-font  --pf-card-display
import { t } from './text';
import { linkKind } from './links';
import type { PropStory } from './types';

const CSS = `
.story-card {
  position: fixed; z-index: 40; width: min(320px, calc(100vw - 32px));
  background: var(--pf-card-bg, #FFFFFF); color: var(--pf-card-ink, #1B1630); border: 3px solid var(--pf-card-ink, #1B1630); border-radius: 22px;
  box-shadow: 6px 6px 0 var(--pf-card-ink, #1B1630); padding: 18px 18px 16px;
  font: 15px/1.5 var(--pf-card-font, 'DM Sans Variable', system-ui, sans-serif);
  transform-origin: var(--ox, 50%) var(--oy, 100%);
  animation: story-pop .32s cubic-bezier(.2, 1.4, .4, 1);
}
.story-card[hidden] { display: none; }
.story-card .story-kicker {
  display: inline-block; margin: 0 0 8px; padding: 4px 10px; border-radius: 999px;
  background: var(--pf-card-ink, #1B1630); color: var(--pf-card-accent, #FFD84D); font-weight: 700; font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase;
}
.story-card h3 { margin: 0 32px 6px 0; font: 800 21px/1.1 var(--pf-card-display, 'Bricolage Grotesque Variable', 'Arial Black', system-ui, sans-serif); letter-spacing: -0.01em; }
.story-card p { margin: 0; }
.story-card .story-meta { margin: -2px 0 8px; font-weight: 700; font-size: 13px; opacity: .7; }
.story-card .story-meta:empty { display: none; }
.story-card .story-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.story-card .story-links:empty { display: none; }
.story-card .story-links a { padding: 6px 12px; border-radius: 999px; border: 2px solid var(--pf-card-ink, #1B1630); background: var(--pf-card-accent, #FFD84D); color: var(--pf-card-ink, #1B1630); font-weight: 700; font-size: 13px; text-decoration: none; }
.story-card .story-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding: 0; list-style: none; }
.story-card .story-tags li { padding: 3px 10px; border: 2px solid var(--pf-card-ink, #1B1630); border-radius: 999px; background: var(--pf-card-tag, #EEF0F7); font-weight: 700; font-size: 12.5px; }
.story-card .story-close {
  position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 50%; padding: 0; font-size: 0;
  border: 2px solid var(--pf-card-ink, #1B1630); background: var(--pf-card-accent, #FFD84D); color: var(--pf-card-ink, #1B1630); cursor: pointer;
}
/* the cross is drawn, not typed: a "×" glyph sits off centre by a different amount in every font */
.story-card .story-close::before, .story-card .story-close::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 13px; height: 2.5px; border-radius: 2px;
  background: currentColor; transform: translate(-50%, -50%) rotate(45deg);
}
.story-card .story-close::after { transform: translate(-50%, -50%) rotate(-45deg); }
.story-card .story-close:focus-visible { outline: 3px solid var(--pf-card-focus, #2F6BFF); outline-offset: 2px; }
@keyframes story-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (max-width: 640px) {
  .story-card { left: 16px !important; right: 16px; top: auto !important; bottom: 16px; width: auto; }
}
@media (prefers-reduced-motion: reduce) { .story-card { animation: none; } }
`;

export function createStoryCard() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const card = document.createElement('aside');
  card.className = 'story-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'story-title');
  card.innerHTML = `
    <p class="story-kicker">Why it's here</p>
    <h3 id="story-title"></h3>
    <p class="story-meta"></p>
    <p class="story-text"></p>
    <ul class="story-tags" aria-label="${t('Skills')}"></ul>
    <div class="story-links"></div>
    <button class="story-close" type="button" aria-label="${t('Close')}">×</button>`;
  document.body.append(card);
  const title = card.querySelector('h3')!;
  const text = card.querySelector('.story-text')!;
  const tags = card.querySelector('.story-tags')!;
  const meta = card.querySelector('.story-meta')!;
  const links = card.querySelector('.story-links')!;
  const kicker = card.querySelector('.story-kicker')!;
  let openedAt = 0;
  let cameFrom: Element | null = null; // what had the keyboard focus when the card opened

  function close() {
    if (card.hidden) return;
    const inside = card.contains(document.activeElement);
    card.hidden = true;
    if (inside && cameFrom instanceof HTMLElement && cameFrom.isConnected) cameFrom.focus({ preventScroll: true });
    cameFrom = null;
  }
  card.querySelector('.story-close')!.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // a click anywhere else closes it (but not the click that opened it)
  addEventListener('click', (e) => {
    if (!card.hidden && performance.now() - openedAt > 50 && !card.contains(e.target as Node)) close();
  }, true);
  addEventListener('scroll', () => { if (performance.now() - openedAt > 400) close(); }, { passive: true });

  function open(story: PropStory, clientX: number, clientY: number) {
    // in the page's language, when it is a translated page (text.ts)
    title.textContent = t(story.title);
    text.textContent = t(story.text);
    tags.replaceChildren(...story.tags.map((tag) => Object.assign(document.createElement('li'), { textContent: t(tag) })));
    meta.textContent = story.meta ? t(story.meta) : '';
    kicker.textContent = t(story.kicker ?? "Why it's here");
    links.replaceChildren(...(story.links ?? []).filter((l) => linkKind(l.href)).map((l) => {
      const a = Object.assign(document.createElement('a'), { textContent: t(l.label), href: l.href });
      if (linkKind(l.href) === 'outside') Object.assign(a, { target: '_blank', rel: 'noopener noreferrer' }); // links within the site stay in this tab
      return a;
    }));
    if (card.hidden) cameFrom = document.activeElement;
    card.hidden = false;
    openedAt = performance.now();
    // beside the click, kept on screen
    const w = card.offsetWidth, h = card.offsetHeight, pad = 16;
    const left = Math.min(innerWidth - w - pad, Math.max(pad, clientX + 18));
    const above = clientY - h - 18 > pad;
    const top = above ? clientY - h - 18 : Math.min(innerHeight - h - pad, clientY + 18);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.setProperty('--ox', `${clientX - left}px`);
    card.style.setProperty('--oy', above ? '100%' : '0%');
    (card.querySelector('.story-close') as HTMLButtonElement).focus({ preventScroll: true });
  }

  return { open, close };
}
