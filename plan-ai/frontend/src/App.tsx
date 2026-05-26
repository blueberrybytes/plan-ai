/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { Provider, useDispatch, useSelector } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { selectUser } from "./store/slices/auth/authSelector";
import NavigationProvider from "./providers/NavigationProvider";
import FirebaseAuthProvider, { useAuth } from "./providers/FirebaseAuthProvider";
import TokenRefreshProvider from "./providers/TokenRefreshProvider";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ChatHome from "./pages/ChatHome";
import LandingPage from "./pages/LandingPage";
import DeleteData from "./pages/DeleteData";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import Integrations from "./pages/Integrations";
import Projects from "./pages/Projects";
import ProjectInfo from "./pages/ProjectInfo";
import WorkspaceTeam from "./pages/WorkspaceTeam";
import ProjectTranscriptDetail from "./pages/ProjectTranscriptDetail";
import ProjectFileViewer from "./pages/ProjectFileViewer";
import Recordings from "./pages/Recordings";
import RecordingDetail from "./pages/RecordingDetail";
import ProjectDetails from "./pages/ProjectDetails";
import Chat from "./pages/Chat";
import ChatFull from "./pages/ChatFull";
import Slides from "./pages/Slides";
import SlideTypes from "./pages/SlideTypes";
import BrandThemes from "./pages/BrandThemes";
import BrandThemeCreate from "./pages/BrandThemeCreate";
import SlideCreate from "./pages/SlideCreate";
import SlideView from "./pages/SlideView";
import PublicSlideView from "./pages/PublicSlideView";
import DesktopCallback from "./pages/DesktopCallback";
import NotFound from "./pages/NotFound";
import Docs from "./pages/Docs";
import DocCreate from "./pages/DocCreate";
import DocView from "./pages/DocView";
import ChatStreamTest from "./pages/ChatStreamTest";
import Downloads from "./pages/Downloads";
import PublicDocView from "./pages/PublicDocView";
import Diagrams from "./pages/Diagrams";
import DiagramCreate from "./pages/DiagramCreate";
import DiagramTypes from "./pages/DiagramTypes";
import DiagramView from "./pages/DiagramView";
import PublicDiagramView from "./pages/PublicDiagramView";
import AiUsage from "./pages/AiUsage";
import Billing from "./pages/Billing";
import SentryTest from "./pages/SentryTest";
import Users from "./pages/Users";
import AiPricing from "./pages/AiPricing";
import Onboarding from "./pages/Onboarding";
import PendingReview from "./pages/PendingReview";
import AdminPptxPreview from "./pages/AdminPptxPreview";
import AdminEmails from "./pages/AdminEmails";
import AdminMcp from "./pages/AdminMcp";
import AdminDashboard from "./pages/admin/AdminDashboard";
import "./App.css";
import "./i18n";
import { useGetCurrentUserQuery } from "./store/apis/authApi";
import { setUserDb } from "./store/slices/auth/authSlice";
import AuthenticatedRoute from "./routes/AuthenticatedRoute";
import UnauthenticatedRoute from "./routes/UnauthenticatedRoute";
import store, { persistor } from "./store/store";
//import FloatingAssistant from "./components/chat/FloatingAssistant";

// Internal component that handles API calls after auth is initialized
const AppContent: React.FC = () => {
  const dispatch = useDispatch();
  const { isAuthInitialized } = useAuth();
  const user = useSelector(selectUser);

  // Only make API calls if auth is initialized and we have a user
  const { data: currentUserData, isSuccess } = useGetCurrentUserQuery(undefined, {
    skip: !isAuthInitialized || !user,
    refetchOnMountOrArgChange: true, // Force network fetch to bypass Redux Persist cache
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
          hasCompletedOnboarding: currentUserData.data.hasCompletedOnboarding,
          hasCompletedHomeTour: currentUserData.data.hasCompletedHomeTour,
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
          <Route path="/home" element={<ChatHome />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectDetails />} />
          <Route path="/projects/:projectId/info" element={<ProjectInfo />} />
          <Route
            path="/projects/:projectId/info/transcripts/:transcriptId"
            element={<ProjectTranscriptDetail />}
          />
          {/* Legacy: /contexts/* now redirects to /projects. The Context concept is
              hidden in the UI. ContextFileViewer is still reachable for direct file links. */}
          <Route path="/contexts" element={<Navigate to="/projects" replace />} />
          <Route path="/contexts/:contextId" element={<Navigate to="/projects" replace />} />
          <Route path="/projects/:projectId/files/:fileId" element={<ProjectFileViewer />} />
          <Route path="/recordings" element={<Recordings />} />
          <Route path="/recordings/:recordingId" element={<RecordingDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/:provider" element={<Integrations />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/view" element={<ChatFull />} />
          <Route path="/chat/:threadId" element={<Chat />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/slides" element={<Slides />} />
          <Route path="/slides/types" element={<SlideTypes />} />

          <Route path="/slides/create" element={<SlideCreate />} />
          <Route path="/slides/view/:presentationId" element={<SlideView />} />
          <Route path="/slides/:presentationId" element={<SlideView />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/create" element={<DocCreate />} />
          <Route path="/docs/view/:id" element={<DocView />} />
          {/* Brand Themes */}
          <Route path="/brand-themes" element={<BrandThemes />} />
          <Route path="/brand-themes/create" element={<BrandThemeCreate />} />
          <Route path="/brand-themes/:id/edit" element={<BrandThemeCreate />} />
          <Route path="/diagrams" element={<Diagrams />} />
          <Route path="/diagrams/create" element={<DiagramCreate />} />
          <Route path="/diagrams/types" element={<DiagramTypes />} />
          <Route path="/diagrams/:diagramId" element={<DiagramView />} />
          <Route path="/usage" element={<AiUsage />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/sentry-error" element={<SentryTest />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/users/:targetUserId/usage" element={<AiUsage />} />
          <Route path="/admin/pricing" element={<AiPricing />} />
          <Route path="/admin/pptx-preview" element={<AdminPptxPreview />} />
          <Route path="/admin/emails" element={<AdminEmails />} />
          <Route path="/admin/mcp" element={<AdminMcp />} />
          <Route path="/team" element={<WorkspaceTeam />} />
          <Route path="/team/users/:targetUserId/usage" element={<AiUsage />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/pending-review" element={<PendingReview />} />
          <Route path="/chat-stream-test" element={<ChatStreamTest />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Global AI Assistant Floating Action Button */}
      {/*<FloatingAssistant /> */}
    </>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <HelmetProvider>
      <Helmet>
        <title>Plan AI</title>
      </Helmet>
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

            <Route
              path="/delete-my-data"
              element={
                <RouteLogger name="DeleteData">
                  <DeleteData />
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

            {/* Public Presentation View */}
            <Route path="/p/:presentationId" element={<PublicSlideView />} />

            {/* Public Document View */}
            <Route path="/doc/public/:id" element={<PublicDocView />} />

            {/* Public Diagram View */}
            <Route path="/diagram/public/:id" element={<PublicDiagramView />} />

            {/* Desktop app auth handoff */}
            <Route path="/auth/desktop" element={<DesktopCallback />} />

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
  return <>{children}</>;
};

const App: React.FC = () => (
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <AppRoutes />
    </PersistGate>
  </Provider>
);

export default App;
