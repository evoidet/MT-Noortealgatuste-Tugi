import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  SEASONAL_EFFECTS_CONFIG,
  createSeasonalEffects,
  getSeasonalEffectsState
} from "../seasonal-effects.js";

function localDate(year, month, day, hour = 12, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second);
}

assert.deepEqual(SEASONAL_EFFECTS_CONFIG, {
  autumn: { start: "2026-10-04", end: "2026-11-30" },
  halloween: { start: "2026-10-20", end: "2026-11-01" }
});
assert.equal(Object.isFrozen(SEASONAL_EFFECTS_CONFIG), true);
assert.equal(Object.isFrozen(SEASONAL_EFFECTS_CONFIG.autumn), true);
assert.equal(Object.isFrozen(SEASONAL_EFFECTS_CONFIG.halloween), true);

const cases = [
  [localDate(2026, 10, 3), "2026-10-03", false, false],
  [localDate(2026, 10, 4), "2026-10-04", true, false],
  [localDate(2026, 10, 19), "2026-10-19", true, false],
  [localDate(2026, 10, 20), "2026-10-20", true, true],
  [localDate(2026, 11, 1), "2026-11-01", true, true],
  [localDate(2026, 11, 2), "2026-11-02", true, false],
  [localDate(2026, 11, 30), "2026-11-30", true, false],
  [localDate(2026, 12, 1), "2026-12-01", false, false],
  [localDate(2025, 10, 20), "2025-10-20", false, false],
  [localDate(2027, 10, 20), "2027-10-20", false, false]
];

for (const [date, dateKey, autumn, halloween] of cases) {
  assert.deepEqual(getSeasonalEffectsState(date), {
    dateKey,
    autumn,
    halloween
  });
}

assert.equal(getSeasonalEffectsState(localDate(2026, 10, 4, 0, 0, 0)).autumn, true);
assert.equal(getSeasonalEffectsState(localDate(2026, 11, 1, 23, 59, 59)).halloween, true);
assert.deepEqual(getSeasonalEffectsState(localDate(2026, 11, 2, 0, 0, 0)), {
  dateKey: "2026-11-02",
  autumn: true,
  halloween: false
});
assert.equal(getSeasonalEffectsState(localDate(2026, 11, 30, 23, 59, 59)).autumn, true);
assert.deepEqual(getSeasonalEffectsState(localDate(2026, 12, 1, 0, 0, 0)), {
  dateKey: "2026-12-01",
  autumn: false,
  halloween: false
});
assert.deepEqual(getSeasonalEffectsState(new Date(Number.NaN)), {
  dateKey: "",
  autumn: false,
  halloween: false
});

const moduleSource = await readFile(
  fileURLToPath(new URL("../seasonal-effects.js", import.meta.url)),
  "utf8"
);

for (const forbidden of ["requestAnimationFrame", "setInterval", "<canvas", "WebGL"]) {
  assert.equal(moduleSource.includes(forbidden), false, `Unexpected ${forbidden} usage`);
}

// Exercise lifecycle behavior without browser timers or external dependencies.
function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) {
      assert.equal(listeners.get(type), callback);
      listeners.delete(type);
    },
    emit(type) { listeners.get(type)?.(); }
  };
}

function element() {
  return {
    children: [], dataset: {}, style: { setProperty() {} },
    setAttribute() {},
    append(child) { this.children.push(child); child.parent = this; },
    remove() {
      if (this.parent) {
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = null;
      }
    }
  };
}

const documentRef = { ...eventTarget(), body: element(), createElement: element, visibilityState: "visible" };
const media = { ...eventTarget(), matches: false };
const timers = new Map();
let timerId = 0;
const windowRef = {
  matchMedia: () => media,
  setTimeout(callback, delay) {
    assert.ok(delay >= 1000 && delay <= 25 * 60 * 60 * 1000);
    timers.set(++timerId, callback);
    return timerId;
  },
  clearTimeout(id) { timers.delete(id); }
};
let currentDate = localDate(2026, 10, 19, 23, 59, 59);
const options = { windowRef, documentRef, now: () => currentDate };
const controller = createSeasonalEffects(options);
assert.equal(createSeasonalEffects(options), controller);
assert.equal(documentRef.body.children.length, 1);
assert.equal(documentRef.body.children[0].children.length, 8);
assert.equal(timers.size, 1);
const firstLayer = documentRef.body.children[0];
for (let i = 0; i < 100; i++) controller.refresh();
assert.equal(documentRef.body.children[0], firstLayer);
assert.equal(timers.size, 1);

for (const [date, count] of [[localDate(2026, 10, 20), 10], [localDate(2026, 11, 2), 8], [localDate(2026, 12, 1), 0]]) {
  currentDate = date;
  const [id, callback] = timers.entries().next().value;
  timers.delete(id);
  callback();
  assert.equal(documentRef.body.children.length, count ? 1 : 0);
  assert.equal(documentRef.body.children[0]?.children.length ?? 0, count);
  assert.equal(timers.size, 1);
}

currentDate = localDate(2026, 10, 25);
controller.refresh();
documentRef.visibilityState = "hidden";
documentRef.emit("visibilitychange");
assert.equal(documentRef.body.children[0].dataset.paused, "true");
documentRef.visibilityState = "visible";
documentRef.emit("visibilitychange");
assert.equal(documentRef.body.children[0].dataset.paused, "false");
media.matches = true;
media.emit("change");
assert.equal(documentRef.body.children.length, 0);
media.matches = false;
media.emit("change");
assert.equal(documentRef.body.children.length, 1);
currentDate = localDate(2026, 12, 1);
documentRef.emit("visibilitychange");
assert.equal(documentRef.body.children.length, 0);
controller.destroy();
assert.equal(timers.size, 0);
assert.equal(documentRef.listeners.size, 0);
assert.equal(media.listeners.size, 0);
const replacement = createSeasonalEffects(options);
assert.notEqual(replacement, controller);
replacement.destroy();

console.log("Seasonal date boundaries, lifecycle, cleanup and lightweight implementation checks passed.");
