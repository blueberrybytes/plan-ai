import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { NoteEditor } from "../../components/NoteEditor";

// Note ids from the server and the app. Anything else in a deep link is
// refused before it reaches the file system or the API.
const NOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href={"/" as Href} />;
  if (typeof id !== "string" || !NOTE_ID.test(id)) {
    return <Redirect href={"/(drawer)/notes" as Href} />;
  }
  // key: moving to another note (a conflicted copy) starts a fresh editor.
  return <NoteEditor key={id} id={id} />;
}
