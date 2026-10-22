# pitch-slides.md

Two slides for the pitch, as text. Figures on the scoreboard slide are copied from docs/scoreboard.md and a test fails if
they drift. Everything is "Simulated scenarios on real roads; modelled minutes".

## Slide: what the engine does with evidence (scoreboard)

**Simulated scenarios on real roads; seeds published.**

<!-- scoreboard:start -->
- 20 seeded scenarios on the real Andheri road graph.
- The usual fastest route met a Corroborated or Verified hard block in 8 of 20.
- Avoiding it cost a median of 0.3 extra modelled minutes, and 2.9 at worst.
- In 5 of 20 the recommendation was more than a minute slower although no hard block stood on the usual route.
- No scenario ended with no viable route.
<!-- scoreboard:end -->

Say: "Routing around a confirmed block is true by construction, so we do not count it as a result. What we publish is how
often the usual route meets one, what avoiding it costs, and where we were slower for nothing."

Do not say: a safety rate, lives saved, or that any route is safe. Source: docs/scoreboard.md.

## Slide: path to a pilot

- **Control room as the operator.** Only an operator sets Verified; the console already does this.
- **Inputs, read only.** Public rain alerts (SACHET or IMD, CAP), TomTom traffic, and a municipal flood-prone-spot list to
  replace our assumption for the Andheri Subway.
- **Language.** Hindi and Marathi text reviewed by native speakers.
- **Devices.** A run on real phones with a restricted maps key.
- **Stated limits.** Device-id corroboration is a heuristic; reports are not proof; conditions in the demo are simulated.
  Full list: docs/limitations.md.
