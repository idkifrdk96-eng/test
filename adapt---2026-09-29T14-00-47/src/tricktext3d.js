import * as THREE from "./three.js";
import { P } from "./player/config.js";

// Vibrant skate palettes matching the game's retro neon PS1 / BRC aesthetic
export const TRICK_COLORS = {
  OLLIE: { c1: "#63e0b4", c2: "#ffffff", border: "#070a0e", shadow: "#092d1c" },
  KICKFLIP: { c1: "#5ad8ff", c2: "#ffffff", border: "#070a0e", shadow: "#0a2e40" },
  HEELFLIP: { c1: "#63e0b4", c2: "#d8fff0", border: "#070a0e", shadow: "#092d1c" },
  SHUVIT: { c1: "#ffd75a", c2: "#ffffff", border: "#070a0e", shadow: "#3e2e05" },
  "360 SHUVIT": { c1: "#ff9a3c", c2: "#fff0b0", border: "#070a0e", shadow: "#4e2105" },
  "BODY VARIAL": { c1: "#c07aff", c2: "#f3e0ff", border: "#070a0e", shadow: "#310d4e" },
  BACKFLIP: { c1: "#ff5a5a", c2: "#ffe0e0", border: "#070a0e", shadow: "#4d0a0a" },
  INDY: { c1: "#5ad8ff", c2: "#ffffff", border: "#070a0e", shadow: "#0a2e40" },
  MELON: { c1: "#63e0b4", c2: "#ffffff", border: "#070a0e", shadow: "#092d1c" },
  METHOD: { c1: "#ffd75a", c2: "#fff5a0", border: "#070a0e", shadow: "#3e2e05" },
  TAILGRAB: { c1: "#ff9a3c", c2: "#ffffff", border: "#070a0e", shadow: "#4e2105" },
  NOSEGRAB: { c1: "#5ad8ff", c2: "#e0ffff", border: "#070a0e", shadow: "#0a2e40" },
  MUTE: { c1: "#c07aff", c2: "#ffffff", border: "#070a0e", shadow: "#310d4e" },
  "STRAIGHT AIR": { c1: "#63e0b4", c2: "#d8fff0", border: "#070a0e", shadow: "#092d1c" },
  "BACKSIDE 360": { c1: "#ff9a3c", c2: "#ffe890", border: "#070a0e", shadow: "#4e2105" },
  "720": { c1: "#ff5a5a", c2: "#fff2a8", border: "#070a0e", shadow: "#4d0a0a" },
  CORKSCREW: { c1: "#c07aff", c2: "#5ad8ff", border: "#070a0e", shadow: "#310d4e" },
  POWERSLIDE: { c1: "#ffd75a", c2: "#ffffff", border: "#070a0e", shadow: "#3e2e05" },
  MANUAL: { c1: "#63e0b4", c2: "#d8fff0", border: "#070a0e", shadow: "#092d1c" },
  BOMB: { c1: "#ff5a5a", c2: "#ff9a3c", border: "#070a0e", shadow: "#4d0a0a" },
};

const DEFAULT_COLOR = { c1: "#63e0b4", c2: "#ffffff", border: "#070a0e", shadow: "#092d1c" };

const _tempVec = new THREE.Vector3();
const _ray = new THREE.Vector3();
const _dest3D = new THREE.Vector3();
const _originVec = new THREE.Vector3();

// Global list of active tags to redraw if font completes late
const activeTags = new Set();

