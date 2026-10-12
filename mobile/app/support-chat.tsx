import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { sendSupportChatMessage, type SupportChatMessage } from '@/services/supportChat';

const SUGGESTIONS = [
  'How do I analyze a chart?',
  'Help with my account',
  'Question about subscriptions',
];

export default function SupportChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending, error]);

  const requestReply = async (conversation: SupportChatMessage[]) => {
    setSending(true);
    setError('');
    try {
      const reply = await sendSupportChatMessage(conversation);
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (text = draft) => {
    const content = text.trim();
    if (!content || sending) return;
    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setDraft('');
    await requestReply(nextMessages);
  };

  const retry = () => {
    if (sending || messages[messages.length - 1]?.role !== 'user') return;
    void requestReply(messages);
  };

  const contactByEmail = () => {
    void Linking.openURL(`mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app'}`).catch(() => {
      setError(`Unable to open email. Contact ${process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@fxsnap.app'} directly.`);
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/home');
          }}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.avatar}>
            <Feather name="headphones" size={18} color={colors.primaryForeground} />
            <View style={[styles.onlineDot, { borderColor: colors.background }]} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Customer Care</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>FXSnap AI assistant</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={contactByEmail}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Email customer support"
        >
          <Feather name="mail" size={17} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.conversation}
        contentContainerStyle={styles.conversationContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.welcome}>
            <View style={[styles.welcomeIcon, { backgroundColor: `${colors.buy}20` }]}>
              <Feather name="message-circle" size={26} color={colors.buy} />
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>Hi there! How can we help?</Text>
            <Text style={[styles.welcomeCopy, { color: colors.textSecondary }]}>
              Ask me about using FXSnap, chart analysis, your account, or subscriptions. For private account or billing actions, I can help connect you with our support team.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  onPress={() => void sendMessage(suggestion)}
                  disabled={sending}
                  style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
                  <Feather name="arrow-up-right" size={14} color={colors.buy} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <View key={`${index}-${message.role}`} style={[styles.messageRow, isUser && styles.userMessageRow]}>
                {!isUser ? (
                  <View style={[styles.messageAvatar, { backgroundColor: `${colors.buy}20` }]}>
                    <Feather name="headphones" size={14} color={colors.buy} />
                  </View>
                ) : null}
                <View style={[
                  styles.messageBubble,
                  isUser
                    ? { backgroundColor: colors.buy }
                    : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}>
                  <Text style={[styles.messageText, { color: isUser ? colors.primaryForeground : colors.text }]}>{message.content}</Text>
                </View>
              </View>
            );
          })
        )}
        {sending ? (
          <View style={styles.typingRow}>
            <View style={[styles.messageAvatar, { backgroundColor: `${colors.buy}20` }]}>
              <Feather name="headphones" size={14} color={colors.buy} />
            </View>
            <View style={[styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <ActivityIndicator size="small" color={colors.buy} />
              <Text style={[styles.typingText, { color: colors.textSecondary }]}>Customer Care is replying…</Text>
            </View>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: `${colors.sell}12`, borderColor: `${colors.sell}55` }]}>
            <Text style={[styles.errorText, { color: colors.sell }]}>{error}</Text>
            <TouchableOpacity onPress={retry} accessibilityRole="button">
              <Text style={[styles.retryText, { color: colors.sell }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>AI assistant · Never share passwords or payment details</Text>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.cardBorder, backgroundColor: colors.background }]}>
        <View style={[styles.composer, { backgroundColor: colors.input, borderColor: colors.cardBorder }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Customer Care…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text }]}
            multiline
            maxLength={1500}
            editable={!sending}
            onSubmitEditing={() => void sendMessage()}
            blurOnSubmit={false}
            accessibilityLabel="Message Customer Care"
          />
          <TouchableOpacity
            onPress={() => void sendMessage()}
            disabled={sending || !draft.trim()}
            style={[styles.sendButton, { backgroundColor: colors.buy, opacity: sending || !draft.trim() ? 0.48 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Feather name="arrow-up" size={19} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
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
  conversation: { flex: 1 },
  conversationContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 22, flexGrow: 1 },
  welcome: { flex: 1, justifyContent: 'center', paddingBottom: 22 },
  welcomeIcon: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  welcomeTitle: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_700Bold' },
  welcomeCopy: { marginTop: 8, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  suggestions: { gap: 9, marginTop: 22 },
  suggestion: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14 },
  suggestionText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14, paddingRight: 28 },
  userMessageRow: { justifyContent: 'flex-end', paddingRight: 0, paddingLeft: 38 },
  messageAvatar: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  messageBubble: { maxWidth: '88%', borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 5, paddingVertical: 11, paddingHorizontal: 13 },
  messageText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  typingBubble: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12 },
  typingText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, gap: 8 },
  errorText: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  retryText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  disclaimer: { marginTop: 8, fontSize: 9, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  composerWrap: { paddingHorizontal: 14, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { minHeight: 50, maxHeight: 130, flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 18, padding: 5 },
  input: { flex: 1, maxHeight: 114, minHeight: 38, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
