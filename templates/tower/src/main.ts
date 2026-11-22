import '@fontsource-variable/dm-sans';
import '@fontsource-variable/bricolage-grotesque';
import './style.css';
import { markFallback, markReady, scrollStage, shouldStart3D, viewToggle } from 'popfold/fallback';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
// where the story is, from the scroll position: one step per <section class="stage">
const getStage = scrollStage();

async function boot() {
  // the page is already readable without 3D (stills + stories built in by popfoldFallback); upgrade if we can
  if (!shouldStart3D()) { markFallback(); viewToggle(); return; }
  // the floors' neon signs are drawn with the web fonts, so wait for them
  await Promise.all([
    document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 40px "DM Sans Variable"'),
  ]).catch(() => undefined);
  const [{ startScene, createStoryCard }, { TOWER, BEATS, LINKS }] = await Promise.all([import('popfold'), import('./home')]);
  const storyCard = createStoryCard();
  await startScene({ // (the tower is shown at night: its home file says "mood": "evening")
    canvas, reducedMotion, homes: [TOWER], home: TOWER.id, beats: BEATS,
    transitions: LINKS, // links to other sections (home.json), if it has any
    avatar: false, // no guide figure on this site
    storyDot: '#FFFFFF',
    getStage,
    onStory: (story, _key, x, y) => storyCard.open(story, x, y),
    // a click on a floor scrolls to its section: each floor's section has the floor's id
    onZone: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }),
  });
  markReady(canvas);
  viewToggle();
}

boot().catch((err) => { console.error(err); markFallback(); viewToggle(); });
