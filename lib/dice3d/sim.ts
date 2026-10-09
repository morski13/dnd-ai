// Throws the dice in a physics world (cannon-es) without drawing anything, records every frame,
// then renumbers each die so the face that ended up on top shows the real result.
// The animation later simply replays the recorded frames: the dice look free but always land right.
import * as CANNON from "cannon-es";
import { forceValue, makeShape, upIndex, type DieType, type Quat, type Shape, type V3 } from "./shapes";

export type Tray = { halfW: number; halfD: number };
export type Frame = { p: V3; q: Quat }[];
export type Hit = { step: number; strength: number };
export type SimResult = { shapes: Shape[]; frames: Frame[]; hits: Hit[]; settledAt: number };

export const STEP = 1 / 60;
const MAX_STEPS = 60 * 4;

/** Small seeded random numbers, so a throw can be repeated exactly in tests. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function body(shape: Shape, material: CANNON.Material) {
  const poly = new CANNON.ConvexPolyhedron({
    vertices: shape.vertices.map((v) => new CANNON.Vec3(...v)),
    faces: shape.faces.map((f) => f.verts),
  });
  const b = new CANNON.Body({ mass: 1, material, linearDamping: 0.12, angularDamping: 0.12, allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.25 });
  b.addShape(poly);
  return b;
}

function throwOnce(types: DieType[], tray: Tray, rand: () => number) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -40, 0), allowSleep: true });
  world.broadphase = new CANNON.NaiveBroadphase();
  (world.solver as CANNON.GSSolver).iterations = 12;
  const diceMat = new CANNON.Material("dice");
  const floorMat = new CANNON.Material("floor");
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.25, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.1, restitution: 0.4 }));

  // Floor and four walls
  const plane = (pos: V3, axis: V3, angle: number) => {
    const b = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    b.position.set(...pos);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(...axis), angle);
    world.addBody(b);
  };
  plane([0, 0, 0], [1, 0, 0], -Math.PI / 2);
  plane([-tray.halfW, 0, 0], [0, 1, 0], Math.PI / 2);
  plane([tray.halfW, 0, 0], [0, 1, 0], -Math.PI / 2);
  plane([0, 0, -tray.halfD], [0, 0, 1], 0);
  plane([0, 0, tray.halfD], [0, 1, 0], Math.PI);

  const shapes = types.map((t) => makeShape(t));
  const hits: Hit[] = [];
  let step = 0;
  const bodies = shapes.map((s, i) => {
    const b = body(s, diceMat);
    // Thrown in from the bottom edge of the screen, spread out, spinning.
    const n = shapes.length;
    const spread = Math.min(tray.halfW * 1.4, n * 1.3);
    b.position.set(-spread / 2 + (spread * (i + 0.5)) / n + (rand() - 0.5) * 0.6, 2.2 + rand() * 1.5, tray.halfD - 1.2 - rand() * 0.6);
    b.velocity.set((rand() - 0.5) * 6, 2 + rand() * 3, -(18 + rand() * 9));
    b.angularVelocity.set((rand() - 0.5) * 30, (rand() - 0.5) * 30, (rand() - 0.5) * 30);
    b.quaternion.setFromEuler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
    b.addEventListener("collide", (e: { contact: CANNON.ContactEquation }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.5) hits.push({ step, strength: Math.min(1, v / 14) });
    });
    world.addBody(b);
    return b;
  });

  const frames: Frame[] = [];
  let settledAt = MAX_STEPS;
  for (step = 0; step < MAX_STEPS; step++) {
    world.step(STEP);
    frames.push(bodies.map((b) => ({
      p: [b.position.x, b.position.y, b.position.z],
      q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
    })));
    if (step > 20 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.05))) {
      settledAt = step;
      break;
    }
  }
  return { shapes, frames, hits, settledAt };
}

/**
 * Throws `dice` and returns frames to replay. Each die is renumbered so it lands on its value.
 * Retries (with a new throw) if a die ends up balanced on an edge.
 */
export function simulateThrow(dice: { type: DieType; value: number }[], tray: Tray, seed = Math.floor(Math.random() * 2 ** 31)): SimResult {
  const rand = seeded(seed);
  let best: ReturnType<typeof throwOnce> | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = throwOnce(dice.map((d) => d.type), tray, rand);
    best = r;
    const last = r.frames[r.frames.length - 1];
    const flatEnough = r.shapes.every((s, i) => upIndex(s, last[i].q).flatness > 0.93);
    if (flatEnough) break;
  }
  const r = best!;
  const last = r.frames[r.frames.length - 1];
  const shapes = r.shapes.map((s, i) => forceValue(s, upIndex(s, last[i].q).index, dice[i].value));
  return { shapes, frames: r.frames, hits: r.hits, settledAt: r.settledAt };
}
