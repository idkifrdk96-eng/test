// ---------------------------------------------------------------------------
// Part 26 of the `player.js` split: THE PUBLIC WIRING.
//
// Moved here from player.js: the three little setters/readers the rest of the game uses to hook
// the body up — `setEnemies` / `setPoles` (the two managers, called from main.js) and
// `combatMoves` (the rig's own baked move table, read by combat.js and the pose code). They are
// one-liners with no shared subject, so they live together as the class's public surface rather
// than inside a feature module; the MELEE CHAIN banner that used to sit above them went to
// `combat.js`, which is the chain's actual home.
//
// Deps: NOTHING — a true leaf.
// ---------------------------------------------------------------------------

const wiringMethods = {
  setEnemies(enemies) {
    this.enemies = enemies;
  },

  // THE POLE's props (see pole.js). The body asks this manager for the staff it may take
  // (`Poles.nearest`) and mounts it while the move runs (`Poles.mount`).
  setPoles(poles) {
    this.poles = poles;
  },

  combatMoves() {
    return this.charMesh && this.charMesh.userData.combatMoves;
  },
};

export function installWiring(Player) {
  Object.assign(Player.prototype, wiringMethods);
}
