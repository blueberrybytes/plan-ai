import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Text, useTheme, Divider, Avatar, Button } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';

export function CustomDrawerContent(props: any) {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: theme.colors.surface }}>
      <TouchableOpacity 
        style={styles.header} 
        onPress={() => {
          props.navigation.closeDrawer();
          router.push('/profile' as any);
        }}
      >
        {user?.photoURL ? (
          <Avatar.Image size={64} source={{ uri: user.photoURL }} />
        ) : (
          <Avatar.Text size={64} label={user?.email ? user.email.charAt(0).toUpperCase() : 'U'} />
        )}
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: 'bold', marginTop: 12 }}>
          {user?.displayName || 'Plan AI User'}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {user?.email || ''}
        </Text>
      </TouchableOpacity>
      <Divider style={{ backgroundColor: theme.colors.outline, marginBottom: 8 }} />
      <DrawerItemList {...props} />
      
      <View style={{ marginTop: 24, paddingHorizontal: 20 }}>
        <Button 
          mode="outlined" 
          icon="microphone"
          textColor={theme.colors.primary}
          style={{ borderColor: theme.colors.primary, borderRadius: 8 }}
          onPress={() => {
            props.navigation.closeDrawer();
            router.push('/record' as any);
          }}
          contentStyle={{ paddingVertical: 8 }}
          labelStyle={{ fontWeight: 'bold', fontSize: 16 }}
        >
          Record Meeting
        </Button>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 24,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
