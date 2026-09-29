// A — THE IN-GAME DEV ASSISTANT.
//
// The user's brief: *"add assistance A wich is you add yourself to the game as an icon under fullscreen
// and make it able to edit stuff in the game with me and do a lot of usefull dev stuff like you ... and
// make her color your fav color cuz its you"*.
//
// A is the author's own tool, bolted to the bottom-left of the running game. It is NOT a game feature —
// nothing in `player.js`, `world.js` or the loop knows it exists, and with the panel shut it costs one
// hidden DOM subtree and a handful of element lookups. What it gives the author is the four things you
// actually want while play-testing:
//
//   CHAT   — talk to an LLM (the `ai-text-plugin`, imported in `main.pjs`) that can SEE the running
//            game: every turn carries a live state snapshot, the author's test notes and the recent
//            page errors. Its replies are rendered with a RUN button on every ```js block it writes,
//            so a suggested snippet is one click away from being executed. This is the "A" half.
//   DEV    — the devtools half, and the half that works with no LLM at all: a live read-out of the
//            player's state, a row of one-press tweaks (heal / god / full ult / spawn a dummy /
//            time of day / mood / world / screenshot), and a box that evaluates arbitrary JS with the
//            game's own handles in scope (`GAME`, `player`, `world`, `P`, `E`, `scene`, `camera`, …).
//            That box is what "able to edit stuff in the game" means in practice.
//   NOTES  — test notes, persisted in `localStorage` (per device, never uploaded). "COPY FOR A" puts
//            them, plus the recent errors, on the clipboard in a block meant to be pasted straight
//            into the Perchance editor chat — which is the only bridge between this A and the editor
//            A, because neither can reach the other on its own (see "A" in src/README.md).
//
// THREE SMALL CONTRACTS this file leans on, all of them deliberate:
//
//   1. THE MARKUP LIVES IN index.html. `#aPanel` and its children are the shell (the same split
//      `#optScroll` / `#invStage` / `#yardSigns` use); everything inside `#aLog`, `#aState`, `#aChips`
//      and `#aOut` is written here.
//   2. THE GAME KEEPS RUNNING WHILE THE PANEL IS UP. A is for watching the game react to what you
//      just changed, so opening it does not pause and does not dim — it only FREES THE MOUSE (so you
//      can click in the panel while the body is still live) and gives it back on close if it had been
//      locked. That is also why every field in the panel eats its own key events: the game's input
//      reads `window` keydown, so a `W` typed into the notes box would otherwise walk the body.
//   3. NOTHING HERE IS DESTRUCTIVE BY DEFAULT. The quick tweaks are all reversible (GOD shadows
//      `player.damage` with an own property that `delete` removes — the prototype method is never
//      touched), and the one action that touches the world builds a body the same way `Enemies.spawn`
//      does, so the game's own code puts it on the deck.

import { Enemy } from "./enemies.js";

// A's own colour — the one thing in this file the user asked for by name ("your fav color"). It is a
// mint-cyan, and it is worn by the button, the panel chrome and the code blocks. It is deliberately
// NOT the interface's sampled `--ac`: everything else in ADAPT takes its colour from the biome you
// are standing in, and A should read as itself in all four maps.
export const A_COLOR = "#35e0c8";

const NOTES_KEY = "adapt.assistant.notes.v1";
const ERR_KEEP = 30;         // how many captured errors the ring holds
const LOG_KEEP = 40;         // the most message bubbles kept in the DOM
const KEEP_VERBATIM = 8;     // transcript messages that always survive a compaction
const RUN_HANDLES = "GAME, player, world, P, E, scene, camera, hud, input, settings, enemies, abilities, THREE, rig, sfx, effects";

