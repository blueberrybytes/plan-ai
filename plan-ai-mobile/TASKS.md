# Backlog & Pending Tasks

## Android
- [ ] **Background Audio Recording (Foreground Service)**
  - Android OS (API 28+) kills background microphone access to protect privacy.
  - Unlike iOS (`UIBackgroundModes`), Android requires explicitly starting a "Foreground Service" linked to a persistent Status Bar Notification.
  - **Implementation Steps:**
    1. Add `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` permissions to `app.config.ts` android block.
    2. Install a Foreground Service manager library (e.g., `@supersami/rn-foreground-service` or `@notifee/react-native`).
    3. Start the service with a "Recording Meeting..." notification explicitly before calling `LiveAudioStream.start()`.
    4. Stop the service and remove the notification on `LiveAudioStream.stop()`.

## iOS
- [ ] **Background Audio Recording (UIBackgroundModes)**
  - Enable `audio` background mode in Xcode/app.json.
  - Implement lock-screen controls utilizing `react-native-track-player` or similar native modules so the user can pause/stop recording from their pocket without opening the app.

## Resiliency & Architecture
- [ ] **Offline-First / Elevator Mode Sync**
  - Save the 16-bit PCM WAV securely into local device storage using Expo File System.
  - If WebSocket drops out due to bad 5G, display a "Local Recording" banner.
  - On "Stop", enqueue the file and payload into a background SQLite task queue.
  - Transparently push the file to `/api/transcripts/recorder-upload` once the OS detects stable WiFi/Cellular.

## UX & Editor Features
- [ ] **Real-Time Bookmark & Highlights 🚩**
  - Add a floating action button on `record.tsx`.
  - Pressing it saves the exact timestamp `Date.now()`.
  - Pass the timestamps to the Backend AI Prompt to forcefully extract Linear Tasks explicitly from those highlighted video/audio blocks.

- [ ] **Tap-to-Play Synchronized Playback ⏯️**
  - Audio scrub player on `transcript/[id].tsx`.
  - Tapping an utterance bubble seeks the WAV file directly to `utterance.start` so the user can audit misheard words instantly.

- [ ] **In-Situ Biometric Tagging 👥**
  - Add UI on "Speaker 2" labels allowing the user to map that speaker to a specific person (e.g., "Carlos").
  - Post the acoustic mapping back to PostgreSQL.
  - Subsequent Deepgram diarizations query the personal Workspace Vector DB to auto-populate "Carlos".

- [ ] **Spanglish Code-Switching Context 🔀**
  - Toggle in context selection explicitly sending `"code_switching: true"` or `"detect_language: true"` to Deepgram so it doesn't butcher mixed English-Spanish sentences.
