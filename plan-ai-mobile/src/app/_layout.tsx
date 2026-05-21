import { useEffect } from "react";
import {
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
} from "@react-navigation/native";
import { PaperProvider } from "react-native-paper";
import { Stack, useRouter, ErrorBoundaryProps } from "expo-router";
import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";

import { AppThemeProvider, useAppTheme } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";

import * as Sentry from "@sentry/react-native";
import { initLoggerSink } from "../utils/loggerSink";

initLoggerSink();

Sentry.init({
  dsn: "https://4f6a512d6a5fc4c92e48309d5c92b861@o4511196762734592.ingest.us.sentry.io/4511254670737408",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Disable Sentry in local development
  enabled: !__DEV__,

  // Enable Logs
  enableLogs: true,
  integrations: [Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function InnerLayout() {
  const { activeTheme: theme } = useAppTheme();

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outline,
      primary: theme.colors.primary,
    },
  };

  useEffect(() => {
    // Tracking has been removed
  }, []);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <PaperProvider theme={theme}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen
              name="(onboarding)"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="(pending)" options={{ headerShown: false }} />
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="record" options={{ headerShown: false }} />
            <Stack.Screen
              name="doc/[id]"
              options={{ presentation: "modal", headerShown: false }}
            />
            <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
          </Stack>
        </AuthProvider>
      </PaperProvider>
    </NavigationThemeProvider>
  );
}

function RootLayout() {
  return (
    <AppThemeProvider>
      <InnerLayout />
    </AppThemeProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <View style={styles.errorContainer}>
      <Text
        variant="headlineMedium"
        style={{ fontWeight: "bold", marginBottom: 12 }}
      >
        Unexpected Error
      </Text>
      <Text
        variant="bodyLarge"
        style={{ textAlign: "center", marginBottom: 32, paddingHorizontal: 20 }}
      >
        {error.message || "Something went wrong while loading this screen."}
      </Text>
      <Button
        mode="contained"
        onPress={() => router.replace("/(drawer)")}
        style={styles.btn}
      >
        Go to Home
      </Button>
      <Button mode="outlined" onPress={retry} style={styles.btn}>
        Try Again
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0F172A",
  },
  btn: {
    width: "100%",
    marginBottom: 16,
  },
});

export default Sentry.wrap(RootLayout);
