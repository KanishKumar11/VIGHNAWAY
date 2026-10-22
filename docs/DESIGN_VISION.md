# VIGHNAWAY: Designed with Intent

**Status:** Proposed art direction and design quality specification
**Product:** VIGHNAWAY
**Design philosophy:** Precision under uncertainty
**Signature idea:** A line that finds its way around an obstacle.

This document extends the existing `DESIGN.md`. It preserves the established application architecture, routing rules, product constraints, and signature bending-path concept. It introduces a refined art direction and a complete, adaptive color system for both light and dark modes.

The objective is to create an interface that feels designed by an experienced product designer: original, contemporary, premium, visually expressive, meticulously composed, and accessible.

> Supplied by the product owner. Where this document conflicts with `DESIGN.md` sections 11–12
> or with any earlier vision draft, this document wins. Appendix A records how earlier approved
> feature additions fit within it.

## 1. The creative direction

### Living Cartography

VIGHNAWAY should feel like a premium cartographic instrument designed for situations where road conditions change and navigation decisions matter.

Its visual identity combines precise mapping, contemporary editorial typography, carefully composed information displays, and purposeful interactions.

The interface should feel intelligent without looking futuristic for its own sake. It should communicate urgency without becoming aggressive and technical sophistication without becoming complicated.

**The intended aesthetic is precision cartography, contemporary editorial design, and purposeful interaction.**

The product should stand apart from conventional navigation applications, fleet-management dashboards, gaming interfaces, and generic SaaS templates.

Its distinctiveness must come from the entire experience, not simply the logo, palette, or animations.

### The emotional impression

The application should feel:

- Considered rather than assembled.
- Premium rather than excessively polished or decorative.
- Technically credible rather than futuristic for its own sake.
- Visually expressive without becoming noisy.
- Calm under pressure rather than clinical or intimidating.
- Accessible and legible without looking visually bland.

The map, typography, route geometry, evidence presentation, and interactions should all communicate the same design intention.

## 2. The signature visual idea

Vighna means obstacle in Sanskrit. The familiar name Vighnaharta is associated with Ganesha as the remover of obstacles.

VIGHNAWAY expresses the idea of finding a way around an obstacle through a contemporary visual gesture: a line encounters a block, bends around it, and continues toward its destination.

This gesture should influence five parts of the product:

**Geometry:** Route lines and interruptions are deliberate and meaningful.

**Composition:** The interface guides attention from a route to an obstacle and then to the available alternative.

**Information hierarchy:** Recommendations and supporting evidence belong together.

**Interaction:** Changes in road conditions produce clear, understandable updates.

**Illustration:** Supporting graphics use the same restrained cartographic language.

Do not introduce literal religious iconography or repeat the logo as a decorative motif throughout the interface.

The design must remain recognizable in static screenshots with all animations disabled.

## 3. Art direction and visual composition

### 3.1 Composition before components

Do not start with generic cards and attempt to make them distinctive through colors, borders, and shadows.

Design the overall composition first. Then create reusable components that preserve its visual hierarchy.

Use deliberate asymmetry where appropriate, precise alignment, controlled density, strong typography, and meaningful negative space.

Give the important information prominence. Allow supporting details to remain quiet until needed.

Not every section should have an equally prominent heading. Not every element should be enclosed in a rounded rectangle.

### 3.2 The three signature compositions

**The navigation canvas**

An immersive, full-screen map with restrained floating controls and an integrated route sheet.

**The route decision**

A carefully composed explanation of the selected route, showing its estimated duration, rationale, route strip, relevant hazards, and evidence.

**The changing situation**

A coordinated display of the new incident, affected road segment, revised recommendation, and the reason for the change.

Each composition should feel distinct while sharing the same typography, spacing, design tokens, iconography, and route semantics.

### 3.3 Visual rhythm

Use tighter spacing for related information and larger spacing between distinct decisions.

Align travel times, distances, timestamps, labels, and comparison values consistently.

