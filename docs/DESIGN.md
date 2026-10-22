# DESIGN.md: VIGHNAWAY design direction and system

Owner: Design lead (Mobile owner). Tokens live in `packages/tokens/src/index.ts`; this document and
that file change together. Full brief: BUILD_PROMPT.md section 6.

## 1. Mood and principles

Night-shift control room meets premium cartography: a deep navy map, one crisp teal route, warm
off-white panels. Amber and red appear only when something is wrong.

1. **Answer first.** ETA, route and a one-line reason come first; evidence is one tap away.
2. **Evidence always travels with a hazard:** source (Simulated, User report, Operator), status
   (Unverified, Corroborated (2 devices), Verified, Stale, Conflicting, Resolved) and age.
3. **One accent per screen.** Colour is never the only signal: every state also has a shape, a
   line style or a word.
4. **Motion explains change**, never decorates.
5. **Avoid:** gradients, glassmorphism, generic admin layouts, mixed icon sets, emoji, stock
   illustrations, exclamation marks, two bold colours competing.

## 2. Tokens (source: `@vighnaway/tokens`)

| Token | Value | Use |
| --- | --- | --- |
| `shell` | #0B1426 | Map base, console background, splash |
| `shellRaised` / `shellLine` | #13203A / #22314F | Console cards and dividers on navy |
| `panel` | #F7F5F0 | Sheets, cards, dialogs |
| `panelDark` | #111C33 | Stretch dark panel theme only |
| `ink` / `inkMuted` | #0F172A / #475569 | Text on panels |
| `inkOnShell` / `inkOnShellMuted` | #E8EDF5 / #9AA8BF | Text on navy |
| `routeRecommended` | #14B8A6 | Recommended route, primary buttons |
| `routeRecommendedCasing` | #064E47 | Dark casing under the teal route |
| `routeTravelled` | #0F766E | Part of the route already driven |
| `routeMuted` | #94A3B8 | Usual fastest and alternatives |
| `warn` / `warnInk` / `warnSurface` | #F59E0B / #92400E / #FEF3C7 | Unverified hazards, cautions (ink for AA text on panels) |
| `danger` / `dangerInk` / `dangerSurface` | #DC2626 / #991B1B / #FEE2E2 | Verified closures, Not viable |
| `positive` / `positiveInk` | #16A34A / #166534 | Resolved and Reachable only |
| `floodProne` | #38BDF8 at 35% | Known-risk underlay, dotted |
| spacing | 4, 8, 12, 16, 24, 32 | 8-point grid (`xxs`..`xl`) |
| radius | sheet 20, card 14, chip 999, button 12 | |
| sheet peek | 280 (grows with content at large font sizes) | Navigate sheet's lowest snap point |

**Type:** Inter. ETA 32/38 bold with tabular numerals; titles 18/24 semibold; body 15/22; metadata
13/18 medium (never smaller). Console base 18 px, titles 24, clock 40 bold tabular. Respect system
font scaling; layouts wrap instead of clipping.

Hard-coded colours or sizes outside `packages/tokens` fail review (lint rule in each app).

## 3. Map style

`googleMapStyle` in tokens: navy land, roads one step lighter and colourless, motorways slightly
brighter, water deeper blue, parks muted, labels light grey with a navy halo, business and tourist
POIs hidden, hospitals kept, the railway line drawn light and clearly visible (it is the barrier the
story is about). Teal, amber and red never appear in the basemap. Flood-prone segments get a dotted
sky-blue underlay before any incident arrives. The console uses the same style.

## 4. Routes and markers

| Role | Line |
| --- | --- |
| Recommended | 6 px teal over a 9 px dark casing |
| Usual fastest | 4 px slate |
| Alternative | 3 px slate at 60% |
| Not viable | 4 px red, dashed where supported (Android), plus a cross marker on the blocking segment and the words "Not viable" |
| Travelled | 6 px darker teal |

Z-order bottom to top: flood-prone underlay, alternatives, usual fastest, blocked, recommended,
travelled, blocking marker, incident markers, vehicle.

**Incident marker:** a Lucide-grid glyph (24 units, 2-unit stroke) in a 36 px circle. Glyphs:
flood (droplet over waves), closure (barrier), congestion (stacked cars), debris, accident
(triangle). Ring by status: dashed = Unverified, double = Corroborated, solid = Verified, grey with a
strike = Resolved or Dismissed. A small age pill underneath ("12 min"). Selected: scale 1.15 with a
soft shadow. Origin: pulsing teal dot. Destination: hospital pin with a cross. Vehicle: teal arrow
with heading.

