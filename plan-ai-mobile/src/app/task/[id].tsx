import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Platform, Linking } from 'react-native';
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

        {/* Integration Badges */}
        {((task.metadata as Record<string, unknown> | null)?.jira ||
          (task.metadata as Record<string, unknown> | null)?.linear ||
          (task.metadata as Record<string, unknown> | null)?.trello ||
          (task.metadata as Record<string, unknown> | null)?.notion ||
          (task.metadata as Record<string, unknown> | null)?.asana) ? (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
            <Card.Content>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>
                Integrations
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(task.metadata as Record<string, Record<string, string>> | null)?.jira ? (
                  <Chip
                    icon="jira"
                    onPress={() => Linking.openURL((task.metadata as Record<string, Record<string, string>>).jira.url)}
                  >
                    {(task.metadata as Record<string, Record<string, string>>).jira.issueKey || 'Jira'}
                  </Chip>
                ) : null}
                {(task.metadata as Record<string, Record<string, string>> | null)?.linear ? (
                  <Chip
                    icon="ray-start-arrow"
                    onPress={() => Linking.openURL((task.metadata as Record<string, Record<string, string>>).linear.url)}
                  >
                    {(task.metadata as Record<string, Record<string, string>>).linear.identifier || 'Linear'}
                  </Chip>
                ) : null}
                {(task.metadata as Record<string, Record<string, string>> | null)?.trello ? (
                  <Chip
                    icon="trello"
                    onPress={() => Linking.openURL((task.metadata as Record<string, Record<string, string>>).trello.url)}
                  >
                    {(task.metadata as Record<string, Record<string, string>>).trello.shortLink || 'Trello'}
                  </Chip>
                ) : null}
                {(task.metadata as Record<string, Record<string, string>> | null)?.notion ? (
                  <Chip
                    icon="notebook-outline"
                    onPress={() => Linking.openURL((task.metadata as Record<string, Record<string, string>>).notion.url)}
                  >
                    Notion
                  </Chip>
                ) : null}
                {(task.metadata as Record<string, Record<string, string>> | null)?.asana ? (
                  <Chip
                    icon="checkbox-marked-circle-outline"
                    onPress={() => Linking.openURL((task.metadata as Record<string, Record<string, string>>).asana.url)}
                  >
                    Asana
                  </Chip>
                ) : null}
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {/* Generated Assets */}
        {((task.metadata as Record<string, unknown> | null)?.publicDocUrl ||
          (task.metadata as Record<string, unknown> | null)?.publicSlidesUrl) ? (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated" elevation={1}>
            <Card.Content>
              <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>
                Generated Assets
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(task.metadata as Record<string, unknown> | null)?.publicDocUrl ? (
                  <Chip
                    icon="file-document-outline"
                    onPress={() => Linking.openURL(String((task.metadata as Record<string, unknown>)?.publicDocUrl))}
                  >
                    Public Document
                  </Chip>
                ) : null}
                {(task.metadata as Record<string, unknown> | null)?.publicSlidesUrl ? (
                  <Chip
                    icon="presentation"
                    onPress={() => Linking.openURL(String((task.metadata as Record<string, unknown>)?.publicSlidesUrl))}
                  >
                    Public Slides
                  </Chip>
                ) : null}
              </View>
            </Card.Content>
          </Card>
        ) : null}
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
