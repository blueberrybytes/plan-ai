import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, Text, Menu, IconButton } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';

interface WorkspaceSelectorProps {
  onWorkspaceChange: () => void;
}

export function WorkspaceSelector({ onWorkspaceChange }: WorkspaceSelectorProps) {
  const theme = useTheme();
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId } = useAuth();
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);

  if (!workspaces || workspaces.length === 0) return null;

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
  const label = activeWs?.name || workspaces[0].name;

  if (workspaces.length === 1) {
    return (
      <View style={styles.workspaceSelector}>
        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flexShrink: 1 }} numberOfLines={2} ellipsizeMode="tail">
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Menu
      visible={workspaceMenuVisible}
      onDismiss={() => setWorkspaceMenuVisible(false)}
      anchor={
        <TouchableOpacity 
          style={[styles.workspaceSelector, { backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexShrink: 1 }]} 
          onPress={() => setWorkspaceMenuVisible(true)}
        >
          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flexShrink: 1 }} numberOfLines={2} ellipsizeMode="tail">
            {label}
          </Text>
          <IconButton icon="chevron-down" size={16} style={{ margin: 0, padding: 0, width: 20, height: 20 }} />
        </TouchableOpacity>
      }
    >
      {workspaces.map(ws => (
        <Menu.Item 
          key={ws.id} 
          onPress={() => {
            setActiveWorkspaceId(ws.id);
            setWorkspaceMenuVisible(false);
            onWorkspaceChange();
          }} 
          title={ws.name} 
        />
      ))}
    </Menu>
  );
}

const styles = StyleSheet.create({
  workspaceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
});
