import {
  ACESFilmicToneMapping,
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BattleResult } from "../../engine";
import { FIELD_LENGTH, FIELD_WIDTH, groundHeight, type ArenaLayout } from "../arena";
import { STEP_SECONDS, type BattleSim, type Projectile, type Soldier } from "../sim";
import { sound, type SoundKind } from "../../audio/sound";
import type { GraphicsQuality } from "../../game/settings";
import { applyQuality } from "../../render/quality";
import { buildUnitModel, projectileMaterial, sharedGeometry as G, sharedMaterials as M, type UnitRig } from "./models";

export const BATTLE_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
const MAX_STEPS_PER_FRAME = 12;
const SKY = "#a9cde8";
const UP = new Vector3(0, 1, 0);

interface SoldierVisual {
  rig: UnitRig;
  walk: number;
}

interface Effect {
  object: Object3D;
  age: number;
  life: number;
  update(t: number): void;
  dispose?(): void;
}

export interface BattleViewCallbacks {
  /** Called once when the simulation reaches its end. */
  onFinished(result: BattleResult): void;
  /** Called when the followed soldier changes (null when the camera is free). */
  onFollow?(soldier: Soldier | null): void;
}

export class BattleView {
  speed = 1;
  paused = false;
  followed: Soldier | null = null;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private timer = new Timer();
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private visuals = new Map<number, SoldierVisual>();
  private projectiles = new Map<number, Mesh>();
  private effects: Effect[] = [];
  private accumulator = 0;
  private frame = 0;
  private finished = false;
  private downAt: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver;
  private disposables: Array<{ dispose(): void }> = [];
  private tmpQuat = new Quaternion();
  private tmpQuat2 = new Quaternion();