Icons: Lucide only (`lucide-react-native`, `lucide-react`).

## 5. Signature elements

1. **Route strip:** a slim horizontal bar from origin to destination with hazard ticks at their
   real positions (`hazards[].positionM / distanceM`) and the crossing labelled (underpass,
   flyover, bridge, footbridge). Same component idea on phone (react-native-svg) and console (SVG).
2. **Why this route card:** three lines with icons, always in this order: Avoids (reason),
   Trade-off ("+6 min compared with the usual fastest route"), Re-check if.
3. **Evidence chips:** Verified (solid ring), Corroborated (double ring, "2 devices"), Unverified
   (dashed), Stale (clock icon), Conflicting (split icon), and a Simulated badge.
4. **Confidence meter:** three segments plus the word High, Medium or Low. Never a percentage.
5. **Route-change moment:** identical sequence on phone and console (section 6).

## 6. Motion and haptics

| Moment | Motion | Timing | Haptic |
| --- | --- | --- | --- |
| App launch | Splash fades to map; routes reveal from origin outward | 600 ms ease-out | None |
| Evaluating | Shimmer on cards with "Checking 4 routes against 6 incidents" | at least 400 ms | None |
| Route change | Blocking segment flashes red twice; old route dims to slate and thins; new route fades in; camera fits both; banner slides down from the sheet top; ETA rolls | ~900 ms | Warning |
| New incident | Marker drops in (scale 0 → 1.1 → 1), ring pulses twice | 350 ms spring | Light |
| Status upgrade | Ring morphs dashed → double → solid; chip cross-fades | 250 ms | Selection |
| Sheet snap | Spring, moderate damping, no overshoot | spring | None |
| Primary press | Scale 0.97 | 100 ms | Light |
| Report sent | Button morphs into a check; toast | 300 ms | Success |
| No viable route | Sheet expands, map dims to 40%, calm full-sheet message | 300 ms | Warning |

Animate transform and opacity only; 60 fps on a mid-range Android phone; everything instant when
reduce motion is on. react-native-maps polylines cannot animate stroke: reveal by adding coordinates
progressively over ~600 ms, or cross-fade if that stutters.

## 7. Console look

Navy shell, 18 px base text, generous spacing, designed for 1920×1080 on a projector.
Left: incident queue grouped by status with evidence chips and Verify / Resolve / Dismiss. Centre:
large map. Right: simulation controls, a live clock with tabular numerals, the demo trip's route
cards with route strips, a styled QR card for /report. Bottom: thin ticker of the last five changes
in plain language. Nothing is available only on hover. When an operator verifies, the incident card
and its marker pulse together and the route cards play the same route-change motion as the phone.

## 8. App icon, splash, illustrations

Mark: a route line bending around an obstacle, teal on navy. Wordmark "VIGHNAWAY" in Inter
semibold, letter-spaced 0.08em, on the splash and first-run screen only. Android adaptive icon;
navy splash with the centred mark. Four two-colour line illustrations in the Lucide stroke style:
no incidents, offline, no viable route, report sent (original artwork in `apps/*/assets`).

## 9. Copy rules

- Short, calm, specific; numbers over adjectives: "Route changed. Flooding (knee deep) at Andheri
  Subway: Corroborated (2 devices), Simulated. New route via Gokhale Bridge adds 5 min."
- Never "safe", "safest", "guaranteed" or a safety percentage (`findForbiddenWords` in contracts;
  the only allowed phrase is the mandated "Turn back only where it is safe to do so").
  Use "recommended", "viable", "no reported hazards".
- Corroboration is "Corroborated (2 devices)", never "confirmed".
- Everything from the scenario is labelled Simulated.
- No exclamation marks. All strings in one i18n file per app.

## 10. Do and don't

| Do | Don't |
| --- | --- |
| "Recommended · 15 min · Medium confidence" | "Safest route 98%" |
| Dashed amber ring + "Unverified" | Amber colour alone |
| "No recent reports on Andheri Subway" | "Andheri Subway may be flooded" |
| One teal accent per screen | Teal buttons next to teal routes next to teal chips |
| "Simulated" badge in the header all session | Hiding that the scenario is simulated |

## 11. v2: premium direction (partly superseded)

> docs/DESIGN_VISION.md replaces this section's motion and typography rules: no perpetual
> motion or decorative glows, and mono/uppercase only for technical information.

