// Reading a story page: where its sections, head and words are. Pure (parse5 only), so it runs anywhere: the Vite
// plugin (the page without 3D, the beat commands on the dev server) and the save service on a Worker. The studio's
// bundle does without it (home-commands.ts is given it, see usePageReader).
import { parse } from 'parse5';

// The page is parsed only to learn where things are; the plugin then adds its stills, stories and head tags at
// those places in the page's own text, which is otherwise left exactly as it was written.

export type Node5 = { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node5[]; content?: Node5;
  sourceCodeLocation?: { startOffset: number; endOffset: number; startTag?: { startOffset: number; endOffset: number }; endTag?: { startOffset: number; endOffset: number } } };

/** A <section> of a story page, as the page without 3D needs it. */
export interface PageSection {
  id: string | null;
  /** it has the class "stage": one beat of the story */
  stage: boolean;
  /** where its start tag begins, and just after its end tag */
  start: number;
  end: number;
  /** just after its start tag: where its still goes */
  open: number;
  /** where a card's content ends: before the end tag of its last <article> or <div>, or of the section itself */
  cardEnd: number;
  /** its first <h1> or <h2>, as plain text ('' when it has none) */
  heading: string;
  /** its words besides that heading, as plain text, leaving out figures, scripts and nested sections */
  text: string;
}

/** What a story page holds, and where. */
export interface PageInfo {
  sections: PageSection[];
  /** before </head>: where the head tags go */
  headEnd: number;
  title: string;
  description: string;
  hasOgImage: boolean;
  hasCanonical: boolean;
}

export const attr = (n: Node5, name: string) => n.attrs?.find((a) => a.name === name)?.value;
export const kids = (n: Node5) => (n.nodeName === 'template' ? n.content?.childNodes : n.childNodes) ?? [];
export const words = (s: string) => s.replace(/\s+/g, ' ').trim();
/** the text under a node, leaving out the elements `skip` names */
export function textOf(n: Node5, skip: (e: Node5) => boolean = () => false): string {
  if (n.nodeName === '#text') return n.value ?? '';
  if (n.tagName && skip(n)) return ' ';
  // every element parts words (chips side by side are separate words; so is a line of links)
  const inner = kids(n).map((k) => textOf(k, skip)).join('');
  return n.tagName ? ` ${inner} ` : inner;
}

/** Read a story page (see PageInfo). Pure: the page's text is not changed. */
export function readPage(html: string): PageInfo {
  const doc = parse(html, { sourceCodeLocationInfo: true }) as unknown as Node5;
  const sections: PageSection[] = [];
  let head: Node5 | undefined, title = '', description = '', hasOgImage = false, hasCanonical = false;
  const endOf = (n: Node5) => n.sourceCodeLocation?.endTag?.startOffset ?? n.sourceCodeLocation?.endOffset ?? 0;
  const visit = (n: Node5) => {
    if (n.tagName === 'head') head = n;
    else if (n.tagName === 'title' && !title) title = words(textOf(n));
    else if (n.tagName === 'meta' && attr(n, 'name') === 'description') description = attr(n, 'content') ?? '';
    else if (n.tagName === 'meta' && attr(n, 'property') === 'og:image') hasOgImage = true;
    else if (n.tagName === 'link' && (attr(n, 'rel') ?? '').split(/\s+/).includes('canonical')) hasCanonical = true;
    else if (n.tagName === 'section' && n.sourceCodeLocation) {
      // its first heading, and the last card inside it (not inside a nested section)
      let heading: Node5 | undefined, card: Node5 | undefined;
      const inside = (e: Node5) => {
        for (const k of kids(e)) {
          if (k.tagName === 'section') continue;
          if (!heading && (k.tagName === 'h1' || k.tagName === 'h2')) heading = k;
          if ((k.tagName === 'div' || k.tagName === 'article') && (!card || endOf(k) > endOf(card))) card = k;
          inside(k);
        }
      };
      inside(n);
      const skip = (e: Node5) => e === heading || e.tagName === 'section' || e.tagName === 'figure' || e.tagName === 'script' || e.tagName === 'style'
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
