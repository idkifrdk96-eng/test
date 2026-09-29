// ---------------------------------------------------------------------------
// Part 19 of the `player.js` split: THE CHAIN'S CROSS-FADE.
//
// Moved here from player.js: `chainRig` (the snapshot list + buffer, built once),
// `chainSnapshot` (keep the silhouette) and `chainBlend` (walk a fresh pose back
// toward it). It is what lets the melee chain cross-fade between two finished poses.
//
// Deps: NOTHING but the body's own `inner`/`_chain*` fields — a true leaf module.
// ---------------------------------------------------------------------------

const chainfadeMethods = {
  // -------------------------------------------------------------------------
  // THE CHAIN'S CROSS-FADE (see the chain block in `updateVisual`).
  //
  // `chainSnapshot` keeps the silhouette the chain last left on the rig and `chainBlend` walks the
  // freshly written pose back toward it, which is all a cross-fade between two finished poses
  // needs. Both work on the bones' own local transforms, so the blend lives entirely in the pose
  // layer — the aim, the physics and the hit wedge were all decided long before this runs, and
  // nothing outside the rig can see it.
  //
  // The buffers are built once off `inner` and every object under it is included (bones, hair
  // plates, fingers): a fade that missed a part would leave that part popping while the rest of
  // the body eased, which is worse than no fade at all. The snapshot is taken AFTER the blend, so
  // the next frame eases from what is actually on screen and the handover converges over the fade
  // rather than restarting from the old silhouette every frame.
  // -------------------------------------------------------------------------
  chainRig() {
    if (!this.inner) return null;
    if (!this._chainRig) {
      const list = [];
      this.inner.traverse((o) => {
        if (o !== this.inner) list.push(o);
      });
      this._chainRig = list;
      this._chainPrev = new Float32Array(list.length * 6);
      this._chainHave = false;
    }
    return this._chainRig;
  },

  chainSnapshot() {
    const list = this.chainRig();
    if (!list) return;
    const buf = this._chainPrev;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const k = i * 6;
      buf[k] = o.rotation.x;
      buf[k + 1] = o.rotation.y;
      buf[k + 2] = o.rotation.z;
      buf[k + 3] = o.position.x;
      buf[k + 4] = o.position.y;
      buf[k + 5] = o.position.z;
    }
    this._chainHave = true;
  },

  chainBlend(k) {
    const list = this.chainRig();
    if (!list || !this._chainHave) return;
    const buf = this._chainPrev;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const j = i * 6;
      o.rotation.x = buf[j] + (o.rotation.x - buf[j]) * k;
      o.rotation.y = buf[j + 1] + (o.rotation.y - buf[j + 1]) * k;
      o.rotation.z = buf[j + 2] + (o.rotation.z - buf[j + 2]) * k;
      o.position.x = buf[j + 3] + (o.position.x - buf[j + 3]) * k;
      o.position.y = buf[j + 4] + (o.position.y - buf[j + 4]) * k;
      o.position.z = buf[j + 5] + (o.position.z - buf[j + 5]) * k;
    }
  },
};

export function installChainfade(Player) {
  Object.assign(Player.prototype, chainfadeMethods);
}
