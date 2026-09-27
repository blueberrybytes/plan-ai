import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getAuth,
  getIdToken,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  AppleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { createPlanAiApi, HttpError } from '../services/planAiApi';
import * as Sentry from '@sentry/react-native';
import { migrateLegacyRecordings } from '../services/recordingSessions';
import { useOutboxProcessor } from '../services/recordingUploader';

const BASE_URL = process.env.EXPO_PUBLIC_PLAN_AI_API_URL ?? 'http://localhost:8080';

let globalWorkspaceId: string | null = null;

export const setGlobalWorkspaceId = (id: string | null) => {
  globalWorkspaceId = id;
};

export const planAiApi = createPlanAiApi(
  async (forceRefresh) => {
    const authInstance = getAuth();
    if (!authInstance.currentUser) return null;
    return await getIdToken(authInstance.currentUser, forceRefresh);
  },
  () => globalWorkspaceId
);

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: typeof planAiApi;
  backendUser: any | null;
  workspaces: any[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  refreshBackendUser: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

/**
 * Last known backend user, workspaces and active workspace, per Firebase
 * user. Starting the app without network used to sign the user out, so a
 * meeting could not be recorded offline and queued uploads never showed.
 * With this cache the app opens as before and syncs when the network is back.
 */
interface AuthCache {
  uid: string;
  backendUser: any | null;
  workspaces: any[];
  activeWorkspaceId: string | null;
}

const authCacheFile = () => new File(Paths.document, 'auth_cache.json');

const readAuthCache = (uid: string): AuthCache | null => {
  try {
    const f = authCacheFile();
    if (!f.exists) return null;
    const c = JSON.parse(f.textSync()) as AuthCache;
    return c.uid === uid ? c : null;
  } catch {
    return null;
  }
};

const writeAuthCache = (cache: AuthCache) => {
  try {
    authCacheFile().write(JSON.stringify(cache));
  } catch {
    // the cache only saves a round trip; never block on it
  }
};

const clearAuthCache = () => {
  try {
    const f = authCacheFile();
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
};

/** No answer from the server (offline, DNS, timeout) or a 5xx: worth waiting for. */
const isTransientError = (e: unknown): boolean => {
  if (e instanceof HttpError) return e.status === undefined || e.status >= 500;
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|timeout|timed out|aborted|failed to fetch|status 5\d\d/i.test(msg);
};

let legacyMigrated = false;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendUser, setBackendUser] = useState<any | null>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);

  // Set when the backend could not be reached at sign-in; retried on the
  // next foreground and every 30 s.
  const [backendPending, setBackendPending] = useState(false);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    setGlobalWorkspaceId(id);
    const uid = getAuth().currentUser?.uid;
    const cached = uid ? readAuthCache(uid) : null;
    if (uid && cached && id) writeAuthCache({ ...cached, activeWorkspaceId: id });
  };

  /**
   * Syncs the Firebase user with the backend and loads the user and the
   * workspaces. Throws on failure; the caller decides whether to wait for the
   * network or sign out.
   */
  const initBackend = async (u: FirebaseAuthTypes.User) => {
    // Sync user to backend first (creates Postgres user and handles invitations)
    console.log('[AuthContext] Syncing Firebase user to backend...');
    const token = await u.getIdToken();

    let syncSuccess = false;
    let syncAttempts = 0;
    let lastError: unknown = null;

    while (syncAttempts < 3 && !syncSuccess) {
      try {
        const syncRes = await fetch(`${BASE_URL}/api/session/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: u.uid, token }),
        });

        if (!syncRes.ok) {
          throw new HttpError(
            `Backend returned status ${syncRes.status}: ${await syncRes.text()}`,
            syncRes.status,
          );
        }
        syncSuccess = true;
      } catch (err: any) {
        syncAttempts++;
        lastError = err;
        if (syncAttempts < 3) {
          console.warn(`[AuthContext] Backend sync attempt ${syncAttempts} failed. Retrying...`, err);
          await new Promise(resolve => setTimeout(resolve, 1000 * syncAttempts)); // Exponential backoff
        }
      }
    }

    if (!syncSuccess) {
      if (lastError instanceof HttpError) throw lastError;
      throw new HttpError(
        `Failed to sync user to backend after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }

    console.log('[AuthContext] Fetching backend user...');
    const dbUser = await planAiApi.getCurrentUser();
    console.log('[AuthContext] Backend user fetched:', dbUser?.id);
    setBackendUser(dbUser);

    console.log('[AuthContext] Fetching workspaces...');
    const fetchedWorkspaces = await planAiApi.getMyWorkspaces();
    console.log('[AuthContext] Workspaces fetched:', fetchedWorkspaces?.length);
    setWorkspaces(fetchedWorkspaces);
    // Keep the workspace the user last chose instead of always the first one.
    const cached = readAuthCache(u.uid);
    const active =
      fetchedWorkspaces.find((w: any) => w.id === cached?.activeWorkspaceId)?.id ??
      fetchedWorkspaces[0]?.id ??
      '';
    setActiveWorkspaceIdState(active);
    setGlobalWorkspaceId(active || null);
    writeAuthCache({
      uid: u.uid,
      backendUser: dbUser,
      workspaces: fetchedWorkspaces,
      activeWorkspaceId: active || null,
    });
    setBackendPending(false);
  };

  useEffect(() => {
    if (!legacyMigrated) {
      legacyMigrated = true;
      migrateLegacyRecordings();
    }
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '935756144028-ietu93fvo95qloht19dql68r8auvbov6.apps.googleusercontent.com',
      offlineAccess: true,
    });

    const authInstance = getAuth();
    console.log('[AuthContext] Setting up onAuthStateChanged...');
    const subscriber = onAuthStateChanged(authInstance, async (u) => {
      console.log(`[AuthContext] onAuthStateChanged fired. User: ${u ? u.uid : 'null'}`);
      setUser(u);

      if (u) {
        Sentry.setUser({ id: u.uid, email: u.email || undefined });
      } else {
        Sentry.setUser(null);
      }

      if (u) {
        // Open with what we knew last time, then refresh from the backend.
        const cached = readAuthCache(u.uid);
        if (cached) {
          setBackendUser(cached.backendUser);
          setWorkspaces(cached.workspaces);
          setActiveWorkspaceIdState(cached.activeWorkspaceId ?? '');
          setGlobalWorkspaceId(cached.activeWorkspaceId);
        }
        try {
          await initBackend(u);
        } catch (e) {
          if (isTransientError(e)) {
            // No network or the server is down. Signing out here used to
            // make the app unusable offline, pending uploads included.
            console.warn('[AuthContext] Backend unreachable at sign-in, will retry.', e);
            setBackendPending(true);
            if (!cached) setActiveWorkspaceIdState('');
          } else {
            console.error('[AuthContext] Critical backend initialization error!', e);
            setActiveWorkspaceIdState(''); // Mark as failed/empty so spinners don't hang
            // The backend answered and refused: the account is in a state the
            // app cannot use. Sign out so the user can sign in again.
            console.warn('[AuthContext] Signing user out due to backend initialization failure.');
            await authInstance.signOut();
          }
        }
      } else {
        console.log('[AuthContext] No user found, clearing states.');
        setBackendUser(null);
        setWorkspaces([]);
        setActiveWorkspaceIdState('');
        setGlobalWorkspaceId(null);
        setBackendPending(false);
      }

      console.log('[AuthContext] Setting loading state to false.');
      setLoading(false);
    });
    return subscriber;
  }, []);

  // Retry the backend sync that failed for lack of network.
  useEffect(() => {
    if (!backendPending || !user) return;
    const retry = () => {
      initBackend(user).catch(async (e) => {
        if (isTransientError(e)) return;
        // The backend answered and refused: same as at sign-in.
        console.error('[AuthContext] Backend retry failed, signing out', e);
        setBackendPending(false);
        await getAuth().signOut();
      });
    };
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') retry();
    });
    const timer = setInterval(retry, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [backendPending, user]);

  // Saved recordings upload whenever the app is open and signed in.
  useOutboxProcessor(planAiApi, !!user && !backendPending);

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response: any = await GoogleSignin.signIn();
      const authInstance = getAuth();
      const idToken = response.data?.idToken || response.idToken;
      const googleCredential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(authInstance, googleCredential);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only available on iOS.');
    }
    try {
      const appleAuthReq = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [
          appleAuth.Scope.FULL_NAME,
          appleAuth.Scope.EMAIL,
        ],
      });

      const { identityToken, nonce } = appleAuthReq;
      if (!identityToken) throw new Error('Apple Sign-In failed: no identity token returned.');

      const appleCredential = AppleAuthProvider.credential(identityToken, nonce ?? undefined);
      await signInWithCredential(getAuth(), appleCredential);
    } catch (error: any) {
      if (error.code === appleAuth.Error.CANCELED) {
        // User dismissed — not an error worth throwing
        return;
      }
      console.error('Apple Sign-In Error:', error);
      throw error;
    }
  };

  const signInWithMicrosoft = async () => {
    try {
      // Backend starts the Microsoft OAuth flow and returns a redirect to MS login
      // On completion, MS redirects to our backend callback, which mints a Firebase
      // custom token and redirects back to the app via deep link.
      const redirectUri = 'planaimobile://auth/microsoft/callback';
      const startUrl = `${BASE_URL}/api/auth/microsoft/mobile-start?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Extract the Firebase custom token from the deep link query params
        const url = new URL(result.url);
        const customToken = url.searchParams.get('token');
        const errorMsg = url.searchParams.get('error');

        if (errorMsg) throw new Error(decodeURIComponent(errorMsg));
        if (!customToken) throw new Error('Microsoft Sign-In failed: no token returned.');

        await signInWithCustomToken(getAuth(), customToken);
      } else if (result.type === 'cancel') {
        // User closed the browser — not an error
        return;
      }
    } catch (error) {
      console.error('Microsoft Sign-In Error:', error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(getAuth(), email, password);
    } catch (error) {
      console.error('Email Sign-In Error:', error);
      throw error;
    }
  };

  const refreshBackendUser = async () => {
    try {
      const dbUser = await planAiApi.getCurrentUser();
      setBackendUser(dbUser);
    } catch (e) {
      console.error('[AuthContext] refreshBackendUser error', e);
    }
  };

  const refreshWorkspaces = async () => {
    try {
      const fetched = await planAiApi.getMyWorkspaces();
      setWorkspaces(fetched);
      if (fetched.length > 0 && !fetched.find((w) => w.id === activeWorkspaceId)) {
        setActiveWorkspaceId(fetched[0].id);
      }
    } catch (e) {
      console.error('[AuthContext] refreshWorkspaces error', e);
    }
  };

  const logout = async () => {
    try {
      const authInstance = getAuth();
      const currentUser = authInstance.currentUser;

      clearAuthCache();
      await signOut(authInstance);

      // Only call GoogleSignin.signOut if the user is a Google user
      if (currentUser?.providerData?.some((p) => p.providerId === 'google.com')) {
        await GoogleSignin.signOut();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signInWithGoogle,
      signInWithApple,
      signInWithMicrosoft,
      signInWithEmail,
      logout,
      api: planAiApi,
      backendUser,
      workspaces,
      activeWorkspaceId,
      setActiveWorkspaceId,
      refreshBackendUser,
      refreshWorkspaces,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
