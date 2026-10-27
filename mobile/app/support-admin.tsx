import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
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
  getSupportAdminConversation,
  getSupportAdminInbox,
  sendSupportAdminReply,
  updateSupportConversationStatus,
  type SupportAdminConversation,
  type SupportChatMessage,
  type SupportStatus,
} from '@/services/supportChat';

type AdminMessage = SupportChatMessage & { sender_account_id: string };
type InboxFilter = 'all' | SupportStatus;

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function topicLabel(topic: string | null) {
  return topic ? topic.replace('_', ' ') : 'not specified';
}

function AdminSupportMessage({
  message,
  fromAdmin,
  colors,
  onReply,
}: {
  message: AdminMessage;
  fromAdmin: boolean;
  colors: ReturnType<typeof useColors>;
  onReply: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      gesture.dx > 18 && gesture.dx > Math.abs(gesture.dy) * 1.25
    ),
    onPanResponderMove: (_event, gesture) => {
      translateX.setValue(Math.min(68, Math.max(0, gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx >= 64) onReply();
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }).start();
    },
  }), [onReply, translateX]);
  const indicatorStyle = {
    opacity: translateX.interpolate({ inputRange: [0, 32, 64], outputRange: [0, 0.6, 1], extrapolate: 'clamp' as const }),
  };

  return (
    <View style={styles.messageGestureContainer}>
      <Animated.View pointerEvents="none" style={[styles.replyGestureIndicator, indicatorStyle]}>
        <Feather name="corner-up-left" size={17} color={colors.buy} />
      </Animated.View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.messageRow,
          fromAdmin && styles.adminMessageRow,
          { transform: [{ translateX }] },
        ]}
      >
        <View style={[
          styles.messageBubble,
          fromAdmin
            ? { backgroundColor: colors.buy }
            : { backgroundColor: colors.card, borderColor: colors.cardBorder },
        ]}>
          <Text style={[styles.messageText, { color: fromAdmin ? colors.primaryForeground : colors.text }]}>{message.body}</Text>
          {message.attachment ? (
            <Image
              source={{ uri: message.attachment.url }}
              style={styles.messageImage}
              resizeMode="cover"
              accessibilityLabel="Image attached to support message"
            />
          ) : null}
          <Text style={[styles.messageTime, { color: fromAdmin ? `${colors.primaryForeground}B0` : colors.textMuted }]}>{formatTime(message.created_at)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SupportAdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<SupportAdminConversation[]>([]);
  const [selected, setSelected] = useState<SupportAdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<AdminMessage | null>(null);
  const [inputHeight, setInputHeight] = useState(33);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lastUnreadTotal = useRef<number | null>(null);
  const lastUnreadByConversation = useRef<Map<string, number>>(new Map());
  const messageScroll = useRef<ScrollView>(null);

  const loadInbox = useCallback(async (notify = true) => {
    try {
      const result = await getSupportAdminInbox(search);
      const nextTotal = result.conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
      const previousTotal = lastUnreadTotal.current;
      setConversations(result.conversations);
      const newlyUnread = result.conversations.find((conversation) => (
        conversation.unread_count > (lastUnreadByConversation.current.get(conversation.id) || 0)
      ));
      if (notify && previousTotal !== null && newlyUnread) {
        Alert.alert(
          'New FXSnap support message',
          `${newlyUnread.display_name || newlyUnread.account_id} sent a private support message.`,
          [{ text: 'View inbox' }],
        );
      }
      lastUnreadTotal.current = nextTotal;
      lastUnreadByConversation.current = new Map(result.conversations.map((conversation) => [conversation.id, conversation.unread_count]));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the support inbox.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadConversation = useCallback(async (conversation: SupportAdminConversation) => {
    setSelected(conversation);
    setReplyTarget(null);
    try {
      const result = await getSupportAdminConversation(conversation.id);
      setSelected({ ...conversation, ...result.conversation, unread_count: 0 });
      setMessages(result.messages);
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unread_count: 0 } : item));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this private conversation.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initial = setTimeout(() => { if (active) void loadInbox(false); }, 0);
    const poll = setInterval(() => { if (active) void loadInbox(); }, 4000);
    return () => { active = false; clearTimeout(initial); clearInterval(poll); };
  }, [loadInbox]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const poll = setInterval(() => {
      void getSupportAdminConversation(selected.id)
        .then((result) => {
          if (active) {
            setMessages(result.messages);
            setSelected((current) => current ? { ...current, ...result.conversation, unread_count: 0 } : current);
          }
        })
        .catch((pollError: unknown) => {
          if (active) setError(pollError instanceof Error ? pollError.message : 'Conversation refresh failed.');
        });
    }, 3000);
    return () => { active = false; clearInterval(poll); };
  }, [selected?.id]);

  useEffect(() => { messageScroll.current?.scrollToEnd({ animated: true }); }, [messages]);

  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => filter === 'all' || conversation.status === filter),
    [conversations, filter],
  );
  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unread_count, 0);

  const sendReply = async () => {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const quotedText = replyTarget
        ? (replyTarget.body.trim() || (replyTarget.attachment ? 'Photo attachment' : 'Message')).replace(/\s+/g, ' ').slice(0, 240)
        : '';
      const replyBody = replyTarget
        ? `Replying to ${replyTarget.sender_kind === 'admin' ? 'FXSnap Support' : selected.display_name || 'user'}:\n> ${quotedText}\n\n${draft.trim()}`
        : draft.trim();
      const result = await sendSupportAdminReply(selected.id, replyBody.slice(0, 2000));
      setMessages((current) => result.duplicate || current.some((message) => message.id === result.message.id)
        ? current
        : [...current, { ...result.message, sender_account_id: '' }]);
      setDraft('');
      setReplyTarget(null);
      setInputHeight(33);
      await loadInbox(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send the support reply.');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: SupportStatus) => {
    if (!selected) return;
    try {
      await updateSupportConversationStatus(selected.id, status);
      setSelected({ ...selected, status });
      await loadInbox(false);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not update the conversation status.');
    }
  };

  const goBack = () => {
    if (selected) {
      setSelected(null);
      setMessages([]);
      setDraft('');
      setReplyTarget(null);
      setInputHeight(33);
    } else if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={goBack}
          style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel={selected ? 'Back to support inbox' : 'Go back'}
        >
          <Feather name={selected ? 'arrow-left' : 'x'} size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>{selected ? (selected.display_name || 'Support conversation') : 'Support inbox'}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {selected ? `Private · ${selected.status}` : `${unreadTotal} unread · live updates`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setLoading(true); void loadInbox(false); }}
          style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Refresh support inbox"
        >
          <Feather name="refresh-cw" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: `${colors.sell}12`, borderColor: `${colors.sell}55` }]}>
          <Feather name="alert-circle" size={14} color={colors.sell} />
          <Text style={[styles.errorText, { color: colors.sell }]}>{error}</Text>
        </View>
      ) : null}

      {selected ? (
        <>
          <ScrollView
            ref={messageScroll}
            style={styles.conversation}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.contextCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.contextHeading, { color: colors.text }]}>ACCOUNT CONTEXT</Text>
              <Text selectable style={[styles.contextAccount, { color: colors.textSecondary }]}>{selected.account_id}</Text>
              <View style={styles.contextGrid}>
                <ContextItem label="SUBSCRIPTION" value={selected.subscription_status} colors={colors} />
                <ContextItem label="APP VERSION" value={selected.app_version || 'unknown'} colors={colors} />
                <ContextItem label="PLATFORM" value={selected.platform || 'unknown'} colors={colors} />
                <ContextItem label="TOPIC" value={topicLabel(selected.topic)} colors={colors} />
              </View>
            </View>
            {messages.map((message) => {
              const fromAdmin = message.sender_kind === 'admin';
              return (
                <AdminSupportMessage
                  key={message.id}
                  message={message}
                  fromAdmin={fromAdmin}
                  colors={colors}
                  onReply={() => setReplyTarget(message)}
                />
              );
            })}
          </ScrollView>
          <View style={[styles.statusBar, { borderTopColor: colors.cardBorder }]}>
            {FILTERS.filter((item) => item.value !== 'all').map((item) => (
              <TouchableOpacity
                key={item.value}
                onPress={() => void changeStatus(item.value as SupportStatus)}
                style={[
                  styles.statusButton,
                  {
                    backgroundColor: selected.status === item.value ? `${colors.buy}15` : colors.card,
                    borderColor: selected.status === item.value ? colors.buy : colors.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selected.status === item.value }}
              >
                <Text style={[styles.statusButtonText, { color: selected.status === item.value ? colors.buy : colors.textSecondary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.cardBorder }]}>
            {replyTarget ? (
              <View style={[styles.replyPreview, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={[styles.replyAccent, { backgroundColor: colors.buy }]} />
                <View style={styles.replyPreviewCopy}>
                  <Text style={[styles.replyPreviewTitle, { color: colors.buy }]}>
                    Replying to {replyTarget.sender_kind === 'admin' ? 'FXSnap Support' : selected.display_name || 'user'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.replyPreviewBody, { color: colors.textSecondary }]}>
                    {replyTarget.body.trim() || (replyTarget.attachment ? 'Photo attachment' : 'Message')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReplyTarget(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel quoted reply"
                  style={styles.cancelReply}
                >
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={[styles.composer, { backgroundColor: colors.input, borderColor: colors.cardBorder }]}>
              <TextInput
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  if (!value) setInputHeight(33);
                }}
                placeholder="Reply privately…"
                placeholderTextColor={colors.textMuted}
                maxLength={replyTarget ? 1700 : 2000}
                multiline
                scrollEnabled
                textAlignVertical="top"
                style={[styles.input, { color: colors.text, height: inputHeight }]}
                onContentSizeChange={(event) => {
                  setInputHeight(Math.max(33, Math.min(74, event.nativeEvent.contentSize.height)));
                }}
                accessibilityLabel="Private support reply"
              />
              <TouchableOpacity
                onPress={() => void sendReply()}
                disabled={!draft.trim() || sending}
                style={[styles.sendButton, { backgroundColor: colors.buy, opacity: !draft.trim() || sending ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Send support reply"
              >
                {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="arrow-up" size={18} color={colors.primaryForeground} />}
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name="search" size={15} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search users or messages"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              returnKeyType="search"
              accessibilityLabel="Search support conversations"
            />
            {search ? <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear support search"><Feather name="x" size={14} color={colors.textMuted} /></TouchableOpacity> : null}
          </View>
          <View style={styles.filterRow}>
            {FILTERS.map((item) => (
              <TouchableOpacity
                key={item.value}
                onPress={() => setFilter(item.value)}
                style={[styles.filterChip, { backgroundColor: filter === item.value ? colors.buy : colors.card, borderColor: filter === item.value ? colors.buy : colors.cardBorder }]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item.value }}
              >
                <Text style={[styles.filterText, { color: filter === item.value ? colors.primaryForeground : colors.textSecondary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView
            style={styles.inbox}
            contentContainerStyle={styles.inboxList}
            showsVerticalScrollIndicator={false}
          >
            {loading && conversations.length === 0 ? <ActivityIndicator color={colors.buy} style={styles.loading} /> : null}
            {!loading && filteredConversations.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: `${colors.buy}15` }]}><Feather name="inbox" size={23} color={colors.buy} /></View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No conversations found</Text>
                <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>New private messages from users will appear here.</Text>
              </View>
            ) : null}
            {filteredConversations.map((conversation) => (
              <TouchableOpacity
                key={conversation.id}
                onPress={() => void loadConversation(conversation)}
                style={[styles.conversationCard, { backgroundColor: colors.card, borderColor: conversation.unread_count ? `${colors.buy}75` : colors.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation from ${conversation.display_name || conversation.account_id}${conversation.unread_count ? `, ${conversation.unread_count} unread` : ''}`}
              >
                <View style={[styles.userAvatar, { backgroundColor: `${colors.buy}18` }]}>
                  <Feather name="user" size={17} color={colors.buy} />
                </View>
                <View style={styles.conversationCopy}>
                  <View style={styles.conversationTitleRow}>
                    <Text numberOfLines={1} style={[styles.conversationTitle, { color: colors.text }]}>{conversation.display_name || conversation.account_id}</Text>
                    <Text style={[styles.conversationTime, { color: colors.textMuted }]}>{formatTime(conversation.latest_message_at)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.conversationAccount, { color: colors.textMuted }]}>{conversation.account_id}</Text>
                  <Text numberOfLines={2} style={[styles.preview, { color: colors.textSecondary }]}>{conversation.latest_message || 'No messages yet'}</Text>
                  <View style={styles.conversationFoot}>
                    <Text style={[styles.topicTag, { color: colors.buy }]}>{topicLabel(conversation.topic)}</Text>
                    <Text style={[styles.statusLabel, { color: conversation.status === 'resolved' ? colors.textMuted : colors.textSecondary }]}>{conversation.status}</Text>
                  </View>
                </View>
                {conversation.unread_count > 0 ? (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.buy }]}>
                    <Text style={[styles.unreadText, { color: colors.primaryForeground }]}>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function ContextItem({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.contextItem}>
      <Text style={[styles.contextLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.contextValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 62, paddingHorizontal: 15, paddingBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 39, height: 39, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 3, fontSize: 9, fontFamily: 'Inter_400Regular' },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 15, marginTop: 9, padding: 10, borderWidth: 1, borderRadius: 12 },
  errorText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  searchBox: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 15, marginTop: 13, paddingHorizontal: 12, borderWidth: 1, borderRadius: 14 },
  searchInput: { flex: 1, minHeight: 40, fontSize: 11, fontFamily: 'Inter_400Regular' },
  filterRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 9 },
  filterChip: { minHeight: 29, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderRadius: 11 },
  filterText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  inbox: { flex: 1 },
  inboxList: { paddingHorizontal: 15, paddingBottom: 20, gap: 8 },
  loading: { marginTop: 30 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 55 },
  emptyIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 19, marginBottom: 13 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  emptyDescription: { marginTop: 6, fontSize: 10, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  conversationCard: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 11, borderWidth: 1, borderRadius: 16 },
  userAvatar: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  conversationCopy: { flex: 1 },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  conversationTitle: { flex: 1, fontSize: 11, fontFamily: 'Inter_700Bold' },
  conversationTime: { fontSize: 8, fontFamily: 'Inter_400Regular' },
  conversationAccount: { marginTop: 3, fontSize: 8, fontFamily: 'Inter_400Regular' },
  preview: { marginTop: 6, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  conversationFoot: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 },
  topicTag: { fontSize: 8, textTransform: 'capitalize', fontFamily: 'Inter_600SemiBold' },
  statusLabel: { fontSize: 8, textTransform: 'capitalize', fontFamily: 'Inter_500Medium' },
  unreadBadge: { minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 4 },
  unreadText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  conversation: { flex: 1 },
  messageList: { padding: 15, gap: 9 },
  contextCard: { padding: 12, borderWidth: 1, borderRadius: 15, marginBottom: 8 },
  contextHeading: { fontSize: 8, letterSpacing: 0.9, fontFamily: 'Inter_700Bold' },
  contextAccount: { marginTop: 5, fontSize: 9, fontFamily: 'Inter_400Regular' },
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 11 },
  contextItem: { width: '46%' },
  contextLabel: { fontSize: 7, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  contextValue: { marginTop: 3, fontSize: 9, textTransform: 'capitalize', fontFamily: 'Inter_600SemiBold' },
  messageGestureContainer: { position: 'relative', justifyContent: 'center' },
  replyGestureIndicator: { position: 'absolute', left: 10, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)' },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  adminMessageRow: { justifyContent: 'flex-end' },
  messageBubble: { maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 15 },
  messageText: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  messageImage: { width: 220, height: 180, marginTop: 7, borderRadius: 12, backgroundColor: '#D8DEDA' },
  messageTime: { marginTop: 5, textAlign: 'right', fontSize: 7, fontFamily: 'Inter_400Regular' },
  statusBar: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  statusButton: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderRadius: 11 },
  statusButtonText: { fontSize: 9, textTransform: 'capitalize', fontFamily: 'Inter_600SemiBold' },
  composerWrap: { paddingHorizontal: 10, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth },
  replyPreview: { minHeight: 48, flexDirection: 'row', alignItems: 'center', marginBottom: 7, borderWidth: 1, borderRadius: 13, overflow: 'hidden' },
  replyAccent: { width: 3, alignSelf: 'stretch' },
  replyPreviewCopy: { flex: 1, paddingHorizontal: 10, paddingVertical: 7 },
  replyPreviewTitle: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  replyPreviewBody: { marginTop: 3, fontSize: 9, fontFamily: 'Inter_400Regular' },
  cancelReply: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  composer: { minHeight: 42, maxHeight: 86, flexDirection: 'row', alignItems: 'flex-end', padding: 4, borderWidth: 1, borderRadius: 23 },
  input: { flex: 1, minHeight: 33, maxHeight: 74, paddingHorizontal: 9, paddingVertical: 7, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  sendButton: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
});
