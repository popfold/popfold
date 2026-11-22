// Made from src/vite-plugin.ts by tools/build-pkg.mjs: edit that file, then run `pnpm build:pkg`.
// Vite plugins for Popfold sites.
//
//   homeSaver()        dev server only: Popfold Studio's "Save" and "Capture stills" write into the home file and public/
//   popfoldFallback(o)   the page without 3D: story cards and scene stills built into the HTML, structured data,
//                        llms.txt, robots.txt and sitemap.xml (see packages/popfold/README.md, "Without 3D")
//
// In a site's vite.config.ts:  import { homeSaver, popfoldFallback } from 'popfold/vite';
                                                                 
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
                                                   
                                                
                                         
// the edits a home file takes, shared with the studio: the one Popfold module this file loads at run time, made into
// lib/home-commands.js beside lib/vite-plugin.js by tools/build-pkg.mjs
import { commandList, formatHome, HOME_COMMANDS, runCommands, usePageReader,                                 } from './home-commands.js';
export * from './home-commands.js';

// ---------------------------------------------------------------------------------------------------------------
// Dev endpoints. Accepted only from this machine's own browser: requests that came through the Cloudflare tunnel
// (they carry cf-* headers) or from another origin are refused, and nothing is served in a build.
function localOnly(req                 , res                , read = false) {
  const fail = (code        , msg        ) => { res.statusCode = code; res.end(msg); return false; };
  if (req.method !== 'POST' && !(read && req.method === 'GET')) return fail(405, read ? 'GET or POST only' : 'POST only');
  if (Object.keys(req.headers).some((h) => h.startsWith('cf-'))) return fail(403, 'Saving only works on the local dev server');
  const addr = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return fail(403, 'Local requests only');
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return fail(403, 'Wrong origin');
  return true;
}

function readBody(req                 , limit        )                  {
  return new Promise((ok, no) => {
    const parts           = []; let n = 0;
    req.on('data', (c        ) => { n += c.length; if (n > limit) { no(new Error('Too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', no);
  });
}

/**
 * Every model file (.glb) under a site's public folder, by its path there ("models/props/lamp.glb"), with its size
 * and when it last changed. Folders that hold no models a page loads (stills, art) are skipped.
 */
export function modelFiles(publicDir        )                                                      {
  const out                                                      = [];
  const walk = (dir        , rel        ) => {
    let names          ;
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || (!rel && (name === 'stills' || name === 'art'))) continue;
      const full = resolve(dir, name), path = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, path);
      else if (name.endsWith('.glb')) out.push({ path, bytes: st.size, modified: Math.round(st.mtimeMs) });
    }
  };
  walk(publicDir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Where a home's stills are kept: public/stills/ when a page shows the home (its own home, a home its links lead
 * to, a home its story moves to), so the page without 3D can show them; stills/ for a home only the studio has, so
 * no build carries them. A site with no page without 3D (no popfoldFallback) keeps them all in public/stills/.
 */
export function stillsFolder(plugins                             , home        )                             {
  const api = (plugins.find((p) => p.name === 'popfold-fallback')                                                          )?.api;
  return !api || api.captures.some((c) => c.home === home) ? 'public/stills' : 'stills';
}

/**
 * The story page whose sections are this home's beats (popfoldFallback's pages: the page that shows the home, as
 * its own HTML file), or null when no page shows it. A page whose HTML other pages are made from, for other homes,
 * cannot have its sections changed for one of them: that is a mistake, named.
 */
export function storyPageOf(plugins                             , home        )                {
  const api = (plugins.find((p) => p.name === 'popfold-fallback')                                                                                            )?.api;
  const mine = (api?.pages ?? []).filter((p) => p.home === home);
  if (!mine.length) return null;
  const sources = [...new Set(mine.map((p) => p.source))];
  if (sources.length > 1) throw new Error(`the home "${home}" is shown by pages made from different HTML (${sources.join(', ')}); change their sections by hand`);
  const others = (api?.pages ?? []).filter((p) => p.source === sources[0] && p.home !== home).map((p) => p.home);
  if (others.length) throw new Error(`${sources[0]} is the HTML of pages for other homes too (${others.join(', ')}), whose beats would no longer match its sections; change them together by hand`);
  return sources[0];
}

                               
     
                                                                                                              
                                                                                                 
     
                           
 

export function homeSaver(o               = {})         {
  const homeFiles = ([]            ).concat(o.home ?? []);
  /** the home file this plugin wrote last, and when: the studio that asked shows the change itself */
  let ownWrite                                         = null;
  const quietly = (file        ) => !!ownWrite && ownWrite.files.includes(resolve(file)) && Date.now() - ownWrite.at < 3000;
  /** each home file's earlier and undone contents, while the dev server runs: undo and redo of saves */
                                                                                       
  const saves = new Map                                          ();
  return {
    name: 'popfold-home-saver',
    apply: 'serve',
    // A save from the studio rewrites the home file, which the studio page imports: left alone, Vite would reload
    // the page, losing the view and the selection. The studio builds the home again from the file it gets back
    // instead. (Another tab with the site shows the change on its next reload.) An edit made by hand still reloads.
    handleHotUpdate(ctx) {
      if (quietly(ctx.file)) return [];
      return undefined;
    },
    configureServer(server) {
      // A page's HTML is not a module: when the beat commands rewrite it, Vite reloads every open page whatever the
      // hooks above say. The studio that asked shows the new story itself, so that reload is held back for it.
      const hot = server.environments?.client?.hot ?? server.ws;
      const send = hot.send.bind(hot)                             ;
      (hot                                       ).send = (...a           ) => {
        const p = a[0]                                                ;
        if (p?.type === 'full-reload' && p.path?.endsWith('.html') && quietly(resolve(server.config.root, p.path.replace(/^\//, '')))) return;
        send(...a);
      };
      // Save → the home's own file (src/home.json): every change the studio makes is a command on it
      server.middlewares.use('/__popfold/home/', async (req, res) => {
        if (!localOnly(req, res, true)) return; // (a GET reads the home file)
        const reading = req.method === 'GET'; // the file as it is: the studio's look editor starts from it
        if (!reading && !req.headers['content-type']?.startsWith('application/json')) { res.statusCode = 415; res.end('JSON only'); return; }
        const id = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9-]{1,40}$/.test(id)) { res.statusCode = 400; res.end('Bad home id'); return; }
        res.setHeader('content-type', 'application/json');
        try {
          // which of the site's home files is this home's?
          let file = '', home                                 = null;
          for (const f of homeFiles) {
            const data = JSON.parse(await readFile(resolve(server.config.root, f), 'utf8'));
            if (data?.id === id) { file = f; home = data; break; }
          }
          if (!home) { res.end(JSON.stringify({ ok: false, why: 'this site keeps no home file for this home' })); return; }
          if (reading) { res.end(JSON.stringify({ ok: true, file, home })); return; }
          const body = JSON.parse((await readBody(req, 512_000)).toString('utf8'));
          if (!body || typeof body !== 'object') throw new Error('Expected { commands: [...] }, { undo: true } or { redo: true }');
          const path = resolve(server.config.root, file);
          const before = await readFile(path, 'utf8');
          const h = saves.get(path) ?? { past: [], future: [] };
          saves.set(path, h);
          let text        , names          ;
          /** the page, when the step changed its sections too: its text before and after */
          let page                                                        = null;
          if (body.undo || body.redo) {
            // a step back (or forward again) through this server's saves of the file (and of its page, if it changed)
            const step = (body.undo ? h.past : h.future).pop();
            if (!step) { res.end(JSON.stringify({ ok: false, why: `nothing to ${body.undo ? 'undo' : 'redo'}` })); return; }
            if (step.page) page = { path: step.page.path, before: await readFile(step.page.path, 'utf8'), text: step.page.text };
            (body.undo ? h.future : h.past).push({ text: before, names: step.names, ...(page ? { page: { path: page.path, text: page.before } } : {}) });
            text = step.text; names = step.names;
          } else {
            const commands = body.commands                 ;
            // a command that changes the story's sections edits the page that shows this home, too
            let pageText                  = null;
            if (Array.isArray(commands) && commands.some((c) => HOME_COMMANDS[c?.name]?.page)) {
              const html = storyPageOf(server.config.plugins, id);
              if (html) {
                const pagePath = resolve(server.config.root, html);
                const raw = await readFile(pagePath, 'utf8');
                pageText = { file: html, text: raw.replace(/\r\n/g, '\n') };
                page = { path: pagePath, before: raw, text: '' };
              }
            }
            runCommands(home, commands, pageText);
            text = formatHome(home);
            if (page && pageText) page.text = /\r\n/.test(page.before) ? pageText.text.replace(/\n/g, '\r\n') : pageText.text;
            if (page && page.text === page.before) page = null;
            names = [...new Set(commands.map((c) => c.name))];
            if (text !== before || page) {
              h.past.push({ text: before, names, ...(page ? { page: { path: page.path, text: page.before } } : {}) });
              if (h.past.length > 100) h.past.shift();
              h.future = [];
            }
          }
          // the studio that asked shows the change itself (quiet); an agent's edit lets open pages reload
          ownWrite = body.quiet ? { files: [path, ...(page ? [page.path] : [])], at: Date.now() } : null;
          if (text !== before) await writeFile(path, text, 'utf8');
          if (page) await writeFile(page.path, page.text, 'utf8');
          // the file as it is now: the studio builds the home again from it, without reloading the page. `names`
          // says which commands the step was made of (after an undo: the ones taken back); `page` the page that
          // changed with it
          res.end(JSON.stringify({ ok: true, file, names, undo: h.past.length, redo: h.future.length, home: JSON.parse(text), ...(page ? { page: relative(server.config.root, page.path).replace(/\\/g, '/') } : {}) }));
        } catch (err) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, why: `Could not save: ${(err         ).message}` })); }
      });
      // the model files in the public folder, for the studio's object view (the page cannot read folders)
      server.middlewares.use('/__popfold/library', (req, res) => {
        if (!localOnly(req, res, true)) return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ files: modelFiles(resolve(server.config.root, server.config.publicDir || 'public')) }));
      });
      server.middlewares.use('/__popfold/commands', (req, res) => {
        if (!localOnly(req, res, true)) return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ commands: commandList(), homes: homeFiles }));
      });
      // Capture stills → public/stills/<home id>-<stop>.webp for a home a page shows (the page without 3D uses them,
      // so every build carries them), and stills/<home id>-<stop>.webp for a home only the studio has: kept with the
      // site and compared by `popfold stills --check`, but never copied into a build
      server.middlewares.use('/__popfold/still/', async (req, res) => {
        if (!localOnly(req, res)) return;
        if (req.headers['content-type'] !== 'image/webp') { res.statusCode = 415; res.end('WebP only'); return; }
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9-]{1,40}-\d{1,2}\.webp$/.test(name)) { res.statusCode = 400; res.end('Bad still name'); return; }
        try {
          const img = await readBody(req, 8_000_000);
          if (img.subarray(0, 4).toString() !== 'RIFF' || img.subarray(8, 12).toString() !== 'WEBP') throw new Error('Not a WebP file');
          const home = name.replace(/-\d+\.webp$/, '');
          const folder = stillsFolder(server.config.plugins, home);
          const dir = resolve(server.config.root, folder);
          await mkdir(dir, { recursive: true });
          await writeFile(resolve(dir, name), img);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, file: `${folder}/${name}`, bytes: img.length }));
        } catch (err) { res.statusCode = 400; res.end(`Could not save: ${(err         ).message}`); }
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The page without 3D

