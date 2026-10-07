import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as StoreReview from 'expo-store-review';
import { useColors } from '@/hooks/useColors';
import { completeRatingPrompt, GOOGLE_PLAY_RATING_URL } from '@/services/ratingPrompt';

export function RatingPromptModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const colors = useColors();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewFlowStatus, setReviewFlowStatus] = useState<'idle' | 'completed' | 'unavailable'>('idle');

  useEffect(() => {
    if (visible) {
      setIsSubmitting(false);
      setReviewFlowStatus('idle');
    }
  }, [visible]);

  const requestReview = async () => {
    setIsSubmitting(true);
    try {
      if (!(await StoreReview.isAvailableAsync())) {
        setReviewFlowStatus('unavailable');
        return;
      }
      await StoreReview.requestReview();
      await completeRatingPrompt();
      setReviewFlowStatus('completed');
    } catch {
      setReviewFlowStatus('unavailable');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPlayStore = async () => {
    setIsSubmitting(true);
    try {
      await Linking.openURL(GOOGLE_PLAY_RATING_URL);
      await completeRatingPrompt();
      onDismiss();
    } catch {
      setIsSubmitting(false);
      Alert.alert('Unable to open Google Play', 'Please try again later or search for FXSnap in Google Play.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close rating prompt"
            onPress={onDismiss}
            style={styles.closeButton}
          >
            <Feather name="x" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={[styles.icon, { backgroundColor: colors.surface }]}>
            <Feather name="star" size={23} color={colors.gold} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Enjoying FXSnap?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Share your experience through Google Play's review dialog.
          </Text>
          {reviewFlowStatus !== 'completed' && (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => void requestReview()}
              style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.6 : 1 }]}
            >
              <Feather name="star" size={17} color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {isSubmitting ? 'Opening Google Play...' : 'Rate FXSnap'}
              </Text>
            </TouchableOpacity>
          )}

          {reviewFlowStatus === 'completed' && (
            <Text style={[styles.status, { color: colors.textSecondary }]}>Google Play doesn't tell us whether you submitted a rating.</Text>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void openPlayStore()}
            style={styles.fallbackButton}
          >
            <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>Rate on Google Play</Text>
            <Feather name="external-link" size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" onPress={onDismiss} style={styles.laterButton}>
            <Text style={[styles.laterText, { color: colors.textMuted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 22 },
  dialog: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center' },
  closeButton: { position: 'absolute', right: 12, top: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 16 },
  title: { fontSize: 21, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, maxWidth: 300 },
  primaryButton: { minHeight: 48, width: '100%', borderRadius: 9, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 4 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  status: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 12 },
  fallbackButton: { minHeight: 42, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8 },
  fallbackText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  laterButton: { minHeight: 44, minWidth: 100, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  laterText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
