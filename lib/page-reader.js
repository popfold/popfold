// Made from src/page-reader.ts by tools/build-pkg.mjs: edit that file, then run `pnpm build:pkg`.
// Reading a story page: where its sections, head and words are. Pure (parse5 only), so it runs anywhere: the Vite
// plugin (the page without 3D, the beat commands on the dev server) and the save service on a Worker. The studio's
// bundle does without it (home-commands.ts is given it, see usePageReader).
import { parse } from 'parse5';

// The page is parsed only to learn where things are; the plugin then adds its stills, stories and head tags at
// those places in the page's own text, which is otherwise left exactly as it was written.

                                                                                                                                                           
                                                                                                                                                                                

/** A <section> of a story page, as the page without 3D needs it. */
                              
                    
                                                        
                 
                                                               
                
              
                                                       
               
                                                                                                                 
                  
                                                                    
                  
                                                                                                        
               
 

/** What a story page holds, and where. */
                           
                          
                                               
                  
                
                      
                      
                        
 

export const attr = (n       , name        ) => n.attrs?.find((a) => a.name === name)?.value;
export const kids = (n       ) => (n.nodeName === 'template' ? n.content?.childNodes : n.childNodes) ?? [];
export const words = (s        ) => s.replace(/\s+/g, ' ').trim();
/** the text under a node, leaving out the elements `skip` names */
export function textOf(n       , skip                        = () => false)         {
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
