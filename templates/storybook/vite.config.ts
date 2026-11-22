import { defineConfig } from 'vite';
import { homeSaver, popfoldFallback } from 'popfold/vite';

// A Popfold site. base './' keeps every asset path relative, so dist/ works from any host or sub-folder.
// Two pages: the site (index.html) and Popfold Studio (studio.html), whose Save writes src/home.json. The site is
// also in Bulgarian, at bg/: the same page, its words swapped by src/i18n/bg.json (the build makes bg/index.html).
// popfoldFallback builds the page without 3D into index.html: the stories under their sections, the stills from
// public/stills/, llms.txt and robots.txt. Add siteUrl and jsonLd once the site has a real address.
export default defineConfig({
  base: './',
  plugins: [
    homeSaver({ home: 'src/home.json' }), // the studio's Save writes moved pieces into the home file
    popfoldFallback({
      siteName: 'Your Storybook',
      pages: [
        // its pieces' stories are written under their sections, and its id names the stills
        { html: 'index.html', homeFile: 'src/home.json', storiesHeading: 'On this page' },
        // the same page in Bulgarian: drop this line (and src/i18n/, and the language links) for one language
        { html: 'bg/index.html', from: 'index.html', lang: 'bg', text: 'src/i18n/bg.json', homeFile: 'src/home.json', storiesHeading: 'On this page' },
      ],
    }),
  ],
  build: {
    target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 760, // three.js is lazy-loaded
    rollupOptions: { input: { main: 'index.html', studio: 'studio.html' } },
  },
});