Use surface contrast, restrained borders, and typography instead of wrapping every detail in a separate card.

Negative space should help users distinguish what matters now from what they may inspect later.

The interface should feel composed, not sparse, cramped, or assembled from a component library.

## 4. A complete adaptive color system

Both light and dark modes are required. Neither is a secondary theme or a simplified fallback.

Define semantic color tokens separately for each mode. Do not simply invert the background and retain every accent color unchanged.

The palette should remain vibrant through contrast and carefully chosen hues, with sufficient separation between the recommended route, alternatives, hazards, and supporting information.

### 4.1 Light mode palette

Use a warm, bright cartographic environment with deep, saturated route colors and clean information surfaces.

| Token | Color | Intended use |
|---|---|---|
| `light-shell` | `#F7F5F0` | Main application background |
| `light-surface` | `#FFFFFF` | Information panels and sheets |
| `light-surface-subtle` | `#F0F2F5` | Secondary regions and grouped content |
| `light-text-primary` | `#0F172A` | Headings and primary information |
| `light-text-secondary` | `#475569` | Body text and metadata |
| `light-route-recommended` | `#0F766E` | Recommended route and primary accent |
| `light-route-alternative` | `#64748B` | Alternative route geometry only |
| `light-warning` | `#B45309` | Warning and unverified incident graphics |
| `light-warning-text` | `#92400E` | Warning labels and explanatory text |
| `light-danger` | `#B91C1C` | Confirmed closures and non-viable route graphics |
| `light-success` | `#15803D` | Positive state graphics |
| `light-success-text` | `#166534` | Resolved and reachable status labels |
| `light-control-border` | `#64748B` | Essential input boundaries and control outlines |
| `light-focus` | `#0F766E` | Keyboard focus indicator |
| `light-primary-button` | `#0F766E` | Primary actions |
| `light-primary-button-text` | `#FFFFFF` | Text on primary buttons |

The warm background gives the interface character. The saturated teal provides a distinctive primary accent without relying on a luminous or fluorescent color.

Use the darker warning and success text variants when displaying small labels on light surfaces. The brighter semantic colors may be used for icons and other informative graphics when their adjacent-color contrast has been verified.

The alternative-route slate is intended for route lines and graphics, not small text on warm surfaces.

### 4.2 Dark mode palette

Use a deep midnight environment with luminous but controlled route accents, highly legible text, and restrained surface elevation.

| Token | Color | Intended use |
|---|---|---|
| `dark-shell` | `#0B1426` | Main background and dark map environment |
| `dark-surface` | `#111C33` | Sheets and primary panels |
| `dark-surface-raised` | `#17243D` | Elevated panels and selected contextual regions |
| `dark-text-primary` | `#F8FAFC` | Headings and primary information |
| `dark-text-secondary` | `#CBD5E1` | Body text and supporting content |
| `dark-text-muted` | `#94A3B8` | Secondary metadata |
| `dark-route-recommended` | `#2DD4BF` | Recommended route and active navigation |
| `dark-route-alternative` | `#94A3B8` | Alternative route geometry |
| `dark-warning` | `#FBBF24` | Warnings and unverified incident graphics |
| `dark-danger` | `#F87171` | Severe hazards and non-viable route graphics |
| `dark-success` | `#4ADE80` | Resolved and reachable state graphics |
| `dark-control-border` | `#64748B` | Essential control boundaries |
| `dark-focus` | `#2DD4BF` | Keyboard focus indicator |
| `dark-primary-button` | `#14B8A6` | Primary actions |
| `dark-primary-button-text` | `#0B1426` | Text on primary buttons |

The dark palette should feel vivid but controlled. Teal becomes luminous against the midnight map, while alternative routes remain visible without competing with the recommendation.

Amber, red, and green should appear only when their semantic meanings are relevant. Do not surround ordinary interface elements with colored glows.

### 4.3 Accessible status treatments

