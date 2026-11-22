// Fold-in: a piece hinged along one edge of its base, which rises from lying flat to standing instead of
// springing in. hinge() wraps a piece's own parts in a pivot on that edge; set(t) stands it up (0 flat, 1 up).
// The piece itself (what layouts and stories hold on to) is not moved, so the studio can still place it.
// Any shell can use it: a listed piece with "fold" arrives this way, and the book's stands are hinges.
import * as THREE from 'three';

/** The side a piece lies down towards when it is folded flat: its back (-z), its front (+z), its left or right. */
export type HingeEdge = 'back' | 'front' | 'left' | 'right';
export const HINGE_EDGES: HingeEdge[] = ['back', 'front', 'left', 'right'];

export interface Hinge {
  /** the pivot that turns (a child of the piece, holding the piece's own parts) */
  pivot: THREE.Group;
  edge: HingeEdge;
  /** how far it stands: 0 lying flat, 1 standing as built */
  set: (t: number) => void;
}

/**
 * Hinge a piece along the bottom edge of its parts on one side. Its children move into a pivot on that edge, so
 * turning the pivot lays them down flat on the floor they stand on (y = their lowest point) and stands them up again.
 */
export function hinge(obj: THREE.Object3D, edge: HingeEdge = 'back'): Hinge {
  const old = obj.userData.hinge as Hinge | undefined;
  if (old) return old;
  // the parts' bounds in the piece's own space
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const box = new THREE.Box3();
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) box.union(new THREE.Box3().setFromObject(o, true).applyMatrix4(inv)); });
  if (box.isEmpty()) box.set(new THREE.Vector3(), new THREE.Vector3());
  const at = new THREE.Vector3(
    edge === 'left' ? box.min.x : edge === 'right' ? box.max.x : 0,
    box.min.y,
    edge === 'back' ? box.min.z : edge === 'front' ? box.max.z : 0,
  );
  const pivot = new THREE.Group();
  pivot.name = 'hinge';
  const inner = new THREE.Group();
  inner.position.copy(at).negate();
  pivot.position.copy(at);
  for (const c of [...obj.children]) inner.add(c);
  pivot.add(inner);
  obj.add(pivot);
  // the turn that lays it down: about x for back and front, about z for left and right
  const axis = edge === 'back' || edge === 'front' ? 'x' : 'z';
  const sign = edge === 'back' || edge === 'left' ? -1 : 1;
  const flat = (axis === 'x' ? sign : -sign) * (Math.PI / 2);
  const h: Hinge = {
    pivot, edge,
    set: (t) => { pivot.rotation[axis] = flat * (1 - Math.min(1, Math.max(0, t))); },
  };
  obj.userData.hinge = h;
  return h;
}

/** Ease for a fold: slow off the floor, slow into standing, no overshoot (paper does not bounce past upright). */
export const foldEase = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
