import * as THREE from "./three.js";
import { P } from "./player/config.js";

export const TRICK_POINTS = {
  "OLLIE": 60, "SHUVIT": 110, "KICKFLIP": 140, "HEELFLIP": 140,
  "360 SHUVIT": 240, "BODY VARIAL": 300,
  "INDY": 160, "MELON": 160, "TAILGRAB": 200, "NOSEGRAB": 200, "METHOD": 260,
  "MUTE": 220, "STRAIGHT AIR": 120, "BACKFLIP": 320,
  "BACKSIDE 360": 240, "720": 380, "CORKSCREW": 420,
};
export const MULT_STEP = 2;
export const MULT_MAX = 20;
export const CHAIN_T = 2.6;
export const TAG_HOLD = 0.30;
export const TAG_FLY = 0.62;
export const STILL_V = 0.8;
export const STILL_T = 1.2;

export function hypeLevel(v) {
  return v <= 0 ? 0 : Math.floor(Math.pow(v / 400, 0.72));
}
export const HYPE_COLORS = ["#63e0b4", "#ffd75a", "#ff9a3c", "#ff5a5a", "#c07aff", "#5ad8ff", "#fff2a8"];

const _v = new THREE.Vector3();

export class TrickScore {
  constructor() {
    this.banked = 0;
    this.shown = 0;
    this.mult = 1;
    this.comboCount = 0;
    this.chainT = 0;
    this.tags = [];
    this.lastName = null;
  }
  land(name) {
    const base = TRICK_POINTS[name] || 100;
    this.lastName = name;
    // Multiplier logic: 1st trick is 1x. If another trick lands while chainT is active,
    // combo increments: 2 tricks = 2x, 3 tricks = 3x, etc.
    if (this.chainT > 0) {
      this.comboCount = (this.comboCount || 1) + 1;
      this.mult = Math.min(MULT_MAX, this.comboCount);
    } else {
      this.comboCount = 1;
      this.mult = 1;
    }
    this.chainT = CHAIN_T;
    const pts = base * this.mult;
    this.banked += pts;
    return pts;
  }
  resetChain() {
    this.mult = 1;
    this.comboCount = 0;
    this.chainT = 0;
  }
  fullReset() {
    this.banked = 0;
    this.shown = 0;
    this.mult = 1;
    this.comboCount = 0;
    this.chainT = 0;
    this.stillT = 0;
    this.lastName = null;
    for (const tag of this.tags) tag.el.remove();
    this.tags.length = 0;
  }
  spawnTag(name, pts, mult) {
    // 3D in-world trick tags in tricktext3d.js handle the visuals and flight to score HUD
  }
  project(player, camera) {
    _v.set(player.pos.x, player.pos.y - P.HY + 1.1, player.pos.z).project(camera);
    if (_v.z > 1) return null;
    return {
      x: (_v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }
  tick(dt, player, camera) {
    if (this.chainT > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) this.resetChain();
    }
    if (this.shown !== this.banked) {
      const d = this.banked - this.shown;
      const step = Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 5)));
      this.shown += Math.sign(d) * Math.min(Math.abs(d), step);
    }
    const board = document.getElementById("boardScore");
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      tag.t += dt;
      if (!tag.flying) {
        const p = this.project(player, camera);
        if (!p) {
          this.banked += tag.pts;
          tag.el.remove();
          this.tags.splice(i, 1);
          continue;
        }
        tag.el.style.left = Math.round(p.x + tag.ox) + "px";
        tag.el.style.top = Math.round(p.y + tag.oy) + "px";
        tag.el.style.opacity = "1";
        if (tag.t >= TAG_HOLD && board) {
          const r = board.getBoundingClientRect();
          const dx = r.left + r.width / 2 - (p.x + tag.ox);
          const dy = r.top + r.height / 2 - (p.y + tag.oy);
          tag.el.style.transform = "translate(" + Math.round(dx) + "px," + Math.round(dy) + "px)";
          tag.flying = true;
          tag.t = 0;
        }
      } else if (tag.t >= TAG_FLY) {
        this.banked += tag.pts;
        tag.el.remove();
        this.tags.splice(i, 1);
      }
    }
  }
}
