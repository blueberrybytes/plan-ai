import { Drawer } from 'expo-router/drawer';
import { useTheme, Portal, Dialog, Button, Text as PaperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CustomDrawerContent } from '../../components/CustomDrawerContent';
import * as FileSystem from 'expo-file-system';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

const WEB_APP_URL = process.env.EXPO_PUBLIC_PLAN_AI_WEB_URL ?? 'https://plan-ai.blueberrybytes.com';

export default function DrawerLayout() {
  const theme = useTheme();
  const [showAiBanner, setShowAiBanner] = useState(false);
  const { workspaces, activeWorkspaceId, logout, refreshBackendUser, refreshWorkspaces } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const isMissingKeys = activeWorkspace && !activeWorkspace.isCourtesy && (!activeWorkspace.openRouterKey || !activeWorkspace.deepgramKey);

  useEffect(() => {
    const checkBanner = async () => {
      try {
        const disclaimerFile = new FileSystem.File(FileSystem.Paths.document, "ai_disclaimer_accepted.txt");
        if (!disclaimerFile.exists) {
          setShowAiBanner(true);
        }
      } catch (err) {
        console.warn("Failed to check AI disclaimer flag", err);
      }
    };
    checkBanner();
  }, []);

  const acceptAiBanner = async () => {
    try {
      const disclaimerFile = new FileSystem.File(FileSystem.Paths.document, "ai_disclaimer_accepted.txt");
      disclaimerFile.write("1");
    } catch(err) {
      console.warn("Failed to save AI disclaimer flag", err);
    } finally {
      setShowAiBanner(false);
    }
  };

  return (
    <>
      <Portal>
        <Dialog visible={!!isMissingKeys} dismissable={false}>
          <Dialog.Icon icon="key-alert" color={theme.colors.error} />
          <Dialog.Title style={{ textAlign: "center", color: theme.colors.error }}>API Keys Required</Dialog.Title>
          <Dialog.Content>
            <PaperText variant="bodyMedium" style={{ lineHeight: 22, textAlign: "center" }}>
              Your workspace "{activeWorkspace?.name}" is missing required configuration.
              {"\n\n"}
              Please configure your workspace settings from your computer, then tap "Refresh" to continue.
            </PaperText>
          </Dialog.Content>
          <Dialog.Actions>
            <View style={{ width: "100%", gap: 8 }}>
              <Button
                mode="outlined"
                loading={refreshing}
                disabled={refreshing}
                onPress={async () => {
                  setRefreshing(true);
                  try {
                    await Promise.all([refreshBackendUser(), refreshWorkspaces()]);
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                {refreshing ? "Checking..." : "I've Completed Setup"}
              </Button>
              <Button mode="text" onPress={() => logout()} textColor={theme.colors.error}>
                Log Out
              </Button>
            </View>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={showAiBanner && !isMissingKeys} dismissable={false}>
          <Dialog.Icon icon="shield-check" color={theme.colors.primary} />
          <Dialog.Title style={{ textAlign: "center" }}>AI Privacy & Security</Dialog.Title>
          <Dialog.Content>
            <PaperText variant="bodyMedium" style={{ lineHeight: 22 }}>
              Plan AI uses advanced Cloud-based Artificial Intelligence to drastically improve your workflow.
              {"\n\n"}
              When using the Assistant or recording a meeting, your audio may be securely transmitted and processed by secure AI models to generate highly accurate transcripts and summaries.
              {"\n\n"}
              We respect your privacy: your audio files are never permanently stored after the transcription completes.
            </PaperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button mode="contained" onPress={acceptAiBanner} style={{ width: "100%" }}>
              I Understand & Agree
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Drawer
        drawerContent={(props: any) => <CustomDrawerContent {...props} />}
        screenOptions={{
        headerShown: false,
        drawerActiveTintColor: theme.colors.primary,
        drawerInactiveTintColor: theme.colors.onSurfaceVariant,
        drawerStyle: {
          backgroundColor: theme.colors.surface,
          width: 280,
        },
      }}
    >
      <Drawer.Screen 
        name="index" 
        options={{ 
          title: 'Recordings',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="microphone" color={color} size={size} />
          )
        }} 
      />
      <Drawer.Screen 
        name="contexts" 
        options={{ 
          title: 'Contexts',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="bookshelf" color={color} size={size} />
          )
        }} 
      />
      <Drawer.Screen 
        name="docs" 
        options={{ 
          title: 'Docs',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="file-document-outline" color={color} size={size} />
          )
        }} 
      />
      <Drawer.Screen 
        name="projects" 
        options={{ 
          title: 'Projects',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="briefcase-outline" color={color} size={size} />
          )
        }} 
      />
      <Drawer.Screen 
        name="assistant" 
        options={{ 
          title: 'Assistant',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="robot-outline" color={color} size={size} />
          )
        }} 
      />
      <Drawer.Screen 
        name="voice" 
        options={{ 
          title: 'Voice Profile',
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="account-voice" color={color} size={size} />
          )
        }} 
      />
    </Drawer>
    </>
  );
}