Status colors must be paired with appropriate backgrounds, readable foreground colors, labels, and recognizable symbols.

| State | Light background / foreground | Dark background / foreground |
|---|---|---|
| Recommended | `#F0FDFA` / `#115E59` | `#042F2E` / `#5EEAD4` |
| Warning | `#FFFBEB` / `#92400E` | `#422006` / `#FBBF24` |
| Critical | `#FEF2F2` / `#991B1B` | `#450A0A` / `#FCA5A5` |
| Resolved | `#F0FDF4` / `#166534` | `#052E16` / `#4ADE80` |

These are semantic state treatments, not additional decorative accents.

Use them sparingly. A warning badge should help someone understand a warning, not turn the entire screen amber.

Every incident status must retain an explicit text label. Recommended routes, alternative routes, and blocked segments must also have distinct line treatments or other non-color cues.

### 4.4 Vibrancy without visual overload

Achieve visual energy through:

- Strong light-dark contrast.
- A distinctive teal route against neutral cartography.
- Carefully controlled amber and red incident markers.
- Crisp typography and large, readable travel estimates.
- Precise line geometry and restrained emphasis.
- Consistent, purposeful transitions.

Do not add more accent colors to make the product feel modern.

The map should remain neutral enough for meaningful route and hazard colors to stand out. Parks, roads, water, labels, and geographical features must not compete with the information overlays.

## 5. Accessibility and contrast requirements

The color system targets **WCAG 2.2 Level AA**, subject to verification in the implemented application.

The relevant contrast requirements are:

- Normal text: at least `4.5:1` against its background.
- Large text: at least `3:1` against its background.
- Informative graphical objects and required interface component boundaries: at least `3:1` against adjacent colors where WCAG 2.2 Success Criterion 1.4.11 applies.

Use these as minimum thresholds, not design aspirations. Prefer stronger contrast for important emergency information.

### 5.1 Contrast verification

The initial palette has been checked against its designated solid-color surfaces.

| Pairing | Initial contrast ratio |
|---|---:|
| Light primary text `#0F172A` on `#F7F5F0` | 16.39:1 |
| Light secondary text `#475569` on `#F7F5F0` | 6.95:1 |
| Light recommended route `#0F766E` on `#F7F5F0` | 5.02:1 |
| Light primary button `#0F766E` with white text | 5.47:1 |
| Light warning text `#92400E` on `#F7F5F0` | 6.51:1 |
| Light critical graphic `#B91C1C` on `#F7F5F0` | 5.94:1 |
| Light success graphic `#15803D` on `#F7F5F0` | 4.60:1 |
| Dark primary text `#F8FAFC` on `#111C33` | 16.22:1 |
| Dark secondary text `#CBD5E1` on `#111C33` | 11.43:1 |
| Dark recommended route `#2DD4BF` on `#111C33` | 9.11:1 |
| Dark alternative route `#94A3B8` on `#111C33` | 6.62:1 |
| Dark warning `#FBBF24` on `#111C33` | 10.16:1 |
| Dark critical graphic `#F87171` on `#111C33` | 6.13:1 |
| Dark success graphic `#4ADE80` on `#111C33` | 9.74:1 |

These ratios describe the specified color pairs. They do not certify the application as a whole.

The alternative-route slate has a ratio of approximately `4.37:1` against the warm light shell, so it is suitable as a graphical route accent but must not be used for normal-sized text on that surface.

### 5.2 Map-specific contrast

Map overlays require additional care because roads, water, parks, and labels are not a single background color.

Use an outline or casing to preserve route visibility:

- Light mode: a recommended-route core in `#0F766E` with a carefully tuned light outline.
- Dark mode: a recommended-route core in `#2DD4BF` with a dark outline based on `#0B1426`.

The outline should separate the route from nearby roads without making the path excessively thick.

Alternative routes, blocked segments, hazard markers, and crossing symbols must remain distinguishable over varied underlying map surfaces.

