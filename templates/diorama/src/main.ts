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
  // text drawn on screens and signs uses the web fonts, so wait for them
  await Promise.all([
    document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 40px "DM Sans Variable"'),
  ]).catch(() => undefined);
  const [{ startScene, createStoryCard }, { ROOM, BEATS, LINKS }] = await Promise.all([import('popfold'), import('./room')]);
  const storyCard = createStoryCard();
  await startScene({
    canvas, reducedMotion, homes: [ROOM], home: ROOM.id, beats: BEATS,
    transitions: LINKS, // links to other sections (home.json): a door, a link on a story card, a card without 3D
    lazyModels: true, // the room (a few kilobytes) shows at once; its pieces spring in when their file lands
    getStage,
    onStory: (story, _key, x, y) => storyCard.open(story, x, y),
    onPick: (part) => {
      const id = part === 'left' ? 'lounge' : part === 'right' ? 'desk' : 'gallery';
      document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    },
  });
  markReady(canvas);
  viewToggle();
}

boot().catch((err) => { console.error(err); markFallback(); viewToggle(); });
