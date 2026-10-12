import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { completeGoogleSignInCallback } from '@/services/account';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AuthCallbackScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const code = firstParam(params.code);
    const callbackError = firstParam(params.error_description) || firstParam(params.error);

    void completeGoogleSignInCallback(code, callbackError)
      .then(() => {
        if (active) router.replace('/settings');
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Google sign-in could not be completed. Please try again.');
        }
      });

    return () => { active = false; };
  }, [params.code, params.error, params.error_description]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {error ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Sign-in could not be completed</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{error}</Text>
          <Text
            accessibilityRole="link"
            onPress={() => router.replace('/settings')}
            style={[styles.action, { color: colors.primary }]}
          >
            Return to Settings
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.message, { color: colors.textSecondary }]}>Completing Google sign-in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  action: {
    marginTop: 20,
    fontSize: 15,
    fontWeight: '600',
  },
});
