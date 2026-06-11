import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme, IconButton, Avatar, Text } from 'react-native-paper';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SubscriptionBanner } from './SubscriptionBanner';

interface ScreenHeaderProps {
  title?: string;
  titleComponent?: React.ReactNode;
  user?: any;
  showProfile?: boolean;
  rightComponent?: React.ReactNode;
}

export function ScreenHeader({ title, titleComponent, user, showProfile = true, rightComponent }: ScreenHeaderProps) {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();

  return (
    <View>
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <IconButton 
          icon="menu" 
          size={28} 
          iconColor={theme.colors.onSurface} 
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())} 
          style={{ marginLeft: -8 }} 
        />
        {titleComponent ? (
          titleComponent
        ) : title ? (
          <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flexShrink: 1 }} numberOfLines={2} ellipsizeMode="tail">
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        {rightComponent}
        {showProfile && (
          <TouchableOpacity onPress={() => router.push('/profile' as any)} style={{ marginLeft: rightComponent ? 8 : 0 }}>
            {user?.photoURL ? (
              <Avatar.Image size={40} source={{ uri: user.photoURL }} />
            ) : (
              <Avatar.Text size={40} label={user?.email ? user.email.charAt(0).toUpperCase() : 'U'} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
    <SubscriptionBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1, // Crucial for text shrinking gracefully
    marginRight: 16, // Prevent long text from hugging the profile avatar
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
