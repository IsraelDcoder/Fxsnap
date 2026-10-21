import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
  getSupportContext,
  getSupportConversation,
  sendSupportChatMessage,
  subscribeToSupportConversation,
  type SupportChatMessage,
  type SupportTopic,
} from '@/services/supportChat';

const TOPICS: Array<{ id: SupportTopic; title: string; icon: React.ComponentProps<typeof Feather>['name'] }> = [
  { id: 'account', title: 'Account', icon: 'user' },
  { id: 'billing', title: 'Subscription', icon: 'credit-card' },
  { id: 'analysis', title: 'Analysis', icon: 'bar-chart-2' },
  { id: 'navigation', title: 'Using the app', icon: 'compass' },
  { id: 'other', title: 'Other', icon: 'more-horizontal' },
];

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function SupportChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [topic, setTopic] = useState<SupportTopic>('other');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadConversation = useCallback(async (showError = true) => {
    try {
      const result = await getSupportConversation();
      setMessages((current) => {
        const currentLatest = current[current.length - 1]?.id;
        const nextLatest = result.messages[result.messages.length - 1]?.id;
        if (currentLatest && currentLatest === nextLatest && current.length === result.messages.length) return current;
        return result.messages;
      });
      setConversationId(result.conversation?.id ?? null);
      setConversationStatus(result.conversation?.status ?? null);
      if (result.conversation?.topic) setTopic(result.conversation.topic);
      setError('');
    } catch (loadError) {
      if (showError) setError(loadError instanceof Error ? loadError.message : 'Could not load your private support conversation.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConversation();
    const interval = setInterval(() => { void loadConversation(false); }, 5000);
    return () => clearInterval(interval);
  }, [loadConversation]);

  useEffect(() => {
    if (!conversationId) return undefined;
    try {
      return subscribeToSupportConversation(conversationId, () => { void loadConversation(false); });
    } catch (subscriptionError) {
      console.error('[Support] Could not start realtime updates; polling fallback remains active.', subscriptionError);
      return undefined;
    }
  }, [conversationId, loadConversation]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await sendSupportChatMessage(content, topic, getSupportContext());
      setMessages((current) => result.duplicate || current.some((message) => message.id === result.message.id)
        ? current
        : [...current, result.message]);
      setConversationStatus('open');
      setDraft('');
      await loadConversation(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const isNewConversation = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={goBack}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.avatar}>
            <Feather name="headphones" size={18} color="#FFFFFF" />
            <View style={[styles.onlineDot, { borderColor: colors.background }]} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>FXSnap Support</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Private conversation</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => { setRefreshing(true); void loadConversation(); }}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Refresh support messages"
        >
          <Feather name="refresh-cw" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.privacyBanner, { backgroundColor: `${colors.buy}10`, borderBottomColor: `${colors.buy}22` }]}>
        <Feather name="lock" size={13} color={colors.buy} />
        <Text style={[styles.privacyText, { color: colors.textSecondary }]}>Only you and authorized FXSnap support staff can see this chat.</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.conversation}
        contentContainerStyle={[styles.conversationContent, messages.length === 0 && styles.emptyContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.buy} />
            <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>Opening your private inbox…</Text>
          </View>
        ) : isNewConversation ? (
          <View style={styles.welcome}>
            <View style={[styles.welcomeIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="message-circle" size={25} color={colors.buy} />
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>How can we help?</Text>
            <Text style={[styles.welcomeCopy, { color: colors.textSecondary }]}>
              Start a private conversation with our support team. Replies and your message history stay here in FXSnap.
            </Text>
            <Text style={[styles.topicHeading, { color: colors.text }]}>Choose a topic</Text>
            <View style={styles.topicList}>
              {TOPICS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setTopic(item.id)}
                  style={[
                    styles.topicChip,
                    {
                      backgroundColor: topic === item.id ? `${colors.buy}14` : colors.card,
                      borderColor: topic === item.id ? colors.buy : colors.cardBorder,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: topic === item.id }}
                >
                  <Feather name={item.icon} size={14} color={topic === item.id ? colors.buy : colors.textSecondary} />
                  <Text style={[styles.topicLabel, { color: topic === item.id ? colors.text : colors.textSecondary }]}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.conversationMeta}>
              <Text style={[styles.conversationDate, { color: colors.textMuted }]}>This conversation is private</Text>
              {conversationStatus ? (
                <View style={[styles.statusPill, { backgroundColor: `${colors.buy}12` }]}>
                  <View style={[styles.statusDot, { backgroundColor: conversationStatus === 'resolved' ? colors.textMuted : colors.buy }]} />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>{conversationStatus === 'resolved' ? 'Resolved' : conversationStatus === 'pending' ? 'Awaiting support' : 'Open'}</Text>
                </View>
              ) : null}
            </View>
            {messages.map((message) => {
              const isMember = message.sender_kind === 'member';
              return (
                <View key={message.id} style={[styles.messageRow, isMember && styles.memberMessageRow]}>
                  {!isMember ? (
                    <View style={[styles.messageAvatar, { backgroundColor: `${colors.buy}20` }]}>
                      <Feather name="headphones" size={13} color={colors.buy} />
                    </View>
                  ) : null}
                  <View style={styles.messageColumn}>
                    {!isMember ? <Text style={[styles.senderLabel, { color: colors.buy }]}>FXSNAP SUPPORT</Text> : null}
                    <View style={[
                      styles.messageBubble,
                      isMember
                        ? { backgroundColor: colors.buy, borderBottomRightRadius: 5 }
                        : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}>
                      <Text style={[styles.messageText, { color: isMember ? colors.primaryForeground : colors.text }]}>{message.body}</Text>
                    </View>
                    <Text style={[styles.messageTime, { color: colors.textMuted, textAlign: isMember ? 'right' : 'left' }]}>
                      {formatMessageTime(message.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: `${colors.sell}12`, borderColor: `${colors.sell}55` }]}>
            <Feather name="alert-circle" size={15} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.sell }]}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.cardBorder, backgroundColor: colors.background }]}>
        {isNewConversation && !loading ? (
          <Text style={[styles.topicSelectedLabel, { color: colors.textMuted }]}>
            Topic: {TOPICS.find((item) => item.id === topic)?.title}
          </Text>
        ) : null}
        <View style={[styles.composer, { backgroundColor: colors.input, borderColor: colors.cardBorder }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a private message…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
            multiline
            maxLength={2000}
            editable={!loading && !sending}
            onSubmitEditing={() => void sendMessage()}
            blurOnSubmit={false}
            accessibilityLabel="Private support message"
          />
          <TouchableOpacity
            onPress={() => void sendMessage()}
            disabled={sending || loading || !draft.trim()}
            style={[styles.sendButton, { backgroundColor: colors.buy, opacity: sending || loading || !draft.trim() ? 0.48 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Send private support message"
          >
            {sending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up" size={19} color={colors.primaryForeground} />}
          </TouchableOpacity>
        </View>
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Never send passwords, full card numbers, or verification codes.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 66, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#168779', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', width: 10, height: 10, right: -2, bottom: -2, borderRadius: 5, borderWidth: 2, backgroundColor: '#2DB77A' },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { marginTop: 2, fontSize: 10, fontFamily: 'Inter_400Regular' },
  privacyBanner: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  privacyText: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  conversation: { flex: 1 },
  conversationContent: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 22, flexGrow: 1 },
  emptyContent: { justifyContent: 'center' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  welcome: { flex: 1, justifyContent: 'center', paddingVertical: 20 },
  welcomeIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  welcomeTitle: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  welcomeCopy: { marginTop: 8, fontSize: 12, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  topicHeading: { marginTop: 21, marginBottom: 9, fontSize: 11, fontFamily: 'Inter_700Bold' },
  topicList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderWidth: 1, borderRadius: 13 },
  topicLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  conversationMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  conversationDate: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  statusPill: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 10 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 13, paddingRight: 25 },
  memberMessageRow: { justifyContent: 'flex-end', paddingRight: 0, paddingLeft: 32 },
  messageAvatar: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  messageColumn: { maxWidth: '88%' },
  senderLabel: { marginBottom: 4, fontSize: 7, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  messageBubble: { borderWidth: 1, borderRadius: 17, borderBottomLeftRadius: 5, paddingVertical: 10, paddingHorizontal: 12 },
  messageText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  messageTime: { marginTop: 4, fontSize: 8, fontFamily: 'Inter_400Regular' },
  emptyCopy: { textAlign: 'center', fontSize: 11, fontFamily: 'Inter_400Regular' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 10 },
  errorText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  topicSelectedLabel: { marginBottom: 7, fontSize: 9, fontFamily: 'Inter_500Medium' },
  composerWrap: { paddingHorizontal: 14, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { minHeight: 50, maxHeight: 130, flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 18, padding: 5 },
  input: { flex: 1, maxHeight: 114, minHeight: 38, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { marginTop: 7, textAlign: 'center', fontSize: 8, fontFamily: 'Inter_400Regular' },
});
