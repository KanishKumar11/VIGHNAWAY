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

**Header (v5).** The search bar holds only the destination (full name, mode badge) and a search icon. The connection and data status is a small pill on its own line under the profile chips; tapping it opens the notices just below it. Under the pill, at the right, a round **options** button opens a card of quick actions: Report a hazard, Routes and incidents (the list), Show my location (live mode), the Google traffic switch (display only) and Settings. Tapping outside or Back closes it. The bottom-left corner stays clear for Google's logo, and the Report button remains at the bottom right. **Share** always opens the system share sheet, so the traveller picks WhatsApp, Messages or any other app; nothing opens by itself. Route cards in the opened sheet show crossings as bands on the strip with one summary row ("Flyover ×3 · Underpass") instead of a label per crossing.

**Location (live mode).** Every position comes from apps/mobile/src/lib/location.ts: highest accuracy, a fresh fix (under 30 s old) within 25 m is taken at once, otherwise the best fresh fix after about 12 s; Android is asked once per session to turn on high-accuracy location. Approximate-only permission (Android 12+ / iOS reduced) is detected and said plainly. In live mode the map shows the phone as Google's location dot with its accuracy circle, a Show my location button recentres on it, and the trip starts from the phone when location is already allowed and the phone is inside the map area. A trip that follows the phone updates every second and skips fixes worse than 75 m.

**Opens where you are (live mode).** Like Google Maps, live mode opens on the phone, never on the Andheri demo: the map starts at the last known position (kept on the device only), then flies to a fresh fix at street zoom. The road map is chosen from that place (Andheri, or the Amritsar–Ambala corridor); the trip starts from **My location** with no destination, and the sheet shows **Where to?** with the start, a Search button and recent places. The start follows the phone while planning (moves after about 200 m, keeps the destination) and never changes a trip already started. Location is not requested at launch: with no permission the sheet shows an Allow card (denied: Open settings; no fix: Try again; no road map here: says so). Search still works in every case. Simulated mode keeps the scripted Andheri demo.

**Search card (start and destination).** Tapping the card opens one search sheet. At the top, a route card: a start dot and a destination pin joined by a dotted line, **From** above **To** (each its own input), and a swap button; under it a **My location** pill and a close button. The keyboard opens on To. As you type, the list shows (1) **Recent**, the last six places you picked, kept on the phone, when nothing is typed; (2) **Saved places**, the built-in Andheri places and roads and the corridor cities, instant and offline; (3) **Places**, live results from a Photon server (OpenStreetMap data) with real names and addresses (street, area, city, state) and an icon per type (city, station, airport, hospital, shop, school, landmark, road). The live lookup waits 350 ms after the last keystroke, needs two letters, cancels an older request when you keep typing, caches answers, is limited to India and biased toward the other field's area (rounded to about 10 km). With no connection, or when the service fails, the sheet says so and keeps the built-in places. A result somewhere the app has no road map (anywhere but Andheri and the Amritsar to Ambala corridor) carries a "No road map yet" chip; tapping it says "There is no road map for {place} yet. Routes work in Andheri and from Amritsar to Ambala." and changes nothing. The footer discloses that what you type and a rough area are sent to the search service. Picking a place fills that input and moves to the other; when both are set the trip is planned and the sheet closes. The start cannot be changed during a trip (To still can), and a start equal to the destination is refused. Searched places stay on the phone: their trips are not published to the console.

**Two maps.** The app has two road maps: Andheri (scenario, incidents, simulation, live feed) and the Amritsar to Ambala corridor (real OpenStreetMap roads only). A trip lives on one map. Picking a place on the other map empties the other input and says "Now choose a start / destination in the same area", so the pair is always routable; for example, "My location" in Amritsar followed by Ambala. On the corridor map the sheet shows the real road distance beside the route name ("247.6 km  Via Grand Trunk Road (NH44)"), the ETA at typical speeds per road class, and a note that this area has roads only: no incident or live traffic data, no evidence section and no data-gap questions. When the start or end is more than 500 m from a mapped road the note says how far; that distance is not in the route. A place more than 15 km from any mapped road, or outside both maps, is refused with a plain message.

