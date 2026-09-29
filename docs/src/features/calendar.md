# Calendar (Google and Outlook)

Connect your Google Calendar or Outlook Calendar and Plan AI knows which meeting you are recording. Each person connects their own calendar. It is a personal connection, not a workspace one.

## What it does

- **Happening now.** The desktop recorder and the mobile app show the meeting that is on now, or the next one within 15 minutes. The desktop recorder also sends a notification when a meeting is about to start. **Record it** starts recording that meeting.
- **The recording gets the meeting's name.** A recording started during the meeting takes the title of the event.
- **Better speaker names.** The attendees of the invite are passed to the AI together with the workspace members, so it spells people's names correctly when it names the speakers.
- **The invite stays with the meeting.** The meeting page shows the event it was recorded from: title, time, the people invited and the call link.
- **Send the notes to the attendees.** "Send notes" proposes the attendees of the invite. See [Recordings](/features/recordings#send-the-notes-to-the-attendees).

## What Plan AI reads

Plan AI only reads. It never creates, changes or deletes events.

It asks the calendar for the events of your primary calendar that overlap the 15 minutes before and after the current time. From those events it uses the title, the start and end time, the attendees' names and email addresses, and the video call link (Google Meet, Zoom or Teams) found in the event.

The event details of a meeting you record are saved with that meeting and deleted with it. Other events are not stored.

| Calendar | Permissions |
| --- | --- |
| Google Calendar | `calendar.events.readonly`, plus your email address to show which account is connected |
| Outlook Calendar | `Calendars.Read`, `User.Read` and `offline_access` (to keep the connection without asking again) |

## Connect and disconnect

In the web app, open **Integrations** and pick **Google Calendar** or **Outlook Calendar**. The provider asks you to allow read-only access and sends you back to Plan AI, which confirms the connection with your own session. A connect link sent to someone else does not work for them.

**Disconnect** on the same page deletes the stored tokens. For Google Calendar it also removes Plan AI's access from your Google account. For Outlook, remove the app from your Microsoft account: [account.live.com/consent/Manage](https://account.live.com/consent/Manage) for personal accounts, [myapps.microsoft.com](https://myapps.microsoft.com) for work accounts.

The desktop recorder shows a **Connect a calendar** link when you have none connected.

## Outlook with a company account

With a personal Microsoft account (outlook.com, hotmail.com) you can connect straight away. With a Microsoft 365 work account, your organisation may require an administrator to approve Plan AI before employees can connect it. The administrator approves it once for the whole company in Microsoft Entra ID, under Enterprise applications.

## Self-hosted installs

The calendar uses the same OAuth clients as Google Drive and OneDrive, with their own consent:

- **Google Cloud:** enable the Google Calendar API and add the `calendar.events.readonly` scope to the OAuth consent screen. It is a sensitive scope: until Google verifies your app, users see a "Google hasn't verified this app" screen and there is a cap of 100 users.
- **Microsoft Entra ID:** add the delegated permissions `Calendars.Read`, `User.Read` and `offline_access`.

The provider sends the user back to a page of the web app, `/integrations/google-calendar` or `/integrations/outlook-calendar`, on the same domain the user started from. Register that address for every domain your web app runs on, in the OAuth client (Google) and under the "Web" platform (Microsoft). The backend only accepts domains listed in `CORS_ORIGINS`, `APP_URL` or `FRONTEND_URL`.

See `GOOGLE_CALENDAR_REDIRECT_URI`, `MICROSOFT_CALENDAR_REDIRECT_URI` and `CALENDAR_STATE_SECRET` in [Environment Variables](/self-hosting/environment-variables).