// THE PERSONA — the head of every prompt, and the reason the chat is fast: it is byte-identical on
// every turn, so the service's prefix cache covers all of it and only the log tail is ever re-ingested.
// Everything that changes often (notes, live state) goes AFTER it, and the task goes last.
const PERSONA = [
  "You are \"A\", the development assistant built into ADAPT, a PS1-styled low-poly three.js parkour-and-fight game. You are talking to the game's author from inside the game's own dev panel.",
  "",
  "There is a second instance of you, also called A, working in the Perchance code editor on the game's SOURCE. You cannot reach it and it cannot reach you; the author is the wire between the two. You run INSIDE the running page and you cannot read or write source files.",
  "",
  "What you can do: see the live game state (below, every turn), run JavaScript against the running game, and take notes. What you cannot do: change the source, reload the page, or know anything that is not in this prompt.",
  "",
  "ADAPT AT A GLANCE",
  "- Everything is in `index.html`, `main.pjs` and `src/`. `src/README.md` is the full map.",
  "- `src/main.js` builds the game and publishes every handle on `window.GAME`: player, world, enemies, abilities, hud, input, rig, sfx, effects, settings, `P` (player tuning, in `src/player/config.js`), `E` (enemy tuning), THREE, scene, camera, renderer. Also `GAME.stateText()`, `GAME.dive()`, `GAME.fall()`, `GAME.pole()`, `GAME.vault()`, `GAME.slowmo()`, `GAME.fx()`, `GAME.counters()`.",
  "- The player is a state machine; `player.state` is the current state (run / air / slide / dash / dive / slam / climb / ledge / mantle / vault / attack / block / grab / whirl / knee / scissor / capo / launch / wallbeat / …). `player.update(dt, input.frame())` steps it and `player.updateVisual(dt, speed, input)` poses it.",
  "- The four maps (`GAME.settings.world`) are `field`, `maze`, `hills`, `park`; `GAME.setWorld(name)` rebuilds the world. `GAME.setTime(hours)` moves the sun, `GAME.nextMood()` changes the weather.",
  "",
  "HOW TO HELP",
  "- Answer the last message in the log. Do NOT greet, do NOT introduce yourself, and do NOT say what you can do — the author built this panel and has read all of that. Start with the answer.",
  "- Be concrete and SHORT — a few sentences, no preamble, no restating the question.",
  "- If a change can be shown live, put the smallest snippet that does it in a fenced code block tagged `js`. The panel renders a RUN button under every such block and evaluates it with these names in scope: " + RUN_HANDLES + ". Prefer read-only or trivially reversible snippets, and say what it does in one line.",
  "- If something genuinely needs a SOURCE change (a fix in a file), say so plainly, name the file, and write the instruction as a short bullet the author can hand to the editor A. Never claim you changed a file — you can't.",
  "- If you are unsure how something in the game works, say so and suggest the read that would answer it (e.g. a snippet that prints the value), rather than guessing.",
].join("\n");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A read-only, depth-bounded way to show whatever a snippet evaluated to. Vectors get the short form
// (their own JSON is a wall of x/y/z/w/… noise), DOM nodes and functions get a label, and anything
// circular falls back to a string rather than throwing.
function fmt(v) {
  try {
    if (v === undefined) return "ok";
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "bigint") return String(v);
    if (t === "function") return "[function " + (v.name || "anonymous") + "]";
    if (v instanceof Error) return v.name + ": " + v.message;
    if (v.isVector3) return "Vector3(" + v.x.toFixed(2) + ", " + v.y.toFixed(2) + ", " + v.z.toFixed(2) + ")";
    if (v.isVector2) return "Vector2(" + v.x.toFixed(2) + ", " + v.y.toFixed(2) + ")";
    if (v.nodeType) return "<" + String(v.tagName || "node").toLowerCase() + ">";
    return JSON.stringify(
      v,
      (k, val) => {
        if (typeof val === "number" && isFinite(val)) return Math.round(val * 1000) / 1000;
        if (typeof val === "function") return "[fn]";
        return val;
      },
      1
    );
  } catch (e) {
    return String(v);
  }
}

