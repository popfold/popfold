// Links between sections and homes ("transitions"): one list, read by the 3D page (a door a click follows, a link on
// a story's card) and by the page without 3D (a card with the target's still). Pure, with no 3D code, so tools and
// tests can use it. Effects that play on the way are a later release; a link is a jump for now.
import type { PropStory } from './types';

/** A link from one section of the story to another, or to a section of another home. */
export interface Transition {
  /** the section (beat id) it starts from: its card goes in this section */
  from: string;
  /**
   * the home it starts from, when a page shows more than one: the link works in 3D only while that home is on show,
   * and has a card only on a page that shows it. Left out, it starts from every home.
   */
  fromHome?: string;
  /** the section it leads to, or a section of another home */
  to: string | { home: string; section: string };
  /** the card's words, and the link's on a story card; without one there is no card on the page without 3D */
  label?: string;
  /** a piece key ("<room>/<id>") that takes the link in 3D: its story card gets the link, or a click follows it */
  piece?: string;
  /** the effect on the way (a later release; recorded now so the list need not change) */
  effect?: string;
  strength?: number;
  /** false leaves this link out of the page without 3D even with a label */
  card?: boolean;
  /**
   * Between two neighbouring beats: points the camera passes through on the way, in the story's camera coordinates,
   * instead of the straight line (an effect's objects, such as the tunnel's tube, follow the same route)
   */
  via?: [number, number, number][];
  /** with `via`: 'path' looks ahead along the route, as if flying it; 'beats' (default) looks where the beats look */
  look?: 'path' | 'beats';
  /**
   * how its door shows that it is one (doors.ts): 'full' a marker, a glow on hover with the words, and a pulse when
   * the story arrives (the default, or startScene({ linkCue })); 'hover' only the glow and words once the pointer
   * finds it; 'none' nothing at all, for an easter egg (it still works; with card: false it is in no list either)
   */
  cue?: 'full' | 'hover' | 'none';
  /** also a button in its section's text card in 3D (it has a label; not with cue 'none'): the most obvious way */
  button?: boolean;
}

/** A link's name in the page, the same in the browser and the build: "<from home>:<from>><to>". */
export const linkKey = (t: Pick<Transition, 'from' | 'to' | 'fromHome'>) =>
  `${t.fromHome ?? ''}:${t.from}>${typeof t.to === 'string' ? t.to : `${t.to.home}/${t.to.section}`}`;

/** Where a link goes, as an address relative to the page: "#section", or "?home=<id>#section" for another home. */
export const transitionHref = (t: Pick<Transition, 'to'>) =>
  typeof t.to === 'string' ? `#${t.to}` : `?home=${encodeURIComponent(t.to.home)}#${t.to.section}`;

/** The section a link leads to, and the home when it names one. */
export const transitionTarget = (t: Pick<Transition, 'to'>) =>
  typeof t.to === 'string' ? { section: t.to, home: undefined as string | undefined } : { section: t.to.section, home: t.to.home };

/**
 * The stories of a home with the links its pieces carry: a piece that has a story and a link gets the link on its
 * card (after any links the story has). `name` gives a link with no label its words (the target beat's name).
 */
export function storiesWithLinks(stories: Record<string, PropStory>, transitions: Transition[], name: (t: Transition) => string): Record<string, PropStory> {
  const out = { ...stories };
  for (const t of transitions) {
    if (!t.piece || !out[t.piece]) continue;
    const s = out[t.piece];
    out[t.piece] = { ...s, links: [...(s.links ?? []), { label: t.label ?? name(t), href: transitionHref(t) }] };
  }
  return out;
}

/** The links a click on a piece follows: pieces that carry a link and have no story of their own, by key. */
export function doorsOf(stories: Record<string, PropStory>, transitions: Transition[]): Map<string, Transition> {
  const doors = new Map<string, Transition>();
  for (const t of transitions) if (t.piece && !stories[t.piece] && !doors.has(t.piece)) doors.set(t.piece, t);
  return doors;
}
