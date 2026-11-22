// The library bundle's entry (`pnpm build:lib` -> dist/popfold.js): the whole engine, with three.js inside, for a
// page with no build step, and the <popfold-home> element, defined as the bundle loads.
export * from './index';
export { PopfoldHome } from './element';
// the three.js inside the bundle, for a page's own code (a kind of piece, a diorama's art): one copy, not two
export * as THREE from 'three';