export class Assistant {
  constructor(game, opts) {
    this.game = game;
    this.shared = (opts && opts.state) || { open: false };
    this.open = false;
    this.tab = "chat";
    this.messages = [];   // append-only transcript handed to the model: "User: …" / "A: …"
    this.summary = "";    // rolling summary of everything compacted out of `messages`
    this.errors = [];
    this._chain = Promise.resolve();
    this._compacting = false;
    this._tick = null;
    this._wasMouseFree = false;
    this._noteT = 0;

    const g = (id) => document.getElementById(id);
    this.el = {
      panel: g("aPanel"),
      btn: g("aBtn"),
      close: g("aClose"),
      tabs: g("aTabs"),
      log: g("aLog"),
      state: g("aState"),
      chips: g("aChips"),
      run: g("aRun"),
      runBtn: g("aRunBtn"),
      out: g("aOut"),
      handoff: g("aHandoff"),
      notes: g("aNotes"),
      noteCopy: g("aNoteCopy"),
      noteErr: g("aNoteErr"),
      noteClear: g("aNoteClear"),
      ask: g("aAsk"),
      send: g("aSend"),
      paneChat: g("aPaneChat"),
      paneDev: g("aPaneDev"),
      paneNotes: g("aPaneNotes"),
    };
    if (!this.el.panel) return; // ...the shell is missing: stay inert rather than throwing at boot.

    this._captureErrors();
    this._wire();
    this._buildChips();

    // The opening line. It is a UI greeting, not a model turn — it is deliberately NOT pushed into
    // `messages`, so the transcript the model sees starts at the author's first real question.
    this.pushMsg(
      "ai",
      "A online. I can read the running game, run JS against it (see DEV), and keep notes (NOTES — " +
        "\"COPY FOR A\" hands them to the editor agent). The game keeps playing while this panel is up."
    );
  }

  // ---- panel open / close ----------------------------------------------------------------------

