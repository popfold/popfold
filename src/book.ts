// The "book" shell: a pop-up storybook lying open. Each page of the book (a spread: two facing pages) is a room
// with its own pop-up scene, and the story turns the leaves one by one. A page's field, z:<page id>, says how far
// its right-hand leaf has been turned: 0 lying open on the right, 1 turned over onto the left. Turning a leaf
// closes its page (its pieces fold flat) and opens the next one (the next page's pieces stand up on the leaf's
// back). The last page has no leaf of its own to turn.
//
// Every piece is posed from the angles of the two pages it sits between (popup.ts, popup-math.ts), so nothing
// appears, fades or grows: it folds, and the scroll can run it backwards. Pieces are listed in the home file like
// any other home's: `room` is the page's id, `at` is [across, along]: how far from the spine (negative on the
// left page, 0 in the gutter) and where along it (+ towards the reader). The built-in kinds are the pop-ups
// (card, stand, vfold, box, fan); a site's own kind (any object) is mounted as a stand.
import * as THREE from 'three';
import { collectEditables, piece, type Listed } from './layout';
import { box, card, fan, paper, stand, standFor, vfold, type Popup, type PopupOpts } from './popup';
import { coverAngle, halfOpen, leafAngles, openness, spreadsOf, type SpreadAngles } from './popup-math';
import type { House } from './shell';
import { aida, stitchGrid, stitcher, type StitchGrid } from './stitch';
import type { BookContext, HomeRecipe, PieceSpec, PropStory } from './types';

export interface BookPage {
  /** the page's id: its pieces' room, its story field (z:<id>) and, usually, its section's id */
  id: string;
  /** a short name (the studio's labels) */
  label?: string;
  /** the colour printed on its two facing pages (default: the book's paper) */
  color?: string;
  /** a picture printed across the spread (its address): its left half on the left page, its right half on the right */
  art?: string;
  /** sew the picture as cross-stitch, stitched in as the page opens and unpicked as it closes: true, or how many
   *  stitches across the spread (default 160) */
  stitch?: boolean | number;
}

export interface BookSpec {
  /** the book's pages, first to last; each is a spread with its own scene */
  pages: BookPage[];
  /** a page's size: from the spine to its outer edge, and along the spine (default 3 and 4) */
  width?: number;
  height?: number;
  /** the covers' colour, and the pages' paper */
  cover?: string;
  /**
   * The book starts shut: its front cover lies on the pages and opens with the field z:cover (a beat's zone
   * "cover"), as a page turns with its own. No page turns further than the cover has opened.
   */
  closed?: boolean;
  paper?: string;
  /** stories by piece key "<page>/<id>" (the recipe's stories also work) */
  stories?: Record<string, PropStory>;
}

/** The pop-up kinds a book's listed pieces can be, built in. A site's own kinds are mounted as stands. */
export const POPUP_KINDS = ['card', 'stand', 'vfold', 'box', 'fan'] as const;

/** the leaves fan apart by this much at the spine (radians), so a shut page has room for its folded pieces */
const FAN = 0.008;
/** a leaf's thickness */
const LEAF = 0.012;
/** the boards' thickness */
const BOARD = 0.06;

/** A built-in pop-up from a listed piece's entry. */
export function popupOf(kind: string, x: number, opts: PopupOpts): Popup | null {
  switch (kind) {
    case 'card': return card(x, opts);
    case 'stand': return stand(x, opts);
    case 'vfold': return vfold(opts);
    case 'box': return box(x, opts);
    case 'fan': return fan(opts);
    default: return null;
  }
}

/** One side of a page: its paper, the page's colour (or its share of the spread's picture) printed on it with a
 *  margin, and its number in the outer corner. `paint` draws it again once the picture has loaded, and `sew` stitches
 *  the picture in as far as a progress says. */
