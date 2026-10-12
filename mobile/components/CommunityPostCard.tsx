import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { COMMUNITY_REACTIONS, type CommunityMessage, type CommunityReaction } from '@/services/community';
import { COMMUNITY_CATEGORIES } from '@/services/community';
import { formatCompactCommunityCount } from '@/services/communityFormatting';
import { CommunityReactionTapGuard } from '@/services/communityReactionInteraction';
import { formatInstrumentPriceText } from '@/services/priceFormatting';
import { useColors } from '@/hooks/useColors';

function textValue(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatRiskReward(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `1:${value}`;
  if (typeof value !== 'string' || !value.trim()) return '—';
  const ratio = value.trim();
  if (ratio.includes(':')) return ratio;
  return Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? `1:${ratio}` : '—';
}

function relativeTime(isoDate: string) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function CommunityPostCard({
  post,
  ownAccount,
  onReact,
  reactionBusy = false,
  onComment,
  onShare,
  onMore,
  onFollow,
  onAuthorPress,
  compact = false,
}: {
  post: CommunityMessage;
  ownAccount: boolean;
  onReact: (reaction: CommunityReaction) => void;
  reactionBusy?: boolean;
  onComment: () => void;
  onShare: (shareableView: View | null) => void;
  onMore: (shareableView: View | null) => void;
  onFollow: () => void;
  onAuthorPress?: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const shareableViewRef = useRef<View>(null);
  const reactionAnchorRef = useRef<View>(null);
  const suppressTapRef = useRef(new CommunityReactionTapGuard());
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{ left: number; top: number } | null>(null);
  const selectedReaction = post.reactions.find((item) => item.reacted);
  const selectedReactionInfo = COMMUNITY_REACTIONS.find((item) => item.id === selectedReaction?.reaction);
  const reactionCount = post.reactions
    .filter((item) => item.reaction !== 'like')
    .reduce((total, item) => total + item.count, 0);
  const pickerWidth = Math.min(256, windowWidth - 24);

  useEffect(() => () => {
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTapRef.current.reset();
  }, []);

  const openReactionPicker = () => {
    if (reactionBusy) return;
    suppressTapRef.current.suppressNextTap();
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => suppressTapRef.current.reset(), 750);
    reactionAnchorRef.current?.measureInWindow((x, y, buttonWidth) => {
      const left = Math.max(12, Math.min(x + buttonWidth / 2 - pickerWidth / 2, windowWidth - pickerWidth - 12));
      const top = Math.max(12, Math.min(y - 66, windowHeight - 66));
      setReactionPicker({ left, top });
    });
  };

  const handleDefaultReaction = () => {
    if (suppressTapRef.current.consumeSuppressedTap()) {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      return;
    }
    onReact('love');
  };
  const category = COMMUNITY_CATEGORIES.find((item) => item.id === post.category)?.label || 'Community';
  const imageUrl = typeof post.payload.imageUrl === 'string' ? post.payload.imageUrl : null;
  const imageWidth = typeof post.payload.imageWidth === 'number' ? post.payload.imageWidth : null;
  const imageHeight = typeof post.payload.imageHeight === 'number' ? post.payload.imageHeight : null;
  const imageAspectRatio = imageWidth && imageHeight
    ? Math.min(1.8, Math.max(0.6, imageWidth / imageHeight))
    : 1.15;
  const analysis = post.kind === 'analysis' ? post.payload : null;
  const signal = post.kind === 'signal' ? post.payload : null;
  const sourceCreatedAt = analysis && typeof analysis.sourceCreatedAt === 'string'
    ? analysis.sourceCreatedAt
    : null;
  const analysisAge = sourceCreatedAt ? Math.max(0, Date.now() - Date.parse(sourceCreatedAt)) : 0;
  const staleAnalysis = Boolean(analysis && analysisAge >= 60 * 60_000);

  return (
    <View ref={shareableViewRef} collapsable={false} style={[
      styles.card,
      compact && styles.compactCard,
      { backgroundColor: colors.card, borderColor: colors.cardBorder },
    ]}>
      {post.pinnedAt ? (
        <View style={[styles.pinned, { backgroundColor: `${colors.buy}16` }]}>
          <Feather name="bookmark" size={12} color={colors.buy} />
          <Text style={[styles.pinnedText, { color: colors.buy }]}>PINNED DISCUSSION</Text>
        </View>
      ) : null}
      <View style={[styles.authorRow, compact && styles.compactAuthorRow]}>
        <TouchableOpacity
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
          style={styles.authorIdentity}
          accessibilityRole={onAuthorPress ? 'button' : undefined}
          accessibilityLabel={`View @${post.authorUsername}'s profile`}
        >
          {post.authorPictureUrl ? (
            <Image source={{ uri: post.authorPictureUrl }} style={[styles.avatar, compact && styles.compactAvatar]} contentFit="cover" accessibilityLabel={`${post.authorUsername}'s profile picture`} />
          ) : (
            <View style={[styles.avatar, compact && styles.compactAvatar, { backgroundColor: post.isOfficial ? colors.buy : colors.surface }]}>
              <Text style={[styles.avatarText, { color: post.isOfficial ? colors.primaryForeground : colors.text }]}>
                {post.authorUsername.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.authorCopy}>
            <View style={styles.nameLine}>
              <Text style={[styles.username, compact && styles.compactUsername, { color: colors.text }]} numberOfLines={1}>@{post.authorUsername}</Text>
              {post.isOfficial ? (
                <View style={[styles.officialBadge, { backgroundColor: `${colors.buy}18` }]}>
                  <Feather name="check-circle" size={11} color={colors.buy} />
                  <Text style={[styles.officialText, { color: colors.buy }]}>FXSnap</Text>
                </View>
              ) : null}
              {post.kind === 'analysis' ? (
                <View style={[styles.aiBadge, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="aperture" size={11} color={colors.primary} />
                  <Text style={[styles.aiText, { color: colors.primary }]}>AI ANALYSIS</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.meta, compact && styles.compactMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {relativeTime(post.createdAt)} · {category}
            </Text>
          </View>
        </TouchableOpacity>
        {!compact && !ownAccount && !post.isOfficial ? (
          <TouchableOpacity
            onPress={onFollow}
            accessibilityRole="button"
            accessibilityLabel={post.isFollowed ? `Unfollow ${post.authorUsername}` : `Follow ${post.authorUsername}`}
            style={[styles.followButton, { borderColor: colors.cardBorder }]}
          >
            <Text style={[styles.followText, { color: post.isFollowed ? colors.textSecondary : colors.buy }]}>
              {post.isFollowed ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => onMore(shareableViewRef.current)} style={styles.moreButton} accessibilityLabel="Post actions">
          <Feather name="more-horizontal" size={19} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {post.body ? (
        <TouchableOpacity
          onPress={onComment}
          disabled={!compact}
          accessibilityRole={compact ? 'button' : undefined}
          accessibilityLabel={compact ? 'Open post discussion' : undefined}
        >
          <Text style={[styles.body, compact && styles.compactBody, { color: colors.text }]} numberOfLines={compact ? 6 : undefined}>
            {post.body}
          </Text>
        </TouchableOpacity>
      ) : null}

      {signal ? (
        <View style={[styles.signalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.signalHeading}>
            <Text style={[styles.signalInstrument, { color: colors.text }]}>{textValue(signal.instrument)}</Text>
            <Text style={[styles.signalDirection, { color: signal.direction === 'BUY' ? colors.buy : colors.sell }]}>
              {textValue(signal.direction).toUpperCase()}
            </Text>
          </View>
          <View style={[styles.signalGrid, compact && styles.compactSignalGrid]}>
            <SignalValue label="ENTRY" value={formatInstrumentPriceText(signal.entry, textValue(signal.instrument))} colors={colors} />
            <SignalValue label="STOP LOSS" value={formatInstrumentPriceText(signal.stopLoss, textValue(signal.instrument))} colors={colors} />
            <SignalValue label="TIMEFRAME" value={textValue(signal.timeframe)} colors={colors} />
            <SignalValue
              label="TAKE PROFIT"
              value={Array.isArray(signal.takeProfits) ? formatInstrumentPriceText(signal.takeProfits.join(' / '), textValue(signal.instrument)) : '—'}
              colors={colors}
            />
          </View>
          {typeof signal.reasoning === 'string' && signal.reasoning ? (
            <Text style={[styles.signalReasoning, { color: colors.textSecondary }]}>{signal.reasoning}</Text>
          ) : null}
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            Member-created signal · Education and discussion only, not an FXSnap recommendation.
          </Text>
        </View>
      ) : null}

      {analysis ? (
        <View style={[styles.signalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.signalHeading}>
            <Text style={[styles.signalInstrument, { color: colors.text }]}>{textValue(analysis.pair)}</Text>
            <Text style={[styles.signalDirection, {
              color: analysis.direction === 'BUY' ? colors.buy : analysis.direction === 'SELL' ? colors.sell : colors.primary,
            }]}>
              {textValue(analysis.direction, textValue(analysis.marketBias, 'NO TRADE')).toUpperCase()}
            </Text>
          </View>
          <View style={[styles.signalGrid, compact && styles.compactSignalGrid]}>
            <SignalValue label="ENTRY" value={formatInstrumentPriceText(analysis.entry, textValue(analysis.pair))} colors={colors} />
            <SignalValue label="STOP LOSS" value={formatInstrumentPriceText(analysis.stopLoss, textValue(analysis.pair))} colors={colors} />
            <SignalValue
              label="TAKE PROFIT"
              value={Array.isArray(analysis.takeProfits) && analysis.takeProfits.length ? formatInstrumentPriceText(analysis.takeProfits.join(' / '), textValue(analysis.pair)) : '—'}
              colors={colors}
            />
            <SignalValue label="RISK / REWARD" value={formatRiskReward(analysis.riskReward)} colors={colors} />
          </View>
          <Text style={[styles.analysisContext, { color: colors.textMuted }]}>
            {textValue(analysis.timeframe, 'Timeframe unavailable')}
            {'  ·  '}
            {textValue(analysis.marketBias, textValue(analysis.status, 'Analysis'))}
          </Text>
          {staleAnalysis ? (
            <Text style={[styles.staleNotice, { color: colors.sell }]}>
              Older AI analysis · captured {relativeTime(sourceCreatedAt!)} ago · not refreshed
            </Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Original analysis: {sourceCreatedAt ? new Date(sourceCreatedAt).toLocaleString() : 'time not available'}
            </Text>
          )}
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            FXSnap AI analysis as originally generated. Shared for education, not financial advice.
          </Text>
        </View>
      ) : null}

      {imageUrl ? (
        <TouchableOpacity onPress={onComment} disabled={!compact} accessibilityRole={compact ? 'button' : undefined} accessibilityLabel={compact ? 'Open post discussion' : undefined}>
        <Image
          source={{ uri: imageUrl }}
          style={[styles.postImage, compact && styles.compactPostImage, { aspectRatio: imageAspectRatio, backgroundColor: colors.surface }]}
          contentFit="cover"
          transition={120}
          accessibilityLabel="Chart attachment"
        />
        </TouchableOpacity>
      ) : null}

      {post.kind === 'announcement' ? (
        <Text style={[styles.disclaimer, { color: colors.buy }]}>Official FXSnap event announcement</Text>
      ) : null}
      <View style={[styles.actions, compact && styles.compactActions, { borderTopColor: colors.cardBorder }]}>
        <View ref={reactionAnchorRef} collapsable={false}>
          <View style={styles.reactionControl}>
            <TouchableOpacity
              onPress={handleDefaultReaction}
              onLongPress={openReactionPicker}
              delayLongPress={500}
              disabled={reactionBusy}
              style={[styles.action, styles.reactionAction, compact && styles.compactAction]}
              accessibilityRole="button"
              accessibilityLabel={`${selectedReactionInfo?.label || 'Love'} reaction. ${reactionCount} total. Activate to toggle Love; long press for more reactions.`}
              accessibilityState={{ expanded: Boolean(reactionPicker), disabled: reactionBusy }}
              accessibilityActions={[{ name: 'longpress', label: 'Choose a reaction' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'longpress') openReactionPicker();
              }}
            >
              {reactionBusy
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Text style={styles.reactionEmoji}>{selectedReactionInfo?.emoji || '❤️'}</Text>}
              <Text style={[
                styles.actionLabel,
                compact && styles.compactActionLabel,
                { color: selectedReaction ? colors.sell : colors.textSecondary },
              ]}>
                {formatCompactCommunityCount(reactionCount)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openReactionPicker}
              disabled={reactionBusy}
              style={[styles.moreReactionButton, compact && styles.compactMoreReactionButton]}
              accessibilityRole="button"
              accessibilityLabel="Choose a reaction"
              accessibilityState={{ expanded: Boolean(reactionPicker), disabled: reactionBusy }}
            >
              <Feather name="more-horizontal" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={onComment} style={[styles.action, compact && styles.compactAction]} accessibilityRole="button" accessibilityLabel="Comment on post">
          <Feather name="message-circle" size={compact ? 15 : 18} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, compact && styles.compactActionLabel, { color: colors.textSecondary }]}>
            {compact ? formatCompactCommunityCount(post.commentCount) : `Discuss${post.commentCount ? ` · ${formatCompactCommunityCount(post.commentCount)}` : ''}`}
          </Text>
        </TouchableOpacity>
        <View style={[styles.engagementAction, compact && styles.compactAction]} accessible accessibilityLabel={`${post.viewCount} views`}>
          <Feather name="eye" size={compact ? 14 : 17} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, compact && styles.compactActionLabel, { color: colors.textSecondary }]}>
            {formatCompactCommunityCount(post.viewCount)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onShare(shareableViewRef.current)}
          style={[styles.action, compact && styles.compactAction]}
          accessibilityRole="button"
          accessibilityLabel={`Share post. ${formatCompactCommunityCount(post.shareCount)} shares.`}
        >
          <Feather name="send" size={compact ? 14 : 17} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, compact && styles.compactActionLabel, { color: colors.textSecondary }]}>
            {compact ? formatCompactCommunityCount(post.shareCount) : `Share${post.shareCount ? ` · ${formatCompactCommunityCount(post.shareCount)}` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
      {reactionPicker ? (
        <Modal
          transparent
          visible
          animationType={reduceMotion ? 'none' : 'fade'}
          statusBarTranslucent
          onRequestClose={() => {
            setReactionPicker(null);
            suppressTapRef.current.reset();
          }}
        >
          <View style={StyleSheet.absoluteFill}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                setReactionPicker(null);
                suppressTapRef.current.reset();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close reaction picker"
            />
            <View
              style={[
                styles.reactionPicker,
                { left: reactionPicker.left, top: reactionPicker.top, width: pickerWidth, backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
              accessibilityLabel="Choose a reaction"
            >
              {COMMUNITY_REACTIONS.map((reaction) => (
                <TouchableOpacity
                  key={reaction.id}
                  onPress={() => {
                    setReactionPicker(null);
                    suppressTapRef.current.reset();
                    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
                    onReact(reaction.id);
                  }}
                  disabled={reactionBusy}
                  style={[styles.reactionOption, selectedReaction?.reaction === reaction.id && { backgroundColor: `${colors.buy}20` }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${reaction.label} reaction`}
                  accessibilityState={{ selected: selectedReaction?.reaction === reaction.id, disabled: reactionBusy }}
                >
                  <Text style={styles.reactionOptionEmoji}>{reaction.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function SignalValue({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.signalValue}>
      <Text style={[styles.signalLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.signalText, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 12, gap: 12 },
  compactCard: { borderRadius: 17, padding: 10, marginBottom: 0, gap: 9 },
  pinned: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinnedText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  compactAuthorRow: { gap: 5 },
  authorIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  compactAvatar: { width: 27, height: 27, borderRadius: 14 },
  avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  authorCopy: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  username: { maxWidth: 140, fontSize: 13, fontFamily: 'Inter_700Bold' },
  compactUsername: { maxWidth: 105, fontSize: 10 },
  officialBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3 },
  officialText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3 },
  aiText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  meta: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  compactMeta: { fontSize: 8 },
  followButton: { minHeight: 30, justifyContent: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 10 },
  followText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  moreButton: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  compactBody: { fontSize: 11, lineHeight: 16 },
  signalCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 11 },
  signalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signalInstrument: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  signalDirection: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  compactSignalGrid: { rowGap: 7 },
  signalValue: { width: '50%', gap: 3 },
  signalLabel: { fontSize: 9, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  signalText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  signalReasoning: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  analysisContext: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  staleNotice: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  postImage: { width: '100%', borderRadius: 12 },
  compactPostImage: { borderRadius: 12 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-around' },
  compactActions: { borderTopWidth: 0, paddingTop: 0, justifyContent: 'space-between', gap: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6 },
  compactAction: { minHeight: 32, gap: 3, paddingHorizontal: 2 },
  reactionControl: { flexDirection: 'row', alignItems: 'center' },
  reactionAction: { borderRadius: 12 },
  moreReactionButton: { width: 28, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  compactMoreReactionButton: { width: 18, minHeight: 32 },
  reactionEmoji: { fontSize: 18 },
  engagementAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6 },
  compactActionLabel: { fontSize: 8 },
  actionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reactionPicker: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', minHeight: 62, borderWidth: 1, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 5, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  reactionOption: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, gap: 2 },
  reactionOptionEmoji: { fontSize: 23 },
});
