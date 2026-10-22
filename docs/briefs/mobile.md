# Brief: Mobile
Read in docs/BUILD_PROMPT.md: sections 1, 3 (Expo dev build, Google Maps, environment), 6 (all), 7 (all) and 8 (all). Also docs/DESIGN.md, docs/UX_FLOWS.md and docs/design/.
Scope: apps/mobile and packages/tokens.

Deliver, in order:
1. Dev build showing the styled Google map on a real Android phone; root providers in the order given in section 7; Jest harness with the mocks from section 10.
2. Drawer layout and the first-run screen.
3. The three hero screens, static with fixture data (section 6.10); team review on a phone; lock them and save screenshots to docs/design/.
4. Navigate wired to the engine and live incidents: routes, markers, route strips, sheet, banner, haptic, local notification.
5. En-route mode: simulated vehicle, travelled tint, replanFrom on every incident change, trip.position published.
6. Report modal (keyboard-controller), evidence sheet, Activity, Settings, How it decides.
7. Edge states, offline mode (MMKV, NetInfo, data age), the dependency-failure fallbacks in section 7, and the OpenStreetMap attribution.
8. Release APK with the release keystore SHA-1 on the Google key; cleartext only if the demo API is plain HTTP.

Acceptance: the section 8.7 checklist passes on two Android phones (gesture and three-button navigation); the route-change sequence holds 60 fps on the slowest demo phone; the debug hash matches the console's.
Do not: use Expo Go, import SafeAreaView from react-native, use React Native's built-in KeyboardAvoidingView, open a sheet modal from inside the Report route, or hard-code colours.
