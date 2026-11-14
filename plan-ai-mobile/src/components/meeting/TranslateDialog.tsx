import React from "react";
import { ScrollView } from "react-native";
import { Button, Dialog, Portal, RadioButton } from "react-native-paper";
import { TRANSLATION_LANGUAGES } from "../../utils/liveTranslation";

/**
 * Picks the language to read a saved meeting in. "" is the original. The
 * list is the one the backend translates to, shared with live translation.
 */
export function TranslateDialog({
  visible,
  onDismiss,
  value,
  onPick,
}: {
  visible: boolean;
  onDismiss: () => void;
  value: string;
  onPick: (language: string) => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Read in</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 420 }}>
          <ScrollView>
            <RadioButton.Group
              value={value}
              onValueChange={(code) => {
                onPick(code);
                onDismiss();
              }}
            >
              {TRANSLATION_LANGUAGES.map((l) => (
                <RadioButton.Item
                  key={l.code || "original"}
                  value={l.code}
                  label={l.code ? l.name : "Original"}
                  mode="android"
                />
              ))}
            </RadioButton.Group>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
