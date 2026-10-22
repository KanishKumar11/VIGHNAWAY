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

**Search card (start and destination).** Tapping the card opens one search sheet. At the top, a route card: a start dot and a destination pin joined by a dotted line, **From** above **To** (each its own input), and a swap button; under it a **My location** pill and a close button. The keyboard opens on To. As you type, the list shows (1) **Recent**, the last six places you picked, kept on the phone, when nothing is typed; (2) **Saved places**, the built-in Andheri places and roads and the corridor cities, instant and offline; (3) **Places**, live results from a Photon server (OpenStreetMap data) with real names and addresses (street, area, city, state) and an icon per type (city, station, airport, hospital, shop, school, landmark, road). The live lookup waits 350 ms after the last keystroke, needs two letters, cancels an older request when you keep typing, caches answers, is limited to India and biased toward the other field's area (rounded to about 10 km). With no connection, or when the service fails, the sheet says so and keeps the built-in places. A result somewhere the app has no road map (anywhere but Andheri and the Amritsar to Ambala corridor) carries a "No road map yet" chip; tapping it says "There is no road map for {place} yet. Routes work in Andheri and from Amritsar to Ambala." and changes nothing. The footer discloses that what you type and a rough area are sent to the search service. Picking a place fills that input and moves to the other; when both are set the trip is planned and the sheet closes. The start cannot be changed during a trip (To still can), and a start equal to the destination is refused. Searched places stay on the phone: their trips are not published to the console.
