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
import { Platform } from 'react-native';
import { createPlanAiApi } from '../services/planAiApi';
import * as Sentry from '@sentry/react-native';

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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendUser, setBackendUser] = useState<any | null>(null);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    setGlobalWorkspaceId(id);
  };

  useEffect(() => {
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
        try {
          // Sync user to backend first (creates Postgres user and handles invitations)
          console.log('[AuthContext] Syncing Firebase user to backend...');
          const token = await u.getIdToken();
          
          let syncSuccess = false;
          let syncAttempts = 0;
          let lastError: Error | null = null;

          while (syncAttempts < 3 && !syncSuccess) {
            try {
              const syncRes = await fetch(`${BASE_URL}/api/session/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: u.uid, token }),
              });
              
              if (!syncRes.ok) {
                throw new Error(`Backend returned status ${syncRes.status}: ${await syncRes.text()}`);
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
            throw new Error(`Failed to sync user to backend after 3 attempts: ${lastError?.message}`);
          }

          console.log('[AuthContext] Fetching backend user...');
          const dbUser = await planAiApi.getCurrentUser();
          console.log('[AuthContext] Backend user fetched:', dbUser?.id);
          setBackendUser(dbUser);

          console.log('[AuthContext] Fetching workspaces...');
          const fetchedWorkspaces = await planAiApi.getMyWorkspaces();
          console.log('[AuthContext] Workspaces fetched:', fetchedWorkspaces?.length);
          setWorkspaces(fetchedWorkspaces);
          if (fetchedWorkspaces.length > 0) {
            setActiveWorkspaceId(fetchedWorkspaces[0].id);
          }
        } catch (e) {
          console.error('[AuthContext] Critical backend initialization error!', e);
          setActiveWorkspaceId(''); // Mark as failed/empty so spinners don't hang
          
          // If we fail to sync or fetch the backend user, the app will enter a broken ghost state.
          // Sign the user out of Firebase so they return to the login screen and can try again.
          console.warn('[AuthContext] Signing user out due to backend initialization failure.');
          await authInstance.signOut();
        }
      } else {
        console.log('[AuthContext] No user found, clearing states.');
        setBackendUser(null);
        setWorkspaces([]);
        setActiveWorkspaceId('');
        setGlobalWorkspaceId(null);
      }

      console.log('[AuthContext] Setting loading state to false.');
      setLoading(false);
    });
    return subscriber;
  }, []);

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
