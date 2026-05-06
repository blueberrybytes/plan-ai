import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Animated } from 'react-native';
import { Text, useTheme, Card, Button, Avatar, IconButton } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useRouter, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

// A constant pulsing orb representing the user's acoustic fingerprint
function StaticVoiceOrb({ theme, active }: { theme: any, active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 2500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 2500, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulse.setValue(0);
    }
  }, [active, pulse]);

  const color = active ? theme.colors.primary : theme.colors.onSurfaceVariant;
  const containerColor = active ? theme.colors.primaryContainer : theme.colors.surfaceVariant;

  return (
    <View style={{ height: 160, justifyContent: 'center', alignItems: 'center', marginVertical: 24 }}>
      {/* Outer Pulse Ring */}
      <Animated.View style={{
        position: 'absolute',
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: containerColor,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.4] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
      }} />
      
      {/* Static Core Ring */}
      <Animated.View style={{
        position: 'absolute',
        width: 90,
        height: 90,
        borderRadius: 45,
        backgroundColor: color,
        opacity: active ? 0.2 : 0.1,
      }} />

      {/* Core Glowing Orb */}
      <View style={{
         width: 70, height: 70, borderRadius: 35, 
         backgroundColor: color, 
         justifyContent: 'center', alignItems: 'center',
         elevation: active ? 12 : 2,
         shadowColor: color,
         shadowOffset: { width: 0, height: 6 },
         shadowOpacity: active ? 0.6 : 0.1,
         shadowRadius: 15
      }}>
         <Avatar.Icon size={70} icon={active ? "waveform" : "account-voice-off"} style={{ backgroundColor: 'transparent' }} color={active ? theme.colors.onPrimary : theme.colors.surface} />
      </View>
    </View>
  );
}

export default function VoiceProfileDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { backendUser, user } = useAuth();

  const isProfileActive = backendUser?.hasVoiceProfile ?? false;
  const audioPlayer = useAudioPlayer(backendUser?.voiceProfileUrl || null);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconButton 
            icon="menu" 
            size={28} 
            iconColor={theme.colors.onSurface} 
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())} 
            style={{ marginLeft: -8 }} 
          />
          <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
            Voice Profile
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <StaticVoiceOrb theme={theme} active={isProfileActive} />

        <Text variant="headlineMedium" style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: theme.colors.onSurface }}>
          Speaker Diarization
        </Text>
        
        <Text variant="bodyLarge" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, marginBottom: 32, paddingHorizontal: 16, lineHeight: 28 }}>
          Plan AI isolates frequencies in noisy meeting rooms. By recording an acoustic fingerprint, the AI engine can mathematically separate your sentences from other speakers, tagging your name perfectly in transcripts.
        </Text>

        <Card style={styles.card} mode="elevated" elevation={1}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.statusRow}>
              <MaterialCommunityIcons 
                name={isProfileActive ? "check-decagram" : "alert-circle-outline"} 
                size={24} 
                color={isProfileActive ? "#4CAF50" : theme.colors.error} 
              />
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                  {isProfileActive ? "Acoustic Profile Active" : "No Profile Configured"}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  {isProfileActive 
                    ? "Your unique voice frequencies are encrypted and actively used in meetings." 
                    : "Plan AI cannot differentiate you from other guests yet."}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <View style={{ width: '100%', gap: 12 }}>
          {isProfileActive && backendUser?.voiceProfileUrl && (
            <Button 
              mode="contained-tonal"
              style={styles.actionButton}
              icon={playerStatus.playing ? "pause" : "play"}
              onPress={() => {
                if (playerStatus.playing) audioPlayer.pause();
                else audioPlayer.play();
              }}
            >
              {playerStatus.playing ? "Pause Playback" : "Listen to Profile"}
            </Button>
          )}

          <Button 
            mode={isProfileActive ? "outlined" : "contained"} 
            style={styles.actionButton}
            buttonColor={!isProfileActive ? theme.colors.primary : undefined}
            textColor={isProfileActive ? theme.colors.primary : theme.colors.primary}
            icon="microphone" 
            onPress={() => router.push('/(onboarding)/voice-setup')}
          >
            {isProfileActive ? "Recalibrate Voice" : "Setup Voice Profile"}
          </Button>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 24,
    borderRadius: 16,
  },
  cardContent: {
    paddingVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    paddingVertical: 6,
    borderRadius: 12,
  }
});
