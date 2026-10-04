import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  SEASONAL_EFFECTS_CONFIG,
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

console.log("Seasonal effect date boundaries and lightweight implementation checks passed.");
