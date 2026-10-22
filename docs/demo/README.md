# Recorded fallback of the console demo (P0-5.c)

Two videos of the console running the scripted Andheri monsoon demo against the real API, labelled Simulated throughout:

- `console-demo-light.webm`: the normal console, light theme.
- `console-demo-presenter.webm`: the presenter view (operator controls hidden, the decision enlarged).

They are about 22 MB each, so they are **not tracked by git** (`docs/demo/*.webm` is ignored): copy them to the demo
laptop's desktop, or attach them to a release. Record them again with `scripts/record-demo.mjs` (needs `playwright-core`
and Playwright's ffmpeg build; see the header of the script). The phone half is not recorded (it needs the device, P0-3).

To play: any browser or VLC. If a recording shows "Server unreachable", it was made against the wrong API address; record it again.
