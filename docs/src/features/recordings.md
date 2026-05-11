# Recordings & Transcripts

While the Web App provides the interface for reviewing transcripts and generating tickets, the **Desktop Recorder** is the engine that securely captures the data.

Unlike generic AI meeting tools that require inviting a bot to your calendar events, the Plan AI Desktop Recorder runs entirely locally on your machine.

## Why a Native App?

1.  **Privacy:** Clients and external stakeholders do not see a bot join the call. The recording happens invisibly.
2.  **Universal Compatibility:** Because it captures audio at the operating system level, it works with Zoom, Google Meet, Microsoft Teams, Discord, or even a local video file you are watching.
3.  **Local Control:** You can instantly pause the recording from your menu bar if a highly sensitive topic is brought up, ensuring the audio never leaves your machine.

## Installation

You can download the Plan AI tools for your devices:

### Desktop Recorder
*   **macOS:** Available on the [Mac App Store](https://apps.apple.com/es/app/plan-ai-recorder/id6759553699?l=en-GB&mt=12) or via [GitHub Releases (.dmg)](https://github.com/blueberrybytes/plan-ai-recorder-releases/releases).
*   **Windows & Linux:** Available via [GitHub Releases (.exe, .AppImage)](https://github.com/blueberrybytes/plan-ai-recorder-releases/releases).

### Mobile Companion App
*   **Android:** Available on [Google Play](https://play.google.com/store/apps/details?id=com.blueberrybytes.planai).
*   **iOS:** Available on the [App Store](https://apps.apple.com/us/app/plan-ai-mobile-recorder/id6762671958).

## How to Record a Meeting

1.  Open the Plan AI Recorder app. It will sit quietly in your menu bar (macOS) or system tray (Windows).
2.  Click the Plan AI icon and select **Log In**. This will authenticate you with your Web Dashboard account.
3.  When your meeting starts, click the **Record** button. 
4.  The app will prompt you for permissions the first time it runs:
    *   **Microphone Access:** To capture your voice.
    *   **System Audio Access:** To capture the voices of the other people on the call.
5.  When the meeting is over, click **Stop**.

The audio file is immediately encrypted and securely uploaded to the Plan AI backend. Within seconds, it is transcribed by Deepgram and becomes available in your Web Dashboard for ticket generation and chat querying.
