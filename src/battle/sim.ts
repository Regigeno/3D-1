import type { Collider, RigidBody, World } from "@dimforge/rapier3d-deterministic-compat";
import { Rng, TYPE_BONUS, damageMultiplier, unitFor, type BattleResult, type PendingBattle, type Terrain, type UnitDef } from "../engine";
import { FIELD_LENGTH, FIELD_WIDTH, buildArena, groundHeight, type ArenaLayout } from "./arena";
import { deploy } from "./deploy";
import { battleProfile, type BattleProfile } from "./profiles";
import type { Rapier } from "./rapier";

/** Fixed physics step. Watching and skipping run exactly the same steps, so they agree. */
export const STEP_SECONDS = 1 / 30;
/** On timeout the defender holds the province. */
export const MAX_BATTLE_SECONDS = 120;
const GRAVITY = 9.81;

const RETARGET_TICKS = 12;
/** Defending melee units hold their line until the enemy is this close, or this much time has passed. */
const HOLD_RANGE = 22;
const HOLD_SECONDS = 10;
/** Melee can reach targets up to this far above or below. Drones fly out of reach. */
const MELEE_VERTICAL_REACH = 3.5;
/** A side routs when its remaining strength drops below this while the enemy still has plenty. */
const ROUT_BELOW = 0.12;
const ROUT_ENEMY_ABOVE = 0.4;
const ROUT_AFTER_SECONDS = 8;
const CORPSE_SETTLE_SECONDS = 6;

// Collision groups: membership in the high 16 bits, filter in the low 16 bits.
const G_ARENA = 0x1;
const G_SOLDIER = 0x2;
const G_CORPSE = 0x4;
const G_PROJECTILE = 0x8;
const groups = (member: number, filter: number) => (member << 16) | filter;

export type Side = 0 | 1;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat extends Vec3 {
  w: number;
}

export interface Soldier {
  id: number;
  side: Side;
  squad: number;
  unit: UnitDef;
  profile: BattleProfile;
  body: RigidBody;
  collider: Collider;
  hp: number;
  alive: boolean;
  /** Heading in radians around +y; 0 faces +z. */
  facing: number;
  cooldown: number;
  target: Soldier | null;
  retarget: number;
  stun: number;
  diedAt: number;
  settled: boolean;
  /** Seconds since the last attack, for animation. */
  sinceAttack: number;
  prev: Vec3;
  pos: Vec3;
  rot: Quat;
}

export interface Projectile {
  id: number;
  side: Side;
  unit: UnitDef;
  style: "missile" | "lob";
  radius: number;
  splash: number;
  body: RigidBody | null;
  launchSpeed: number;
  flight: number;
  age: number;
  prev: Vec3;
  pos: Vec3;
  vel: Vec3;
  /** Seconds a spent arrow keeps lying on the ground. */
  stuckFor: number;
  done: boolean;
}

export type BattleEffect =
  | { kind: "melee"; attacker: number; target: number }
  | { kind: "shot"; projectile: number; shooter: number }
  | { kind: "beam"; shooter: number; from: Vec3; to: Vec3; heavy: boolean }
  | { kind: "explosion"; at: Vec3; radius: number; magic: boolean }
  | { kind: "hit"; at: Vec3; soldier: number }
  | { kind: "death"; soldier: number };

export type EndReason = "wiped-out" | "rout" | "timeout";

const ZERO: Quat = { x: 0, y: 0, z: 0, w: 1 };

export class BattleSim {
  readonly arena: ArenaLayout;
  readonly soldiers: Soldier[] = [];
  projectiles: Projectile[] = [];
  /** What happened during the last step, for the battle view. */
  effects: BattleEffect[] = [];
  time = 0;
  tick = 0;
  done = false;
  winner: "attacker" | "defender" | null = null;
  reason: EndReason | null = null;

  private readonly world: World;
  private readonly rng: Rng;
  private readonly reversed: Soldier[];
  private readonly initialStrength: [number, number] = [0, 0];
  private nextProjectileId = 1;
  private disposed = false;

