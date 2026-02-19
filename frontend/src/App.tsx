import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { HelmetProvider } from "react-helmet-async";
import { Provider, useDispatch, useSelector } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { selectUser } from "./store/slices/session/sessionSelector";
import NavigationProvider from "./providers/NavigationProvider";
import FirebaseAuthProvider, { useAuth } from "./providers/FirebaseAuthProvider";
import TokenRefreshProvider from "./providers/TokenRefreshProvider";
import Login from "./pages/Login";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import Integrations from "./pages/Integrations";
import Sessions from "./pages/Sessions";
import SessionInfo from "./pages/SessionInfo";
import SessionTranscriptDetail from "./pages/SessionTranscriptDetail";
import Contexts from "./pages/Contexts";
import SessionDetails from "./pages/SessionDetails";
import Chat from "./pages/Chat";
import ChatFull from "./pages/ChatFull";
import Slides from "./pages/Slides";
import SlideTypes from "./pages/SlideTypes";
import SlideThemes from "./pages/SlideThemes";
import SlideThemeCreate from "./pages/SlideThemeCreate";
import SlideCreate from "./pages/SlideCreate";
import "./App.css";
import "./i18n";
import { useGetCurrentUserQuery } from "./store/apis/sessionApi";
import { setUserDb } from "./store/slices/session/sessionSlice";
import AuthenticatedRoute from "./routes/AuthenticatedRoute";
import UnauthenticatedRoute from "./routes/UnauthenticatedRoute";
import store, { persistor } from "./store/store";
import theme from "./theme/theme";

// Internal component that handles API calls after auth is initialized
const AppContent: React.FC = () => {
  const dispatch = useDispatch();
  const { isAuthInitialized } = useAuth();
  const user = useSelector(selectUser);

  // Only make API calls if auth is initialized and we have a user
  const { data: currentUserData, isSuccess } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthInitialized || !user,
  });

  // Fetch current user data and update Redux store
  useEffect(() => {
    if (isSuccess && currentUserData?.data) {
      dispatch(
        setUserDb({
          id: currentUserData.data.id,
          name: currentUserData.data.name || "",
          email: currentUserData.data.email,
          avatar: currentUserData.data.avatarUrl,
          role: currentUserData.data.role,
          company: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
    }
  }, [isSuccess, currentUserData, dispatch]);

  return (
    <>
      {/* Token expiration checker - runs in the background */}
      {/*<TokenExpirationChecker />*/}

      {/* Token expiration warning bar - visible at the top of the app */}
      {/*<TokenExpirationBar />*/}

      <Routes>
        {/* Authenticated routes */}
        <Route element={<AuthenticatedRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:sessionId" element={<SessionDetails />} />
          <Route path="/sessions/:sessionId/info" element={<SessionInfo />} />
          <Route
            path="/sessions/:sessionId/info/transcripts/:transcriptId"
            element={<SessionTranscriptDetail />}
          />
          <Route path="/contexts" element={<Contexts />} />
          <Route path="/contexts/:contextId" element={<Contexts />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/:provider" element={<Integrations />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/view" element={<ChatFull />} />
          <Route path="/chat/:threadId" element={<Chat />} />
          <Route path="/slides" element={<Slides />} />
          <Route path="/slides/types" element={<SlideTypes />} />
          <Route path="/slides/themes" element={<SlideThemes />} />
          <Route path="/slides/themes/create" element={<SlideThemeCreate />} />
          <Route path="/slides/create" element={<SlideCreate />} />
        </Route>
      </Routes>
    </>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <HelmetProvider>
      <Router>
        <NavigationProvider />
        <FirebaseAuthProvider>
          {/* Conditionally render AppContent with or without TokenRefreshProvider */}
          <Routes>
            {/* Public routes rendered without TokenRefreshProvider */}
            <Route
              path="/"
              element={
                <RouteLogger name="LandingPage">
                  <LandingPage />
                </RouteLogger>
              }
            />

            {/* Unauthenticated routes rendered without TokenRefreshProvider */}
            <Route
              element={
                <RouteLogger name="UnauthenticatedRoute">
                  <UnauthenticatedRoute />
                </RouteLogger>
              }
            >
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>

            {/* All other routes rendered with TokenRefreshProvider */}
            <Route
              path="*"
              element={
                <RouteLogger name="TokenRefreshProvider">
                  <TokenRefreshProvider>
                    <AppContent />
                  </TokenRefreshProvider>
                </RouteLogger>
              }
            />
          </Routes>
        </FirebaseAuthProvider>
      </Router>
    </HelmetProvider>
  );
};

// Helper component to log when routes are rendered
const RouteLogger: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  console.log(`Route rendering: ${name} at ${window.location.pathname}`);
  return <>{children}</>;
};

const App: React.FC = () => (
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppRoutes />
      </ThemeProvider>
    </PersistGate>
  </Provider>
);

export default App;