/** One story page of a site: its stories, where they go, and which home's stills it shows. */
                               
                                                                                           
               
     
                                                                                                               
                                                                                                          
                                                                                                                    
                                                                                                                 
                                                                                                             
     
                
     
                                                                                                                    
                                                                                                                   
                                                                                                 
     
                
     
                                                                                                                  
                                                                                                                    
                                                                                                             
                                                                                                              
                                                                                                                  
                     
     
                
     
                                                                                                              
                                                                                                                
                                                                                                              
     
                    
     
                                                                                                               
                                                                                            
     
                                                                                                                      
                                                                                                
                                                          
                                                                                              
                                      
     
                                                                                                        
                                                                                                  
     
                             
     
                                                                                                                  
                                                                                      
     
                                        
                                                                                                                                           
                                    
                                                                      
                          
                                                                                                                    
                      
                                                                                                 
                  
                                                                           
                     
 

                                                                                
                                                         
                   
                                                                                                                                       
                   
                                                                                                
                             
     
                                                                                                             
                                                                                                             
                                                                 
     
                                                  
     
                                                                                                                 
                                                                                                                  
                                                          
     
                                
     
                                                                                                                  
                                                                                     
     
                         
 

const esc = (s        ) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ---------------------------------------------------------------------------------------------------------------
// Reading a story page. The page is parsed (parse5) only to learn where things are; the plugin then adds its stills,
// stories and head tags at those places in the page's own text, which is otherwise left exactly as it was written.

                                                                                                                                                    
                                                                                                                                                                                

/** A <section> of a story page, as the page without 3D needs it. */
                              
                    
                                                        
                 
                                                               
                
              
                                                       
               
                                                                                                                 
                  
                                                                    
                  
                                                                                                        
               
 

/** What a story page holds, and where. */
                           
                          
                                               
                  
                
                      
                      
                        
 

const attr = (n       , name        ) => n.attrs?.find((a) => a.name === name)?.value;
const kids = (n       ) => (n.nodeName === 'template' ? n.content?.childNodes : n.childNodes) ?? [];
const words = (s        ) => s.replace(/\s+/g, ' ').trim();
/** the text under a node, leaving out the elements `skip` names */
function textOf(n       , skip                        = () => false)         {
  if (n.nodeName === '#text') return n.value ?? '';
  if (n.tagName && skip(n)) return ' ';
  // every element parts words (chips side by side are separate words; so is a line of links)
  const inner = kids(n).map((k) => textOf(k, skip)).join('');
  return n.tagName ? ` ${inner} ` : inner;
}

