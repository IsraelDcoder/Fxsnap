import React, { useCallback, useEffect, useState } from 'react';
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
  getCommunityAdminConversation,
  getCommunityAdminReports,
  getCommunityAdminSupportInbox,
  moderateCommunity,
  sendCommunityAdminReply,
  setCommunitySupportStatus,
  updateCommunityAdminReport,
  type CommunityAdminConversation,
  type CommunityAdminReport,
  type CommunitySupportMessage,
} from '@/services/community';

type AdminMessage = CommunitySupportMessage & { sender_account_id: string };
type AdminTab = 'reports' | 'support';

export default function CommunityAdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<AdminTab>('reports');
  const [reports, setReports] = useState<CommunityAdminReport[]>([]);
  const [conversations, setConversations] = useState<CommunityAdminConversation[]>([]);
  const [selected, setSelected] = useState<CommunityAdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadQueues = useCallback(async () => {
    setError('');
    try {
      const [reportResult, supportResult] = await Promise.all([
        getCommunityAdminReports(),
        getCommunityAdminSupportInbox(),
      ]);
      setReports(reportResult.reports);
      setConversations(supportResult.conversations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the admin queues.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (conversation: CommunityAdminConversation) => {
    setSelected(conversation);
    setError('');
    try {
      const result = await getCommunityAdminConversation(conversation.id);
      setMessages(result.messages);
      setSelected((current) => current ? { ...current, status: result.conversation.status } : current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this support conversation.');
    }
  }, []);

  useEffect(() => { void loadQueues(); }, [loadQueues]);

  const updateReport = async (report: CommunityAdminReport, status: 'reviewing' | 'resolved' | 'dismissed') => {
    setError('');
    try {
      await updateCommunityAdminReport(report.id, status);
      await loadQueues();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update the report.');
    }
  };

  const removeReportedPost = async (report: CommunityAdminReport) => {
    setError('');
    try {
      await moderateCommunity({
        action: 'remove_message',
        messageId: report.message_id,
        explanation: `Removed after review of report ${report.id}.`,
      });
      await updateCommunityAdminReport(report.id, 'resolved');
      await loadQueues();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not remove the reported post.');
    }
  };

  const setStatus = async (status: 'open' | 'in_progress' | 'resolved') => {
    if (!selected) return;
    setError('');
    try {
      await setCommunitySupportStatus(selected.id, status);
      setSelected({ ...selected, status });
      await loadQueues();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update the conversation.');
    }
  };

  const sendReply = async () => {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await sendCommunityAdminReply(selected.id, draft.trim());
      setMessages((current) => result.duplicate || current.some((message) => message.id === result.message.id)
        ? current
        : [...current, { ...result.message, sender_account_id: '' }]);
      setDraft('');
      await loadQueues();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send the support reply.');
    } finally {
      setSending(false);
    }
  };

  const closeConversation = () => {
    setSelected(null);
    setMessages([]);
    setDraft('');
  };

  const reportQueue = reports.length ? reports.map((report) => (
    <View key={report.id} style={[styles.queueCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.reportHeading}>
        <Text style={[styles.reportReason, { color: colors.text }]}>{report.reason.replace('_', ' ')}</Text>
        <Text style={[styles.reportStatus, { color: colors.buy }]}>{report.status}</Text>
      </View>
      <Text style={[styles.reportDetail, { color: colors.textSecondary }]}>
        Target account: {report.target_account_id}{'\n'}Message: {report.message_id}
      </Text>
      {report.explanation ? <Text style={[styles.reportExplanation, { color: colors.text }]}>{report.explanation}</Text> : null}
      <Text style={[styles.time, { color: colors.textMuted }]}>{new Date(report.created_at).toLocaleString()}</Text>
      <View style={styles.actionRow}>
        {report.status === 'open' ? <QueueAction label="Review" onPress={() => void updateReport(report, 'reviewing')} colors={colors} /> : null}
        <QueueAction label="Dismiss" onPress={() => void updateReport(report, 'dismissed')} colors={colors} />
        <QueueAction label="Remove post" destructive onPress={() => void removeReportedPost(report)} colors={colors} />
        <QueueAction label="Resolve" onPress={() => void updateReport(report, 'resolved')} colors={colors} />
      </View>
    </View>
  )) : <EmptyQueue title="No open reports" body="New member reports will appear here for review." colors={colors} />;
  const supportQueue = conversations.length ? conversations.map((conversation) => (
    <TouchableOpacity
      key={conversation.id}
      onPress={() => void loadConversation(conversation)}
      style={[styles.queueCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
    >
      <View style={styles.reportHeading}>
        <Text style={[styles.reportReason, { color: colors.text }]}>@{conversation.username}</Text>
        <Text style={[styles.reportStatus, { color: conversation.status === 'resolved' ? colors.textMuted : colors.buy }]}>{conversation.status.replace('_', ' ')}</Text>
      </View>
      <Text style={[styles.reportDetail, { color: colors.textSecondary }]}>Updated {new Date(conversation.updated_at).toLocaleString()}</Text>
      <Text style={[styles.openConversation, { color: colors.buy }]}>
        Open private conversation <Feather name="arrow-right" size={12} color={colors.buy} />
      </Text>
    </TouchableOpacity>
  )) : <EmptyQueue title="No open support conversations" body="Private support requests will appear here." colors={colors} />;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => selected ? closeConversation() : router.back()} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel={selected ? 'Back to admin inbox' : 'Go back'}>
          <Feather name={selected ? 'arrow-left' : 'x'} size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>{selected ? `@${selected.username}` : 'Community Admin'}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{selected ? `Private support · ${selected.status.replace('_', ' ')}` : 'Reports and private support'}</Text>
        </View>
        <TouchableOpacity onPress={() => { setLoading(true); void loadQueues(); }} style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} accessibilityLabel="Refresh admin queues">
          <Feather name="refresh-cw" size={17} color={colors.text} />
        </TouchableOpacity>
      </View>

      {selected ? (
        <>
          <View style={styles.statusRow}>
            {(['open', 'in_progress', 'resolved'] as const).map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => void setStatus(status)}
                style={[
                  styles.statusButton,
                  { backgroundColor: selected.status === status ? `${colors.buy}20` : colors.card, borderColor: selected.status === status ? colors.buy : colors.cardBorder },
                ]}
              >
                <Text style={[styles.statusText, { color: selected.status === status ? colors.buy : colors.textSecondary }]}>{status.replace('_', ' ')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void loadConversation(selected); }} tintColor={colors.buy} />}
          >
            <View style={[styles.privateNotice, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="lock" size={14} color={colors.buy} />
              <Text style={[styles.privateText, { color: colors.textSecondary }]}>Private conversation for @{selected.username} · account {selected.account_id}</Text>
            </View>
            {messages.map((message) => {
              const isAdmin = message.sender_kind === 'admin';
              return (
                <View key={message.id} style={[styles.messageRow, isAdmin && styles.memberRow]}>
                  <View style={[styles.bubble, { backgroundColor: isAdmin ? colors.buy : colors.card, borderColor: isAdmin ? colors.buy : colors.cardBorder }]}>
                    <Text style={[styles.sender, { color: isAdmin ? colors.primaryForeground : colors.buy }]}>{isAdmin ? 'FXSnap Support' : `@${selected.username}`}</Text>
                    <Text style={[styles.messageText, { color: isAdmin ? colors.primaryForeground : colors.text }]}>{message.body}</Text>
                    <Text style={[styles.time, { color: isAdmin ? `${colors.primaryForeground}B8` : colors.textMuted }]}>{new Date(message.created_at).toLocaleString()}</Text>
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
              placeholder="Reply privately…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }]}
              accessibilityLabel="Private support reply"
            />
            <TouchableOpacity onPress={() => void sendReply()} disabled={!draft.trim() || sending} style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.buy : colors.surface }]} accessibilityLabel="Send private reply">
              {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="arrow-up" size={19} color={draft.trim() ? colors.primaryForeground : colors.textMuted} />}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.tabs, { borderBottomColor: colors.cardBorder }]}>
            <TouchableOpacity onPress={() => setTab('reports')} style={[styles.tab, tab === 'reports' && { borderBottomColor: colors.buy }]}>
              <Text style={[styles.tabText, { color: tab === 'reports' ? colors.text : colors.textMuted }]}>Reports ({reports.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('support')} style={[styles.tab, tab === 'support' && { borderBottomColor: colors.buy }]}>
              <Text style={[styles.tabText, { color: tab === 'support' ? colors.text : colors.textMuted }]}>Support ({conversations.length})</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.queueList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); void loadQueues(); }} tintColor={colors.buy} />}
          >
            {loading && reports.length === 0 && conversations.length === 0 ? <ActivityIndicator color={colors.buy} style={styles.loader} /> : null}
            {tab === 'reports' ? reportQueue : supportQueue}
            {error ? <Text style={[styles.error, { color: colors.sell }]}>{error}</Text> : null}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function QueueAction({ label, onPress, colors, destructive = false }: { label: string; onPress: () => void; colors: ReturnType<typeof useColors>; destructive?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.actionButton, { borderColor: destructive ? `${colors.sell}70` : colors.cardBorder }]}>
      <Text style={[styles.actionText, { color: destructive ? colors.sell : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyQueue({ title, body, colors }: { title: string; body: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.empty}>
      <Feather name="shield" size={26} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  iconButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 2, fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  tabs: { height: 48, paddingHorizontal: 20, flexDirection: 'row', gap: 24, borderBottomWidth: 1 },
  tab: { justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  queueList: { padding: 15, paddingBottom: 34, gap: 12, flexGrow: 1 },
  loader: { marginTop: 35 },
  queueCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  reportHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reportReason: { fontSize: 13, fontFamily: 'Inter_700Bold', textTransform: 'capitalize' },
  reportStatus: { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'capitalize' },
  reportDetail: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  reportExplanation: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
  actionButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  actionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  openConversation: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  statusRow: { padding: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  statusButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  statusText: { fontSize: 10, textTransform: 'capitalize', fontFamily: 'Inter_600SemiBold' },
  messages: { flex: 1 },
  messageList: { padding: 15, gap: 12, flexGrow: 1 },
  privateNotice: { borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  privateText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  memberRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', borderWidth: 1, borderRadius: 15, padding: 11 },
  sender: { marginBottom: 5, fontSize: 10, fontFamily: 'Inter_700Bold' },
  messageText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  time: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  composer: { paddingHorizontal: 14, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, fontSize: 13, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  empty: { flex: 1, minHeight: 210, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  emptyCopy: { maxWidth: 280, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
