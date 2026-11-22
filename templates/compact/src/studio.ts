// Popfold Studio for this site: open /studio.html on the dev server (saving layouts and stills works there only).
import { mountStudio } from 'popfold/studio';
import type { HomeRecipe } from 'popfold';
import { BEATS, K, LINKS, OFFICE } from './home';

// A home only the studio has: the office in another palette and in the evening, to try before any page shows it. It
// is made in code from the office (no file of its own, so the studio downloads its changes rather than saving
// them), and its stills go in stills/, which no build carries.
const { remake: _file, places: _places, ...office } = OFFICE;
const SAGE: HomeRecipe = {
  ...office,
  id: 'office-sage', name: 'Consulting office, sage', blurb: 'Another palette, in the evening; no page shows it.',
  mood: 'evening', // its own time of day: the studio switches to it, and its stills are taken in it
  look: { ...OFFICE.look!, base: K.sage, lid: K.navy, leftSlab: K.coral, rightSlab: K.butter },
  swatch: [K.sage, K.navy, K.coral, K.butter],
};

mountStudio({
  homes: [OFFICE, SAGE],
  beats: BEATS,
  transitions: LINKS, // the links' doors show here, and the Links group edits them
  avatar: false,
  pickStages: { center: 1, left: 2, right: 3 },
  siteUrl: './',
});
