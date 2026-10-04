const SEASONAL_EFFECTS_CONFIG = Object.freeze({
  autumn: Object.freeze({
    start: "2026-10-04",
    end: "2026-11-30"
  }),
  halloween: Object.freeze({
    start: "2026-10-20",
    end: "2026-11-01"
  })
});

const LEAF_SPECS = Object.freeze([
  { x: 6, size: 18, duration: 18, delay: -4, sway: -16, drift: 42, spin: 280, opacity: 0.52, color: "#b45f32", variant: 1 },
  { x: 31, size: 22, duration: 21, delay: -16, sway: 18, drift: -38, spin: -320, opacity: 0.46, color: "#c0832d", variant: 2 },
  { x: 61, size: 16, duration: 15, delay: -8, sway: -12, drift: 28, spin: 300, opacity: 0.58, color: "#8d4a2b", variant: 3 },
  { x: 88, size: 20, duration: 19, delay: -13, sway: 16, drift: -42, spin: -280, opacity: 0.5, color: "#9a6d2f", variant: 2 },
  { x: 16, size: 24, duration: 22, delay: -7, sway: 20, drift: 48, spin: 340, opacity: 0.42, color: "#7c6f2b", variant: 3, desktopOnly: true },
  { x: 44, size: 19, duration: 17, delay: -12, sway: -18, drift: 35, spin: -300, opacity: 0.54, color: "#b06a2e", variant: 1, desktopOnly: true },
  { x: 73, size: 23, duration: 20, delay: -2, sway: 15, drift: -46, spin: 310, opacity: 0.45, color: "#93402a", variant: 1, desktopOnly: true },
  { x: 96, size: 17, duration: 16, delay: -10, sway: -14, drift: -34, spin: -260, opacity: 0.56, color: "#bd782e", variant: 2, desktopOnly: true }
]);

const PUMPKIN_SPECS = Object.freeze([
  { x: 23, size: 18, duration: 28, delay: -11, sway: 14, drift: 34, spin: 180, opacity: 0.58, color: "#bc642d" },
  { x: 79, size: 20, duration: 31, delay: -23, sway: -16, drift: -38, spin: -170, opacity: 0.52, color: "#a95429", desktopOnly: true }
]);

const LEAF_MARKUP = Object.freeze([
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C8.2 6.1 4 7.1 4 12.3 4 16.8 7.4 20 12 20s8-3.2 8-7.7C20 7.1 15.8 6.1 12 2Z"/><path d="M12 6.2V22" fill="none" stroke="rgba(46,57,25,.55)" stroke-width="1.25" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 14.2C5.2 7.1 11.8 3.1 21 4.2c-.8 8.1-6.4 14.3-15.8 13.9L3 14.2Z"/><path d="M5.2 18.1c4.4-4.8 8.7-8.4 14.3-11.5" fill="none" stroke="rgba(46,57,25,.55)" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="m12 1.5 2.1 5 3.8-1.8-1.2 4.6 5.1 1-4.2 3 1.7 3.6-6.1-1.3-.2 6.8h-2l-.2-6.8-6.1 1.3 1.7-3.6-4.2-3 5.1-1-1.2-4.6 3.8 1.8 2.1-5Z"/></svg>`
]);

const PUMPKIN_MARKUP = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7.1c-.1-2 1-3.4 2.8-4.1" fill="none" stroke="#395723" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="12" cy="14" rx="8.5" ry="6.4" fill="currentColor"/><ellipse cx="12" cy="14" rx="4.5" ry="6.1" fill="none" stroke="rgba(91,48,22,.38)" stroke-width="1"/><path d="M8.1 9.5c-1.1 2.8-1.1 6.3 0 9M15.9 9.5c1.1 2.8 1.1 6.3 0 9" fill="none" stroke="rgba(91,48,22,.26)" stroke-width=".8" stroke-linecap="round"/></svg>`;
const ACTIVE_CONTROLLERS = new WeakMap();

function getLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isWithinRange(dateKey, range) {
  return dateKey >= range.start && dateKey <= range.end;
}

export function getSeasonalEffectsState(date = new Date()) {
  const dateKey = getLocalDateKey(date);
  const autumn = isWithinRange(dateKey, SEASONAL_EFFECTS_CONFIG.autumn);

  return {
    dateKey,
    autumn,
    halloween: autumn && isWithinRange(dateKey, SEASONAL_EFFECTS_CONFIG.halloween)
  };
}

function createEffectItem(documentRef, kind, spec) {
  const item = documentRef.createElement("span");
  item.className = `seasonal-effect-item seasonal-effect-item--${kind}`;
  item.dataset.seasonalKind = kind;

  if (spec.desktopOnly) {
    item.dataset.seasonalDesktopOnly = "true";
  }

  item.style.setProperty("--seasonal-x", `${spec.x}%`);
  item.style.setProperty("--seasonal-size", `${spec.size}px`);
  item.style.setProperty("--seasonal-duration", `${spec.duration}s`);
  item.style.setProperty("--seasonal-delay", `${spec.delay}s`);
  item.style.setProperty("--seasonal-sway", `${spec.sway}px`);
  item.style.setProperty("--seasonal-drift", `${spec.drift}px`);
  item.style.setProperty("--seasonal-spin", `${spec.spin}deg`);
  item.style.setProperty(
    "--seasonal-spin-mid",
    `${spec.spin * (kind === "pumpkin" ? 0.55 : 0.52)}deg`
  );
  item.style.setProperty("--seasonal-opacity", String(spec.opacity));
  item.style.setProperty("--seasonal-color", spec.color);
  item.innerHTML = kind === "leaf"
    ? LEAF_MARKUP[spec.variant - 1]
    : PUMPKIN_MARKUP;

  return item;
}

function createEffectsLayer(documentRef, state) {
  const layer = documentRef.createElement("div");
  layer.className = "seasonal-effects";
  layer.dataset.seasonalEffects = "";
  layer.dataset.seasonalMode = state.halloween ? "autumn-halloween" : "autumn";
  layer.setAttribute("aria-hidden", "true");

  for (const spec of LEAF_SPECS) {
    layer.append(createEffectItem(documentRef, "leaf", spec));
  }

  if (state.halloween) {
    for (const spec of PUMPKIN_SPECS) {
      layer.append(createEffectItem(documentRef, "pumpkin", spec));
    }
  }

  return layer;
}

function millisecondsUntilNextLocalDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 24 * 60 * 60 * 1000;
  }

  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    50
  );

  return Math.max(1000, nextDay.getTime() - date.getTime());
}

