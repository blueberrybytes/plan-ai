import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, ActivityIndicator, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function PendingReviewScreen() {
  const { logout, refreshBackendUser } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshBackendUser();
    // index.tsx will automatically redirect to the right place
    // once backendUser.role changes to a non-PENDING value
    router.replace('/');
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.icon]}>⏳</Text>

        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Account Pending Review
        </Text>

        <Text variant="bodyLarge" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
          Your account has been created and is awaiting admin approval. You will be able to access the app once approved.
        </Text>

        <Text variant="bodyMedium" style={[styles.contact, { color: theme.colors.onSurfaceVariant }]}>
          Questions? Contact us at{' '}
          <Text style={{ color: theme.colors.primary }}>projects@blueberrybytes.com</Text>
        </Text>

        <Button
          mode="contained"
          onPress={handleRefresh}
          disabled={refreshing}
          style={styles.button}
          icon={refreshing ? undefined : 'refresh'}
        >
          {refreshing ? <ActivityIndicator size={16} color={theme.colors.onPrimary} /> : 'Check Status'}
        </Button>

        <Button
          mode="text"
          onPress={handleLogout}
          style={styles.logoutButton}
          textColor={theme.colors.onSurfaceVariant}
        >
          Log out
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 4,
  },
  contact: {
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  button: {
    width: '100%',
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 4,
  },
});
