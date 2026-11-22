import { defineConfig } from 'vite';
import { homeSaver, popfoldFallback } from 'popfold/vite';

// A Popfold site. base './' keeps every asset path relative, so dist/ works from any host or sub-folder.
// Two pages: the site (index.html) and Popfold Studio (studio.html), whose Save writes src/home.json.
// popfoldFallback builds the page without 3D into index.html: the stories under their sections, the stills from
// public/stills/, llms.txt and robots.txt. Add siteUrl and jsonLd once the site has a real address.
export default defineConfig({
  base: './',
  plugins: [
    homeSaver({ home: 'src/home.json' }), // the studio's Save writes moved pieces into the home file
    popfoldFallback({
      siteName: 'Your Studio',
      homeFile: 'src/home.json', // its pieces' stories are written under their sections, and its id names the stills
      storiesHeading: 'On this floor',
    }),
  ],
  build: {
    target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 760, // three.js is lazy-loaded
    rollupOptions: { input: { main: 'index.html', studio: 'studio.html' } },
  },
});
