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

## Fallbacks

- **Network fails (hotspot drops):** the phone keeps routing on cached incidents with "Offline:
  using incidents from 14:12 (1 min old)". Use the console's **Step** after reconnect; resync by seq
  restores both screens.
- **API down:** restart `pnpm --filter api start`; clients resync on reconnect. If it stays down,
  play the backup video.
- **Map fails (key or network):** both surfaces show "Map unavailable: check the Google Maps key or
  the network" and the schematic view; route cards and banners keep working.
- **Phone crashes:** backup phone, same build, press Reset.

## Reset procedure

Console → **Reset** (clears incidents, reports and events, bumps seq, emits sim.reset). Phone:
End trip → back on Navigate shows Via Andheri Subway. Check both parity hashes match.

## Rehearsal log

| Date | Run | Duration | Notes |
| --- | --- | --- | --- |
| (paper) | 1 | — | Timeline checked against `pnpm --filter @vighnaway/scenario-data tune` output; not yet rehearsed on devices |
