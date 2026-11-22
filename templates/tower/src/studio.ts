// Popfold Studio for this site: open /studio.html on the dev server (saving layouts and stills works there only).
import { mountStudio } from 'popfold/studio';
import { BEATS, LINKS, TOWER } from './home';

mountStudio({
  homes: [TOWER],
  beats: BEATS,
  transitions: LINKS, // the links' doors show here, and the Links group edits them
  avatar: false,
  storyDot: '#FFFFFF',
  siteUrl: './',
});
