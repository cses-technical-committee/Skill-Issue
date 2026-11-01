"use strict";

/* =====================================================================
   EVENT SETTINGS — this is the ONLY block you edit for a new website.
   ===================================================================== */
const CONFIG = {
  title: "HEXLOCK",                        // big name shown everywhere
  subtitle: "THE FINAL KEY",               // line under the name
  teamName: "SKILL ISSUE",
  presentedBy: "Technical Committee, CSES",
  eventName: "Phase 3 Event",
  phaseLabel: "FINAL PHASE",

  /* ---- THE TWO CODES -------------------------------------------------
     code4 : the 4-character lock teams see first.
     code6 : the real 6-character HEX lock revealed after code4 is solved.
             3 of the 4 characters of code4 must stay at the SAME position
             in code6; the 4th one moves to any other position.
     charset : characters teams may type (hex = 0-9 and A-F, UPPERCASE).   */
  code4: "4N03",
  code6: "4N0395",
  charset: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",

  /* ---- LEFT PANEL (one line of text per item) ------------------------ */
  rules: [],
  clues: [                                  // visible from the start (for the 4-digit lock)
    "Position 2 : Some connections survive long after people leave the place where they were first created.Within the society, one person is responsible for maintaining the bond between current members and those who have already moved ahead.Identify this individual.Take the first letter of their first name. It is your next piece.",
    "Position 3 : Not all communication happens through meetings or official notices.Find the committee member responsible for keeping the society visible across digital platforms.Now inspect their first name.Count the vowels and consonants separately. Find the absolute difference between the two counts.Your result is the next piece.",
    "Position 1 : In the technical world, some individuals guide the direction while others follow the path they create.Find the person entrusted with overseeing the technical domain of the society.Now examine their first name. Count the consonants, treating Y as a consonant.The number you obtain is your first piece.",
    "Position 4:(team-specific digit): Ask your Organizers for the 4th Clue."
  ],
  hexClues: [                               // added AFTER the 4-digit lock opens
    "Clue for the 6th position — In programming, syntax gives structure to every instruction.Use your Phase 2 keyword: Convert its first and last letters into their alphabetical positions.Find the absolute difference between the two values.If the result has more than one digit, add those digits together.This is your final piece."
  ],

  /* ---- TEXTS ---------------------------------------------------------- */
  titles: {
    stage1: "UNLOCK THE 4-DIGIT CODE",
    stage2: "ENTER THE 6-DIGIT HEX CODE"
  },
  revealLines: [                            // typed out after the drum roll
    "LOL. You didn't read the name, did you?",
    "H-E-X-L-O-C-K. Hex. As in six.",
    "It was never a 4-digit lock. Two more blocks. Good luck."
  ],

  /* ---- BEHAVIOUR ------------------------------------------------------ */
  cooldownSeconds: 30,                      // lockout after every 3 wrong attempts in a row
  drumSeconds: 3.6,                         // length of the black screen + drum roll
  keepPreviousEntry: true,                  // keep the 4 typed characters when the lock grows to 6
  sound: true                               // typing clicks, drum roll, fanfare
};

/* FRONT-END PROTOTYPE ONLY: the codes above are visible to anyone who opens the
   page source, and a refresh resets everything. A real competition must check
   codes and enforce lockouts on a server (see checkCodeWithServer). */

const LEN1 = 4;
const LEN2 = 6;
const MAX_STREAK = 3;
const VERIFY_MS = 1300;
const UNLOCK_MS = 1300;
const CHARSET = CONFIG.charset;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const els = {
  terminal: $("terminal"), code: $("code"), entry: $("entry"), enter: $("enterBtn"), feedback: $("feedback"),
  lockBox: $("lockBox"), lockTime: $("lockTime"), result: $("result"), rTeam: $("rTeam"), rTime: $("rTime"),
  team: $("teamName"), clock: $("eventClock"), clockLabel: $("clockLabel"),
  total: $("statTotal"), streak: $("statStreak"), system: $("statSystem"), dot: $("dot"),
  welcome: $("welcome"), play: $("playBtn"),
  brief: $("brief"), briefToggle: $("briefToggle"), configError: $("configError"),
  codeTitle: $("codeTitle"), taunt: $("taunt"),
  rules: $("rulesList"), clues: $("cluesList"), rulesSec: $("rulesSec"), cluesSec: $("cluesSec"),
  blackout: $("blackout"), banner: $("banner"), bannerBig: $("bannerBig"), bannerSub: $("bannerSub")
};

