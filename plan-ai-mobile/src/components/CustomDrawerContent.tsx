import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { DrawerContentScrollView, DrawerItem, DrawerItemList } from '@react-navigation/drawer';
import { Text, useTheme, Divider, Avatar, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { usePersonalStatus } from '../services/trackersStore';

export function CustomDrawerContent(props: any) {
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  // Without personal mode there is no personal workspace, so the Trackers
  // item never shows. This item opens Trackers, which asks for the consent.
  const { status: personalStatus } = usePersonalStatus();
  const offerPersonal = !!personalStatus?.available && !personalStatus.enabled;

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
      {offerPersonal && (
        <DrawerItem
          label="Personal space"
          activeTintColor={theme.colors.primary}
          inactiveTintColor={theme.colors.onSurfaceVariant}
          icon={({ color, size }: { color: string; size: number }) => (
            <MaterialCommunityIcons name="shield-account-outline" color={color} size={size} />
          )}
          onPress={() => {
            props.navigation.closeDrawer();
            props.navigation.navigate('trackers');
          }}
        />
      )}
      
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
