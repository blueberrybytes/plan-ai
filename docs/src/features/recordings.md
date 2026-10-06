# Recordings & Transcripts

While the Web App provides the interface for reviewing transcripts and generating tickets, the **Desktop Recorder** is the engine that securely captures the data.

Unlike generic AI meeting tools that require inviting a bot to your calendar events, the Plan AI Desktop Recorder is an app on your own machine.

## Why a Native App?

1.  **Privacy:** Clients and external stakeholders do not see a bot join the call. The recording happens invisibly.
2.  **Universal Compatibility:** Because it captures audio at the operating system level, it works with Zoom, Google Meet, Microsoft Teams, Discord, or even a local video file you are watching.
3.  **Local Control:** Recording starts and stops on your machine, when you decide. Nothing joins the call on anyone else's behalf.

## Installation

You can download the Plan AI tools for your devices:

### Desktop Recorder
*   **macOS:** Available on the [Mac App Store](https://apps.apple.com/es/app/plan-ai-recorder/id6759553699?l=en-GB&mt=12) or via [GitHub Releases (.dmg)](https://github.com/blueberrybytes/plan-ai-recorder-releases/releases).
*   **Windows & Linux:** Available via [GitHub Releases (.exe, .AppImage)](https://github.com/blueberrybytes/plan-ai-recorder-releases/releases).

### Mobile Companion App
*   **Android:** Available on [Google Play](https://play.google.com/store/apps/details?id=com.blueberrybytes.planai).
*   **iOS:** Available on the [App Store](https://apps.apple.com/us/app/plan-ai-mobile-recorder/id6762671958).

## How to Record a Meeting

1.  Open the Plan AI Recorder app and log in with your Web Dashboard account.
2.  When your meeting starts, click **Start Recording**. If you connected a calendar, the meeting that is on now appears at the top with a **Record it** button, and the recording takes its title (see [Calendar](/features/calendar)).
3.  The app will prompt you for permissions the first time it runs:
    *   **Microphone Access:** To capture your voice.
    *   **System Audio Access:** To capture the voices of the other people on the call.
4.  When the meeting is over, click **Stop** and save.

The recording is uploaded to the Plan AI backend over HTTPS and stored privately: it is only ever read through signed links that expire (see [Where Your Files Live](/security/data-storage)). It is then transcribed by the speech-to-text provider your instance is configured with (Deepgram, or a self-hosted Whisper server) and becomes available in your Web Dashboard for ticket generation and chat querying.

The mobile app records meetings in the room with the phone's microphone and works the same way.

## Tell the Other People You Are Recording

Recording people without telling them is illegal in many places. When a recording starts, the recorder shows a short message you can paste in the meeting chat (desktop) or share (mobile): *"I am recording this meeting with Plan AI to write the notes and the tasks. Tell me if you would prefer I did not."* You can hide it once you no longer need it.

## Pause and Resume

**Pause** stops recording and transcribing until you press **Resume**. Nothing said while paused is saved or sent anywhere.

The recorder also pauses on its own so it does not keep recording by mistake:

*   After 15 minutes without speech. It warns you a minute before.
*   After 3 hours, it asks you to confirm the meeting is still going on, and pauses if nobody answers within 10 minutes.

## Mark Important Moments

Press **Mark** (or Ctrl+B / Cmd+B on the desktop) to mark the current moment, and add a short note if you want. Marks are saved with the recording. The AI gives what was said around them priority when it writes the summary and the tasks, and the meeting page lists them so you can jump straight to each one.

## If the App Closes or Crashes

The audio is written to disk while you record. If the recorder closes, crashes or loses the connection, the meeting is not lost: the next time you open the app it offers to recover it, with its audio, marks and calendar event. On the phone, the upload is sent in parts and resumes where it stopped, even after the app is closed or the phone is offline for a while.

## Listen to the Meeting

The meeting page (web, desktop and mobile) has a player. Click any line of the transcript to hear that moment. On desktop recordings, your microphone and the other people's audio play together in sync.

## Send the Notes to the Attendees

**Send notes** emails the summary, the key points and the action items to the people you choose. The attendees of the calendar invite are ticked for you, and you can add other addresses and a message. Each person gets their own email, so nobody sees the other addresses, and replies go to you. Workspace members also get a link to the meeting. Plan AI never sends notes on its own.

Limits: 30 people per send, 5 sends per meeting and 200 recipients per person per day.

## Translate While You Record

If a meeting is held in a language you do not speak well, the desktop recorder and the mobile app can translate it as it happens.

*   Pick a language under **Translate to**, before you start or during the meeting. The default is **Off**.
*   Each finished phrase shows its translation under the original, about one to two seconds later. Phrases already in your language are left as they are.
*   You can change the language or turn it off at any time. The recording and the transcript are not affected.
*   The live translation is only on your screen. It is not saved and the other people in the call do not see it.

The text of each phrase goes to the same AI provider that writes the summaries, with the workspace AI key. No audio is sent for translation. If the workspace has no AI key, the app says so and keeps recording.

## Translate a Saved Transcript

On the page of a meeting, **Translate to** above the transcript shows the transcript and its summary in another language. The first time takes a few seconds, or up to a minute for a long meeting. After that the translation is stored and opens at once. The original transcript is never changed, and the translation is deleted with the meeting.

## Import Audio on the Phone

The mobile app can import an audio file you already have (m4a, mp4, aac, mp3, wav, ogg, opus, webm, flac or caf) and process it like a recording.

## Delete the Audio, Keep the Notes

*   **Delete audio** on a meeting deletes its audio files and keeps the transcript, summary, tasks and documents. The person who recorded it and the workspace owners and admins can do it.
*   **Audio retention.** A workspace owner can choose, under **Workspace Team**, to delete meeting audio automatically after 7, 30, 90, 180 or 365 days. A daily job does it. Transcripts, summaries and tasks are kept.
*   Deleting a meeting deletes its audio too.

A meeting that was never transcribed keeps its audio, because the audio is the only copy of it. Delete the meeting instead if you want it gone.