Test the real map at different zoom levels and inspect intersections, bridges, underpasses, water boundaries, overlapping markers, and selected-route states.

Do not assume that a contrast ratio measured against a flat panel proves sufficient contrast against actual map tiles.

Avoid lowering the opacity of important route lines or hazard indicators without testing the resulting contrast.

### 5.3 Color is never the only signal

Use multiple cues:

- Different route-line structures for selected, alternative, and non-viable routes.
- Distinct shapes for flood, closure, congestion, accident, and debris incidents.
- Text labels for verification states.
- Explicit source and age indicators.
- A blocking marker and explanation for a non-viable route.
- Visible keyboard focus indicators.

Users must be able to understand the map without depending on their ability to distinguish teal from red, or amber from green.

### 5.4 Additional accessibility requirements

- Respect system text scaling and support enlarged text without clipping.
- Maintain logical keyboard focus order and visible focus indicators on web.
- Provide accessible names for interactive icons and meaningful map controls.
- Ensure interactive targets have appropriate touch dimensions.
- Preserve readable text over maps and images.
- Honor reduced-motion preferences throughout the application.
- Do not use color-only severity labels.
- Test important screens with color-vision simulation and suitable accessibility tools.
- Verify contrast for hover, pressed, selected, focused, disabled, loading, and error states.

Passing isolated color calculations does not establish full accessibility compliance. The complete application must be evaluated in context.

## 6. Typography and hierarchy

Use Inter throughout the mobile app and control room, preserving the established type scale.

Build hierarchy through scale, weight, spacing, alignment, and consistent number formatting.

### Primary information

The estimated arrival time and main route recommendation should be immediately visible.

### Decision information

Show the route name, major trade-off, reason for selection, and critical constraints.

### Supporting information

Provide incident descriptions, status, source, age, and alternative-route comparisons.

### Technical information

Use restrained technical styling for simulation time, identifiers, and diagnostics. Do not turn every label into uppercase or monospace text.

Align comparable time and distance values. Use tabular numerals where appropriate to prevent visible movement as values change.

Small text must remain accessible. Never reduce font sizes simply to achieve a dense, fashionable composition.

## 7. Cartographic design

The map is the primary information surface, not a background illustration.

### 7.1 Map themes

Implement separate light and dark basemap styles that complement their corresponding interface themes.

Light mode should use a restrained neutral geography with readable roads, clear crossings, and sufficient separation for the deeper teal recommendation.

Dark mode should use a carefully balanced midnight cartography, with roads and geographical boundaries visible without competing with the luminous teal route.

Both map styles must preserve the legibility of railway lines, bridges, tunnels, underpasses, and major crossings.

Use the appropriate route palette for each theme. Never force the same line color onto incompatible backgrounds.

### 7.2 Route system

Use these initial line specifications:

- Recommended route: `6 px`.
- Usual fastest route: `4 px`.
- Other alternatives: `3 px`.
- Non-viable route: `4 px`, with an interruption or dashed treatment where supported.

Tune the effective widths for actual device pixel density and map zoom.

The selected route should be the most prominent, but the alternatives must remain visible enough to support comparison.

Never distort the actual route geometry for aesthetic reasons.

### 7.3 Incident markers

Use a consistent icon family with distinctive incident shapes and status treatments.

The marker communicates incident type. Its ring and label communicate verification status. Its supporting details communicate source and age.

Avoid oversized badges, perpetual pulsing, excessive shadows, and unnecessarily overlapping labels.

All important marker information must remain available without requiring hover.

### 7.4 Route strips

Make route strips one of VIGHNAWAY's recognizable components.

Represent the actual journey as a simplified path from origin to destination. Position hazard ticks according to their location and label important crossings where useful.

Generate the strip from the evaluated route and associated incidents, not from an unrelated illustration.

Keep the geometry and semantics consistent across the mobile and web applications.

## 8. The route decision composition

