import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  createEventSpace,
  getAdminEventSpaceAccess,
  getAdminEventSpaces,
  getEventHosts,
  manageEventLifecycle,
  transitionEventSpace,
  updateEventSpace,
  type EventHost,
  type EventSpace,
  type EventSpaceDraft,
} from '@/services/eventSpaces';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function labelForStatus(status: EventSpace['status']) {
  return status === 'waiting_room_open' ? 'Waiting room' : status.replaceAll('_', ' ');
}

export default function EventsAdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [spaces, setSpaces] = useState<EventSpace[]>([]);
  const [hosts, setHosts] = useState<EventHost[]>([]);
  const [selectedHost, setSelectedHost] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EventSpace | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [waitingLead, setWaitingLead] = useState('15');
  const [duration, setDuration] = useState('60');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [allowSpeakingRequests, setAllowSpeakingRequests] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [featured, setFeatured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const access = await getAdminEventSpaceAccess();
      setAllowed(access.allowed);
      if (!access.allowed) return;
      const [spaceResult, hostResult] = await Promise.all([getAdminEventSpaces(), getEventHosts()]);
      setSpaces(spaceResult.spaces);
      setHosts(hostResult.hosts);
      setSelectedHost((current) => current || access.accountId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Event management could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setTopic('');
    setScheduledLocal('');
    setWaitingLead('15');
    setDuration('60');
    setVisibility('public');
    setAllowSpeakingRequests(false);
    setCommentsEnabled(true);
    setFeatured(false);
  };

  const editSpace = (space: EventSpace) => {
    setEditing(space);
    setTitle(space.title);
    setDescription(space.description);
    setTopic(space.topic);
    setScheduledLocal(localDateTime(space.scheduled_at));
    setWaitingLead(space.scheduled_at && space.waiting_room_opens_at
      ? String(Math.max(0, Math.round((Date.parse(space.scheduled_at) - Date.parse(space.waiting_room_opens_at)) / 60_000)))
      : '15');
    setDuration(space.duration_minutes ? String(space.duration_minutes) : '');
    setVisibility(space.visibility);
    setAllowSpeakingRequests(space.allow_speaking_requests);
    setCommentsEnabled(space.comments_enabled);
    setFeatured(space.featured);
    setSelectedHost(space.host_account_id);
  };

  const save = async (status: 'draft' | 'scheduled') => {
    if (saving) return;
    setError('');
    if (!title.trim() || title.trim().length < 3 || !topic.trim()) {
      setError('Add a space name and topic before saving.');
      return;
    }
    let scheduledAt: string | null = null;
    let waitingRoomOpensAt: string | null = null;
    if (status === 'scheduled' || scheduledLocal.trim()) {
      const parsed = new Date(scheduledLocal);
      if (!scheduledLocal.trim() || !Number.isFinite(parsed.getTime())) {
        setError('Enter a valid session date and time.');
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        setError('The scheduled start must be in the future.');
        return;
      }
      const lead = Number(waitingLead);
      if (!Number.isInteger(lead) || lead < 0 || lead > 10080) {
        setError('Waiting-room lead time must be between 0 and 10,080 minutes.');
        return;
      }
      scheduledAt = parsed.toISOString();
      waitingRoomOpensAt = new Date(parsed.getTime() - lead * 60_000).toISOString();
    }
    const durationMinutes = duration.trim() ? Number(duration) : null;
    if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480)) {
      setError('Expected duration must be between 5 and 480 minutes.');
      return;
    }

    const input: EventSpaceDraft = {
      title: title.trim(),
      description: description.trim(),
      topic: topic.trim(),
      visibility,
      hostAccountId: selectedHost || undefined,
      scheduledAt,
      timezone,
      waitingRoomOpensAt,
      durationMinutes,
      allowSpeakingRequests,
      commentsEnabled,
      featured,
      status,
    };
    setSaving(true);
    try {
      if (editing) {
        const { status: _status, ...changes } = input;
        await updateEventSpace(editing.id, changes);
        if (editing.status === 'draft' && status === 'scheduled') {
          await transitionEventSpace(editing.id, 'publish');
        }
      } else {
        await createEventSpace(input);
      }
      resetForm();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this event space.');
    } finally {
      setSaving(false);
    }
  };

  const transition = async (space: EventSpace, action: 'publish' | 'open_waiting_room' | 'cancel' | 'archive') => {
    setError('');
    try {
      await transitionEventSpace(space.id, action);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update this event space.');
    }
  };

  const setLiveState = async (space: EventSpace, action: 'start_live' | 'end_live') => {
    setError('');
    try {
      await manageEventLifecycle(space.id, action);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not control the LiveKit room.');
    }
  };

  const confirmTransition = (space: EventSpace, action: 'cancel' | 'archive') => {
    const label = action === 'cancel' ? 'Cancel session' : 'Archive session';
    Alert.alert(label, `Are you sure you want to ${action} “${space.title}”?`, [
      { text: 'Keep session', style: 'cancel' },
      { text: label, style: action === 'cancel' ? 'destructive' : 'default', onPress: () => void transition(space, action) },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Events management</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Create and schedule FXSnap spaces</Text>
        </View>
        <TouchableOpacity onPress={() => void load()} style={styles.backButton} accessibilityLabel="Refresh events">
          <Feather name="refresh-cw" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={styles.loader} color={colors.buy} /> : !allowed ? (
        <View style={styles.denied}>
          <Feather name="lock" size={25} color={colors.textMuted} />
          <Text style={[styles.deniedTitle, { color: colors.text }]}>Admin access required</Text>
          <Text style={[styles.deniedCopy, { color: colors.textSecondary }]}>Only authorized FXSnap administrators can manage event spaces.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.error, { color: colors.sell, backgroundColor: `${colors.sell}10` }]}>{error}</Text> : null}

          <View style={styles.metrics}>
            <Metric label="Total" value={spaces.length} colors={colors} />
            <Metric label="Live" value={spaces.filter((space) => space.status === 'live').length} colors={colors} />
            <Metric label="Scheduled" value={spaces.filter((space) => space.status === 'scheduled').length} colors={colors} />
            <Metric label="Needs attention" value={spaces.filter((space) => space.status === 'waiting_room_open').length} colors={colors} />
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.formHeading}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{editing ? 'Edit space' : 'Create a space'}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Save a draft or publish a scheduled session.</Text>
              </View>
              {editing ? (
                <TouchableOpacity onPress={resetForm} accessibilityLabel="Cancel editing">
                  <Feather name="x" size={19} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Field label="Space name" value={title} onChangeText={setTitle} placeholder="e.g. Gold market breakdown" colors={colors} />
            <Field label="Topic / category" value={topic} onChangeText={setTopic} placeholder="e.g. XAUUSD, Market insights" colors={colors} />
            <Field label="Description" value={description} onChangeText={setDescription} placeholder="What will traders learn or discuss?" colors={colors} multiline />

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Host</Text>
            <View style={styles.hostChoices}>
              {hosts.map((host) => (
                <TouchableOpacity
                  key={host.accountId}
                  onPress={() => setSelectedHost(host.accountId)}
                  style={[styles.choice, { borderColor: selectedHost === host.accountId ? colors.buy : colors.cardBorder, backgroundColor: selectedHost === host.accountId ? `${colors.buy}12` : colors.background }]}
                >
                  <Text style={[styles.choiceText, { color: selectedHost === host.accountId ? colors.buy : colors.text }]} numberOfLines={1}>@{host.username}</Text>
                </TouchableOpacity>
              ))}
              {!hosts.length ? <Text style={[styles.helper, { color: colors.textSecondary }]}>No active Community host profiles were found.</Text> : null}
            </View>

            <Field label="Local session date and time" value={scheduledLocal} onChangeText={setScheduledLocal} placeholder="YYYY-MM-DDTHH:mm" colors={colors} />
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Times use {timezone}. Leave empty to save an unscheduled draft.</Text>
            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Field label="Waiting room lead (min)" value={waitingLead} onChangeText={setWaitingLead} placeholder="15" colors={colors} keyboardType="number-pad" />
              </View>
              <View style={styles.inlineField}>
                <Field label="Duration (min)" value={duration} onChangeText={setDuration} placeholder="60" colors={colors} keyboardType="number-pad" />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Visibility</Text>
            <View style={styles.optionRow}>
              <Choice label="Public" active={visibility === 'public'} onPress={() => setVisibility('public')} colors={colors} />
              <Choice label="Private" active={visibility === 'private'} onPress={() => setVisibility('private')} colors={colors} />
            </View>
            <Toggle label="Allow speaking requests" value={allowSpeakingRequests} onChange={setAllowSpeakingRequests} colors={colors} />
            <Toggle label="Enable comments" value={commentsEnabled} onChange={setCommentsEnabled} colors={colors} />
            <Toggle label="Feature this space" value={featured} onChange={setFeatured} colors={colors} />
            <View style={[styles.audioNotice, { backgroundColor: colors.surface }]}>
              <Feather name="headphones" size={15} color={colors.textSecondary} />
              <Text style={[styles.audioNoticeText, { color: colors.textSecondary }]}>LiveKit audio starts after you open the waiting room. Listeners join muted and hosts can admit listeners or approve speakers.</Text>
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity disabled={saving} onPress={() => void save('draft')} style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}>
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Save draft</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={saving} onPress={() => void save('scheduled')} style={[styles.primaryButton, { backgroundColor: colors.buy }]}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{editing?.status === 'draft' ? 'Publish & schedule' : editing ? 'Save changes' : 'Schedule'}</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.listHeading}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Manage spaces</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>{spaces.length} stored session{spaces.length === 1 ? '' : 's'}</Text>
          </View>
          {spaces.length ? spaces.map((space) => (
            <View key={space.id} style={[styles.spaceCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.spaceTop}>
                <View style={styles.spaceTitleCopy}>
                  <Text style={[styles.spaceTitle, { color: colors.text }]}>{space.title}</Text>
                  <Text style={[styles.spaceMeta, { color: colors.textSecondary }]}>{space.topic} · @{space.host_name}</Text>
                </View>
                <Text style={[styles.status, { color: space.status === 'live' ? colors.sell : colors.buy }]}>{labelForStatus(space.status)}</Text>
              </View>
              <Text style={[styles.spaceMeta, { color: colors.textSecondary }]}>
                {space.scheduled_at ? new Date(space.scheduled_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: space.timezone }) : 'No scheduled start'}
              </Text>
              <View style={styles.actionRow}>
                {['draft', 'scheduled'].includes(space.status) ? (
                  <Action label="Edit" icon="edit-2" onPress={() => editSpace(space)} colors={colors} />
                ) : null}
                {space.status === 'draft' ? <Action label="Publish" icon="send" onPress={() => void transition(space, 'publish')} colors={colors} /> : null}
                {space.status === 'scheduled' ? <Action label="Open waiting room" icon="users" onPress={() => void transition(space, 'open_waiting_room')} colors={colors} /> : null}
                {['draft', 'scheduled', 'waiting_room_open'].includes(space.status) ? (
                  <Action label="Cancel" icon="x-circle" onPress={() => confirmTransition(space, 'cancel')} colors={colors} destructive />
                ) : null}
                {['ended', 'cancelled'].includes(space.status) ? (
                  <Action label="Archive" icon="archive" onPress={() => confirmTransition(space, 'archive')} colors={colors} />
                ) : null}
                {space.status === 'waiting_room_open' ? (
                  <Action label="Start LiveKit room" icon="mic" onPress={() => void setLiveState(space, 'start_live')} colors={colors} />
                ) : null}
                {space.status === 'live' ? (
                  <>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: './event-room', params: { id: space.id } })}
                      style={[styles.action, { borderColor: colors.cardBorder }]}
                    >
                      <Feather name="headphones" size={13} color={colors.buy} />
                      <Text style={[styles.actionText, { color: colors.text }]}>Open room controls</Text>
                    </TouchableOpacity>
                    <Action label="End live session" icon="square" onPress={() => void setLiveState(space, 'end_live')} colors={colors} destructive />
                  </>
                ) : null}
              </View>
            </View>
          )) : (
            <View style={[styles.noSpaces, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="calendar" size={19} color={colors.textMuted} />
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>No event spaces have been created.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value, colors }: { label: string; value: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, colors, multiline = false, keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={multiline ? 1200 : 120}
        style={[styles.input, multiline && styles.multiline, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.background }]}
      />
    </View>
  );
}

