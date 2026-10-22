# UX_FLOWS.md: screens, states and copy

Owners: Mobile and Console. Every string below is the exact copy; apps keep them in their i18n file
(`apps/mobile/src/i18n/en.ts`, `apps/console/src/i18n/en.ts`). Sketches are low fidelity.

## 1. Phone: screen inventory and navigation

```text
Root Stack (headerShown false)
├── first-run            shown once (stored flag), then replaced by (drawer)
├── (drawer)             Drawer, type front, width min(320, 80%), swipe disabled on Navigate
│   ├── index            Navigate: map + persistent bottom sheet (peek / half / full)
│   ├── activity         Journey-relevant changes
│   ├── settings         Profile, language, server address, offline data
│   ├── how-it-decides   SCORING_RULES, limitations, attribution
│   └── debug            Hidden (7 taps on the version in Settings): parity hash, timings
├── report               Modal route: Report a hazard
└── evidence sheet       BottomSheetModal over Navigate (never opened from Report)
```

## 2. First-run

```text
┌──────────────────────────────┐
│        [route mark]          │
│        V I G H N A W A Y      │
│ Simulated flood scenario:    │
│ Andheri, Mumbai              │
│ Compares routes against      │
│ reported hazards and tells   │
│ you why it recommends one.   │
│                              │
│ [        Continue          ] │
└──────────────────────────────┘
```

Copy: title "VIGHNAWAY"; badge "Simulated flood scenario: Andheri, Mumbai"; body "VIGHNAWAY
compares routes against reported hazards and the evidence behind them, recommends a viable one and
tells you why."; button "Continue". No permission prompts here.

## 3. Navigate

```text
┌──────────────────────────────┐
│[≡] [Search: Kokilaben Hosp.] │  ← search card at insets.top + 8
│ [Simulated] [car|2w|foot]    │  ← Simulated badge + profile chips
│        (navy map, routes)    │
│                      [Report]│  ← rides above the sheet
├──────────────────────────────┤
│ ▔▔ Route changed banner      │  ← slides from sheet top when it changes
│ Recommended · Via Gokhale Br │
│ 17 min      ■■□ Medium       │
│ Avoids flooding (knee deep)… │
│ [route strip ───●──┃──── ]   │
│ [Start trip]                 │
└──────────────────────────────┘
```

**Header (v5).** The search bar holds only the destination (full name, mode badge) and a search icon. The connection and data status is a small pill on its own line under the profile chips; tapping it opens the notices just below it. **Share** always opens the system share sheet, so the traveller picks WhatsApp, Messages or any other app; nothing opens by itself. Route cards in the opened sheet show crossings as bands on the strip with one summary row ("Flyover ×3 · Underpass") instead of a label per crossing.

**Search card (start and destination).** Tapping the card opens one search sheet with a From and a To field and a text box. It searches offline, over the scenario places and every named road of the bundled map, so any road in the Andheri map area can be the destination or the start. An empty query lists the scenario places. From also offers "My location" (foreground permission; refused with a calm message outside the map area or when permission is off). Every pick is a point that the engine snaps to its road graph for the active profile. The start cannot be changed during a trip, and a start equal to the destination is refused. Searched places stay on the phone: their trips are not published to the console.

Sheet snap points (v5): **small** (the default and lowest stop: ETA, route name and Start trip, plus a
one-line "Route changed · Details" notice when the route has changed; about a sixth of the screen so the
map is mostly visible), **half** (status and confidence, what to do now, the reason, the full change
banner, Drive mode and Share, the comparison cards), **full** (Why this route card, evidence list,
activity). A flick up opens it; a flick down returns to small.

| State | What shows | Copy |
| --- | --- | --- |
| Loading | Shimmer cards | "Checking {routes} routes against {incidents} incidents" |
| Normal | Peek card | Reason from engine, e.g. "Fastest route, no reported hazards." |
| Route changed | Banner (warning haptic, screen-reader announcement) | Engine `change.message`; button "Details" |
| Unchanged with hazard | Toast + activity entry | Engine notice, e.g. "Route unchanged: one unverified report" |
| No viable route | Sheet expanded, map dimmed to 40% | Title "No viable route"; body "Every route we checked crosses a verified or corroborated blockage."; nearest: "Nearest reachable: {place}, {eta}"; button "Go to {place}"; footer "In an emergency, call 112." |
| Reversal | Banner (danger) | "Turn back only where it is safe to do so" |
| On a blocked edge | Banner (danger) | Engine notice text |
| Offline | Thin bar under search | "Offline: using incidents from {clock} ({age} old)" |
| Stale data | Chip on route card | "Stale" + "Report older than 3 hours" |
| API unreachable | Same bar | "Server unreachable: using incidents from {clock} ({age} old)" |
| Map unavailable | Plain navy background, sheet still works | "Map unavailable: check the Google Maps key or the network" |
| No incidents | Illustration in evidence list | "No reported hazards on this route" |
| Arrived | Peek card | "Arrived at {place}" ; button "Done" |

