# docs/design: v4 design review (DESIGN_VISION.md), browser previews and phone review

Status: **the mobile app follows `docs/DESIGN_VISION.md` (the authoritative art direction) and was
reviewed in a browser preview only.** The screenshots in `preview/` are browser previews of the
Expo app rendered with react-native-web, not phone captures. Nothing here is locked. DESIGN_VISION
section 12 still requires a review on real Android hardware; the gaps are listed below.

## Browser previews (`preview/`), light and dark

Rendered at 390 × 844 (2×, saved at 1.5× and quantised) from
`WEB_PREVIEW=1 npx expo export --platform web`, once with the browser colour scheme set to light and
once to dark (Appearance = System, so the app follows it). Every state comes from the **Debug hero
fixtures** (fixture data, the live socket paused, status pill "Fixture"), so no shared simulation
steps were needed. The web build has no Google map (`react-native-maps` is shimmed for the web
only), so Navigate shows the labelled **schematic fallback**.

| File (`-light.png` / `-dark.png`) | Screen |
| --- | --- |
| `01-story-1`, `01-story-2`, `01-story-3` | First run: three still story panels (a report, the evidence it waits for, the way around) under the Simulated badge; Skip, step dots, Next / Continue in the thumb zone |
| `02-navigate-peek` | Hero 1: Navigate with the compact sheet. ETA and Recommended state lead, route name, arrival (simulation clock), **What to do now**, primary reason, actions |
| `03-route-change` | Hero 2: the route-change moment, frozen mid-reveal (fixture). Old route interrupted and dashed, "Not viable" at the affected segment, new route drawing from the vehicle; the banner names the incident with status, source and age, then the revised ETA |
| `04-report-keyboard-validation` | Hero 3: Report with the note focused and validation showing (note too long). The viewport is shortened by 300 px to stand in for the soft keyboard; the browser cannot open one |
| `04b-report-validation-top` | The same form at full height: "Choose a congestion level" under step 02 |
| `05-navigate-half` | Half snap: trade-off, route strip, evidence rows, then the routes compared |
| `06-evidence-stamp` | Evidence sheet for a verified incident: the Verified stamp, facts as hairline rows, "How trust built" timeline |
| `07-no-viable` | No viable route: critical state, cause, nearest reachable hospital, Call 112 |
| `08-drive`, `08-drive-landscape` | Drive mode: huge ETA, the road you are on and the next one, what to do now, Exit; two columns when landscape |
| `09-list` | List view (the map as text): every evaluated route with its strip, every incident with status, source and age |
| `10-settings` | Settings: Profile, Appearance, Mode, Language (English / हिन्दी / मराठी, review note), Accessibility (Larger text, Speak route changes), Map, Server, Offline |
| `11-how-it-decides` | How it decides: formula, the translation-review note, rules and limitations as hairline lists |
| `12-activity` | Activity timeline (fixture runs) |
| `13-navigate-hindi` | Navigate in Hindi (Noto Sans Devanagari). Route reasons stay in English (see below) |
| `14-larger-text-navigate`, `14-larger-text-report` | The in-app Larger text setting (1.25×): segmented icons drop out, report tiles go to two columns |

### What the browser cannot show (check on the phone)

- **The soft keyboard** (Report hero), `KeyboardAwareScrollView` and the sticky Send button.
- **System font scaling up to 200%** combined with Larger text. The preview shows Larger text at
  1.25× only; react-native-web does not apply Android's font scale.
- **Speech**: expo-speech uses the Web Speech API in the browser; Android voices (Hindi, Marathi)
  vary by phone. The app speaks the selected language only when the phone reports a voice for it,
  otherwise the engine's English sentence.
- **Haptics** (warning on a change, light when a second device corroborates, success on operator
  verification, selection on controls): no-ops on the web.
- **Landscape Drive mode**: the app is portrait-locked (`orientation: portrait` in app config), so
  the landscape layout was checked only in a browser at 844 × 390.
- **Language switch on native**: the root stack remounts on a language change. On the web the URL
  keeps you on Settings; on Android check that it does not drop you back to Navigate.
- **Fonts**: Inter, JetBrains Mono (simulation time only) and Noto Sans Devanagari line metrics on
  Android, at 360 dp.
- **The Google map path**: styled map in both themes, interrupted blocked routes, the slow-segment
  overlay on congested runs, markers with spoken labels.

## How to open the hero screens on a phone

1. Build and install the dev client (`pnpm --filter mobile android`, or an EAS development build).
2. Pass first run, open the drawer, go to **Settings**, and tap the version line 7 times. This unlocks
   the hidden **Debug** screen (it also appears in the drawer from then on).
3. Under **Hero screens (fixture data)** pick one (simulated mode only): Navigate at peek;
   Route-change moment (frozen); No viable route; Report with keyboard open (then pick Congestion,
   type a long note and tap Send to see validation).
4. **Leave fixture mode** returns to live data.

Take every phone screenshot in both themes (Settings, Appearance), on a mid-range Android phone
with gesture navigation, and once more with three-button navigation. Save them here as
`phone-<screen>-<light|dark>.png`.

## Motion (DESIGN_VISION 9): what is implemented

Nothing loops. Motion only happens on a change, and reduce motion makes all of it instant:

1. A new incident marker appears once (scale in) with its status, source and age.
2. The affected segment flashes twice (about 600 ms).
3. The old route dims to dashed and is drawn interrupted where the engine marks it blocked.
4. The engine evaluates; nothing new is drawn before its result exists.
5. The new route draws in from the vehicle along its real geometry (about 300 ms).
6. The change banner enters after the draw-in, with the incident's evidence and the ETA change; the
   ETA digits roll once.
7. The activity timeline records the change; the change is announced politely to screen readers and,
   during a trip, spoken if "Speak route changes" is on.

Speed along a route is encoded statically: congested runs carry a thin dashed overlay in the warning
colour, blocked edges break the line. First-run panels change with a short fade. The operator's
Verify lands once as a stamp in the evidence sheet.

Removed under DESIGN_VISION: flowing dashes, pulsing rings, the breathing meter, the skeleton
shimmer, the looping scan animation, the vehicle's heading beam, the gradient brand mark and other
glows.

## Language

English, Hindi and Marathi. The default follows the phone (expo-localization); Settings overrides it.
Hindi and Marathi translations need review by a native speaker (shown in Settings and How it
decides). The app composes engine facts (route names, hazard, status, source, what to do now, the
change banner and spoken text) in the selected language from the plan's structured fields. The
engine's longer sentences (route reasons, trade-offs in the comparison, Why this route, rule
descriptions) are still English; How it decides says so.