The recommendation should feel like an intentional editorial composition within the navigation experience, not a conventional navigation card.

Lead with the estimated travel time and route status. Follow with the route name, a concise reason, the trade-off, and relevant evidence.

For example:

**Recommended route**

**+6 min estimated**

Avoids the reported flooding at the underpass. Uses the available flyover crossing instead.

Below this, show the route strip and supporting incident evidence.

This is illustrative wording only. Display claims and values supported by the selected scenario and evaluated routes.

Use typography, alignment, and whitespace to establish importance. Do not put every line inside a separate colored container.

## 9. Motion and the route-change sequence

The product's defining interaction is the moment when an incident changes the recommendation.

It must feel precise, understandable, and causally connected to the underlying application state.

1. An incident appears with its source, status, and age.
2. The affected segment is briefly emphasized.
3. The existing route loses emphasis or becomes visibly interrupted when the engine marks it non-viable.
4. The engine evaluates the available alternatives.
5. The revised route appears from the current vehicle position using its actual geometry.
6. The updated travel estimate and reason appear alongside the supporting evidence.
7. The activity timeline records the material change.

Use short transitions and subtle haptics where appropriate.

A restrained flood contour may emphasize a flooded area, but must not obscure the map or suggest information the system does not have.

Never animate a route into a new recommendation before the engine produces that result.

Respect reduced-motion preferences. When reduced motion is enabled, update the route, warning, and recommendation directly without requiring the signature animation.

The experience should remain clear and complete with all motion disabled.

## 10. Mobile and control-room composition

### Mobile

Use a full-screen map, restrained floating controls, and a persistent bottom sheet.

Its compact state should show the recommended route, estimated travel time, and primary reason.

Its expanded state should reveal route alternatives, route strips, evidence, and activity.

Respect Android safe areas, keyboard interactions, bottom-sheet behavior, gesture navigation, and system font scaling.

### Control room

Use the web control room as an operational workspace, not a generic dashboard.

Keep the map central. Create a clear relationship between the incident queue, simulation controls, route evaluation, and current scenario time.

The light and dark theme tokens must remain consistent with the mobile application.

Important interactions and status information must remain visible without requiring hover. The interface should remain readable at the intended projector dimensions.

Both surfaces must render identical incident states and route semantics for the same underlying data.

## 11. Exceptional and offline states

Design these states with the same care as the primary navigation journey.

**Loading:** Indicate that route evaluation is occurring, without indefinite or misleading progress animations.

**No incidents:** State that no incidents are present in the selected dataset. Do not imply that roads are clear.

**Unverified incident:** Clearly label its source and status without presenting it as official confirmation.

**Stale information:** Show the age of relevant data and explain the limitation.

**Offline:** Identify that local data is being used and show its age.

**No viable route:** Explain that no viable route can be established from the available information. Offer supported next steps without fabricating a route.

**Report submitted:** Confirm submission while retaining its Unverified status until the relevant verification process occurs.

**Simulation:** Keep the simulated designation visible throughout the demonstration.

Every state must work in both themes and retain adequate contrast.

## 12. The professional design workflow

Do not improvise styles while implementing application logic.

First, produce three carefully composed static hero screens:

1. The navigation screen with the route sheet in its compact state.
2. The route-change moment showing the affected segment and revised recommendation.
3. The incident-reporting form with the keyboard open, including validation behavior.

Review these screens in both light and dark modes before expanding into secondary screens.

Establish the typography, spacing, token usage, route geometry, marker language, surface hierarchy, and interaction states.

Then inspect the rendered application on real Android hardware and at the intended control-room dimensions.

Look for visual problems beyond basic correctness:

- Too many elements compete for attention.
- The route recommendation is visually detached from the map.
- Important route lines disappear against map surfaces.
- Metadata is faint or cramped.
- Markers overlap and become difficult to interpret.
- The same card treatment is repeated everywhere.
- A state looks correct in one theme but fails in the other.
- Animations obscure information.
- UI elements are clipped at large system text sizes.