/** Read a story page (see PageInfo). Pure: the page's text is not changed. */
export function readPage(html        )           {
  const doc = parse(html, { sourceCodeLocationInfo: true })                    ;
  const sections                = [];
  let head                   , title = '', description = '', hasOgImage = false, hasCanonical = false;
  const endOf = (n       ) => n.sourceCodeLocation?.endTag?.startOffset ?? n.sourceCodeLocation?.endOffset ?? 0;
  const visit = (n       ) => {
    if (n.tagName === 'head') head = n;
    else if (n.tagName === 'title' && !title) title = words(textOf(n));
    else if (n.tagName === 'meta' && attr(n, 'name') === 'description') description = attr(n, 'content') ?? '';
    else if (n.tagName === 'meta' && attr(n, 'property') === 'og:image') hasOgImage = true;
    else if (n.tagName === 'link' && (attr(n, 'rel') ?? '').split(/\s+/).includes('canonical')) hasCanonical = true;
    else if (n.tagName === 'section' && n.sourceCodeLocation) {
      // its first heading, and the last card inside it (not inside a nested section)
      let heading                   , card                   ;
      const inside = (e       ) => {
        for (const k of kids(e)) {
          if (k.tagName === 'section') continue;
          if (!heading && (k.tagName === 'h1' || k.tagName === 'h2')) heading = k;
          if ((k.tagName === 'div' || k.tagName === 'article') && (!card || endOf(k) > endOf(card))) card = k;
          inside(k);
        }
      };
      inside(n);
      const skip = (e       ) => e === heading || e.tagName === 'section' || e.tagName === 'figure' || e.tagName === 'script' || e.tagName === 'style'
        || (attr(e, 'class') ?? '').split(/\s+/).includes('pf-stories');
      sections.push({
        id: attr(n, 'id') ?? null,
        stage: (attr(n, 'class') ?? '').split(/\s+/).includes('stage'),
        start: n.sourceCodeLocation.startOffset,
        end: n.sourceCodeLocation.endOffset,
        open: n.sourceCodeLocation.startTag?.endOffset ?? n.sourceCodeLocation.startOffset,
        cardEnd: card ? endOf(card) : endOf(n),
        heading: heading ? words(textOf(heading)) : '',
        text: words(textOf(n, (e) => e !== n && skip(e))),
      });
    }
    for (const k of kids(n)) visit(k);
  };
  visit(doc);
  // a page parsed without a written <head> still has one: its tags then go before the body
  const headEnd = head?.sourceCodeLocation ? endOf(head) : Math.max(0, html.search(/<body\b/i));
  return { sections, headEnd, title, description, hasOgImage, hasCanonical };
}
usePageReader(readPage);

/** Put text into a page at offsets of the page as it was read: the later places first, so earlier ones hold. */
function insertAll(html        , edits                    ) {
  for (const [at, text] of [...edits].sort((a, b) => b[0] - a[0])) html = html.slice(0, at) + text + html.slice(at);
  return html;
}

// ---------------------------------------------------------------------------------------------------------------
// A page in another language: the same page with its words swapped by a dictionary (its translation file), the
// words as they are written in the page (a run of spaces and line breaks counts as one space) to the translation.

/**
 * Popfold's own words in the browser (the story card, the view toggle), which a translated page's file translates
 * too. Keep in step with the t() calls in story-card.ts and fallback.ts.
 */
export const POPFOLD_WORDS = ["Why it's here", 'Close', 'Skills', 'Simple view', '3D view', 'Switch to the simple view without 3D', 'Switch to the 3D view'];
/** the attributes whose words are read out or shown: they are translated with the text */
const WORDY_ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
/** the meta tags whose content is words */
const WORDY_META = ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'];
// (an address is not words to translate: "hello@example.com", "https://...")
const hasWords = (s        ) => /\p{L}/u.test(s) && !/^\s*(\S+@\S+\.\S+|[a-z][\w+.-]*:\/\/\S+)\s*$/i.test(s);

/**
 * Translate a page: every text, and the inner HTML of every element, that the dictionary has (as written, spaces
 * folded) is swapped for its translation, as are the words of `alt`, `title`, `aria-label`, `placeholder` and the
 * description and share tags. An element whose whole inner HTML is a key is swapped as one (for a sentence with a
 * link or <b> in it). `lang` goes on <html>. Returns the page, and the words in its body that the dictionary does
 * not have (scripts and styles left out), so a site can see what is still to translate. Pure.
 */
