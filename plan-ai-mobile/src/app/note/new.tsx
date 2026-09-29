import React, { useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect, type Href } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { NoteEditor } from "../../components/NoteEditor";
import { newNoteId } from "../../services/notesStore";

/**
 * A new note, open with the keyboard up. Also the deep link
 * planaimobile://note/new, so a shortcut or widget can start one.
 */
export default function NewNoteScreen() {
  const { user, loading } = useAuth();
  const [id] = useState(newNoteId);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href={"/" as Href} />;
  return <NoteEditor id={id} isNew />;
}
