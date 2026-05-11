import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, useTheme, Card, IconButton, Chip, Divider } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { Task } from '../../services/planAiApi';

export default function TaskDetailsScreen() {
  const params = useLocalSearchParams();
  const theme = useTheme();

  const task: Task | null = useMemo(() => {
    try {
      if (typeof params.taskStr === 'string') {
        return JSON.parse(params.taskStr);
      }
    } catch (e) {
      console.error('Failed to parse task string', e);
    }
    return null;
  }, [params.taskStr]);

  if (!task) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text variant="headlineMedium">Task not found</Text>
        <IconButton icon="arrow-left" size={32} onPress={() => router.back()} />
      </View>
    );
  }

  const dueDateStr = task.dueDate 
    ? new Date(task.dueDate).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
    : 'No Date';

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return '#a855f7';
      case 'HIGH': return '#ef4444';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#22c55e';
      default: return '#94a3b8';
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

  const pColor = getPriorityColor(task.priority);
  const sColor = getStatusColor(task.status);
  
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
           Task Details
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 16 }}>
          {task.title}
        </Text>

        <View style={styles.chipsRow}>
          <Chip 
            textStyle={{ color: sColor, fontWeight: 'bold' }} 
            style={{ backgroundColor: `${sColor}15` }}
          >
            Status: {task.status.replace(/_/g, ' ')}
          </Chip>
          <Chip 
            textStyle={{ color: pColor, fontWeight: 'bold' }} 
            style={{ backgroundColor: `${pColor}15` }}
          >
            Priority: {task.priority}
          </Chip>
        </View>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
          <Card.Content>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 8 }}>
              Description
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 24 }}>
              {task.description || task.summary || 'No description provided.'}
            </Text>
          </Card.Content>
        </Card>

        {task.acceptanceCriteria ? (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
            <Card.Content>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>
                Acceptance Criteria
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                {task.acceptanceCriteria}
              </Text>
            </Card.Content>
          </Card>
        ) : null}

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
          <Card.Content>
            <View style={styles.row}>
              <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                Due Date
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {dueDateStr}
              </Text>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.row}>
              <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                Created At
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {new Date(task.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
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
  chipsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center'
  }
});
