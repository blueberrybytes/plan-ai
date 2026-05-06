import React, { useState } from 'react';
import { View, StyleSheet, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Text, Button, useTheme, TextInput, Divider, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// Simple SVG-styled icon placeholder for Microsoft (no external dep needed)
function MicrosoftLogo() {
  return (
    <Text style={{ fontSize: 16, fontWeight: '700', color: '#00A4EF', lineHeight: 20 }}>⊞</Text>
  );
}

export default function LoginScreen() {
  const { signInWithGoogle, signInWithApple, signInWithMicrosoft, signInWithEmail } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [error, setError] = useState('');

  const isAnyLoading = emailLoading || googleLoading || appleLoading || microsoftLoading;

  const withLoading = (setter: (v: boolean) => void, fn: () => Promise<void>) => async () => {
    try {
      setError('');
      setter(true);
      await fn();
      router.replace('/');
    } catch (e: any) {
      setError(e.message || 'Sign-in failed. Please try again.');
    } finally {
      setter(false);
    }
  };

  const handleGoogle = withLoading(setGoogleLoading, signInWithGoogle);
  const handleApple = withLoading(setAppleLoading, signInWithApple);
  const handleMicrosoft = withLoading(setMicrosoftLoading, signInWithMicrosoft);
  const handleEmail = withLoading(setEmailLoading, () => signInWithEmail(email, password));

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="displaySmall" style={{ fontWeight: '800', color: theme.colors.primary }}>
            Plan AI
          </Text>
          <Text variant="bodyMedium" style={{ opacity: 0.6, textAlign: 'center', marginTop: 8 }}>
            Record, summarize, and extract tasks from your meetings instantly.
          </Text>
        </View>

        {/* Error */}
        {!!error && (
          <Surface style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
            <Text style={{ color: theme.colors.onErrorContainer, fontSize: 13 }}>{error}</Text>
          </Surface>
        )}

        {/* OAuth Buttons */}
        <View style={styles.oauthGroup}>
          <Button
            mode="outlined"
            onPress={handleGoogle}
            loading={googleLoading}
            disabled={isAnyLoading}
            style={styles.oauthButton}
            contentStyle={styles.oauthContent}
            icon="google"
          >
            Continue with Google
          </Button>

          {/* Apple — iOS only (App Store requires it) */}
          {Platform.OS === 'ios' && (
            <Button
              mode="contained"
              onPress={handleApple}
              loading={appleLoading}
              disabled={isAnyLoading}
              style={[styles.oauthButton, { backgroundColor: '#000' }]}
              contentStyle={styles.oauthContent}
              labelStyle={{ color: '#fff' }}
              icon="apple"
            >
              Continue with Apple
            </Button>
          )}

          <Button
            mode="outlined"
            onPress={handleMicrosoft}
            loading={microsoftLoading}
            disabled={isAnyLoading}
            style={styles.oauthButton}
            contentStyle={styles.oauthContent}
            icon={() => <MicrosoftLogo />}
          >
            Continue with Microsoft
          </Button>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <Divider style={styles.dividerLine} />
          <Text variant="labelSmall" style={{ opacity: 0.5, marginHorizontal: 12 }}>or</Text>
          <Divider style={styles.dividerLine} />
        </View>

        {/* Email / Password Form */}
        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            mode="outlined"
            style={styles.input}
            disabled={isAnyLoading}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            mode="outlined"
            style={styles.input}
            disabled={isAnyLoading}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
          />
          <Button
            mode="contained"
            onPress={handleEmail}
            loading={emailLoading}
            disabled={isAnyLoading || !email || !password}
            style={styles.oauthButton}
            contentStyle={styles.oauthContent}
          >
            Sign In with Email
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  oauthGroup: {
    gap: 12,
    marginBottom: 24,
  },
  oauthButton: {
    borderRadius: 8,
  },
  oauthContent: {
    paddingVertical: 6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: 'transparent',
  },
});
