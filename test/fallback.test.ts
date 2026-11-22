// The page without 3D: what popfoldFallback() writes into a site's HTML, llms.txt and sitemap.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFacts, casesUsed, linkHref, linkName, modelSizes, popfoldFallback, readPage, STALE_RELOAD, type FallbackOptions } from '../src/vite-plugin.ts';

const page = (title: string, sections: string) => `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="About ${title}." /></head><body><main id="main">${sections}</main></body></html>`;
const section = (id: string, h: string) => `
    <section class="stage" id="${id}"><div class="card"><h2>${h}</h2><p>Words about ${h}.</p></div></section>`;

/** Run the plugin over pages as Vite would, in a throwaway site folder. */
function run(options: FallbackOptions, files: Record<string, string>, stills: string[] = [], command = 'serve') {
  const root = mkdtempSync(join(tmpdir(), 'popfold-test-'));
  mkdirSync(join(root, 'public/stills'), { recursive: true });
  for (const s of stills) writeFileSync(join(root, 'public/stills', s), 'x');
  const warnings: string[] = [];
  const plugin = popfoldFallback(options) as any;
  plugin.configResolved({ command, root, publicDir: join(root, 'public'), logger: { warn: (m: string) => warnings.push(m) } });
  const html: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) html[file] = plugin.transformIndexHtml.handler(text, { filename: join(root, file) });
  const emitted: Record<string, string> = {};
  plugin.generateBundle.call({ emitFile: (f: { fileName: string; source: string }) => { emitted[f.fileName] = f.source; } });
  return { html, emitted, warnings, api: plugin.api };
}

const STORY = { title: 'The desk', text: 'Where it starts.', tags: ['Work'], links: [{ label: 'Docs', href: 'docs/guide' }, { label: 'Bad', href: 'javascript:alert(1)' }] };