  constructor(
    private readonly R: Rapier,
    readonly battle: PendingBattle,
    terrain: Terrain,
  ) {
    this.rng = new Rng(battle.seed);
    this.arena = buildArena(terrain, battle.seed, !!battle.fortified);
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP_SECONDS;
    this.buildArenaColliders();
    this.spawn(0, battle.attacker.squads);
    this.spawn(1, battle.defender.squads);
    this.reversed = [...this.soldiers].reverse();
  }

  // ---------- Setup ----------

  private buildArenaColliders(): void {
    const { R, world } = this;
    const arenaGroups = groups(G_ARENA, 0xffff);
    const add = (desc: ReturnType<typeof R.ColliderDesc.cuboid>) => world.createCollider(desc.setCollisionGroups(arenaGroups).setFriction(0.8));
    add(R.ColliderDesc.cuboid(FIELD_WIDTH / 2 + 20, 1, FIELD_LENGTH / 2 + 20).setTranslation(0, -1, 0));
    for (const m of this.arena.mounds) add(R.ColliderDesc.ball(m.radius).setTranslation(m.x, m.height - m.radius, m.z));
    for (const o of this.arena.obstacles) {
      if (o.kind === "tree") add(R.ColliderDesc.cylinder(o.height / 2, o.radius).setTranslation(o.x, o.height / 2, o.z));
      else if (o.kind === "rock") add(R.ColliderDesc.ball(o.radius).setTranslation(o.x, o.radius * 0.35, o.z));
      else add(R.ColliderDesc.cuboid(o.halfLength, o.height / 2, 0.3).setTranslation(o.x, o.height / 2, o.z));
    }
    // Invisible walls keep everyone, alive or flung, on the field.
    const w = FIELD_WIDTH / 2;
    const l = FIELD_LENGTH / 2;
    add(R.ColliderDesc.cuboid(1, 10, l + 1).setTranslation(-w - 1, 10, 0));
    add(R.ColliderDesc.cuboid(1, 10, l + 1).setTranslation(w + 1, 10, 0));
    add(R.ColliderDesc.cuboid(w + 1, 10, 1).setTranslation(0, 10, -l - 1));
    add(R.ColliderDesc.cuboid(w + 1, 10, 1).setTranslation(0, 10, l + 1));
  }

