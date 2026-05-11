import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, useTheme, Avatar, Card, ActivityIndicator, IconButton, FAB } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { ScreenHeader } from '../../components/ScreenHeader';
import { WorkspaceSelector } from '../../components/WorkspaceSelector';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { Context } from '../../services/planAiApi';

export default function ContextsScreen() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  
  const theme = useTheme();
  const router = useRouter();
  const { api, activeWorkspaceId, user } = useAuth();

  const fetchContexts = async () => {
    try {
      const data = await api.listContexts();
      setContexts(data || []);
    } catch (e) {
      console.error('Failed to fetch contexts', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchContexts();
    }, [activeWorkspaceId])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchContexts();
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Avatar.Icon size={120} icon="bookshelf" style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 24 }} color={theme.colors.onSurfaceVariant} />
      <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: 'bold', marginBottom: 12 }}>
        No contexts found
      </Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32, marginBottom: 32 }}>
        Contexts provide background knowledge for AI models. Create them on the web platform.
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: Context }) => {
    const formattedDate = item.updatedAt 
      ? new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
      
    const title = item.name || 'Untitled Context';
    const colorHex = item.color || theme.colors.primary;

    return (
      <TouchableOpacity onPress={() => router.push(`/context/${item.id}` as any)}>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
          <Card.Title 
            title={title}
            subtitle={item.description || formattedDate}
            titleStyle={{ color: theme.colors.onSurface, fontWeight: 'bold' }}
            subtitleStyle={{ color: theme.colors.onSurfaceVariant }}
            subtitleNumberOfLines={1}
            left={(props) => (
              <View style={[styles.colorAvatarWrapper, { backgroundColor: colorHex }]}>
                <Avatar.Icon {...props} icon="folder-outline" style={{ backgroundColor: 'transparent' }} color="#ffffff" />
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
        user={user}
        titleComponent={
          <WorkspaceSelector 
            onWorkspaceChange={() => {
              setIsLoading(true);
              fetchContexts();
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
          data={contexts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={contexts.length === 0 ? styles.emptyListContent : styles.listContent}
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
    paddingBottom: 100, // Space for FAB
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
  colorAvatarWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 20,
    borderRadius: 16,
  }
});
