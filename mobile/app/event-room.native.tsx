import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioSession, LiveKitRoom, registerGlobals, useLocalParticipant, useParticipants, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import { useColors } from '@/hooks/useColors';
import {
  getEventParticipants,
  getEventSpace,
  joinEventSpace,
  leaveEventSpace,
  manageEventLifecycle,
  moderateEventParticipant,
  requestToSpeak,
  type EventParticipant,
  type EventRoomAccess,
  type EventSpace,
} from '@/services/eventSpaces';

registerGlobals();

export default function EventRoomScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const [space, setSpace] = useState<EventSpace | null>(null);
  const [access, setAccess] = useState<EventRoomAccess | null>(null);
  const [roster, setRoster] = useState<EventParticipant[]>([]);
  const [ownStatus, setOwnStatus] = useState<EventParticipant['status'] | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [allowSpeakingRequests, setAllowSpeakingRequests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const joined = useRef(false);

  const refresh = useCallback(async () => {
    if (!id) {
      setError('This event room link is invalid.');
      setLoading(false);
      return;
    }
    try {
      const [spaceResult, participantResult] = await Promise.all([
        getEventSpace(id),
        getEventParticipants(id),
      ]);
      setSpace(spaceResult.space);
      setRoster(participantResult.roster);
      setOwnStatus(participantResult.ownStatus);
      setIsHost(participantResult.isHost);
      setAllowSpeakingRequests(participantResult.allowSpeakingRequests);

      if (participantResult.ownStatus === 'removed') {
        setAccess(null);
        setError('The host removed you from this event space.');
        return;
      }

      if (access?.status !== 'live') {
        const currentAccess = await joinEventSpace(id);
        joined.current = true;
        if (currentAccess.status === 'waiting') {
          setAccess((previous) => previous?.status === 'live' ? previous : currentAccess);
        } else if (currentAccess.status === 'live') {
          setAccess(currentAccess);
        }
      }
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect to this Events room.');
    } finally {
      setLoading(false);
    }
  }, [access, id]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(interval);
  }, [refresh]));

  useEffect(() => {
    void AudioSession.startAudioSession().catch((failure: unknown) => {
      console.error('[Events] Could not start the audio session.', failure);
    });
    return () => {
      void AudioSession.stopAudioSession().catch((failure: unknown) => {
        console.error('[Events] Could not stop the audio session.', failure);
      });
    };
  }, []);

  const leave = async () => {
    if (id && joined.current) {
      try {
        await leaveEventSpace(id);
      } catch (failure) {
        console.error('[Events] Could not leave the participant roster.', failure);
      }
      joined.current = false;
    }
    router.back();
  };

  const endSession = () => {
    if (!id) return;
    Alert.alert('End live session?', 'This closes the LiveKit room and disconnects everyone.', [
      { text: 'Keep live', style: 'cancel' },
      {
        text: 'End for everyone',
        style: 'destructive',
        onPress: () => {
          void manageEventLifecycle(id, 'end_live')
            .then(async () => {
              joined.current = false;
              router.back();
            })
            .catch((failure: unknown) => {
              Alert.alert('Could not end the session', failure instanceof Error ? failure.message : 'Try again.');
            });
        },
      },
    ]);
  };

  const startSession = async () => {
    if (!id || starting) return;
    setStarting(true);
    setError('');
    try {
      await manageEventLifecycle(id, 'start_live');
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start the LiveKit room.');
    } finally {
      setStarting(false);
    }
  };

  const role = access?.role;
  const canSpeak = role === 'host' || role === 'speaker' || ownStatus === 'speaker';
  const title = space?.title || 'Live Events room';
  const visibleParticipants = useMemo(() => roster.filter((participant) => (
    participant.status !== 'removed'
  )), [roster]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => void leave()} style={styles.headerButton} accessibilityLabel="Leave room">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {access?.status === 'live' ? 'LiveKit audio room' : 'Events waiting room'}
          </Text>
        </View>
        <View style={[styles.liveBadge, { backgroundColor: access?.status === 'live' ? `${colors.sell}12` : colors.surface }]}>
          <View style={[styles.liveDot, { backgroundColor: access?.status === 'live' ? colors.sell : colors.textMuted }]} />
          <Text style={[styles.liveLabel, { color: access?.status === 'live' ? colors.sell : colors.textSecondary }]}>
            {access?.status === 'live' ? 'LIVE' : 'WAITING'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.buy} />
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>Connecting to the event…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={28} color={colors.sell} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>Unable to join</Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity onPress={() => void refresh()} style={[styles.retryButton, { backgroundColor: colors.buy }]}>
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : access?.status === 'waiting' || !access?.token || !access.serverUrl ? (
        <View style={styles.center}>
          <View style={[styles.waitingIcon, { backgroundColor: colors.surface }]}>
            <Feather name="users" size={27} color={colors.buy} />
          </View>
          <Text style={[styles.centerTitle, { color: colors.text }]}>You’re in the waiting room</Text>
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>
            {isHost
              ? 'Start the LiveKit room when you are ready. You can then admit listeners and manage speakers.'
              : 'The host will admit you when the live audio room is ready.'}
          </Text>
          {isHost ? (
            <TouchableOpacity disabled={starting} onPress={() => void startSession()} style={[styles.retryButton, { backgroundColor: colors.buy }]}>
              {starting ? <ActivityIndicator color={colors.primaryForeground} /> : (
                <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Start LiveKit room</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => void refresh()} style={[styles.secondaryButton, { borderColor: colors.cardBorder }]}>
              <Feather name="refresh-cw" size={14} color={colors.textSecondary} />
              <Text style={[styles.secondaryText, { color: colors.text }]}>Check room status</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => void leave()} style={styles.leaveWaiting}>
            <Text style={[styles.leaveText, { color: colors.textSecondary }]}>Leave waiting room</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <LiveKitRoom
          serverUrl={access.serverUrl}
          token={access.token}
          connect
          audio={false}
          video={false}
          options={{ adaptiveStream: false, dynacast: false }}
          onError={(failure) => setConnectionError(failure.message || 'LiveKit connection failed.')}
          onConnected={() => setConnectionError('')}
          onDisconnected={() => setConnectionError('Disconnected from the LiveKit room. Check your connection and try again.')}
        >
          <RoomContent
            title={title}
            role={role || 'listener'}
            canSpeak={canSpeak}
            isHost={isHost}
            ownStatus={ownStatus}
            roster={visibleParticipants}
            allowSpeakingRequests={allowSpeakingRequests}
            connectionError={connectionError}
            onRequestSpeak={async () => {
              if (!id) return;
              try {
                await requestToSpeak(id);
                await refresh();
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Could not request to speak.');
              }
            }}
            onModerate={async (participant, action) => {
              if (!id || !participant.accountId) return;
              try {
                await moderateEventParticipant(id, participant.accountId, action);
                await refresh();
              } catch (failure) {
                Alert.alert('Participant update failed', failure instanceof Error ? failure.message : 'Try again.');
              }
            }}
            onLeave={() => void leave()}
            onEndSession={endSession}
            colors={colors}
          />
        </LiveKitRoom>
      )}
    </View>
  );
}

