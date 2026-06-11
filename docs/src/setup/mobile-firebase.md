# Setup Mobile Firebase

If you are running the **Plan AI Mobile Companion App** from source or building your own native releases, you must connect it to a Firebase project for authentication and analytics to function properly.

Unlike web environments that use a set of `REACT_APP_` variables, native mobile apps (Android & iOS) require actual configuration files embedded in the build process.

## 1. Create a Firebase Project
If you haven't already:
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and follow the setup wizard.
3. Once your project is created, navigate to the **Project settings** (the gear icon next to "Project Overview").

---

## 2. Configure Android (`google-services.json`)
1. In the General tab of Project settings, scroll down to the "Your apps" section.
2. Click the **Android icon** to add a new Android app.
3. Enter the Android package name: `com.blueberrybytes.planai` (or your custom bundle ID if you have changed it in `app.json`).
4. Register the app.
5. Click **Download google-services.json**.
6. Move the downloaded file into the root of the mobile directory:
   ```text
   plan/
   └── plan-ai-mobile/
       └── google-services.json   <-- Place it here
   ```

---

## 3. Configure iOS (`GoogleService-Info.plist`)
1. Back in the General tab of Project settings, click **Add app** and select the **iOS icon**.
2. Enter the Apple bundle ID: `com.blueberrybytes.planai` (or your custom bundle ID).
3. Register the app.
4. Click **Download GoogleService-Info.plist**.
5. Move the downloaded file into the root of the mobile directory:
   ```text
   plan/
   └── plan-ai-mobile/
       └── GoogleService-Info.plist   <-- Place it here
   ```

---

## 4. Security Warning: Do Not Commit!

> [!WARNING]
> **Never commit these files to a public repository!** 

While these configuration files are safe to be embedded in your public `.apk` or `.ipa` files (as they only contain public client identifiers), committing the raw files to an open-source repository is dangerous. 

If someone forks the repository, their local development builds will accidentally send crash reports, analytics, and authentication requests to **your** Firebase project, cluttering your data and potentially exhausting your free tier quotas.

These files are already included in the `plan-ai-mobile/.gitignore`. If you accidentally staged them, remove them from git tracking using:
```bash
git rm --cached plan-ai-mobile/google-services.json plan-ai-mobile/GoogleService-Info.plist
```