function pageSide(paperColor: string, print: string | undefined, number: number, outerLeft: boolean, aspect: number) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = Math.round(768 * aspect);
  // kept in memory, not on the GPU: a page being sewn is drawn into and uploaded every frame, and handing a GPU canvas
  // to WebGL waits for all its queued drawing
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const W = c.width, H = c.height;
  const m = W * 0.06;
  // the printed area: it runs into the gutter (the spine side has no margin), as an illustration across a spread does
  const area = { x: outerLeft ? m : 0, y: m, w: W - m, h: H - m * 2.6 };
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // a left page is a leaf's back, which shows its picture turned half round
  if (outerLeft) { t.center.set(0.5, 0.5); t.rotation = Math.PI; }
  const shape = () => {
    g.beginPath();
    if (outerLeft) g.roundRect(area.x, area.y, area.w, area.h, [m * 0.6, 0, 0, m * 0.6]);
    else g.roundRect(area.x, area.y, area.w, area.h, [0, m * 0.6, m * 0.6, 0]);
  };
  const paperAndNumber = (fill: (() => void) | null) => {
    g.fillStyle = paperColor; g.fillRect(0, 0, W, H);
    if (fill) { g.save(); shape(); g.clip(); fill(); g.restore(); }
    // a fixed speckle of paper fibre (the same every load, so stills compare)
    let seed = 11 + number;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2900; i++) { g.fillStyle = `rgba(80,60,30,${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1.5); }
    g.fillStyle = 'rgba(60,45,30,.7)';
    g.font = `600 ${Math.round(W * 0.045)}px "Bricolage Grotesque Variable", Georgia, serif`;
    g.textAlign = outerLeft ? 'left' : 'right';
    g.textBaseline = 'middle';
    g.fillText(String(number), outerLeft ? W * 0.07 : W * 0.93, H - W * 0.075);
  };
  // the shade of the gutter, over everything printed or sewn
  const gutter = () => {
    const gut = outerLeft ? g.createLinearGradient(W, 0, W - W * 0.12, 0) : g.createLinearGradient(0, 0, W * 0.12, 0);
    gut.addColorStop(0, 'rgba(60,40,20,.22)'); gut.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gut; g.fillRect(0, 0, W, H);
  };
  paperAndNumber(print ? () => { g.fillStyle = print; g.fillRect(0, 0, W, H); } : null);
  gutter();
  // sewing: stitches go straight onto the page; `under` keeps the page without them, for unpicking
  let sewing: ReturnType<typeof stitcher> | null = null;
  return {
    texture: t,
    area,
    /** prints this side's half of a picture (the spread's picture covers both sides' printed areas) */
    print(img: CanvasImageSource, sw: number, sh: number) {
      paperAndNumber(() => {
        const scale = Math.max((area.w * 2) / sw, area.h / sh);
        const dw = sw * scale, dh = sh * scale;
        const left = (area.w * 2 - dw) / 2, top = area.y + (area.h - dh) / 2;
        g.drawImage(img, outerLeft ? area.x + left : area.x - area.w + left, top, dw, dh);
      });
      gutter();
      t.needsUpdate = true;
    },
    /** lays aida cloth in the printed area and gets ready to sew this side's share of a stitch grid. The gutter's
     *  shade is printed under the stitches, so each change to them is all that is drawn */
    cloth(half: StitchGrid) {
      paperAndNumber(() => aida(g, area.x, area.y, area.w, area.h, half.cols, half.rows));
      gutter();
      const under = document.createElement('canvas'); under.width = W; under.height = H;
      under.getContext('2d', { willReadFrequently: true })!.drawImage(c, 0, 0);
      sewing = stitcher(half, g, under, area.x, area.y, area.w, area.h);
      t.needsUpdate = true;
    },
    /** sews (or unpicks) to a progress, 0 to 1 */
    sew(progress: number) {
      if (sewing?.to(progress)) t.needsUpdate = true;
    },
  };
}

/** The two halves of a spread's stitch grid: the left page's columns and the right page's. Each keeps the spread's
 *  sewing order, so the needle works across the gutter as one piece of embroidery. */
function halves(grid: StitchGrid): [StitchGrid, StitchGrid] {
  const half = Math.floor(grid.cols / 2);
  const part = (from: number, cols: number): StitchGrid => {
    const cells = new Int16Array(cols * grid.rows);
    const map = new Int32Array(grid.cols * grid.rows).fill(-1);
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < cols; x++) {
      cells[y * cols + x] = grid.cells[y * grid.cols + from + x];
      map[y * grid.cols + from + x] = y * cols + x;
    }
    // a leg is kept where it falls in this half; its place in the sewing order is the spread's (so both halves move together)
    const legs: number[] = [];
    for (const v of grid.legs) { const i = map[v >> 1]; legs.push(i < 0 ? -1 : i * 2 + (v & 1)); }
    return { cols, rows: grid.rows, threads: grid.threads, cells, legs: Int32Array.from(legs) };
  };
  return [part(0, half), part(half, grid.cols - half)];
}

/** `siteUrl` makes a page's picture address absolute against the site's base, so a page in a sub-folder (a
 *  translation at bg/) finds the same files */
export function buildBook(recipe: HomeRecipe & { book: BookSpec }, siteUrl: (file: string) => string | null = (f) => f): House {
  const spec = recipe.book;
  const pages = spec.pages;
  if (pages.length < 1) throw new Error(`home "${recipe.id}": a book needs at least one page`);
  const W = spec.width ?? 3, H = spec.height ?? 4;
  const paperColor = spec.paper ?? '#FBF4E4';
  const coverColor = spec.cover ?? '#B5523B';
  const root = new THREE.Group();
  const book = new THREE.Group();
  book.position.y = BOARD + LEAF; // the open pages' plane; the boards lie under it, on the ground
  root.add(book);

  // ---------- covers and the spine ----------
  const coverMat = new THREE.MeshStandardMaterial({ color: coverColor, roughness: 0.7 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#EFE6D2', roughness: 0.95 });
  const mW = W + 0.14, mH = H + 0.24;
  // the front cover (the left board and the front endpaper on it) turns about the spine as one; lying open it is
  // where a book that never shuts has it
  const frontCover = new THREE.Group();
  book.add(frontCover);
  for (const side of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(mW, BOARD, mH), coverMat);
    board.position.set(side * (mW / 2 + 0.02), -LEAF - BOARD / 2, 0);
    board.castShadow = true; board.receiveShadow = true;
    (side < 0 ? frontCover : book).add(board);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, mH, 20, 1, false, -Math.PI / 2, Math.PI), coverMat); // its lower half, under the boards
  spine.rotation.x = Math.PI / 2;
  spine.position.y = -LEAF - BOARD * 0.6;
  book.add(spine);

  // ---------- the pages: the front endpaper, the leaves, the back endpaper ----------
  const sides: ReturnType<typeof pageSide>[] = [];
  const sideMat = (n: number, outerLeft: boolean) => {
    const side = pageSide(paperColor, pages[Math.floor(n / 2)]?.color, n + 1, outerLeft, H / W);
    sides[n] = side;
    return new THREE.MeshStandardMaterial({ map: side.texture, roughness: 0.95 });
  };
  /** a leaf (or an endpaper) at the spine, turning about it; its front is page side `front`, its back side `back` (or none) */
  const leafOf = (front: THREE.Material | null, back: THREE.Material | null) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, LEAF, H), [edgeMat, edgeMat, front ?? edgeMat, back ?? edgeMat, edgeMat, edgeMat]);
    m.position.set(W / 2, 0, 0); // both faces within a piece's lift of the leaf's plane, so pieces stand on either
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    book.add(g);
    return g;
  };
  // page sides are numbered from 0: spread k is side 2k (its left) and 2k + 1 (its right)
  const frontEnd = leafOf(null, sideMat(0, true));
  frontEnd.rotation.z = Math.PI;
  frontCover.add(frontEnd);
  const leaves = pages.slice(0, -1).map((_, j) => leafOf(sideMat(2 * j + 1, false), sideMat(2 * j + 2, true)));
  leafOf(sideMat(2 * pages.length - 1, false), null); // the back endpaper, lying open on the right

  // ---------- each page's picture: printed, or sewn as the page opens ----------
  const sewn: (((progress: number) => void) | null)[] = pages.map(() => null);
  const ready: Promise<void>[] = [];
  pages.forEach((p, k) => {
    if (!p.art) return;
    const left = sides[2 * k], right = sides[2 * k + 1];
    const img = new Image();
    img.decoding = 'async';
    ready.push(new Promise<void>((done) => {
      img.onload = () => {
        if (!p.stitch) { left.print(img, img.naturalWidth, img.naturalHeight); right.print(img, img.naturalWidth, img.naturalHeight); }
        else {
          // the grid covers the spread's printed area the way the print would, one pixel per stitch
          const cols = typeof p.stitch === 'number' ? Math.round(p.stitch) : 160;
          const rows = Math.round(cols * left.area.h / (left.area.w * 2));
          const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows;
          const cg = cv.getContext('2d', { willReadFrequently: true })!;
          cg.imageSmoothingQuality = 'high';
          const scale = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
          const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
          cg.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
          const [a, b] = halves(stitchGrid(cg.getImageData(0, 0, cols, rows).data, cols, rows));
          left.cloth(a); right.cloth(b);
          sewn[k] = (progress) => { left.sew(progress); right.sew(progress); };
          last = []; // pose again, so the sewing catches up with the page
        }
        done();
      };
      img.onerror = () => { console.warn(`popfold: the picture for page "${p.id}" did not load (${p.art})`); done(); };
    }));
    img.src = /^(?:[a-z]+:|\/)/i.test(p.art) ? p.art : siteUrl(p.art) ?? p.art; // an address of its own stays as it is
  });

  // ---------- each page's pieces ----------
  type Placed = { obj: THREE.Object3D; popup: Popup };
  const placed: Placed[][] = pages.map(() => []);
  const spreadGroups = pages.map((p) => {
    const g = new THREE.Group();
    g.userData.zoneId = p.id;
    g.userData.pick = 'center';
    book.add(g);
    return g;
  });
  const editGroups: Parameters<typeof collectEditables>[0] = pages.map((p, k) => ({ room: p.id, parent: spreadGroups[k], items: [] }));
  const kinds = recipe.kinds ?? {};
  for (const s of (recipe.pieces ?? []) as PieceSpec[]) {
    const k = pages.findIndex((p) => p.id === s.room);
    if (k < 0) throw new Error(`home "${recipe.id}": the piece "${s.id}" is on the page "${s.room}"; this book's pages are ${pages.map((p) => p.id).join(', ')}`);
    const x = s.at[0];
    const opts = { ...s.opts };
    // a stand lies down backwards unless that would take it over the far edge of the page
    if (s.kind === 'stand' && opts.lean === undefined && s.at[1] - Number(opts.h ?? 1) < -H / 2) opts.lean = 'front';
    let popup = kinds[s.kind] ? null : popupOf(s.kind, x, opts);
    if (!popup) {
      const make = kinds[s.kind];
      if (!make) throw new Error(`home "${recipe.id}": the piece "${s.id}" is a "${s.kind}", which is neither a pop-up (${POPUP_KINDS.join(', ')}) nor one of the recipe's kinds (${Object.keys(kinds).join(', ') || 'none'})`);
      // a site's own piece: mounted on a card hinged across its page, like a stand
      const made = make(s, { recipe, page: pages[k], width: W, height: H } satisfies BookContext);
      const obj = made instanceof THREE.Object3D ? made : made.group;
      obj.updateWorldMatrix(true, true);
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      popup = standFor(x, size.x, size.y, obj, s.at[1] - size.y < -H / 2 ? 'front' : 'back');
    }
    const obj = new THREE.Group();
    obj.add(popup.group);
    obj.position.set(0, 0, s.at[1]);
    if (s.scale) obj.scale.setScalar(s.scale);
    piece(obj, s.id);
    obj.userData.propName = s.kind;
    if (s.hidden) obj.userData.hidden = true;
    obj.userData.listed = { spec: s, defaults: {}, read: () => ({ at: [x, Math.round(obj.position.z * 1000) / 1000] }) } satisfies Listed;
    spreadGroups[k].add(obj);
    placed[k].push({ obj, popup });
    editGroups[k].items.push({ obj });
  }
  // posed open while the home is built: story dots and the studio measure the pieces standing
  const flat: SpreadAngles = { left: Math.PI, right: 0 };
  for (const list of placed) for (const p of list) p.popup.pose(flat);
  const editables = collectEditables(editGroups);

  let last: SpreadAngles[] = [];
  const pose = (turns: number[], cover: number) => {
    const angles = leafAngles(turns, FAN, cover);
    leaves.forEach((g, j) => { g.rotation.z = angles[j]; });
    const front = coverAngle(cover, leaves.length, FAN);
    frontCover.rotation.z = front - Math.PI; // (its parts are built lying open, at π)
    const spreads = spreadsOf(angles, front);
    let open = 0;
    spreads.forEach((s, k) => {
      // a shut page is out of sight between two leaves: nothing to draw or move there
      const shown = halfOpen(s) > FAN * 1.5;
      open = Math.max(open, openness(s));
      for (const p of placed[k]) p.obj.visible = shown && !p.obj.userData.hidden;
      const was = last[k];
      if (shown && (!was || Math.abs(was.left - s.left) > 1e-5 || Math.abs(was.right - s.right) > 1e-5)) {
        for (const p of placed[k]) p.popup.pose(s);
        sewn[k]?.(openness(s));
      }
    });
    last = spreads;
    return open;
  };

  return {
    root, badges: [], spinners: [], mixers: [], pickables: [root], editables,
    // the pages' pictures: the home is shown (and a still taken) once they are printed or ready to sew
    ...(ready.length ? { arriving: Promise.all(ready).then(() => []) } : {}),
    zones: pages.map((p) => ({ id: p.id })),
    ground: () => book.position.y,
    // each leaf turns with its page's field; the pieces of the two pages it lies between fold with it
    update: (cur) => {
      const open = pose(pages.slice(0, -1).map((p) => cur[`z:${p.id}`] ?? 0), spec.closed ? (cur['z:cover'] ?? 0) : 1);
      return { open, lit: 1 };
    },
    reset: () => { last = []; },
  };
}

/** a paper colour's material, for a site that adds its own cards to a book */
export { paper };