**Choosing a route (like Google Maps).** Every route the engine returns is drawn: the recommended one in blue on top, the alternatives as clear grey lines with an outline underneath. Each carries a time bubble: the blue route its total time, an alternative the time it adds or saves ("+3 min", "−2 min"), placed where it leaves the blue route and kept clear of the other bubbles; an alternative that is the same line as the blue one (almost all shared road) gets no bubble but is still in the list. Tap an alternative's line or bubble, or its card in the opened sheet, to choose it: it turns blue, the card shows "Your choice", and a note says how much it adds or saves compared with the recommended route, with a "Use recommended" button. The engine still labels and explains every route; the choice only says which one the trip follows. It lasts for that trip plan and clears when the trip starts or the places change. A running trip ignores taps on routes.

**Navigation camera.** When Start trip is tapped the map flies to the vehicle (the phone's position in live mode): zoom 17 (18 on foot), tilted 50 degrees and turned to the direction of travel, like Google Maps' driving view, and then follows it, gliding at most once a second. Dragging the map lets go of the camera and shows a re-centre button next to Report; tapping it follows again. When the trip ends or the traveller arrives the camera tilts back flat, north up, and shows the whole route.

**Live feed load.** A live feed refresh arrives as dozens of incidents at once. The phone applies a burst in one update (250 ms batch), so the map and sheet render and re-plan once, and the map draws at most 40 markers: every incident tied to a shown route, then open ones near the routes. Routing still uses every incident. Age labels on markers appear only when 8 or fewer are drawn.

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
heavy, standstill); what is wrong with the road for a walking concern (poorly lit, isolated stretch: no note and no photo); severity for debris/accident (low, medium, high) and a "Road is impassable"
switch; location ("Use my location" or "Choose on map" with a small map and the road it lands on; "Choose on map" opens a full-screen map with one pin that moves where the traveller taps or when dragged, and OK uses that spot once it is on a mapped road; the form opens on a suggested spot: the map centre when that is on a mapped road, else the vehicle, else the trip start); photo (optional: "Take photo" opens the camera, asking for permission only then; the picture is shown as a preview with Retake and Remove, and goes up after the report; a refused or blocked permission is said plainly and the report can still be sent), note (optional,
200 characters, counter "{n}/200"); "I saw this myself" switch; sticky "Send report" button in a
KeyboardStickyView.

| State | Copy |
| --- | --- |
| Validation | "Choose what you saw" / "Choose a congestion level" / "Note is too long" |
| Sending | Button "Sending…" |
| Sent | Button morphs to a check; toast "Sent. Shown as Unverified until confirmed." |
| Not on a road | Before sending, the point is snapped to the nearest mapped road (within 120 m) and the form shows "On {road}". In live mode a report from anywhere is accepted: with no mapped road in range the form says "No mapped road here. Saved as off-map: it will not change any route." and the toast after sending says the same; the map centre is kept wherever it is. In the simulated demo, with no road in range the send is refused up front, in a message pinned above the button: "No mapped road here. Reports work inside the Andheri area: move the map onto a road there." Nothing is queued. |
| Not on a road (422) | "That point is not on a known road. Move the pin onto a road." A queued report the API rejects later raises a toast and an Activity entry ("Report not accepted: …"); it is never dropped silently. |
| Rate limited (429) | "Too many reports from this device. Try again in a minute." |
| Offline | Toast "Saved. Pending send when you are back online."; activity shows "Pending send" |
| Discard | Themed dialog "Discard this report?" ("Nothing you entered will be sent.") buttons "Keep editing" / "Discard" |

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

Report photos (operators only): when the controls are unlocked and an incident has photos from citizen reports, its queue card shows up to three small thumbnails under the evidence chips ("Photo from a report, 12 min ago"), then "+N" for the rest. A thumbnail opens a larger view in a dialog ("Photo from a citizen report", the report time and age, "Only operators can see photos. Do not share them."), with previous/next when there are several; Escape, the close button or a click outside closes it. The console fetches the list (`GET /scenarios/:id/photos`, every 20 s) and each image with the operator Authorization header, and shows it from a Blob URL that is revoked when replaced or on unmount. With the controls locked, or during decision replay, no photo is requested and nothing about photos is shown. Photos are untrusted user content: they are only ever the source of an image, never markup.

## 10. /report (public mobile web, opened by QR)

Same fields as the phone Report modal, in a single column; small Google map with a draggable pin
(or "Use my location"); random device id in localStorage; confirm "Sent. Shown as Unverified until
confirmed." Header shows "Simulated scenario: Andheri, Mumbai". Errors as in section 5.

## 11. /rules and /debug

/rules renders SCORING_RULES and limitations, plus attribution. /debug shows the engine parity hash
for the fixture set, the case count, the graph version and planTrip timing.