The first build was correct but read as a debug dashboard. v2 keeps every rule about evidence,
labels, copy and colour meaning, and raises craft. One idea guides it: **a precision instrument
at night**: a deep navy field, one luminous teal decision, instrument readouts in mono, and motion
that shows cause and effect.

### 11.1 What changes from v1

- **Depth instead of boxes.** Surfaces are layered: `shellDeep` (map field) → `shell` → `shellRaised`
  → `shellOverlay`, separated by `shellHairline` borders and the `elevation` shadows (with the 1px
  `shellHighlight` inner top edge). No thick borders, no outlined warning boxes.
- **Restrained gradients are allowed** for depth only: a soft radial vignette on the map field, a
  faint teal glow under the recommended route, skeleton shimmer. Still no glassmorphism or frosted
  blur, no rainbow or decorative gradients, no gradient text.
- **Type:** Inter Variable for UI; JetBrains Mono for instrument readouts (clock, ETA digits,
  distances, ages, eyebrow labels in caps with `letterSpacing.eyebrow`). ETA hero uses
  `type.display` (48) with tabular figures.
- **One hero per screen.** The console's hero is the map; the decision card is the one cream
  surface on a navy screen (the answer stands out). The phone's hero is the sheet's ETA.
- **Status is quiet until it matters.** Connection and map-fallback notices become one compact pill
  (icon + short text, expandable), never full-width cards. Danger states (route change, no viable
  route, reversal) are the only loud elements.

### 11.2 Motion system (tokens `motion.*`)

| Element | Behaviour |
| --- | --- |
| Entrances | Fade + 8 px rise, `easeOut`, 250–400 ms, list items staggered by `motion.stagger` |
| Numbers (ETA, clock, counts) | Digit roll / tween; never jump |
| Recommended route | Draws in from origin (pathLength 0→1, 600 ms), then a slow flowing-dash highlight along it (`motion.routeFlow`) |
| Route change | v1 choreography (flash ×2 → old dims/thins → new draws in → banner springs in → ETA rolls) |
| Incidents | Marker drops in with spring; status ring morphs; live rings pulse (`motion.pulse`) while unverified |
| Loading | Skeletons with shimmer (`motion.skeletonShimmer`) shaped like the content; the "evaluating" state uses the `scan` Lottie with "Checking N routes against M incidents" |
| Success | `success` Lottie on report sent, then the toast |
| Press | Scale 0.97 + `springSnappy`; selected chips slide a shared indicator (layout animation) |
| Reduced motion | Every animation becomes an instant state change; Lottie shows its final frame |

Shared Lottie files: `packages/tokens/lottie/{scan,success}.json`, generated from tokens
(`pnpm --filter @vighnaway/tokens lottie`). **Rive:** the runtimes need `.riv` files authored in
the Rive editor, which this repository cannot produce; component boundaries are built so a
designer's `.riv` (e.g. an animated brand mark or route-change scene) can replace a Lottie or SVG
animation later without layout changes.

### 11.3 Schematic map (when Google Maps is unavailable)

It must look like premium cartography, not a debug plot: `shellDeep` field with a faint grid and
radial vignette; roads drawn by class (`roadMajor` wide, `roadMinor` thin) with smoothed corners;
the railway as a light track with cross-ties; the flood-prone underlay dotted sky blue; labels in
small caps mono with a navy halo and collision avoidance (drop lower-priority labels); routes with
casing and glow per `routeStyles`; markers per section 4 with pulsing rings; vehicle with a heading
cone. A small corner legend chip says "Schematic view, not a map".

### 11.4 Console layout (1920×1080)

Full-bleed map as the stage. Floating over it:
- **Top command bar:** wordmark, scenario + Simulated badge, centred mono clock with a rain-alert
  chip, Live/Reconnecting pill, operator lock.
- **Left rail (≈380 px):** incident feed grouped by status with counts, evidence chips, actions;
  empty state is a calm illustration, not a dashed box.
- **Right rail (≈440 px):** the decision card (cream): eyebrow "RECOMMENDED", route name, hero ETA,
  confidence meter, route strip, Why this route; below it the other routes as compact comparison
  rows with ETA delta bars.
- **Bottom timeline:** simulation transport (Play/Pause/Step/Reset) beside a scrubber showing the
  scripted events as ticks at their sim times with a moving playhead; the ticker of recent changes
  lives here.
- QR card collapses to a small floating button that expands.

### 11.5 Phone layout

