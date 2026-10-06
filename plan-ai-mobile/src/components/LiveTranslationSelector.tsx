import { useState } from "react";
import { FlatList, View } from "react-native";
import { Button, IconButton, List, Modal, Portal, Text, useTheme } from "react-native-paper";
import type { LiveTranslation } from "@/hooks/useLiveTranslation";
import { TRANSLATION_LANGUAGES, translationLanguageName } from "@/utils/liveTranslation";

/** Button that opens the list of target languages, "Off" first. */
export function LiveTranslationSelector({ translation }: { translation: LiveTranslation }) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const { target } = translation;

  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 12 }}>
      <Button
        mode="text"
        compact
        icon="translate"
        textColor={target ? theme.colors.primary : theme.colors.onSurfaceVariant}
        onPress={() => setVisible(true)}
      >
        {target ? `Translate to ${translationLanguageName(target)}` : "Translation: Off"}
      </Button>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={{
            backgroundColor: theme.colors.background,
            padding: 20,
            margin: 20,
            borderRadius: 12,
            maxHeight: "80%",
          }}
        >
          <Text variant="titleMedium" style={{ marginBottom: 4, fontWeight: "bold" }}>
            Translate to
          </Text>
          <Text
            variant="bodySmall"
            style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}
          >
            Each finished phrase shows its translation below it. Translations are not saved
            with the meeting.
          </Text>
          <FlatList
            data={TRANSLATION_LANGUAGES}
            keyExtractor={(item) => item.code || "off"}
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                onPress={() => {
                  translation.setTarget(item.code);
                  setVisible(false);
                }}
                right={(props) =>
                  item.code === target ? (
                    <List.Icon {...props} icon="check" color={theme.colors.primary} />
                  ) : null
                }
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        </Modal>
      </Portal>
    </View>
  );
}

/** One line when the backend turned translation off. The recording carries on. */
export function LiveTranslationNotice({ translation }: { translation: LiveTranslation }) {
  const theme = useTheme();
  if (!translation.error) return null;
  return (
    <View
      style={{
        backgroundColor: theme.colors.tertiaryContainer,
        paddingLeft: 16,
        paddingRight: 4,
        paddingVertical: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onTertiaryContainer }}>
        {translation.error === "MISSING_API_KEY"
          ? "Translation is off: this workspace needs an AI key configured. The recording continues."
          : "Translation is not available right now and was turned off. The recording continues."}
      </Text>
      <IconButton
        icon="close"
        size={18}
        accessibilityLabel="Close"
        iconColor={theme.colors.onTertiaryContainer}
        style={{ margin: 0 }}
        onPress={translation.clearError}
      />
    </View>
  );
}
