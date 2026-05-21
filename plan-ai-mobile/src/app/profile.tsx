import React, { useState, useEffect } from "react";
import { Alert, View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Button,
  Avatar,
  List,
  useTheme,
  Surface,
  Divider,
  Portal,
  Dialog,
  IconButton,
} from "react-native-paper";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { AppThemeName, THEMES } from "../theme/Theme";
import { useRouter } from "expo-router";
import { WorkspaceMemberResponse } from "../services/planAiApi";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { getLogSink } from "../utils/loggerSink";

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, backendUser, logout, api } = useAuth();
  const { activeThemeName, setTheme } = useAppTheme();
  const [themeDialogVisible, setThemeDialogVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentMemberInfo, setCurrentMemberInfo] =
    useState<WorkspaceMemberResponse | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function fetchMemberInfo() {
      if (!user?.email) return;
      try {
        const data = await api.getWorkspaceMembers();
        const member = data.members.find((m) => m.email === user.email);
        if (member) setCurrentMemberInfo(member);
      } catch (e) {
        console.error("Failed to fetch workspace member info:", e);
      }
    }
    fetchMemberInfo();
  }, [user?.email, api]);

  const THEME_OPTIONS: { id: AppThemeName; label: string }[] = [
    { id: "blueberry", label: "Blueberry (Dark)" },
    { id: "crimson", label: "Crimson (Dark)" },
    { id: "emerald", label: "Emerald (Dark)" },
    { id: "hacker", label: "Hacker (Dark)" },
    { id: "cloud", label: "Cloud (Light)" },
    { id: "sunrise", label: "Sunrise (Light)" },
  ];

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you absolutely sure? This action cannot be undone and will permanently delete your data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              await api.deleteMyAccount();
              await logout();
              router.replace("/(auth)/login");
            } catch (err) {
              console.error("Failed to delete account", err);
              Alert.alert(
                "Error",
                "Could not delete your account. Please try again later.",
              );
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleExportDebugLogs = async () => {
    try {
      const logs = getLogSink();
      const logsStr = JSON.stringify(logs, null, 2);
      const fileUri =
        FileSystem.documentDirectory + `plan-ai-debug-logs-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, logsStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert(
          "Sharing not available",
          "Cannot export logs on this device.",
        );
      }
    } catch (e) {
      console.error("Failed to export debug logs", e);
      Alert.alert("Export Failed", "Could not export debug logs.");
    }
  };

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <Text style={{ textAlign: "center" }}>Not logged in.</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <IconButton
          icon="arrow-left"
          size={28}
          iconColor={theme.colors.onSurface}
          onPress={() => router.back()}
          style={{ marginLeft: -8 }}
        />
        <Text
          variant="titleLarge"
          style={{
            fontWeight: "bold",
            color: theme.colors.onSurface,
            flex: 1,
            textAlign: "center",
            marginRight: 36,
          }}
        >
          Profile
        </Text>
      </View>

      <ScrollView>
        <View
          style={[
            styles.headerArea,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.outline,
            },
          ]}
        >
          {user.photoURL ? (
            <Avatar.Image
              size={70}
              source={{ uri: user.photoURL }}
              style={{ backgroundColor: theme.colors.primaryContainer }}
            />
          ) : (
            <Avatar.Text
              size={70}
              label={user.email ? user.email.charAt(0).toUpperCase() : "U"}
              style={{ backgroundColor: theme.colors.primaryContainer }}
            />
          )}
          <Text
            variant="titleLarge"
            style={{ fontWeight: "bold", marginTop: 8 }}
          >
            {user.displayName || "No Name Set"}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {user.email}
          </Text>
        </View>

        <Surface
          style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}
          elevation={1}
        >
          <List.Section>
            <List.Subheader>Account Information</List.Subheader>
            <List.Item
              title="UID"
              description={user.uid}
              left={(props) => <List.Icon {...props} icon="identifier" />}
            />
            <Divider />
            <List.Item
              title="Role"
              description={backendUser?.role || "CLIENT"}
              left={(props) => <List.Icon {...props} icon="shield-account" />}
            />
            <Divider />
            <List.Item
              title="Database ID"
              description={backendUser?.id || "Unknown"}
              left={(props) => <List.Icon {...props} icon="database" />}
            />
            {currentMemberInfo?.personas &&
              currentMemberInfo.personas.length > 0 && (
                <>
                  <Divider />
                  <List.Item
                    title="Personas (Active Workspace)"
                    description={currentMemberInfo.personas
                      .map((p) => p.replace("_", " "))
                      .join(", ")}
                    left={(props) => (
                      <List.Icon {...props} icon="account-group" />
                    )}
                  />
                </>
              )}
            {currentMemberInfo?.personaNotes && (
              <>
                <Divider />
                <List.Item
                  title="Custom AI Instructions"
                  description={currentMemberInfo.personaNotes}
                  descriptionNumberOfLines={10}
                  left={(props) => <List.Icon {...props} icon="robot" />}
                />
              </>
            )}
          </List.Section>
        </Surface>

        <Surface
          style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}
          elevation={1}
        >
          <List.Section>
            <List.Subheader>Appearance</List.Subheader>
            <List.Item
              title="Theme Selection"
              description={`Current: ${activeThemeName}`}
              left={(props) => <List.Icon {...props} icon="palette" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => setThemeDialogVisible(true)}
            />
          </List.Section>
        </Surface>

        <View style={styles.actionContainer}>
          <Button
            mode="outlined"
            icon="bug"
            textColor={theme.colors.onSurface}
            style={[
              styles.actionBtn,
              { borderColor: theme.colors.outline, marginBottom: 8 },
            ]}
            onPress={handleExportDebugLogs}
            contentStyle={{ paddingVertical: 4 }}
          >
            Export Debug Logs
          </Button>

          <Button
            mode="contained"
            icon="logout"
            buttonColor={theme.colors.error}
            onPress={handleLogout}
            style={styles.actionBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Sign Out
          </Button>

          <Button
            mode="text"
            textColor={theme.colors.error}
            onPress={handleDeleteAccount}
            style={styles.deleteBtn}
            loading={isDeleting}
            disabled={isDeleting}
          >
            Delete Account
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog
          visible={themeDialogVisible}
          onDismiss={() => setThemeDialogVisible(false)}
          style={{ backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title style={{ color: theme.colors.onSurface }}>
            Select Theme
          </Dialog.Title>
          <Dialog.Content>
            {THEME_OPTIONS.map((option) => {
              const themeData = THEMES[option.id];
              const isSelected = activeThemeName === option.id;

              return (
                <List.Item
                  key={option.id}
                  title={option.label}
                  titleStyle={{ color: theme.colors.onSurface }}
                  onPress={() => {
                    setTheme(option.id);
                    setThemeDialogVisible(false);
                  }}
                  left={() => (
                    <View style={styles.themeCircleOuter}>
                      <View
                        style={[
                          styles.themeCircleInner,
                          { backgroundColor: themeData.colors.primary },
                        ]}
                      />
                    </View>
                  )}
                  right={() =>
                    isSelected ? (
                      <List.Icon
                        icon="check"
                        color={themeData.colors.primary}
                      />
                    ) : null
                  }
                />
              );
            })}
          </Dialog.Content>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  headerArea: {
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  actionContainer: {
    margin: 16,
    marginBottom: 40,
    gap: 12,
  },
  actionBtn: {
    borderRadius: 8,
  },
  deleteBtn: {
    borderRadius: 8,
  },
  themeCircleOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#33333333",
    marginRight: 12,
  },
  themeCircleInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
