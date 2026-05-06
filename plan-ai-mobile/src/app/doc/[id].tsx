import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, IconButton, useTheme, ActivityIndicator } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import MermaidViewer from '../../components/MermaidViewer';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { DocDocumentResponse } from '../../services/planAiApi';

export default function DocDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<DocDocumentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useTheme();
  const router = useRouter();
  const { api } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchDoc = async () => {
      if (!id) return;
      try {
        const data = await api.getDocument(id);
        setDoc(data);
        if (data.status === "GENERATING") {
          setIsGenerating(true);
        } else {
          setIsGenerating(false);
          setLoading(false);
          if (interval) clearInterval(interval);
        }
      } catch (err) {
        console.error("Failed to fetch doc", err);
        setLoading(false);
        if (interval) clearInterval(interval);
      }
    };

    fetchDoc(); // initial fetch
    
    // Poll every 3 seconds if we expect it to be generating
    interval = setInterval(() => {
      fetchDoc();
    }, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: 'bold' }} numberOfLines={1}>
            {doc ? doc.title : 'Loading...'}
          </Text>
        </View>
        <IconButton
          icon="close"
          size={28}
          iconColor={theme.colors.onSurface}
          onPress={() => router.back()}
        />
      </View>

      {(loading || isGenerating) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          {isGenerating && (
            <Text variant="bodyLarge" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>
              The AI is crafting your document...
            </Text>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scrollArea}>
          <Markdown
            rules={{
              fence: (node: any, children, parent, styles) => {
                if (node.sourceInfo === 'mermaid') {
                  return <MermaidViewer key={node.key} code={node.content} />;
                }
                return (
                  <View key={node.key} style={styles.fence}>
                    <Text style={[styles.code_block]}>{node.content}</Text>
                  </View>
                );
              }
            }}
            style={{
              body: { color: theme.colors.onSurface, fontSize: 16, lineHeight: 24 },
              heading1: { color: theme.colors.primary, fontSize: 24, marginTop: 16, marginBottom: 8, fontWeight: 'bold' },
              heading2: { color: theme.colors.primary, fontSize: 20, marginTop: 16, marginBottom: 8, fontWeight: 'bold' },
              heading3: { color: theme.colors.primary, fontSize: 18, marginTop: 16, marginBottom: 8, fontWeight: 'bold' },
              bullet_list: { color: theme.colors.onSurface },
              ordered_list: { color: theme.colors.onSurface },
              link: { color: theme.colors.primary },
              code_inline: { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant, padding: 4, borderRadius: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
              code_block: { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant, padding: 12, borderRadius: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
              fence: { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant, padding: 12, borderRadius: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
            }}
          >
            {doc?.content || '*No content block found.*'}
          </Markdown>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 24,
  }
});
