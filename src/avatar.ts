import * as THREE from 'three';
import * as tex from './textures';
import { C, rbox, toy } from './props';

// The built-in guide figure: a stylised toy figurine with long curly brown hair, a pair of hair bows, a lilac
// top, a layered skirt, pink socks and black shoes. Origin = between the feet. A site can swap in its own rigged
// model (avatarFromModel) or switch the guide off.

export interface Avatar {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  skirt: THREE.Group;
  /** Sideways angle of the waving arm when it hangs at rest. */
  armRest: number;
}

const SKIN = '#F2C4A0';
const HAIR = '#6A3A22';
const HAIR_TIP = '#A8683A';

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function bow(mat: THREE.Material) {
  const g = new THREE.Group();
  const loop = new THREE.SphereGeometry(1, 14, 10);
  const l = new THREE.Mesh(loop, mat);
  l.scale.set(0.075, 0.055, 0.035);
  l.position.x = -0.06;
  const r = l.clone();
  r.position.x = 0.06;
  const knot = new THREE.Mesh(loop, mat);
  knot.scale.setScalar(0.03);
  g.add(l, r, knot);
  return g;
}

function leg(side: -1 | 1, skin: THREE.Material) {
  const g = new THREE.Group();
  g.position.set(side * 0.09, 0.55, 0);
  g.add(
    at(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 6, 14), skin), 0, -0.25, 0),
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.14, 16), toy('#FF8FC0', { roughness: 0.9, clearcoat: 0 })), 0, -0.4, 0),
    at(rbox(0.14, 0.085, 0.24, 0.04, toy('#1B1418', { roughness: 0.25 })), 0, -0.507, 0.035),
    at(rbox(0.15, 0.03, 0.04, 0.012, toy('#1B1418')), 0, -0.45, 0.03), // mary jane strap
  );
  return g;
}

function arm(side: -1 | 1, skin: THREE.Material) {
  const g = new THREE.Group();
  g.position.set(side * 0.2, 1.0, 0);
  g.rotation.z = side * 0.15;
  const bangle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20), toy(C.gold, { metalness: 0.7, roughness: 0.3 }));
  bangle.rotation.x = Math.PI / 2;
  g.add(
    at(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 6, 12), skin), 0, -0.2, 0),
    at(new THREE.Mesh(new THREE.SphereGeometry(0.056, 14, 10), skin), 0, -0.43, 0),
    at(bangle, 0, -0.35, 0),
  );
  return g;
}