  constructor(
    private container: HTMLElement,
    readonly sim: BattleSim,
    private colors: { attacker: string; defender: string },
    private callbacks: BattleViewCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new Color(SKY);
    this.scene.fog = new Fog(SKY, 90, 220);
    this.camera = new PerspectiveCamera(45, 1, 0.3, 500);
    this.camera.position.set(-46, 30, -40);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = 1.45;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 140;
    this.controls.target.set(0, 0, 0);

    this.scene.add(new HemisphereLight("#e4efff", "#4a5a33", 1.2));
    const sun = new DirectionalLight("#fff1d6", 2.4);
    sun.position.set(-30, 60, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
    this.scene.add(sun);

    this.buildArena(sim.arena);
    for (const s of sim.soldiers) {
      const rig = buildUnitModel(s.unit, s.side === 0 ? colors.attacker : colors.defender);
      rig.root.traverse((o) => (o.userData.soldier = s.id));
      this.scene.add(rig.root);
      this.visuals.set(s.id, { rig, walk: (s.id * 0.37) % (Math.PI * 2) });
    }
    this.syncSoldiers(0);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  /** Runs the rest of the battle at once (same steps, so the same result) and reports it. */
  skipToEnd(): void {
    while (!this.sim.done) this.sim.step();
    for (const p of this.projectiles.values()) this.scene.remove(p);
    this.projectiles.clear();
    this.syncSoldiers(1);
    this.finish();
  }

  follow(soldier: Soldier | null): void {
    this.followed = soldier;
    this.callbacks.onFollow?.(soldier);
  }

  /** Follows a random living soldier other than the current one. */
  followSomeone(): void {
    const alive = this.sim.soldiers.filter((s) => s.alive && s !== this.followed);
    if (alive.length === 0) return this.follow(null);
    this.follow(alive[Math.floor(Math.random() * alive.length)]!);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    this.timer.dispose();
    for (const e of this.effects) e.dispose?.();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ---------- Scene ----------

  private buildArena(arena: ArenaLayout): void {
    const size = { w: FIELD_WIDTH + 80, l: FIELD_LENGTH + 80 };
    const ground = new PlaneGeometry(size.w, size.l, 110, 140);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.getAttribute("position") as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new Color(arena.ground);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundHeight(arena, x, z));
      const outside = Math.abs(x) > FIELD_WIDTH / 2 || Math.abs(z) > FIELD_LENGTH / 2;
      const noise = Math.sin(x * 1.7 + z * 0.3) * Math.cos(z * 1.3 - x * 0.2) * 0.05 + Math.sin(x * 0.21 + z * 0.17) * 0.04;
      c.copy(base).multiplyScalar((outside ? 0.82 : 1) + noise);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    ground.setAttribute("color", new BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    const groundMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const groundMesh = new Mesh(ground, groundMaterial);
    groundMesh.receiveShadow = true;
    groundMesh.userData.ground = true;
    this.scene.add(groundMesh);
    this.disposables.push(ground, groundMaterial);

    if (arena.water) {
      const waterGeometry = new PlaneGeometry(120, size.l + 60);
      const waterMaterial = new MeshStandardMaterial({ color: "#2f7fb5", roughness: 0.2, metalness: 0.1 });
      const water = new Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.set(FIELD_WIDTH / 2 + 66, 0.05, 0);
      this.scene.add(water);
      this.disposables.push(waterGeometry, waterMaterial);
    }

    const add = (geometry: (typeof G)[keyof typeof G], material: MeshStandardMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new Mesh(geometry, material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    for (const o of arena.obstacles) {
      const y = groundHeight(arena, o.x, o.z);
      if (o.kind === "tree") {
        add(G.cylinder, M.darkWood, o.x, y + o.height * 0.3, o.z, o.radius, o.height * 0.6, o.radius);
        add(G.cone, M.leaf, o.x, y + o.height * 0.65, o.z, o.radius * 5, o.height * 0.6, o.radius * 5);
      } else if (o.kind === "rock") {
        const r = add(G.rock, M.stone, o.x, y + o.radius * 0.35, o.z, o.radius, o.radius * 0.8, o.radius);
        r.rotation.y = o.x * 1.3;
      } else {
        for (let x = o.x - o.halfLength + 0.25; x <= o.x + o.halfLength - 0.2; x += 0.5) {
          add(G.cylinder, M.wood, x, y + o.height / 2, o.z, 0.24, o.height, 0.24);
          add(G.cone, M.wood, x, y + o.height + 0.2, o.z, 0.24, 0.4, 0.24);
        }
      }
    }

    // Deployment banners mark which side is which.
    for (const [side, color] of [
      [-1, this.colors.attacker],
      [1, this.colors.defender],
    ] as const) {
      const banner = new MeshStandardMaterial({ color, flatShading: true });
      this.disposables.push(banner);
      for (const x of [-FIELD_WIDTH / 2 + 2, FIELD_WIDTH / 2 - 2]) {
        const z = side * (FIELD_LENGTH / 2 - 3);
        add(G.cylinder, M.wood, x, 2, z, 0.08, 4, 0.08);
        add(G.box, banner, x + 0.6 * -Math.sign(x), 3.4, z, 1.2, 0.8, 0.05);
      }
    }
  }

  // ---------- Loop ----------

  private loop = (time?: number): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);

    if (!this.paused && !this.sim.done) {
      this.accumulator += dt * this.speed;
      let steps = 0;
      while (this.accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME && !this.sim.done) {
        this.sim.step();
        this.handleEffects();
        this.accumulator -= STEP_SECONDS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    }
    if (this.sim.done && !this.finished) this.finish();

    const alpha = this.sim.done ? 1 : Math.min(1, this.accumulator / STEP_SECONDS);
    this.syncSoldiers(alpha, dt);
    this.syncProjectiles();
    this.updateEffects(this.paused ? 0 : dt * this.speed);
    this.updateCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.callbacks.onFinished(this.sim.result());
  }

  private syncSoldiers(alpha: number, dt = 0): void {
    const animDt = this.paused ? 0 : dt * this.speed;
    for (const s of this.sim.soldiers) {
      const v = this.visuals.get(s.id)!;
      const root = v.rig.root;
      root.position.set(s.prev.x + (s.pos.x - s.prev.x) * alpha, s.prev.y + (s.pos.y - s.prev.y) * alpha, s.prev.z + (s.pos.z - s.prev.z) * alpha);
      if (s.alive) {
        root.quaternion.setFromAxisAngle(UP, s.facing);
        const moved = Math.hypot(s.pos.x - s.prev.x, s.pos.z - s.prev.z) / STEP_SECONDS;
        v.walk += animDt * moved * 3.2;
        const swing = Math.min(1, moved / 2) * 0.7;
        v.rig.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(v.walk + (i % 2) * Math.PI + (i > 1 ? Math.PI / 2 : 0)) * swing));
        if (v.rig.rightArm) {
          const strike = s.sinceAttack < 0.35 ? Math.sin((s.sinceAttack / 0.35) * Math.PI) : 0;
          v.rig.rightArm.rotation.x = -strike * 1.8 + (v.rig.legs.length ? Math.sin(v.walk) * swing * 0.4 : 0);
        }
        if (v.rig.leftArm) v.rig.leftArm.rotation.x = -Math.sin(v.walk) * swing * 0.4;
        for (const spinner of v.rig.spinners) spinner.rotation.y += animDt * 20;
      } else {
        // Toppled: the body's physics rotation on top of the heading it died with.
        this.tmpQuat.set(s.rot.x, s.rot.y, s.rot.z, s.rot.w);
        this.tmpQuat2.setFromAxisAngle(UP, s.facing);
        root.quaternion.copy(this.tmpQuat).multiply(this.tmpQuat2);
        if (v.rig.rightArm) v.rig.rightArm.rotation.x = -2.6;
        if (v.rig.leftArm) v.rig.leftArm.rotation.x = -2.4;
      }
    }
  }

  private syncProjectiles(): void {
    const live = new Set<number>();
    for (const p of this.sim.projectiles) {
      live.add(p.id);
      let mesh = this.projectiles.get(p.id);
      if (!mesh) {
        mesh = this.projectileMesh(p);
        this.projectiles.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      if (speed > 0.5 && p.body) mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
    }
    for (const [id, mesh] of this.projectiles) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.projectiles.delete(id);
      }
    }
  }

  private projectileMesh(p: Projectile): Mesh {
    const material = projectileMaterial(p.unit);
    const arrow = p.style === "missile" && p.unit.type === "ranged" && p.unit.era !== "prehistoric" && p.unit.era !== "fantastical";
    const mesh = new Mesh(arrow ? G.box : G.sphere, material);
    if (arrow) mesh.scale.set(0.04, 0.04, p.unit.era === "modern" || p.unit.era === "futuristic" ? 0.5 : 0.9);
    else mesh.scale.setScalar(p.radius * (p.unit.era === "fantastical" ? 1.6 : 1));
    mesh.castShadow = true;
    return mesh;
  }

  // ---------- Effects ----------

  private handleEffects(): void {
    for (const e of this.sim.effects) {
      if (e.kind === "explosion") {
        this.spawnExplosion(e.at, e.radius, e.magic);
        this.playAt(e.magic ? "magic" : "explosion", e.at);
        if (e.magic) this.playAt("explosion", e.at, 0.5);
      } else if (e.kind === "beam") {
        this.spawnBeam(e.from, e.to, e.heavy);
        this.playAt("beam", e.from, e.heavy ? 1 : 0.6);
      } else if (e.kind === "melee") {
        const s = this.sim.soldiers[e.attacker];
        if (s) this.playAt("melee", s.pos, 0.7);
      } else if (e.kind === "shot") {
        const s = this.sim.soldiers[e.shooter];
        if (!s) continue;
        const era = s.unit.era;
        this.playAt(era === "modern" || era === "futuristic" ? "gun" : era === "fantastical" ? "magic" : "bow", s.pos, 0.6);
      }
    }
  }

  /** Battle sounds fade with distance from the camera and get quieter at high speed, when there are many more of them. */
  private playAt(kind: SoundKind, at: { x: number; y: number; z: number }, gain = 1): void {
    const distance = this.camera.position.distanceTo(new Vector3(at.x, at.y, at.z));
    const falloff = Math.min(1, Math.max(0, 1.3 - distance / 80));
    sound.play(kind, gain * falloff * (this.speed > 1 ? 1 / Math.sqrt(this.speed) : 1));
  }

  setQuality(quality: GraphicsQuality): void {
    applyQuality(this.renderer, this.scene, quality);
    this.resize();
  }

  private spawnExplosion(at: { x: number; y: number; z: number }, radius: number, magic: boolean): void {
    const material = new MeshBasicMaterial({ color: magic ? "#ff7a1a" : "#ffcf6b", transparent: true, opacity: 0.85, depthWrite: false });
    const ball = new Mesh(G.sphere, material);
    ball.position.set(at.x, at.y, at.z);
    this.scene.add(ball);
    const dustMaterial = new MeshBasicMaterial({ color: "#8a7a62", transparent: true, opacity: 0.5, depthWrite: false });
    const dust = new Mesh(G.sphere, dustMaterial);
    dust.position.set(at.x, at.y, at.z);
    this.scene.add(dust);
    const group = new Group();
    this.effects.push({
      object: group,
      age: 0,
      life: 0.9,
      update: (t) => {
        ball.scale.setScalar(radius * (0.3 + t * 0.9));
        material.opacity = 0.85 * Math.max(0, 1 - t * 2.2);
        dust.scale.set(radius * (0.5 + t * 1.2), radius * (0.3 + t * 0.5), radius * (0.5 + t * 1.2));
        dustMaterial.opacity = 0.45 * (1 - t);
      },
      dispose: () => {
        this.scene.remove(ball, dust);
        material.dispose();
        dustMaterial.dispose();
      },
    });
  }

  private spawnBeam(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, heavy: boolean): void {
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const material = new MeshBasicMaterial({ color: heavy ? "#c9f6ff" : "#5ff0ff", transparent: true, opacity: 0.95, depthWrite: false });
    const beam = new Mesh(G.cylinder, material);
    const length = a.distanceTo(b);
    beam.position.copy(a).add(b).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    const width = heavy ? 0.16 : 0.05;
    beam.scale.set(width, length, width);
    this.scene.add(beam);
    this.effects.push({
      object: beam,
      age: 0,
      life: heavy ? 0.35 : 0.15,
      update: (t) => {
        material.opacity = 0.95 * (1 - t);
        beam.scale.x = beam.scale.z = width * (1 + t);
      },
      dispose: () => {
        this.scene.remove(beam);
        material.dispose();
      },
    });
  }

  private updateEffects(dt: number): void {
    for (const e of this.effects) {
      e.age += dt;
      e.update(Math.min(1, e.age / e.life));
    }
    const done = this.effects.filter((e) => e.age >= e.life);
    for (const e of done) e.dispose?.();
    this.effects = this.effects.filter((e) => e.age < e.life);
  }

  // ---------- Camera and input ----------

  private updateCamera(): void {
    const f = this.followed;
    if (!f) return;
    const target = new Vector3(f.pos.x, f.pos.y, f.pos.z);
    const delta = target.clone().sub(this.controls.target).multiplyScalar(0.12);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    if (!down || e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.scene.children, true).find((h) => h.object.userData.soldier !== undefined || h.object.userData.ground);
    const id = hit?.object.userData.soldier as number | undefined;
    this.follow(id === undefined ? null : (this.sim.soldiers[id] ?? null));
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
