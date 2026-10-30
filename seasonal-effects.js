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
const INTRO_KEY = "noortetugi-halloween-intro-2026";
// Inline vector artwork: no image download, animation library or per-frame JavaScript.
const JACK_O_LANTERN = `<svg viewBox="0 0 160 150" aria-hidden="true" focusable="false">
  <defs><radialGradient id="halloween-shell"><stop stop-color="#ffb04b"/><stop offset=".65" stop-color="#ed7924"/><stop offset="1" stop-color="#a83d19"/></radialGradient></defs>
  <path d="M78 38Q72 16 91 12L99 22Q83 22 87 39" fill="#526536"/>
  <path d="M88 29Q112 14 122 33Q107 41 88 29" fill="#71864b"/>
  <ellipse cx="80" cy="88" rx="67" ry="52" fill="url(#halloween-shell)"/>
  <ellipse cx="80" cy="88" rx="42" ry="52" fill="none" stroke="#be4c1d" stroke-width="3" opacity=".55"/>
  <ellipse cx="80" cy="88" rx="19" ry="52" fill="none" stroke="#ffbc5a" stroke-width="2" opacity=".5"/>
  <path d="m43 76 23-13 4 22Zm47 9 4-22 23 13ZM41 99l16 4 3-8 13 10 13-1 9-10 5 8 19-5q-10 29-39 28T41 99" fill="#51281c"/>
  <path d="m48 76 16-8 2 12Zm46 4 2-12 16 8ZM48 104l12 4 4-6 9 9 15-1 8-8 3 6 13-5q-12 17-32 17t-32-16" fill="#ffe29b"/>
  <path d="m75 92 5-9 6 9Z" fill="#ffe29b"/>
</svg>`;

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
  let pumpkin = null;
  let introSeen = false;

  function syncHalloween(state) {
    // The extra atmosphere belongs to the homepage only; other pages retain their existing effects.
    const hero = documentRef.querySelector?.(".home-hero");
    if (!hero) return;
    hero.classList.toggle("is-halloween", state.halloween);
    if (!state.halloween) {
      pumpkin?.remove();
      pumpkin = null;
      return;
    }
    if (!pumpkin) {
      pumpkin = documentRef.createElement("div");
      pumpkin.className = "halloween-pumpkin";
      pumpkin.setAttribute("aria-hidden", "true");
      pumpkin.innerHTML = JACK_O_LANTERN;
      hero.append(pumpkin);
      try { introSeen ||= windowRef.sessionStorage.getItem(INTRO_KEY) === "seen"; } catch { /* Storage may be disabled. */ }
      if (!introSeen && !reducedMotion.matches) {
        pumpkin.classList.add("halloween-pumpkin--intro");
        pumpkin.addEventListener("animationend", () => pumpkin?.classList.remove("halloween-pumpkin--intro"), { once: true });
      }
      introSeen = true;
      try { windowRef.sessionStorage.setItem(INTRO_KEY, "seen"); } catch { /* In-memory guard still prevents restarts on this page. */ }
    }
    if (reducedMotion.matches) pumpkin.classList.remove("halloween-pumpkin--intro");
    pumpkin.style.animationPlayState = documentRef.visibilityState === "visible" ? "running" : "paused";
  }

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
      if (pumpkin) pumpkin.style.animationPlayState = "paused";
    }
  }

  function refresh() {
    const state = getSeasonalEffectsState(now());
    syncHalloween(state);
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
      (documentRef.querySelector?.(".home-hero") || documentRef.body).append(layer);
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
      pumpkin?.remove();
      pumpkin = null;
      documentRef.querySelector?.(".home-hero")?.classList.remove("is-halloween");
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
