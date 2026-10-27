import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Svg, { Line, Rect } from 'react-native-svg';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { COMMUNITY_REACTIONS, type CommunityMessage, type CommunityPoll, type CommunityReaction } from '@/services/community';
import { COMMUNITY_CATEGORIES } from '@/services/community';
import { formatCompactCommunityCount } from '@/services/communityFormatting';
import { CommunityReactionTapGuard } from '@/services/communityReactionInteraction';
import { formatInstrumentPriceText } from '@/services/priceFormatting';
import { formatRiskReward } from '@/services/analysisResult';
import { useColors } from '@/hooks/useColors';
import { COMMUNITY_POST_PREVIEW_LINES, communityTextExceedsPreview } from '@/services/communityTextPreview';
import { getCommunityMediaPresentation, getCommunityPostImages } from '@/services/communityMediaPresentation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type PreviewPollData = {
  question: string;
  totalVotes: number;
  options: Array<{ label: string; percentage: number }>;
};

function parsePreviewPoll(value: unknown): PreviewPollData | null {
  if (!value || typeof value !== 'object') return null;
  const poll = value as Record<string, unknown>;
  if (typeof poll.question !== 'string' || typeof poll.totalVotes !== 'number' || !Array.isArray(poll.options)) return null;
  const options = poll.options.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const option = item as Record<string, unknown>;
    if (typeof option.label !== 'string' || typeof option.percentage !== 'number') return [];
    return [{ label: option.label, percentage: Math.max(0, Math.min(100, option.percentage)) }];
  });
  return options.length ? { question: poll.question, totalVotes: poll.totalVotes, options } : null;
}