/* ---------------------------------------------------------------------
   Configuration validation
   --------------------------------------------------------------------- */
function validateConfig(c) {
  const e = [];
  const cs = c.charset;
  if (typeof c.teamName !== "string" || !c.teamName.trim()) e.push("teamName must be a non-empty string.");
  if (typeof cs !== "string" || cs.length < 2 || new Set(cs).size !== cs.length || cs !== cs.toUpperCase()) {
    return ["charset must be unique UPPERCASE characters, e.g. 0123456789ABCDEF."];
  }
  const ok = (code, n) => typeof code === "string" && code.length === n && [...code].every((ch) => cs.includes(ch));
  if (!ok(c.code4, LEN1)) e.push(`code4 must be exactly ${LEN1} characters from the charset (${cs}).`);
  if (!ok(c.code6, LEN2)) e.push(`code6 must be exactly ${LEN2} characters from the charset (${cs}).`);
  if (!Number.isFinite(c.cooldownSeconds) || c.cooldownSeconds <= 0) e.push("cooldownSeconds must be a positive number.");
  if (!Number.isFinite(c.drumSeconds) || c.drumSeconds < 1) e.push("drumSeconds must be at least 1.");
  ["rules", "clues", "hexClues", "revealLines"].forEach((k) => {
    if (!Array.isArray(c[k]) || c[k].some((x) => typeof x !== "string")) e.push(`${k} must be a list of text lines.`);
  });
  if (!c.titles || typeof c.titles.stage1 !== "string" || typeof c.titles.stage2 !== "string") e.push("titles.stage1 and titles.stage2 must be text.");
  if (!e.length) {
    const same = [...c.code4].filter((ch, i) => c.code6[i] === ch).length;
    if (same < 3) console.warn(`HEXLOCK: only ${same} of the 4 characters of code4 keep their position in code6 (expected 3).`);
  }
  return e;
}

/* ---------------------------------------------------------------------
   State — kept in memory only, so every refresh resets everything
   --------------------------------------------------------------------- */
const defaults = { total: 0, streak: 0, lockUntil: 0, solved: false, solvedElapsed: 0 };
let state = { ...defaults };
let stage = 1;                 // 1 = 4-digit lock, 2 = hex lock
let slots = [];
let slotEls = [];
let active = 0;
let busy = false;              // verifying a code
let phaseBusy = false;         // cinematic transition running
let started = false;
let tickId = null;
let startTime = 0;
let teamName = "";

const len = () => slots.length;
const isLocked = () => state.lockUntil > Date.now();
const inputDisabled = () => !started || busy || phaseBusy || state.solved || isLocked();
const hoverDevice = () => window.matchMedia("(hover: hover)").matches;
const focusEntry = () => { if (hoverDevice() && !els.entry.disabled) els.entry.focus({ preventScroll: true }); };

/* ---------------------------------------------------------------------
   Code check — REPLACE THIS FUNCTION with a server API call in production.
   Must resolve to true/false. `which` is 1 (4-digit lock) or 2 (hex lock).
   --------------------------------------------------------------------- */
async function checkCodeWithServer(code, which) {
  return code === (which === 1 ? CONFIG.code4 : CONFIG.code6);
}

/* ---------------------------------------------------------------------
   Sound (all synthesised — no audio files needed)
   --------------------------------------------------------------------- */
