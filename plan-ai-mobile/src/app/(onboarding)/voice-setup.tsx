import { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Alert,
  TouchableOpacity,
} from "react-native";
import {
  Text,
  Button,
  ProgressBar,
  useTheme,
  Avatar,
  IconButton,
} from "react-native-paper";
import { useRouter } from "expo-router";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import { useAuth } from "../../context/AuthContext";

export const WAVEFORM_FILE = "voice_waveform.json";
const NUM_BARS = 60;

function resampleTo(samples: number[], n: number): number[] {
  if (samples.length === 0) return Array(n).fill(0.3);
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * samples.length);
    result.push(samples[idx]);
  }
  return result;
}

function WaveformVisualizer({
  samples,
  theme,
}: {
  samples: number[];
  theme: any;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 100,
        width: "100%",
        overflow: "hidden",
      }}
    >
      {samples.map((val, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            marginHorizontal: 1,
            maxWidth: 4,
            height: Math.max(4, val * 80),
            backgroundColor: theme.colors.primary,
            borderRadius: 2,
          }}
        />
      ))}
    </View>
  );
}

function VoiceOrb({
  isRecording,
  metering,
  theme,
  onPress,
}: {
  isRecording: boolean;
  metering: number | undefined;
  theme: any;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording) {
      const currentDb = typeof metering === "number" ? metering : -60;
      const intensity = Math.max(0, currentDb + 60) / 60; // Map -60 to 0 -> 0 to 1
      const dynamicScale = 1 + intensity * 0.8;

      Animated.spring(scale, {
        toValue: dynamicScale,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [metering, isRecording, scale]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulse.setValue(0);
    }
  }, [isRecording, pulse]);

  return (
    <View
      style={{
        height: 240,
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 10,
      }}
    >
      {/* Outer Pulse Ring */}
      <Animated.View
        style={{
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: theme.colors.primaryContainer,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.1, 0.5],
          }),
          transform: [{ scale: Animated.add(scale, 0.4) }],
        }}
      />

      {/* Dynamic Voice Acoustic Ring */}
      <Animated.View
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: theme.colors.primary,
          opacity: 0.2,
          transform: [{ scale }],
        }}
      />

      {/* Core Glowing Orb */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: theme.colors.primary,
          justifyContent: "center",
          alignItems: "center",
          elevation: 12,
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.6,
          shadowRadius: 15,
        }}
      >
        <Avatar.Icon
          size={100}
          icon={isRecording ? "waveform" : "microphone"}
          style={{ backgroundColor: "transparent" }}
          color={theme.colors.onPrimary}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function VoiceSetupScreen() {
  const [recordedURI, setRecordedURI] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder);
  const meteringSamples = useRef<number[]>([]);

  console.debug("[VoiceSetupScreen] recorderState:", recorderState);
  console.debug("[VoiceSetupScreen] meteringSamples:", meteringSamples.current);

  useEffect(() => {
    if (
      recorderState.isRecording &&
      typeof recorderState.metering === "number"
    ) {
      // Normalize dBFS (-60..0) → (0..1)
      const normalized = Math.max(
        0,
        Math.min(1, (recorderState.metering + 60) / 60),
      );
      meteringSamples.current.push(normalized);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  const theme = useTheme();
  const router = useRouter();
  const { api, refreshBackendUser, backendUser } = useAuth();

  const audioPlayer = useAudioPlayer(recordedURI);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  const startRecording = async () => {
    console.log("Starting recording...");
    try {
      const permission = await requestRecordingPermissionsAsync();
      console.log("Recording permission:", permission);
      if (!permission.granted) {
        alert("Microphone permission is required to save your voice profile.");
        return;
      }
      console.log("Setting audio mode...");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Clear previous samples if any
      meteringSamples.current = [];

      console.log("Preparing audio recorder...");
      await audioRecorder.prepareToRecordAsync();

      console.log("Starting recording...");
      audioRecorder.record();
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const saveWaveform = async () => {
    try {
      const samples = resampleTo(meteringSamples.current, NUM_BARS);
      const f = new File(Paths.document, WAVEFORM_FILE);
      await f.write(JSON.stringify(samples));
    } catch (e) {
      console.warn("Failed to save waveform", e);
    }
  };

  const stopRecording = async () => {
    if (!recorderState.isRecording) return;
    try {
      await audioRecorder.stop();
      setRecordedURI(audioRecorder.uri);

      // Save the waveform data as soon as recording stops
      await saveWaveform();
    } catch (error) {
      console.error("Failed to stop recording", error);
    }
  };

  const submitProfile = async () => {
    if (!recordedURI) return;
    try {
      setIsSubmitting(true);
      const fileName = recordedURI.split("/").pop() || "voice-profile.m4a";
      await api.saveVoiceProfile({
        uri: recordedURI,
        name: fileName,
        type: fileName.endsWith(".wav") ? "audio/wav" : "audio/mp4",
      });
      await refreshBackendUser();
      Alert.alert(
        "Voice Profile Saved",
        "Your voice profile has been processed and saved successfully.",
        [{ text: "OK", onPress: () => router.replace("/(drawer)" as any) }],
      );
    } catch (err) {
      console.error("Error submitting voice profile", err);
      alert("Failed to save profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => router.back()}
          style={{ margin: 0, marginRight: 8 }}
        />
        <Text
          variant="headlineMedium"
          style={[
            styles.title,
            { color: theme.colors.primary, marginBottom: 0 },
          ]}
        >
          Voice Profile
        </Text>
      </View>

      <Text variant="bodyLarge" style={styles.instructions}>
        Please read the following sentence aloud so we can recognize you in
        meetings.
      </Text>

      <View
        style={[
          styles.quoteBox,
          { backgroundColor: theme.colors.secondaryContainer },
        ]}
      >
        <Text
          variant="titleMedium"
          style={{
            fontStyle: "italic",
            color: theme.colors.onSecondaryContainer,
          }}
        >
          "Hi, this is my voice. I am setting up my Plan AI voice profile to
          enable speaker diarization."
        </Text>
      </View>

      {recordedURI ? (
        <View
          style={{
            height: 240,
            justifyContent: "center",
            alignItems: "center",
            marginVertical: 10,
          }}
        >
          <View
            style={{
              padding: 24,
              backgroundColor: theme.colors.surfaceVariant,
              borderRadius: 24,
              width: "100%",
            }}
          >
            <WaveformVisualizer
              samples={resampleTo(meteringSamples.current, NUM_BARS)}
              theme={theme}
            />
          </View>
          <Text
            variant="labelLarge"
            style={{ marginTop: 16, color: theme.colors.primary }}
          >
            Voice Profile Captured
          </Text>
        </View>
      ) : (
        <VoiceOrb
          isRecording={recorderState.isRecording}
          metering={recorderState.metering}
          theme={theme}
          onPress={() => {
            if (recorderState.isRecording) {
              stopRecording();
            } else if (!recordedURI) {
              startRecording();
            }
          }}
        />
      )}

      <View style={styles.controls}>
        {!recordedURI && !recorderState.isRecording && (
          <Button
            mode="contained"
            onPress={startRecording}
            buttonColor={theme.colors.primary}
          >
            Start Recording
          </Button>
        )}

        {!recordedURI && !recorderState.isRecording && router.canGoBack() && (
          <Button
            mode="text"
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
            Skip for now
          </Button>
        )}

        {recorderState.isRecording && (
          <Button
            mode="contained"
            onPress={stopRecording}
            buttonColor={theme.colors.error}
          >
            Stop Recording
          </Button>
        )}

        {recordedURI && !recorderState.isRecording && (
          <View style={{ width: "100%", gap: 12 }}>
            <Button
              mode="contained-tonal"
              icon={playerStatus.playing ? "pause" : "play"}
              onPress={() => {
                if (playerStatus.playing) audioPlayer.pause();
                else audioPlayer.play();
              }}
            >
              {playerStatus.playing ? "Pause" : "Listen"}
            </Button>
            <Button
              mode="outlined"
              onPress={() => {
                setRecordedURI(null);
              }}
              disabled={isSubmitting}
            >
              Retake
            </Button>
            <Button
              mode="contained"
              onPress={submitProfile}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Save Voice Profile
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 32,
    justifyContent: "center",
  },
  title: {
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  instructions: {
    textAlign: "center",
    marginBottom: 32,
    opacity: 0.8,
  },
  quoteBox: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 48,
  },
  controls: {
    alignItems: "center",
    width: "100%",
  },
});