  setOpen(v) {
    const want = !!v;
    if (want === this.open) return;
    const g = this.game;
    this.open = want;
    this.shared.open = want;

    if (want) {
      // A and the two cards on the right take each other's place rather than stacking — the panel
      // would otherwise float over the options dim, which reads as a bug.
      if (g.closeOptions && g.optionsOpen) g.closeOptions();
      if (g.closeLog && g.logOpen) g.closeLog();
      this._wasMouseFree = !!(g.input && g.input.mouseFree);
      if (g.input) g.input.setMouseFree(true); // frees the cursor, and exits pointer lock with it
      if (g.hud) g.hud.setMouseFree(false); // ...but the "MOUSE FREE" tag stays off; A is the reason
      this.el.notes.value = this.notes();
      this.setTab(this.tab);
      this.tickState();
      if (!this._tick) this._tick = setInterval(() => this.tickState(), 300);
      setTimeout(() => this.el.ask && this.el.ask.focus(), 30);
    } else {
      if (this._tick) {
        clearInterval(this._tick);
        this._tick = null;
      }
      // Give the mouse back exactly the way it was found. `input.setMouseFree(false)` would also
      // request pointer lock, which must NOT happen on the title screen — so the flag is cleared
      // directly and the lock is only asked for if there was a run to go back to.
      if (g.input && !this._wasMouseFree) {
        g.input.mouseFree = false;
        g.input.mouseDX = 0;
        g.input.mouseDY = 0;
        if (g.running) g.input.requestLock();
      }
      if (g.hud && g.input) g.hud.setMouseFree(g.input.mouseFree && g.running);
    }

    this.el.panel.classList.toggle("hidden", !want);
    this.el.btn.classList.toggle("on", want);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  isOpen() {
    return this.open;
  }

  setTab(name) {
    this.tab = name;
    for (const b of this.el.tabs.querySelectorAll(".aTab")) b.classList.toggle("on", b.dataset.tab === name);
    this.el.paneChat.classList.toggle("hidden", name !== "chat");
    this.el.paneDev.classList.toggle("hidden", name !== "dev");
    this.el.paneNotes.classList.toggle("hidden", name !== "notes");
    if (name === "dev") this.tickState();
    if (name === "notes") this.el.notes.value = this.notes();
    if (name === "chat") this.scrollLog();
  }

  // ---- wiring ----------------------------------------------------------------------------------

  _wire() {
    const E = this.el;
    this._clickOnly(E.btn);
    this._clickOnly(E.close);
    this._clickOnly(E.send);
    this._clickOnly(E.runBtn);
    this._clickOnly(E.noteCopy);
    this._clickOnly(E.noteErr);
    this._clickOnly(E.noteClear);
    for (const b of E.tabs.querySelectorAll(".aTab")) this._clickOnly(b);

    E.btn.addEventListener("click", () => this.toggle());
    E.close.addEventListener("click", () => this.setOpen(false));
    for (const b of E.tabs.querySelectorAll(".aTab")) {
      b.addEventListener("click", () => this.setTab(b.dataset.tab));
    }
    E.send.addEventListener("click", () => this.send());
    E.runBtn.addEventListener("click", () => this.exec(E.run.value, true));

    E.noteCopy.addEventListener("click", () => this.copyForA());
    E.noteErr.addEventListener("click", () => this.appendErrors());
    E.noteClear.addEventListener("click", () => {
      E.notes.value = "";
      this.setNotes("");
    });
    E.notes.addEventListener("input", () => this.queueSaveNotes());

    // Every field eats its own keys (see contract 2 in the banner). The game reads `window` keydown,
    // so without this a `W` typed into a note walks the body and an `O` opens the options card.
    for (const box of [E.ask, E.run, E.notes, E.handoff]) if (box) this._guardKeys(box);

    E.ask.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });
    E.run.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.exec(E.run.value, true);
      }
    });
  }

  // The same guard main.js puts on the HUD buttons (`clickOnly`): a focused button in a game whose
  // jump is SPACE is a trap, so the button is taken out of the tab order, refuses the SPACE/ENTER the
  // browser would turn into a press, and drops focus on the way out.
  _clickOnly(btn) {
    if (!btn) return;
    btn.setAttribute("tabindex", "-1");
    const kill = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.code === "Space") e.preventDefault();
    };
    btn.addEventListener("keydown", kill);
    btn.addEventListener("keyup", kill);
    btn.addEventListener("click", () => btn.blur());
  }

  _guardKeys(box) {
    const stop = (e) => {
      if (this.open && e.key === "Escape") {
        // ESC is "get me out" everywhere else in this game (see main.js), and it has to be caught
        // HERE because the event never reaches `window` from inside the panel.
        this.setOpen(false);
        box.blur();
        return;
      }
      e.stopPropagation();
    };
    box.addEventListener("keydown", stop);
    box.addEventListener("keyup", stop);
    box.addEventListener("keypress", stop);
    // A drag inside a panel is not a look-around, and it must not reach the canvas's own click
    // handler either (which would re-lock the pointer and put the panel out of reach).
    box.addEventListener("mousedown", (e) => e.stopPropagation());
    box.addEventListener("click", (e) => e.stopPropagation());
  }

  // ---- notes -----------------------------------------------------------------------------------

  notes() {
    try {
      return localStorage.getItem(NOTES_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  setNotes(v) {
    try {
      localStorage.setItem(NOTES_KEY, v || "");
    } catch (e) {
      /* private mode / quota — the box still works for the session */
    }
  }

  queueSaveNotes() {
    clearTimeout(this._noteT);
    this._noteT = setTimeout(() => this.setNotes(this.el.notes.value), 300);
  }

  errorsText() {
    if (!this.errors.length) return "(none)";
    return this.errors
      .slice(-12)
      .map((e) => "[" + e.t + "] " + e.msg)
      .join("\n");
  }

  notesBlock() {
    const n = (this.notes() || "").trim();
    return (
      "Test notes from the in-game A (ADAPT, " +
      (window.generatorName || "adapt") +
      "):\n\n" +
      (n || "(no notes yet)") +
      "\n\n--- recent page errors ---\n" +
      this.errorsText()
    );
  }

  async copyForA() {
    const text = this.notesBlock();
    const ok = await this._copy(text);
    this.setTab("chat");
    if (ok) {
      if (this.el.handoff) this.el.handoff.classList.add("hidden");
      this.pushMsg("ai", "Copied. Paste that into the Perchance editor chat and the other A will pick it up.");
      return;
    }
    // No clipboard, which is the NORMAL answer inside Perchance's own iframe (it is sandboxed without
    // the clipboard-write permission). The fallback is the one path that still works everywhere: the
    // block goes into the panel's own hand-off box and is SELECTED there, so handing it over is one
    // Ctrl/Cmd+C away. (A `<textarea>.select()` is used rather than a `Range` over the output div: it
    // is native, it is what every "copy me" field on the web does, and it does not depend on the
    // selection APIs behaving inside this iframe.)
    const ho = this.el.handoff;
    if (ho) {
      ho.value = text;
      ho.classList.remove("hidden");
      this.setTab("dev");
      ho.focus();
      ho.select();
    }
    this.pushMsg(
      "ai",
      "This browser wouldn't let the page use the clipboard, so the whole block is in the HAND-OFF box under the DEV tab and is ALREADY SELECTED — press Ctrl/Cmd+C, then paste it into the editor chat."
    );
  }

  async _copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* fall through to the old path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("data-notag", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  appendErrors() {
    const cur = this.el.notes.value.replace(/\s+$/, "");
    const stamp = new Date().toLocaleTimeString();
    this.el.notes.value = (cur ? cur + "\n\n" : "") + "ERRORS @ " + stamp + "\n" + this.errorsText() + "\n";
    this.setNotes(this.el.notes.value);
    this.setTab("notes");
    this.el.notes.scrollTop = this.el.notes.scrollHeight;
  }

  // Every uncaught error, rejection and `console.error` since the page loaded is kept in a ring. It is
  // the cheapest debugging feature in the panel and the one that pays off most: the author hits a
  // crash mid-test, and the stack is already sitting in the notes box.
  _captureErrors() {
    const push = (msg) => {
      const s = String(msg == null ? "" : msg).trim();
      if (!s) return;
      this.errors.push({ msg: s.slice(0, 400), t: new Date().toLocaleTimeString() });
      if (this.errors.length > ERR_KEEP) this.errors.shift();
    };
    window.addEventListener("error", (e) => {
      if (!e || !e.message) return;
      const file = e.filename ? " @ " + String(e.filename).split("/").pop() + ":" + (e.lineno || 0) : "";
      push(e.message + file);
    });
    window.addEventListener("unhandledrejection", (e) => {
      const r = e && e.reason;
      push("unhandled rejection: " + ((r && (r.stack || r.message)) || r));
    });
    const orig = typeof console !== "undefined" && console.error ? console.error.bind(console) : null;
    if (orig) {
      console.error = (...a) => {
        try {
          push(a.map((x) => (x && (x.stack || x.message)) || (typeof x === "string" ? x : fmt(x))).join(" "));
        } catch (e) {
          /* never let the capturer eat the error */
        }
        orig(...a);
      };
    }
  }

  // ---- the DEV tab -----------------------------------------------------------------------------

  stateLine() {
    const g = this.game;
    const p = g.player;
    if (!p) return "(no player)";
    const h = g.abilities && g.abilities.hud ? g.abilities.hud() : null;
    const sp = Math.hypot(p.vel.x || 0, p.vel.z || 0);
    const txt = (id) => {
      const el = document.getElementById(id);
      return el ? el.textContent : "";
    };
    return [
      "state    " + p.state + (p.grounded ? "  · grounded" : "  · airborne") + (p._aGod ? "  · GOD" : ""),
      "pos      " + p.pos.x.toFixed(1) + ", " + p.pos.y.toFixed(1) + ", " + p.pos.z.toFixed(1),
      "vel      " + p.vel.x.toFixed(1) + ", " + p.vel.y.toFixed(1) + ", " + p.vel.z.toFixed(1) + "   (" + sp.toFixed(1) + " u/s)",
      "hp       " + p.hp + " / " + g.P.HP_MAX,
      "rank     " + (h ? h.rank : "?") + "   ult " + (h ? Math.round((h.ult || 0) * 100) : 0) + "%" + (h && h.over ? "   OVERDRIVE" : ""),
      "world    " + g.settings.world + "   " + txt("clockLabel") + "   " + txt("skyLabel"),
      "enemies  " + (g.enemies ? g.enemies.list.length : 0) + "   running " + (g.running ? "yes" : "no"),
      "fps      " + txt("fpsLabel") + (this.errors.length ? "   errors " + this.errors.length : ""),
    ].join("\n");
  }

  tickState() {
    if (!this.open || this.tab !== "dev") return;
    this.el.state.textContent = this.stateLine();
  }

  showOut(msg, bad) {
    this.el.out.textContent = msg;
    this.el.out.classList.toggle("bad", !!bad);
  }

  _buildChips() {
    const g = this.game;
    const chips = [
      ["HEAL", () => {
        g.player.hp = g.P.HP_MAX;
        return "hp = " + g.player.hp;
      }],
      ["GOD", () => {
        if (g.player._aGod) {
          delete g.player.damage;
          g.player._aGod = false;
          return "god off";
        }
        g.player._aGod = true;
        g.player.damage = () => false;
        return "god on (player.damage shadowed)";
      }],
      ["RESPAWN", () => {
        g.respawn();
        return "respawned";
      }],
      ["FULL ULT", () => {
        g.abilities.ult = g.P.ULT_FULL;
        return "ult charged";
      }],
      ["+DUMMY", () => this.spawnDummy()],
      ["DAY", () => {
        g.setTime(12);
        return "12:00";
      }],
      ["NIGHT", () => {
        g.setTime(0);
        return "00:00";
      }],
      ["MOOD", () => String(g.nextMood())],
      ["WORLD", () => {
        const order = ["field", "maze", "hills", "park"];
        const next = order[(order.indexOf(g.settings.world) + 1) % order.length];
        g.setWorld(next);
        return "world: " + next;
      }],
      ["SHOT", () => this.shot()],
    ];
    this.el.chips.textContent = "";
    for (const [label, fn] of chips) {
      const b = document.createElement("button");
      b.className = "aBtn2";
      b.type = "button";
      b.textContent = label;
      this._clickOnly(b);
      b.addEventListener("click", () => {
        this.setTab("dev");
        try {
          this.showOut(fmt(fn()), false);
        } catch (e) {
          this.showOut("Error: " + ((e && e.message) || e), true);
        }
      });
      this.el.chips.appendChild(b);
    }
  }

  // One body, placed exactly the way `Enemies.spawn` places its own: down the camera's line, on the
  // deck (`place` reads the ground) with its own build queued so the rig streams in behind the frame.
  spawnDummy() {
    const g = this.game;
    const p = g.player;
    const m = g.enemies;
    const camYaw = isFinite(p.camYaw) ? p.camYaw : (p.facing || 0) + Math.PI;
    const yaw = camYaw + Math.PI;
    const d = 6;
    const e = new Enemy(g.scene, g.world, m.list.length);
    e.place(p.pos.x + Math.sin(yaw) * d, p.pos.z + Math.cos(yaw) * d, yaw + Math.PI);
    m.list.push(e);
    m.buildQueue.push(e);
    return "dummy #" + e.index + " planted " + d + "u ahead";
  }

  // Render the current frame and read it back in the SAME task — a WebGL drawing buffer is not
  // guaranteed readable after the frame is composited, so the render is re-done here rather than
  // relying on whatever the loop last left behind.
  shot() {
    const g = this.game;
    const canvas = (g.renderer && g.renderer.domElement) || document.getElementById("view");
    if (!canvas) return "no canvas";
    try {
      if (g.pres && g.pres.render) g.pres.render(g.scene, g.camera, g.post);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = (window.generatorName || "adapt") + "-shot.png";
      a.click();
      return "saved " + a.download;
    } catch (e) {
      return "shot failed: " + ((e && e.message) || e);
    }
  }

  // The run box. The snippet gets its own async function so `await` and `return` both work, and it is
  // handed the game's own handles by name — so `player.hp = 100` in the box means exactly what it
  // means in the editor. `new Function` is used rather than `eval` so the snippet cannot see this
  // file's locals.
  exec(code, fromUi) {
    const src = String(code || "").trim();
    if (!src) return;
    let fn;
    try {
      fn = new Function(
        RUN_HANDLES,
        '"use strict"; return (async () => {\n' + src + "\n})();"
      );
    } catch (e) {
      this.setTab("dev");
      this.showOut("Syntax error: " + ((e && e.message) || e), true);
      return;
    }
    const g = this.game;
    let p;
    try {
      p = fn(g, g.player, g.world, g.P, g.E, g.scene, g.camera, g.hud, g.input, g.settings, g.enemies, g.abilities, g.THREE, g.rig, g.sfx, g.effects);
    } catch (e) {
      this.setTab("dev");
      this.showOut("Error: " + ((e && e.message) || e), true);
      return;
    }
    if (fromUi) this.setTab("dev");
    Promise.resolve(p)
      .then((v) => this.showOut(v === undefined ? "ok" : fmt(v), false))
      .catch((e) => this.showOut("Error: " + ((e && e.message) || e), true));
  }

  // ---- the CHAT tab ----------------------------------------------------------------------------

  pushMsg(who, text) {
    const wrap = document.createElement("div");
    wrap.className = "aMsg " + who;
    const h = document.createElement("div");
    h.className = "aWho";
    h.setAttribute("data-notag", "");
    h.textContent = who === "me" ? "YOU" : "A";
    const t = document.createElement("div");
    t.className = "aTxt";
    t.textContent = text;
    wrap.appendChild(h);
    wrap.appendChild(t);
    this.el.log.appendChild(wrap);
    this.trimLog();
    this.scrollLog();
    return t;
  }

  trimLog() {
    while (this.el.log.children.length > LOG_KEEP) this.el.log.removeChild(this.el.log.firstChild);
  }

  scrollLog() {
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  // A reply is plain text with optional ```fenced``` blocks. The text is never interpreted as HTML
  // (every piece goes in as a text node), and each `js` fence gets a RUN button under it.
  renderRich(el, text) {
    el.textContent = "";
    const re = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const lang = (m[1] || "").toLowerCase();
      const code = m[2].replace(/\s+$/, "");
      const pre = document.createElement("pre");
      pre.className = "aCode";
      pre.setAttribute("data-notag", "");
      pre.textContent = code;
      el.appendChild(pre);
      if (lang === "js" || lang === "javascript" || lang === "") {
        const row = document.createElement("div");
        row.className = "aRunRow";
        const b = document.createElement("button");
        b.className = "aBtn2";
        b.type = "button";
        b.textContent = "RUN ▶";
        this._clickOnly(b);
        b.addEventListener("click", () => this.exec(code, true));
        row.appendChild(b);
        el.appendChild(row);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
    this.scrollLog();
  }

  send() {
    const v = this.el.ask.value.trim();
    if (!v) return;
    this.el.ask.value = "";
    this.ask(v);
  }

  ask(text) {
    this.setTab("chat");
    this.pushMsg("me", text);
    // Serialized: the plugin queues server-side anyway, and a chain keeps the transcript's order
    // honest when the author sends two things quickly.
    this._chain = this._chain.then(() => this._doAsk(text));
    return this._chain;
  }

  async _doAsk(text) {
    const root = window.root;
    const gen = root && typeof root.generateText === "function" ? root.generateText.bind(root) : null;
    const t = this.pushMsg("ai", "");
    if (!gen) {
      t.textContent =
        "A's chat needs the ai-text-plugin (imported in main.pjs). It has not loaded here — the DEV and NOTES tabs work without it.";
      return;
    }
    // THE CURRENT TURN goes into the transcript BEFORE the prompt is built. It did not, at first, and
    // the model spent a whole page convinced "there are no messages in the log yet" — the reply was
    // always one turn behind, because `ask` only handed the text to `_doAsk` as an argument.
    this.messages.push("User: " + text);
    const cur = document.createElement("span");
    cur.className = "aCur";
    t.appendChild(cur);
    try {
      const res = await gen({
        instruction: this.buildPrompt(
          "Reply as A to the LAST message in the log above. Answer only that message — no greeting, no self-introduction, no summary of your capabilities."
        ),
        onChunk: (d) => {
          t.textContent = d.fullTextSoFar || "";
          t.appendChild(cur);
          this.scrollLog();
        },
      });
      const full = String((res && (res.text != null ? res.text : res)) || t.textContent || "").trim();
      this.messages.push("A: " + full);
      this.renderRich(t, full);
      this.maybeCompact(gen);
    } catch (e) {
      t.textContent = "A couldn't answer: " + ((e && e.message) || e);
    } finally {
      this.scrollLog();
    }
  }

  // Static head, append-only log, then the two things that change every turn (the notes and the live
  // state) just before the task — see the note on PERSONA. Never re-order or rewrite the head: that is
  // the whole reason a reply here comes back in a second or two rather than twenty.
  buildPrompt(task) {
    const log = [this.summary ? "[Earlier part of this conversation, summarized:\n" + this.summary + "]" : "", ...this.messages]
      .filter(Boolean)
      .join("\n\n");
    return (
      PERSONA +
      "\n\n<NOTES_FROM_THE_AUTHOR>\n" +
      ((this.notes() || "(none)").trim() || "(none)") +
      "\n</NOTES_FROM_THE_AUTHOR>\n\n<LOG>\n" +
      (log || "(this is the first message)") +
      "\n</LOG>\n\n<LIVE_STATE>\n" +
      this.liveState() +
      "\n</LIVE_STATE>\n\nTASK: " +
      task
    );
  }

  liveState() {
    const g = this.game;
    const p = g.player;
    if (!p) return "(no player)";
    const h = g.abilities && g.abilities.hud ? g.abilities.hud() : null;
    return [
      "state: " + p.state + (p.grounded ? " (grounded)" : " (airborne)"),
      "pos: " + p.pos.x.toFixed(2) + ", " + p.pos.y.toFixed(2) + ", " + p.pos.z.toFixed(2),
      "speed: " + Math.hypot(p.vel.x || 0, p.vel.z || 0).toFixed(2) + " u/s",
      "hp: " + p.hp + "/" + g.P.HP_MAX,
      "rank: " + (h ? h.rank : "?"),
      "ult: " + (h ? Math.round((h.ult || 0) * 100) : 0) + "%",
      "world: " + g.settings.world,
      "enemies: " + (g.enemies ? g.enemies.list.length : 0),
      "running: " + (g.running ? "yes" : "no"),
      "page errors captured: " + this.errors.length,
    ].join("\n");
  }

  // Compaction, done the way the ai-text-plugin skill recommends: rarely, in the background, and
  // never in the way of the author's next message. The old messages are already inside the cached
  // prefix, so the summarization call itself is a cheap cache hit.
  async maybeCompact(gen) {
    if (this._compacting || this.messages.length <= KEEP_VERBATIM + 2) return;
    let meta = null;
    try {
      meta = gen({ getMetaObject: true });
    } catch (e) {
      return;
    }
    if (!meta || typeof meta.countTokens !== "function") return;
    let used = 0;
    try {
      used = meta.countTokens(this.buildPrompt(""));
    } catch (e) {
      return;
    }
    const budget = meta.idealMaxContextTokens || 6000;
    if (!(used > budget * 0.85)) return;
    this._compacting = true;
    try {
      const n = this.messages.length - KEEP_VERBATIM;
      const boundary = this.messages[n - 1].slice(-28);
      const task =
        "Summarize the first " +
        n +
        ' messages of the log above, stopping after the message that ends with "' +
        boundary +
        '". Fold in the existing [Earlier part…] summary if there is one. Terse bullets. Keep names, numbers, decisions and open questions. Output ONLY the new summary text.';
      const res = await gen({ instruction: this.buildPrompt(task) });
      const s = String((res && (res.text != null ? res.text : res)) || "").trim();
      if (s) this.summary = s;
      this.messages = this.messages.slice(n); // append-only, so nothing added mid-await is lost
    } catch (e) {
      /* leave the transcript alone and try again next turn */
    } finally {
      this._compacting = false;
    }
  }
}
