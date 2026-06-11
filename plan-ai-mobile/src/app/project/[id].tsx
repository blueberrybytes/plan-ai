import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { Text, useTheme, Card, Avatar, ActivityIndicator, IconButton, Chip, FAB } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { Task } from '../../services/planAiApi';
import { AuthContext } from '../../context/AuthContext';

type FilterTab = 'ALL' | 'DONE' | 'IN_PROGRESS' | 'TODO';

export default function ProjectDetailsScreen() {
  const { id } = useLocalSearchParams();
  const projectId = typeof id === 'string' ? id : id?.[0];
  
  const theme = useTheme();
  const { user, api, activeWorkspaceId } = React.useContext(AuthContext);
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const fetchTasks = useCallback(async (forceRefresh = false) => {
    if (!user || !projectId) return;
    try {
      const data = await api.listProjectTasks(projectId);
      setTasks(data);
    } catch (error) {
      console.error('Failed to load project tasks:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, api, activeWorkspaceId, projectId]);

  useEffect(() => {
    if (projectId) {
      fetchTasks();
    }
  }, [fetchTasks, projectId]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchTasks(true);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'DONE') return task.status === 'COMPLETED';
      if (activeTab === 'IN_PROGRESS') return task.status === 'IN_PROGRESS';
      if (activeTab === 'TODO') return task.status === 'BACKLOG' || task.status === 'BLOCKED'; // "Not Started" statuses
      return true;
    }).sort((a, b) => {
       // Sort by priority logic if needed, but for now sort by update date
       return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [tasks, activeTab]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return '#a855f7';
      case 'HIGH': return '#ef4444';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#22c55e';
      default: return '#94a3b8';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'check-circle';
      case 'IN_PROGRESS': return 'progress-clock';
      case 'BLOCKED': return 'cancel';
      case 'BACKLOG':
      default: return 'circle-outline';
    }
  };

  const getStatusColor = (status: string) => {
     switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'IN_PROGRESS': return '#f59e0b';
      case 'BLOCKED': return '#ef4444';
      case 'BACKLOG':
      default: return '#94a3b8';
    }
  }

  const getStatusLabel = (status: string) => {
      switch (status) {
      case 'COMPLETED': return 'Done';
      case 'IN_PROGRESS': return 'In Progress';
      case 'BLOCKED': return 'Blocked';
      case 'BACKLOG': return 'Not Started';
      default: return status.replace(/_/g, ' ');
    }
  }

  const renderTask = (task: Task) => {
    const formattedDate = task.dueDate 
      ? new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : null;

    const pColor = getPriorityColor(task.priority);
    const sColor = getStatusColor(task.status);
    
    return (
      <Card 
        key={task.id} 
        style={[styles.card, { backgroundColor: theme.colors.surface, borderLeftColor: pColor, borderLeftWidth: 4 }]} 
        mode="elevated" 
        elevation={1}
        onPress={() => router.push({ pathname: `/task/${task.id}` as any, params: { taskStr: JSON.stringify(task) } })}
      >
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 8, textDecorationLine: task.status === 'COMPLETED' ? 'line-through' : 'none' }}>
            {task.title}
          </Text>
          
          {(task.summary || task.description) && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }} numberOfLines={2}>
              {task.summary || task.description}
            </Text>
          )}

          <View style={styles.metadataRow}>
            <View style={styles.chipRow}>
               <Chip 
                  icon={getStatusIcon(task.status)} 
                  textStyle={{ fontSize: 10, color: sColor, fontWeight: 'bold' }} 
                  style={{ backgroundColor: `${sColor}15`, minHeight: 28, paddingHorizontal: 2 }}
                  compact
               >
                  {getStatusLabel(task.status)}
               </Chip>
               <Chip 
                  textStyle={{ fontSize: 10, color: pColor, fontWeight: 'bold' }} 
                  style={{ backgroundColor: `${pColor}15`, minHeight: 28, paddingHorizontal: 2 }}
                  compact
               >
                  {task.priority}
               </Chip>
            </View>

            {formattedDate && (
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                📅 {formattedDate}
              </Text>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <IconButton 
          icon="arrow-left" 
          size={28} 
          iconColor={theme.colors.onSurface} 
          onPress={() => router.back()} 
          style={{ marginLeft: -8 }} 
        />
        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
           Tasks
        </Text>
        <IconButton 
          icon="refresh" 
          size={24} 
          iconColor={theme.colors.onSurface} 
          onPress={onRefresh} 
          disabled={isLoading || isRefreshing}
        />
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <Chip 
            selected={activeTab === 'ALL'} 
            onPress={() => setActiveTab('ALL')}
            style={[styles.tabChip, activeTab === 'ALL' && { backgroundColor: theme.colors.primary }]}
            textStyle={activeTab === 'ALL' ? { color: theme.colors.onPrimary } : {}}
          >
            All
          </Chip>
          <Chip 
            selected={activeTab === 'TODO'} 
            onPress={() => setActiveTab('TODO')}
            style={[styles.tabChip, activeTab === 'TODO' && { backgroundColor: theme.colors.primary }]}
            textStyle={activeTab === 'TODO' ? { color: theme.colors.onPrimary } : {}}
          >
            Not Started
          </Chip>
          <Chip 
            selected={activeTab === 'IN_PROGRESS'} 
            onPress={() => setActiveTab('IN_PROGRESS')}
            style={[styles.tabChip, activeTab === 'IN_PROGRESS' && { backgroundColor: theme.colors.primary }]}
            textStyle={activeTab === 'IN_PROGRESS' ? { color: theme.colors.onPrimary } : {}}
          >
            In Progress
          </Chip>
          <Chip 
            selected={activeTab === 'DONE'} 
            onPress={() => setActiveTab('DONE')}
            style={[styles.tabChip, activeTab === 'DONE' && { backgroundColor: theme.colors.primary }]}
            textStyle={activeTab === 'DONE' ? { color: theme.colors.onPrimary } : {}}
          >
            Done
          </Chip>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={filteredTasks.length === 0 ? styles.emptyListContent : styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          {filteredTasks.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Avatar.Icon size={80} icon="check-all" style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 16 }} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 8, textAlign: 'center' }}>
                No tasks found
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 }}>
                {activeTab === 'ALL' 
                  ? "This project doesn't have any tasks yet." 
                  : `No tasks match the "${activeTab.replace('_', ' ').toLowerCase()}" filter.`}
              </Text>
            </View>
          ) : (
            filteredTasks.map(renderTask)
          )}
        </ScrollView>
      )}

      <FAB
        icon="plus"
        color="white"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => router.push(`/project/${projectId}/create-task` as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsContainer: {
    marginBottom: 16,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    borderRadius: 20,
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
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden', // to ensure border radius applies over the left border
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    bottom: 0,
    borderRadius: 28,
  }
});