Full-bleed map; top: one floating bar (menu, destination, compact status pill) and a single-row
segmented profile control with a sliding indicator; Simulated badge small in the bar. Sheet: eyebrow
+ route name, hero ETA with arrival clock, confidence meter, one-line reason, route strip, primary
action; half snap shows routes compared as rows with delta bars; report button floats with the
sheet. Report modal: 3×2 icon tiles; flood depth as a visual water-level selector on a figure;
compact location card; sticky send that morphs into the success animation.

## 12. v3: colour system, light and dark (superseded)

> **Superseded by docs/DESIGN_VISION.md** (the product owner's art direction). Its palette is
> now the source of truth in `packages/tokens/src/themes.ts`; the table below is kept for history.
> Orange Corroborated and indigo Live data were removed (no extra accent hues).

User feedback on v2: layout better, colours not aesthetic enough. Cream panels on navy read as two
competing backgrounds, and the palette was muted. v3 replaces it with **two complete themes**
(`themes.light`, `themes.dark` in `@vighnaway/tokens`, identical keys) and a more vivid,
WCAG-checked palette.

### 12.1 Which theme where

| Surface | Default | Why |
| --- | --- | --- |
| Console (projector) | **Light**, toggle to dark | Projectors wash dark navy out to grey in lit halls; a bright, high-contrast light theme reads from the back of the room |
| Phone | **Follow the system**, override in Settings | Dark at night (a monsoon-night emergency), light in daylight, where dark screens are hard to read outdoors |
| Report page (QR) | Follow the system | It opens on strangers' phones |

The map follows the theme (`googleMapStyles.light/dark`, and the schematic uses the same keys).

### 12.2 Palette (vivid, one family per meaning)

| Meaning | Light | Dark |
| --- | --- | --- |
| Page / map field | `#F3F5F9` / `#E8ECF2` | `#0A0F1D` / `#070B16` |
| Cards, sheets, rails | `#FFFFFF` | `#111A2E` (raised `#172238`) |
| Text / muted / subtle | `#0B1220` / `#475467` / `#5E687A` | `#EEF2FA` / `#A9B4C8` / `#8A96AD` |
| Primary action (`accent` + `onAccent`) | vivid mint `#14B8A6` with deep-teal label `#042F2E` | `#2DD4BF` with `#042F2E` |
| Recommended route | `#0B7F75` with a white casing | `#2DD4BF` with a deep casing and glow |
| Unverified (amber) | marker `#C2700A`, text `#B45309` on `#FEF3C7` | `#FBBF24` |
| Corroborated (orange, new: distinct from Unverified) | marker `#CC5F12`, text `#C2410C` on `#FFEDD5` | `#FB923C` / `#FDBA74` |
| Verified, Not viable (red) | `#D12F2F`, text `#B91C1C` on `#FEE2E2` | rose `#FB7185` / `#FDA4AF` |
| Resolved, Reachable (green) | emerald `#059669` / `#047857` | `#22C55E` / `#4ADE80` |
| **Live data** (indigo, new) | `#4F46E5`, text `#4338CA` on `#E0E7FF` | `#818CF8` / `#A5B4FC` |
| Brand moments only (wordmark, splash, empty states) | indigo `#6366F1` → mint `#14B8A6` gradient | `#818CF8` → `#2DD4BF` |
| Water / flood-prone | `#0284C7` dotted at 30% | `#38BDF8` at 38% |

Rules:
- **Accessibility is enforced, not hoped for:** `test/contrast.test.ts` in tokens checks every
  pair in `contrastPairs` for both themes: 4.5:1 for text (incl. chips and the primary button),
  3:1 for routes, markers, the railway and focus rings. Colour is still never the only signal
  (rings, line styles and words carry the same meaning).
- **Colour-blind safe:** `test/cvd.test.ts` simulates protanopia, deuteranopia and tritanopia
  (Machado 2009) and requires ΔE ≥ 12 between key meanings (route vs blocked, Unverified vs
  Verified, Corroborated vs Verified, Resolved vs Verified, Live vs primary). That test is why
  dark red is rose, light green is emerald and Corroborated is a yellow-leaning orange. The light
  map's recommended vs alternative route pair is allowed ΔE ≥ 8, because those routes also differ
  by width and casing.
- **Simulated stays neutral (slate)** and **Live data is indigo**, so real and simulated never
  look alike. Evidence colours escalate amber → orange → red with the ring language.
- The brand gradient is for brand moments only, never for status, routes or text.
- Status chips use the `*Surface` background with `*Ink` text; markers use the solid colour.
