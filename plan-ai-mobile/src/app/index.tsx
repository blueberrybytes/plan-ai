import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator, Text, Linking } from 'react-native';
import { Button } from 'react-native-paper';

const WEB_APP_URL = process.env.EXPO_PUBLIC_PLAN_AI_WEB_URL ?? 'https://plan-ai.blueberrybytes.com';

export default function Index() {
  const { user, loading, backendUser, logout, refreshBackendUser, refreshWorkspaces } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  // Allow one-frame to let layout mount, then switch
  if (!user) {
    return <Redirect href={"/(auth)/login" as any} />;
  }

  if (backendUser && !backendUser.hasCompletedOnboarding) {
    const handleRefresh = async () => {
      setRefreshing(true);
      try {
        await Promise.all([refreshBackendUser(), refreshWorkspaces()]);
      } finally {
        setRefreshing(false);
      }
    };
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>Almost there!</Text>
        <Text style={{ fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 24, maxWidth: 360 }}>
          Your account setup is incomplete. Please finish configuring your workspace from your computer, then tap "Refresh" below.
        </Text>
        <View style={{ width: '100%', maxWidth: 280, gap: 12 }}>
          <Button mode="outlined" onPress={handleRefresh} loading={refreshing} disabled={refreshing}>
            {refreshing ? 'Checking...' : "I've Completed Setup"}
          </Button>
          <Button mode="text" onPress={() => logout()}>
            Log Out
          </Button>
        </View>
      </View>
    );
  }

  if (backendUser && !backendUser.hasVoiceProfile) {
    return <Redirect href={"/(onboarding)/voice-setup" as any} />;
  }

  return <Redirect href={"/(drawer)" as any} />;
}
