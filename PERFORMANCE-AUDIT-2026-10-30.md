# Public website performance audit — 2026-10-30

## Findings and changes

The public website is static HTML/CSS/JavaScript, without React or hydration. Its production image pipeline already creates responsive AVIF/WebP variants, avoids advertising larger re-encodes, preserves gallery sources, and uses immutable caching for content-addressed assets. Team portraits already have reviewed 480/960px WebP variants, lazy loading, dimensions and asynchronous decoding. No photographs were modified or recompressed by this change.

The main demonstrated waste was continuous CSS animation in offscreen sections. This includes animated grids, glows, ornaments and pseudo-elements throughout the site, not just Halloween. A single IntersectionObserver now pauses top-level main sections outside a 120px viewport margin. Animation timelines resume without restarting. Hidden documents pause all CSS animations. The observer disconnects on pagehide and resumes on pageshow, including back/forward cache restoration. Existing reduced-motion rules remain intact.

News scroll-progress updates are coalesced to one animation frame, with pending work cancelled on pagehide. The back-to-top control only changes its class when its visibility threshold is crossed. Expired gala/camp countdowns no longer install a redundant interval after their initial update.

No new application dependencies, layout/typography changes, image changes or animation removal. Existing gradients, blur, shadows, hover transitions and the once-per-session pumpkin entrance remain. No speculative memoization or architecture rewrite.

## Measurement method

Node 22.23.2, Playwright Chromium headless, Linux/WSL. Production build saved before application edits; same static allowlist server serves that snapshot and the optimized dist. Eight pages at 1440×1000 and 390×844, DPR 1, normal motion, fresh browser contexts. All images are scrolled into view; idle workload is sampled for 1.5 seconds at the bottom of each page after a 500ms settling period. CDP TaskDuration measures renderer main-thread work, not total system/GPU CPU usage. Running animations include visible and offscreen CSS animations/pseudo-elements.

External requests (including Sender, hosted fonts/images and staff APIs) are blocked identically in both phases. Local raw resource body sizes are measured, without CDN compression, network/CPU throttling or real smartphone hardware. These are controlled local observations, not field Web Vitals or a Lighthouse score. The entire matrix ran once; homepage results were repeated against the final build. The only intervening application edit was the same expired-timer guard for the gala countdown.

## Results

Repeated homepage measurement against the final build:

| Metric | Desktop before → after | Mobile before → after |
|---|---:|---:|
| Running animations at page bottom | 28 → 1 | 19 → 1 |
| Main-thread work in 1.5s idle sample | 118.1 → 3.7ms | 109.2 → 33.9ms |
| Style recalculation in sample | 38.1 → 0.3ms | 32.3 → 4.7ms |
| FCP / LCP | 176 → 164ms | 120 → 164ms |
| Initial CLS | 0.00095 → 0.00095 | 0 → 0 |
| Total local resource bodies after image traversal | 1,183,653 → 1,185,377 bytes | 984,278 → 986,002 bytes |
| External JS resource bodies | 299,698 → 300,943 bytes | 299,698 → 300,943 bytes |
| Sampled JS heap | 2,097,412 → 2,097,516 bytes | 2,087,444 → 2,076,008 bytes |

The first homepage run independently measured 129.9 → 3.5ms desktop and 129.1 → 16.0ms mobile main-thread work. This supports lower offscreen work; timing variation means there is no defensible initial-load or memory improvement claim. The added visibility controller costs roughly 1.7KB of uncompressed JS/CSS per page. JS is served as individual scripts, not a bundled React application; inline script bytes are not included in the JS resource total.

Running-animation counts across the initial full matrix:

| Page | Desktop before → after | Mobile before → after |
|---|---:|---:|
| index.html | 28 → 1 | 19 → 1 |
| uudised.html | 23 → 10 | 18 → 5 |
| laager.html | 34 → 12 | 28 → 6 |
| tunnustusgala.html | 90 → 11 | 85 → 5 |
| street.html | 75 → 13 | 60 → 5 |
| vorgustik.html | 35 → 12 | 27 → 5 |
| dokumendid.html | 17 → 15 | 12 → 10 |
| privaatsuspoliitika.html | 17 → 15 | 12 → 10 |

CPU reductions were not uniform: desktop gala and privacy idle samples were slightly worse despite fewer animations, while the other matrix samples improved. Visible decorations and fixed seasonal effects on secondary pages intentionally keep running. Raw FCP/LCP/CLS, transfer, heap, error and timing data are saved in `tools/performance-results-2026-10-30.json`.

## Verification

- Production build and syntax/site/seasonal checks pass.
- Final validation: all 346 tests passed; TypeScript typecheck passed.
- All eight public pages at both audit widths: zero JavaScript errors, broken displayed images or horizontal overflow.
- Production gallery browser tests pass at 1440, 768 and 390px: all eight photo triggers; portrait aspect ratio and viewport fit; Enter opening; close button/backdrop/Escape; focus trapping/restoration; no background shift; ET/RU/EN team labels; responsive columns.
- Halloween entrance leaves controls usable, ends normally, does not repeat on reload; reduced motion and seasonal expiration pass.
- New checks verify offscreen pause, visible resume, and simulated hidden-document pause/resume. Mobile navigation opens and closes with Escape.
- Visually inspected desktop/mobile homepage and mobile enlarged-photo screenshots. No exhaustive pixel-diff comparison was performed.

## Remaining limitations

Field INP, real-device scrolling frame rate, GPU/browser-process memory and CPU, production CDN/cache behavior and real third-party latency were not measured. No sustained heap-leak profiling was performed. No live form submissions or authenticated staff operations were performed. External services require live-production verification.

Some visible decorations animate paint-heavy backgrounds or use blur/backdrop filters. They retain their current rendering to preserve the appearance; converting masked backgrounds to transformed layers would require visual equivalence work. Other pages' small progress handlers still run on passive scroll events; no measured regression justified a broader rewrite. The already-efficient image pipeline and font/system fallback styling were left alone. Network latency and third-party scripts can still affect real-world loading.

Reproduce after saving a pre-change production `dist` outside the build output:

```sh
node tools/performance-audit.mjs OUTPUT_DIRECTORY BEFORE_BUILD_DIRECTORY
node staff-app/test/team-gallery.browser.mjs dist
```

Playwright and its browser must be available to Node (temporary tooling was installed outside the repository). Optional audit arguments select `before` or `after`, then a page filename. No secret files were opened or changed. Changes have not been deployed.
