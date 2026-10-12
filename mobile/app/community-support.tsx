import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getCommunitySupport,
  sendCommunitySupportMessage,
  type CommunitySupportMessage,
} from '@/services/community';

export default function CommunitySupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<CommunitySupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await getCommunitySupport();
      setMessages(result.messages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your support conversation.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages, sending]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await sendCommunitySupportMessage(body);
      setMessages((current) => result.duplicate || current.some((message) => message.id === result.message.id)
        ? current
        : [...current, result.message]);
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Contact FXSnap</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Private support conversation</Text>
        </View>
        <TouchableOpacity onPress={() => { setLoading(true); void load(); }} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Refresh support messages">
          <Feather name="refresh-cw" size={17} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void load(); }} tintColor={colors.buy} />}
      >
        <View style={[styles.privacyBanner, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="lock" size={15} color={colors.buy} />
          <Text style={[styles.privacyText, { color: colors.textSecondary }]}>Only you and authorized FXSnap support staff can see this conversation.</Text>
        </View>
        {loading && messages.length === 0 ? <ActivityIndicator color={colors.buy} style={styles.loader} /> : null}
        {!loading && messages.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="message-circle" size={27} color={colors.buy} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>How can we help?</Text>
            <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Send a private message to the FXSnap team. Replies will appear here.</Text>
          </View>
        ) : null}
        {messages.map((message) => {
          const isMember = message.sender_kind === 'member';
          return (
            <View key={message.id} style={[styles.messageRow, isMember && styles.memberRow]}>
              <View style={[
                styles.bubble,
                { backgroundColor: isMember ? colors.buy : colors.card, borderColor: isMember ? colors.buy : colors.cardBorder },
              ]}>
                <Text style={[styles.sender, { color: isMember ? colors.primaryForeground : colors.buy }]}>
                  {isMember ? 'You' : 'FXSnap Support'}
                </Text>
                <Text style={[styles.messageText, { color: isMember ? colors.primaryForeground : colors.text }]}>{message.body}</Text>
                <Text style={[styles.time, { color: isMember ? `${colors.primaryForeground}B8` : colors.textMuted }]}>
                  {new Date(message.created_at).toLocaleString()}
                </Text>
              </View>
            </View>
          );
        })}
        {error ? <Text style={[styles.error, { color: colors.sell }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message support…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
          accessibilityLabel="Support message"
        />
        <TouchableOpacity
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
          style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.buy : colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Send support message"
        >
          {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="arrow-up" size={19} color={draft.trim() ? colors.primaryForeground : colors.textMuted} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  iconButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 2, fontSize: 11, fontFamily: 'Inter_400Regular' },
  messages: { flex: 1 },
  messageList: { padding: 16, gap: 13, flexGrow: 1 },
  privacyBanner: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  loader: { marginTop: 30 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 42, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  emptyCopy: { maxWidth: 300, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  memberRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', borderWidth: 1, borderRadius: 16, padding: 12 },
  sender: { marginBottom: 5, fontSize: 10, fontFamily: 'Inter_700Bold' },
  messageText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  time: { marginTop: 7, fontSize: 9, fontFamily: 'Inter_400Regular' },
  error: { paddingHorizontal: 5, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  composer: { paddingHorizontal: 14, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, fontSize: 13, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