export function translateHtml(html        , dict                        , lang         )                                      {
  const d = new Map(Object.entries(dict).map(([k, v]) => [words(k), v]));
  const doc = parse(html, { sourceCodeLocationInfo: true })                    ;
  const edits                             = [];
  const missing           = [];
  const swap = (from        , to        , raw        ) => {
    const t = d.get(words(raw));
    if (t === undefined) return false;
    // the spaces around the words stay, so the page keeps its layout
    const lead = /^\s*/.exec(raw) [0], trail = /\s*$/.exec(raw) [0];
    edits.push([from, to, lead + t + trail]);
    return true;
  };
  let inBody = false;
  const visit = (n       ) => {
    const loc = n.sourceCodeLocation;
    if (n.tagName === 'html' && lang && loc?.startTag) {
      const tag = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
      const withLang = /\slang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag) ? tag.replace(/(\slang\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${lang}"`) : tag.replace(/^<html/i, `<html lang="${lang}"`);
      edits.push([loc.startTag.startOffset, loc.startTag.endOffset, withLang]);
    }
    if (n.tagName === 'script' || n.tagName === 'style') return;
    // words marked as being in a language of their own ("<a lang=\"bg\">БГ</a>" in a language switcher) stay
    if (n.tagName && n.tagName !== 'html' && attr(n, 'lang')) return;
    if (n.tagName === 'body') inBody = true;
    if (n.nodeName === '#text') {
      if (!loc || !hasWords(n.value ?? '')) return;
      const raw = html.slice(loc.startOffset, loc.endOffset);
      if (!swap(loc.startOffset, loc.endOffset, raw) && inBody) missing.push(words(raw));
      return;
    }
    if (n.tagName && loc?.startTag) {
      // its words in attributes: each attribute's value, found in the tag as written
      const metaName = n.tagName === 'meta' ? attr(n, 'name') ?? attr(n, 'property') : undefined;
      const names = metaName && WORDY_META.includes(metaName) ? ['content'] : WORDY_ATTRS;
      const tag = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
      for (const name of names) {
        const m = new RegExp(`(\\s${name}\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'i').exec(tag);
        if (!m) continue;
        const value = m[3] ?? m[4] ?? '';
        if (!hasWords(value)) continue;
        const from = loc.startTag.startOffset + m.index + m[1].length + 1;
        if (!swap(from, from + value.length, value) && inBody) missing.push(words(value));
      }
      // the whole inner HTML, when the dictionary has it: one entry for a sentence with markup in it
      if (loc.endTag && kids(n).some((k) => k.tagName)) {
        const raw = html.slice(loc.startTag.endOffset, loc.endTag.startOffset);
        if (swap(loc.startTag.endOffset, loc.endTag.startOffset, raw)) return;
      }
    }
    for (const k of kids(n)) visit(k);
  };
  visit(doc);
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0])) html = html.slice(0, from) + text + html.slice(to);
  return { html, missing: [...new Set(missing)] };
}

/** a story in another language: its words through the dictionary, each left as it is where there is no entry */
export function translateStory(s           , dict                        )            {
  const d = new Map(Object.entries(dict).map(([k, v]) => [words(k), v]));
  const t = (x        ) => d.get(words(x)) ?? x;
  return {
    ...s, title: t(s.title), text: t(s.text), tags: s.tags.map(t),
    ...(s.meta ? { meta: t(s.meta) } : {}), ...(s.kicker ? { kicker: t(s.kicker) } : {}),
    ...(s.links ? { links: s.links.map((l) => ({ ...l, label: t(l.label) })) } : {}),
  };
}

/**
 * A deploy removes the previous build's files, so a page that was open (or cached) while the site was deployed asks
 * for files that are gone, and its 3D never starts. This reloads such a page once to get the new build. Only the
 * site's own files count (a blocked analytics script does not), and a page reloads at most once in 30 seconds:
 * if the files are still missing, the page without 3D stays, as it would without JavaScript.
 */
export const STALE_RELOAD = `(function(){var k='pf-stale-reload';function stale(){try{var t=+sessionStorage.getItem(k)||0;if(Date.now()-t<30000)return;sessionStorage.setItem(k,String(Date.now()))}catch(e){return}location.reload()}`
  + `addEventListener('error',function(e){var t=e.target,u=t&&(t.src||t.href);if(u&&(t.tagName==='SCRIPT'||t.tagName==='LINK')&&u.indexOf(location.origin+'/')===0)stale()},true);`
  + `addEventListener('vite:preloadError',stale)})()`;

/** Shown until the 3D scene says it is running (html.has-3d), so no JS, no WebGL and crawlers all get it. */
const FALLBACK_CSS = `
.pf-still { display: none; }
/* In 3D the stories open from the dots, so the written-out copies are moved out of sight. They are not removed:
   a screen reader still reads them under their section, and each one can be reached with the Tab key, which
   brings its section's list back into view. */
.pf-stories { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pf-stories:focus-within { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: grid; gap: 12px; }
.pf-story:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
html:not(.has-3d) #scene { opacity: 0; }
#scene { transition: opacity .6s ease; }
html:not(.has-3d) .stage { align-items: flex-start; gap: 4vw; }
html:not(.has-3d) .stage:not([data-text="center"]) { justify-content: space-between; }
html:not(.has-3d) .pf-still { display: block; position: sticky; top: 12vh; flex: 1 1 0; min-width: 0; max-width: 760px; margin: 0; pointer-events: none; }
html:not(.has-3d) .stage[data-text="left"] .pf-still { order: 2; }
html:not(.has-3d) .stage[data-text="center"] .pf-still { display: none; }
.pf-still img { width: 100%; height: auto; max-height: 82vh; object-fit: contain; display: block; }
.pf-links { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pf-links:focus-within, html:not(.has-3d) .pf-links { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: flex; flex-wrap: wrap; gap: 12px; }
.pf-link { display: grid; gap: 6px; width: min(100%, 260px); padding: 8px; border-radius: 14px; border: 1px solid rgba(127, 127, 127, .35); background: rgba(127, 127, 127, .1); color: inherit; font-weight: 700; text-decoration: none; }
.pf-link img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 9px; display: block; }
.pf-link span::after { content: ' →'; }
.pf-link:hover { background: rgba(127, 127, 127, .18); }
.pf-link:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
/* in 3D, a link that is a button shows in its section's text card, as a chip (the rest stay out of sight) */
html.has-3d .pf-links:has(.pf-link-button) { position: static; width: auto; height: auto; margin: 16px 0 0; overflow: visible; clip-path: none; white-space: normal; display: flex; flex-wrap: wrap; gap: 8px; }
html.has-3d .pf-links:has(.pf-link-button) .pf-link:not(.pf-link-button), html.has-3d .pf-link-button[hidden] { display: none; }
html.has-3d .pf-link-button { width: auto; display: inline-flex; gap: 0; padding: 9px 16px; border-radius: 999px; border: none; background: var(--pf-link-bg, #1B1630); color: var(--pf-link-ink, #FFFFFF); font-weight: 700; }
html.has-3d .pf-link-button img { display: none; }
/* a button for another home's link is for the 3D page only: no card without 3D (nor its list, if that is all it has) */
html:not(.has-3d) .pf-link-3d-only, html:not(.has-3d) .pf-links:not(:has(.pf-link:not(.pf-link-3d-only))) { display: none; }
html.has-3d .pf-link-button:hover { filter: brightness(1.15); background: var(--pf-link-bg, #1B1630); }
html:not(.has-3d) .pf-stories { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: grid; gap: 12px; }
.pf-stories h3 { margin: 0; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
.pf-story { padding: 12px 14px; border-radius: 14px; background: rgba(127, 127, 127, .1); border: 1px solid rgba(127, 127, 127, .25); }
.pf-story h4 { margin: 0 0 4px; font-size: 17px; line-height: 1.25; }
.pf-story .pf-meta { margin: 0 0 6px; font-size: 13px; font-weight: 700; opacity: .7; }
.pf-story p { margin: 0; font-size: 15px; line-height: 1.5; }
.pf-story ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.pf-story li { padding: 2px 9px; border-radius: 999px; border: 1px solid rgba(127, 127, 127, .4); font-size: 12.5px; font-weight: 700; }
.pf-story a { font-weight: 700; }
@media (max-width: 820px) {
  html:not(.has-3d) .pf-still { position: static; order: 0 !important; width: 100%; flex: none; }
  html:not(.has-3d) .stage { flex-direction: column; align-items: center; justify-content: center !important; }
}
.pf-view-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 30; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(127,127,127,.5);
  background: rgba(20, 18, 34, .78); color: #fff; font: 600 13px system-ui, sans-serif; cursor: pointer; backdrop-filter: blur(8px); }
.pf-view-toggle:focus-visible, .pf-debug-toggle:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
.pf-debug-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 30; padding: 8px 10px; border-radius: 999px; border: 1px solid rgba(127,127,127,.5);
  background: rgba(20, 18, 34, .55); color: #fff; font: 600 11px system-ui, sans-serif; letter-spacing: .04em; cursor: pointer; backdrop-filter: blur(8px); opacity: .7; }
.pf-debug-toggle:hover, .pf-debug-toggle[aria-pressed="true"] { opacity: 1; background: rgba(20, 18, 34, .85); }
`;

// The same rule as src/links.ts. It is repeated here because Node loads this file as it is when it reads a site's
// vite.config.ts, so this file imports nothing of Popfold's at run time (only types).
function linkKind(href        )                              {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return 'outside';
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//') || h.includes('\\')) return null;
  return 'inside';
}

const CASES_ID = 'virtual:popfold-cases';
/** the two modelled cases that ship with Popfold, by the name a look gives them */
const CASE_FILES = {
  round: fileURLToPath(new URL('../assets/compact.glb', import.meta.url)).replace(/\\/g, '/'),
  crisp: fileURLToPath(new URL('../assets/compact-crisp.glb', import.meta.url)).replace(/\\/g, '/'),
};
/**
 * Which cases the site's home files use: every JSON file under src/ that is a home (it has beats) and a compact
 * (neither floors nor a diorama) names one in `look.shell`, 'round' when it does not say. No home file: both.
 */
export function casesUsed(root        )                              {
  const used = new Set                         ();
  let homes = 0;
  const walk = (dir        ) => {
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      const path = resolve(dir, name);
      if (statSync(path).isDirectory()) { if (name !== 'node_modules') walk(path); continue; }
      if (!name.endsWith('.json')) continue;
      let home                                                                                                                       ;
      try { home = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
      if (!home || typeof home !== 'object' || !Array.isArray(home.beats)) continue;
      homes++;
      if (home.floors || home.diorama) continue;
      // the case, and any case a part is taken from
      for (const c of [home.look?.shell ?? 'round', ...Object.values(home.look?.parts ?? {})]) if (c === 'round' || c === 'crisp') used.add(c);
    }
  };
  walk(resolve(root, 'src'));
  return homes ? [...used] : ['round', 'crisp'];
}

/** A link's name in the page: the same as linkKey() in transitions.ts (a test keeps the two in step). */
export const linkName = (t                                              ) => `${t.fromHome ?? ''}:${t.from}>${typeof t.to === 'string' ? t.to : `${t.to.home}/${t.to.section}`}`;

/** Where a link goes: the same rule as transitionHref() in transitions.ts (a test keeps the two in step). */
export const linkHref = (t                        ) => (typeof t.to === 'string' ? `#${t.to}` : `?home=${encodeURIComponent(t.to.home)}#${t.to.section}`);

function storyHtml([key, s]                     , skills = 'Skills') {
  const meta = s.meta ? `<p class="pf-meta">${esc(s.meta)}</p>` : '';
  const tags = s.tags?.length ? `<ul aria-label="${esc(skills)}">${s.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const links = (s.links ?? []).filter((l) => linkKind(l.href))
    .map((l) => ` <a href="${esc(l.href)}"${linkKind(l.href) === 'outside' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)}</a>`).join('');
  return `<article class="pf-story" tabindex="0" data-pf-story="${esc(key)}"><h4>${esc(s.title)}</h4>${meta}<p>${esc(s.text)}${links}</p>${tags}</article>`;
}

/**
 * What this build is, for the debug panel: the site's commit and whether it had uncommitted changes, when it was
 * committed and built, and the versions of the site, of Popfold and of three.js. Anything that cannot be found
 * out is 'unknown' (a site that is not a git repository, say).
 */
export function buildFacts(root        ) {
  const git = (cwd        , ...args          ) => { try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const version = (file        ) => { try { return String(JSON.parse(readFileSync(file, 'utf8')).version ?? 'unknown'); } catch { return 'unknown'; } };
  const popfold = fileURLToPath(new URL('..', import.meta.url));
  return {
    commit: git(root, 'rev-parse', '--short', 'HEAD') || 'unknown',
    committed: git(root, 'log', '-1', '--format=%cI'),
    dirty: git(root, 'status', '--porcelain', '--untracked-files=no') !== '',
    built: new Date().toISOString(),
    site: version(resolve(root, 'package.json')),
    // the release tag Popfold is on, where it is its own checkout (a site's submodule) and its tags are there;
    // a checkout without tags (CI often fetches none) gives only a commit, so then the package's version leads
    popfold: ((at) => (/^v?\d+\.\d+\.\d+/.test(at) ? at : `${version(resolve(popfold, 'package.json'))}${at ? ` (${at})` : ''}`))(existsSync(resolve(popfold, '.git')) ? git(popfold, 'describe', '--tags', '--always') : ''),
    three: [resolve(root, 'node_modules/three/package.json'), resolve(popfold, 'node_modules/three/package.json')].map(version).find((v) => v !== 'unknown') ?? 'unknown',
  };
}

/** Every .glb under a site's public/models with its size in bytes, and what a budget (in KB) says about them. */
export function modelSizes(root        , budget                                    = {}) {
  const walk = (dir        )           => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
  const top = resolve(root, 'public/models');
  const files = walk(top).filter((f) => f.endsWith('.glb')).map((f) => ({ file: relative(root, f).replace(/\\/g, '/'), bytes: statSync(f).size }));
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  const kb = (n        ) => `${Math.round(n / 1000).toLocaleString('en-US')} KB`;
  const over           = [];
  if (budget.each !== undefined) for (const f of files) if (f.bytes > budget.each * 1000) over.push(`${f.file} is ${kb(f.bytes)}; the budget for one model is ${kb(budget.each * 1000)}`);
  if (budget.total !== undefined && total > budget.total * 1000) over.push(`public/models holds ${kb(total)} in ${files.length} models; the budget is ${kb(budget.total * 1000)}`);
  return { files, total, over };
}

/** the three.js files Popfold imports (src/), for the dev server to pre-bundle */
export const THREE_FILES = ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/controls/TransformControls.js', 'three/addons/environments/RoomEnvironment.js',
  'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/libs/meshopt_decoder.module.js', 'three/addons/loaders/GLTFLoader.js'];

export function popfoldFallback(o                 )         {
  let config                ;
  const base = o.siteUrl?.replace(/\/?$/, '/');
  const slash = (p        ) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
  let root = process.cwd();
  const given                 = (o.pages ?? [{ html: 'index.html', homeFile: o.homeFile, pieces: o.pieces, rooms: o.rooms, stories: o.stories, transitions: o.transitions, sectionHomes: o.sectionHomes, sections: o.sections, storiesHeading: o.storiesHeading, stillsHome: o.stillsHome, llmsExtra: o.llmsExtra }])
    .map((p) => ({ ...p, html: slash(p.html), ...(p.from ? { from: slash(p.from) } : {}) }));
  /** a page's translation file, as it is on disk now */
  const dictOf = (p              )                                     => {
    if (!p.text) return undefined;
    try { return JSON.parse(readFileSync(resolve(root, p.text), 'utf8')); } catch (err) { throw new Error(`popfoldFallback: could not read the translation file ${p.text}: ${(err         ).message}`); }
  };
  /** a page's language: given, or the lang on its HTML (or on the HTML it is built from) */
  const langOf = (p              ) => {
    if (p.lang) return p.lang;
    try { return /<html[^>]*\slang\s*=\s*["']?([\w-]+)/i.exec(readFileSync(resolve(root, p.from ?? p.html), 'utf8'))?.[1]; } catch { return undefined; }
  };
  /**
   * The pages as they stand now. A page with a home file takes its pieces, and the name of its stills, from the
   * file as it is on disk at this moment, so a save from the studio shows without restarting anything.
   */
  const pagesNow = ()                                                                                                  => given.map((p) => {
    let file                                                                                                                                                             = {};
    if (p.homeFile) { try { file = JSON.parse(readFileSync(resolve(root, p.homeFile), 'utf8')); } catch (err) { throw new Error(`popfoldFallback: could not read the home file ${p.homeFile}: ${(err         ).message}`); } }
    const pieces = p.pieces ?? file.pieces ?? [];
    const dict = dictOf(p);
    const tr = (x        ) => (dict ? translateStory({ title: x, text: '', tags: [] }, dict).title : x);
    const stories                            = {
      ...Object.fromEntries(pieces.filter((x) => x.story).map((x) => [`${(p.rooms                                      )?.[x.room] ?? x.room}${x.wall ? '-wall' : ''}/${x.id}`, x.story             ])),
      ...file.stories, // a diorama's model parts: kept by key
      ...p.stories,
    };
    return {
      ...p, pieces, stillsHome: p.stillsHome ?? file.id,
      transitions: (p.transitions ?? file.transitions ?? []).map((t) => (dict && t.label ? { ...t, label: tr(t.label) } : t)),
      storiesHeading: tr(p.storiesHeading ?? 'Highlights'),
      dict,
      // the home each section shows: given, or from the file's beats (a beat without one shows the one before's)
      sectionHomes: p.sectionHomes ?? (() => {
        let last                    ;
        return Object.fromEntries((file.beats ?? []).flatMap((b) => ((last = b.home ?? last) ? [[b.id, last]] : [])));
      })(),
      // a listed piece's story has the piece's key, "<room>/<id>" (the same rule as pieceKey() in pieces.ts, which
      // this file cannot import: it must load in Node as it is); a translated page's, in its language
      stories: dict ? Object.fromEntries(Object.entries(stories).map(([k, v]) => [k, translateStory(v, dict)])) : stories,
      sourceStories: stories,
    };
  });
  /** the page's folder within the site, '' or 'tour/' */
  const dirOf = (p              ) => p.html.slice(0, p.html.lastIndexOf('/') + 1);
  /** from the page's folder back to the site's root: '' or '../' */
  const up = (p              ) => '../'.repeat(dirOf(p).split('/').length - 1);
  /** the studio page that captures a page's stills: given, or studio.html beside the page its copy comes from */
  const studioOf = (p              ) => slash(p.studio ?? `${dirOf({ html: p.from ?? p.html })}studio.html`);
  /** a page built from another's HTML: that page's text, its relative paths moved to this page's folder */
  const variantHtml = (p              ) => {
    let text = readFileSync(resolve(root, p.from ), 'utf8');
    const dict = dictOf(p);
    if (dict || p.lang) {
      const done = translateHtml(text, dict ?? {}, p.lang);
      text = done.html;
      if (dict && done.missing.length) {
        const more = done.missing.length > 8 ? ` and ${done.missing.length - 8} more` : '';
        const show = done.missing.slice(0, 8).map((m) => JSON.stringify(m.length > 60 ? `${m.slice(0, 57)}...` : m)).join(', ');
        config?.logger.warn(`popfold-fallback: ${p.html}: ${done.missing.length} of its texts are not in ${p.text}: ${show}${more}`);
      }
    }
    const depth = dirOf(p).split('/').length - dirOf({ html: p.from  }).split('/').length;
    if (depth <= 0) return text;
    return text.replace(/\b(src|href|content)="(\.\/|(?![a-z][\w+.-]*:|\/|#|\?|data:))([^"]*)"/gi, (all, attr        , dot        , rest        ) =>
      attr.toLowerCase() === 'content' ? all : `${attr}="${'../'.repeat(depth)}${dot === './' ? '' : dot}${rest}"`);
  };
  /** where a link goes from this page: to another page that shows the target's home, when the site has one */
  const hrefFrom = (page              , t                        , pages                ) => {
    const to = t.to;
    if (typeof to === 'string') return `#${to}`;
    if (to.home === page.stillsHome) return `#${to.section}`;
    // the page in this page's language, when there is one
    const others = pages.filter((q) => q !== page && q.stillsHome === to.home);
    const there = (others.length > 1 ? others.find((q) => langOf(q) === langOf(page)) : undefined) ?? others[0];
    if (!there) return linkHref(t);
    return `${`${up(page)}${dirOf(there)}` || './'}#${to.section}`;
  };
  /**
   * What a translated page shows in its original words, because its translation file does not have them: the page's
   * text, its stories and their heading, its link cards, and Popfold's own words (`popfold check` lists them).
   */
  const untranslatedOf = (p                                     ) => {
    const dict = p.dict ?? {};
    const has = new Set(Object.keys(dict).map(words));
    const out = translateHtml(readFileSync(resolve(root, p.from ?? p.html), 'utf8'), dict).missing;
    const want = (s                    ) => { if (s && hasWords(s) && !has.has(words(s))) out.push(words(s)); };
    for (const s of Object.values(p.sourceStories ?? {})) { want(s.title); want(s.text); want(s.meta); want(s.kicker); s.tags.forEach(want); s.links?.forEach((l) => want(l.label)); }
    if (Object.keys(p.sourceStories ?? {}).length) want(given.find((g) => g.html === p.html)?.storiesHeading ?? 'Highlights');
    for (const t of p.transitions ?? []) if (t.label && !has.has(words(t.label)) && !Object.values(dict).includes(t.label)) want(t.label);
    for (const w of POPFOLD_WORDS) want(w);
    return [...new Set(out)];
  };
  /** the pages with the same copy as this one (built from the same HTML, or its source) that say their language */
  const languagesOf = (page              ) => {
    const source = page.from ?? page.html;
    // (a site in one language has none: nothing to read)
    if (!given.some((q) => q.lang && (q.from ?? q.html) === source)) return [];
    return given.filter((q) => (q.from ?? q.html) === source && (q.from === undefined || q.lang)).flatMap((q) => {
      const lang = langOf(q);
      return lang ? [{ page: q, lang }] : [];
    });
  };
  /** each page's part of llms.txt, filled as the pages are built */
  const llms = new Map                ();
  const llmsText = () => given.map((p) => llms.get(p.html)).filter(Boolean).join('\n---\n\n');

  return {
    name: 'popfold-fallback',
    /** read by the `popfold` command line (bin/popfold.mjs): which homes' stills to capture, and from which studio pages */
    api: {
      get captures() {
        // each page's own home, and every other home its links lead to (their cards show that home's stills)
        const out                                     = [];
        for (const p of pagesNow()) {
          const studio = studioOf(p);
          for (const home of [p.stillsHome, ...(p.transitions ?? []).map((t) => (typeof t.to === 'string' ? undefined : t.to.home)), ...Object.values(p.sectionHomes ?? {})]) {
            if (home && !out.some((c) => c.home === home && c.studio === studio)) out.push({ home, studio });
          }
        }
        return out;
      },
      /** the site's limits on model sizes, if it set any (popfold check reports against them) */
      budget: o.modelBudget,
      /** each story page, for `popfold check` and `popfold describe` */
      get pages() {
        return pagesNow().map((p) => ({
          html: p.html, source: p.from ?? p.html, home: p.stillsHome ?? null, studio: studioOf(p), stories: Object.keys(p.stories ?? {}), sections: p.sections ?? {}, transitions: p.transitions ?? [],
          ...(p.dict ? { lang: p.lang, text: p.text, untranslated: untranslatedOf(p) } : {}),
        }));
      },
    },
    // the debug panel reads these (see debug.ts)
    config(c, env) {
      root = resolve(c.root ?? process.cwd());
      // a page made from another's HTML is an entry of the build too (its file exists only as the build makes it)
      const made = given.filter((p) => p.from);
      if (env?.command === 'build' && made.length) {
        c.build ??= {};
        c.build.rollupOptions ??= {};
        const input = c.build.rollupOptions.input ?? resolve(root, 'index.html');
        const named                         = typeof input === 'string' ? { main: input } : Array.isArray(input) ? Object.fromEntries(input.map((f, i) => [`page${i}`, f])) : { ...input };
        for (const p of made) named[`pf-${dirOf(p).replace(/\/$/, '').replace(/[^\w-]/g, '-') || 'page'}`] = resolve(root, p.html);
        c.build.rollupOptions.input = named;
      }
      return {
        define: { __POPFOLD_BUILD__: JSON.stringify(buildFacts(root)) },
        // Popfold is TypeScript that this server compiles, with a module only this plugin makes (its cases), so it is
        // not pre-bundled; the three.js files it uses are, so the first visit does not stop to find them
        optimizeDeps: { exclude: ['popfold'], include: THREE_FILES },
        // one three.js, also while the site is linked to a Popfold checkout that has its own (engine work)
        resolve: { dedupe: ['three'] },
      };
    },
    configResolved(c) { config = c; root = c.root ?? root; },
    // the case models, as a module: only those this site uses go into a build (each is about 220 KB)
    resolveId(id) {
      if (id === CASES_ID) return `\0${CASES_ID}`;
      // a made page's HTML, which is not on disk
      const made = given.find((p) => p.from && slash(relative(root, resolve(root, id.split('?')[0]))) === p.html && !existsSync(resolve(root, p.html)));
      return made ? resolve(root, made.html) : undefined;
    },
    load(id) {
      const made = given.find((p) => p.from && resolve(root, p.html) === id.split('?')[0] && !existsSync(id.split('?')[0]));
      if (made) return variantHtml(made);
      if (id !== `\0${CASES_ID}`) return undefined;
      const want = config?.command === 'build' ? o.cases ?? casesUsed(root) : (Object.keys(CASE_FILES)                               );
      return `${want.map((n) => `import ${n} from ${JSON.stringify(`${CASE_FILES[n]}?url`)};`).join('\n')}\nexport default { ${want.join(', ')} };\n`;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // only the story pages (not studio.html, not any other page of the site)
        const file = slash(relative(config.root, ctx.filename));
        const pages = pagesNow();
        const page = pages.find((p) => p.html === file);
        if (!page) return html;
        const pageUrl = base ? base + dirOf(page) : undefined;

        // where the page's sections, head, title and description are (the page itself is only added to)
        const info = readPage(html);
        const edits                     = [];

        // what goes inside a section's card, by place: its stories, then its link cards
        const inside = new Map                ();
        const into = (at        , html        ) => inside.set(at, (inside.get(at) ?? '') + html);

        // 1. stories under their sections, inside the section's card
        const bySection = new Map                               ();
        for (const [key, story] of Object.entries(page.stories ?? {})) {
          const zone = key.split('/')[0].replace(/-wall$/, '');
          const id = page.sections?.[zone] ?? zone;
          if (!bySection.has(id)) bySection.set(id, []);
          bySection.get(id) .push([key, story]);
        }
        for (const [id, list] of bySection) {
          const section = info.sections.find((x) => x.id === id);
          if (!section) {
            // a story nobody can read is a mistake: a build stops on it, the dev server only says so
            const what = `popfold-fallback: ${page.html} has no <section id="${id}"> for its stories (${list.map(([k]) => k).join(', ')}). Add the section, or map the room to one with "sections".`;
            if (config.command === 'build') throw new Error(what);
            config.logger.warn(what);
            continue;
          }
          into(section.cardEnd, `\n        <div class="pf-stories"><h3>${esc(page.storiesHeading ?? 'Highlights')}</h3>${list.map((x) => storyHtml(x, page.dict?.Skills)).join('')}</div>\n      `);
        }

        // 2. a still beside every stage section, in order (if it has been captured). Stills live at the site's root.
        const still = (n        , home = page.stillsHome) => `stills/${home}-${n}.webp`;
        const captured = (n        , home = page.stillsHome) => !!home && existsSync(resolve(config.root, config.publicDir || 'public', still(n, home)));

        // links to other sections and homes: a card in the section each starts from, with the target's still
        const stages = info.sections.filter((x) => x.stage).map((x) => x.id);
        const linksFrom = new Map                      ();
        for (const t of page.transitions ?? []) {
          if (!t.label || t.card === false) continue; // a link with no label is a door in 3D only
          // a link from a home this page does not show has no card here; its button is written all the same, for the
          // 3D page, which shows it while that home is on show
          if (t.fromHome && t.fromHome !== page.stillsHome && !(t.button && t.cue !== 'none')) continue;
          if (!info.sections.some((x) => x.id === t.from)) {
            const what = `popfold-fallback: ${page.html} has no <section id="${t.from}"> for the link "${t.label}".`;
            if (config.command === 'build') throw new Error(what);
            config.logger.warn(what);
            continue;
          }
          linksFrom.set(t.from, [...(linksFrom.get(t.from) ?? []), t]);
        }
        for (const [from, list] of linksFrom) {
          const cards = list.map((t) => {
            const section = typeof t.to === 'string' ? t.to : t.to.section, home = typeof t.to === 'string' ? page.stillsHome : t.to.home;
            const n = stages.indexOf(section);
            const img = n >= 0 && captured(n, home) ? `<img src="./${up(page)}${still(n, home)}" alt="" width="1200" height="900" loading="lazy" decoding="async" />` : '';
            // a link that is also a button in 3D carries its name, so the 3D page can play its effect on a click
            const away = !!t.fromHome && t.fromHome !== page.stillsHome; // a button only: no card without 3D
            const button = t.button && t.cue !== 'none' ? ` pf-link-button${away ? ' pf-link-3d-only' : ''}" data-pf-link="${esc(linkName(t))}${t.fromHome ? `" data-pf-from-home="${esc(t.fromHome)}` : ''}` : '';
            return `<a class="pf-link${button}" href="${esc(hrefFrom(page, t, pages))}">${img}<span>${esc(t.label )}</span></a>`;
          }).join('');
          into(info.sections.find((x) => x.id === from) .cardEnd, `\n        <nav class="pf-links" aria-label="Go to">${cards}</nav>\n      `);
        }
        for (const [at, html] of inside) edits.push([at, html]);
        if (page.stillsHome) {
          info.sections.filter((x) => x.stage).forEach((x, n) => {
            const home = (x.id && page.sectionHomes?.[x.id]) || page.stillsHome; // the home this section shows
            if (!captured(n, home)) return;
            const alt = `${o.siteName}: ${x.heading || `scene ${n + 1}`}`;
            edits.push([x.open, `\n      <figure class="pf-still"><img src="./${up(page)}${still(n, home)}" alt="${esc(alt)}" width="1200" height="900" ${n === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" /></figure>`]);
          });
        }

        // 3. head: fallback CSS, structured data, share image
        const head           = [`<style id="popfold-fallback">${FALLBACK_CSS}</style>`, `<script id="popfold-stale">${STALE_RELOAD}</script>`];
        // the home this page shows: the 3D page starts in it (startScene reads this, after ?home=)
        if (page.stillsHome) head.push(`<meta name="popfold-home" content="${esc(page.stillsHome)}" />`);
        // a page in a folder of a site built with relative paths: the way back to the site's root, where the models
        // and art are (startScene reads this when the site passes no base)
        if (up(page) && !String(config.base ?? './').startsWith('/')) head.push(`<meta name="popfold-base" content="${up(page)}" />`);
        // where this page's studio is, from the page (the debug panel links to it): not always beside the page
        if (studioOf(page) !== `${dirOf(page)}studio.html`) head.push(`<meta name="popfold-studio" content="${esc(up(page) + studioOf(page))}" />`);
        if (page.html === given[0].html) for (const j of [o.jsonLd ?? []].flat()) head.push(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`);
        if (base && captured(0) && !info.hasOgImage) head.push(`<meta property="og:image" content="${esc(base + still(0))}" />`);
        if (pageUrl && !info.hasCanonical) head.push(`<link rel="canonical" href="${esc(pageUrl)}" />`);
        // a translated page's dictionary, for the words the browser writes (story cards, Popfold's own, the site's t())
        if (page.dict) head.push(`<script type="application/json" id="popfold-text">${JSON.stringify(page.dict).replace(/</g, '\\u003c')}</script>`);
        // the same copy in other languages: each page names all of them, itself too (hreflang needs full addresses)
        const versions = languagesOf(page);
        if (base && versions.length > 1) for (const v of versions) head.push(`<link rel="alternate" hreflang="${esc(v.lang)}" href="${esc(base + dirOf(v.page))}" />`);
        edits.push([info.headEnd, `  ${head.join('\n  ')}\n`]);
        html = insertAll(html, edits);

        // a language switcher: a link that names a language (data-pf-lang) goes to this copy in that language, and
        // the one in this page's own is marked as the current page
        const here = langOf(page);
        html = html.replace(/<a\b[^>]*\sdata-pf-lang\s*=\s*"([\w-]+)"[^>]*>/gi, (tag, lang        ) => {
          const v = languagesOf(page).find((x) => x.lang === lang);
          if (!v) return tag;
          const href = v.page.html === page.html ? './' : `${up(page)}${dirOf(v.page)}` || './';
          let out = tag.replace(/\shref\s*=\s*("[^"]*"|'[^']*')/i, '').replace(/\saria-current\s*=\s*("[^"]*"|'[^']*')/i, '');
          out = out.replace(/^<a\b/i, `<a href="${esc(href)}" hreflang="${esc(lang)}"${lang === here ? ' aria-current="page"' : ''}`);
          return out;
        });

        // 4. llms.txt: the page's own words, section by section, plus the stories
        const title = info.title || o.siteName;
        const out = [`# ${title}`, '', ...(given.length > 1 && pageUrl ? [`Page: ${pageUrl}`, ''] : []), `> ${words(info.description)}`, ''];
        for (const x of info.sections) {
          if (!x.id) continue;
          out.push(`## ${x.heading || x.id}`, '', x.text, '');
          for (const [, st] of bySection.get(x.id) ?? []) {
            out.push(`- **${st.title}**${st.meta ? ` (${st.meta})` : ''}: ${st.text}${st.tags?.length ? ` [${st.tags.join(', ')}]` : ''}`);
          }
          if (bySection.get(x.id)?.length) out.push('');
          const go = linksFrom.get(x.id) ?? [];
          for (const t of go) out.push(`- Link: [${t.label}](${hrefFrom(page, t, pages)})`);
          if (go.length) out.push('');
        }
        if (page.llmsExtra) out.push(page.llmsExtra.trim(), '');
        llms.set(page.html, out.join('\n'));
        return html;
      },
    },
    configureServer(server) {
      // a page made from another's HTML: built from it on each request, as Vite would serve a file
      server.middlewares.use(async (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split(/[?#]/)[0]).replace(server.config.base.replace(/^\.?\/?/, '/'), '/');
        const made = given.find((p) => p.from && !existsSync(resolve(root, p.html)) && (`/${p.html}` === path || `/${dirOf(p)}` === path && p.html.endsWith('index.html')));
        if (!made || req.method !== 'GET') return next();
        try {
          const html = await server.transformIndexHtml(`/${made.html}`, variantHtml(made), req.originalUrl);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (err) { next(err); }
      });
      server.middlewares.use('/llms.txt', (_req, res) => { res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(llmsText() || '# (open the page once to build this)\n'); });
    },
    buildStart() {
      // a site that set a budget for its models does not ship over it
      if (config?.command !== 'build' || !o.modelBudget) return;
      const { over } = modelSizes(root, o.modelBudget);
      if (over.length) throw new Error(`popfoldFallback: the models are over the site's budget:\n  ${over.join('\n  ')}\n  \`popfold optimize\` makes models smaller without changing how they look.`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsText() });
      const robots = ['User-agent: *', 'Allow: /', ...(base ? [`Sitemap: ${base}sitemap.xml`] : [])].join('\n') + '\n';
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (base) {
        // a page with versions in other languages names them all, as its head does
        const urls = given.map((p) => {
          const versions = languagesOf(p);
          const alts = versions.length > 1 ? `${versions.map((v) => `\n    <xhtml:link rel="alternate" hreflang="${esc(v.lang)}" href="${esc(base + dirOf(v.page))}" />`).join('')}\n  ` : '';
          return `  <url><loc>${esc(base + dirOf(p))}</loc>${alts}</url>`;
        }).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n` });
      }
    },
  };
}
