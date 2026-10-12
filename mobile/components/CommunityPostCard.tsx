import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import type { CommunityMessage } from '@/services/community';
import { COMMUNITY_CATEGORIES } from '@/services/community';
import { useColors } from '@/hooks/useColors';

function textValue(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value : fallback;
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
  onLike,
  onComment,
  onShare,
  onMore,
  onFollow,
}: {
  post: CommunityMessage;
  ownAccount: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
  onFollow: () => void;
}) {
  const colors = useColors();
  const likes = post.reactions.find((item) => item.reaction === 'like');
  const category = COMMUNITY_CATEGORIES.find((item) => item.id === post.category)?.label || 'Community';
  const imageUrl = typeof post.payload.imageUrl === 'string' ? post.payload.imageUrl : null;
  const analysis = post.kind === 'analysis' ? post.payload : null;
  const signal = post.kind === 'signal' ? post.payload : null;
  const sourceCreatedAt = analysis && typeof analysis.sourceCreatedAt === 'string'
    ? analysis.sourceCreatedAt
    : null;
  const analysisAge = sourceCreatedAt ? Math.max(0, Date.now() - Date.parse(sourceCreatedAt)) : 0;
  const staleAnalysis = Boolean(analysis && analysisAge >= 60 * 60_000);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {post.pinnedAt ? (
        <View style={[styles.pinned, { backgroundColor: `${colors.buy}16` }]}>
          <Feather name="bookmark" size={12} color={colors.buy} />
          <Text style={[styles.pinnedText, { color: colors.buy }]}>PINNED DISCUSSION</Text>
        </View>
      ) : null}
      <View style={styles.authorRow}>
        {post.authorPictureUrl ? (
          <Image source={{ uri: post.authorPictureUrl }} style={styles.avatar} accessibilityLabel={`${post.authorUsername}'s profile picture`} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: post.isOfficial ? colors.buy : colors.surface }]}>
            <Text style={[styles.avatarText, { color: post.isOfficial ? colors.primaryForeground : colors.text }]}>
              {post.authorUsername.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.authorCopy}>
          <View style={styles.nameLine}>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>@{post.authorUsername}</Text>
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
          <Text style={[styles.meta, { color: colors.textMuted }]}>{relativeTime(post.createdAt)} · {category}</Text>
        </View>
        {!ownAccount && !post.isOfficial ? (
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
        <TouchableOpacity onPress={onMore} style={styles.moreButton} accessibilityLabel="Post actions">
          <Feather name="more-horizontal" size={19} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {post.body ? <Text style={[styles.body, { color: colors.text }]}>{post.body}</Text> : null}

      {signal ? (
        <View style={[styles.signalCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.signalHeading}>
            <Text style={[styles.signalInstrument, { color: colors.text }]}>{textValue(signal.instrument)}</Text>
            <Text style={[styles.signalDirection, { color: signal.direction === 'BUY' ? colors.buy : colors.sell }]}>
              {textValue(signal.direction).toUpperCase()}
            </Text>
          </View>
          <View style={styles.signalGrid}>
            <SignalValue label="ENTRY" value={textValue(signal.entry)} colors={colors} />
            <SignalValue label="STOP LOSS" value={textValue(signal.stopLoss)} colors={colors} />
            <SignalValue label="TIMEFRAME" value={textValue(signal.timeframe)} colors={colors} />
            <SignalValue
              label="TAKE PROFIT"
              value={Array.isArray(signal.takeProfits) ? signal.takeProfits.join(' / ') : '—'}
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
            <Text style={[styles.signalDirection, { color: colors.primary }]}>
              {textValue(analysis.direction, textValue(analysis.marketBias, 'NO TRADE')).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.analysisLevels, { color: colors.textSecondary }]}>
            Entry {textValue(analysis.entry)}  ·  SL {textValue(analysis.stopLoss)}
          </Text>
          <Text style={[styles.analysisLevels, { color: colors.textSecondary }]}>
            TP {Array.isArray(analysis.takeProfits) && analysis.takeProfits.length ? analysis.takeProfits.join(' / ') : '—'}
            {'  ·  '}{textValue(analysis.timeframe)}
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
        <Image
          source={{ uri: imageUrl }}
          style={[styles.postImage, { backgroundColor: colors.surface }]}
          resizeMode="cover"
          accessibilityLabel="Chart attachment"
        />
      ) : null}

      {post.kind === 'announcement' ? (
        <Text style={[styles.disclaimer, { color: colors.buy }]}>Official FXSnap event announcement</Text>
      ) : null}

      <View style={[styles.actions, { borderTopColor: colors.cardBorder }]}>
        <TouchableOpacity
          onPress={onLike}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={likes?.reacted ? 'Unlike post' : 'Like post'}
        >
          <Feather name="heart" size={18} color={likes?.reacted ? colors.sell : colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: likes?.reacted ? colors.sell : colors.textSecondary }]}>
            Like{likes?.count ? ` · ${likes.count}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onComment} style={styles.action} accessibilityRole="button" accessibilityLabel="Comment on post">
          <Feather name="message-circle" size={18} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            Discuss{post.commentCount ? ` · ${post.commentCount}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare} style={styles.action} accessibilityRole="button" accessibilityLabel="Share post">
          <Feather name="send" size={17} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>
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
  pinned: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinnedText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  authorCopy: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  username: { maxWidth: 140, fontSize: 13, fontFamily: 'Inter_700Bold' },
  officialBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3 },
  officialText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3 },
  aiText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  meta: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  followButton: { minHeight: 30, justifyContent: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 10 },
  followText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  moreButton: { width: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  signalCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 11 },
  signalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signalInstrument: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  signalDirection: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  signalValue: { width: '50%', gap: 3 },
  signalLabel: { fontSize: 9, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  signalText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  signalReasoning: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  analysisLevels: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  staleNotice: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  postImage: { width: '100%', height: 225, borderRadius: 13 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-around' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 6 },
  actionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
