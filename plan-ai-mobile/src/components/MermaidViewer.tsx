import React, { useState } from "react";
import { View, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { Buffer } from "buffer";

export default function MermaidViewer({ code }: { code: string }) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const theme = useTheme();

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
  };

  let imageUrl = "";
  try {
    const encoded = Buffer.from(code, "utf-8").toString("base64");
    imageUrl = `https://mermaid.ink/img/${encoded}`;
  } catch (e) {
    console.error("Failed to encode mermaid code", e);
    imageUrl = "";
  }

  if (hasError || !imageUrl) {
    return (
      <TouchableOpacity
        onPress={handleRetry}
        style={{
          padding: 24,
          backgroundColor: theme.colors.errorContainer,
          borderRadius: 8,
          alignItems: "center",
          marginVertical: 12,
        }}
      >
        <Text
          style={{
            color: theme.colors.onErrorContainer,
            fontWeight: "bold",
            marginBottom: 8,
          }}
        >
          Diagram not available
        </Text>
        <Text style={{ color: theme.colors.onErrorContainer, opacity: 0.8 }}>
          Tap to retry
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={{
        marginVertical: 12,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "white",
        padding: 8,
      }}
    >
      {isLoading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1,
            backgroundColor: "rgba(255,255,255,0.7)",
          }}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
      <Image
        source={{ uri: imageUrl }}
        style={{ width: "100%", aspectRatio: 1.5 }}
        resizeMode="contain"
        onLoad={() => setIsLoading(false)}
        onError={(e) => {
          console.log("Failed to load mermaid diagram", e);
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </View>
  );
}