const sfx = (() => {
  let ac = null, master = null, nb = null;
  const ready = () => !!(CONFIG.sound && ac);
  function init() {
    if (!CONFIG.sound) return;
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.7;
        const comp = ac.createDynamicsCompressor();
        master.connect(comp); comp.connect(ac.destination);
        nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === "suspended") ac.resume();
    } catch (e) { ac = null; }
  }
  function tone(f, t, dur, type, vol, to) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, type, freq, q, vol) {
    const s = ac.createBufferSource(); s.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const now = () => ac.currentTime + 0.01;
  return {
    init,
    key() { if (!ready()) return; const t = now(); tone(1700 + Math.random() * 400, t, 0.035, "square", 0.02); noise(t, 0.03, "highpass", 4000, 1, 0.04); },
    back() { if (!ready()) return; tone(520, now(), 0.04, "square", 0.02); },
    bad() { if (!ready()) return; const t = now(); tone(160, t, 0.3, "sawtooth", 0.16, 70); tone(120, t + 0.1, 0.3, "sawtooth", 0.12, 60); },
    unlock() { if (!ready()) return; const t = now(); tone(660, t, 0.14, "sine", 0.2); tone(990, t + 0.1, 0.3, "sine", 0.2); tone(1320, t + 0.2, 0.4, "sine", 0.14); },
    thunk() { if (!ready()) return; const t = now(); tone(95, t, 0.4, "sine", 0.7, 42); noise(t, 0.2, "lowpass", 400, 1, 0.3); },
    ping() { if (!ready()) return; const t = now(); tone(1320, t, 0.5, "sine", 0.14); tone(1760, t + 0.08, 0.5, "sine", 0.1); },
    pop() { if (!ready()) return; noise(now(), 0.28, "bandpass", 900 + Math.random() * 1600, 1.2, 0.14); },
    drumRoll(sec) {
      if (!ready()) return;
      const t0 = ac.currentTime + 0.05;
      let t = 0;
      while (t < sec) {
        const p = t / sec, vol = 0.1 + 0.75 * p * p;
        noise(t0 + t, 0.11, "bandpass", 1800 + 1200 * p, 0.8, vol);
        tone(190 - 40 * p, t0 + t, 0.09, "triangle", vol * 0.5, 110);
        t += (0.13 - 0.09 * p) * (0.9 + Math.random() * 0.2);
      }
      const e = t0 + sec;
      noise(e, 1.8, "highpass", 5000, 0.5, 0.5);
      noise(e, 0.25, "bandpass", 1500, 0.7, 0.8);
      tone(110, e, 0.9, "sine", 0.9, 38);
    },
    fanfare() {
      if (!ready()) return;
      const t = now();
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => {
        tone(f, t + i * 0.11, 1.2 - i * 0.08, "triangle", 0.18);
        tone(f * 2, t + i * 0.11, 0.6, "sine", 0.06);
      });
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, t + 0.8, 2.2, "sawtooth", 0.06));
      tone(98, t, 1.2, "sine", 0.9, 40);
      noise(t, 1.6, "highpass", 4000, 0.5, 0.4);
    }
  };
})();

/* ---------------------------------------------------------------------
   Text effects
   --------------------------------------------------------------------- */
function typeText(el, text, speed) {
  return new Promise((resolve) => {
    el.textContent = "";
    if (reducedMotion.matches) { el.textContent = text; resolve(); return; }
    el.classList.add("typing");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (text[i - 1] !== " ") sfx.key();
      if (i >= text.length) { clearInterval(id); el.classList.remove("typing"); resolve(); }
    }, speed || 32);
  });
}

function scrambleTo(el, text, ms) {
  return new Promise((resolve) => {
    if (reducedMotion.matches) { el.textContent = text; resolve(); return; }
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const fixed = Math.floor(p * text.length);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        out += i < fixed || text[i] === " " ? text[i] : CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }
      el.textContent = out;
      if (p >= 1) { clearInterval(id); el.textContent = text; resolve(); }
    }, 40);
  });
}

function shake(ms, amp) {
  if (reducedMotion.matches) return;
  document.querySelectorAll(".top, .layout, .status").forEach((el) => {
    const f = [];
    for (let i = 0; i <= 10; i++) {
      const k = 1 - i / 10;
      f.push({ transform: `translate(${(Math.random() - 0.5) * 2 * amp * k}px, ${(Math.random() - 0.5) * 2 * amp * k}px)` });
    }
    el.animate(f, { duration: ms, easing: "linear" });
  });
}