export function buildAvatar(): Avatar {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.userData.pick = 'guide';

  const skin = toy(SKIN, { roughness: 0.55, clearcoat: 0.25 });
  const bowMat = toy(C.cherry, { roughness: 0.35 });

  // ---------- legs + arms ----------
  const legL = leg(-1, skin), legR = leg(1, skin);
  const armL = arm(-1, skin), armR = arm(1, skin);
  body.add(legL, legR, armL, armR);

  // ---------- torso + crochet top ----------
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.2, 8, 18), skin);
  torso.position.y = 0.8;
  torso.scale.z = 0.75;
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.158, 0.162, 0.21, 24),
    new THREE.MeshStandardMaterial({ map: tex.dots('#CDBBFF', '#A98BF5', 10, 2), roughness: 0.95 }),
  );
  top.position.y = 0.92;
  top.scale.z = 0.78;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 14), skin);
  neck.position.y = 1.08;
  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), toy('#7A4A2B', { roughness: 0.5 }));
  necklace.rotation.x = Math.PI / 2 + 0.35;
  necklace.position.set(0, 1.03, 0.03);
  body.add(torso, top, neck, necklace);

  // ---------- layered skirt ----------
  const skirt = new THREE.Group();
  skirt.position.y = 0.68;
  const under = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.3, 0.38, 28, 1, true),
    toy('#E3D2F2', { roughness: 0.85, clearcoat: 0, side: THREE.DoubleSide }),
  );
  under.position.y = -0.19;
  const lace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.172, 0.27, 0.24, 28, 1, true),
    new THREE.MeshStandardMaterial({ map: tex.dots('#FFF6DC', '#F1DDA8', 9, 3), roughness: 0.95, side: THREE.DoubleSide }),
  );
  lace.position.y = -0.13;
  lace.rotation.z = 0.14; // asymmetric hem
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.022, 8, 28), toy('#F4B6C8', { roughness: 0.8 }));
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.8;
  skirt.add(under, lace, belt);
  skirt.scale.z = 0.85;
  body.add(skirt);

  // ---------- head ----------
  const head = new THREE.Group();
  head.position.y = 1.3;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.23, 28, 22), skin);
  face.scale.set(1, 1.05, 0.95);
  head.add(face);

  const dark = new THREE.MeshStandardMaterial({ color: '#2A1A14', roughness: 0.4 });
  const eyeGeo = new THREE.SphereGeometry(0.028, 12, 10);
  head.add(at(new THREE.Mesh(eyeGeo, dark), -0.08, 0.0, 0.205), at(new THREE.Mesh(eyeGeo, dark), 0.08, 0.0, 0.205));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 8, 18, Math.PI), new THREE.MeshStandardMaterial({ color: '#B23A48', roughness: 0.5 }));
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.06, 0.2);
  head.add(smile);
  const cheekMat = new THREE.MeshStandardMaterial({ color: '#FF8FA8', transparent: true, opacity: 0.55, roughness: 0.9 });
  [-1, 1].forEach((s) => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), cheekMat);
    cheek.scale.z = 0.3;
    cheek.position.set(s * 0.13, -0.06, 0.175);
    cheek.userData.noShadow = true;
    head.add(cheek);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 20), toy(C.gold, { metalness: 0.7, roughness: 0.3 }));
    hoop.rotation.y = Math.PI / 2;
    hoop.position.set(s * 0.235, -0.11, 0.02);
    head.add(hoop);
  });

  // hair: a cap plus a cascade of curls, darker at the roots and lighter at the ends
  const hairMat = toy(HAIR, { roughness: 0.7, clearcoat: 0.15 });
  const tipMat = toy(HAIR_TIP, { roughness: 0.7, clearcoat: 0.15 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.255, 24, 18), hairMat);
  cap.position.set(0, 0.05, -0.045);
  head.add(cap);
  const curlGeo = new THREE.IcosahedronGeometry(1, 1);
  const rnd = seeded(42);
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    const y = 0.16 - t * 0.72 + (rnd() - 0.5) * 0.06;
    const below = y < -0.16; // below the jaw the hair hangs in front of / behind the shoulders
    const a = THREE.MathUtils.degToRad(below ? 40 + rnd() * 280 : 62 + rnd() * 236);
    const R = (below ? 0.2 : 0.25) + rnd() * 0.04;
    const curl = new THREE.Mesh(curlGeo, t > 0.6 && rnd() > 0.35 ? tipMat : hairMat);
    curl.scale.setScalar(0.055 + rnd() * 0.035);
    curl.position.set(Math.sin(a) * R, y, Math.cos(a) * R * 0.9 - 0.03);
    head.add(curl);
  }

  // the pair of bows
  const bowL = bow(bowMat), bowR = bow(bowMat);
  bowL.position.set(-0.15, 0.24, 0.1);
  bowL.rotation.set(-0.3, 0.3, 0.5);
  bowR.position.set(0.15, 0.24, 0.1);
  bowR.rotation.set(-0.3, -0.3, -0.5);
  head.add(bowL, bowR);
  body.add(head);

  root.visible = false;
  return { root, body, head, armL, armR, legL, legR, skirt, armRest: 0.15 };
}

/**
 * A site's own figurine: a textured model with bones named ArmL, ArmR, LegL and LegR, all pointing straight up.
 * The bones stand in for the code-built limbs, so the same animation drives both. The head does not turn (a
 * generated figure's hair is usually fused to its back).
 */
export function avatarFromModel(model: THREE.Object3D): Avatar | null {
  const bone = (name: string) => model.getObjectByName(name) as THREE.Group | undefined;
  const armL = bone('ArmL'), armR = bone('ArmR'), legL = bone('LegL'), legR = bone('LegR');
  if (!armL || !armR || !legL || !legR) return null;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(model);
  root.userData.pick = 'guide';
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // bones move it outside its resting bounds
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.metalness = 0;
    mat.roughness = 0.5;
  });
  root.visible = false;
  // stand-ins for parts this model does not have as separate pieces
  return { root, body, head: new THREE.Group(), armL, armR, legL, legR, skirt: new THREE.Group(), armRest: 0 };
}
