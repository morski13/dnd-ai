// The 3D stage: draws the dice with three.js and replays a recorded throw.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makeShape, maxValue, type DieType, type Shape } from "./shapes";
import { simulateThrow, STEP, type SimResult, type Tray } from "./sim";
import type { DiceSkin } from "./skin";
import { faceLayout, loadImages, paintD4Face, paintFace, rotatedVerts, type Images } from "./textures";
import { playHit, unlockAudio } from "./sound";

export type StageDie = { type: DieType; value: number; dropped?: boolean };
export type PlayOptions = { sound?: boolean; onSettle?: () => void };

const geometryCache = new Map<DieType, THREE.BufferGeometry>();

/** Triangles + texture coordinates for one die type. Group i = face i. */
function geometry(type: DieType): THREE.BufferGeometry {
  const hit = geometryCache.get(type);
  if (hit) return hit;
  const shape = makeShape(type);
  const L = faceLayout(type);
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  const g = new THREE.BufferGeometry();
  let start = 0;
  shape.faces.forEach((f, fi) => {
    const verts = rotatedVerts(shape, fi);
    for (let k = 1; k < verts.length - 1; k++) {
      for (const idx of [0, k, k + 1]) {
        pos.push(...shape.vertices[verts[idx]]);
        uv.push(...L.poly[idx]);
        nor.push(...f.normal);
      }
    }
    const count = (verts.length - 2) * 3;
    g.addGroup(start, count, fi);
    start += count;
  });
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geometryCache.set(type, g);
  return g;
}

function baseMaterial(skin: DiceSkin): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0 });
  switch (skin.finish) {
    case "glossy": Object.assign(m, { roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.15 }); break;
    case "matte": Object.assign(m, { roughness: 0.85 }); break;
    case "metal": Object.assign(m, { roughness: 0.28, metalness: 0.9 }); break;
    case "pearl": Object.assign(m, { roughness: 0.35, sheen: 1, sheenRoughness: 0.4, iridescence: 0.7, iridescenceIOR: 1.4, clearcoat: 0.6 });
      m.sheenColor = new THREE.Color(skin.accent); break;
    case "crystal": Object.assign(m, { roughness: 0.08, transmission: 0.55, thickness: 1.2, ior: 1.45, clearcoat: 1, transparent: true, opacity: 0.96 }); break;
  }
  return m;
}

/** Materials for one skin, made once and reused for every throw. */
class SkinMaterials {
  private faces = new Map<string, THREE.MeshPhysicalMaterial>();
  private ready: Promise<Images>;
  private images: Images = { faces: {} };
  constructor(public skin: DiceSkin, private anisotropy: number) {
    this.ready = loadImages(skin).then((im) => (this.images = im));
  }
  load() { return this.ready; }
  private make(key: string, canvas: HTMLCanvasElement) {
    let m = this.faces.get(key);
    if (m) return m;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    m = baseMaterial(this.skin);
    m.map = tex;
    if (this.skin.finish === "metal") { m.metalnessMap = null; }
    this.faces.set(key, m);
    return m;
  }
  /** One material per face, in face order, for a die with these labels. */
  forShape(shape: Shape): THREE.Material[] {
    if (shape.type === "d4") {
      return shape.faces.map((f, fi) => {
        const labels = rotatedVerts(shape, fi).map((v) => shape.labels[v]);
        return this.make(`d4:${labels.join("")}`, paintD4Face(this.skin, this.images, labels));
      });
    }
    return shape.labels.map((v) => this.make(`${shape.type}:${v}`, paintFace(this.skin, this.images, shape.type, v)));
  }
  dispose() {
    for (const m of this.faces.values()) { m.map?.dispose(); m.dispose(); }
    this.faces.clear();
  }
}