En-route: vehicle marker with heading, travelled part in darker teal, remaining ETA "{min} min
left", button "End trip". Every incident change re-plans from the vehicle.

## 4. Evidence sheet (BottomSheetModal, dynamic size)

Title: hazard label ("Flooding (knee deep)"); chips: status, source, age, Stale/Conflicting;
lines: "Road: {road}", "Reports: {n} from {d} devices", "Last report: {clock} ({age} ago)",
"Effect on routes: Blocks this route | Ranking penalty | Adds {n} min (congestion)".
Note (plain text, never HTML) under "Reporter note". Footer: "Device corroboration is a prototype
heuristic, not proof of independent witnesses." Back closes it.

## 5. Report a hazard (modal route)

Fields in order: type (flood, closure, congestion, debris, accident, road clear) as large chips;
depth pictograms for flood (ankle, knee, waist, "Not sure"); level for congestion (moderate,
heavy, standstill); severity for debris/accident (low, medium, high) and a "Road is impassable"
switch; location ("Use my location" or "Use map centre" with a small static map); note (optional,
200 characters, counter "{n}/200"); "I saw this myself" switch; sticky "Send report" button in a
KeyboardStickyView.

| State | Copy |
| --- | --- |
| Validation | "Choose what you saw" / "Choose a congestion level" / "Note is too long" |
| Sending | Button "Sending…" |
| Sent | Button morphs to a check; toast "Sent. Shown as Unverified until confirmed." |
| Not on a road (422) | "That point is not on a known road. Move the pin onto a road." |
| Rate limited (429) | "Too many reports from this device. Try again in a minute." |
| Offline | Toast "Saved. Pending send when you are back online."; activity shows "Pending send" |
| Discard | Alert "Discard this report?" buttons "Keep editing" / "Discard" |

## 6. Activity

List of journey-relevant changes, newest first: route changes (engine message), unchanged-with-hazard
notices, incidents on the current route (status upgrades), pending reports. Each row: clock time
(simulation), icon, one line. Empty: "Nothing has changed on your journey yet."

## 7. Settings

Profile (On foot, Two-wheeler, Car); Language (English, Hindi, Marathi; translations awaiting native-speaker review. The original spec named Punjabi: see ROADMAP P3-2); Accessibility (larger text, spoken route changes);
Server address (text field, "Switch server?" Alert on save, "Test connection" shows "Connected:
API {version}" or "Could not reach {url}"); Offline data ("Incidents cached at {clock}", "Clear
cached data"); version (tap 7 times for Debug).

## 8. How it decides

Renders `scoringRulesTable()` from the engine as cards, then limitations (docs/limitations.md
summary), then "Road data © OpenStreetMap contributors" (or the fixture notice when the graph is the
schematic fixture) and "Map data © Google".

## 9. Console (/console, 1920×1080)

```text
┌ VIGHNAWAY Control room · Simulated scenario · 14:12:30 ───────── [Operator ●] ┐
│ Incident queue      │                                 │ Simulation          │
│ ▸ Corroborated (1)  │                                 │ [Play][Pause][Step] │
│   Flooding knee …   │          MAP (routes,           │ [Reset]  14:12      │
│   [Verify][Resolve] │          incidents, vehicle)    │ Demo trip           │
│ ▸ Unverified (2)    │                                 │ Recommended card    │
│ ▸ Verified (0)      │                                 │ Alternatives        │
│ ▸ Closed (0)        │                                 │ QR: report a hazard │
├─────────────────────┴─────────────────────────────────┴─────────────────────┤
│ 14:10 Flooding at Andheri Subway marked Corroborated (2 devices) · 14:08 …   │
└──────────────────────────────────────────────────────────────────────────────┘
```

| State | Copy |
| --- | --- |
| No token | Dialog "Operator token" field, "Unlock controls"; error "Token rejected" |
| Reconnecting | Pill "Reconnecting" (amber), then "Connected" (teal) after seq resync (never "Live", which would read as live data next to the Simulated badge) |
| Map unavailable | "Map unavailable: check the Google Maps key or the network" over navy; queue and cards still work |
| API unreachable | Banner "Server unreachable at {url}. Showing the last data received." |
| Empty queue | "No incidents yet. Press Play to start the simulated scenario." |
| Action failed | Toast "Could not {verify} this incident: {message}. Change undone." |

## 10. /report (public mobile web, opened by QR)

Same fields as the phone Report modal, in a single column; small Google map with a draggable pin
(or "Use my location"); random device id in localStorage; confirm "Sent. Shown as Unverified until
confirmed." Header shows "Simulated scenario: Andheri, Mumbai". Errors as in section 5.

## 11. /rules and /debug

/rules renders SCORING_RULES and limitations, plus attribution. /debug shows the engine parity hash
for the fixture set, the case count, the graph version and planTrip timing.
