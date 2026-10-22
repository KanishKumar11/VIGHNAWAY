# demo-script.md

Owner: Pitch and QA. Everything in this scenario is **simulated**: real roads (the OpenStreetMap extract of
Andheri), simulated conditions. Say so in the first sentence. The trip is from Ramesh Nagar (Andheri West) to Holy Spirit
Hospital (Andheri East), across the railway. The Andheri Subway is the road under the line (a hand-set name and
flood-prone mark, see packages/scenario-data/andheri/flood-prone.json); the other two corridors are G K Gokhale Flyover
and Balasaheb Thackeray Flyover.

## Setup (before judges arrive)

1. Laptop on the phone hotspot. `docker compose -f infra/docker-compose.yml up -d` (or local
   Postgres + `pnpm --filter api dev`), `pnpm --filter console dev` (or `start`), `pnpm preflight`.
2. Demo phone (release APK, Settings → Server address = laptop LAN address) mirrored with
   `scrcpy` on the projector, left half; console `/console` right half at 1920×1080.
3. Console: enter the operator token, press **Reset**. Phone: Navigate shows Via Andheri Subway.
4. Backup phone with the same build; backup video on the laptop desktop.

## Timeline

Clock starts at 14:05 IST (simulation), 10 simulated seconds per real second, so one simulated
minute takes 6 real seconds. Times were tuned on the real graph (offline replay, `pnpm --filter @vighnaway/scenario-data tune`). The vehicle moves at
0.5 of the engine's speed so it is still before the subway when it floods (the brief allows tuning event times and vehicle
speed). The replay and the console follower agree on every step.

| Sim time | Real | Event (scenario.json) | Who taps what | Phone shows | Console shows | Talk track |
| --- | --- | --- | --- | --- | --- | --- |
| 14:05:00 | 0:00 | Load; rain alert (simulated) | Phone: **Start trip**. Console: **Play** | Via Andheri Subway, 11 min, Low ("No recent reports on Andheri Subway during the rain alert"; the next route is under a minute behind in ranking cost) | Same route cards, clock running | "Ordinary navigation takes the subway. So do we, but with Low confidence: it is flood-prone, nobody has reported on it during the rain alert, and the next route is only 26 seconds behind." |
| 14:06:00 | 0:06 | ev01 ankle-deep report, device A | — | Toast "Route unchanged: one unverified report" | Queue: Unverified, dashed ring | "One unverified ankle-deep report is a penalty, not a block. We hold." |
| 14:08:00 | 0:18 | ev02 knee-deep, device B | (or a judge via the QR code at the subway pin) | **Buzz.** Banner "Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via G K Gokhale Flyover adds 4 min." | Same banner motion; incident moves to Corroborated | "Two devices within 150 m and 30 minutes. A prototype heuristic, so we label it Corroborated, not confirmed. Knee-deep and corroborated is a hard block." |
| 14:09:30 | 0:27 | ev03 simulated operator Verify (or tap **Verify** live) | Console operator | Chip becomes "Verified by operator" | Card and marker pulse together | "Only an operator can set Verified. The decision does not change, because it was already right." |
| 14:11:00 | 0:36 | ev04 heavy congestion, G K Gokhale Flyover, device C | — | Toast "Route unchanged: one unverified report" | Unverified congestion | "Unverified congestion counts at 40%. Not enough to move us." |
| 14:11:10 | 0:37 | ev05 same congestion, device D | — | **Buzz.** "Route changed. Heavy congestion on G K Gokhale Flyover: Corroborated (2 devices), Simulated. New route via Balasaheb Thackeray Flyover saves 3 min." | Same | "Now it multiplies travel time, so the ETA itself changes and the farther crossing wins by more than the switching threshold." |
| 14:13:00 | 0:48 | ev06 road into Holy Spirit Hospital closed, device E | — | "Route unchanged: one unverified report" | Unverified closure | |
| 14:13:10 | 0:49 | ev07 simulated operator verifies closure | — | **No viable route** sheet: "Nearest reachable: HBT Trauma Care Hospital", "In an emergency, call 112." → tap **Go to HBT Trauma Care Hospital** | Demo trip card shows No viable route | "When nothing is viable we say so, offer the nearest reachable hospital, and point to 112." |
| ~14:15 | ~1:00 | Vehicle arrives | Phone: **Done** | Arrived | | Close: the three proofs. |

Then press **Reset** on the console and **Play** again to show the replay is identical (same
banners, same parity hash on /debug and the phone debug screen).

## Drill the API before a rehearsal

With the API deployed, migrated and seeded (`pnpm --filter api db:migrate`, `db:seed`):

```
OPERATOR_TOKEN=... API_URL=https://your-api node scripts/smoke-demo.mjs     # or: pnpm smoke
```

It resets the simulated scenario, steps the seven scripted events and checks each outcome (Unverified, Corroborated,
Verified by the simulated operator, the hospital closure), that a reset replays identically, the audience flow (two phones
Corroborated and never Verified, tagged audience-only, operator-only clear, a mixed incident left alone), and the ask-the-crowd
limits (one answer per road per device, a prompt Road clear never resolves anything). Exit code 1 on any failure.
**Do not run it during a live demo: it resets the scenario.** It was written without a database to test against; the first run
on your server is its first run.

## Optional segments (30 to 90 seconds each)

