// Popfold Studio for this site: open /studio.html on the dev server (saving layouts and stills works there only).
import { mountStudio } from 'popfold/studio';
import { BEATS, BOOK, LINKS } from './home';

mountStudio({
  homes: [BOOK],
  beats: BEATS,
  transitions: LINKS, // the links' doors show here, and the Links group edits them
  avatar: false,
  storyDot: '#D35D47',
  siteUrl: './',
});
