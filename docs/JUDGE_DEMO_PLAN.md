# JUDGE_DEMO_PLAN.md: how we win the room

Owner: Pitch and QA. This is the stage plan: what we say, who taps what, which screen is on, the jokes, and every
question we expect. The step-by-step timings and fallbacks are in docs/demo-script.md. This file sits on top of that one.
The rules from AGENTS.md apply on stage too: we never say "safe", "safest" or "guaranteed", we give no safety percentage,
and every condition we show is **simulated**.

---

## 0. What the judges should remember

If a judge remembers only three things, they should be these. Every part of the pitch leads back to one of them.

1. **"In a flood, the fastest route is the one that drowns first."** This is our opening line and our closing line.
2. **"No report is not the same as clear."** No other navigation app treats silence as a risk. We do.
3. **"Same evidence, same route, every time, and you can check it."** One deterministic engine runs on the phone and the
   console and re-runs from a receipt. There is no LLM and no black box.

The memory hook is the name: **Vighna** (विघ्न) means obstacle, and Ganesha is called **Vighnaharta**, the remover of
obstacles. Mumbai is Ganesha's city. VIGHNAWAY: *obstacle, away.*

---

## 1. Roles and stage layout

| Person | Job on stage | Owns in Q&A |
| --- | --- | --- |
| **A: Narrator** | Opens, tells the story, closes. Faces the judges, never the laptop. | Problem, impact, product, pilot, business |
| **B: Phone driver** | Holds the demo phone (mirrored), taps Start trip, reads the banners aloud when they land | Mobile, UX, accessibility, offline, languages |
| **C: Operator** | Drives the console: Play, Pause, Verify, Reset, Presenter mode, receipts | Engine, scoring rules, architecture, data, security |
| **D (if four of us)** | Runs the judge QR moment, holds the backup phone and the backup video | Data and sim, scoreboard, limitations |

**Projector layout.** Left half: the phone mirrored with `scrcpy`. Right half: the console at `/console`, 1920×1080.
The judges always see **both screens at once**, because the main point is that the two decide separately and still agree.

**Hand-off rule.** When the phone shows something, A says "look left". When the console shows something, A says "look
right". Judges should not have to guess which screen to watch.

---

## 2. Before the judges arrive (T-30 min)

Run the full setup in docs/demo-script.md ("Setup"). Then check this short list out loud as a team:

