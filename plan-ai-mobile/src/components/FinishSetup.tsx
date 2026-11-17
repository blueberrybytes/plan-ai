import { useState } from "react";
import { View, Text } from "react-native";
import { Button, HelperText, TextInput } from "react-native-paper";
import { useAuth } from "../context/AuthContext";

/**
 * Shown to a signed-in user whose onboarding is not done. It used to send
 * them to a computer to finish, so someone who signed up on the phone stayed
 * stuck, or worse, got into the app with no workspace at all.
 *
 * Someone in no workspace creates theirs here with a name. Someone invited to
 * a workspace only confirms. Both call the same endpoint as the web
 * onboarding, with the default themes; they can change them later.
 */

// The same defaults the backend uses when the web sends no brand theme.
const DEFAULT_BRAND_THEME = {
  name: "Default Brand",
  headingFont: "Inter",
  bodyFont: "Inter",
  primaryColor: "#4361EE",
  secondaryColor: "#a78bfa",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
};

export function FinishSetup() {
  const { api, backendUser, workspaces, logout, refreshBackendUser, refreshWorkspaces } =
    useAuth();
  const invited = (workspaces?.length ?? 0) > 0;
  const [name, setName] = useState(
    backendUser?.name?.trim() ? `${backendUser.name.trim()}'s Workspace` : "My Workspace",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!api) return;
    const workspaceName = name.trim();
    if (!invited && !workspaceName) {
      setError("Give your workspace a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.completeOnboarding(
        invited
          ? { uiTheme: {} }
          : { uiTheme: {}, workspaceName, brandTheme: DEFAULT_BRAND_THEME },
      );
      await Promise.all([refreshBackendUser(), refreshWorkspaces()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish the setup. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 10 }}>Almost there</Text>
      <Text
        style={{
          fontSize: 16,
          textAlign: "center",
          color: "#666",
          marginBottom: 24,
          maxWidth: 360,
        }}
      >
        {invited
          ? "You have been invited to a workspace. Tap Continue to start using it."
          : "Name your workspace. Your meetings, notes and tasks live in it, and you can invite people later."}
      </Text>
      <View style={{ width: "100%", maxWidth: 320, gap: 12 }}>
        {!invited && (
          <TextInput
            mode="outlined"
            label="Workspace name"
            value={name}
            onChangeText={setName}
            disabled={saving}
            autoCapitalize="words"
          />
        )}
        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={() => void finish()} loading={saving} disabled={saving}>
          {invited ? "Continue" : "Create workspace"}
        </Button>
        <Button mode="text" onPress={() => logout()} disabled={saving}>
          Log Out
        </Button>
      </View>
    </View>
  );
}
