import { MAP_HEIGHT, MAP_WIDTH, SAFE_ZONE, inSafeZone, type Point } from "../shared/map";
import { hasLineOfSight } from "../shared/physics";
import type { InputFrame } from "../shared/protocol";
import { WEAPONS, type WeaponId } from "../shared/archetypes";
import type { Match, PlayerState } from "./match";
import { findPath, isOpen } from "./nav";

const VIEW_RANGE = 1300;

const PREFERRED_RANGE: Record<WeaponId, number> = {
  chalk: 520,
  stapler: 300,
  food: 480,
  tots: 280,
  dodgeball: 260,
  tennis: 400,
  paint: 170,
  crayon: 450,
  rubberband: 320,
  pencil: 400,
  spitball: 800,
  peashooter: 400,
  eraser: 450,
  redpen: 350,
  quiz: 400,
  lecture: 200,
  meatball: 400,
  pie: 450,
  tackle: 200,
  paintbomb: 200,
  berry: 420,
  bigberry: 280,
  berryblast: 450,
  rollout: 250,
  jam: 250,
  seeds: 380,
  wedge: 450,
  squirt: 300,
  peel: 150,
  bigorange: 450,
  segment: 300,
  tuba: 380,
  trombone: 300,
  drumsticks: 360,
  cymbal: 380,
  trumpet: 500,
  fanfare: 220,
  reed: 650,
  piccolo: 300,
  violin: 400,
  pizzicato: 230,
  viola: 450,
  tremolo: 300,
  cello: 480,
  spiccato: 250,
  doublebass: 400,
  slap: 380,
  note: 450,
};

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

export class BotBrain {
  private targetId: string | null = null;
  private acquiredAt = 0;
  private reaction = 0.3;
  private aimError = 0;
  private nextAimError = 0;

  private path: Point[] = [];
  private goal: Point | null = null;
  private nextRepath = 0;
  private roamUntil = 0;

  private strafe = Math.random() < 0.5 ? 1 : -1;
  private nextStrafeFlip = 0;

  private stuckFrom: Point = { x: 0, y: 0 };
  private nextStuckCheck = 0;

  private lastSeen: Point | null = null;
  private lastSeenAt = -99;
  private attacker: string | null = null;
  private attackedAt = -99;

  /** Roughly 0.75 (sloppy) to 1.1 (sharp). */
  private readonly skill = rand(0.75, 1.1);

  onDamaged(by: string, time: number) {
    this.attacker = by;
    this.attackedAt = time;
  }

  reset() {
    this.targetId = null;
    this.path = [];
    this.goal = null;
    this.lastSeen = null;
    this.attacker = null;
  }

  think(self: PlayerState, match: Match): InputFrame {
    const t = match.time;
    const input: InputFrame = {
      seq: 0,
      mx: 0,
      my: 0,
      aim: self.aim,
      fire: false,
      reload: false,
      swap: -1,
    };
    if (!self.alive) return input;

    const weapon = WEAPONS[match.currentWeapon(self)];
    const target = this.pickTarget(self, match);
    // Nurse's Office: go heal when hurt and nothing is around; leave once healed or before passing out.
    const inZone = inSafeZone(self.x, self.y);
    const leaveZone = inZone && (self.zoneTime > 18 || self.hp >= self.maxHp);
    // The Principal and the mascots get nothing from the nurse.
    const wantsHeal = !target && !inZone && self.hp < 40 && !match.isBoss(self);

    if (target && target.id !== this.targetId) {
      this.acquiredAt = t;
      this.reaction = rand(0.22, 0.45) / this.skill;
    }
    this.targetId = target?.id ?? null;

    if (target) {
      this.lastSeen = { x: target.x, y: target.y };
      this.lastSeenAt = t;
      const dx = target.x - self.x;
      const dy = target.y - self.y;
      const dist = Math.hypot(dx, dy);

      // Lead the target a little, based on its velocity.
      const lead = (dist / weapon.projectileSpeed) * 0.6;
      const desired = Math.atan2(dy + target.vy * lead, dx + target.vx * lead);

      if (t >= this.nextAimError) {
        const settle = Math.max(0.25, 1 - (t - this.acquiredAt) / 1.5);
        this.aimError = rand(-1, 1) * (0.14 / this.skill) * settle;
        this.nextAimError = t + rand(0.15, 0.35);
      }
      const diff = wrapAngle(desired + this.aimError - self.aim);
      const maxTurn = 7 * this.skill * (1 / 30);
      input.aim = self.aim + Math.max(-maxTurn, Math.min(maxTurn, diff));

      const onTarget = Math.abs(wrapAngle(desired - input.aim)) < 0.18 + weapon.spread;
      input.fire = t - this.acquiredAt > this.reaction && onTarget && dist < weapon.range * 0.95;

      // Out of ammo mid-fight: switch to the sidearm if it is loaded.
      if (self.slot === 0 && self.ammo[0] === 0 && self.ammo[1] > 0 && dist < 600) input.swap = 1;

      // Hold a preferred distance and strafe.
      if (t >= this.nextStrafeFlip) {
        this.strafe = -this.strafe;
        this.nextStrafeFlip = t + rand(0.5, 1.6);
      }
      const ux = dx / (dist || 1);
      const uy = dy / (dist || 1);
      const pref = PREFERRED_RANGE[weapon.id];
      const radial = dist > pref + 80 ? 1 : dist < pref - 80 ? -0.8 : 0;
      input.mx = ux * radial - uy * this.strafe * 0.8;
      input.my = uy * radial + ux * this.strafe * 0.8;
      this.path = [];
      if (leaveZone) this.steerTo(input, self, this.followPath(self, this.chooseGoal(self, match), t));
    } else {
      if (self.slot === 1) input.swap = 0;
      const mag = weapon.magSize;
      if (self.reloadEnd < 0 && self.ammo[self.slot] < mag * 0.6) input.reload = true;

      const zoneCenter = { x: SAFE_ZONE.x + SAFE_ZONE.w / 2, y: SAFE_ZONE.y + SAFE_ZONE.h / 2 };
      const resting = inZone && !leaveZone;
      const goal = wantsHeal || resting ? zoneCenter : this.chooseGoal(self, match);
      const next = resting ? null : this.followPath(self, goal, t);
      if (next) {
        const dx = next.x - self.x;
        const dy = next.y - self.y;
        const d = Math.hypot(dx, dy) || 1;
        input.mx = dx / d;
        input.my = dy / d;
        const look = Math.atan2(dy, dx);
        // Glance toward whoever shot us recently, otherwise look where we're going.
        const attacker = this.attacker ? match.players.get(this.attacker) : undefined;
        const facing =
          attacker && attacker.alive && t - this.attackedAt < 2
            ? Math.atan2(attacker.y - self.y, attacker.x - self.x)
            : look;
        const diff = wrapAngle(facing - self.aim);
        input.aim = self.aim + Math.max(-0.2, Math.min(0.2, diff));
      }
    }

    this.checkStuck(self, input, t);
    return input;
  }