- [ ] `pnpm preflight` is green. API health is OK. Console shows **Connected**.
- [ ] Console: operator token entered, **Reset** pressed, clock at 14:05.
- [ ] Phone: Navigate shows **Via Andheri Subway, Low confidence**, and the **Simulated** label is visible.
- [ ] Phone and console parity hashes match (phone debug screen, console `/debug`).
- [ ] Presenter mode (**P**) opens and shows the QR card. Scan it with the backup phone and confirm the report page loads.
- [ ] Backup phone on the same build. Backup video (docs/demo/*.webm) open and paused on the laptop.
- [ ] Phone on Do Not Disturb (no WhatsApp pop-ups mid-demo), brightness at maximum, volume up for the buzz.
- [ ] Laptop: notifications off, battery charging, browser zoom 100%, every other tab closed.
- [ ] One printed copy of this file and docs/scoring.md on the table for Q&A.

> **Honesty check before stage.** As of the last status update, the phone half had only a partial device run
> (docs/ROADMAP_STATUS.md, P0-3). If the full scripted run has not worked on the phone **today**, run the demo on the
> console (plus the web `/report` page for the judge moment) and say the phone is a development build. Never show a flow
> on stage that we have not run on that device that day.

---

## 3. The script (about 6 minutes plus Q&A)

`SAY` is spoken text. Learn it, but do not read it out. `DO` is the action. `SCREEN` is where the judges should look.

### 3.1 Cold open: the quote (0:00 to 0:25), Narrator

**SCREEN:** both screens show the map on Andheri, nothing moving. **Leave a full second of silence before the first word.**

> **SAY:** "In a flood, the fastest route is the one that drowns first."
>
> *(pause)*
>
> "Every monsoon in Mumbai, the Andheri Subway fills with water. Every monsoon, navigation apps keep sending cars into it,
> because on paper it is still the fastest way across the railway."

### 3.2 The hook (0:25 to 0:50), Narrator, **first funny beat**

> **SAY:** "Quick show of hands: who has followed a navigation app into a road it should have known about?
> *(hands go up)* Right. Your app said *'Continue straight for 400 metres.'* It did not mention the 400 metres were
> underwater. It said *'Recalculating'* only once you were already in the water."
>
> "In Mumbai, before a journey, people say a prayer to **Vighnaharta**, the remover of obstacles. We thought he could use
> some help with the routing. *(beat)* So we built **VIGHNAWAY**: *vighna* means obstacle. Obstacle, away."

### 3.3 The problem in one breath (0:50 to 1:10), Narrator

> **SAY:** "The information that a road is blocked exists. People standing next to it know. A control room knows. A rain
> alert knows. But that information is scattered, unverified and **invisible when you choose your route**. VIGHNAWAY puts it
> into the route decision, explains the decision in one sentence, and changes the route **only when the evidence justifies
> it**."
>
> "Before we start: the roads you will see are real OpenStreetMap roads in Andheri. **The flood is simulated.** We label it
> on every screen, and we will not pretend otherwise."

(Saying "simulated" early earns trust. Judges will check whether we stay honest, and we will.)

### 3.4 Live demo (1:10 to 3:40)

Trip: **Ramesh Nagar (Andheri West) → Holy Spirit Hospital (Andheri East)**, across the railway. Clock: 14:05 IST simulated,
10× speed. **C presses Pause after every beat in bold below**, so A can talk without the next event cutting in.

| # | Sim time | DO | SCREEN | SAY (A, unless marked) |
| --- | --- | --- | --- | --- |
| 1 | 14:05 | B: **Start trip**. C: **Play** | **Left** (phone): Via Andheri Subway, 11 min, **Low** confidence, "No recent reports on Andheri Subway during the rain alert" | "Ordinary navigation takes the subway. So do we, for now, but look at the confidence: **Low**. There is a rain alert, the subway is flood-prone, and **nobody has reported on it in the last hour**. Most apps treat no news as good news. **No report is not the same as clear.**" |
| 2 | 14:06 | (event ev01) **Pause** | **Left**: toast "Route unchanged: one unverified report". **Right**: queue, Unverified, dashed ring | "One person reports ankle-deep water. One unverified report. We **do not** reroute. One anonymous message should not move a city's traffic. It adds a penalty and we hold." |
| 3 | 14:08 | **Play** → ev02 → **Pause** | **Both**: buzz on the phone, banner "Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via G K Gokhale Flyover adds 4 min." Same banner on the console | B reads the banner aloud. A: "A second phone, within 150 metres and 30 minutes, reports knee-deep water. That is **corroborated**, and knee-deep and corroborated is a **hard block**. Look at both screens: the phone and the control room **each computed this on their own**. The server never sent a route. It sent evidence." |
| 4 | 14:09:30 | C: **Verify** live on the console (or let ev03 play) | **Right**: card pulses "Verified by operator". **Left**: chip updates | C: "Only a human operator can mark something **Verified**. Notice that the route **does not move**. The decision was already right, so verifying it changes the label and not the route." |
| 5 | 14:11 | **Play** → ev04, ev05 → **Pause** | **Left**: "Route unchanged" toast, then a buzz: "Heavy congestion on G K Gokhale Flyover … New route via Balasaheb Thackeray Flyover saves 3 min." | "Everyone took the flyover, so now the flyover is jammed. One unverified jam report counts at 40% and is not enough. When it is corroborated it changes the ETA, and the other crossing now wins by more than our switching threshold. **We switch only when the gain is worth it**, which stops the route flickering." |
| 6 | 14:13 | **Play** → ev06, ev07 → **Pause** | **Left**: **No viable route** sheet: "Nearest reachable: HBT Trauma Care Hospital", "In an emergency, call 112." B taps **Go to HBT Trauma Care Hospital** | "Now the only road into Holy Spirit Hospital is closed and verified. Most apps would hand you a route that does not work. **We tell you there is no viable route**, offer the nearest reachable hospital, and point to 112. Saying *I don't know a way* is a feature." |
| 7 | — | C: **Reset**, then **Play** for 5 seconds, then **Pause** | **Right**: `/debug` parity hash. **Left**: phone debug hash | C: "Reset and replay gives the same decisions with the same hash, on both devices. **Same evidence, same route, every time.**" |

**Judge-in-the-loop (the moment they will remember), 45 seconds, D or A. Second funny beat.**
Do this between beats 2 and 3 if there is time, otherwise straight after the demo.

> **DO:** press **P** (Presenter mode) to show the QR card. Hand a judge the backup phone, or invite them to scan.
>
> **SAY:** "Would you like to cause a flood? *(judge scans, reports water at the subway)* Congratulations, you are now an
> official flood witness, status: **Unverified**. Please don't take it personally, everyone starts there.
> *(a second judge or D reports)* And now you are **Corroborated**. Two phones agree. Watch the right screen. You
> *still* cannot make it **Verified**. Only the control room can do that, and we have not decided whether to trust you yet."
>
> **DO (C):** afterwards press **Clear audience reports** (confirm) so the scripted run stays clean.

### 3.5 Why you can trust the decision (3:40 to 4:30), Operator

**SCREEN: right.** Open the route card, then **Create receipt**, then the QR or link. Optional: open `/verify?r=…` on the second laptop.

> **SAY:** "Three things are under the hood.
> **One: no LLM and no randomness in the decision.** It is one deterministic TypeScript engine. The same code runs on the
> phone, in the browser and on the server, and every rule is written down in our scoring document.
> **Two: every change explains itself.** Which incident caused it, its status, its source, and how old it is.
> *(Tap 'Why not this route?' on an alternative)* We even tell you what would have to change for the other route to win,
> and we check that by re-running the engine.
> **Three: every decision gets a receipt.** It is a hash of the inputs, the rules and the plan. Anyone can re-run it on
> `/verify`. It proves the decision follows from the evidence. It does **not** prove the evidence was true, and we say
> that on the page."

### 3.6 Honest numbers (4:30 to 4:55), Narrator

**SCREEN:** scoreboard slide (docs/pitch-slides.md).

> **SAY:** "We will not show you a 'lives saved' number, because nobody honestly can. Here is what we can show. Twenty
> seeded scenarios on the real Andheri road graph, seeds published. The usual fastest route ran into a confirmed hard
> block in **8 of 20**. Avoiding it cost a median of **0.3 extra minutes**, and **2.9 at worst**. We also publish where we
> were wrong: in **5 of 20** we were more than a minute slower with nothing to avoid. We would rather show you our misses
> than hide them."

### 3.7 It is more than one demo (4:55 to 5:30), Phone driver, **quick tour, pick 3 to 4**

**SCREEN:** left, flicking through the app quickly. Say one line per feature and keep moving.

- **Step-free walking:** "For a wheelchair user it never uses mapped steps, and it tells you where the map doesn't know."
- **Prefer well-lit roads:** "A walking preference. It changes the ranking only and never rates a neighbourhood."
- **Ask the crowd:** "At a flood-prone road with no recent report, the app asks the person standing there: *is it flooded right now?*"
- **Offline QR relay:** "No signal at the flood? Your report becomes a QR code that someone with signal can pass on."
- **Hospital load spreading:** "If several trips head to the nearest hospital, we spread them by hospital state, and operators set that state." (Right: hospital states.)
- **Commute watch, operator-drawn closures, after-action report, Hindi and Marathi, and a second region with real roads from Amritsar to Ambala.**

### 3.8 Close (5:30 to 6:00), Narrator. **Callback to the opening quote.**

> **SAY:** "Ordinary navigation asks one question: *what's fastest?* We ask the four that matter in a flood: **which route,
> why, what it costs you, and how sure we are.** And when we don't know, we say so.
>
> In a flood, the fastest route is the one that drowns first. *(beat)* VIGHNAWAY takes the one with the evidence.
>
> Obstacle, away. Thank you."

**Stop talking. Smile. Wait for questions.** Leave both screens on the map. Do not close anything.

---

## 4. Screen map: what is shown, where, and why

| When | Surface | Screen / route | What to point at |
| --- | --- | --- | --- |
| Pre-roll | Phone | First-run ("Simulated flood scenario: Andheri, Mumbai") | Only if a judge asks how the app starts. It shows we label the simulation from the very first screen |
| Demo 1 to 6 | Phone | Navigate → Start trip → Drive (en-route) | Route strip, confidence chip, evidence chip (status + source + age), banner, buzz |
| Demo 1 to 6 | Web | `/console` (control room) | Incident queue (Unverified → Corroborated → Verified), the same banner, simulation clock, Play/Pause/Step |
| Demo 4 | Web | `/console` incident card → **Verify** | Only a person can set Verified |
| Demo 6 | Phone | No viable route sheet | Nearest reachable hospital + "call 112" |
| Demo 7 | Both | Phone debug screen / web `/debug` | Matching parity hash |
| Judge moment | Web → judge's phone | Presenter mode (**P**) QR → web `/report` | The status ladder live; then **Clear audience reports** |
| Trust | Web | Route card → **Create receipt** → `/verify?r=…` | Same inputs, rules and route, re-run independently |
| Trust | Either | "Why not this route?" line | Counterfactual checked by the engine |
| Numbers | Slide | docs/scoreboard.md / docs/pitch-slides.md | 8/20, 0.3 min median, 2.9 worst, 5/20 misses |
| If asked | Web | `/rules` | Every rule and every limitation, written down publicly |
| If asked | Web | `/after-action` | Every decision rebuilt from history, printable |
| If asked | Web | `/admin`, `/login` | Roles: citizen, operator, admin. Email one-time-code sign-in |
| If asked | Phone | Settings, Account, Report, Relay, Map list | Language, profiles, display name, account deletion, offline QR relay |

---

## 5. Cuts by time slot

| Slot | Keep | Cut |
| --- | --- | --- |
| **3 min** | Quote, hook (no show of hands), demo beats 1, 3, 6, one sentence on deterministic + receipt, close | Judge moment, Verify beat, scoreboard, feature tour, replay |
| **5 min** | Everything to 3.6, close | Feature tour (keep one line: "plus step-free, offline relay, hospital load"), replay |
| **8+ min / tech judge** | All of it, plus open `/verify` live, show `/rules`, and show `pnpm --filter @vighnaway/scenario-data tune` printing the same decisions offline | — |

**Never cut:** the quote, the "simulated" disclosure, the Unverified hold (beat 2), the corroborated switch (beat 3), the
No viable route moment (beat 6), and the close.

---

## 6. When it breaks on stage (say it with a smile)

| Failure | What we do | What we say |
| --- | --- | --- |
| Hotspot drops | Keep going. The phone routes on cached incidents and shows "Offline: using incidents from …". Press **Step** after reconnecting | "This is actually the point: in a flood, the network fails too. The phone keeps deciding offline, and look, it tells you how old its information is." |
| API down | Restart `pnpm --filter api start`. If it is still down after 20 s, play the backup video | "We brought a recording for exactly this. We plan for failure. That's the whole product." |
| Map blank (key/network) | Continue on the schematic view. Route cards and banners still work | "The map is decoration. The decision doesn't need it." |
| Phone crashes | D hands over the backup phone, **Reset** | — |
| Judges spam reports | **Clear audience reports**, or **Reset** | "You've just shown why one phone can't verify anything." |
| QR won't scan | Read out the short address under the QR | — |
| Receipt check fails | Check both laptops show the same scenario/run id on `/debug`. If we reset in between, the receipt *should* fail | "That's the receipt working: different inputs, so it refuses to match." |

---

## 7. Q&A bank: be ready for everything

**How we answer:** one or two sentences, then **show it** if it can be shown, then stop. If we don't know, say "We haven't
measured that. Here is how we would." **Never bluff.** Judges test honesty more than features. The owner answers
(section 1). Anyone else adds at most one sentence.

### 7.1 "Why does this need to exist?" (product and competition)

| Question | Answer | Show |
| --- | --- | --- |
| Why not just use Google Maps / Waze? | They route on speed and typical traffic, and treat no reports as no problem. We route on **evidence with stated rules**: a corroborated or verified flood or closure is a hard block, one unverified report is not, and every change says what caused it. And the same evidence gives the same route on every device. | Beat 2 vs beat 3 |
| Waze already has user reports. What's new? | Waze shows reports. It doesn't say how much each report is trusted, and it doesn't treat **silence on a flood-prone road** as a risk. We have a visible status ladder (Unverified → Corroborated → Verified-by-operator), age decay, a data-gap penalty, and an anti-flicker switching rule. | `/rules` |
| Google shows road closures too. | From official sources, hours late, and with no reasoning shown. We take field reports, rank them by how well supported they are, and explain the decision in one sentence. | Banner |
| Who is the user? | A driver, rider or pedestrian who has to cross the railway in heavy rain, often to reach a hospital, and the control-room operator who verifies reports. | — |
| Why hospitals? | It is the trip where the cost of a wrong route is highest, and it lets us show the No viable route → nearest reachable hospital → 112 path. | Beat 6 |
| Why Andheri? | The subway under the Western Railway line is a well-known monsoon trouble spot, and the railway gives only a few crossings, so choosing the crossing really matters. | Map |
| Does it work only in Andheri? | The engine works on any road graph. Andheri has the full simulated scenario. The Amritsar to Ambala corridor runs on real OpenStreetMap roads with the same engine but has no incidents yet. A new city needs an OSM extract, not new code. | Phone, north region |
| Isn't this just for floods? | The incident types are flood, closure, congestion, debris and accident, plus walking concerns that never affect routing. Floods are the demo. Riots, landslides or a fallen tree all fit the same rules. | `/rules` |

### 7.2 "Can I trust it?" (evidence, misuse, honesty)

| Question | Answer | Show |
| --- | --- | --- |
| How do you know a report is true? | **We don't claim to.** Every report shows its source and status. Two devices nearby is "Corroborated", which is a heuristic and labelled as one. Only an operator sets "Verified". | Judge moment |
| What if one person uses two phones? | Then they can corroborate. We say so in our limitations document. It is a prototype heuristic, which is why Corroborated and Verified are kept separate. For a pilot: account-weighted trust and operator review. *(Light touch: "We know because we tried it.")* | docs/limitations.md |
| What if someone fakes a flood to clear a road for themselves? | One unverified report only adds a penalty and never blocks. Blocking needs two devices close in space and time, or an operator. Reports are rate-limited per device, and the operator can dismiss an incident or clear all audience reports. | `/console` |
| What stops spam / a bot attack? | Per-device report throttling, hashed device ids, rate-limited sign-in codes, and every report is plain text with no HTML. At pilot scale, add account trust and anomaly checks on the operator side, which stay outside the routing decision. | — |
| A report says "road clear". Do you reopen it? | Never from one report. It marks the incident **Conflicting** (confidence drops to Low) until an operator resolves it or clear reports come from two different devices. The block stays in force meanwhile. | docs/scoring.md |
| What about old reports? | Full weight for 30 minutes, falling to 60% at 3 hours. After 3 hours they are labelled **Stale**, not dropped. A stale hard block holds until an operator resolves it, and confidence drops to Low. | — |
| Why don't you say "safe route"? | Because we can't know that, and saying so could get someone hurt. We say "viable", give the evidence, and give a confidence label. That's a deliberate design rule. | — |
| Why High/Medium/Low and not a percentage? | A percentage suggests a probability we don't have. The label comes from a published decision table: for example, Low if the next route is within 60 seconds or the decision rests on a stale report. | docs/scoring.md |
| Can a malicious operator abuse Verify? | In the prototype, yes. It is a demo-grade shared token. For a pilot: per-operator accounts (role-based sign-in already exists), an audit log, and the after-action report already rebuilds every decision from history. | `/after-action` |
| What does the receipt prove? | That the decision follows from the recorded inputs and the published rules. **Not** that the inputs were true. That's written on the verify page. | `/verify` |

### 7.3 "Is it real?" (simulation and data)

| Question | Answer |
| --- | --- |
| What exactly is simulated? | The conditions: every flood, jam and closure, the rain alert, and the scripted operator. The roads are real OpenStreetMap. It is labelled Simulated on every screen and in shared route text. |
| Is the Andheri Subway really marked flood-prone in the data? | No. OSM leaves it unnamed and unmarked, so we name it and mark it flood-prone **by hand**, and say so. A pilot replaces that with the municipal flood-prone-spot list. |
| Where do the speeds come from? | Illustrative monsoon defaults per road class, not measurements. With a live feed (TomTom integration written, not tested against the real service) congestion would come from data. |
| How big is the graph? | The real Andheri OSM extract, graph `osm-7efdf89a8094`, about 23,000 directed edges. |
| Did you invent the scoreboard numbers? | They come from 20 seeded scenarios. The seeds are published and a test fails if the slide drifts from the report. The hazard generator puts about 60% of hazards on the usual route, and we say so. |
| Is live data possible? | Yes. A read-only CAP alert parser (SACHET/IMD format) exists, and so does the TomTom traffic adapter. Both still need testing against the live services; we don't claim they are live today. |

### 7.4 "How does it work?" (technical judges)

| Question | Answer |
| --- | --- |
| Architecture in one breath? | Expo Android app + Next.js control room + NestJS API on Postgres/PostGIS, all sharing one pure TypeScript route engine and one Zod contracts package. The API stores incidents and broadcasts them over socket.io with sequence numbers. **The server never sends routes.** |
| Why run the engine on the phone? | So the phone keeps deciding when the network fails, and so two independent computations can be checked against each other (parity hash). The server can't quietly change your route. |
| How do you pick candidate routes? | Yen k-shortest paths (k = 5) plus edge-penalty alternatives plus the best path around current hazards, with routes overlapping more than 80% removed. Then a deterministic cost ranks them. |
| What's the cost function? | Travel time × congestion multiplier, plus incident penalties (severity × verification weight × age factor), plus a data-gap penalty. Hard blocks remove a route entirely. The ETA shown counts only verified or corroborated congestion. Penalties affect ranking and are never shown as minutes. |
| Why won't the route flicker? | Switching rule: keep the current route unless it stops being viable or another is cheaper by more than **max(120 s, 10%)**. Ties: cost, then distance, then route id. Everything is rounded to whole seconds before comparing. |
| How is corroboration computed? | PostGIS: reports are snapped to road edges, and two different hashed device ids within 150 m and 30 minutes make "Corroborated (2 devices)". The server sets every timestamp. |
| Why no ML / LLM? | The decision has to be repeatable, explainable and checkable from a receipt. An LLM gives none of those. Forecasting needs data we don't have. We'd rather be transparently rule-based than opaquely clever. |
| How fast is it? | About 1 ms on the test fixture and about 50 ms on a 3,900-node synthetic grid in Node. On the phone it is **not yet measured** in a release build (the dev build was slow). The target is under 200 ms in Hermes. *(Don't round this up.)* |
| What happens offline? | The phone keeps the last incident snapshot, keeps routing on it, and shows how old it is. On reconnect it resyncs by sequence number. Reports can also go out by **offline QR relay**. |
| How would it scale to a city? | The heavy compute is on the clients, and the server only stores and fans out incidents, which is cheap. Next steps: tile the graph per region, shard socket rooms by area, and add a Redis adapter for socket.io. We haven't load-tested, and we say so. |
| What did you test? | Engine unit and property tests, golden plan hashes, API tests, mobile Jest, console Vitest, a two-browser end-to-end run (9/9 against a real DB), and the smoke drill (18/18). *(Run `pnpm test` the morning of the demo and quote that day's numbers.)* |
| OSM routes on a Google basemap, is that allowed? | It's a known licensing question and it's in our limitations. It must be cleared with both providers before any public release. The engine doesn't depend on Google. |

### 7.5 "What about people?" (ethics, privacy, accessibility)

| Question | Answer |
| --- | --- |
| Privacy? | Reports carry a random device id, hashed on the server, with no name needed. Accounts are optional for citizens and never affect routing. Free text is shown as plain text. The operator token never reaches the client. Account deletion is in the app. |
| Location tracking? | The demo vehicle position is display-only. Routing runs on the phone, so the server doesn't need your trip to give you a route. |
| Photos? | Operator-only. We list the gaps openly: no retention job yet, no face or number-plate blurring. They have to be fixed before real use. |
| Accessibility? | A step-free walking profile (never uses mapped steps, and says where step-free access is unknown), haptics plus text for every change, and Hindi and Marathi (pending native-speaker review). |
| Women's safety / lighting? | "Prefer well-lit roads" is an opt-in ranking preference. Walking-concern reports are **display-only and never change a route**. We deliberately never rate an area as unsafe, because that ends up stigmatising neighbourhoods. |
| Could it send everyone to one road and create a new jam? | Corroborated congestion then reroutes people (that's beat 5). For hospitals specifically, load spreading assigns trips by hospital state and existing load. City-wide traffic balancing is future work. |

### 7.6 "Is it a business?" (impact and pilot)

| Question | Answer |
| --- | --- |
| Who pays? | The first customer is a city disaster-management control room (for Mumbai, the BMC's), which gets an operator console and verified situational awareness. Citizens use it free. Later: ambulance fleets and logistics companies paying for routing through the API. |
| Path to a pilot? | The control room as operator; SACHET/IMD alerts and a traffic feed as read-only inputs; the municipal flood-prone list in place of our assumption; native-language review; a run on real phones. All of it is listed in docs/pitch-slides.md. |
| Why would people report? | Ask the crowd asks only the person already standing at the spot, with one tap. And everyone driving behind them benefits. That's the Waze model, but with trust levels. |
| What would you build next with more time? | A measured phone run and a release APK, live alert and traffic feeds, account-weighted trust, and a second fully simulated city. |
| What's the impact metric? | Not "lives saved", which we can't measure. For a pilot: how often the usual route met a confirmed block, the minutes it cost to avoid it, operator time to verify, and the share of flood-prone roads reported on during an alert. |

### 7.7 Curveballs

| Question | Answer |
| --- | --- |
| "So your app just gives up?" (No viable route) | "It refuses to lie. It says there's no viable route to that hospital, gives the nearest one it *can* reach, and points you to 112. A wrong route in a flood is worse than an honest 'no'." |
| "Wasn't the demo rigged?" | "The event times were tuned so it fits in a minute, and we say so. The decisions are not scripted. Reset and replay gives the identical result because the engine is deterministic, and you can re-run any of them from a receipt." |
| "What's the hardest bug you hit?" | Real roads are split into many short edges, so the data-gap penalty first counted the same stretch dozens of times. We changed it to count once per continuous flood-prone stretch. |
| "Why should *you* win?" | "Most teams showed you an app that is confident. We showed you one that is honest about what it knows, explains every decision, and that you can check yourself. In an emergency, that's what you can rely on." |
| A question nobody knows | "Good question, we haven't tested that. Our best guess is X, and here is how we'd check it." Then move on. |

---

## 8. Language rules on stage

| Never say | Say instead |
| --- | --- |
| safe / safest / guaranteed | viable, recommended, "avoids the corroborated flood" |
| "92% safe", any percentage | High / Medium / Low confidence |
| "the road is flooded" | "a corroborated, simulated report of knee-deep flooding" |
| "AI decides" | "a deterministic engine with published rules" |
| "verified by two users" | "corroborated by two devices; only an operator verifies" |
| "lives saved" | "minutes, exposure, and our misses" |
| "it works on the phone" (if not run today) | "it runs on the phone in a development build" |

---

## 9. Rehearsal plan

1. **Run 1 (paper, 10 min):** read section 3 aloud with a timer. Cut anything that pushes past 6:00.
2. **Run 2 (full stack):** both screens, real Pause timings. Write down where A waits for the screen and where the screen waits for A.
3. **Run 3 (failure drill):** halfway through, D pulls the hotspot. Practise the offline line, then the backup-video line.
4. **Run 4 (Q&A drill):** D fires 15 random questions from section 7. The owner answers in under 20 seconds. Anyone who says "safe" does ten push-ups. (That counts as the team-building budget.)
5. **Run 5 (dress):** the 3-minute cut, then the full 6-minute version, back to back.

Log each run in the "Rehearsal log" table in docs/demo-script.md.
