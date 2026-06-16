# UniVillage 🌿

A native React Native (Expo) prototype for an immersive Social Work & Volunteer Management mobile app. Youth cases bloom as living "premium flowers" in a gamified Secret Garden, while client interactions are handled under a strict, PDPA-compliant **volatile-memory** model.

## Run it

### 📱 Frontend (Expo Go)
```bash
cd frontend
npm install
npm start        # press i (iOS) / a (Android), or scan the QR in Expo Go
```
> **Note:** Requires the Expo Go app or a local development build. This is a native phone experience engineered with fluid layouts, custom haptics, and platform-specific styling—not a traditional web application.

### 🔌 Backend Services (Docker Local Setup)
The backend operates on a modular microservices architecture (`backend/services/`). The journaling engine requires localized persistent layers.
```bash
cd backend/services/journaling-service
docker-compose up -d    # Spins up local PostgreSQL and Redis instances
npx prisma db push      # Syncs schema definitions
npm run dev             # Starts the microservice stub
```

---

## Architecture

```
src/
├── api/             ingestionService.js        Simulated messaging logs (Telegram/WhatsApp import)
├── components/      CustomBottomBar, FlowerNode, GlassCard, AnimatedCheckbox, GardenBackground
├── context/         VolatileTranscriptContext  Volatile buffers + flushState() for raw PDPA handling
├── navigation/      YouthNavigator             Bottom Tab Navigation for the Youth experience
│                    RootNavigator              Native Stack + 5-tab glass bar for Volunteer/Worker
└── screens/
    ├── youth/       YouthHome, Journaling, YouthPinboardForum, JournalArchive
    ├── volunteer/   VolunteerHome (Secret Garden), YouthCaseDetail, WorkerPinboardMonitor,
    │                Profile, Calendar, FutureFeature
    └── worker/      CaseManagementForm         Editable AI template + local purge actions
```

---

## Key Core Modules & Role Flows

### 1. The Secret Garden & Case Management (Volunteer/Worker)
* **Secret Garden UI:** Uses `react-native-reanimated` and `moti` to map active youth case data to modular `FlowerNode` components that float, pulse, and bloom based on case engagement velocity.
* **Case Management Form:** A structured workspace providing editable AI-generated template outputs parsed directly from raw intake transcripts.

### 2. Connected Pinboard Forums & Monitoring
* **Youth Pinboard Forum:** A flat, anonymous, real-time board on the youth side designed to prioritize structural layout stability and avoid heavy query footprints.
* **Worker Pinboard Monitor:** Instead of maintaining a separate peer network workspace, this connects directly into the live youth feed. It dynamically exposes a read-only monitoring and moderation mode so social staff can keep track of youth posts instantly.

### 3. Integrated Shared Calendar
* **Volunteer Mode:** Implements a localized, unified event schedule fetching live event schemas (`GET /events`).
* **Worker Operations:** Programmed with write permissions, appending a dynamic modular overlay form to push verified milestones directly to the live backend container (`POST /events`).

### 4. Client-Side Journaling & Historical Archive (Youth)
* **Volatile Inputs:** Raw text logs and processing buffers remain client-side in transient operational contexts to preserve data anonymity.
* **Journal Archive:** Features a highly protective historical timeline pulling older data logs securely out of localized persistent environments (`AsyncStorage`) so users can seamlessly view previous reflection entries.

---

## Dual-Layer Privacy & PDPA Compliance Model

Raw imported interaction transcripts, unedited text buffers, and working AI drafts reside **strictly inside volatile runtime state variables** managed exclusively by the `VolatileTranscriptContext`. They bypass all automated serializations, system file-system logs, or caching routines.

The explicit execution of `flushState()` forces an instantaneous memory micro-scrub, defaulting `transcriptBuffer`, `rawTextLines`, and `editableDraft` to `null`. This destructive purge triggers immediately under two conditions inside `CaseManagementForm`:
1. **Export and Purge Data** – Commits a heavily sanitized, non-PII, high-level summary string to persistent historical records while securely transmitting a localized package to standard terminal prints before vaporizing raw RAM data.
2. **Just Purge Data** – Forces an abrupt, destructive wipe of the draft and transcript arrays out of memory instantly, saving absolutely nothing.

---

## Local Network Configuration (Expo Go Workaround)

To support testing on physical hardware running Expo Go without getting caught in a connection trap, the app avoids hardcoded `localhost` bindings. It instead dynamically captures the machine host interface IP running your active bundler network:

```javascript
import Constants from 'expo-constants';

// Extracts the dynamic Local IP of your development computer
const localHostIp = Constants.expoConfig?.hostUri?.split(':').shift();

export const API_BASE_URL = localHostIp 
  ? `http://${localHostIp}:3000` 
  : 'http://localhost:3000'; // Fallback for standard web runtime environments
```
*If a "Check Your Connection" banner triggers, verify your phone is on the exact same Wi-Fi SSID network as your laptop, clear your compilation cache (`npx expo start -c`), and ensure all Docker services are running.*

---

## Dev Toggles & Stubs

* `UserAuthentication`: Swapped temporarily for a dynamic development toggle control, enabling developers to jump instantly between `YouthNavigator` and `RootNavigator` layers without completing a credentials workflow.
* `backend/services/`: Fully decoupled backend mocking folders. Provides reliable route stubs for local testing without imposing explicit heavy database initializations across all functional domains.