function Choice({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, { borderColor: active ? colors.buy : colors.cardBorder, backgroundColor: active ? `${colors.buy}12` : colors.background }]}>
      <Text style={[styles.choiceText, { color: active ? colors.buy : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Toggle({ label, value, onChange, colors }: { label: string; value: boolean; onChange: (value: boolean) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity onPress={() => onChange(!value)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Text style={[styles.toggleText, { color: colors.text }]}>{label}</Text>
      <Feather name={value ? 'check-circle' : 'circle'} size={19} color={value ? colors.buy : colors.textMuted} />
    </TouchableOpacity>
  );
}

function Action({ label, icon, onPress, colors, destructive = false }: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.action, { borderColor: destructive ? `${colors.sell}50` : colors.cardBorder }]}>
      <Feather name={icon} size={13} color={destructive ? colors.sell : colors.buy} />
      <Text style={[styles.actionText, { color: destructive ? colors.sell : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingHorizontal: 5 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 2, fontSize: 10, fontFamily: 'Inter_400Regular' },
  loader: { marginTop: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  deniedTitle: { marginTop: 12, fontSize: 17, fontFamily: 'Inter_700Bold' },
  deniedCopy: { maxWidth: 280, marginTop: 6, textAlign: 'center', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  error: { marginHorizontal: 16, marginTop: 12, padding: 11, borderRadius: 11, overflow: 'hidden', fontSize: 11, fontFamily: 'Inter_500Medium' },
  metrics: { flexDirection: 'row', gap: 7, marginHorizontal: 14, marginTop: 13 },
  metric: { flex: 1, minHeight: 65, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13 },
  metricValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  metricLabel: { marginTop: 2, fontSize: 8, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  formCard: { margin: 14, padding: 14, borderWidth: 1, borderRadius: 18 },
  formHeading: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textTransform: 'capitalize' },
  cardSubtitle: { marginTop: 3, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  field: { marginTop: 11 },
  fieldLabel: { marginBottom: 5, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 40, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderRadius: 11, fontSize: 11, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 68, textAlignVertical: 'top' },
  hostChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 },
  choiceText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  helper: { marginTop: 4, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  inlineFields: { flexDirection: 'row', gap: 9 },
  inlineField: { flex: 1 },
  optionRow: { flexDirection: 'row', gap: 8 },
  toggle: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  audioNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: 11 },
  audioNoticeText: { flex: 1, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  primaryButton: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 12 },
  primaryButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  secondaryButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 11, paddingHorizontal: 13 },
  secondaryButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  listHeading: { marginHorizontal: 16, marginTop: 7, marginBottom: 10 },
  spaceCard: { marginHorizontal: 14, marginBottom: 9, padding: 12, borderWidth: 1, borderRadius: 15 },
  spaceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  spaceTitleCopy: { flex: 1 },
  spaceTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  spaceMeta: { marginTop: 5, fontSize: 9, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  status: { maxWidth: 100, fontSize: 8, textAlign: 'right', textTransform: 'uppercase', fontFamily: 'Inter_700Bold' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  action: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderWidth: 1, borderRadius: 9 },
  actionText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  actionNote: { flexBasis: '100%', fontSize: 9, fontFamily: 'Inter_400Regular' },
  noSpaces: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginHorizontal: 14, borderWidth: 1, borderRadius: 15 },
});