  private steerTo(input: InputFrame, self: PlayerState, next: Point | null) {
    if (!next) return;
    const d = Math.hypot(next.x - self.x, next.y - self.y) || 1;
    input.mx = (next.x - self.x) / d;
    input.my = (next.y - self.y) / d;
  }

  private pickTarget(self: PlayerState, match: Match): PlayerState | null {
    let best: PlayerState | null = null;
    let bestScore = Infinity;
    for (const p of match.players.values()) {
      // Students in detention can't be hurt, so leave them be.
      if (!p.alive || p.team === self.team || match.isJailed(p)) continue;
      const d = Math.hypot(p.x - self.x, p.y - self.y);
      if (d > VIEW_RANGE) continue;
      if (!hasLineOfSight(self.x, self.y, p.x, p.y)) continue;
      // Prefer the current target and whoever is shooting us.
      let score = d;
      if (p.id === this.targetId) score *= 0.7;
      if (p.id === this.attacker && match.time - this.attackedAt < 3) score *= 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private chooseGoal(self: PlayerState, match: Match): Point {
    const t = match.time;
    if (this.lastSeen && t - this.lastSeenAt < 4) return this.lastSeen;
    const attacker = this.attacker ? match.players.get(this.attacker) : undefined;
    if (attacker && attacker.alive && t - this.attackedAt < 3) {
      return { x: attacker.x, y: attacker.y };
    }
    const reached =
      this.goal && Math.hypot(this.goal.x - self.x, this.goal.y - self.y) < 60;
    if (!this.goal || reached || t > this.roamUntil) {
      this.goal = this.randomRoamPoint(self);
      this.path = [];
      this.roamUntil = t + rand(8, 14);
    }
    return this.goal;
  }

  private randomRoamPoint(self: PlayerState): Point {
    for (let i = 0; i < 20; i++) {
      // Rooms are shared, so roam anywhere, but keep moving away from where we are.
      const p = { x: rand(60, MAP_WIDTH - 60), y: rand(60, MAP_HEIGHT - 60) };
      if (Math.hypot(p.x - self.x, p.y - self.y) < 500) continue;
      if (isOpen(p)) return p;
    }
    return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 - 200 };
  }

  private followPath(self: PlayerState, goal: Point, t: number): Point | null {
    const goalMoved =
      !this.goal || this.path.length === 0 || Math.hypot(goal.x - this.goal.x, goal.y - this.goal.y) > 80;
    if (goalMoved || t >= this.nextRepath) {
      this.path = findPath(self, goal);
      this.goal = goal;
      this.nextRepath = t + 1.5;
    }
    while (this.path.length > 0 && Math.hypot(this.path[0].x - self.x, this.path[0].y - self.y) < 24) {
      this.path.shift();
    }
    return this.path[0] ?? null;
  }

  private checkStuck(self: PlayerState, input: InputFrame, t: number) {
    if (t < this.nextStuckCheck) return;
    const moving = Math.hypot(input.mx, input.my) > 0.1;
    const moved = Math.hypot(self.x - this.stuckFrom.x, self.y - this.stuckFrom.y);
    if (moving && moved < 12) {
      this.strafe = -this.strafe;
      this.nextRepath = 0;
      this.goal = null;
    }
    this.stuckFrom = { x: self.x, y: self.y };
    this.nextStuckCheck = t + 0.7;
  }
}