if (typeof document !== "undefined" && document.fonts) {
  document.fonts.load('48px "SwizerStreet"').catch(() => {});
  document.fonts.load('48px "AdaptChunk"').catch(() => {});
  document.fonts.ready.then(() => {
    for (const tag of activeTags) {
      if (!tag.dead) tag.draw();
    }
  });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

class TrickTag3D {
  constructor(scene, player, name, mult, pts, onArrive) {
    this.scene = scene;
    this.name = name;
    this.mult = Math.max(1, mult || 1);
    this.pts = pts || 0;
    this.onArrive = onArrive;

    this.cw = 1024;
    this.ch = 256;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: false });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Hardware Z-Buffer depth testing for initial spawn
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.5,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.PlaneGeometry(2.35, 0.58);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 4;
    this.scene.add(this.mesh);

    // Random spot in the player area (random lateral offset, random height, random depth)
    this.ox = (Math.random() - 0.5) * 1.8;
    this.oy = 0.25 + (Math.random() - 0.5) * 0.9;
    this.oz = (Math.random() - 0.5) * 1.4;

    this.startPos = (player && player.pos) ? player.pos.clone() : new THREE.Vector3();
    this.mesh.position.set(this.startPos.x + this.ox, this.startPos.y + this.oy, this.startPos.z + this.oz);

    // Dynamic street tilt
    this.tilt = (Math.random() - 0.5) * 0.26 - 0.05;

    // Active flight animation: immediately starts moving towards the score HUD
    this.t = 0;
    this.duration = 0.90; // total seconds to fly all the way to HUD
    this.dead = false;

    activeTags.add(this);
    this.draw();
  }

  draw() {
    if (this.dead) return;
    const ctx = this.ctx;
    const w = this.cw;
    const h = this.ch;
    ctx.clearRect(0, 0, w, h);

    const colors = TRICK_COLORS[this.name] || DEFAULT_COLOR;
    const cleanName = (this.name || "TRICK").toUpperCase();

    ctx.save();
    // Energetic forward shear matching the game logo
    ctx.setTransform(1, 0, -0.10, 1, 0, 0);

    const cx = w * 0.48;
    const cy = h * 0.56;

    const len = cleanName.length;
    const fontSize = len > 12 ? 64 : len > 8 ? 74 : 86;
    // Uses the EXACT SAME FONT as the rest of the game: "SwizerStreet", "AdaptChunk"
    // (Normal font-weight: 400 matching the game's @font-face definitions)
    ctx.font = `${fontSize}px "SwizerStreet", "AdaptChunk", monospace, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const displayText = this.pts > 0
      ? `[ ${cleanName} +${this.pts} ]`
      : `[ ${cleanName} ]`;

    // 1. Chunky 3D Drop Extrusion (black / deep shadow)
    ctx.strokeStyle = colors.shadow;
    ctx.lineWidth = 26;
    ctx.lineJoin = "miter";
    ctx.miterLimit = 2.5;
    for (let off = 10; off >= 4; off -= 2) {
      ctx.strokeText(displayText, cx + off * 0.7, cy + off);
    }

    // 2. Thick Outer Black Stroke (PS1 keyline rim)
    ctx.strokeStyle = "#05070a";
    ctx.lineWidth = 22;
    ctx.strokeText(displayText, cx, cy);

    // 3. Crisp Secondary Highlight Stroke
    ctx.strokeStyle = this.pts > 0 ? "#ffffff" : colors.c2;
    ctx.lineWidth = 14;
    ctx.strokeText(displayText, cx, cy);

    // 4. Inner Black Separator Stroke
    ctx.strokeStyle = "#07090c";
    ctx.lineWidth = 6;
    ctx.strokeText(displayText, cx, cy);

    // 5. Vibrant Gradient Fill
    const grad = ctx.createLinearGradient(0, cy - fontSize * 0.6, 0, cy + fontSize * 0.4);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.3, colors.c2);
    grad.addColorStop(0.75, colors.c1);
    grad.addColorStop(1.0, colors.shadow);
    ctx.fillStyle = grad;
    ctx.fillText(displayText, cx, cy);

    // 6. Top Highlight Slash Cut (arcade gloss effect)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, cy - fontSize * 0.65, w, fontSize * 0.38);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillText(displayText, cx, cy);
    ctx.restore();

    // 7. Multiplier Badge Pill (if combo multiplier >= 2)
    if (this.mult >= 2) {
      const badgeText = `×${this.mult}`;
      ctx.font = '48px "SwizerStreet", "AdaptChunk", monospace, sans-serif';
      const mMetrics = ctx.measureText(badgeText);
      const bw = mMetrics.width + 30;
      const bh = 54;
      const bx = cx + (len * (fontSize * 0.28)) + 36;
      const by = cy - fontSize * 0.45;

      ctx.fillStyle = "#07090c";
      ctx.beginPath();
      drawRoundedRect(ctx, bx - bw / 2 + 4, by - bh / 2 + 5, bw, bh, 8);
      ctx.fill();

      ctx.fillStyle = "#ffd75a";
      ctx.beginPath();
      drawRoundedRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 8);
      ctx.fill();

      ctx.fillStyle = "#1e1302";
      ctx.beginPath();
      drawRoundedRect(ctx, bx - bw / 2 + 3, by - bh / 2 + 3, bw - 6, bh - 6, 6);
      ctx.fill();

      ctx.fillStyle = "#ffd75a";
      ctx.strokeStyle = "#07090c";
      ctx.lineWidth = 6;
      ctx.strokeText(badgeText, bx, by);
      ctx.fillText(badgeText, bx, by);
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  setPoints(pts) {
    this.pts = pts;
    this.draw();
  }

  update(dt, player, camera, scoreTargetScreen) {
    if (this.dead) return;
    this.t += dt;
    const p = Math.min(1.0, this.t / this.duration);

    // Smooth cubic ease-in-out for satisfying travel arc
    const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    // Unproject target HUD screen coordinate into 3D in front of camera
    const ndcX = (scoreTargetScreen.x / window.innerWidth) * 2 - 1;
    const ndcY = -(scoreTargetScreen.y / window.innerHeight) * 2 + 1;

    _tempVec.set(ndcX, ndcY, 0.5).unproject(camera);
    _ray.subVectors(_tempVec, camera.position).normalize();
    // 2.0 units in front of camera along the ray pointing at the HUD score element
    _dest3D.copy(camera.position).addScaledVector(_ray, 2.0);

    // Current player position + random spot in player area
    const pPos = (player && player.pos) ? player.pos : this.startPos;
    _originVec.copy(pPos);
    _originVec.x += this.ox;
    _originVec.y += this.oy;
    _originVec.z += this.oz;

    // Smoothly fly all the way from the random spot in the player area to the HUD 3D destination
    this.mesh.position.lerpVectors(_originVec, _dest3D, ease);

    // Arc path upward during flight
    const arc = Math.sin(p * Math.PI) * 0.45;
    this.mesh.position.y += arc;

    // Scale dynamics: pops out at spawn (0.35 -> 1.15), cruises readable, then shrinks into score HUD (1.0 -> 0.25)
    let s = 1.0;
    if (p < 0.16) {
      s = 0.35 + (p / 0.16) * 0.80; // 0.35 -> 1.15
    } else if (p < 0.62) {
      s = 1.15 - ((p - 0.16) / 0.46) * 0.15; // 1.15 -> 1.0
    } else {
      s = 1.0 - ((p - 0.62) / 0.38) * 0.75; // 1.0 -> 0.25
    }
    this.mesh.scale.set(s, s, 1);

    // Orient plane to face camera, straightening tilt as it approaches HUD
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.rotateZ(this.tilt * (1 - ease));

    // Disable depth testing once airborne towards HUD so it does not clip through world geometry
    if (p > 0.18) {
      this.material.depthTest = false;
      this.material.depthWrite = false;
    }

    if (p >= 1.0) {
      this.destroy();
      if (this.onArrive) this.onArrive(this);
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    activeTags.delete(this);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

export class TrickText3D {
  constructor(scene) {
    this.scene = scene;
    this.tags = [];
    this.lastTriggerTime = 0;
    this.lastTriggerName = "";
  }

  // Triggered when trick starts, spins or airs
  trigger(name, mult = 1, pts = 0, player = null) {
    if (!name) return;

    // Debounce duplicate instant triggers of the same trick in the same frame
    const now = performance.now();
    if (this.lastTriggerName === name && pts === 0 && now - this.lastTriggerTime < 180) {
      return;
    }
    this.lastTriggerTime = now;
    this.lastTriggerName = name;

    // Limit active tags to keep scene clean and performant
    if (this.tags.length >= 6) {
      const oldest = this.tags.shift();
      oldest.destroy();
    }

    // Spawn new 3D trick tag at a random spot in player area that flies to the score HUD
    const tag = new TrickTag3D(this.scene, player, name, mult, pts, (finishedTag) => {
      // Trigger punch pop animation on the score HUD upon arrival
      const el = document.getElementById("boardScore");
      if (el) {
        el.classList.remove("pop");
        void el.offsetWidth;
        el.classList.add("pop");
      }
    });

    this.tags.push(tag);
  }

  // Triggered when trick lands with points
  land(name, mult = 1, pts = 0, player = null) {
    this.trigger(name, mult, pts, player);
  }

  // Board bail cancels/destroys all active flying tags
  bail() {
    for (const tag of this.tags) tag.destroy();
    this.tags.length = 0;
  }

  // Per-frame update
  update(dt, player, camera) {
    if (this.tags.length === 0) return;

    // Get current screen center of the score HUD element
    const boardEl = document.getElementById("boardScore");
    let scoreTarget = { x: 74, y: 175 };
    if (boardEl) {
      const r = boardEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        scoreTarget.x = r.left + r.width / 2;
        scoreTarget.y = r.top + r.height / 2;
      }
    }

    // Update all active tags
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      tag.update(dt, player, camera, scoreTarget);
      if (tag.dead) {
        this.tags.splice(i, 1);
      }
    }
  }
}