export class DiceStage {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private meshes: THREE.Mesh[] = [];
  private mats: SkinMaterials | null = null;
  private raf = 0;
  private tray: Tray = { halfW: 4, halfD: 6 };
  private skipTo: (() => void) | null = null;
  private sun: THREE.DirectionalLight;
  private diceCount = 1;
  idleSpin = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2017, 0.45));
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
    this.sun.position.set(-4, 16, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -12; this.sun.shadow.camera.right = 12;
    this.sun.shadow.camera.top = 12; this.sun.shadow.camera.bottom = -12;
    this.sun.shadow.radius = 6;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.resize();
  }

  /** Fit the camera and the invisible walls to the screen. */
  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Far enough back that the tray is at least ~8.5 units wide, even on a narrow phone.
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needW = 12 + Math.max(0, this.diceCount - 2) * 0.35;
    const dist = Math.max(17, needW / (tan * this.camera.aspect * 0.9));
    this.camera.position.set(0, dist, dist * 0.18);
    this.camera.lookAt(0, 0, 0.4);
    this.camera.updateProjectionMatrix();
    const halfH = dist * tan * 0.9;
    this.tray = { halfW: halfH * this.camera.aspect, halfD: halfH };
  }

  async useSkin(skin: DiceSkin) {
    if (this.mats && JSON.stringify(this.mats.skin) === JSON.stringify(skin)) return this.mats.load();
    this.mats?.dispose();
    this.mats = new SkinMaterials(skin, this.renderer.capabilities.getMaxAnisotropy());
    await this.mats.load();
  }

  private clear() {
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes = [];
  }

  private buildMeshes(sim: SimResult, dice: StageDie[]) {
    this.clear();
    sim.shapes.forEach((shape, i) => {
      const mesh = new THREE.Mesh(geometry(shape.type), this.mats!.forShape(shape));
      mesh.castShadow = true;
      mesh.userData.dropped = !!dice[i].dropped;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    });
  }

  private apply(frame: SimResult["frames"][number]) {
    frame.forEach((f, i) => {
      const m = this.meshes[i];
      if (!m) return;
      m.position.set(...f.p);
      m.quaternion.set(...f.q);
    });
  }

  /** Throw these dice. Resolves when they have settled (or the throw was skipped). */
  play(dice: StageDie[], opts: PlayOptions = {}): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.idleSpin = false;
    this.diceCount = dice.length;
    this.resize();
    if (opts.sound) unlockAudio();
    const sim = simulateThrow(dice.map((d) => ({ type: d.type, value: d.value })), this.tray);
    this.buildMeshes(sim, dice);
    const end = Math.min(sim.frames.length - 1, sim.settledAt);
    const rate = Math.max(1, end / (60 * 2.1));
    let hitIdx = 0;
    let lastSound = -1;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.apply(sim.frames[end]);
        this.dimDropped();
        this.renderer.render(this.scene, this.camera);
        opts.onSettle?.();
        this.skipTo = null;
        resolve();
      };
      this.skipTo = finish;
      const tick = () => {
        if (done) return;
        // Long throws play a little faster so a roll never takes more than ~2 seconds
        const step = Math.min(end, Math.floor(((performance.now() - t0) / 1000 / STEP) * rate));
        this.apply(sim.frames[step]);
        while (hitIdx < sim.hits.length && sim.hits[hitIdx].step <= step) {
          const h = sim.hits[hitIdx++];
          if (opts.sound && h.step - lastSound > 2) { playHit(h.strength); lastSound = h.step; }
        }
        this.renderer.render(this.scene, this.camera);
        if (step >= end) return finish();
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  skip() { this.skipTo?.(); }

  private dimDropped() {
    for (const m of this.meshes) {
      if (!m.userData.dropped) continue;
      const mats = (m.material as THREE.Material[]).map((x) => { const c = x.clone(); c.transparent = true; c.opacity = 0.3; return c; });
      m.material = mats;
    }
  }

  /** Workshop preview: one die (or a set) slowly turning in the middle of the screen. */
  showcase(types: DieType[]) {
    cancelAnimationFrame(this.raf);
    this.skipTo = null;
    this.clear();
    this.diceCount = 1;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const n = types.length;
    const dist = n === 1 ? 5.4 : 4.5 + n * 1.1;
    this.camera.position.set(0, dist * 0.55, dist);
    this.camera.lookAt(0, 0.6, 0);
    this.camera.updateProjectionMatrix();
    types.forEach((type, i) => {
      const shape = makeShape(type);
      // show the highest number toward the camera to start with
      const mesh = new THREE.Mesh(geometry(type), this.mats!.forShape(shape));
      mesh.castShadow = true;
      const cols = n === 6 ? 3 : Math.min(n, 4);
      const row = Math.floor(i / cols), col = i % cols;
      mesh.position.set((col - (cols - 1) / 2) * 2.3, 1.2, (row - (Math.ceil(n / cols) - 1) / 2) * 3.0);
      mesh.userData.spin = 0.4 + (i % 3) * 0.12;
      mesh.userData.max = maxValue(type);
      this.scene.add(mesh);
      this.meshes.push(mesh);
    });
    this.idleSpin = true;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const m of this.meshes) {
        m.rotation.y += dt * m.userData.spin;
        m.rotation.x += dt * m.userData.spin * 0.45;
      }
      this.renderer.render(this.scene, this.camera);
      if (this.idleSpin) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Spin the showcase dice with a finger. */
  drag(dx: number, dy: number) {
    for (const m of this.meshes) {
      m.rotation.y += dx * 0.01;
      m.rotation.x += dy * 0.01;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.mats?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
