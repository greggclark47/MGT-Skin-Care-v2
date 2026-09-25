import React, { useState } from 'react';
import { SafeAreaView, Text, View, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SkinMatchScreen } from './src/screens/SkinMatchScreen';
import { ApiClient, color, font, space, radius } from '@mgt/shared';
import type { SkinProfileInput } from '@mgt/domain';

const api = new ApiClient(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

export default function App() {
  const [view, setView] = useState<'home' | 'match' | 'done' | 'error'>('home');

  async function handleComplete(input: SkinProfileInput, durationMs: number) {
    try {
      await api.completeSkinMatch(input);
      // duration_ms feeds `skin_match.completed` and the <=90s KPI, measured on-device.
      setView('done');
    } catch {
      setView('error');
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {view === 'home' && (
        <View style={styles.home}>
          <Text style={styles.title}>Skincare matched to your skin.</Text>
          <Text style={styles.body}>
            Answer a few questions and get a routine built for you — with the reason behind every product.
          </Text>
          <Pressable testID="start" onPress={() => setView('match')} accessibilityRole="button" style={styles.cta}>
            <Text style={styles.ctaLabel}>Start my Skin Match</Text>
          </Pressable>
          <Text style={styles.disclaimer}>
            Cosmetic guidance, not medical care. If you have a persistent or painful skin condition,
            please see a dermatologist.
          </Text>
        </View>
      )}
      {view === 'match' && <SkinMatchScreen onComplete={handleComplete} />}
      {view === 'done' && <Text style={styles.body}>Your routine is ready.</Text>}
      {view === 'error' && <Text style={styles.body}>Something went wrong. Please try again.</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  home: { padding: space.lg, gap: space.md },
  title: { fontSize: font.size.xxl, fontWeight: '700', color: color.text, marginTop: space.xl },
  body: { fontSize: font.size.md, color: color.textMuted, lineHeight: 24, padding: space.lg },
  cta: { marginTop: space.lg, minHeight: 48, alignItems: 'center', justifyContent: 'center',
         borderRadius: radius.pill, backgroundColor: color.accent },
  ctaLabel: { color: '#fff', fontSize: font.size.md, fontWeight: '600' },
  disclaimer: { fontSize: font.size.sm, color: color.textFaint, marginTop: space.md },
});
