import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, useTheme, Avatar, Card, ActivityIndicator, IconButton, FAB } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { WorkspaceSelector } from '../../components/WorkspaceSelector';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { DocDocumentResponse } from '../../services/planAiApi';

export default function DocsScreen() {
  const [documents, setDocuments] = useState<DocDocumentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { api, activeWorkspaceId } = useAuth();

  const fetchDocuments = async () => {
    try {
      const data = await api.listDocuments();
      setDocuments(data || []);
    } catch (e) {
      console.error('Failed to fetch documents', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDocuments();
    }, [activeWorkspaceId])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDocuments();
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Avatar.Icon size={120} icon="file-document-outline" style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 24 }} color={theme.colors.onSurfaceVariant} />
      <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: 'bold', marginBottom: 12 }}>
        No documents found
      </Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32, marginBottom: 32 }}>
        Documents automatically generated from your meetings will appear here.
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: DocDocumentResponse }) => {
    const formattedDate = item.createdAt 
      ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Unknown Date';
      
    const title = item.title || 'Untitled Document';

    return (
      <TouchableOpacity onPress={() => router.push(`/doc/${item.id}` as any)}>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
          <Card.Title 
            title={title}
            subtitle={formattedDate}
            titleStyle={{ color: theme.colors.onSurface, fontWeight: 'bold' }}
            subtitleStyle={{ color: theme.colors.onSurfaceVariant }}
            left={(props) => <Avatar.Icon {...props} icon="file-document" style={{ backgroundColor: theme.colors.secondaryContainer }} color={theme.colors.secondary} />}
            right={(props) => (
              <View style={{ paddingRight: 16 }}>
                <Text style={{ color: item.status === 'COMPLETED' ? '#4CAF50' : theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  {item.status}
                </Text>
              </View>
            )}
          />
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader 
        titleComponent={
          <WorkspaceSelector 
            onWorkspaceChange={() => {
              setIsLoading(true);
              fetchDocuments();
            }} 
          />
        } 
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={documents.length === 0 ? styles.emptyListContent : styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        />
      )}

      <FAB
        icon="microphone"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#ffffff"
        onPress={() => router.push('/record' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 20,
    borderRadius: 16,
  }
});