test('one page: stories go under their section, stills beside each stage', () => {
  const { html, emitted, warnings, api } = run(
    { siteName: 'Site', siteUrl: 'https://example.com', stories: { 'center/desk': STORY, 'left-wall/map': { title: 'The map', text: 'Plans.', tags: [] } },
      sections: { center: 'work', left: 'plans' }, stillsHome: 'office' },
    { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work') + section('plans', 'Plans')), 'studio.html': '<html><head></head></html>' },
    ['office-0.webp', 'office-1.webp'],
  );
  const out = html['index.html'];
  assert.equal(warnings.length, 0);
  assert.match(out, /id="work"[\s\S]*?<div class="pf-stories"><h3>Highlights<\/h3><article class="pf-story" tabindex="0" data-pf-story="center\/desk"><h4>The desk<\/h4>/);
  assert.match(out, /id="plans"[\s\S]*?The map/);
  assert.match(out, /href="docs\/guide">Docs<\/a>/, 'a link within the site, same tab');
  assert.doesNotMatch(out, /javascript:/, 'unsafe links are dropped');
  assert.equal(out.match(/class="pf-still"/g)?.length, 2, 'only the stills that exist');
  assert.match(out, /src="\.\/stills\/office-0\.webp" alt="Site: Hello"/);
  assert.match(out, /rel="canonical" href="https:\/\/example\.com\/"/);
  assert.match(out, /og:image" content="https:\/\/example\.com\/stills\/office-0\.webp"/);
  assert.equal(html['studio.html'], '<html><head></head></html>', 'other pages are left alone');
  assert.match(emitted['llms.txt'], /^# Site\n\n> About Site\./);
  assert.match(emitted['llms.txt'], /## Work\n\nWords about Work\.\n\n- \*\*The desk\*\*: Where it starts\. \[Work\]/);
  assert.match(emitted['sitemap.xml'], /<loc>https:\/\/example\.com\/<\/loc>/);
  assert.deepEqual(api.captures, [{ home: 'office', studio: 'studio.html' }]);
  assert.deepEqual(api.pages, [{ html: 'index.html', source: 'index.html', home: 'office', studio: 'studio.html', stories: ['center/desk', 'left-wall/map'], sections: { center: 'work', left: 'plans' }, transitions: [] }]);
});

test('a story with no section to go under is a warning on the dev server and stops a build', () => {
  const { warnings } = run({ siteName: 'Site', stories: { 'attic/box': STORY } }, { 'index.html': page('Site', section('top', 'Hello')) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no <section id="attic">/);
  assert.throws(() => run({ siteName: 'Site', stories: { 'attic/box': STORY } }, { 'index.html': page('Site', section('top', 'Hello')) }, [], 'build'), /no <section id="attic"> for its stories \(attic\/box\)/);
});

test('several pages: each gets its own stories and stills, with paths that work from a sub-folder', () => {
  const { html, emitted, api } = run(
    { siteName: 'Site', siteUrl: 'https://example.com/', jsonLd: { '@type': 'Thing' }, pages: [
      { html: 'index.html', stories: { 'center/desk': STORY }, sections: { center: 'work' }, stillsHome: 'office' },
      { html: 'tour/index.html', stories: { 'lab/robot': { title: 'The robot', text: 'Beep.', tags: [] } }, stillsHome: 'tower', storiesHeading: 'On this floor' },
    ] },
    { 'index.html': page('Home', section('work', 'Work')), 'tour/index.html': page('Tour', section('lab', 'Lab')) },
    ['office-0.webp', 'tower-0.webp'],
  );
  assert.match(html['index.html'], /The desk/);
  assert.doesNotMatch(html['index.html'], /The robot/);
  assert.match(html['index.html'], /application\/ld\+json/, 'structured data on the first page');
  assert.match(html['tour/index.html'], /<h3>On this floor<\/h3><article class="pf-story" tabindex="0" data-pf-story="lab\/robot"><h4>The robot/);
  assert.doesNotMatch(html['tour/index.html'], /application\/ld\+json/);
  assert.match(html['tour/index.html'], /src="\.\/\.\.\/stills\/tower-0\.webp"/, 'stills live at the site root');
  assert.match(html['tour/index.html'], /rel="canonical" href="https:\/\/example\.com\/tour\/"/);
  assert.match(emitted['llms.txt'], /# Home[\s\S]*\n---\n\n# Tour\n\nPage: https:\/\/example\.com\/tour\//);
  assert.match(emitted['sitemap.xml'], /<loc>https:\/\/example\.com\/<\/loc>[\s\S]*<loc>https:\/\/example\.com\/tour\/<\/loc>/);
  assert.deepEqual(api.captures, [{ home: 'office', studio: 'studio.html' }, { home: 'tower', studio: 'tour/studio.html' }]);
});

test('buildFacts() says what a build is, and "unknown" for what it cannot find out', () => {
  // a folder that is no git repository and has no package.json
  const bare = buildFacts(mkdtempSync(join(tmpdir(), 'popfold-facts-')));
  assert.deepEqual([bare.commit, bare.committed, bare.dirty, bare.site], ['unknown', '', false, 'unknown']);
  assert.match(bare.three, /^\d+\.\d+\.\d+/, 'three.js is found through Popfold when the site has none of its own');
  assert.match(bare.popfold, /^v?\d+\.\d+\.\d+/);
  assert.ok(!Number.isNaN(Date.parse(bare.built)));
  // and the plugin hands them to the page
  const plugin = popfoldFallback({ siteName: 'Test' }) as any;
  const facts = JSON.parse(plugin.config({ root: process.cwd() }).define.__POPFOLD_BUILD__);
  assert.deepEqual(Object.keys(facts).sort(), ['built', 'commit', 'committed', 'dirty', 'popfold', 'site', 'three']);
  assert.match(facts.commit, /^[0-9a-f]{7,}$/);
});

test('a page with a home file takes its stories and its stills from the file as it is on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'popfold-homefile-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'public/stills'), { recursive: true });
  writeFileSync(join(root, 'public/stills/den-0.webp'), 'x');
  const home = (title: string) => JSON.stringify({ id: 'den', name: 'Den', pieces: [
    { id: 'desk', room: 'center', kind: 'desk', at: [0, 0], story: { title, text: 'Where it starts.', tags: [] } },
    { id: 'lamp', room: 'center', kind: 'lamp', at: [1, 0] },
  ] });
  writeFileSync(join(root, 'src/home.json'), home('The desk'));
  const plugin = popfoldFallback({ siteName: 'Test', homeFile: 'src/home.json', sections: { center: 'top' } }) as any;
  plugin.config({ root });
  plugin.configResolved({ command: 'build', root, publicDir: join(root, 'public'), logger: { warn: () => undefined } });
  assert.deepEqual(plugin.api.captures, [{ home: 'den', studio: 'studio.html' }], 'the stills are named after the file\'s id');
  assert.deepEqual(plugin.api.pages[0].stories, ['center/desk']);
  const build = () => plugin.transformIndexHtml.handler(page('Test', section('top', 'Top')), { filename: join(root, 'index.html') }) as string;
  assert.match(build(), /data-pf-story="center\/desk"><h4>The desk<\/h4>/);
  assert.match(build(), /stills\/den-0\.webp/);
  // the studio saves the file; the next page built shows it, with nothing restarted
  writeFileSync(join(root, 'src/home.json'), home('The desk, revised'));
  assert.match(build(), /<h4>The desk, revised<\/h4>/);
  // a home file that is not there is said in words
  const lost = popfoldFallback({ siteName: 'Test', homeFile: 'src/nope.json' }) as any;
  lost.config({ root });
  assert.throws(() => lost.api.pages, /could not read the home file src\/nope\.json/);
});

test('a model budget stops a build that is over it, and only a build', () => {
  const root = mkdtempSync(join(tmpdir(), 'popfold-budget-'));
  mkdirSync(join(root, 'public/models/props/deep'), { recursive: true });
  writeFileSync(join(root, 'public/models/props/sofa.glb'), Buffer.alloc(120_000));
  writeFileSync(join(root, 'public/models/props/deep/lamp.glb'), Buffer.alloc(40_000));
  writeFileSync(join(root, 'public/models/notes.txt'), 'not a model');
  const sizes = modelSizes(root);
  assert.deepEqual([sizes.files.map((f) => f.file).sort(), sizes.total, sizes.over], [['public/models/props/deep/lamp.glb', 'public/models/props/sofa.glb'], 160_000, []]);
  assert.deepEqual(modelSizes(root, { each: 100, total: 150 }).over, [
    'public/models/props/sofa.glb is 120 KB; the budget for one model is 100 KB',
    'public/models holds 160 KB in 2 models; the budget is 150 KB',
  ]);
  assert.deepEqual(modelSizes(root, { each: 120, total: 160 }).over, [], 'at the budget is within it');
  const start = (command: string, modelBudget?: { each?: number; total?: number }) => {
    const plugin = popfoldFallback({ siteName: 'Test', modelBudget }) as any;
    plugin.config({ root });
    plugin.configResolved({ command, root, publicDir: join(root, 'public'), logger: { warn: () => undefined } });
    return () => plugin.buildStart();
  };
  assert.throws(start('build', { each: 100 }), /over the site's budget:\n {2}public\/models\/props\/sofa\.glb is 120 KB/);
  assert.doesNotThrow(start('serve', { each: 100 }), 'the dev server still starts');
  assert.doesNotThrow(start('build', { each: 200, total: 200 }));
  assert.doesNotThrow(start('build'), 'no budget, no limit');
});

test('readPage() finds sections however their tags are written, and leaves nested sections their own', () => {
  const html = `<!doctype html><html><head><title>A &amp; B</title><meta name="description" content="Hi"></head><body>
    <section class='stage hero' id='top'><h1>Top <em>one</em></h1><div class="card"><p>Words</p><span>x</span><span>y</span></div></section>
    <section id="outer" class="stage"><div><h2>Outer</h2><p>Out</p><section id="inner"><h2>Inner</h2><article><p>In</p></article></section></div></section>
    <section id="bare"><h2>Bare</h2>Just text</section>
  </body></html>`;
  const page = readPage(html);
  assert.equal(page.title, 'A & B');
  assert.equal(page.description, 'Hi');
  assert.deepEqual(page.sections.map((s) => [s.id, s.stage, s.heading]), [['top', true, 'Top one'], ['outer', true, 'Outer'], ['inner', false, 'Inner'], ['bare', false, 'Bare']]);
  assert.equal(page.sections[0].text, 'Words x y');
  assert.equal(page.sections[1].text, 'Out'); // the inner section's words are its own
  // a still goes right after the start tag; stories go before the end of the last card, not of a nested one
  assert.equal(html.slice(page.sections[0].open - 15, page.sections[0].open), "class='stage hero' id='top'>".slice(-15));
  assert.equal(html.slice(page.sections[1].cardEnd, page.sections[1].cardEnd + 6), '</div>');
  assert.ok(page.sections[1].cardEnd > html.indexOf('</section>', html.indexOf('id="inner"')));
  assert.equal(html.slice(page.sections[3].cardEnd, page.sections[3].cardEnd + 10), '</section>');
  assert.equal(html.slice(page.headEnd, page.headEnd + 7), '</head>');
  // a page with no <head> written still gets its head tags, before the body
  assert.equal(readPage('<section id="a"></section>').headEnd, 0);
});

test('a page missing its own build files reloads once in 30 seconds; another site\'s file never reloads it', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, string>();
  let reloads = 0, now = 1_000_000;
  runInNewContext(STALE_RELOAD, {
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    location: { origin: 'https://site.example', reload: () => { reloads++; } },
    Date: { now: () => now },
    String,
  });
  const fail = (src: string, tagName = 'SCRIPT') => handlers.error({ target: { tagName, src } });
  fail('https://static.cloudflareinsights.com/beacon.min.js');
  fail('https://site.example/assets/main-old.js', 'IMG');
  assert.equal(reloads, 0);
  fail('https://site.example/assets/main-old.js');
  assert.equal(reloads, 1);
  now += 10_000; handlers['vite:preloadError']({});
  assert.equal(reloads, 1, 'not again within 30 seconds');
  now += 30_000; handlers['vite:preloadError']({});
  assert.equal(reloads, 2);
});

test('links: a labelled one is a card in its section with its target\'s still, also for another home; llms.txt lists it', async () => {
  const { transitionHref } = await import('../src/transitions.ts');
  const transitions = [
    { from: 'top', to: 'plans', label: 'See the plans' },
    { from: 'top', to: { home: 'refined', section: 'work' }, label: 'The refined work room' },
    { from: 'work', to: 'plans' }, // no label: a door in 3D only
    { from: 'plans', to: 'top', label: 'Back', card: false },
  ];
  for (const t of transitions) assert.equal(linkHref(t), transitionHref(t)); // the build and the browser agree
  const { html, emitted, warnings, api } = run(
    { siteName: 'Site', stillsHome: 'office', transitions },
    { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work') + section('plans', 'Plans')), 'studio.html': '<html><head></head></html>' },
    ['office-2.webp', 'refined-1.webp'],
  );
  const out = html['index.html'];
  assert.equal(warnings.length, 0);
  assert.match(out, /id="top"[\s\S]*?<nav class="pf-links" aria-label="Go to"><a class="pf-link" href="#plans"><img src="\.\/stills\/office-2\.webp" alt=""[^>]*\/><span>See the plans<\/span><\/a><a class="pf-link" href="\?home=refined#work"><img src="\.\/stills\/refined-1\.webp"[^>]*\/><span>The refined work room<\/span><\/a><\/nav>[\s\S]*?<\/div><\/section>/);
  assert.equal((out.match(/class="pf-link"/g) ?? []).length, 2);
  assert.match(emitted['llms.txt'], /- Link: \[See the plans\]\(#plans\)\n- Link: \[The refined work room\]\(\?home=refined#work\)/);
  // the home a link leads to gets its stills captured with the page's studio
  assert.deepEqual(api.captures, [{ home: 'office', studio: 'studio.html' }, { home: 'refined', studio: 'studio.html' }]);
  // a link from a section the page lacks stops a build
  assert.throws(() => run({ siteName: 'Site', stillsHome: 'office', transitions: [{ from: 'nope', to: 'top', label: 'X' }] }, { 'index.html': page('Site', section('top', 'Hello')) }, [], 'build'), /no <section id="nope"> for the link "X"/);
});

test('a link from another home has no card on this page (fromHome)', () => {
  const transitions = [
    { from: 'top', to: 'work', label: 'Here', fromHome: 'office' },
    { from: 'top', to: 'work', label: 'From the other home', fromHome: 'refined' },
  ];
  const { html } = run({ siteName: 'Site', stillsHome: 'office', transitions }, { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work')), 'studio.html': '<html><head></head></html>' });
  assert.match(html['index.html'], /<span>Here<\/span>/);
  assert.doesNotMatch(html['index.html'], /From the other home/);
});

test('a story that moves between homes: each section\'s still is its own home\'s, and those homes are captured', () => {
  const { html, api } = run(
    { siteName: 'Site', stillsHome: 'toy', sectionHomes: { top: 'toy', work: 'refined' } },
    { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work')), 'studio.html': '<html><head></head></html>' },
    ['toy-0.webp', 'refined-1.webp'],
  );
  assert.match(html['index.html'], /id="top"[\s\S]*?stills\/toy-0\.webp/);
  assert.match(html['index.html'], /id="work"[\s\S]*?stills\/refined-1\.webp/);
  assert.deepEqual(api.captures, [{ home: 'toy', studio: 'studio.html' }, { home: 'refined', studio: 'studio.html' }]);
});

test('a link with a button is marked for 3D (named as the browser names it), unless it hides (cue none)', async () => {
  const { linkKey } = await import('../src/transitions.ts');
  const transitions = [
    { from: 'top', to: 'work', label: 'Go to work', button: true },
    { from: 'top', to: { home: 'refined', section: 'work' }, label: 'Refined work', button: true, fromHome: 'office' },
    { from: 'top', to: 'work', label: 'A secret', button: true, cue: 'none' as const },
  ];
  for (const t of transitions) assert.equal(linkName(t), linkKey(t));
  const { html } = run({ siteName: 'Site', stillsHome: 'office', transitions }, { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work')), 'studio.html': '<html><head></head></html>' });
  const out = html['index.html'];
  assert.match(out, /<a class="pf-link pf-link-button" data-pf-link=":top&gt;work" href="#work">/);
  assert.match(out, /<a class="pf-link pf-link-button" data-pf-link="office:top&gt;refined\/work" data-pf-from-home="office" href="\?home=refined#work">/);
  assert.match(out, /<a class="pf-link" href="#work"><span>A secret<\/span>/);
});

test('a button for a link from another home is written for 3D only, and has no card without 3D', () => {
  const transitions = [{ from: 'top', to: { home: 'office', section: 'work' }, label: 'Back to the office', button: true, fromHome: 'refined' }];
  const { html } = run({ siteName: 'Site', stillsHome: 'office', transitions }, { 'index.html': page('Site', section('top', 'Hello') + section('work', 'Work')), 'studio.html': '<html><head></head></html>' });
  assert.match(html['index.html'], /<a class="pf-link pf-link-button pf-link-3d-only" data-pf-link="refined:top&gt;office\/work" data-pf-from-home="refined" href="#work">/); // (its own home: the page it is on)
  assert.match(html['index.html'], /html:not\(\.has-3d\) \.pf-link-3d-only/);
});

test("casesUsed() names the cases the site's home files use, and both when it has none", () => {
  const site = (files: Record<string, unknown>) => {
    const root = mkdtempSync(join(tmpdir(), 'popfold-cases-'));
    mkdirSync(join(root, 'src/homes'), { recursive: true });
    for (const [name, data] of Object.entries(files)) writeFileSync(join(root, 'src', name), JSON.stringify(data));
    return casesUsed(root).sort();
  };
  const beats = [{ id: 'top' }];
  assert.deepEqual(site({}), ['crisp', 'round']);
  assert.deepEqual(site({ 'home.json': { beats } }), ['round']);
  assert.deepEqual(site({ 'home.json': { beats, look: { shell: 'crisp' } }, 'homes/b.json': { beats, look: { shell: 'round' } } }), ['crisp', 'round']);
  assert.deepEqual(site({ 'home.json': { beats, floors: [] }, 'other.json': { not: 'a home' } }), []);
  assert.deepEqual(site({ 'home.json': { beats, diorama: { url: 'm.glb' } } }), []);
  assert.deepEqual(site({ 'home.json': { beats, look: { shell: { url: 'models/case.glb' } } } }), []);
  assert.deepEqual(site({ 'home.json': { beats, look: { shell: 'round', parts: { lid: 'crisp' } } } }), ['crisp', 'round']); // a part from the other case
});

test("a page made from another page's HTML shows its own home, at its own address, with links between the two", () => {
  const root = mkdtempSync(join(tmpdir(), 'popfold-made-'));
  mkdirSync(join(root, 'public/stills'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  for (const s of ['toy-0.webp', 'toy-1.webp', 'refined-0.webp', 'refined-1.webp']) writeFileSync(join(root, 'public/stills', s), 'x');
  const home = (id: string, other: string) => JSON.stringify({ id, beats: [{ id: 'top' }, { id: 'room' }], pieces: [], stories: { [`room/${id}-chair`]: { title: `${id} chair`, text: 'A chair.', tags: [] } },
    transitions: [{ from: 'top', to: { home: other, section: 'room' }, label: `This room in ${other}` }] });
  writeFileSync(join(root, 'src/toy.json'), home('toy', 'refined'));
  writeFileSync(join(root, 'src/refined.json'), home('refined', 'toy'));
  const index = `<!doctype html><html><head><title>Site</title><link rel="icon" href="./favicon.svg" /><meta name="description" content="About." /></head><body><main id="main">
    <section class="stage" id="top"><div class="card"><h2>Top</h2><p>Hi. <a href="#room">Room</a> <a href="https://example.com/">out</a></p></div></section>
    <section class="stage" id="room"><div class="card"><h2>Room</h2><p>A room.</p></div></section></main><script type="module" src="./src/main.ts"></script></body></html>`;
  writeFileSync(join(root, 'index.html'), index);
  const plugin = popfoldFallback({ siteName: 'Site', siteUrl: 'https://example.com/', pages: [{ html: 'index.html', homeFile: 'src/toy.json' }, { html: 'refined/index.html', from: 'index.html', homeFile: 'src/refined.json' }] }) as any;
  // a build gets the made page as an entry of its own
  const config: any = { root, build: { rollupOptions: { input: { main: join(root, 'index.html') } } } };
  plugin.config(config, { command: 'build' });
  assert.deepEqual(Object.keys(config.build.rollupOptions.input), ['main', 'pf-refined']);
  plugin.configResolved({ command: 'build', root, publicDir: join(root, 'public'), logger: { warn: () => {} } });
  // its HTML is the main page's, with its relative paths moved one folder up; anchors and outside links stay
  const id = plugin.resolveId('refined/index.html');
  assert.equal(id, join(root, 'refined/index.html'));
  const made: string = plugin.load(id);
  assert.match(made, /href="\.\.\/favicon\.svg"/);
  assert.match(made, /src="\.\.\/src\/main\.ts"/);
  assert.match(made, /href="#room"/);
  assert.match(made, /href="https:\/\/example\.com\/"/);
  const out = (file: string, text: string) => plugin.transformIndexHtml.handler(text, { filename: join(root, file) });
  const toyPage = out('index.html', index), refinedPage = out('refined/index.html', made);
  // each page says which home it shows, and has that home's stills, stories and share image
  assert.match(toyPage, /<meta name="popfold-home" content="toy" \/>/);
  assert.match(refinedPage, /<meta name="popfold-home" content="refined" \/>/);
  assert.match(refinedPage, /<meta name="popfold-base" content="\.\.\/" \/>/);
  assert.doesNotMatch(toyPage, /popfold-base/);
  // its studio is the main page's, at the site's root: the debug panel's link is told so
  assert.match(refinedPage, /<meta name="popfold-studio" content="\.\.\/studio\.html" \/>/);
  assert.doesNotMatch(toyPage, /popfold-studio/);
  assert.match(refinedPage, /src="\.\/\.\.\/stills\/refined-0\.webp"/);
  assert.match(refinedPage, /refined chair/);
  assert.doesNotMatch(refinedPage, /toy chair/);
  assert.match(refinedPage, /<meta property="og:image" content="https:\/\/example\.com\/stills\/refined-0\.webp" \/>/);
  assert.match(refinedPage, /<link rel="canonical" href="https:\/\/example\.com\/refined\/" \/>/);
  // a link card leads to the other home's page
  assert.match(toyPage, /<a class="pf-link" href="refined\/#room">/);
  assert.match(refinedPage, /<a class="pf-link" href="\.\.\/#room">/);
  // the sitemap names both addresses; check, describe and stills see the made page and the HTML it comes from
  const emitted: Record<string, string> = {};
  plugin.generateBundle.call({ emitFile: (f: { fileName: string; source: string }) => { emitted[f.fileName] = f.source; } });
  assert.match(emitted['sitemap.xml'], /<loc>https:\/\/example\.com\/refined\/<\/loc>/);
  assert.deepEqual(plugin.api.pages.map((p: { html: string; source: string; home: string; studio: string }) => [p.html, p.source, p.home, p.studio]),
    [['index.html', 'index.html', 'toy', 'studio.html'], ['refined/index.html', 'index.html', 'refined', 'studio.html']]);
});

test('a page in another language: its words, stories and headings translated, the versions linked to each other', () => {
  const root = mkdtempSync(join(tmpdir(), 'popfold-lang-'));
  mkdirSync(join(root, 'src/i18n'), { recursive: true });
  mkdirSync(join(root, 'public/stills'), { recursive: true });
  writeFileSync(join(root, 'src/home.json'), JSON.stringify({ id: 'book', beats: [{ id: 'top' }], pieces: [], stories: { 'top/pine': { title: 'The pine', text: 'Tall.', tags: ['Tree'] } } }));
  writeFileSync(join(root, 'src/i18n/bg.json'), JSON.stringify({ Top: 'Горе', 'The pine': 'Борът', 'Tall.': 'Висок.', Tree: 'Дърво', 'On this page': 'На тази страница', Skills: 'Етикети' }));
  const index = `<!doctype html><html lang="en"><head><title>Site</title></head><body><nav><a data-pf-lang="en" lang="en">EN</a><a data-pf-lang="bg" lang="bg">БГ</a></nav><main>
    <section class="stage" id="top"><div class="card"><h2>Top</h2><p>Untranslated.</p></div></section></main></body></html>`;
  writeFileSync(join(root, 'index.html'), index);
  const plugin = popfoldFallback({ siteName: 'Site', siteUrl: 'https://example.com/', pages: [
    { html: 'index.html', homeFile: 'src/home.json', storiesHeading: 'On this page' },
    { html: 'bg/index.html', from: 'index.html', lang: 'bg', text: 'src/i18n/bg.json', homeFile: 'src/home.json', storiesHeading: 'On this page' },
  ] }) as any;
  const warned: string[] = [];
  plugin.config({ root }, { command: 'serve' });
  plugin.configResolved({ command: 'serve', root, publicDir: join(root, 'public'), logger: { warn: (w: string) => warned.push(w) } });
  const made: string = plugin.load(plugin.resolveId('bg/index.html'));
  const out = (file: string, text: string) => plugin.transformIndexHtml.handler(text, { filename: join(root, file) });
  const en = out('index.html', index), bg = out('bg/index.html', made);
  // the page's words, its language, its stories and their heading
  assert.match(bg, /<html lang="bg">/);
  assert.match(bg, /<h2>Горе<\/h2>/);
  assert.match(bg, /<h3>На тази страница<\/h3>[\s\S]*<h4>Борът<\/h4><p>Висок\.<\/p><ul aria-label="Етикети"><li>Дърво<\/li>/);
  assert.match(en, /<h4>The pine<\/h4>/);
  // the browser gets the dictionary; the original page does not
  assert.match(bg, /<script type="application\/json" id="popfold-text">\{"Top":"Горе"/);
  assert.doesNotMatch(en, /popfold-text/);
  // what is still to translate is said
  assert.match(warned.join('\n'), /bg\/index\.html: 1 of its texts are not in src\/i18n\/bg\.json: "Untranslated\."/);
  // each version names both, and the language links go to each, the page's own marked
  for (const page of [en, bg]) {
    assert.match(page, /<link rel="alternate" hreflang="en" href="https:\/\/example\.com\/" \/>/);
    assert.match(page, /<link rel="alternate" hreflang="bg" href="https:\/\/example\.com\/bg\/" \/>/);
  }
  assert.match(en, /<a href="\.\/" hreflang="en" aria-current="page" data-pf-lang="en"/);
  assert.match(en, /<a href="bg\/" hreflang="bg" data-pf-lang="bg"/);
  assert.match(bg, /<a href="\.\.\/" hreflang="en" data-pf-lang="en"/);
  assert.match(bg, /<a href="\.\/" hreflang="bg" aria-current="page" data-pf-lang="bg"/);
  // and the sitemap
  const emitted: Record<string, string> = {};
  plugin.generateBundle.call({ emitFile: (f: { fileName: string; source: string }) => { emitted[f.fileName] = f.source; } });
  assert.match(emitted['sitemap.xml'], /<loc>https:\/\/example\.com\/bg\/<\/loc>\s*<xhtml:link rel="alternate" hreflang="en" href="https:\/\/example\.com\/" \/>/);
  // popfold check is told what the page still shows in English: its text, and Popfold's own words not in the file
  const [first, second] = plugin.api.pages;
  assert.equal(first.untranslated, undefined);
  assert.equal(second.lang, 'bg');
  assert.ok(second.untranslated.includes('Untranslated.'));
  assert.ok(second.untranslated.includes("Why it's here"));
  assert.ok(!second.untranslated.includes('The pine') && !second.untranslated.includes('Skills') && !second.untranslated.includes('Top'));
});
