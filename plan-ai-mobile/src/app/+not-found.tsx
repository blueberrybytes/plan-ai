import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { Button } from 'react-native-paper';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" asChild>
          <Button mode="contained" style={styles.button}>
            Go to home screen
          </Button>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#0F172A',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  button: {
    marginTop: 15,
  },
});