/* ---------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------- */
function makeSlot(i, cls, d) {
  const s = document.createElement("div");
  s.className = "slot " + cls;
  s.dataset.i = i;
  s.style.setProperty("--d", d);
  s.innerHTML = '<span class="char"></span><span class="line"></span><span class="idx">' + String(i + 1).padStart(2, "0") + "</span>";
  s.addEventListener("click", () => {
    if (!inputDisabled()) { active = i; render(); }
    els.entry.focus({ preventScroll: true });
  });
  return s;
}

function buildSlots() {
  els.code.innerHTML = "";
  slots = Array(LEN1).fill("");
  slotEls = slots.map((_, i) => {
    const s = makeSlot(i, "boot-slot", i);
    els.code.appendChild(s);
    return s;
  });
}

function render() {
  slotEls.forEach((s, i) => {
    s.querySelector(".char").textContent = slots[i];
    s.classList.toggle("active", i === active && !inputDisabled());
  });
  const locked = isLocked();
  els.enter.disabled = inputDisabled();
  els.enter.textContent = busy ? "VERIFYING…" : phaseBusy && !state.solved ? "UNLOCKING…" : state.solved ? "UNLOCKED" : locked ? "LOCKED" : "ENTER";
  els.entry.disabled = inputDisabled();
  els.entry.setAttribute("aria-label", `Code entry. Position ${active + 1} of ${len()} selected. Use arrow keys to move.`);
  els.code.setAttribute("aria-label", `${len()} character code`);
  els.total.textContent = state.total;
  els.streak.textContent = state.streak;
  els.lockBox.hidden = !locked || state.solved;
  els.result.hidden = !state.solved || els.terminal.classList.contains("unlocking");
  els.terminal.classList.toggle("solved", state.solved);
  els.system.textContent = state.solved ? "UNLOCKED" : locked ? "LOCKED" : busy ? "VERIFYING" : phaseBusy ? "UNLOCKING" : "ONLINE";
  els.dot.classList.toggle("locked", locked && !state.solved);
  els.dot.classList.toggle("busy", busy || phaseBusy);
}

function say(msg, kind) {
  els.feedback.textContent = msg;
  els.feedback.className = "feedback" + (kind ? " " + kind : "");
}

function formatClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, "0");
  const h = Math.floor(t / 3600);
  return (h ? p(h) + ":" : "") + `${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

function fillList(listEl, secEl, items, fresh) {
  items.forEach((text, i) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.style.setProperty("--i", i);
    if (fresh) li.className = "fresh";
    listEl.appendChild(li);
  });
  secEl.hidden = !listEl.children.length;
}

/* ---------------------------------------------------------------------
   Editing
   --------------------------------------------------------------------- */
function popSlot(i) {
  const el = slotEls[i];
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

function putChar(ch) {
  if (inputDisabled()) return;
  slots[active] = ch;
  popSlot(active);
  sfx.key();
  if (active < len() - 1) active += 1;
  render();
}

function backspace() {
  if (inputDisabled()) return;
  if (!slots[active] && active > 0) active -= 1;
  slots[active] = "";
  sfx.back();
  render();
}

function moveActive(step) {
  const n = active + step;
  if (n >= 0 && n < len()) { active = n; render(); }
}

function pasteCode(text) {
  const code = text.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== len() || ![...code].every((c) => CHARSET.includes(c))) {
    say(`Paste a full ${len()}-character code.`, "warn");
    return;
  }
  [...code].forEach((c, i) => { slots[i] = c; });
  active = 0;
  slotEls.forEach((_, i) => popSlot(i));
  say("");
  render();
}

/* ---------------------------------------------------------------------
   Submission
   --------------------------------------------------------------------- */
function flicker(ms) {
  return new Promise((resolve) => {
    if (reducedMotion.matches) { setTimeout(resolve, ms); return; }
    const chars = slotEls.map((s) => s.querySelector(".char"));
    const id = setInterval(() => {
      chars.forEach((c) => { c.textContent = CHARSET[Math.floor(Math.random() * CHARSET.length)]; });
    }, 70);
    setTimeout(() => { clearInterval(id); resolve(); }, ms);
  });
}

function hideTaunt() {
  if (els.taunt.hidden) return;
  els.taunt.classList.add("out");
  setTimeout(() => { els.taunt.hidden = true; els.taunt.classList.remove("out"); els.taunt.innerHTML = ""; }, 420);
}

async function submit() {
  if (inputDisabled()) return;
  if (slots.some((s) => !s)) { say(`Fill all ${len()} positions, then press ENTER.`, "warn"); return; }
  hideTaunt();
  busy = true;
  say("");
  els.terminal.classList.add("verifying");
  render();

  const code = slots.join("");
  let correct = false, failed = false;
  try {
    [correct] = await Promise.all([checkCodeWithServer(code, stage), flicker(VERIFY_MS)]);
  } catch (e) {
    failed = true;
    await wait(200);
  }

  els.terminal.classList.remove("verifying");
  busy = false;

  if (failed) { render(); say("Verification unavailable. This attempt was not counted. Try again.", "warn"); focusEntry(); return; }
  state.total += 1;

  if (correct) {
    state.streak = 0;
    if (stage === 1) await clearStageOne(); else await clearStageTwo();
    return;
  }

  state.streak += 1;
  sfx.bad();
  if (state.streak >= MAX_STREAK) {
    state.lockUntil = Date.now() + CONFIG.cooldownSeconds * 1000;
    say("");
  } else {
    say("Incorrect code. Try again.", "bad");
  }
  els.terminal.classList.remove("error"); void els.terminal.offsetWidth; els.terminal.classList.add("error");
  active = 0;
  render();
  tick();
  focusEntry();
}

/* ---- 4-digit lock opened: blackout, drum roll, the lock grows to 6 ---- */
async function clearStageOne() {
  const calm = reducedMotion.matches;
  phaseBusy = true;
  els.terminal.classList.add("unlocking");
  say("Code accepted…");
  sfx.unlock();
  render();
  await wait(calm ? 300 : UNLOCK_MS);
  els.terminal.classList.remove("unlocking");
  say("");

  els.blackout.classList.add("on");               // the whole screen goes blank
  await wait(calm ? 200 : 500);
  const drumMs = calm ? 1200 : CONFIG.drumSeconds * 1000;
  sfx.drumRoll(drumMs / 1000);
  await wait(drumMs);
  els.blackout.classList.remove("on");            // ...and comes back
  await wait(calm ? 100 : 1100);

  await extendToHex();
}

async function extendToHex() {
  const old = len();
  const lefts = slotEls.map((s) => s.getBoundingClientRect().left);
  for (let i = old; i < LEN2; i++) {
    slots.push("");
    const s = makeSlot(i, "arrive", i - old);
    slotEls.push(s);
    els.code.appendChild(s);
  }
  if (!CONFIG.keepPreviousEntry) for (let i = 0; i < old; i++) slots[i] = "";
  stage = 2;
  state.streak = 0;
  active = Math.max(0, slots.findIndex((c) => !c));

  // old blocks glide to their new places while the two new ones drop in
  slotEls.slice(0, old).forEach((s, i) => {
    const dx = lefts[i] - s.getBoundingClientRect().left;
    s.style.transition = "none"; s.style.transform = `translateX(${dx}px)`;
  });
  void els.code.offsetWidth;
  slotEls.slice(0, old).forEach((s) => {
    s.style.transition = "transform .9s cubic-bezier(.22,1,.36,1)"; s.style.transform = "";
  });
  setTimeout(() => slotEls.slice(0, old).forEach((s) => { s.style.transition = ""; }), 1000);

  render();
  sfx.thunk(); setTimeout(() => sfx.thunk(), 340);
  shake(600, 10);
  await wait(reducedMotion.matches ? 100 : 1300);

  scrambleTo(els.codeTitle, CONFIG.titles.stage2, 900);
  els.taunt.hidden = false; els.taunt.classList.remove("out"); els.taunt.innerHTML = "";
  for (const line of CONFIG.revealLines) {
    const p = document.createElement("p");
    els.taunt.appendChild(p);
    await typeText(p, line, 26);
    await wait(260);
  }

  fillList(els.clues, els.cluesSec, CONFIG.hexClues, true);   // 5th and 6th position clues
  els.brief.classList.add("open");
  els.briefToggle.setAttribute("aria-expanded", "true");
  sfx.ping();
  await wait(reducedMotion.matches ? 100 : 900);

  phaseBusy = false;
  render();
  focusEntry();
}

/* ---- hex lock opened: celebration ---- */
async function clearStageTwo() {
  phaseBusy = true;
  state.solved = true;
  state.solvedElapsed = Math.max(0, Date.now() - startTime);
  hideTaunt();
  els.terminal.classList.add("unlocking");
  render();
  say("Final key accepted…");
  sfx.unlock();
  await wait(reducedMotion.matches ? 300 : UNLOCK_MS);
  els.terminal.classList.remove("unlocking");
  els.rTeam.textContent = teamName;
  els.rTime.textContent = formatClock(state.solvedElapsed);
  say("");
  phaseBusy = false;
  render();
  tick();
  celebrate();
}

function celebrate() {
  document.body.classList.add("victory");
  sfx.fanfare();
  if (!reducedMotion.matches) {
    const flash = document.createElement("div"); flash.className = "flash"; document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1000);
    [0, 0.35, 0.7].forEach((d) => {
      const r = document.createElement("div"); r.className = "ring"; r.style.setProperty("--rd", d + "s");
      document.body.appendChild(r); setTimeout(() => r.remove(), 3500);
    });
    shake(900, 16);
    fxStart(18000);
  }
  const punch = () => { els.bannerBig.classList.remove("punch"); void els.bannerBig.offsetWidth; els.bannerBig.classList.add("punch"); };
  els.banner.classList.add("on");
  els.bannerBig.textContent = "HURRAY!";
  els.bannerSub.textContent = "";
  punch();
  setTimeout(() => {
    els.bannerBig.textContent = "CONGRATULATIONS";
    els.bannerSub.textContent = `${teamName} cracked the ${CONFIG.title}`;
    punch(); sfx.ping();
  }, 1600);
  setTimeout(() => els.banner.classList.remove("on"), 7000);
}

/* ---------------------------------------------------------------------
   Fireworks / confetti / hex rain (canvas)
   --------------------------------------------------------------------- */
const fx = {
  cv: $("fx"), c: null, w: 0, h: 0, dpr: 1, on: false, last: 0, until: 0, next: 0, rainUntil: 0, confUntil: 0,
  parts: [], rockets: [], conf: [], drops: []
};
const FX_COLORS = ["#ffffff", "#eef3f8", "#dde4eb", "#c3ccd6", "#9aa6b3", "#cfe6ff"];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = () => FX_COLORS[(Math.random() * FX_COLORS.length) | 0];

function fxResize() {
  fx.dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.w = window.innerWidth; fx.h = window.innerHeight;
  fx.cv.width = fx.w * fx.dpr; fx.cv.height = fx.h * fx.dpr;
  fx.c = fx.cv.getContext("2d");
  fx.c.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
  fx.drops = Array.from({ length: Math.ceil(fx.w / 26) }, () => ({ y: rnd(-fx.h, 0), v: rnd(4, 9) }));
}

function fxStart(ms) {
  fxResize();
  const t = performance.now();
  fx.until = t + ms; fx.rainUntil = t + 7000; fx.confUntil = t + 10000;
  fx.last = t; fx.next = t; fx.on = true;
  requestAnimationFrame(fxLoop);
}

function explode(x, y) {
  const a = pick(), b = pick(), ring = Math.random() < 0.4, n = ring ? 70 : 100;
  for (let i = 0; i < n; i++) {
    const ang = ring ? (i / n) * Math.PI * 2 : Math.random() * Math.PI * 2;
    const sp = ring ? 5.2 : rnd(1.2, 7);
    fx.parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, decay: rnd(0.008, 0.02), col: Math.random() < 0.5 ? a : b, r: rnd(1.2, 2.8) });
  }
  sfx.pop();
}

function fxLoop(t) {
  if (!fx.on) return;
  const k = Math.min(48, t - fx.last || 16) / 16.67;
  fx.last = t;
  const c = fx.c, live = t < fx.until;
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = "rgba(0,0,0,.2)";
  c.fillRect(0, 0, fx.w, fx.h);
  c.globalCompositeOperation = "lighter";

  if (live && t >= fx.next) {
    fx.rockets.push({ x: rnd(fx.w * 0.12, fx.w * 0.88), y: fx.h + 10, ty: rnd(fx.h * 0.1, fx.h * 0.5) });
    fx.next = t + rnd(220, 700);
  }
  if (t < fx.confUntil) {
    for (let i = 0; i < 3; i++) fx.conf.push({ x: rnd(0, fx.w), y: -12, vx: rnd(-1, 1), vy: rnd(1.5, 4), rot: rnd(0, 6), vr: rnd(-0.25, 0.25), w: rnd(6, 12), h: rnd(3, 7), col: pick(), s: rnd(0, 6) });
  }
  if (t < fx.rainUntil) {
    c.font = "16px ui-monospace, Consolas, monospace";
    c.fillStyle = "rgba(220,235,250,.5)";
    fx.drops.forEach((d, i) => {
      d.y += d.v * k;
      if (d.y > fx.h + 20) { d.y = rnd(-200, 0); d.v = rnd(4, 9); }
      c.fillText("0123456789ABCDEF"[(Math.random() * 16) | 0], i * 26, d.y);
    });
  }
  fx.rockets = fx.rockets.filter((r) => {
    r.y -= Math.max(2.4, (r.y - r.ty) * 0.06) * k;
    c.fillStyle = "#fff"; c.beginPath(); c.arc(r.x, r.y, 2.2, 0, 6.283); c.fill();
    if (r.y <= r.ty) { explode(r.x, r.y); return false; }
    return true;
  });
  fx.parts = fx.parts.filter((p) => {
    p.vx *= Math.pow(0.985, k); p.vy = p.vy * Math.pow(0.985, k) + 0.05 * k;
    p.x += p.vx * k; p.y += p.vy * k; p.life -= p.decay * k;
    if (p.life <= 0) return false;
    c.globalAlpha = p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
    return true;
  });
  fx.conf = fx.conf.filter((p) => {
    p.s += 0.05 * k; p.x += (p.vx + Math.sin(p.s) * 1.2) * k; p.y += p.vy * k; p.rot += p.vr * k;
    if (p.y > fx.h + 20) return false;
    c.globalAlpha = 0.9; c.fillStyle = p.col;
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
    return true;
  });
  c.globalAlpha = 1;

  if (!live && !fx.parts.length && !fx.rockets.length && !fx.conf.length && t > fx.rainUntil + 1500) {
    fx.on = false;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, fx.w, fx.h);
    return;
  }
  requestAnimationFrame(fxLoop);
}

/* ---------------------------------------------------------------------
   Single ticker: event clock + cooldown (one interval only)
   --------------------------------------------------------------------- */
function tick() {
  const now = Date.now();
  if (state.solved) {
    els.clock.textContent = formatClock(state.solvedElapsed);
    els.clockLabel.textContent = "FINISHED IN";
  } else {
    els.clock.textContent = started ? formatClock(now - startTime) : "00:00";
    els.clockLabel.textContent = "EVENT TIMER";
  }

  if (state.lockUntil && !state.solved) {
    const remaining = Math.ceil((state.lockUntil - now) / 1000);
    if (remaining <= 0) {
      state.lockUntil = 0;
      state.streak = 0;
      active = 0;
      render();
      say("System unlocked. You may try again.", "warn");
      focusEntry();
    } else {
      els.lockTime.textContent = formatClock(remaining * 1000);
    }
  }
}

function startTicker() {
  if (tickId !== null) clearInterval(tickId);
  tickId = setInterval(tick, 250);
}

/* ---------------------------------------------------------------------
   Events
   --------------------------------------------------------------------- */
function bindEvents() {
  els.entry.addEventListener("input", () => {
    [...els.entry.value.toUpperCase()].forEach((c) => {
      if (CHARSET.includes(c)) putChar(c);
      else if (!inputDisabled()) say(stage === 1 ? "Invalid character." : "Hex digits only: 0–9 and A–F.", "warn");
    });
    els.entry.value = "";
  });
  els.entry.addEventListener("beforeinput", (e) => {
    if (e.inputType === "deleteContentBackward") { e.preventDefault(); backspace(); }
  });
  els.entry.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveActive(1); }
  });
  els.entry.addEventListener("paste", (e) => {
    e.preventDefault();
    if (!inputDisabled()) pasteCode((e.clipboardData || window.clipboardData).getData("text"));
  });
  els.enter.addEventListener("click", () => { submit(); });
  els.terminal.addEventListener("click", (e) => {
    if (e.target === els.terminal && !inputDisabled()) els.entry.focus({ preventScroll: true });
  });

  els.briefToggle.addEventListener("click", () => {
    const open = els.brief.classList.toggle("open");
    els.briefToggle.setAttribute("aria-expanded", String(open));
  });

  els.play.addEventListener("click", startGame);
  window.addEventListener("resize", () => { if (fx.on) fxResize(); });
}

/* ---------------------------------------------------------------------
   Init + boot sequence
   --------------------------------------------------------------------- */
function init() {
  document.title = `${CONFIG.title}: ${CONFIG.subtitle.replace(/^THE /, "The ")}`;
  document.querySelectorAll(".js-title").forEach((n) => { n.textContent = CONFIG.title; });
  document.querySelectorAll(".js-sub").forEach((n) => { n.textContent = CONFIG.subtitle; });
  $("welcomeBy").textContent = CONFIG.presentedBy;
  $("welcomeEvent").textContent = CONFIG.eventName;
  $("welcomeTeam").textContent = CONFIG.teamName;
  $("phaseLabel").textContent = CONFIG.phaseLabel;

  const errors = validateConfig(CONFIG);
  if (errors.length) {
    els.configError.hidden = false;
    els.configError.textContent = "Configuration error: " + errors.join(" ");
    els.enter.disabled = true;
    els.entry.disabled = true;
    document.body.classList.remove("intro");
    els.welcome.hidden = true;
    return;
  }

  state = { ...defaults };
  try { localStorage.removeItem("hexlock.finalKey.v1"); } catch (e) { /* ignore */ }

  const mobile = window.matchMedia("(max-width: 820px)").matches;
  els.brief.classList.toggle("open", !mobile);
  els.briefToggle.setAttribute("aria-expanded", String(!mobile));

  fillList(els.rules, els.rulesSec, CONFIG.rules, false);
  fillList(els.clues, els.cluesSec, CONFIG.clues, false);
  buildSlots();
  bindEvents();
  render();
  tick();
  startTicker();
}

function startGame() {
  if (started || document.body.classList.contains("boot")) return;
  teamName = CONFIG.teamName;
  els.team.textContent = teamName;
  sfx.init();

  document.body.classList.remove("intro");
  document.body.classList.add("boot");
  els.welcome.classList.add("leaving");
  setTimeout(() => { els.welcome.hidden = true; }, 700);

  // the title is typed out while the panels fade in; the timer starts once the lock is ready
  els.codeTitle.textContent = "";
  setTimeout(() => typeText(els.codeTitle, CONFIG.titles.stage1, 38), reducedMotion.matches ? 0 : 2300);
  setTimeout(() => {
    started = true;
    startTime = Date.now();
    document.body.classList.add("booted");
    slotEls.forEach((s) => s.classList.remove("boot-slot"));
    render();
    tick();
    focusEntry();
  }, reducedMotion.matches ? 100 : 4700);
}

init();