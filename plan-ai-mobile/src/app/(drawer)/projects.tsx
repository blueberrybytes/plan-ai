import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { Text, useTheme, Card, Avatar, ActivityIndicator, IconButton, FAB } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Project } from '../../services/planAiApi';
import { AuthContext } from '../../context/AuthContext';

export default function ProjectsScreen() {
  const theme = useTheme();
  const { user, api, activeWorkspaceId } = React.useContext(AuthContext);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProjects = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    try {
      const data = await api.listProjects();
      setProjects(data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, api, activeWorkspaceId]);

  useFocusEffect(
    useCallback(() => {
      fetchProjects();
    }, [fetchProjects, activeWorkspaceId])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProjects(true);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Avatar.Icon size={80} icon="briefcase-outline" style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 16 }} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 8 }}>
        No projects yet
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 }}>
        Create a project to organize your tasks, docs, and recordings.
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: Project }) => {
    const formattedDate = new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    
    return (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1} onPress={() => router.push(`/project/${item.id}` as any)}>
        <Card.Title 
          title={item.title}
          subtitle={`Updated ${formattedDate}`}
          titleStyle={{ color: theme.colors.onSurface, fontWeight: 'bold' }}
          subtitleStyle={{ color: theme.colors.onSurfaceVariant }}
          left={(props) => <Avatar.Icon {...props} icon="briefcase" style={{ backgroundColor: theme.colors.primary }} color="#ffffff" />}
        />
        {item.description && (
          <Card.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }} numberOfLines={2}>
              {item.description}
            </Text>
          </Card.Content>
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title="Projects" user={user} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={projects.length === 0 ? styles.emptyListContent : styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        />
      )}
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
    paddingBottom: 40,
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
  }
});
