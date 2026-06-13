# UniGarden 🌿

A native React Native (Expo) prototype for a Social Work & Volunteer Management
mobile app. Youth cases bloom as living "premium flowers" in an immersive Secret
Garden, and all raw transcript data is handled under a strict PDPA-compliant
**volatile-memory** model.

## Run it

```bash
npm install
npm start        # then press i (iOS) / a (Android), or scan the QR in Expo Go
```

> Requires the Expo Go app or a dev build. Targets iOS & Android only — this is a
> native phone experience, not a web app.

## Architecture

```
src/
├── api/            ingestionService.js        simulated Telegram/WhatsApp import
├── components/     CustomBottomBar, FlowerNode, GlassCard,
│                   AnimatedCheckbox, GardenBackground
├── context/        VolatileTranscriptContext  volatile buffers + flushState()
├── navigation/     RootNavigator              Native Stack + 5-tab glass bar
└── screens/
    ├── volunteer/  VolunteerHome (Secret Garden), YouthCaseDetail, PeerForum,
    │               Profile, Calendar, FutureFeature
    └── worker/     CaseManagementForm         editable AI template + purge actions
```

## PDPA simulation (the important part)

Raw imported logs, full transcripts, and unedited AI drafts live **only** in
volatile React state inside `VolatileTranscriptContext`. They are never written
to disk, AsyncStorage, or any cache.

`flushState()` resets `transcriptBuffer`, `rawTextLines`, and `editableDraft`
back to `null` the instant a purge is confirmed. Both termination actions in
`CaseManagementForm` call it:

- **Export and Purge Data** — commits a sanitized, non-PII summary to retained
  history and simulates a secure export, *then* destructively flushes raw memory.
- **Just Purge Data** — flushes the draft and raw logs immediately, saving nothing.

Only sanitized high-level summary strings ever survive a purge.

## Tech

`react-native-reanimated` + `moti` for 60fps spring & loop animations,
`expo-blur` + `expo-linear-gradient` for glassmorphism and organic green/teal
gradients, `react-native-safe-area-context` for notch-aware layouts.

## Dev toggles

- `PeerForum.js` → `SHOW_COMMENTS` — flip to `false` to remove the comments
  section app-wide.