function RoomContent({
  title,
  role,
  canSpeak,
  isHost,
  ownStatus,
  roster,
  allowSpeakingRequests,
  connectionError,
  onRequestSpeak,
  onModerate,
  onLeave,
  onEndSession,
  colors,
}: {
  title: string;
  role: 'host' | 'listener' | 'speaker';
  canSpeak: boolean;
  isHost: boolean;
  ownStatus: EventParticipant['status'] | null;
  roster: EventParticipant[];
  allowSpeakingRequests: boolean;
  connectionError: string;
  onRequestSpeak: () => Promise<void>;
  onModerate: (participant: EventParticipant, action: 'admit' | 'approve_speaker' | 'decline_speaker' | 'remove_speaker' | 'remove') => Promise<void>;
  onLeave: () => void;
  onEndSession: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const [microphoneError, setMicrophoneError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [roomConnected, setRoomConnected] = useState(false);
  const remoteParticipants = participants.filter((participant) => participant.identity !== localParticipant.identity);

  useEffect(() => {
    const refreshConnection = () => setRoomConnected(room.state === 'connected');
    refreshConnection();
    room.on(RoomEvent.ConnectionStateChanged, refreshConnection);
    return () => { room.off(RoomEvent.ConnectionStateChanged, refreshConnection); };
  }, [room]);

  useEffect(() => {
    if (!canSpeak && isMicrophoneEnabled) {
      void localParticipant.setMicrophoneEnabled(false).catch((failure: unknown) => {
        console.error('[Events] Could not disable microphone after permission changed.', failure);
      });
    }
  }, [canSpeak, isMicrophoneEnabled, localParticipant]);

  const toggleMicrophone = async () => {
    if (!canSpeak) return;
    setMicrophoneError('');
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (failure) {
      setMicrophoneError(failure instanceof Error
        ? failure.message
        : 'Microphone access was denied. Check your device permissions.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.roomContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.roomStatus, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={[styles.roomOrb, { backgroundColor: `${colors.buy}18` }]}>
          <Feather name="headphones" size={29} color={colors.buy} />
        </View>
        <Text style={[styles.roomTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.roomSubTitle, { color: colors.textSecondary }]}>
          {roomConnected ? `${participants.length} connected · ${role === 'host' ? 'Host' : role === 'speaker' ? 'Speaker' : 'Listener'}` : 'Connecting audio…'}
        </Text>
        <View style={styles.waveform}>
          {[14, 24, 34, 21, 30, 16, 27, 12].map((height, index) => (
            <View key={index} style={[styles.waveBar, { height, backgroundColor: colors.buy, opacity: 0.48 + index * 0.06 }]} />
          ))}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>In this room</Text>
      <View style={[styles.participantCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <ParticipantRow
          name={localParticipant.name || 'You'}
          detail={`${role === 'host' ? 'Host' : role === 'speaker' ? 'Speaker' : 'Listener'} · You`}
          speaking={localParticipant.isSpeaking}
          microphoneEnabled={isMicrophoneEnabled}
          colors={colors}
        />
        {remoteParticipants.map((participant) => (
          <ParticipantRow
            key={participant.identity}
            name={participant.name || 'FXSnap member'}
            detail={participant.isMicrophoneEnabled ? 'Mic on' : 'Listening'}
            speaking={participant.isSpeaking}
            microphoneEnabled={participant.isMicrophoneEnabled}
            colors={colors}
          />
        ))}
        {remoteParticipants.length === 0 ? (
          <Text style={[styles.noParticipants, { color: colors.textSecondary }]}>You’re the first person in the room.</Text>
        ) : null}
      </View>

      {isHost ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Waiting room & speaker requests</Text>
          <View style={[styles.participantCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {roster.filter((participant) => (
              ['waiting', 'speaker_requested', 'speaker'].includes(participant.status)
              || (participant.status === 'listener' && participant.online)
            )).length === 0 ? (
              <Text style={[styles.noParticipants, { color: colors.textSecondary }]}>No pending admission or speaking requests.</Text>
            ) : roster.filter((participant) => (
              ['waiting', 'speaker_requested', 'speaker'].includes(participant.status)
              || (participant.status === 'listener' && participant.online)
            )).map((participant, index) => (
              <View key={participant.accountId || `${participant.displayName}-${index}`} style={[styles.moderationRow, { borderBottomColor: colors.cardBorder }]}>
                <View style={styles.moderationIdentity}>
                  <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>{participant.displayName}</Text>
                  <Text style={[styles.participantDetail, { color: colors.textSecondary }]}>
                    {participant.status.replaceAll('_', ' ')}{participant.online ? '' : ' · not connected'}
                  </Text>
                </View>
                {participant.status === 'waiting' ? (
                  <SmallAction label="Admit" onPress={() => void onModerate(participant, 'admit')} colors={colors} />
                ) : participant.status === 'listener' ? (
                  <SmallAction label="Invite speaker" onPress={() => void onModerate(participant, 'approve_speaker')} colors={colors} />
                ) : participant.status === 'speaker_requested' ? (
                  <>
                    <SmallAction label="Approve" onPress={() => void onModerate(participant, 'approve_speaker')} colors={colors} />
                    <SmallAction label="Decline" onPress={() => void onModerate(participant, 'decline_speaker')} colors={colors} />
                  </>
                ) : participant.status === 'speaker' ? (
                  <SmallAction label="Mute" onPress={() => void onModerate(participant, 'remove_speaker')} colors={colors} />
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {microphoneError ? (
        <Text style={[styles.microphoneError, { color: colors.sell }]}>{microphoneError}</Text>
      ) : null}
      {connectionError ? (
        <Text style={[styles.microphoneError, { color: colors.sell }]}>{connectionError}</Text>
      ) : null}
      <View style={styles.controls}>
        {canSpeak ? (
          <TouchableOpacity
            onPress={() => void toggleMicrophone()}
            style={[styles.micButton, { backgroundColor: isMicrophoneEnabled ? colors.sell : colors.buy }]}
            accessibilityRole="button"
            accessibilityLabel={isMicrophoneEnabled ? 'Mute microphone' : 'Turn microphone on'}
          >
            <Feather name={isMicrophoneEnabled ? 'mic' : 'mic-off'} size={19} color={colors.primaryForeground} />
            <Text style={[styles.micLabel, { color: colors.primaryForeground }]}>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.listenerPill, { backgroundColor: colors.surface }]}>
            <Feather name="headphones" size={16} color={colors.textSecondary} />
            <Text style={[styles.listenerText, { color: colors.textSecondary }]}>Listening only</Text>
          </View>
        )}
        {!canSpeak && allowSpeakingRequests && ownStatus !== 'speaker_requested' ? (
          <TouchableOpacity onPress={() => void onRequestSpeak()} style={[styles.requestButton, { borderColor: colors.cardBorder }]}>
            <Feather name="user-plus" size={15} color={colors.buy} />
            <Text style={[styles.requestText, { color: colors.text }]}>Request to speak</Text>
          </TouchableOpacity>
        ) : null}
        {!canSpeak && ownStatus === 'speaker_requested' ? (
          <View style={[styles.listenerPill, { backgroundColor: colors.surface }]}>
            <Feather name="clock" size={15} color={colors.textSecondary} />
            <Text style={[styles.listenerText, { color: colors.textSecondary }]}>Request sent</Text>
          </View>
        ) : null}
        <TouchableOpacity onPress={onLeave} style={[styles.leaveButton, { backgroundColor: `${colors.sell}12` }]}>
          <Feather name="phone-off" size={16} color={colors.sell} />
          <Text style={[styles.leaveButtonText, { color: colors.sell }]}>Leave</Text>
        </TouchableOpacity>
        {isHost ? (
          <TouchableOpacity onPress={onEndSession} style={[styles.leaveButton, { backgroundColor: `${colors.sell}12` }]}>
            <Feather name="square" size={15} color={colors.sell} />
            <Text style={[styles.leaveButtonText, { color: colors.sell }]}>End for everyone</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ParticipantRow({
  name,
  detail,
  speaking,
  microphoneEnabled,
  colors,
}: {
  name: string;
  detail: string;
  speaking: boolean;
  microphoneEnabled: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.participantRow, { borderBottomColor: colors.cardBorder }]}>
      <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
        <Feather name="user" size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.participantIdentity}>
        <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.participantDetail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
      <Feather
        name={microphoneEnabled ? 'mic' : 'mic-off'}
        size={15}
        color={speaking ? colors.buy : colors.textMuted}
      />
    </View>
  );
}

function SmallAction({ label, onPress, colors }: { label: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.smallAction, { borderColor: colors.cardBorder }]}>
      <Text style={[styles.smallActionText, { color: colors.buy }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, paddingHorizontal: 5 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 2, fontSize: 9, fontFamily: 'Inter_400Regular' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 13 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: { fontSize: 8, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  centerText: { maxWidth: 310, marginTop: 9, textAlign: 'center', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  centerTitle: { marginTop: 14, fontSize: 17, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  waitingIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  retryButton: { minHeight: 40, justifyContent: 'center', marginTop: 16, paddingHorizontal: 22, borderRadius: 12 },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  secondaryButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, paddingHorizontal: 12, borderWidth: 1, borderRadius: 11 },
  secondaryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  leaveWaiting: { padding: 12 },
  leaveText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  roomContent: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 28 },
  roomStatus: { alignItems: 'center', padding: 20, borderWidth: 1, borderRadius: 20 },
  roomOrb: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  roomTitle: { marginTop: 12, fontSize: 17, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  roomSubTitle: { marginTop: 4, fontSize: 10, fontFamily: 'Inter_500Medium' },
  waveform: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  waveBar: { width: 4, borderRadius: 3 },
  sectionTitle: { marginTop: 20, marginBottom: 8, fontSize: 13, fontFamily: 'Inter_700Bold' },
  participantCard: { paddingHorizontal: 12, borderWidth: 1, borderRadius: 16 },
  participantRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  participantIdentity: { flex: 1 },
  participantName: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  participantDetail: { marginTop: 2, fontSize: 8, textTransform: 'capitalize', fontFamily: 'Inter_400Regular' },
  noParticipants: { paddingVertical: 14, fontSize: 10, fontFamily: 'Inter_400Regular' },
  moderationRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  moderationIdentity: { flex: 1 },
  smallAction: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 7, borderWidth: 1, borderRadius: 8 },
  smallActionText: { fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  microphoneError: { marginTop: 12, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 9, marginTop: 22 },
  micButton: { minWidth: 100, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 14 },
  micLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  listenerPill: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 13 },
  listenerText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  requestButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderWidth: 1, borderRadius: 13 },
  requestText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  leaveButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 13 },
  leaveButtonText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
});
