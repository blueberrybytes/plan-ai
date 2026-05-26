import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, Alert } from 'react-native';
import { Text, useTheme, TextInput, Button, IconButton, SegmentedButtons, ActivityIndicator, Chip, Surface, Portal, Dialog } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { useAuth } from '../../../context/AuthContext';

export default function CreateTaskScreen() {
  const { id } = useLocalSearchParams();
  const projectId = typeof id === 'string' ? id : id?.[0];
  
  const theme = useTheme();
  const { api } = useAuth();
  
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  
  const [type, setType] = useState('TASK');
  const [priority, setPriority] = useState('MEDIUM');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);

  const handleRefine = async () => {
    if (!title.trim() && !summary.trim() && !description.trim()) {
      Alert.alert("Missing details", "Please dictate or type at least a rough title or description to refine.");
      return;
    }
    
    setIsRefining(true);
    try {
      if (!projectId) throw new Error("Project ID missing");
      const suggestion = await api.refineProjectTask(projectId, {
        title: title || "New Task",
        summary: summary || null,
        description: description || null,
        acceptanceCriteria: acceptanceCriteria || null,
        type,
        priority
      });
      setAiSuggestion(suggestion);
    } catch (e) {
      console.error(e);
      Alert.alert("Refinement Failed", "Unable to refine your task at this time.");
    } finally {
      setIsRefining(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    setTitle(aiSuggestion.refinedTitle);
    setDescription(aiSuggestion.structuredDescription);
    if (aiSuggestion.acceptanceCriteria) {
      setAcceptanceCriteria(aiSuggestion.acceptanceCriteria);
    }
    setAiSuggestion(null);
  };

  const handleCreateTask = async () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please provide a task title.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (!projectId) throw new Error("Project ID missing");
      await api.createProjectTask(projectId, {
        title: title.trim(),
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        acceptanceCriteria: acceptanceCriteria.trim() || undefined,
        type,
        priority,
        status: "BACKLOG",
      });
      router.back();
    } catch (error) {
      console.error("Failed to create task:", error);
      Alert.alert("Error", "Failed to create task. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: theme.colors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <IconButton 
          icon="close" 
          size={24} 
          iconColor={theme.colors.onSurface} 
          onPress={() => router.back()} 
          style={{ marginLeft: -8 }} 
        />
        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }}>
          Create Task
        </Text>
        <Button 
          mode="contained" 
          onPress={handleCreateTask} 
          loading={isSubmitting} 
          disabled={isSubmitting || !title.trim()}
          style={{ borderRadius: 20 }}
          compact
        >
          Save
        </Button>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Helper Tip */}
        <Surface style={[styles.tipContainer, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
          <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
            💡 Tip: Tap the microphone icon on your keyboard to dictate your task details, then let AI refine it!
          </Text>
        </Surface>

        {/* Form Fields */}
        <TextInput
          mode="outlined"
          label="Task Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Add user persona field"
          style={styles.input}
        />

        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Task Type</Text>
        <SegmentedButtons
          value={type}
          onValueChange={setType}
          buttons={[
            { value: 'TASK', label: 'Task' },
            { value: 'BUG', label: 'Bug' },
            { value: 'STORY', label: 'Story' },
            { value: 'EPIC', label: 'Epic' },
          ]}
          style={styles.segmentedButtons}
        />

        <TextInput
          mode="outlined"
          label="Rough Notes / Summary"
          value={summary}
          onChangeText={setSummary}
          placeholder="Quick notes to remember..."
          multiline
          numberOfLines={2}
          style={styles.input}
        />

        <TextInput
          mode="outlined"
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Detailed description..."
          multiline
          numberOfLines={4}
          style={styles.input}
        />

        <TextInput
          mode="outlined"
          label="Acceptance Criteria"
          value={acceptanceCriteria}
          onChangeText={setAcceptanceCriteria}
          placeholder="How do we know it's done?"
          multiline
          numberOfLines={2}
          style={styles.input}
        />

        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant, marginTop: 8 }]}>Priority</Text>
        <SegmentedButtons
          value={priority}
          onValueChange={setPriority}
          buttons={[
            { value: 'LOW', label: 'Low' },
            { value: 'MEDIUM', label: 'Med' },
            { value: 'HIGH', label: 'High' },
            { value: 'URGENT', label: 'Urgent' },
          ]}
          style={styles.segmentedButtons}
        />

        {/* AI Action */}
        <Button 
          mode="outlined" 
          icon="auto-fix" 
          onPress={handleRefine} 
          loading={isRefining} 
          disabled={isRefining || (!title && !description && !summary)}
          style={styles.aiButton}
          textColor={theme.colors.primary}
        >
          {isRefining ? 'Refining...' : '✨ Refine with AI Task Coach'}
        </Button>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* AI Suggestion Dialog */}
      <Portal>
        <Dialog visible={!!aiSuggestion} onDismiss={() => setAiSuggestion(null)}>
          <Dialog.Title>✨ AI Suggestion</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
              {aiSuggestion && (
                <>
                  <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 8 }}>
                    {aiSuggestion.refinedTitle}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
                    {aiSuggestion.structuredDescription}
                  </Text>
                  {aiSuggestion.acceptanceCriteria && (
                    <>
                      <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 4 }}>Acceptance Criteria</Text>
                      {/* AI returns AC as a markdown bullet list. Render
                          through markdown-display so bullets show properly. */}
                      <Markdown
                        style={{
                          body: {
                            color: theme.colors.onSurfaceVariant,
                            fontSize: 14,
                            marginBottom: 16,
                          },
                          bullet_list: { marginLeft: 0 },
                          list_item: { marginBottom: 2 },
                          paragraph: { marginTop: 0, marginBottom: 0 },
                        }}
                      >
                        {aiSuggestion.acceptanceCriteria}
                      </Markdown>
                    </>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {aiSuggestion.storyPoints ? <Chip icon="star" compact>{aiSuggestion.storyPoints} Points</Chip> : null}
                    {aiSuggestion.estimatedMinutes ? <Chip icon="clock" compact>{aiSuggestion.estimatedMinutes} mins</Chip> : null}
                  </View>
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAiSuggestion(null)}>Cancel</Button>
            <Button onPress={applyAiSuggestion} mode="contained">Apply</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  content: {
    padding: 16,
  },
  tipContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  label: {
    marginBottom: 8,
    fontWeight: '600',
  },
  segmentedButtons: {
    marginBottom: 16,
  },
  aiButton: {
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  }
});
