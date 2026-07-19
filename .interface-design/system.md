# PA Chamber Intelligence — Design System

**Feel:** An institutional research desk — a printed endorsement brief that happens to be interactive. Authoritative, calm, print-adjacent. Never startup-flashy.

**Signature:** Small-caps letter-spaced overlines (`.overline`) directly above serif headlines (Newsreader); ALL figures (scores, counts, money, district numbers) in tabular mono via `.figure` class. NO decorative rules under overlines — the user removed `.brass-rule` as clutter; do not reintroduce it.

## Fonts (set in app/layout.tsx)
- `font-serif` (Newsreader) — h1/h2/h3 automatically serif via globals.css; candidate names, page titles
- `font-sans` (Inter) — UI text, body
- `font-mono` (IBM Plex Mono) — via `.figure` class: any number the user reads (scores, %, $, counts, HD-districts)

## Tokens (CSS vars in globals.css — always prefer over hex)
- Text: `--ink` #131a26, `--ink-secondary` #4c5364, `--ink-tertiary` #878d9b, `--ink-faint` #c6c8ce
- Surfaces: `--paper` #f7f5f0 (body/canvas), `--card` #fffefb (cards), `--well` #efece3 (inset: inputs, bar tracks)
- Borders: `--rule` (standard), `--rule-soft` (quiet), `--rule-strong` (hover/emphasis)
- Accent: `--brass` #96762e (TEXT-safe), `--brass-bright` #c9a84c (graphics/icons only, fails contrast as text), `--brass-wash` (tinted bg)
- Semantic: `--verdigris` #2f6f52 (aligned/good/success), `--oxblood` #9e3b31 (opposed/bad/error)
- Tailwind: `primary-*` scale is warm ink (950 strongest); `brass`, `verdigris`, `oxblood`, `democrat-*`, `republican-*` (desaturated institutional party colors)

## Legacy hex → token map (for sweeping old code)
- `#c9a84c` as text → `var(--brass)`; as icon/graphic → `var(--brass-bright)`
- `#92722f` → `var(--brass)`
- `#0a1628`, `#0a0e1a`, `#07111f`, `#1a1a2e`, `#2a2a42` → `var(--ink)` / `text-primary-950`
- `#16a34a`, `#22c55e` → `var(--verdigris)`; `#dc2626`, `#ef4444` (non-party) → `var(--oxblood)`
- `#6b7280`/`#4b5563` → `var(--ink-secondary)`; `#9ca3af` → `var(--ink-tertiary)`; `#d1d5db` → `var(--ink-faint)`
- `#f3f4f6`, `#f9fafb`, `#fafafa` → `var(--well)` (inset) or `var(--paper)` (canvas)
- `#e8e4dc` decorative numbers → `.figure` + `var(--brass)`

## Depth: borders-only
- `.card` = card bg + 1px `--rule` + 10px radius. `.card-hover` adds border-darken + whisper shadow. NO other shadows, NO hover:scale.
- Dark navy section backgrounds → light `--card`/`--paper` bands separated by rules. The app has NO dark sections (header/footer are light).

## Components/classes
- Buttons: `.btn-primary` (ink, 6px radius), `.btn-secondary` (hairline border). NEVER pill/rounded-full buttons.
- Section headers: `.overline` then serif h2 with `mt-3`.
- Badges: rectangular `rounded-sm`, tinted bg + dark text, 0.68rem, no borders (see Badge.tsx).
- Score colors via `getScoreColor()`: verdigris ≥0.8, ink ≥0.6, slate ≥0.4, oxblood <0.4. Confidence stays monochrome.
- Radius scale: 4px chips, 6px buttons/inputs, 10px cards. Nothing rounder except avatars.
- Spacing: 4px base; card padding p-5/p-7; sections py-16→py-24.

## Rules
- No decorative animation (particles, sweeps, floats). Only `hero-fade-up` entrances and 150ms color/border transitions.
- Icons: existing inline SVG + Keystone mark only. Keystone tinted `--brass-bright`.
- Party colors ONLY for party identity (badges, map fills), never for scores.
