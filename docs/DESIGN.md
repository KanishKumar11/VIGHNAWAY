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

**Type:** Manrope on the phone (changed from Inter at the owner's request; the console keeps Inter). ETA 32/38 bold with tabular numerals; titles 18/24 semibold; body 15/22; metadata
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

**Incident marker:** a filled two-tone pictogram (24-unit grid) in a 36 px circle. Pictograms:
flood (droplet over two waves), closure (a no-entry disc with a bar), congestion (a car in a
queue), debris (a pile of boulders), accident (a warning triangle with an exclamation mark), and a
tick disc for "road clear". They are filled, not outlined, so they stay legible at 14 px on a map
marker; the second tone is the same ink at 38%. Ring by status: dashed = Unverified, double = Corroborated, solid = Verified, grey with a
strike = Resolved or Dismissed. A small age pill underneath ("12 min"). Selected: scale 1.15 with a
soft shadow. Origin: pulsing teal dot. Destination: hospital pin with a cross. Vehicle: teal arrow
with heading.

Icons: Lucide (`lucide-react-native`, `lucide-react`) for interface icons. Incident pictograms are the
one exception: the shared set in `packages/tokens/src/incidentIcons.ts` (`incidentIcons`), drawn by
the phone (`apps/mobile/src/components/IncidentGlyph.tsx`) and the console
(`apps/console/src/components/shared/IncidentGlyph.tsx`) from the same paths, in the ink of the
surface they sit on. The paths carry no colour. They are drawn for VIGHNAWAY and are not copies of a
third-party set; ISO 7010 has no flood, congestion or road-closed sign, so a swap to ISO symbols
would still need those three drawn in the same style.

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
- **Type:** Manrope for the phone UI (Inter Variable on the console); JetBrains Mono for instrument readouts (clock, ETA digits,
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

## 13. v4: Console light theme "Porcelain"

The web control room has its own light palette, `consoleThemes.light` in `@vighnaway/tokens`
(`packages/tokens/src/themes.ts`). The phone keeps `themes.light` (warm paper, DESIGN_VISION 4.1);
`consoleThemes.dark` is the shared dark theme. Keys are identical in every theme, and
`packages/tokens/test/contrast.test.ts` runs the same WCAG AA pairs against Porcelain.

- **What changed:** only the environment. A cool porcelain canvas (`shell` `#EDF0F5`, map field
  `shellDeep` `#E4E9F1`) under white floating panels (`shellRaised` `#FFFFFF`), cool hairlines
  (`#E2E7EF`), ink `#0B1324`, muted ink `#475569`, subtle ink `#566176`, cooler road tints and a
  navy-tinted scrim, which the shadows derive from.
- **What did not:** the accent (`#0F766E`), the route colours and every status treatment
  (recommended, warning, critical, resolved) are the DESIGN_VISION 4.1 and 4.3 values, so meaning
  reads the same on the phone and the console.
- **Map:** `consoleGoogleMapStyles.light` (`googleMapStyleConsoleLight`) matches the palette; the
  schematic view uses the same keys.
- **Chrome (`consoleChrome`):** a fixed deep-navy palette (`chromeBg` `#0B1426`, `chromeRaised`
  `#111C33`, ink `#F8FAFC` / `#CBD5E1`, luminous teal `chromeAccent` `#2DD4BF`), the same in light
  and dark. It is used for the decision hero card (`.vw-hero`) only. Status colours never sit on
  it: the changed-at chip brings its own surface. Pairs are checked by `chromeContrastPairs`.
- **Layout:** the console is three floating panels (incident queue, map, decision) and the
  timeline card on the canvas, 16 px apart, radius `sheet`. The queue opens with four summary
  tiles (Corroborated, Unverified, Verified, Closed); empty groups collapse to screen-reader
  headings only. Shared surfaces and controls live in
  `apps/console/src/app/globals.css` (`panel-card`, `well`, `ctl`, `ctl-primary`, `ctl-quiet`).
- **Command bar (`.vw-header`):** a frosted white bar with a hairline, a soft shadow and a thin
  accent light on its lower edge, also used by /rules and /debug. Nothing in it wraps: below
  1440 px the wordmark, the connection word and the nav labels collapse to icons (with titles
  and aria-labels); from 1900 px the clock also shows its context (simulation label, rain alert).
  The scenario switch names the mode, so the stand-alone Simulated badge appears only when there
  is no switch. The clock's zone abbreviation comes from the scenario's `timezone`
  (`lib/timezone.ts`), not a typed label.
- **Narrow windows:** below 1440 px the side rails narrow (320 / 384 px) and, below 1600 px, the
  timeline's transport buttons are icon-only and its middle time labels are hidden.
- **Map zoom:** a trackpad pinch (ctrl + wheel) over the map is cancelled at the map stage
  (`hooks/useContainPinchZoom.ts`) so the map zooms and the page does not; browser zoom still
  works everywhere else.
- **Route strip:** crossing labels sit in one row (first and last, with a `+N` count between), so
  long road names can no longer overlap. Screen-reader text still lists every crossing.

## 14. v5: Phone theme "Royal blue" and the small sheet

**Theme.** The phone uses `phoneThemes` in `@vighnaway/tokens` (`packages/tokens/src/themes.ts`):
a blue accent and recommended route on a cool white page (light) or a graphite page (dark). The
console keeps `themes` / `consoleThemes` (teal, Porcelain). Warning, critical and resolved hues are
unchanged, so hazards read the same. The key names `tealSoft` / `tealGlow` are historical and hold the
blue tints. `contrast.test.ts` and `cvd.test.ts` run the phone themes through the same WCAG AA and
colour-vision checks. The Google basemap uses natural colours (`phoneGoogleMapStyles`: green parks and
hills, blue water, warm land, white roads, amber highways; a dark equivalent), with generic points of
interest hidden so routes and incident markers stay the focus. It is a map, not satellite imagery. Not yet changed: the native splash and app icon colours in `app.config.ts`
(they need an Android rebuild) and the Expo status-bar colours they set.

- Light: sky-tinted page `#EEF3FF`, white panels with blue-tinted cards (`#F3F7FF`) and wells (`#E8F0FF`), ink `#0A1330`, accent and recommended route `#2563EB`, indigo secondary `#7C3AED` (`brandAlt`), richer warning and critical surfaces.
- Dark: deep indigo-navy page `#0A1020`, blue-tinted panels `#121A33` / `#1B2750`, ink `#F4F7FF`, accent `#4F8CFF` (dark label), route `#5B9BFF`, violet secondary `#A78BFA`.

**Type.** Manrope on the phone (the console keeps Inter); Hindi and Marathi still use Noto Sans Devanagari.

**Small sheet.** The lowest sheet stop is sized by the small card only (`layout.sheetSnapMini` is its floor),
not by the whole recommendation. See UX_FLOWS section 3 for what each stop shows.

### 13.1 Alignment grid (console)

Measured in the browser at 1280, 1440, 1600 and 1920 px; keep these when changing layout.

- **One edge:** the page padding and the gap between panels are 16 px. The command bar's content
  starts and ends on the panels' outer edges (brand tile on the left panel's edge, the operator
  button on the right panel's edge).
- **One control height:** every command-bar control (scenario switch, nav links, connection chip,
  toolbar, operator button) is 40 px tall and shares one centre line; the clock capsule is 48 px
  on the same line. Transport buttons are all 44 px (`ctl-primary` carries the same 1 px edge as
  `ctl`, with no outer ring, so Play is not larger than Step and Reset).
- **One inset inside panels:** both rails use 20 px (`px-5`) for titles, summary tiles, group
  labels, cards and footers, so left and right edges match top to bottom.
- **Map overlays:** every overlay sits 16 px from the map's edges, 36 px chips (Traffic top left,
  "Map data © Google" top right, Legend bottom left). Over Google's basemap the legend is lifted
  clear of Google's logo and attribution row, which must stay visible.
- **Timeline:** one grid with two rows. Row 1 holds the transport and the scrubber, row 2 the
  status line and the latest changes on a shared baseline.
- **Containment:** `panel-card` is positioned, so `sr-only` (absolute) labels stay inside a
  panel's clip. Without it they extended the page by several hundred pixels and caused stray
  scrollbars; the document must always equal the viewport (`scrollHeight == clientHeight`).

### 13.2 Brand colour (console)

`consoleBrand` in `@vighnaway/tokens`. The console uses one solid brand colour, indigo
`#4F46E5` (`brandFrom`), with white text at AA (`brandContrastPairs`). No gradients anywhere. It
is used only for brand moments and primary actions: the logo tile, the wordmark
(`.vw-brand-text`), primary buttons (`ctl-primary`), the clock badge (`.vw-brand-fill`), panel
title bars (`.vw-title-bar`) and timeline progress. Never for status, routes, markers or body
text. The hero card (`.vw-hero`) is solid deep indigo `chromeIndigo` `#1E1B4B`. The page canvas
is the plain `shell` colour; panels are frosted white (80%, blurred). The `brandVia`, `brandTo`
and aurora tokens remain in the package but are unused by the console. This goes beyond
DESIGN_VISION 4.4's "no extra accent hues", at the product owner's request, and is confined to
brand surfaces.

## 15. v6: Premium layout system (phone)

Replaces the "rules, not cards" grouping of DESIGN_VISION 3.3 on the phone. Every screen is built
from the kit in `apps/mobile/src/components/ui.tsx`, so gutters, radii and rows line up everywhere:

- **ScreenHeader:** a large title (`text.headline`, 28/34 bold) on the page colour with one round
  leading button (menu on drawer screens, back or close on stacked ones) and an optional trailing
  badge. No header bar or hairline. The drawer navigator's own header is off.
- **Section and Card:** a label (with an optional count pill) above one rounded card (radius
  `sheet`, white panel, hairline, soft shadow) that groups related rows; a hint sits under it.
- **Row:** a 36 dp icon tile (tinted by tone), title and subtitle, then a trailing value, switch,
  radio or chevron; at least 56 dp tall, 16 dp gutter, dividers inset to the text.
- **Brand hero:** the accent fills one surface per screen at most: the drawer's brand card and the
  Drive mode ETA card (text in `onAccent`).
- **Routes:** every route is one card holding its head line, comparison bar, reason, why-not line,
  strip and crossing summary; the recommended card has an accent border.

Screens on the kit: drawer, Settings, Activity, How it decides, Routes and incidents, Drive mode,
Debug. Navigate keeps its map layout (top bar, small sheet) and uses the same cards in the sheet.

