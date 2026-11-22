// Popfold Studio for this site: open /studio.html on the dev server (saving to the home file works there only).
import { mountStudio } from 'popfold/studio';
import { BEATS, LINKS, ROOM } from './room';

mountStudio({
  homes: [ROOM],
  beats: BEATS,
  transitions: LINKS, // the links' doors show here, and the Links group edits them
  pickStages: { center: 1, left: 2, right: 3 },
  siteUrl: './',
});
