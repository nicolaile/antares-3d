# Antares

The Antares website: a SvelteKit 2 + Svelte 5 site, prerendered to static HTML and hosted on Vercel. The R1 explorer on
the home page draws the reactor's CAD in WebGL with three.js; motion is GSAP (ScrollTrigger, SplitText) with Lenis
smooth scrolling.

## Setup

Node 24 (see `.nvmrc`; anything from 22.12 works).

```sh
npm install
npm run dev
```

| Script            | What it does                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `npm run dev`     | Dev server, with the dev tools below                                             |
| `npm run build`   | Production build; every page is prerendered                                      |
| `npm run preview` | Serves the production build locally                                              |
| `npm run check`   | Design-token lint (`scripts/check-system.mjs`), then `svelte-check` (TypeScript) |
| `npm run lint`    | Prettier and ESLint                                                              |
| `npm run format`  | Prettier, writing                                                                |

CI (`.github/workflows/ci.yml`) runs `check`, `lint` and `build` on every push to `main` and on pull requests.

## Project layout

```
src/
  routes/              one folder per page; +layout.svelte holds the header, menu and dev tools
  lib/
    content/           all copy, links and images, one file per page (site.ts: menu and footer)
    chrome/            header bar, menu, footer, brand mark
    components/        small reusable UI (buttons, picture, badges); cards/ for the card family
    modules/           content-driven page blocks, reused across pages
    sections/home/     the home page's own compositions
    explorer/          the R1 explorer: its 3D stage, energy diagram and labels
    three/             WebGL: viewer/ (model viewer and studio look), post/ (passes), cad/ (CAD drawings)
    energy/            the energy-flow diagram's paths and timing
    motion/            scroll (Lenis + GSAP setup), reveal and text effects
    layout/            Row and Cell, the 12-column grid
    styles/            design tokens: colors.css, typography.css, spacing.css
    tokens/            read the token CSS for the /design-system page
    dev/               dev-only tools (layout grid, perf readout)
    assets/            images, video and icons, imported through @sveltejs/enhanced-img
static/                fonts, the HDR environment, textures and the web models (models/landing, models/cad/web)
```

### Content

Text, links and images live in `src/lib/content/*.ts`, typed, one file per page. Pages and modules only lay content out.
Images are imported with `?enhanced` (or `?w=…&enhanced`) so the build emits AVIF/WebP at the sizes used; render them
with `components/Picture.svelte`.

### Design system

`src/lib/styles/` is the single source of colour, type and spacing. Components use its tokens (`var(--grey-700)`,
`var(--space-16)`) and `.type-*` classes, never raw values; `npm run check` fails on a stray font size, hex colour or
pixel margin. `/design-system` (dev only) shows every token.

Sizes scale with the viewport: `--size-font` (`src/app.css`, Osmo's scaling system) is one design unit at the current
width, so the tokens, all multiples of it, track the 1440px design (834px on tablet, 550px on phone) and stop growing
at each breakpoint's maximum. Breakpoints: 991px (tablet), 767px (phone), 479px (small phone).

### Motion

GSAP only, no CSS transitions, and every effect checks `prefersReducedMotion()` (`$lib/motion/scroll`). Lenis drives
scrolling; get it with `getLenis()` rather than `window.scrollTo`.

## Dev tools

Only in `npm run dev`:

- **G** toggles the 12-column layout grid.
- **Shift+H** shows the render and energy tuning panels on the R1 explorer.
- `?controls` adds the energy tuning panel; `?perf` adds the 3D perf readout and measuring runs.
- `/design-system` lists the tokens and type styles.

## 3D models

The site loads web-ready `.glb` models from `static/models/landing` (the R1 explorer) and `static/models/cad/web` (the
isometric drawing). They are built from the client's CAD by a separate pipeline that is not part of this repository;
replace the files in place to update a model.

## Deploying

Vercel builds every push: each branch gets a preview URL, and production deploys from the branch set in the Vercel
project. Nothing reads environment variables.
