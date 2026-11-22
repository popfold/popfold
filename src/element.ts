// <popfold-home>: a home on any page, from its JSON file, with no build step. The library bundle (`pnpm build:lib`,
// dist/popfold.js) defines it when it loads:
//
//   <script type="module" src="popfold.js"></script>
//   <popfold-home src="home.json" style="height: 80vh"></popfold-home>
//
// The story follows the element through the viewport (the first beat as it comes in, the last as it leaves), or a
// fixed beat: stage="2" (a number, so 1.5 is halfway). Models and art load from the home file's folder, or from base.
// Other attributes: light="evening", guide (show the guide figure), ambient="off" (hold the decoration still and draw
// nothing at rest), side (keep the beats' sideways shift, made to leave room for a page's text; off by default).
// Pieces whose kind is a model file need nothing more; kinds built in code, and a diorama's painted art, are given
// from a script before the element connects: PopfoldHome.code = { kinds: { … }, diorama: { art: { … } } }.
import { startScene } from './engine';
import { homeFromFile, type HomeCode } from './home-file';
import { isBuiltIn } from './pieces';
import { createStoryCard } from './story-card';

type Scene = Awaited<ReturnType<typeof startScene>>;

export class PopfoldHome extends HTMLElement {
  /** code the home files on this page need: kinds of piece built in code, a diorama's art (see homeFromFile) */
  static code: HomeCode = {};
  static observedAttributes = ['stage', 'light'];

  #scene: Scene | null = null;
  #canvas = document.createElement('canvas');
  #starting: Promise<void> | null = null;

  /** the scene, once the home is shown (null before) */
  get scene() { return this.#scene; }

  connectedCallback() {
    if (this.#starting) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host { display: block; position: relative; min-height: 320px; } canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }';
    this.#canvas.setAttribute('aria-hidden', 'true');
    shadow.replaceChildren(style, this.#canvas);
    this.#starting = this.#start().catch((err) => {
      console.error(err);
      this.dispatchEvent(new CustomEvent('popfold-error', { detail: err }));
    });
  }

  disconnectedCallback() {
    this.#scene?.dispose();
    this.#scene = null;
    this.#starting = null;
  }

  attributeChangedCallback(name: string) {
    const light = this.#light();
    if (name === 'light' && this.#scene && light) this.#scene.setLighting(light);
  }

  /** the light attribute, if it says one (without it the home's own mood) */
  #light() { const l = this.getAttribute('light'); return l === 'evening' || l === 'day' ? l : null; }

  /** where the story is: the stage attribute, or how far the element has come through the viewport */
  #stage(last: number) {
    const fixed = this.getAttribute('stage');
    if (fixed !== null && fixed !== '' && !Number.isNaN(Number(fixed))) return Math.max(0, Math.min(last, Number(fixed)));
    const r = this.getBoundingClientRect(), h = innerHeight || 1;
    const through = (h - r.top) / (r.height + h); // 0 as it comes in at the bottom, 1 as it leaves at the top
    return Math.max(0, Math.min(1, (through - 0.15) / 0.7)) * last;
  }

  async #start() {
    const src = this.getAttribute('src');
    if (!src) throw new Error('<popfold-home> needs src, the home\'s JSON file');
    const url = new URL(src, location.href);
    const json = await (await fetch(url)).json();
    if (!this.isConnected) return;
    const code = PopfoldHome.code;
    // pieces whose kind is not built in code (the site's or Popfold's) are model files: models/props/<kind>.glb beside the home file
    const kinds = Object.keys(code.kinds ?? {});
    const props = [...new Set(((json?.pieces ?? []) as { kind?: string }[]).map((p) => p.kind).filter((k): k is string => !!k && !kinds.includes(k) && !isBuiltIn(k)))];
    const { recipe, beats, transitions } = homeFromFile(json, { props, ...code });
    const base = new URL(this.getAttribute('base') ?? '.', url).href;
    const last = Math.max(0, beats.length - 1);
    // a click on a story's dot opens its card, beside the piece (the card's colours are the page's --pf-card-* )
    const card = createStoryCard();
    this.#scene = await startScene({
      onStory: (story, _key, x, y) => card.open(story, x, y),
      canvas: this.#canvas, homes: [recipe], home: recipe.id, beats, transitions, base,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      getStage: () => this.#stage(last),
      // the page around the element is the page's own: only the element itself is the home
      isOverUi: (t) => t !== this,
      avatar: this.hasAttribute('guide') ? undefined : false,
      ambient: this.getAttribute('ambient') !== 'off',
      debug: false,
    });
    // beats move the home aside to make room for a page's text; in an element it is centred, unless side is set
    if (!this.hasAttribute('side')) this.#scene.override.side = 0;
    const light = this.#light();
    if (light) this.#scene.setLighting(light);
    this.dispatchEvent(new CustomEvent('popfold-ready', { detail: this.#scene }));
  }
}

if (!customElements.get('popfold-home')) customElements.define('popfold-home', PopfoldHome);
