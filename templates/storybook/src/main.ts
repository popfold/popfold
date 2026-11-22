import '@fontsource-variable/dm-sans';
import '@fontsource-variable/bricolage-grotesque';
// the Bulgarian page's (style.css, :lang(bg)): the two above have no Cyrillic
import '@fontsource-variable/rubik';
import '@fontsource-variable/nunito';
import './style.css';
import { markFallback, markReady, scrollStage, shouldStart3D, viewToggle } from 'popfold/fallback';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
// where the story is, from the scroll position: one step per <section class="stage">, one page of the book each
const getStage = scrollStage();

async function boot() {
  // the page is already readable without 3D (stills + stories built in by popfoldFallback); upgrade if we can
  if (!shouldStart3D()) { markFallback(); viewToggle(); return; }
  // the page numbers are printed with the web font, so wait for it
  await Promise.all([
    document.fonts.load('600 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 40px "DM Sans Variable"'),
  ]).catch(() => undefined);
  const [{ startScene, createStoryCard }, { BOOK, BEATS, LINKS }] = await Promise.all([import('popfold'), import('./home')]);
  const storyCard = createStoryCard();
  await startScene({
    canvas, reducedMotion, homes: [BOOK], home: BOOK.id, beats: BEATS,
    transitions: LINKS, // links to other sections (home.json), if it has any
    avatar: false, // no guide figure in a book
    storyDot: '#D35D47',
    getStage,
    onStory: (story, _key, x, y) => storyCard.open(story, x, y),
    // a click on a page scrolls to its section: each page's section has the page's id
    onZone: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }),
  });
  markReady(canvas);
  viewToggle();
}

boot().catch((err) => { console.error(err); markFallback(); viewToggle(); });
