# Plan AI Mobile — Auth Parity Plan

## Current State

The mobile app (`plan-ai-mobile`) only supports **Google Sign-In** via `@react-native-google-signin/google-signin`.

The web and Electron recorder (`plan-ai-recorder`) support:
- ✅ Google
- ✅ Apple
- ✅ Microsoft (Azure AD)
- ✅ Email/Password

The goal is to bring the mobile app to full parity.

---

## Why Each Provider Needs a Different Approach on Mobile

| Provider | Mechanism | Notes |
|---|---|---|
| **Google** | `@react-native-google-signin/google-signin` → Firebase credential | Already done |
| **Apple** | Native iOS `@invertase/react-native-apple-authentication` → Firebase credential | Required by App Store if you offer any OAuth login |
| **Microsoft** | `expo-web-browser` (in-app browser) → Firebase custom token via backend | No native SDK — must use web OAuth flow |
| **Email/Password** | `@react-native-firebase/auth` `signInWithEmailAndPassword` | Simplest, same as recorder |

---

## What Needs to Be Done

### 1. Install Dependencies

```bash
cd plan-ai-mobile

# Apple Sign-In (iOS only — Android is a no-op)
yarn add @invertase/react-native-apple-authentication

# Microsoft: use expo-web-browser (already installed) + expo-auth-session
yarn add expo-auth-session
```

> [!IMPORTANT]
> After installing, you **must** run `expo prebuild` to regenerate the native iOS/Android projects. Apple Sign-In requires a native entitlement (`com.apple.developer.applesignin`) added to the Xcode project.

### 2. Configure `app.config.ts`

Add the Apple Sign-In entitlement and the Microsoft redirect URI scheme:

```ts
// Inside ios.entitlements:
"com.apple.developer.applesignin": ["Default"]

// Inside scheme (for Microsoft OAuth deep-link callback):
scheme: "planai"  // used as planai://auth/callback
```

### 3. Add Apple Sign-In to `AuthContext.tsx`

```ts
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { AppleAuthProvider } from '@react-native-firebase/auth';

const signInWithApple = async () => {
  const appleAuthRequest = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });
  const { identityToken, nonce } = appleAuthRequest;
  const appleCredential = AppleAuthProvider.credential(identityToken!, nonce);
  await signInWithCredential(getAuth(), appleCredential);
};
```

> [!NOTE]
> Apple only sends the user's full name once (on first login). Store it immediately in the backend `/api/session/login` call, matching the existing recorder pattern.

### 4. Add Microsoft Sign-In to `AuthContext.tsx`

Microsoft has no native RN SDK. The pattern mirrors what the recorder does but using `expo-web-browser` instead of an Electron `BrowserWindow`.

**Flow:**
1. Generate a PKCE auth URL to `login.microsoftonline.com/common/oauth2/v2.0/authorize`
2. Open with `WebBrowser.openAuthSessionAsync(url, redirectUri)` — stays in-app on iOS
3. Pass the returned `code` to your backend `POST /api/auth/microsoft/callback`
4. Backend exchanges code → Microsoft Graph → Firebase custom token
5. Mobile signs in with `signInWithCustomToken(auth, customToken)`

```ts
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

const signInWithMicrosoft = async () => {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'planai', path: 'auth/callback' });
  const authUrl = `${BACKEND_URL}/api/auth/microsoft/mobile-start?redirect_uri=${encodeURIComponent(redirectUri)}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type === 'success') {
    const params = new URLSearchParams(result.url.split('?')[1]);
    const customToken = params.get('token')!;
    await signInWithCustomToken(getAuth(), customToken);
  }
};
```

> [!IMPORTANT]
> The backend needs two new endpoints:
> - `GET /api/auth/microsoft/mobile-start` — builds and redirects to MS OAuth URL
> - `GET /api/auth/microsoft/mobile-callback` — exchanges code → custom Firebase token → redirects back to app deep-link

Check if these already exist (the recorder uses `signInWithDesktopBrowser("microsoft")` which hits the same backend flow). If so, you only need to adapt the `redirect_uri` to handle deep links.

### 5. Add Email/Password to `AuthContext.tsx`

```ts
import { signInWithEmailAndPassword } from '@react-native-firebase/auth';

const signInWithEmail = async (email: string, password: string) => {
  const authInstance = getAuth();
  await signInWithEmailAndPassword(authInstance, email, password);
};
```

### 6. Update `AuthContextType` interface

```ts
interface AuthContextType {
  // existing...
  signInWithApple: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
}
```

### 7. Update `login.tsx`

Replace the single Google button with a full login screen matching the recorder UX:

- `Continue with Google` button
- `Continue with Apple` button (iOS only — hide on Android via `Platform.OS`)
- `Continue with Microsoft` button
- `or` divider
- Email + Password form

---

## Task Checklist

- [ ] **Install deps**: `@invertase/react-native-apple-authentication`, `expo-auth-session`
- [ ] **`app.config.ts`**: Add `com.apple.developer.applesignin` entitlement + `planai` URL scheme
- [ ] **Run `expo prebuild`** after config changes
- [ ] **`AuthContext.tsx`**: Add `signInWithApple`, `signInWithMicrosoft`, `signInWithEmail` methods and expose in context
- [ ] **`login.tsx`**: Update UI with all four login options (hide Apple on Android)
- [ ] **Backend check**: Verify `/api/auth/microsoft/mobile-start` and `/api/auth/microsoft/mobile-callback` endpoints support mobile `redirect_uri` deep links
- [ ] **Backend (if needed)**: Add/adapt mobile Microsoft OAuth endpoints to return `planai://auth/callback?token=<customToken>`
- [ ] **Test on iOS Simulator**: Google, Apple, Microsoft, Email flows
- [ ] **Test on Android Emulator**: Google, Microsoft, Email flows (no Apple button)

---

## Risk Notes

> [!CAUTION]
> **Apple policy:** If you offer any third-party login (Google, Microsoft), the App Store **requires** you to also offer "Sign in with Apple". This is already done by adding Apple above — do not skip it.

> [!WARNING]
> **Microsoft on Android:** `expo-web-browser` uses Chrome Custom Tabs on Android. The redirect URI must use a custom scheme (`planai://`). Test carefully — some Android setups may require an `intentFilter` in `app.config.ts`.

> [!NOTE]
> The `logout` function should be updated to handle all providers gracefully. Currently it calls `GoogleSignin.signOut()` unconditionally — this will throw if the user logged in via Apple or Email.