Correct these issues before adding secondary features.

## 13. Final design acceptance criteria

### Visual quality

- [ ] The identity is recognizable without relying on the logo.
- [ ] The layout feels intentionally composed rather than template-generated.
- [ ] The map remains the central information surface.
- [ ] The route decision has a strong, immediately understandable hierarchy.
- [ ] Both themes feel complete and deliberately designed.

### Color and accessibility

- [ ] Both theme palettes use mode-specific semantic tokens.
- [ ] Normal text meets WCAG 2.2 AA contrast requirements.
- [ ] Large text and meaningful interface graphics meet their applicable contrast requirements.
- [ ] Actual map overlays are tested against the rendered map at relevant zoom levels.
- [ ] No essential information depends on color alone.
- [ ] Focus indicators, selected states, error states, and controls remain distinguishable.
- [ ] Large text, touch targets, and safe areas are tested.
- [ ] Reduced-motion behavior is implemented.
- [ ] Automated contrast checks and manual accessibility review have been completed.

### Product coherence

- [ ] Route geometry is generated from actual evaluated data.
- [ ] The route-change sequence follows real engine outputs.
- [ ] Incident source, status, and age remain visible.
- [ ] Simulated events are consistently labeled.
- [ ] Mobile and web share route semantics, design tokens, and evidence states.
- [ ] Loading, offline, stale-data, and no-viable-route states are complete.

### Visual QA

- [ ] Hero screens have been reviewed in light mode and dark mode.
- [ ] The primary route-change interaction has been reviewed on a real Android device.
- [ ] Contrast checks cover both themes and relevant component states.
- [ ] Visible composition problems have been fixed.
- [ ] Screenshots and design references are available for implementation consistency.

## Final creative principle

VIGHNAWAY should not rely on decoration to appear premium.

It should demonstrate design maturity through precise cartography, strong composition, purposeful typography, vibrant but accessible color, clear evidence, and an interaction that makes changing circumstances understandable.

The dark theme should feel immersive and quietly luminous. The light theme should feel crisp, warm, and expressive. Both must remain recognizably VIGHNAWAY.

The result should be a product that feels deliberately designed from its underlying purpose to its smallest interface detail.

**Precision in every line. Clarity in every decision. A different way forward.**

---

## Appendix A: Approved feature additions, fitted to this direction

These were approved by the product owner before this art direction arrived. They stay, within its
rules:

| Feature | How it fits |
| --- | --- |
| "What to do now" line under the ETA (`engine.nextAction`) | Part of the route decision composition (section 8): one plain sentence. |
| Spoken route changes (`engine.spokenChange`, expo-speech / Web Speech) | Accessibility (section 5.4); off by default on the console, user toggle on the phone. |
| Drive mode on the phone | A reduced composition: ETA, next road, what to do now. |
| Larger-text toggle, screen-reader labels, a List view as the map's text alternative | Section 5.4. |
| Hindi and Marathi | Inter for Latin, Noto Sans Devanagari for Devanagari; translations marked for native-speaker review. |
| Console decision replay (timeline scrubbing via `/history` and `incidentsAtSeq`) | "Clear relationship between ... simulation controls, route evaluation and scenario time" (section 10). |
| "What changed" after a re-plan, presenter mode | Route-change sequence step 6 and projector readability. |
| Speed along a route (`engine.routeFlow`) | Encoded **statically** (segment treatment) so it reads with motion disabled; motion only on change. |
| Evidence building up (device count, operator Verify) | A one-shot transition when the state changes, never a loop. |

Dropped from the earlier draft because this direction rules them out: perpetual pulsing rings,
breathing confidence meter, ambient rain texture, looping flow dashes, looping flood ripples,
coloured glows around ordinary UI, uppercase/monospace labels outside technical information,
extra accent hues (orange for Corroborated, indigo for Live data; both now use the state
treatments plus ring style and an explicit label).