function CommunityImageViewer({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(5, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      const maxX = width * (scale.value - 1) / 2;
      const maxY = height * (scale.value - 1) / 2;
      translateX.value = Math.max(-maxX, Math.min(maxX, savedTranslateX.value + event.translationX));
      translateY.value = Math.max(-maxY, Math.min(maxY, savedTranslateY.value + event.translationY));
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });
  const gestures = Gesture.Simultaneous(pinch, pan);

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.imageViewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <GestureDetector gesture={gestures}>
          <Animated.View style={styles.imageViewerCanvas}>
            <Animated.View style={[styles.imageViewerImageWrap, imageStyle]}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.imageViewerImage}
                contentFit="contain"
                cachePolicy="memory-disk"
                accessibilityLabel="Full-size Community image. Pinch to zoom and drag to pan."
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.imageViewerClose, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
        >
          <Feather name="x" size={23} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function CommunityPostCard({
  post,
  palette,
  ownAccount,
  onReact,
  reactionBusy = false,
  onComment,
  onOpenPost,
  onRepost,
  repostBusy = false,
  onSave,
  saveBusy = false,
  onPollVote,
  pollBusy = false,
  onShare,
  onMore,
  onFollow,
  onAuthorPress,
  compact = false,
  feedStyle = false,
  fullText = false,
}: {
  post: CommunityMessage;
  palette?: ReturnType<typeof useColors>;
  ownAccount: boolean;
  onReact: (reaction: CommunityReaction) => void;
  reactionBusy?: boolean;
  onComment: () => void;
  onOpenPost?: () => void;
  onRepost?: () => void;
  repostBusy?: boolean;
  onSave?: () => void;
  saveBusy?: boolean;
  onPollVote?: (optionId: string) => void;
  pollBusy?: boolean;
  onShare: (shareableView: View | null) => void;
  onMore: (shareableView: View | null) => void;
  onFollow: () => void;
  onAuthorPress?: () => void;
  compact?: boolean;
  feedStyle?: boolean;
  fullText?: boolean;
}) {
  const defaultColors = useColors();
  const colors = palette || defaultColors;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const shareableViewRef = useRef<View>(null);
  const reactionAnchorRef = useRef<View>(null);
  const suppressTapRef = useRef(new CommunityReactionTapGuard());
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionScale = useSharedValue(1);
  const reactionAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reactionScale.value }],
  }));
  const [reactionPicker, setReactionPicker] = useState<{ left: number; top: number } | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [measuredText, setMeasuredText] = useState<{ postId: string; body: string; exceedsPreview: boolean } | null>(null);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const selectedReaction = post.reactions.find((item) => item.reacted);
  const selectedReactionInfo = COMMUNITY_REACTIONS.find((item) => item.id === selectedReaction?.reaction);
  const repostCount = Number.isFinite(post.repostCount) ? post.repostCount : 0;
  const repostedByMe = post.repostedByMe === true;
  const reactionCount = post.reactions
    .filter((item) => item.reaction !== 'like')
    .reduce((total, item) => total + item.count, 0);
  const reactionState = `${post.id}:${selectedReaction?.reaction || ''}:${reactionCount}`;
  const previousReactionState = useRef(reactionState);
  const pickerWidth = Math.min(256, windowWidth - 24);

  useEffect(() => {
    if (previousReactionState.current !== reactionState) {
      previousReactionState.current = reactionState;
      if (!reduceMotion) {
        reactionScale.value = withSequence(
          withSpring(1.3, { damping: 8, stiffness: 340 }),
          withSpring(1, { damping: 11, stiffness: 300 }),
        );
      }
    }
  }, [reactionScale, reactionState, reduceMotion]);

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
  const postImages = getCommunityPostImages(post.payload);
  const analysis = post.kind === 'analysis' ? post.payload : null;
  const signal = post.kind === 'signal' ? post.payload : null;
  const isChart = post.kind === 'analysis' || post.category === 'chart_analysis' || post.kind === 'signal';
  const singleMediaFrameHeight = getCommunityMediaPresentation(windowWidth, null, null, isChart).frameHeight;
  const sourceCreatedAt = analysis && typeof analysis.sourceCreatedAt === 'string'
    ? analysis.sourceCreatedAt
    : null;
  const analysisAge = sourceCreatedAt ? Math.max(0, Date.now() - Date.parse(sourceCreatedAt)) : 0;
  const staleAnalysis = Boolean(analysis && analysisAge >= 60 * 60_000);
  const previewDiscussion = __DEV__ && post.payload.previewDiscussion === true;
  const previewTrade = __DEV__ && post.payload.previewTrade === true;
  const previewPoll = __DEV__ ? parsePreviewPoll(post.payload.previewPoll) : null;
  const poll = parseCommunityPoll(post.payload.poll);
  const bodyExpanded = expandedPostId === post.id;
  const bodyExceedsPreview = measuredText?.postId === post.id
    && measuredText.body === post.body
    && measuredText.exceedsPreview;
  return (
    <View ref={shareableViewRef} collapsable={false} style={[
      styles.card,
      compact && styles.compactCard,
      feedStyle && styles.feedCard,
      {
        backgroundColor: colors.card,
        borderColor: colors.cardBorder,
      },
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
            <Image source={{ uri: post.authorPictureUrl }} style={[styles.avatar, compact && styles.compactAvatar]} contentFit="cover" cachePolicy="memory-disk" transition={120} accessibilityLabel={`${post.authorUsername}'s profile picture`} />
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
        {!compact && !feedStyle && !ownAccount && !post.isOfficial ? (
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
        <>
          <TouchableOpacity
            onPress={onOpenPost}
            disabled={!onOpenPost}
            accessibilityRole={onOpenPost ? 'button' : undefined}
            accessibilityLabel={onOpenPost ? 'Open full post and discussion' : undefined}
          >
            <Text
              style={[styles.body, compact && styles.compactBody, { color: colors.text }]}
              numberOfLines={fullText || bodyExpanded ? undefined : COMMUNITY_POST_PREVIEW_LINES}
              ellipsizeMode="tail"
              onTextLayout={fullText || bodyExpanded ? undefined : (event) => {
                const exceedsPreview = communityTextExceedsPreview(post.body, event.nativeEvent.lines.map((line) => line.text));
                setMeasuredText((current) => (
                  current?.postId === post.id
                  && current.body === post.body
                  && current.exceedsPreview === exceedsPreview
                    ? current
                    : { postId: post.id, body: post.body, exceedsPreview }
                ));
              }}
            >
              {post.body}
            </Text>
          </TouchableOpacity>
          {!fullText && (bodyExpanded || bodyExceedsPreview) ? (
            <TouchableOpacity
              onPress={() => setExpandedPostId((current) => current === post.id ? null : post.id)}
              accessibilityRole="button"
              accessibilityLabel={bodyExpanded ? 'Show less post text' : 'Read more post text'}
              style={styles.readMoreTarget}
            >
              <Text style={[styles.readMore, { color: colors.buy }]}>{bodyExpanded ? 'Show less' : 'Read more'}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {previewDiscussion ? (
        <PreviewDiscussionCard
          instrument="EURUSD"
          heading="EUR/USD · H1 Timeframe"
          label="Market Discussion"
          summary="Let’s discuss confirmation strategies and risk management."
          onPress={onComment}
          colors={colors}
        />
      ) : null}
      {previewPoll ? <PreviewPollCard poll={previewPoll} colors={colors} /> : null}
      {poll ? <CommunityPollCard poll={poll} colors={colors} onVote={onPollVote} busy={pollBusy} /> : null}
      {previewTrade ? (
        <PreviewDiscussionCard
          instrument="XAUUSD"
          heading="Gold · H1 Timeframe"
          label="TP Hit"
          summary="Gold reached the first target. Shared for discussion."
          onPress={onComment}
          colors={colors}
        />
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

      {postImages.length ? (
        <View style={[styles.postMediaGallery, postImages.length === 1 && styles.postMediaGallerySingle]}>
          {postImages.map((media, index) => {
            const presentation = getCommunityMediaPresentation(
              windowWidth,
              media.imageWidth,
              media.imageHeight,
              isChart,
            );
            const multiple = postImages.length > 1;
            return (
              <TouchableOpacity
                key={media.url}
                onPress={() => setImageViewerUrl(media.url)}
                accessibilityRole="button"
                accessibilityLabel={`Open full-size post image ${index + 1} of ${postImages.length}`}
                style={[
                  styles.postImageFrame,
                  {
                    width: multiple ? '48%' : '100%',
                    maxWidth: multiple ? undefined : presentation.frameWidth,
                    height: multiple ? Math.min(190, singleMediaFrameHeight * 0.68) : singleMediaFrameHeight,
                    backgroundColor: colors.surface,
                    borderColor: `${colors.buy}35`,
                  },
                ]}
              >
                {presentation.showBlurredBackdrop ? (
                  <Image
                    source={{ uri: media.url }}
                    style={[StyleSheet.absoluteFill, styles.postImageBlurredBackdrop]}
                    contentFit="cover"
                    blurRadius={18}
                    cachePolicy="memory-disk"
                    transition={120}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                ) : null}
                <Image
                  source={{ uri: media.url }}
                  style={styles.postImage}
                  contentFit={presentation.contentFit}
                  cachePolicy="memory-disk"
                  transition={120}
                  accessibilityLabel={`Community post image ${index + 1}`}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {post.kind === 'announcement' ? (
        <Text style={[styles.disclaimer, { color: colors.buy }]}>Official FXSnap event announcement</Text>
      ) : null}
      <View style={[styles.actions, compact && styles.compactActions, feedStyle && styles.feedActions, { borderTopColor: colors.cardBorder }]}>
        <View ref={reactionAnchorRef} collapsable={false}>
          <View style={styles.reactionControl}>
            <TouchableOpacity
              onPress={handleDefaultReaction}
              onLongPress={openReactionPicker}
              delayLongPress={500}
              disabled={reactionBusy}
              style={[styles.action, styles.reactionAction, compact && styles.compactAction, feedStyle && styles.feedAction]}
              accessibilityRole="button"
              accessibilityLabel={`${selectedReactionInfo?.label || 'Love'} reaction. ${reactionCount} total. Activate to toggle Love; long press for more reactions.`}
              accessibilityState={{ expanded: Boolean(reactionPicker), disabled: reactionBusy }}
              accessibilityActions={[{ name: 'longpress', label: 'Choose a reaction' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'longpress') openReactionPicker();
              }}
            >
              <Animated.Text style={[styles.reactionEmoji, reactionAnimatedStyle]}>{selectedReactionInfo?.emoji || '❤️'}</Animated.Text>
              <Text style={[
                styles.actionLabel,
                (compact || feedStyle) && styles.compactActionLabel,
                { color: selectedReaction ? colors.sell : colors.textSecondary },
              ]}>
                {formatCompactCommunityCount(reactionCount)}
              </Text>
            </TouchableOpacity>
            {!feedStyle ? (
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
            ) : null}
          </View>
        </View>
        <TouchableOpacity onPress={onComment} style={[styles.action, compact && styles.compactAction, feedStyle && styles.feedAction]} accessibilityRole="button" accessibilityLabel="Comment on post">
          <Feather name="message-circle" size={compact || feedStyle ? 16 : 18} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, (compact || feedStyle) && styles.compactActionLabel, { color: colors.textSecondary }]}>
            {compact || feedStyle ? formatCompactCommunityCount(post.commentCount) : `Discuss${post.commentCount ? ` · ${formatCompactCommunityCount(post.commentCount)}` : ''}`}
          </Text>
        </TouchableOpacity>
        {onRepost ? (
          <TouchableOpacity
            onPress={onRepost}
            disabled={repostBusy}
            style={[styles.action, compact && styles.compactAction, feedStyle && styles.feedAction]}
            accessibilityRole="button"
            accessibilityLabel={`${repostedByMe ? 'Undo repost' : 'Repost'}. ${formatCompactCommunityCount(repostCount)} reposts.`}
            accessibilityState={{ selected: repostedByMe, disabled: repostBusy }}
          >
            <Feather
              name="repeat"
              size={compact || feedStyle ? 15 : 17}
              color={repostedByMe ? colors.buy : colors.textSecondary}
              style={repostBusy ? { opacity: 0.55 } : undefined}
            />
            <Text style={[styles.actionLabel, (compact || feedStyle) && styles.compactActionLabel, { color: repostedByMe ? colors.buy : colors.textSecondary }]}>
              {compact || feedStyle
                ? repostCount ? formatCompactCommunityCount(repostCount) : ''
                : `${repostedByMe ? 'Reposted' : 'Repost'}${repostCount ? ` · ${formatCompactCommunityCount(repostCount)}` : ''}`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {onSave ? (
          <TouchableOpacity
            onPress={onSave}
            disabled={saveBusy}
            style={[styles.action, compact && styles.compactAction, feedStyle && styles.feedAction]}
            accessibilityRole="button"
            accessibilityLabel={post.savedByMe ? 'Remove from saved posts' : 'Save post'}
            accessibilityState={{ selected: post.savedByMe, disabled: saveBusy }}
          >
            <Feather name="bookmark" size={compact || feedStyle ? 15 : 17} color={post.savedByMe ? colors.buy : colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => onShare(shareableViewRef.current)}
          style={[styles.action, compact && styles.compactAction, feedStyle && styles.feedAction]}
          accessibilityRole="button"
          accessibilityLabel={`Share post. ${formatCompactCommunityCount(post.shareCount)} shares.`}
        >
          <Feather name="share-2" size={compact || feedStyle ? 15 : 17} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, (compact || feedStyle) && styles.compactActionLabel, { color: colors.textSecondary }]}>
            {compact || feedStyle
              ? post.shareCount > 0 ? formatCompactCommunityCount(post.shareCount) : ''
              : `Share${post.shareCount ? ` · ${formatCompactCommunityCount(post.shareCount)}` : ''}`}
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
      {imageViewerUrl ? (
        <CommunityImageViewer imageUrl={imageViewerUrl} onClose={() => setImageViewerUrl(null)} />
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

function PreviewDiscussionCard({
  instrument,
  heading,
  label,
  summary,
  onPress,
  colors,
}: {
  instrument: 'EURUSD' | 'XAUUSD';
  heading: string;
  label: string;
  summary: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const candles = [
    { x: 8, high: 83, open: 88, close: 77, low: 94, up: true },
    { x: 27, high: 70, open: 78, close: 84, low: 90, up: false },
    { x: 46, high: 75, open: 83, close: 66, low: 88, up: true },
    { x: 65, high: 58, open: 66, close: 72, low: 78, up: false },
    { x: 84, high: 62, open: 72, close: 52, low: 77, up: true },
    { x: 103, high: 41, open: 53, close: 46, low: 60, up: true },
    { x: 122, high: 34, open: 46, close: 58, low: 63, up: false },
    { x: 141, high: 48, open: 58, close: 40, low: 64, up: true },
    { x: 160, high: 31, open: 40, close: 35, low: 48, up: true },
    { x: 179, high: 25, open: 35, close: 30, low: 44, up: true },
    { x: 198, high: 21, open: 30, close: 39, low: 46, up: false },
  ];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.previewDiscussionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${heading} discussion`}
    >
      <View style={styles.previewChartFrame}>
        <Svg width="100%" height="100%" viewBox="0 0 220 120" preserveAspectRatio="none">
          <Rect width="220" height="120" fill="#102A3C" />
          {[30, 60, 90].map((y) => <Line key={y} x1="0" y1={y} x2="220" y2={y} stroke="#294657" strokeWidth="1" />)}
          {candles.map((candle) => {
            const color = candle.up ? '#12C78A' : '#F05F68';
            const top = Math.min(candle.open, candle.close);
            const height = Math.max(3, Math.abs(candle.open - candle.close));
            return (
              <React.Fragment key={candle.x}>
                <Line x1={candle.x + 4} y1={candle.high} x2={candle.x + 4} y2={candle.low} stroke={color} strokeWidth="2" />
                <Rect x={candle.x} y={top} width="8" height={height} fill={color} />
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={styles.previewInstrumentBadge}>
          <Text style={styles.previewInstrumentText}>{instrument}</Text>
        </View>
      </View>
      <View style={styles.previewDiscussionCopy}>
        <Text style={[styles.previewDiscussionLabel, { color: colors.buy }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.previewDiscussionHeading, { color: colors.text }]} numberOfLines={1}>{heading}</Text>
        <Text style={[styles.previewDiscussionSummary, { color: colors.textSecondary }]} numberOfLines={2}>{summary}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function PreviewPollCard({ poll, colors }: { poll: PreviewPollData; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.previewPollCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={[styles.previewPollIcon, { backgroundColor: colors.buy }]}>
        <Feather name="bar-chart-2" size={17} color={colors.primaryForeground} />
      </View>
      <View style={styles.previewPollContent}>
        <View style={styles.previewPollTitleRow}>
          <Text style={[styles.previewPollLabel, { color: colors.buy }]}>Poll</Text>
          <Text style={[styles.previewPollQuestion, { color: colors.text }]} numberOfLines={2}>{poll.question}</Text>
        </View>
        <Text style={[styles.previewPollMeta, { color: colors.textMuted }]}>Multiple choice · {poll.totalVotes} votes</Text>
        <View style={styles.previewPollOptions}>
          {poll.options.map((option) => (
            <View key={option.label} style={styles.previewPollOption}>
              <View style={styles.previewPollOptionTop}>
                <Text style={[styles.previewPollOptionLabel, { color: colors.textSecondary }]} numberOfLines={1}>{option.label}</Text>
                <Text style={[styles.previewPollPercent, { color: colors.textSecondary }]}>{option.percentage}%</Text>
              </View>
              <View style={[styles.previewPollTrack, { backgroundColor: colors.cardBorder }]}>
                <View style={[styles.previewPollFill, { backgroundColor: colors.buy, width: `${option.percentage}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function parseCommunityPoll(value: unknown): CommunityPoll | null {
  if (!value || typeof value !== 'object') return null;
  const poll = value as Partial<CommunityPoll>;
  if (typeof poll.question !== 'string' || !Array.isArray(poll.options)) return null;
  return poll as CommunityPoll;
}

function CommunityPollCard({
  poll,
  colors,
  onVote,
  busy,
}: {
  poll: CommunityPoll;
  colors: ReturnType<typeof useColors>;
  onVote?: (optionId: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(poll.selectedOptionId);
  useEffect(() => setSelected(poll.selectedOptionId), [poll.selectedOptionId]);
  const voted = Boolean(poll.selectedOptionId);
  const expired = Boolean(poll.endsAt && Date.parse(poll.endsAt) <= Date.now());
  return (
    <View style={[styles.previewPollCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={[styles.previewPollIcon, { backgroundColor: colors.buy }]}>
        <Feather name="bar-chart-2" size={17} color={colors.primaryForeground} />
      </View>
      <View style={styles.previewPollContent}>
        <View style={styles.previewPollTitleRow}>
          <Text style={[styles.previewPollLabel, { color: colors.buy }]}>POLL</Text>
          <Text style={[styles.realPollQuestion, { color: colors.text }]}>{poll.question}</Text>
        </View>
        <Text style={[styles.previewPollMeta, { color: colors.textMuted }]}>
          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
          {poll.endsAt ? ` · Ends ${new Date(poll.endsAt).toLocaleDateString()}` : ''}
        </Text>
        <View style={styles.previewPollOptions}>
          {poll.options.map((option) => {
            const result = poll.results.find((item) => item.optionId === option.id);
            const isSelected = selected === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => !voted && !expired && setSelected(option.id)}
                disabled={voted || expired || busy}
                style={[styles.realPollOption, { borderColor: isSelected ? colors.buy : colors.cardBorder }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled: voted || expired || busy }}
              >
                {voted ? (
                  <View style={[styles.realPollFill, { backgroundColor: `${colors.buy}20`, width: `${result?.percentage || 0}%` }]} />
                ) : null}
                <Text style={[styles.realPollOptionText, { color: colors.text }]}>{option.text}</Text>
                {voted ? <Text style={[styles.previewPollPercent, { color: colors.textSecondary }]}>{result?.percentage || 0}%</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {onVote && !voted && !expired ? (
          <TouchableOpacity
            onPress={() => selected && onVote(selected)}
            disabled={!selected || busy}
            style={[styles.pollVoteButton, { backgroundColor: selected ? colors.buy : colors.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel="Submit poll vote"
          >
            <Text style={[styles.pollVoteLabel, { color: selected ? colors.primaryForeground : colors.textMuted }]}>
              {busy ? 'Voting…' : 'Vote'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {expired ? <Text style={[styles.previewPollMeta, { color: colors.textMuted }]}>Poll closed</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 12, gap: 12 },
  compactCard: { borderRadius: 17, padding: 10, marginBottom: 0, gap: 9 },
  feedCard: { borderRadius: 19, padding: 14, marginBottom: 0, gap: 12, overflow: 'hidden', elevation: 1, shadowColor: '#17352A', shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 } },
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
  body: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  compactBody: { fontSize: 11, lineHeight: 16 },
  readMoreTarget: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: 8 },
  readMore: { alignSelf: 'flex-start', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_600SemiBold' },
  previewDiscussionCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 11, padding: 5 },
  previewChartFrame: { width: '40%', height: 77, overflow: 'hidden', borderRadius: 8, position: 'relative' },
  previewInstrumentBadge: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, backgroundColor: '#17374C' },
  previewInstrumentText: { color: '#FFFFFF', fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  previewDiscussionCopy: { flex: 1, minWidth: 0, gap: 4 },
  previewDiscussionLabel: { alignSelf: 'flex-start', fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  previewDiscussionHeading: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  previewDiscussionSummary: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  previewPollCard: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12, padding: 9 },
  previewPollIcon: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  previewPollContent: { flex: 1, gap: 6 },
  previewPollTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewPollLabel: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  previewPollQuestion: { flex: 1, fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  previewPollMeta: { fontSize: 8, fontFamily: 'Inter_400Regular' },
  previewPollOptions: { gap: 5 },
  previewPollOption: { gap: 2 },
  previewPollOptionTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  previewPollOptionLabel: { flex: 1, fontSize: 8, fontFamily: 'Inter_400Regular' },
  previewPollPercent: { fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  previewPollTrack: { height: 4, overflow: 'hidden', borderRadius: 3 },
  previewPollFill: { height: '100%', borderRadius: 3 },
  realPollQuestion: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_600SemiBold' },
  realPollOption: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative', overflow: 'hidden', borderWidth: 1, borderRadius: 11, paddingHorizontal: 11 },
  realPollFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  realPollOptionText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  pollVoteButton: { minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginTop: 3 },
  pollVoteLabel: { fontSize: 11, fontFamily: 'Inter_700Bold' },
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
  postMediaGallery: { width: '100%', alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  postMediaGallerySingle: { maxWidth: 400 },
  postImageFrame: { alignSelf: 'center', overflow: 'hidden', borderWidth: 1, borderRadius: 14, position: 'relative' },
  postImageBlurredBackdrop: { opacity: 0.58, transform: [{ scale: 1.08 }] },
  postImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  imageViewer: { flex: 1, backgroundColor: '#050807' },
  imageViewerCanvas: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  imageViewerImageWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '100%', height: '100%' },
  imageViewerClose: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17211FCC' },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-around' },
  compactActions: { borderTopWidth: 0, paddingTop: 0, justifyContent: 'space-between', gap: 2 },
  feedActions: { borderTopWidth: 0, paddingTop: 1, justifyContent: 'space-between', gap: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 6 },
  compactAction: { minHeight: 32, gap: 3, paddingHorizontal: 2 },
  feedAction: { minHeight: 34, gap: 5, paddingHorizontal: 3 },
  reactionControl: { flexDirection: 'row', alignItems: 'center' },
  reactionAction: { borderRadius: 12 },
  moreReactionButton: { width: 28, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  compactMoreReactionButton: { width: 18, minHeight: 32 },
  reactionEmoji: { fontSize: 18 },
  compactActionLabel: { fontSize: 8 },
  actionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reactionPicker: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', minHeight: 62, borderWidth: 1, borderRadius: 20, paddingHorizontal: 5, paddingVertical: 5, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  reactionOption: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, gap: 2 },
  reactionOptionEmoji: { fontSize: 23 },
});