| Segment | Steps | Talk track |
| --- | --- | --- |
| **Decision receipt** | After the 14:08 banner: console route card → **Create receipt** → show the QR (or paste the link) → a second laptop opens `/verify?r=…` | "Same rules, same recorded reports, same route. Anyone can re-run it. It proves the decision follows from the inputs; it does not prove the reports were true." |
| **Why not this route?** | Phone or console: open the "Why not this route?" line on an alternative | "For every alternative, what would have to change for it to win, checked by re-running the engine with that change." |
| **Audience reports** | Presenter mode (**P**) → the QR card → judges scan it, report a hazard on the underpass; watch the ladder (Unverified, then Corroborated when a second phone reports) | "One phone is Unverified. A second phone near it is Corroborated, which is a device heuristic. Only I, the operator, can set Verified." Then **Clear audience reports** (confirm) before the next run |
| **Ask the crowd** | With the rain alert on, the phone shows "Is Andheri Subway flooded right now?" when stationary; answer Yes or No; or open `/report?scenario=andheri-monsoon&ask=19.12379,72.85037&road=Andheri%20Subway` | "A flood-prone road with no report in the last hour costs a penalty. Asking closes the gap, and a No is a report, never proof of clear." View → **Evidence coverage on the map** shows the road change pattern |
| **After-action** | After the run: console nav → **After action** (`/after-action`) → Print | "Every decision rebuilt from the recorded history, with a receipt for each. Modelled minutes, simulated scenario." |
| **Scoreboard slide** | docs/scoreboard.md (20 seeded scenarios) | "Simulated scenarios on real roads, seeds published. The usual route met a hard block in N of 20; the cost of avoiding it was a median of X modelled minutes; here are the cases where we were slower for nothing." |

## Fallbacks

- **Network fails (hotspot drops):** the phone keeps routing on cached incidents with "Offline:
  using incidents from 14:12 (1 min old)". Use the console's **Step** after reconnect; resync by seq
  restores both screens.
- **API down:** restart `pnpm --filter api start`; clients resync on reconnect. If it stays down,
  play the backup video.
- **Map fails (key or network):** both surfaces show "Map unavailable: check the Google Maps key or
  the network" and the schematic view; route cards and banners keep working.
- **Phone crashes:** backup phone, same build, press Reset.
- **Audience floods the demo with reports:** console → presenter card → **Clear audience reports** (confirm). Scripted and operator-verified incidents stay. If it is worse than that, **Reset**.
- **QR code does not scan:** read the short address under it aloud; the report page also opens from the console's QR card.
- **Receipt check fails on stage:** check that both laptops show the same scenario and run id on `/debug`; if the scenario was reset between creating and checking the receipt, the check says the inputs differ. That is the receipt doing its job. Create a new one.

## Reset procedure

Console → **Reset** (clears incidents, reports and events, bumps seq, emits sim.reset). Phone:
End trip → back on Navigate shows Via Andheri Subway. Check both parity hashes match.

## Judge Q&A

Short answers; each points to the document that backs it. None of them says a route is fit to drive.

| Question | Answer | Backed by |
| --- | --- | --- |
| Why not Google Maps? | Google routes for speed and typical traffic. We route on incident evidence with stated rules: a Corroborated or Verified closure or flood is a hard block, and every change says what triggered it. Our routing is deterministic: the same reports give the same route on the phone, the console and a re-run from a receipt. | docs/scoring.md, docs/PRD.md |
| How is a report judged true? | It is not judged. Every report shows its source and status: Unverified, Corroborated (two devices near each other, a heuristic), Verified (an operator action only). The app never says a road is confirmed flooded on its own. | docs/limitations.md, docs/CONTRACTS.md |
| What happens when nobody reports? | "No reports" is not the same as clear. On a flood-prone road during a rain alert, no report in the last hour adds a ranking penalty and lowers confidence, and the app can ask a person nearby. | docs/scoring.md, docs/TASKS.md P1-4 |
| What about privacy? | Reports carry a random device id kept on the device, not an account or a name. Free text is shown as plain text. The operator token never leaves the server side. | docs/limitations.md, AGENTS.md |
| What is simulated? | The conditions: every flood, closure and jam in the demo, the rain alert, the operator in the script. The roads are real (OpenStreetMap). The scenario is labelled Simulated everywhere, including shared text. The Andheri Subway being flood-prone is a stated assumption. | docs/limitations.md, docs/demo-script.md |
| Can I check a decision? | Yes: a receipt holds a hash of the inputs, the rules and the plan. `/verify` re-runs the engine on the recorded history. It proves the decision follows from the inputs, not that the inputs were true. | docs/CONTRACTS.md |
| How good is it? | We do not claim a rate. docs/scoreboard.md replays 20 seeded simulated scenarios and publishes the usual route's exposure, the extra modelled minutes, and the cases where the detour was slower with nothing avoided. | docs/scoreboard.md |
| Path to a pilot? | The control room as the operator; read-only alert feeds (SACHET or IMD) and TomTom traffic as inputs; a municipal flood-prone-spot list to replace our assumption; a native-speaker review of Hindi and Marathi; a phone run on real devices. The limits are in docs/limitations.md. | docs/ROADMAP.md, docs/limitations.md |

## Rehearsal log

| Date | Run | Duration | Notes |
| --- | --- | --- | --- |
| (paper) | 1 | — | Timeline checked against `pnpm --filter @vighnaway/scenario-data tune` output; not yet rehearsed on devices |
