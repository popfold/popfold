import * as THREE from 'three';
import { tubeDrawCount } from './cable-math';

// A flow: a glowing pipe along a path with bright packets travelling down it. Used for integration diagrams
// (data moving from one system to another) and for the tower's spine. Points are in the parent's coordinates.
// With `reveal`, it is a cable instead: drawn in along its length as its owner sets `reveal`, a plug on its tip.

export interface FlowOptions {
  /** neon colour of the pipe and its packets */
  color?: string;
  /** pipe radius in scene units */
  radius?: number;
  /** how many packets ride the pipe at once */
  packets?: number;
  /** trips per second along the whole pipe (0.2 = one trip in five seconds) */
  speed?: number;
  /** packet size relative to the pipe */
  packetScale?: number;
  /**
   * a cable that draws itself in: hidden until its owner sets `reveal` above 0, then drawn that far along, with
   * packets only once it is all the way (plugged in). Left out, the pipe is always whole, as before.
   */
  reveal?: boolean;
  /** with `reveal`: a model riding the cable's tip, pointing along +Z, its origin where the cable enters it (a plug) */
  plug?: THREE.Object3D;
  /** with `reveal`: called when the cable is plugged in (true) and when it is pulled back out (false) */
  onPlug?: (plugged: boolean) => void;
  /** with `reveal`, in a tower floor: when this cable is drawn, in turns (default: in the order the floor adds them, after the spine's branch) */
  step?: number;
}

export class Flow {
  readonly group = new THREE.Group();
  readonly curve: THREE.CatmullRomCurve3;
  private pipe: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
  private dots: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  /** where the packets start: spread out between flows, but the same on every run */
  private t0 = (Flow.made++ * 0.618034) % 1;
  private t = this.t0;
  private static made = 0;
  private speed: number;
  /** 0 dark, 1 fully lit and flowing; the owner sets it each frame (e.g. from a zone) */
  intensity = 1;
  /** with the `reveal` option: how far along the cable is drawn, 0 (not there) to 1 (plugged in); the owner sets it */
  reveal = 0;
  private revealing: boolean;
  private plug?: THREE.Object3D;
  private onPlug?: (plugged: boolean) => void;
  private plugged: boolean | undefined;
  private segs: number;
  private radial = 8;

  constructor(points: THREE.Vector3[], o: FlowOptions = {}) {
    const color = new THREE.Color(o.color ?? '#3EE6FF');
    const r = o.radius ?? 0.035;
    this.speed = o.speed ?? 0.18;
    this.curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08);
    const segs = this.segs = Math.max(24, Math.round(this.curve.getLength() * 24));
    this.pipe = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, r, this.radial), new THREE.MeshStandardMaterial({
      color: '#10131F', emissive: color, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.2,
    }));
    this.group.add(this.pipe);
    const dotGeo = new THREE.SphereGeometry(r * (o.packetScale ?? 2.2), 12, 8);
    for (let i = 0; i < (o.packets ?? 5); i++) {
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#FFFFFF'), 0.55), transparent: true, toneMapped: false }));
      this.dots.push(d);
      this.group.add(d);
    }
    this.group.traverse((m) => { (m as THREE.Mesh).castShadow = false; });
    this.revealing = !!o.reveal;
    this.onPlug = o.onPlug;
    if (this.revealing && o.plug) { this.plug = o.plug; this.group.add(o.plug); }
    if (!this.revealing) this.reveal = 1;
  }

  /** back to the starting phase (for repeatable captures) */
  reset() { this.t = this.t0; this.plugged = undefined; }

  private static readonly Z = new THREE.Vector3(0, 0, 1);
  private static readonly tangent = new THREE.Vector3();

  /** draw the cable `reveal` of the way along, with the plug on its tip; tell the owner when it plugs in or out */
  private drawn() {
    const p = Math.min(1, Math.max(0, this.reveal));
    this.group.visible = p > 0;
    this.pipe.geometry.setDrawRange(0, tubeDrawCount(p, this.segs, this.radial));
    if (this.plug && p > 0) {
      this.curve.getPointAt(p, this.plug.position);
      this.plug.quaternion.setFromUnitVectors(Flow.Z, this.curve.getTangentAt(p, Flow.tangent));
    }
    const plugged = p >= 1;
    if (plugged !== this.plugged) {
      const first = this.plugged === undefined;
      this.plugged = plugged;
      if (!(first && !plugged)) this.onPlug?.(plugged); // (no "pulled out" for a cable that was never in)
    }
    return plugged;
  }

  update(dt: number) {
    const k = Math.min(1, Math.max(0, this.intensity));
    this.t = (this.t + dt * this.speed * (0.3 + k)) % 1;
    this.pipe.material.emissiveIntensity = 0.15 + k * 1.6;
    const live = this.revealing ? this.drawn() : true; // a cable carries packets once it is plugged in
    const n = this.dots.length;
    this.dots.forEach((d, i) => {
      const u = (this.t + i / n) % 1;
      this.curve.getPointAt(u, d.position);
      d.visible = live && k > 0.05;
      d.material.opacity = k * Math.min(1, Math.min(u, 1 - u) * 12); // fade in and out at the ends
    });
  }
}
