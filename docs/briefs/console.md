# Brief: Console
Read in docs/BUILD_PROMPT.md: sections 1, 4 (contracts, determinism), 6 (6.2 tokens, 6.5 signature elements, 6.6 motion, 6.7 console look), 9 (all) and 10 (event script).
Scope: apps/console.

Deliver, in order:
1. /console at 1920 by 1080: incident queue, Google map styled like the phone, simulation controls, clock, route cards with route strips, QR card for /report.
2. Operator token entry; Verify, Resolve and Dismiss with optimistic updates and rollback; Play, Pause, Step, Reset.
3. Live updates: socket join, resync by seq, the vehicle from trip.position, the same route-change motion as the phone.
4. /report mobile web form; /rules rendering SCORING_RULES; /debug showing the planTrip hash; failure messages and attribution as in section 9.

Acceptance: an operator Verify reroutes the phone within 2 seconds; legible from the back of a room (18 px base text, AA contrast, nothing hover-only); /report works in an iPhone and an Android browser.
Do not: compute routing outside the engine package, or use colours outside the tokens.
