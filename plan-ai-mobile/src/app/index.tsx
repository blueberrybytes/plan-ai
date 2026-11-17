import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { View, ActivityIndicator } from "react-native";
import { FinishSetup } from "../components/FinishSetup";

export default function Index() {
  const { user, loading, backendUser } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  // Allow one-frame to let layout mount, then switch
  if (!user) {
    return <Redirect href={"/(auth)/login" as any} />;
  }

  // Unfinished onboarding, or signed in with no workspace: set it up here.
  if (backendUser && !backendUser.hasCompletedOnboarding) {
    return <FinishSetup />;
  }

  if (backendUser && !backendUser.hasVoiceProfile) {
    return <Redirect href={"/(onboarding)/voice-setup" as any} />;
  }

  return <Redirect href={"/(drawer)" as any} />;
}