export function createSeasonalEffects({
  windowRef = window,
  documentRef = document,
  now = () => new Date()
} = {}) {
  const existingController = ACTIVE_CONTROLLERS.get(documentRef);

  if (existingController) {
    return existingController;
  }

  const reducedMotion = windowRef.matchMedia("(prefers-reduced-motion: reduce)");
  let layer = null;
  let activeMode = "";
  let midnightTimer = 0;

  function removeLayer() {
    layer?.remove();
    layer = null;
    activeMode = "";
  }

  function syncVisibility() {
    if (layer) {
      layer.dataset.paused = documentRef.visibilityState === "visible" ? "false" : "true";
    }
  }

  function handleVisibilityChange() {
    if (documentRef.visibilityState === "visible") {
      refresh();
    } else {
      syncVisibility();
    }
  }

  function refresh() {
    const state = getSeasonalEffectsState(now());
    const nextMode = state.autumn
      ? state.halloween ? "autumn-halloween" : "autumn"
      : "";

    if (reducedMotion.matches || !nextMode) {
      removeLayer();
      return state;
    }

    if (!layer || activeMode !== nextMode) {
      removeLayer();
      layer = createEffectsLayer(documentRef, state);
      documentRef.body.append(layer);
      activeMode = nextMode;
    }

    syncVisibility();
    return state;
  }

  function scheduleMidnightRefresh() {
    windowRef.clearTimeout(midnightTimer);
    const currentDate = now();
    midnightTimer = windowRef.setTimeout(function () {
      refresh();
      scheduleMidnightRefresh();
    }, millisecondsUntilNextLocalDay(currentDate));
  }

  function handleReducedMotionChange() {
    refresh();
  }

  documentRef.addEventListener("visibilitychange", handleVisibilityChange);

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", handleReducedMotionChange);
  } else {
    reducedMotion.addListener(handleReducedMotionChange);
  }

  refresh();
  scheduleMidnightRefresh();

  const controller = {
    refresh,
    destroy() {
      windowRef.clearTimeout(midnightTimer);
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);

      if (typeof reducedMotion.removeEventListener === "function") {
        reducedMotion.removeEventListener("change", handleReducedMotionChange);
      } else {
        reducedMotion.removeListener(handleReducedMotionChange);
      }

      removeLayer();
      ACTIVE_CONTROLLERS.delete(documentRef);
    }
  };

  ACTIVE_CONTROLLERS.set(documentRef, controller);
  return controller;
}

export { SEASONAL_EFFECTS_CONFIG };

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const startSeasonalEffects = function () {
    createSeasonalEffects();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSeasonalEffects, { once: true });
  } else {
    startSeasonalEffects();
  }
}