  private spawn(side: Side, squads: PendingBattle["attacker"]["squads"]): void {
    const { R, world } = this;
    for (const place of deploy(squads, side === 0 ? -1 : 1)) {
      const squad = squads[place.squad]!;
      const unit = unitFor(squad.type, squad.era);
      const profile = battleProfile(unit);
      const y = groundHeight(this.arena, place.x, place.z) + profile.flyHeight + profile.halfHeight + profile.radius + 0.05;
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(place.x, y, place.z)
          .lockRotations()
          .setGravityScale(profile.flyHeight > 0 ? 0 : 1)
          .setCanSleep(false),
      );
      const collider = world.createCollider(
        R.ColliderDesc.capsule(profile.halfHeight, profile.radius)
          .setMass(unit.mass)
          // Living soldiers are steered by velocity, so friction would only fight the steering.
          .setFriction(0)
          .setFrictionCombineRule(R.CoefficientCombineRule.Min)
          .setCollisionGroups(groups(G_SOLDIER, G_ARENA | G_SOLDIER)),
        body,
      );
      const pos = { x: place.x, y, z: place.z };
      this.soldiers.push({
        id: this.soldiers.length,
        side,
        squad: place.squad,
        unit,
        profile,
        body,
        collider,
        hp: unit.health,
        alive: true,
        facing: side === 0 ? 0 : Math.PI,
        cooldown: this.rng.range(0, unit.weapon.cooldown),
        target: null,
        retarget: 0,
        stun: 0,
        diedAt: 0,
        settled: false,
        sinceAttack: 99,
        prev: pos,
        pos,
        rot: ZERO,
      });
      this.initialStrength[side] += unit.health;
    }
  }

  // ---------- Stepping ----------

  step(): void {
    if (this.done) return;
    this.effects = [];
    for (const s of this.soldiers) s.prev = s.pos;

    const order = this.tick % 2 === 0 ? this.soldiers : this.reversed;
    for (const s of order) if (s.alive) this.think(s);

    this.world.step();

    for (const s of this.soldiers) {
      if (s.settled) continue;
      const t = s.body.translation();
      s.pos = { x: t.x, y: t.y, z: t.z };
      if (!s.alive) {
        const r = s.body.rotation();
        s.rot = { x: r.x, y: r.y, z: r.z, w: r.w };
      }
    }
    this.updateProjectiles();
    this.settleCorpses();

    this.time += STEP_SECONDS;
    this.tick++;
    this.checkEnd();
  }

  /** Steps until the battle is over. Returns the result. */
  runToEnd(): BattleResult {
    const maxSteps = Math.ceil(MAX_BATTLE_SECONDS / STEP_SECONDS) + 2;
    for (let i = 0; i < maxSteps && !this.done; i++) this.step();
    return this.result();
  }

  result(): BattleResult {
    const survivors = (side: Side, count: number) => {
      const list = Array.from({ length: count }, () => 0);
      for (const s of this.soldiers) if (s.side === side && s.alive) list[s.squad]!++;
      return list;
    };
    return {
      winner: this.winner ?? "defender",
      attackerSurvivors: survivors(0, this.battle.attacker.squads.length),
      defenderSurvivors: survivors(1, this.battle.defender.squads.length),
    };
  }

  aliveCount(side: Side): number {
    let n = 0;
    for (const s of this.soldiers) if (s.side === side && s.alive) n++;
    return n;
  }

  totalCount(side: Side): number {
    let n = 0;
    for (const s of this.soldiers) if (s.side === side) n++;
    return n;
  }

  /** Frees the physics world. The sim cannot be stepped afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.done = true;
    this.world.free();
  }

  // ---------- Soldier behavior ----------

  private think(s: Soldier): void {
    s.cooldown -= STEP_SECONDS;
    s.stun -= STEP_SECONDS;
    s.sinceAttack += STEP_SECONDS;
    if (--s.retarget <= 0 || !s.target?.alive) {
      // Stay on a target that is already in reach; otherwise look again.
      if (!s.target?.alive || !this.inReach(s, s.target)) s.target = this.pickTarget(s);
      s.retarget = RETARGET_TICKS + (s.id % 7);
    }

    let wantX = 0;
    let wantZ = 0;
    let swoop = false;
    const t = s.target;
    if (t) {
      const dx = t.pos.x - s.pos.x;
      const dz = t.pos.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      const melee = s.profile.attack === "melee";
      if (dist > 0.01) s.facing = Math.atan2(dx, dz);
      if (melee && s.profile.flyHeight > 0 && dist < this.reach(s, t) + 6) swoop = true;
      if (this.inReach(s, t)) {
        if (s.cooldown <= 0 && s.stun <= 0) this.attack(s, t, dist);
      } else if (!(s.side === 1 && melee && this.time < HOLD_SECONDS && dist > HOLD_RANGE) && s.profile.speed > 0) {
        wantX = (dx / dist) * s.profile.speed;
        wantZ = (dz / dist) * s.profile.speed;
      }
    }
    if (wantX !== 0 || wantZ !== 0) [wantX, wantZ] = this.avoidObstacles(s, wantX, wantZ);
    this.steer(s, wantX, wantZ, swoop);
  }

  private reach(s: Soldier, t: Soldier): number {
    return s.profile.attack === "melee" ? s.unit.weapon.range + s.profile.radius + t.profile.radius : s.unit.weapon.range;
  }

  private inReach(s: Soldier, t: Soldier): boolean {
    const dist = Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z);
    if (dist > this.reach(s, t)) return false;
    return s.profile.attack !== "melee" || Math.abs(t.pos.y - s.pos.y) <= MELEE_VERTICAL_REACH;
  }

  private pickTarget(s: Soldier): Soldier | null {
    const melee = s.profile.attack === "melee";
    let best: Soldier | null = null;
    let bestScore = Infinity;
    for (const e of this.soldiers) {
      if (!e.alive || e.side === s.side) continue;
      // Ground melee cannot reach a hovering shooter such as a drone.
      if (melee && s.profile.flyHeight === 0 && e.profile.flyHeight > MELEE_VERTICAL_REACH && e.profile.attack !== "melee") continue;
      const counter = TYPE_BONUS[s.unit.type][e.unit.type] ?? 1;
      const preference = 1 + (counter - 1) * (melee ? 1 : 2.5);
      // Finish off the wounded rather than spreading damage thin.
      const focus = 0.6 + 0.4 * Math.max(0, e.hp / e.unit.health);
      const score = (Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) * focus) / preference;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private avoidObstacles(s: Soldier, wantX: number, wantZ: number): [number, number] {
    let x = wantX;
    let z = wantZ;
    for (const o of this.arena.obstacles) {
      const ox = o.kind === "wall" ? Math.min(Math.max(s.pos.x, o.x - o.halfLength), o.x + o.halfLength) : o.x;
      const oz = o.z;
      const radius = o.kind === "wall" ? 0.3 : o.radius;
      const rx = s.pos.x - ox;
      const rz = s.pos.z - oz;
      const d = Math.hypot(rx, rz);
      const gap = d - radius - s.profile.radius;
      if (gap > 2 || d < 1e-4) continue;
      const nx = rx / d;
      const nz = rz / d;
      if (nx * wantX + nz * wantZ >= 0) continue;
      const sign = -nz * wantX + nx * wantZ >= 0 ? 1 : -1;
      const w = ((2 - Math.max(gap, 0)) / 2) * s.profile.speed;
      x += -nz * sign * w + nx * w * 0.3;
      z += nx * sign * w + nz * w * 0.3;
    }
    const m = Math.hypot(x, z);
    return m > s.profile.speed ? [(x / m) * s.profile.speed, (z / m) * s.profile.speed] : [x, z];
  }

  private steer(s: Soldier, wantX: number, wantZ: number, swoop: boolean): void {
    const v = s.body.linvel();
    let vx = v.x;
    let vz = v.z;
    if (s.stun <= 0) {
      const maxDv = s.profile.accel * STEP_SECONDS;
      let ax = wantX - v.x;
      let az = wantZ - v.z;
      const m = Math.hypot(ax, az);
      if (m > maxDv) {
        ax *= maxDv / m;
        az *= maxDv / m;
      }
      vx += ax;
      vz += az;
    }
    let vy = v.y;
    if (s.profile.flyHeight > 0) {
      const height = swoop ? 0.6 : s.profile.flyHeight;
      const targetY = groundHeight(this.arena, s.pos.x, s.pos.z) + height + s.profile.halfHeight + s.profile.radius;
      vy = Math.max(-6, Math.min(6, (targetY - s.pos.y) * 2.5));
    }
    s.body.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  // ---------- Attacks ----------

  private damageRoll(attacker: UnitDef, target: UnitDef): number {
    return attacker.weapon.damage * damageMultiplier(attacker, target) * this.rng.range(0.85, 1.15);
  }

  private attack(s: Soldier, t: Soldier, dist: number): void {
    s.cooldown = s.unit.weapon.cooldown * this.rng.range(0.9, 1.1);
    s.sinceAttack = 0;
    switch (s.profile.attack) {
      case "melee":
        this.melee(s, t, dist);
        break;
      case "missile":
      case "lob":
        this.fire(s, t, dist);
        break;
      case "beam":
        this.beam(s, t, false);
        break;
      case "pierce":
        this.beam(s, t, true);
        break;
    }
  }

  private melee(s: Soldier, t: Soldier, dist: number): void {
    const dx = (t.pos.x - s.pos.x) / Math.max(dist, 1e-3);
    const dz = (t.pos.z - s.pos.z) / Math.max(dist, 1e-3);
    const ratio = Math.min(1.5, Math.sqrt(s.unit.mass / t.unit.mass));
    const strike = (target: Soldier, share: number) => {
      const damage = this.damageRoll(s.unit, target.unit) * share;
      const strength = (1 + 3 * Math.min(1, damage / target.unit.health)) * ratio;
      this.hurt(target, damage, dx, dz, strength);
    };
    this.effects.push({ kind: "melee", attacker: s.id, target: t.id });
    strike(t, 1);
    // Big beasts and machines sweep everyone in front of them.
    if (s.profile.splash > 0) {
      for (const o of this.soldiers) {
        if (o === t || !o.alive || o.side === s.side) continue;
        if (Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) <= s.profile.splash) strike(o, 0.5);
      }
    }
  }

  private muzzle(s: Soldier): Vec3 {
    const up = s.unit.type === "artillery" ? s.profile.halfHeight + s.profile.radius + 1.2 : s.profile.halfHeight * 0.8;
    return {
      x: s.pos.x + Math.sin(s.facing) * s.profile.radius,
      y: s.pos.y + up,
      z: s.pos.z + Math.cos(s.facing) * s.profile.radius,
    };
  }

  private fire(s: Soldier, t: Soldier, dist: number): void {
    const style = s.profile.attack === "lob" ? "lob" : "missile";
    const from = this.muzzle(s);
    const flight = style === "lob" ? 1.3 + dist / 28 : Math.min(2.5, Math.max(0.08, dist / s.profile.muzzleSpeed));
    const tv = t.body.linvel();
    const spread = dist * (style === "lob" ? 0.06 : 0.035);
    const aim = {
      x: t.pos.x + tv.x * flight * 0.8 + this.rng.range(-spread, spread),
      y: t.pos.y,
      z: t.pos.z + tv.z * flight * 0.8 + this.rng.range(-spread, spread),
    };
    const vel = {
      x: (aim.x - from.x) / flight,
      y: (aim.y - from.y) / flight + 0.5 * GRAVITY * flight,
      z: (aim.z - from.z) / flight,
    };
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.dynamic().setTranslation(from.x, from.y, from.z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true).setCanSleep(false),
    );
    this.world.createCollider(
      this.R.ColliderDesc.ball(s.profile.projectileRadius).setMass(style === "lob" ? 20 : 0.2).setCollisionGroups(groups(G_PROJECTILE, G_ARENA)),
      body,
    );
    const id = this.nextProjectileId++;
    this.projectiles.push({
      id,
      side: s.side,
      unit: s.unit,
      style,
      radius: s.profile.projectileRadius,
      splash: s.profile.splash,
      body,
      launchSpeed: Math.hypot(vel.x, vel.y, vel.z),
      flight,
      age: 0,
      prev: from,
      pos: from,
      vel,
      stuckFor: 0,
      done: false,
    });
    this.effects.push({ kind: "shot", projectile: id, shooter: s.id });
  }

  private beam(s: Soldier, t: Soldier, heavy: boolean): void {
    const from = this.muzzle(s);
    const dx = t.pos.x - from.x;
    const dy = t.pos.y - from.y;
    const dz = t.pos.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const hx = dx / Math.hypot(dx, dz || 1e-3);
    const hz = dz / Math.hypot(dx || 1e-3, dz);
    if (!heavy) {
      this.hurt(t, this.damageRoll(s.unit, t.unit), hx, hz, 1.2);
      this.effects.push({ kind: "beam", shooter: s.id, from, to: { ...t.pos }, heavy });
      return;
    }
    // A railgun slug punches through everyone on its line, losing a little each time.
    const range = s.unit.weapon.range;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    const to = { x: from.x + ux * range, y: from.y + uy * range, z: from.z + uz * range };
    const hits = this.soldiers
      .filter((o) => o.alive && o.side !== s.side)
      .map((o) => {
        const rx = o.pos.x - from.x;
        const ry = o.pos.y - from.y;
        const rz = o.pos.z - from.z;
        const along = rx * ux + ry * uy + rz * uz;
        const off = Math.hypot(rx - ux * along, ry - uy * along, rz - uz * along);
        return { o, along, off };
      })
      .filter((h) => h.along > 0 && h.along < range && h.off < h.o.profile.radius + 0.5)
      .sort((a, b) => a.along - b.along || a.o.id - b.o.id);
    let share = 1;
    for (const h of hits) {
      this.hurt(h.o, this.damageRoll(s.unit, h.o.unit) * share, ux, uz, 3);
      share *= 0.7;
    }
    this.effects.push({ kind: "beam", shooter: s.id, from, to, heavy });
  }

  private hurt(t: Soldier, amount: number, dirX: number, dirZ: number, strength: number): void {
    if (!t.alive) return;
    t.hp -= amount;
    const killed = t.hp <= 0;
    const mass = t.body.mass();
    const push = killed ? strength * 1.6 + 1 : strength;
    t.body.applyImpulse({ x: dirX * push * mass, y: push * 0.45 * mass, z: dirZ * push * mass }, true);
    if (push > 2.5) t.stun = Math.max(t.stun, 0.25 + push * 0.05);
    this.effects.push({ kind: "hit", at: { ...t.pos }, soldier: t.id });
    if (killed) this.kill(t, dirX, dirZ, push);
  }

  private kill(t: Soldier, dirX: number, dirZ: number, push: number): void {
    t.alive = false;
    t.diedAt = this.time;
    t.target = null;
    t.body.setEnabledRotations(true, true, true, true);
    t.body.setGravityScale(1, true);
    t.body.setLinearDamping(0.3);
    t.body.setAngularDamping(0.8);
    t.collider.setCollisionGroups(groups(G_CORPSE, G_ARENA));
    t.collider.setFriction(0.7);
    t.collider.setFrictionCombineRule(this.R.CoefficientCombineRule.Average);
    const mass = t.body.mass();
    const k = mass * (t.profile.radius + t.profile.halfHeight) * (0.8 + push * 0.25);
    t.body.applyTorqueImpulse({ x: dirZ * k, y: this.rng.range(-0.3, 0.3) * k, z: -dirX * k }, true);
    this.effects.push({ kind: "death", soldier: t.id });
  }

  // ---------- Projectiles ----------

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (p.done) continue;
      if (!p.body) {
        p.stuckFor -= STEP_SECONDS;
        if (p.stuckFor <= 0) p.done = true;
        continue;
      }
      const t = p.body.translation();
      const v = p.body.linvel();
      p.prev = p.pos;
      p.pos = { x: t.x, y: t.y, z: t.z };
      p.vel = { x: v.x, y: v.y, z: v.z };
      p.age += STEP_SECONDS;

      const hit = this.sweepHit(p);
      const grounded = p.pos.y <= groundHeight(this.arena, p.pos.x, p.pos.z) + p.radius + 0.05;
      const blocked = Math.hypot(v.x, v.y, v.z) < p.launchSpeed * 0.3;

      if (p.style === "lob") {
        if (hit || grounded || blocked || p.age > p.flight + 1.5) this.explode(p);
        continue;
      }
      if (hit) {
        const h = Math.hypot(v.x, v.z) || 1;
        this.hurt(hit, this.damageRoll(p.unit, hit.unit), v.x / h, v.z / h, 1 + Math.min(2, p.radius * 6));
        this.removeProjectileBody(p);
        p.done = true;
      } else if (grounded || blocked || p.age > 4) {
        this.removeProjectileBody(p);
        p.stuckFor = 2;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  private removeProjectileBody(p: Projectile): void {
    if (p.body) this.world.removeRigidBody(p.body);
    p.body = null;
  }

  /** The first enemy whose capsule the projectile passed through during the last step. */
  private sweepHit(p: Projectile): Soldier | null {
    const dx = p.pos.x - p.prev.x;
    const dy = p.pos.y - p.prev.y;
    const dz = p.pos.z - p.prev.z;
    const len = Math.hypot(dx, dy, dz);
    const samples = Math.max(1, Math.ceil(len / 0.35));
    const minX = Math.min(p.pos.x, p.prev.x) - 3;
    const maxX = Math.max(p.pos.x, p.prev.x) + 3;
    const minZ = Math.min(p.pos.z, p.prev.z) - 3;
    const maxZ = Math.max(p.pos.z, p.prev.z) + 3;
    const near = this.soldiers.filter((s) => s.alive && s.side !== p.side && s.pos.x > minX && s.pos.x < maxX && s.pos.z > minZ && s.pos.z < maxZ);
    if (near.length === 0) return null;
    for (let i = 1; i <= samples; i++) {
      const f = i / samples;
      const x = p.prev.x + dx * f;
      const y = p.prev.y + dy * f;
      const z = p.prev.z + dz * f;
      for (const s of near) {
        const flat = Math.hypot(x - s.pos.x, z - s.pos.z);
        const vertical = Math.max(0, Math.abs(y - s.pos.y) - s.profile.halfHeight);
        if (Math.hypot(flat, vertical) <= s.profile.radius + p.radius) return s;
      }
    }
    return null;
  }

  private explode(p: Projectile): void {
    const at = p.pos;
    const radius = p.splash;
    for (const s of this.soldiers) {
      if (s.settled) continue;
      const rx = s.pos.x - at.x;
      const rz = s.pos.z - at.z;
      const d = Math.hypot(rx, rz, (s.pos.y - at.y) * 0.5);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.6;
      const flat = Math.hypot(rx, rz) || 1;
      const nx = rx / flat;
      const nz = rz / flat;
      if (s.alive && s.side !== p.side) {
        this.hurt(s, this.damageRoll(p.unit, s.unit) * falloff, nx, nz, 6 * falloff);
      } else {
        const mass = s.body.mass();
        const push = (s.alive ? 2.5 : 5) * falloff;
        s.body.applyImpulse({ x: nx * push * mass, y: push * 0.8 * mass, z: nz * push * mass }, true);
      }
    }
    this.effects.push({ kind: "explosion", at: { ...at }, radius, magic: p.unit.era === "fantastical" });
    this.removeProjectileBody(p);
    p.done = true;
  }

  private settleCorpses(): void {
    for (const s of this.soldiers) {
      if (s.alive || s.settled || this.time - s.diedAt < CORPSE_SETTLE_SECONDS) continue;
      s.settled = true;
      s.body.setBodyType(this.R.RigidBodyType.Fixed, false);
    }
  }

  // ---------- Ending ----------

  private strength(side: Side): number {
    let n = 0;
    for (const s of this.soldiers) if (s.side === side && s.alive) n += s.unit.health;
    return n / Math.max(1, this.initialStrength[side]);
  }

  private checkEnd(): void {
    const attackers = this.aliveCount(0);
    const defenders = this.aliveCount(1);
    if (attackers === 0 || defenders === 0) {
      this.finish(defenders === 0 && attackers > 0 ? "attacker" : "defender", "wiped-out");
      return;
    }
    if (this.time >= ROUT_AFTER_SECONDS) {
      const a = this.strength(0);
      const d = this.strength(1);
      if (a < ROUT_BELOW && d > ROUT_ENEMY_ABOVE) return this.finish("defender", "rout");
      if (d < ROUT_BELOW && a > ROUT_ENEMY_ABOVE) return this.finish("attacker", "rout");
    }
    if (this.time >= MAX_BATTLE_SECONDS) this.finish("defender", "timeout");
  }

  private finish(winner: "attacker" | "defender", reason: EndReason): void {
    this.done = true;
    this.winner = winner;
    this.reason = reason;
  }
}

/** Runs a whole battle without rendering. Same steps as watching it, so the same result. */
export function simulateBattle(R: Rapier, battle: PendingBattle, terrain: Terrain): BattleResult {
  const sim = new BattleSim(R, battle, terrain);
  try {
    return sim.runToEnd();
  } finally {
    sim.dispose();
  }
}
