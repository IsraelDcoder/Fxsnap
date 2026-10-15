import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from 'react-native-keyboard-controller';
import { Image as CachedImage } from 'expo-image';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useApp, type AnalysisResult } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { signInWithGoogle, getAuthenticatedAccount, type FxsnapAccount } from '@/services/account';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_RULES_VERSION,
  blockCommunityMember,
  checkCommunityUsername,
  createCommunityClientId,
  type CommunityRequestError,
  deleteCommunityMessage,
  followCommunityMember,
  getCommunityBootstrap,
  getCommunityComments,
  getCommunityFollows,
  getCommunityMessages,
  getCommunityNotifications,
  getCommunityPost,
  getCommunityReplies,
  joinCommunity,
  publishCommunityComment,
  publishCommunityMessage,
  recordCommunityViews,
  reportCommunityMessage,
  shareCommunityPost,
  subscribeToCommunityChanges,
  subscribeToCommunityPresence,
  toggleCommunityReaction,
  updateCommunityMessage,
  unblockCommunityMember,
  unfollowCommunityMember,
  uploadCommunityImage,
  type CommunityAnalysisSnapshot,
  type CommunityCategory,
  type CommunityFeed,
  type CommunityMessage,
  type CommunityProfile,
  type CommunityReaction,
} from '@/services/community';
import { readCommunityFeedCache, writeCommunityFeedCache } from '@/services/communityFeedCache';
import {
  applyCommunityReaction,
  COMMUNITY_VIEW_BATCH_SIZE,
  COMMUNITY_VIEWABILITY_CONFIG,
  getNewVisiblePostIds,
} from '@/services/communityEngagement';
import CommunityPostCard from '@/components/CommunityPostCard';
import CommunityPreviewNotice from '@/components/CommunityPreviewNotice';

type ComposerKind = 'text' | 'signal' | 'analysis';
type CommunityNotification = {
  id: string;
  kind: string;
  message: string;
  object_id: string | null;
  post_id?: string | null;
  read_at: string | null;
  created_at: string;
};
type CommunityPostActionName = 'edit' | 'delete' | 'copy' | 'share' | 'share_link' | 'follow' | 'report' | 'block' | 'pin' | 'unpin' | 'remove';
type CommunityPostAction = {
  name: CommunityPostActionName;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  destructive?: boolean;
};

function apiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'The Community request failed. Please try again.';
  const requestId = (error as CommunityRequestError).requestId;
  return requestId ? `${error.message} Reference: ${requestId}` : error.message;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildAnalysisSnapshot(analysis: AnalysisResult): CommunityAnalysisSnapshot {
  const setup = analysis.tradeSetup;
  const targets = [
    ...(analysis.takeProfitLevels || []),
    ...(setup?.takeProfit ? [setup.takeProfit] : []),
    ...(analysis.tp ? [analysis.tp] : []),
  ].filter((item, index, all) => Boolean(item) && all.indexOf(item) === index).slice(0, 5);
  return {
    source: 'fxsnap_ai',
    sourceAnalysisId: analysis.id,
    sourceCreatedAt: analysis.createdAt,
    status: analysis.status || analysis.tradeStatus || 'unknown',
    pair: analysis.pair,
    timeframe: analysis.timeframe || null,
    direction: setup?.type && setup.type !== 'none' ? setup.type.toUpperCase() : analysis.direction || null,
    entry: setup?.entryZone || analysis.entry || null,
    stopLoss: setup?.stopLoss || analysis.sl || null,
    takeProfits: targets,
    riskReward: setup?.riskReward ?? null,
    marketBias: analysis.marketBias || analysis.analysis?.trend || null,
    reasoning: (analysis.reasoning || []).slice(0, 8),
  };
}

function ageLabel(isoDate: string) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return 'original time unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function upsertCommunityMessage(messages: CommunityMessage[], message: CommunityMessage) {
  const existingIndex = messages.findIndex((item) =>
    item.id === message.id || item.clientMessageId === message.clientMessageId);
  if (existingIndex < 0) return [...messages, message];
  return messages.map((item, index) => index === existingIndex ? message : item);
}

export default function CommunityScreen() {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postId?: string; shareAnalysisId?: string; category?: string }>();
  const postIdParam = firstParam(params.postId);
  const shareAnalysisId = firstParam(params.shareAnalysisId);
  const categoryParam = firstParam(params.category);
  const { currentAnalysis, savedAnalyses, isSubscribed } = useApp();
  const [account, setAccount] = useState<FxsnapAccount | null>(null);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [stage, setStage] = useState<'loading' | 'signed_out' | 'onboarding' | 'feed' | 'error'>('loading');
  const [screenError, setScreenError] = useState('');
  const [feed, setFeed] = useState<CommunityFeed>('global');
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [posts, setPosts] = useState<CommunityMessage[]>([]);
  const [reactionBusyIds, setReactionBusyIds] = useState<Set<string>>(() => new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [joining, setJoining] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityMessage | null>(null);
  const [composerKind, setComposerKind] = useState<ComposerKind>('text');
  const [composerCategory, setComposerCategory] = useState<CommunityCategory>('market_discussion');
  const [composerBody, setComposerBody] = useState('');
  const [composerImage, setComposerImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [composerImageUrl, setComposerImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [signalInstrument, setSignalInstrument] = useState('');
  const [signalDirection, setSignalDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [signalEntry, setSignalEntry] = useState('');
  const [signalStop, setSignalStop] = useState('');
  const [signalTargets, setSignalTargets] = useState('');
  const [signalTimeframe, setSignalTimeframe] = useState('');
  const [pendingAnalysis, setPendingAnalysis] = useState<CommunityAnalysisSnapshot | null>(null);
  const [commentPost, setCommentPost] = useState<CommunityMessage | null>(null);
  const [comments, setComments] = useState<CommunityMessage[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommunityMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<CommunityMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [onlineMemberCount, setOnlineMemberCount] = useState<number | null>(null);
  const [blocksVisible, setBlocksVisible] = useState(false);
  const [blocks, setBlocks] = useState<Array<{ accountId: string; username: string }>>([]);
  const [postActionsPost, setPostActionsPost] = useState<CommunityMessage | null>(null);
  const postActionsViewRef = useRef<View | null>(null);
  const [followedNames, setFollowedNames] = useState<string[]>([]);
  const flatListRef = useRef<FlashListRef<CommunityMessage>>(null);
  const recordedViewIds = useRef(new Map<string, number>());
  const pendingReactionIds = useRef(new Set<string>());
  const pendingFollowUsernames = useRef(new Set<string>());
  const commentSubmissionPending = useRef(false);
  const currentAccountIdRef = useRef<string | null>(null);
  const currentPostIdsRef = useRef(new Set<string>());
  const currentDiscussionMessageIdsRef = useRef(new Set<string>());
  const processedPostId = useRef<string | null>(null);
  const processedAnalysisId = useRef<string | null>(null);
  const skipBootstrapFeedFetch = useRef(false);
  const publishId = useRef<string | null>(null);
  const commentId = useRef<string | null>(null);
  const currentDiscussionIdRef = useRef<string | null>(null);
  const currentReplyTargetIdRef = useRef<string | null>(null);
  currentAccountIdRef.current = profile?.accountId || null;
  currentDiscussionIdRef.current = commentPost?.id || null;
  currentReplyTargetIdRef.current = replyTarget?.id || null;
  currentPostIdsRef.current = new Set(posts.map((post) => post.id));
  currentDiscussionMessageIdsRef.current = new Set([
    ...(commentPost ? [commentPost.id] : []),
    ...comments.map((comment) => comment.id),
    ...threadReplies.map((reply) => reply.id),
  ]);

  const loadFeed = useCallback(async (reset = true) => {
    if (stage !== 'feed' && !profile) return;
    if (reset) setLoadingFeed(true);
    else setLoadingMore(true);
    setFeedError('');
    try {
      const page = await getCommunityMessages({
        feed,
        category,
        before: reset ? null : nextCursor,
        limit: 30,
      });
      setPosts((previous) => {
        if (reset) return page.messages;
        const seen = new Set(previous.map((post) => post.id));
        return [...previous, ...page.messages.filter((post) => !seen.has(post.id))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setFollowingEmpty(page.followingEmpty === true);
      if (reset && profile && account?.email) {
        void writeCommunityFeedCache(account.email, feed, category, profile, page).catch((error) => {
          console.warn('[Community] Could not save the feed cache.', error);
        });
      }
    } catch (error) {
      setFeedError(apiErrorMessage(error));
    } finally {
      setLoadingFeed(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [account?.email, category, feed, nextCursor, profile, stage]);

  const refreshNotifications = useCallback(async () => {
    const result = await getCommunityNotifications();
    setNotifications(result.notifications);
  }, []);

  const bootstrap = useCallback(async () => {
    let cachedFeed: Awaited<ReturnType<typeof readCommunityFeedCache>> = null;
    setStage('loading');
    setScreenError('');
    try {
      const linkedAccount = await getAuthenticatedAccount();
      if (!linkedAccount) {
        setAccount(null);
        setStage('signed_out');
        return;
      }
      setAccount(linkedAccount);
      const initialCategory = COMMUNITY_CATEGORIES.find((item) => item.id === categoryParam)?.id || null;
      cachedFeed = await readCommunityFeedCache(linkedAccount.email, 'global', initialCategory)
        .catch((error: unknown) => {
          console.warn('[Community] Could not read the feed cache.', error);
          return null;
        });
      if (cachedFeed) {
        setCategory(initialCategory);
        setFeed('global');
        setPosts(cachedFeed.page.messages);
        setNextCursor(cachedFeed.page.nextCursor);
        setHasMore(cachedFeed.page.hasMore);
        setFollowingEmpty(cachedFeed.page.followingEmpty === true);
        setProfile(cachedFeed.profile);
        skipBootstrapFeedFetch.current = true;
        setStage('feed');
      }
      const membership = await getCommunityBootstrap({ feed: 'global', category: initialCategory, limit: 30 });
      if (!membership.profile) {
        setProfile(null);
        setStage('onboarding');
        return;
      }
      setCategory(initialCategory);
      setPosts(membership.messages);
      setNextCursor(membership.nextCursor);
      setHasMore(membership.hasMore);
      setFollowingEmpty(membership.followingEmpty === true);
      void writeCommunityFeedCache(
        linkedAccount.email,
        'global',
        initialCategory,
        membership.profile,
        membership,
      ).catch((error) => {
        console.warn('[Community] Could not save the feed cache.', error);
      });
      skipBootstrapFeedFetch.current = true;
      setProfile(membership.profile);
      setStage('feed');
    } catch (error) {
      if (cachedFeed) {
        setFeedError(apiErrorMessage(error));
        setStage('feed');
      } else {
        setScreenError(apiErrorMessage(error));
        setStage('error');
      }
    }
  }, [categoryParam]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const matchedCategory = COMMUNITY_CATEGORIES.find((item) => item.id === categoryParam);
    if (matchedCategory && category !== matchedCategory.id) setCategory(matchedCategory.id);
  }, [category, categoryParam]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) return;
    if (skipBootstrapFeedFetch.current) {
      skipBootstrapFeedFetch.current = false;
      return;
    }
    void loadFeed(true);
  }, [category, feed, profile, stage]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) return;
    const unsubscribe = subscribeToCommunityChanges((eventType, objectId) => {
      if (eventType === 'notification') {
        void refreshNotifications().catch((error) => {
          console.error('[Community] Could not refresh notifications.', error);
        });
      }
      if ((eventType !== 'message' && eventType !== 'announcement' && eventType !== 'reaction') || !objectId) return;
      if (eventType === 'reaction'
        && !currentPostIdsRef.current.has(objectId)
        && !currentDiscussionMessageIdsRef.current.has(objectId)) return;
      void getCommunityPost(objectId).then(({ post: changedPost }) => {
        if (eventType === 'reaction') {
          setPosts((previous) => previous.map((item) => item.id === changedPost.id ? changedPost : item));
          setComments((previous) => previous.map((item) => item.id === changedPost.id ? changedPost : item));
          setThreadReplies((previous) => previous.map((item) => item.id === changedPost.id ? changedPost : item));
          setCommentPost((current) => current?.id === changedPost.id ? changedPost : current);
          return;
        }
        if (changedPost.replyTo) {
          if (changedPost.replyTo.id === currentDiscussionIdRef.current) {
            setComments((previous) => upsertCommunityMessage(previous, changedPost));
          }
          if (changedPost.replyTo.id === currentReplyTargetIdRef.current) {
            setThreadReplies((previous) => upsertCommunityMessage(previous, changedPost));
          }
          return;
        }
        setPosts((previous) => {
          const existing = previous.some((item) => item.id === changedPost.id);
          if (existing) return previous.map((item) => item.id === changedPost.id ? changedPost : item);
          const isRecent = Date.now() - Date.parse(changedPost.createdAt) < 5 * 60_000;
          const matchesFeed = feed === 'global' || changedPost.isFollowed;
          const matchesCategory = !category || changedPost.category === category;
          return isRecent && matchesFeed && matchesCategory ? [changedPost, ...previous] : previous;
        });
        setCommentPost((current) => current?.id === changedPost.id ? changedPost : current);
      }).catch((error: unknown) => {
        console.error('[Community] Could not apply a live post update.', error);
      });
    });
    return () => {
      unsubscribe();
    };
  }, [category, feed, profile, refreshNotifications, stage]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) {
      setOnlineMemberCount(null);
      return;
    }
    setOnlineMemberCount(null);
    return subscribeToCommunityPresence(profile.accountId, setOnlineMemberCount);
  }, [profile, stage]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) return;
    void refreshNotifications().catch((error) => {
      console.error('[Community] Could not load notifications.', error);
    });
  }, [profile, refreshNotifications, stage]);

  useEffect(() => {
    if (!profile || stage !== 'feed') return;
    let active = true;
    void getCommunityFollows().then((result) => {
      if (active) setFollowedNames(result.following.map((item) => item.username));
    }).catch((error) => {
      console.error('[Community] Could not refresh followed traders.', error);
    });
    return () => { active = false; };
  }, [profile, stage]);

  useEffect(() => {
    if (stage !== 'feed' || !postIdParam || processedPostId.current === postIdParam) return;
    processedPostId.current = postIdParam;
    let active = true;
    void getCommunityPost(postIdParam).then(({ post }) => {
      if (!active) return;
      setCommentPost(post);
      setCommentsLoading(true);
      setComments([]);
      setThreadReplies([]);
      return getCommunityComments(post.id);
    }).then((result) => {
      if (active && result) {
        setComments(result.comments);
        setCommentsLoading(false);
      }
    }).catch((error) => {
      if (active) Alert.alert('Post unavailable', apiErrorMessage(error));
    });
    return () => { active = false; };
  }, [postIdParam, stage]);

  const analysisForSharing = useMemo(() => {
    if (!shareAnalysisId) return null;
    const selected = currentAnalysis?.id === shareAnalysisId
      ? currentAnalysis
      : savedAnalyses.find((analysis) => analysis.id === shareAnalysisId) || null;
    if (!selected) return null;
    if (!isSubscribed) {
      return {
        ...buildAnalysisSnapshot(selected),
        takeProfits: (selected.takeProfitLevels || (selected.tradeSetup?.takeProfit ? [selected.tradeSetup.takeProfit] : [])).slice(0, 1),
        riskReward: null,
      };
    }
    return buildAnalysisSnapshot(selected);
  }, [currentAnalysis, isSubscribed, savedAnalyses, shareAnalysisId]);

  const openComposer = useCallback((kind: ComposerKind = 'text', initialCategory?: CommunityCategory) => {
    setEditingPost(null);
    setComposerKind(kind);
    setComposerCategory(initialCategory || (kind === 'analysis' ? 'chart_analysis' : 'market_discussion'));
    setComposerBody('');
    setComposerImage(null);
    setComposerImageUrl(null);
    setComposerError('');
    publishId.current = null;
    setSignalInstrument('');
    setSignalDirection('BUY');
    setSignalEntry('');
    setSignalStop('');
    setSignalTargets('');
    setSignalTimeframe('');
    setComposerVisible(true);
  }, []);

  const editPost = (post: CommunityMessage) => {
    setEditingPost(post);
    setComposerKind('text');
    setComposerCategory(post.category || 'market_discussion');
    setComposerBody(post.body);
    setComposerImage(null);
    setComposerImageUrl(typeof post.payload.imageUrl === 'string' ? post.payload.imageUrl : null);
    setComposerError('');
    publishId.current = null;
    setComposerVisible(true);
  };

  useEffect(() => {
    if (stage !== 'feed' || !shareAnalysisId || processedAnalysisId.current === shareAnalysisId) return;
    if (!analysisForSharing) {
      if (currentAnalysis || savedAnalyses.length) {
        processedAnalysisId.current = shareAnalysisId;
        Alert.alert('Analysis unavailable', 'Return to the analysis result and choose Share to Community again.');
      }
      return;
    }
    processedAnalysisId.current = shareAnalysisId;
    setPendingAnalysis(analysisForSharing);
    openComposer('analysis', 'chart_analysis');
  }, [analysisForSharing, currentAnalysis, openComposer, savedAnalyses.length, shareAnalysisId, stage]);

  useEffect(() => {
    if (!shareAnalysisId) processedAnalysisId.current = null;
  }, [shareAnalysisId]);

  useEffect(() => {
    const normalized = username.trim().toLowerCase();
    setUsernameStatus(null);
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    let active = true;
    const timer = setTimeout(() => {
      void checkCommunityUsername(normalized).then((result) => {
        if (active) setUsernameStatus(result);
      }).catch((error) => {
        if (active) setUsernameStatus({ available: false, reason: apiErrorMessage(error) });
      }).finally(() => {
        if (active) setCheckingUsername(false);
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);

  const signIn = async () => {
    setSigningIn(true);
    setScreenError('');
    try {
      await signInWithGoogle();
      await bootstrap();
    } catch (error) {
      setScreenError(apiErrorMessage(error));
    } finally {
      setSigningIn(false);
    }
  };

  const finishJoin = async () => {
    if (!acceptedRules || !usernameStatus?.available || joining) return;
    setJoining(true);
    setScreenError('');
    try {
      const result = await joinCommunity(username.trim().toLowerCase());
      setAccount((current) => current ? { ...current, communityUsername: result.profile.username } : current);
      setProfile(result.profile);
      setStage('feed');
      setPosts([]);
      setTimeout(() => { void loadFeed(true); }, 0);
    } catch (error) {
      setScreenError(apiErrorMessage(error));
    } finally {
      setJoining(false);
    }
  };

  const chooseImage = async () => {
    setComposerError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setComposerError('Allow photo-library access to attach a chart screenshot.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        base64: true,
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.base64 || asset.base64.length > 4_200_000) {
        setComposerError('Choose an image under 3 MB.');
        return;
      }
      setComposerImageUrl(null);
      setComposerImage(asset);
    } catch (error) {
      setComposerError(apiErrorMessage(error));
    }
  };

  const submitPost = async () => {
    if (publishing || uploadingImage) return;
    const body = composerBody.trim();
    if (composerKind === 'text' && !body && !composerImage && !composerImageUrl) {
      setComposerError('Add some trading discussion or attach a chart.');
      return;
    }
    if (composerKind === 'signal'
      && (!signalInstrument.trim() || !signalEntry.trim() || !signalStop.trim()
        || !signalTargets.trim() || !signalTimeframe.trim())) {
      setComposerError('Complete the instrument, entry, stop loss, take profit, and timeframe.');
      return;
    }
    if (composerKind === 'analysis' && !pendingAnalysis) {
      setComposerError('The source analysis is no longer available. Reopen the result to share it.');
      return;
    }
    setPublishing(true);
    setComposerError('');
    try {
      let imageUrl = composerImageUrl;
      if (composerImage && !imageUrl) {
        setUploadingImage(true);
        const upload = await uploadCommunityImage(composerImage);
        imageUrl = upload.imageUrl;
        setComposerImageUrl(imageUrl);
        setUploadingImage(false);
      }
      const imageWidth = composerImage?.width
        ?? (typeof editingPost?.payload.imageWidth === 'number' ? editingPost.payload.imageWidth : undefined);
      const imageHeight = composerImage?.height
        ?? (typeof editingPost?.payload.imageHeight === 'number' ? editingPost.payload.imageHeight : undefined);
      const imageDimensions = imageWidth && imageHeight ? { imageWidth, imageHeight } : {};
      const payload = composerKind === 'signal'
        ? {
          instrument: signalInstrument.trim().toUpperCase(),
          direction: signalDirection,
          entry: signalEntry.trim(),
          stopLoss: signalStop.trim(),
          takeProfits: signalTargets.split(',').map((target) => target.trim()).filter(Boolean),
          timeframe: signalTimeframe.trim(),
          reasoning: body,
          imageUrl,
          ...imageDimensions,
        }
        : composerKind === 'analysis'
          ? { ...pendingAnalysis, imageUrl, ...imageDimensions }
          : { imageUrl, ...imageDimensions };
      const message = editingPost
        ? (await updateCommunityMessage(editingPost.id, {
          body,
          category: composerCategory,
          imageUrl,
          ...imageDimensions,
        })).message
        : (await publishCommunityMessage({
          kind: composerKind,
          category: composerCategory,
          body,
          payload,
          clientMessageId: publishId.current || (publishId.current = createCommunityClientId()),
        })).message;
      setPosts((previous) => editingPost
        ? previous.map((post) => post.id === message.id ? message : post)
        : [message, ...previous.filter((post) => post.id !== message.id)]);
      setCommentPost((previous) => previous?.id === message.id ? message : previous);
      setComposerVisible(false);
      setEditingPost(null);
      setPendingAnalysis(null);
      setComposerBody('');
      setComposerImage(null);
      publishId.current = null;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (error) {
      setUploadingImage(false);
      setComposerError(apiErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  const openComments = async (post: CommunityMessage) => {
    setCommentPost(post);
    setCommentDraft('');
    setReplyTarget(null);
    setThreadReplies([]);
    setComments([]);
    setCommentsLoading(true);
    try {
      const result = await getCommunityComments(post.id);
      setComments(result.comments);
    } catch (error) {
      Alert.alert('Could not load discussion', apiErrorMessage(error));
    } finally {
      setCommentsLoading(false);
    }
  };

  const startReply = async (target: CommunityMessage) => {
    if (!commentPost) return;
    setReplyTarget(target);
    if (target.id === commentPost.id) {
      setThreadReplies([]);
      return;
    }
    setThreadLoading(true);
    try {
      const result = await getCommunityReplies(commentPost.id, target.id);
      setThreadReplies(result.comments);
    } catch (error) {
      Alert.alert('Could not load replies', apiErrorMessage(error));
    } finally {
      setThreadLoading(false);
    }
  };

  const submitComment = async () => {
    const body = commentDraft.trim();
    if (!commentPost || !body || commentSubmissionPending.current) return;
    commentSubmissionPending.current = true;
    const clientMessageId = commentId.current || (commentId.current = createCommunityClientId());
    const target = replyTarget || commentPost;
    const optimisticId = `pending-${clientMessageId}`;
    const optimisticMessage: CommunityMessage = {
      id: optimisticId,
      clientMessageId,
      authorAccountId: profile?.accountId || '',
      authorUsername: profile?.username || '',
      authorPictureUrl: profile?.pictureUrl || null,
      isOfficial: profile?.isAdmin || false,
      isFollowed: false,
      kind: 'text',
      category: null,
      body,
      payload: {},
      replyTo: {
        id: target.id,
        author_username: target.authorUsername,
        body: target.body,
        kind: target.kind,
        removed_at: target.removed ? target.createdAt : null,
      },
      pinnedAt: null,
      createdAt: new Date().toISOString(),
      commentCount: 0,
      viewCount: 0,
      shareCount: 0,
      removed: false,
      reactions: [],
    };
    setCommentSending(true);
    if (replyTarget && replyTarget.id !== commentPost.id) {
      setThreadReplies((previous) => [...previous, optimisticMessage]);
    } else {
      setComments((previous) => [...previous, optimisticMessage]);
    }
    setPosts((previous) => previous.map((post) => post.id === commentPost.id
      ? { ...post, commentCount: post.commentCount + 1 }
      : post));
    setCommentPost((previous) => previous?.id === commentPost.id
      ? { ...previous, commentCount: previous.commentCount + 1 }
      : previous);
    try {
      const result = await publishCommunityComment(
        commentPost.id,
        body,
        clientMessageId,
        replyTarget?.id,
      );
      if (replyTarget && replyTarget.id !== commentPost.id) {
        setThreadReplies((previous) => previous.map((item) => item.id === optimisticId ? result.message : item));
      } else {
        setComments((previous) => previous.map((item) => item.id === optimisticId ? result.message : item));
      }
      setCommentDraft('');
      commentId.current = null;
    } catch (error) {
      if (replyTarget && replyTarget.id !== commentPost.id) {
        setThreadReplies((previous) => previous.filter((item) => item.id !== optimisticId));
      } else {
        setComments((previous) => previous.filter((item) => item.id !== optimisticId));
      }
      setPosts((previous) => previous.map((post) => post.id === commentPost.id
        ? { ...post, commentCount: Math.max(0, post.commentCount - 1) }
        : post));
      setCommentPost((previous) => previous?.id === commentPost.id
        ? { ...previous, commentCount: Math.max(0, previous.commentCount - 1) }
        : previous);
      Alert.alert('Could not send reply', apiErrorMessage(error));
    } finally {
      commentSubmissionPending.current = false;
      setCommentSending(false);
    }
  };

  const handleReaction = async (post: CommunityMessage, reaction: CommunityReaction) => {
    if (pendingReactionIds.current.has(post.id)) return;
    pendingReactionIds.current.add(post.id);
    setReactionBusyIds((current) => new Set(current).add(post.id));
    const previousReactions = post.reactions;
    const optimisticReactions = applyCommunityReaction(previousReactions, reaction);
    setPosts((previous) => previous.map((item) => item.id === post.id
      ? { ...item, reactions: optimisticReactions }
      : item));
    setCommentPost((current) => current?.id === post.id
      ? { ...current, reactions: optimisticReactions }
      : current);
    try {
      const result = await toggleCommunityReaction(post.id, reaction);
      setPosts((previous) => previous.map((item) => item.id === post.id
        ? { ...item, reactions: result.reactions }
        : item));
      setCommentPost((current) => current?.id === post.id
        ? { ...current, reactions: result.reactions }
        : current);
    } catch (error) {
      setPosts((previous) => previous.map((item) => item.id === post.id
        ? { ...item, reactions: previousReactions }
        : item));
      setCommentPost((current) => current?.id === post.id
        ? { ...current, reactions: previousReactions }
        : current);
      Alert.alert('Could not update reaction', apiErrorMessage(error));
    } finally {
      pendingReactionIds.current.delete(post.id);
      setReactionBusyIds((current) => {
        const updated = new Set(current);
        updated.delete(post.id);
        return updated;
      });
    }
  };

  const handleFollow = async (post: CommunityMessage) => {
    if (pendingFollowUsernames.current.has(post.authorUsername)) return;
    pendingFollowUsernames.current.add(post.authorUsername);
    const wasFollowing = post.isFollowed;
    const nextFollowing = !wasFollowing;
    setPosts((previous) => previous.map((item) => item.authorUsername === post.authorUsername
      ? { ...item, isFollowed: nextFollowing }
      : item));
    setCommentPost((current) => current?.authorUsername === post.authorUsername
      ? { ...current, isFollowed: nextFollowing }
      : current);
    setPostActionsPost((current) => current?.authorUsername === post.authorUsername
      ? { ...current, isFollowed: nextFollowing }
      : current);
    setFollowedNames((previous) => wasFollowing
      ? previous.filter((name) => name !== post.authorUsername)
      : previous.includes(post.authorUsername) ? previous : [...previous, post.authorUsername]);
    try {
      if (wasFollowing) await unfollowCommunityMember(post.authorUsername);
      else await followCommunityMember(post.authorUsername);
    } catch (error) {
      setPosts((previous) => previous.map((item) => item.authorUsername === post.authorUsername
        ? { ...item, isFollowed: wasFollowing }
        : item));
      setCommentPost((current) => current?.authorUsername === post.authorUsername
        ? { ...current, isFollowed: wasFollowing }
        : current);
      setPostActionsPost((current) => current?.authorUsername === post.authorUsername
        ? { ...current, isFollowed: wasFollowing }
        : current);
      setFollowedNames((previous) => wasFollowing
        ? previous.includes(post.authorUsername) ? previous : [...previous, post.authorUsername]
        : previous.filter((name) => name !== post.authorUsername));
      Alert.alert('Could not update following', apiErrorMessage(error));
    } finally {
      pendingFollowUsernames.current.delete(post.authorUsername);
    }
  };

  const askReportReason = (post: CommunityMessage) => {
    Alert.alert(
      post.replyTo ? 'Report this comment' : 'Report this post',
      'Choose the reason that best describes the issue.',
      [
      ...[
        ['spam', 'Spam'],
        ['scam', 'Scam or fraud'],
        ['harassment', 'Harassment'],
        ['impersonation', 'Impersonation'],
        ['suspicious_signal', 'Suspicious trading claim'],
        ['other', 'Other'],
      ].map(([reason, label]) => ({
        text: label,
        onPress: () => {
          void reportCommunityMessage(post.id, reason).then(() => Alert.alert('Report sent', 'The FXSnap moderation team will review it.'))
            .catch((error) => Alert.alert('Could not send report', apiErrorMessage(error)));
        },
      })),
      { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const runPostAction = (action: CommunityPostActionName, post: CommunityMessage) => {
    const cardView = postActionsViewRef.current;
    postActionsViewRef.current = null;
    setPostActionsPost(null);
    if (action === 'edit') {
      editPost(post);
    } else if (action === 'delete') {
      Alert.alert(
        post.replyTo ? 'Delete this comment?' : 'Delete this post?',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void deleteCommunityMessage(post.id).then(() => {
                if (post.replyTo) {
                  setComments((previous) => previous.filter((item) => item.id !== post.id));
                  setThreadReplies((previous) => previous.filter((item) => item.id !== post.id && item.replyTo?.id !== post.id));
                  if (commentPost) {
                    setPosts((previous) => previous.map((item) => item.id === commentPost.id
                      ? { ...item, commentCount: Math.max(0, item.commentCount - 1) }
                      : item));
                    setCommentPost((previous) => previous?.id === commentPost.id
                      ? { ...previous, commentCount: Math.max(0, previous.commentCount - 1) }
                      : previous);
                  }
                } else {
                  setPosts((previous) => previous.filter((item) => item.id !== post.id));
                  if (commentPost?.id === post.id) setCommentPost(null);
                }
              }).catch((error) => Alert.alert('Could not delete content', apiErrorMessage(error)));
            },
          },
        ],
      );
    } else if (action === 'copy') {
      void Clipboard.setStringAsync(`${post.body}\n\n@${post.authorUsername} · FXSnap Community`)
        .then(() => Alert.alert('Copied', 'Post text copied to clipboard.'))
        .catch((error) => Alert.alert('Could not copy post', apiErrorMessage(error)));
    } else if (action === 'share') {
      void sharePost(post, cardView);
    } else if (action === 'share_link') {
      void sharePost(post, null);
    } else if (action === 'follow') {
      void handleFollow(post);
    } else if (action === 'report') {
      askReportReason(post);
    } else if (action === 'block') {
      Alert.alert('Block trader?', 'Their posts and interactions will be hidden from your Community feed.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              void blockCommunityMember(post.authorUsername).then(() => {
                setPosts((previous) => previous.filter((item) => item.authorUsername !== post.authorUsername));
              }).catch((error) => Alert.alert('Could not block trader', apiErrorMessage(error)));
            },
          },
        ]);
    } else if (action === 'pin' || action === 'unpin') {
      void moderate(action, post);
    } else {
      void moderate('remove_message', post);
    }
  };

  const showPostActions = (post: CommunityMessage, cardView: View | null = null) => {
    postActionsViewRef.current = cardView;
    setPostActionsPost(post);
  };

  const moderate = async (action: 'pin' | 'unpin' | 'remove_message', post: CommunityMessage) => {
    try {
      const headers = await (await import('@/services/account')).getFxsnapAccountApiHeaders();
      const response = await fetch(`${(await import('@/services/apiAuth')).API_BASE_URL}/api/admin/community/moderation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, messageId: post.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The moderation action failed.');
      if (action === 'remove_message') setPosts((previous) => previous.filter((item) => item.id !== post.id));
      else setPosts((previous) => previous.map((item) => item.id === post.id
        ? { ...item, pinnedAt: action === 'pin' ? new Date().toISOString() : null }
        : item));
    } catch (error) {
      Alert.alert('Could not moderate post', apiErrorMessage(error));
    }
  };

  const sharePost = async (post: CommunityMessage, cardView: View | null) => {
    try {
      const shareCount = await shareCommunityPost(post, cardView);
      if (shareCount !== null) {
        setPosts((previous) => previous.map((item) => item.id === post.id ? { ...item, shareCount } : item));
        setCommentPost((current) => current?.id === post.id ? { ...current, shareCount } : current);
      }
    } catch (error) {
      Alert.alert('Could not share post', apiErrorMessage(error));
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const accountId = currentAccountIdRef.current;
    if (!accountId) return;
    const visiblePosts = viewableItems
      .filter((token) => token.isViewable && token.item)
      .map((token) => token.item as CommunityMessage);
    const newIds = getNewVisiblePostIds(visiblePosts, accountId, recordedViewIds.current);
    if (!newIds.length) return;
    for (const id of newIds) recordedViewIds.current.set(`${accountId}:${id}`, Date.now());
    for (let offset = 0; offset < newIds.length; offset += COMMUNITY_VIEW_BATCH_SIZE) {
      const batch = newIds.slice(offset, offset + COMMUNITY_VIEW_BATCH_SIZE);
      void recordCommunityViews(batch).then(({ views }) => {
        const countById = new Map(views.map((view) => [view.messageId, view.viewCount]));
        setPosts((previous) => previous.map((post) => countById.has(post.id)
          ? { ...post, viewCount: countById.get(post.id) ?? post.viewCount }
          : post));
        setCommentPost((current) => current && countById.has(current.id)
          ? { ...current, viewCount: countById.get(current.id) ?? current.viewCount }
          : current);
      }).catch((error: unknown) => {
        for (const id of batch) recordedViewIds.current.delete(`${accountId}:${id}`);
        console.warn('Community post impressions could not be recorded.', error instanceof Error ? error.message : error);
      });
    }
  }).current;

  const openNotifications = () => {
    router.push('/community-notifications');
  };

  const openHeaderMenu = () => {
    Alert.alert('Community', undefined, [
      { text: 'Create chart post', onPress: () => openComposer('text', 'chart_analysis') },
      { text: 'Share trading signal', onPress: () => openComposer('signal', 'chart_analysis') },
      ...(profile?.isAdmin ? [{ text: 'Post announcement', onPress: () => openComposer('text', 'events') }] : []),
      { text: 'Manage blocked traders', onPress: () => void openBlockedMembers() },
      { text: 'Contact FXSnap support', onPress: () => Alert.alert('Coming soon', 'Help & Support will be available in a future update.') },
      ...(profile?.isAdmin ? [{ text: 'Moderation tools', onPress: () => router.push('/community-admin') }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openBlockedMembers = async () => {
    try {
      const result = await (await import('@/services/community')).getCommunityBlocks();
      setBlocks(result.blocks);
      setBlocksVisible(true);
    } catch (error) {
      Alert.alert('Blocked members unavailable', apiErrorMessage(error));
    }
  };

  const renderPost = ({ item }: { item: CommunityMessage }) => (
    <View style={styles.feedPostCell}>
      <CommunityPostCard
        post={item}
        feedStyle
        reactionBusy={reactionBusyIds.has(item.id)}
        ownAccount={item.authorUsername === profile?.username}
        onReact={(reaction) => void handleReaction(item, reaction)}
        onComment={() => void openComments(item)}
        onShare={(cardView) => void sharePost(item, cardView)}
        onMore={(cardView) => showPostActions(item, cardView)}
        onFollow={() => void handleFollow(item)}
        onAuthorPress={() => router.push({ pathname: '/community-member', params: { username: item.authorUsername } })}
      />
    </View>
  );

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const visibleCategories = COMMUNITY_CATEGORIES.filter((item) => profile?.isAdmin || item.id !== 'events');
  const postActionItems = useMemo<CommunityPostAction[]>(() => {
    if (!postActionsPost) return [];
    const ownPost = postActionsPost.authorUsername === profile?.username;
    return [
      ...(ownPost && !postActionsPost.replyTo && postActionsPost.kind === 'text'
        ? [{ name: 'edit' as const, label: 'Edit post', description: 'Update your post content.', icon: 'edit-2' as const }]
        : []),
      { name: 'share', label: 'Share post', description: 'Share this discussion using your device.', icon: 'share-2' },
      ...(!postActionsPost.replyTo
        ? [{ name: 'share_link' as const, label: 'Share post link', description: 'Share the post link and count it when the device confirms sharing.', icon: 'link' as const }]
        : []),
      { name: 'copy', label: 'Copy post text', description: 'Copy the text and author to your clipboard.', icon: 'copy' },
      ...(!ownPost && !postActionsPost.isOfficial
        ? [{
          name: 'follow' as const,
          label: postActionsPost.isFollowed ? 'Unfollow trader' : 'Follow trader',
          description: 'Control whether this member appears in your Following feed.',
          icon: 'user-plus' as const,
        }]
        : []),
      ...(!ownPost
        ? [{
          name: 'report' as const,
          label: postActionsPost.replyTo ? 'Report comment' : 'Report post',
          description: 'Send this content to FXSnap moderators for review.',
          icon: 'flag' as const,
          destructive: true,
        }]
        : []),
      ...(ownPost
        ? [{
          name: 'delete' as const,
          label: postActionsPost.replyTo ? 'Delete comment' : 'Delete post',
          description: 'This content will be removed from Community.',
          icon: 'trash-2' as const,
          destructive: true,
        }]
        : []),
      ...(!ownPost && !postActionsPost.isOfficial
        ? [{
          name: 'block' as const,
          label: 'Block trader',
          description: 'Hide this member’s posts and interactions from your feed.',
          icon: 'slash' as const,
          destructive: true,
        }]
        : []),
      ...(profile?.isAdmin
        ? [
          {
            name: postActionsPost.pinnedAt ? 'unpin' as const : 'pin' as const,
            label: postActionsPost.pinnedAt ? 'Unpin discussion' : 'Pin discussion',
            description: 'Change the visibility of this discussion for the community.',
            icon: 'bookmark' as const,
          },
          {
            name: 'remove' as const,
            label: 'Remove content',
            description: 'Remove this item through moderator controls.',
            icon: 'shield' as const,
            destructive: true,
          },
        ]
        : []),
    ];
  }, [postActionsPost, profile?.isAdmin, profile?.username]);

  if (stage === 'loading') {
    return <CenteredMessage colors={colors} insets={insets} title="Opening FXSnap Community" body="Connecting to the global trading floor." loading />;
  }

  if (stage === 'signed_out') {
    return (
      <CenteredMessage
        colors={colors}
        insets={insets}
        title="Join the trading conversation"
        body="Sign in with your existing Google-linked FXSnap account. No extra password or account is needed."
        actionLabel={signingIn ? 'Connecting…' : 'Continue with Google'}
        onAction={() => void signIn()}
        loading={signingIn}
        error={screenError}
        onBack={() => router.back()}
      />
    );
  }

  if (stage === 'error') {
    return (
      <CenteredMessage
        colors={colors}
        insets={insets}
        title="Community is not available yet"
        body={screenError || 'Please try again later.'}
        actionLabel="Try again"
        onAction={() => void bootstrap()}
        onBack={() => router.back()}
      />
    );
  }

  if (stage === 'onboarding') {
    return (
      <NativeKeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.onboardingHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Go back">
            <Feather name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Join Community</Text>
          <View style={styles.headerIcon} />
        </View>
        <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.communityMark, { backgroundColor: `${colors.buy}18` }]}>
            <Feather name="users" size={27} color={colors.buy} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Learn with traders, not at them.</Text>
          <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
            Share chart ideas, talk through the markets, and build your trading knowledge together.
          </Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            Joining as {account?.displayName || account?.email || 'your FXSnap account'}
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Choose your community username</Text>
          <View style={[styles.usernameField, { backgroundColor: colors.card, borderColor: usernameStatus?.available ? colors.buy : colors.cardBorder }]}>
            <Text style={[styles.atSign, { color: colors.textMuted }]}>@</Text>
            <TextInput
              value={username}
              onChangeText={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24))}
              placeholder="your_trader_name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              style={[styles.usernameInput, { color: colors.text }]}
              accessibilityLabel="Community username"
            />
            {checkingUsername ? <ActivityIndicator size="small" color={colors.buy} /> : null}
          </View>
          <Text style={[styles.helperText, { color: usernameStatus?.available ? colors.buy : colors.textMuted }]}>
            {usernameStatus?.reason || (usernameStatus?.available ? 'That username is available.' : '3–24 lowercase letters, numbers, or underscores.')}
          </Text>
          <View style={[styles.rulesCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.rulesTitle, { color: colors.text }]}>A trading-first community</Text>
            <RuleLine text="Discuss forex, gold, crypto, charts, and market education respectfully." colors={colors} />
            <RuleLine text="Share evidence and uncertainty. Never promise guaranteed outcomes." colors={colors} />
            <RuleLine text="Signals are member opinions, not official FXSnap recommendations." colors={colors} />
            <RuleLine text="Report scams or abuse; do not post personal or account credentials." colors={colors} />
          </View>
          <TouchableOpacity onPress={() => setAcceptedRules((value) => !value)} style={styles.acceptRow} accessibilityRole="checkbox" accessibilityState={{ checked: acceptedRules }}>
            <View style={[styles.checkbox, { borderColor: acceptedRules ? colors.buy : colors.cardBorder, backgroundColor: acceptedRules ? colors.buy : 'transparent' }]}>
              {acceptedRules ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
            </View>
            <Text style={[styles.acceptText, { color: colors.textSecondary }]}>
              I accept the FXSnap Community rules ({COMMUNITY_RULES_VERSION}).
            </Text>
          </TouchableOpacity>
          {screenError ? <Text style={[styles.errorText, { color: colors.sell }]}>{screenError}</Text> : null}
          <TouchableOpacity
            onPress={() => void finishJoin()}
            disabled={!acceptedRules || !usernameStatus?.available || joining}
            style={[styles.primaryButton, { backgroundColor: acceptedRules && usernameStatus?.available ? colors.buy : colors.surface }]}
          >
            {joining ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: acceptedRules && usernameStatus?.available ? colors.primaryForeground : colors.textMuted }]}>Join FXSnap Community</Text>}
          </TouchableOpacity>
          <Text style={[styles.privacyNote, { color: colors.textMuted }]}>Your FXSnap account is used to secure your community identity. Your email is not shown in posts.</Text>
        </ScrollView>
      </NativeKeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(260)}
        style={[styles.header, { paddingTop: insets.top + 4, borderBottomColor: colors.cardBorder }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Community</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/community-search')} style={styles.headerIcon} accessibilityLabel="Search Community">
          <Feather name="search" size={19} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void openNotifications()} style={styles.headerIcon} accessibilityLabel="Community notifications">
          <Feather name="bell" size={19} color={colors.text} />
          {unreadCount > 0 ? <View style={[styles.notificationDot, { backgroundColor: colors.sell }]} /> : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={openHeaderMenu} style={styles.headerIcon} accessibilityLabel="More Community options">
          <Feather name="more-horizontal" size={20} color={colors.text} />
        </TouchableOpacity>
      </Animated.View>
      <FlashList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        viewabilityConfig={COMMUNITY_VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged}
        drawDistance={600}
        extraData={profile?.username}
        contentContainerStyle={[styles.feedContent, { paddingBottom: insets.bottom + 112 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void loadFeed(true); }}
            tintColor={colors.buy}
          />
        }
        onEndReached={() => {
          if (hasMore && !loadingMore && nextCursor) void loadFeed(false);
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <CommunityPreviewNotice />
            <Animated.View
              entering={reduceMotion ? undefined : FadeInDown.delay(50).duration(300)}
              style={styles.feedTabRow}
            >
              <View style={styles.feedTabs}>
                {(['global', 'following'] as const).map((item) => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setFeed(item)}
                    style={[styles.feedTab, {
                      borderColor: feed === item ? colors.buy : colors.cardBorder,
                      backgroundColor: feed === item ? colors.buy : colors.card,
                    }]}
                  >
                    <Text style={[styles.feedTabText, { color: feed === item ? colors.primaryForeground : colors.textSecondary }]}>{item === 'global' ? 'For you' : 'Following'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.onlineBanner} accessibilityRole="summary">
                <View style={[styles.onlineDot, { backgroundColor: onlineMemberCount == null ? colors.textMuted : colors.buy }]} />
                <Text style={[styles.onlineLabel, { color: colors.textSecondary }]}>
                  {onlineMemberCount == null ? 'Live' : `${onlineMemberCount} online`}
                </Text>
              </View>
            </Animated.View>
            <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(100).duration(300)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
                <TouchableOpacity
                  onPress={() => setCategory(null)}
                  style={[styles.categoryChip, { backgroundColor: category === null ? colors.buy : colors.card, borderColor: category === null ? colors.buy : colors.cardBorder }]}
                >
                  <Text style={[styles.categoryText, { color: category === null ? colors.primaryForeground : colors.textSecondary }]}>All topics</Text>
                </TouchableOpacity>
                {visibleCategories.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setCategory(item.id)}
                    style={[styles.categoryChip, { backgroundColor: category === item.id ? colors.buy : colors.card, borderColor: category === item.id ? colors.buy : colors.cardBorder }]}
                  >
                    <Text style={[styles.categoryText, { color: category === item.id ? colors.primaryForeground : colors.textSecondary }]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
            {feedError ? (
              <View style={[styles.inlineError, { backgroundColor: `${colors.sell}10` }]}>
                <Text style={[styles.errorText, { color: colors.sell }]}>{feedError}</Text>
                <TouchableOpacity onPress={() => void loadFeed(true)}><Text style={[styles.retryText, { color: colors.sell }]}>Retry</Text></TouchableOpacity>
              </View>
            ) : null}
            {followingEmpty ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="users" size={24} color={colors.buy} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Your learning circle starts here</Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Follow traders whose educational posts you find useful. Their posts will appear in this feed.</Text>
                {followedNames.length ? <Text style={[styles.metaText, { color: colors.textMuted }]}>Following {followedNames.map((name) => `@${name}`).join(', ')}</Text> : null}
              </View>
            ) : null}
            {loadingFeed && posts.length === 0 ? (
              <View style={styles.feedLoading}><ActivityIndicator color={colors.buy} /><Text style={[styles.metaText, { color: colors.textSecondary }]}>Loading trading discussions…</Text></View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !loadingFeed && !feedError && !followingEmpty ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="book-open" size={24} color={colors.buy} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Start a useful discussion</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Ask a question, explain a trading concept, or share a chart and invite thoughtful feedback.</Text>
              <TouchableOpacity onPress={() => openComposer('text')} style={[styles.emptyAction, { backgroundColor: colors.buy }]}>
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Create the first post</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 18 }} color={colors.buy} /> : hasMore ? (
            <TouchableOpacity onPress={() => void loadFeed(false)} style={styles.loadMoreButton}>
              <Text style={[styles.loadMoreText, { color: colors.buy }]}>Load older discussions</Text>
            </TouchableOpacity>
          ) : null
        }
      />
      <TouchableOpacity
        onPress={() => openComposer('text')}
        style={[styles.fab, { backgroundColor: colors.buy, bottom: Math.max(insets.bottom, 9) + 85 }]}
        accessibilityLabel="Create a community post"
      >
        <Feather name="plus" size={24} color={colors.primaryForeground} />
      </TouchableOpacity>
      <View style={[styles.bottomNav, { backgroundColor: colors.background, borderTopColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6) }]}>
        <BottomItem icon="home" label="Home" colors={colors} onPress={() => router.replace('/(tabs)/home')} />
        <BottomItem icon="users" label="Community" active colors={colors} onPress={() => {}} />
        <TouchableOpacity onPress={() => router.push('/analysis')} style={styles.centerTab} accessibilityLabel="Open FXSnap AI analysis">
          <View style={[styles.centerTabCircle, { backgroundColor: colors.buy }]}>
            <Feather name="aperture" size={23} color={colors.primaryForeground} />
          </View>
        </TouchableOpacity>
        <BottomItem icon="calendar" label="Events" colors={colors} onPress={() => router.push('/events')} />
        <BottomItem icon="user" label="Profile" colors={colors} onPress={() => router.push('/profile')} />
      </View>

      <Modal visible={composerVisible} animationType="slide" onRequestClose={() => setComposerVisible(false)}>
        <NativeKeyboardAvoidingView style={[styles.modalScreen, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <TouchableOpacity onPress={() => setComposerVisible(false)} style={styles.headerIcon} accessibilityLabel="Close composer"><Feather name="x" size={21} color={colors.text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editingPost ? 'Edit post' : composerKind === 'signal' ? 'Share a trading signal' : composerKind === 'analysis' ? 'Share FXSnap analysis' : 'Create a post'}</Text>
            <TouchableOpacity onPress={() => void submitPost()} disabled={publishing} style={[styles.publishButton, { backgroundColor: colors.buy }]}>
              {publishing ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.publishText, { color: colors.primaryForeground }]}>{editingPost ? 'Save' : 'Post'}</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.composerContent} keyboardShouldPersistTaps="handled">
            {composerKind === 'analysis' && pendingAnalysis ? (
              <View style={[styles.analysisSource, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="aperture" size={17} color={colors.buy} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.analysisSourceTitle, { color: colors.text }]}>FXSnap AI · {pendingAnalysis.pair}</Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>Original analysis from {ageLabel(pendingAnalysis.sourceCreatedAt)} · will not be refreshed</Text>
                  {Date.now() - Date.parse(pendingAnalysis.sourceCreatedAt) > 60 * 60_000
                    ? <Text style={[styles.errorText, { color: colors.sell }]}>Older analysis: clearly labeled for readers.</Text>
                    : null}
                </View>
              </View>
            ) : null}
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Topic</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {visibleCategories.map((item) => (
                <TouchableOpacity key={item.id} onPress={() => setComposerCategory(item.id)} style={[styles.categoryChip, { backgroundColor: composerCategory === item.id ? colors.buy : colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.categoryText, { color: composerCategory === item.id ? colors.primaryForeground : colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {composerKind === 'signal' ? (
              <View style={styles.signalForm}>
                <TextInput value={signalInstrument} onChangeText={setSignalInstrument} placeholder="Instrument (e.g. EURUSD)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" style={[styles.formInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
                <View style={styles.directionRow}>
                  {(['BUY', 'SELL'] as const).map((direction) => (
                    <TouchableOpacity key={direction} onPress={() => setSignalDirection(direction)} style={[styles.directionButton, { backgroundColor: signalDirection === direction ? (direction === 'BUY' ? colors.buy : colors.sell) : colors.card, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.directionText, { color: signalDirection === direction ? colors.primaryForeground : colors.text }]}>{direction}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={signalEntry} onChangeText={setSignalEntry} placeholder="Entry price or range" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.formInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
                <TextInput value={signalStop} onChangeText={setSignalStop} placeholder="Stop loss" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.formInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
                <TextInput value={signalTargets} onChangeText={setSignalTargets} placeholder="Take-profit levels (comma separated)" placeholderTextColor={colors.textMuted} style={[styles.formInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
                <TextInput value={signalTimeframe} onChangeText={setSignalTimeframe} placeholder="Timeframe (e.g. H1)" placeholderTextColor={colors.textMuted} style={[styles.formInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]} />
              </View>
            ) : null}
            <TextInput
              value={composerBody}
              onChangeText={setComposerBody}
              placeholder={composerKind === 'analysis' ? 'Add an optional comment about this analysis…' : composerKind === 'signal' ? 'Reasoning and context (optional)…' : 'Share your market view, question, or learning…'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={composerKind === 'text' ? 2000 : 1200}
              textAlignVertical="top"
              style={[styles.composerInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            />
            {composerImage || composerImageUrl ? (
              <View style={styles.attachmentPreview}>
                <Image source={{ uri: composerImage?.uri || composerImageUrl || undefined }} style={styles.previewImage} />
                <TouchableOpacity onPress={() => { setComposerImage(null); setComposerImageUrl(null); }} style={[styles.removeAttachment, { backgroundColor: colors.card }]}>
                  <Feather name="x" size={16} color={colors.text} />
                </TouchableOpacity>
                {uploadingImage ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.buy} /> : null}
              </View>
            ) : null}
            {composerKind !== 'analysis' ? (
              <TouchableOpacity onPress={() => void chooseImage()} style={[styles.attachButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Feather name="image" size={17} color={colors.buy} />
                <Text style={[styles.attachText, { color: colors.text }]}>Add chart screenshot (JPEG, PNG, WebP · up to 3 MB)</Text>
              </TouchableOpacity>
            ) : null}
            {composerKind === 'signal' || composerKind === 'analysis' ? (
              <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
                {composerKind === 'signal'
                  ? 'Member-created signal. This is not an FXSnap recommendation or a guaranteed outcome.'
                  : 'The saved analysis snapshot and timestamp are preserved. It is not refreshed when shared.'}
              </Text>
            ) : null}
            {composerError ? <Text style={[styles.errorText, { color: colors.sell }]}>{composerError}</Text> : null}
          </ScrollView>
        </NativeKeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(commentPost)} animationType="slide" onRequestClose={() => setCommentPost(null)}>
        <KeyboardControllerAvoidingView
          style={[styles.modalScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}
          behavior="padding"
          keyboardVerticalOffset={insets.top}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <TouchableOpacity onPress={() => setCommentPost(null)} style={styles.headerIcon} accessibilityLabel="Close discussion"><Feather name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Discussion</Text>
            <View style={styles.headerIcon} />
          </View>
          <ScrollView contentContainerStyle={styles.commentsContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            {commentPost ? <CommunityPostCard post={commentPost} ownAccount={commentPost.authorUsername === profile?.username} reactionBusy={reactionBusyIds.has(commentPost.id)} onReact={(reaction) => void handleReaction(commentPost, reaction)} onComment={() => {}} onShare={(cardView) => void sharePost(commentPost, cardView)} onMore={(cardView) => showPostActions(commentPost, cardView)} onFollow={() => void handleFollow(commentPost)} /> : null}
            <Text style={[styles.commentsHeading, { color: colors.text }]}>Trader discussion</Text>
            {commentsLoading ? <ActivityIndicator color={colors.buy} /> : comments.length ? comments.map((comment, index) => (
              <Animated.View key={comment.id} entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index * 35, 140)).duration(240)}>
                <CommentCard comment={comment} colors={colors} onReply={() => void startReply(comment)} onMore={() => showPostActions(comment)} onAuthorPress={() => router.push({ pathname: '/community-member', params: { username: comment.authorUsername } })} />
              </Animated.View>
            )) : (
              <View style={styles.noComments}>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>No replies yet. Add a constructive thought or ask a follow-up question.</Text>
              </View>
            )}
            {threadLoading ? <ActivityIndicator color={colors.buy} /> : threadReplies.map((reply, index) => (
              <Animated.View key={reply.id} entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index * 35, 140)).duration(240)}>
                <CommentCard comment={reply} colors={colors} nested onReply={() => void startReply(reply)} onMore={() => showPostActions(reply)} onAuthorPress={() => router.push({ pathname: '/community-member', params: { username: reply.authorUsername } })} />
              </Animated.View>
            ))}
          </ScrollView>
          {replyTarget ? (
            <View style={[styles.replyingBanner, { backgroundColor: colors.surface }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>Replying to @{replyTarget.authorUsername}</Text>
              <TouchableOpacity onPress={() => { setReplyTarget(null); setThreadReplies([]); }} accessibilityLabel="Cancel reply"><Feather name="x" size={16} color={colors.textSecondary} /></TouchableOpacity>
            </View>
          ) : null}
          <View style={[styles.commentComposer, { backgroundColor: colors.card, borderTopColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder={replyTarget ? `Reply to @${replyTarget.authorUsername}…` : 'Add to the discussion…'}
              placeholderTextColor={colors.textMuted}
              maxLength={2000}
              multiline
              textAlignVertical="top"
              style={[styles.commentInput, { color: colors.text, backgroundColor: colors.surface }]}
            />
            <TouchableOpacity onPress={() => void submitComment()} disabled={!commentDraft.trim() || commentSending} style={[styles.sendComment, { backgroundColor: colors.buy }]}>
              {commentSending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up" size={18} color={colors.primaryForeground} />}
            </TouchableOpacity>
          </View>
        </KeyboardControllerAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(postActionsPost)}
        transparent
        animationType="slide"
        onRequestClose={() => setPostActionsPost(null)}
      >
        <View style={styles.actionSheetOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setPostActionsPost(null)}
            accessibilityLabel="Close post actions"
          />
          <View style={[styles.actionSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={[styles.actionSheetHandle, { backgroundColor: colors.textMuted }]} />
            <View style={styles.actionSheetHeading}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetTitle, { color: colors.text }]}>
                  {postActionsPost?.replyTo ? 'Comment actions' : 'Post actions'}
                </Text>
                {postActionsPost ? (
                  <Text style={[styles.actionSheetSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                    @{postActionsPost.authorUsername}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setPostActionsPost(null)} style={styles.headerIcon} accessibilityLabel="Close">
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {postActionsPost ? postActionItems.map((item) => (
              <TouchableOpacity
                key={item.name}
                onPress={() => runPostAction(item.name, postActionsPost)}
                style={styles.actionSheetRow}
                accessibilityRole="button"
              >
                <View style={[styles.actionSheetIcon, { backgroundColor: item.destructive ? `${colors.sell}12` : colors.surface }]}>
                  <Feather name={item.icon} size={17} color={item.destructive ? colors.sell : colors.textSecondary} />
                </View>
                <View style={styles.actionSheetCopy}>
                  <Text style={[styles.actionSheetLabel, { color: item.destructive ? colors.sell : colors.text }]}>{item.label}</Text>
                  <Text style={[styles.actionSheetDescription, { color: colors.textMuted }]}>{item.description}</Text>
                </View>
              </TouchableOpacity>
            )) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={blocksVisible} transparent animationType="fade" onRequestClose={() => setBlocksVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.smallModal, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <ModalTitle title="Blocked traders" colors={colors} onClose={() => setBlocksVisible(false)} />
            <ScrollView style={{ maxHeight: 420 }}>
              {blocks.length ? blocks.map((blocked) => (
                <View key={blocked.accountId} style={[styles.blockRow, { borderBottomColor: colors.cardBorder }]}>
                  <Text style={[styles.username, { color: colors.text }]}>@{blocked.username}</Text>
                  <TouchableOpacity onPress={() => {
                    void unblockCommunityMember(blocked.accountId).then(() => setBlocks((previous) => previous.filter((item) => item.accountId !== blocked.accountId)))
                      .catch((error) => Alert.alert('Could not unblock trader', apiErrorMessage(error)));
                  }}>
                    <Text style={[styles.retryText, { color: colors.buy }]}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              )) : <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>You have not blocked any traders.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CenteredMessage({
  colors,
  insets,
  title,
  body,
  actionLabel,
  onAction,
  onBack,
  loading,
  error,
}: {
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string;
}) {
  return (
    <View style={[styles.centeredScreen, { backgroundColor: colors.background, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <TouchableOpacity onPress={onBack || (() => router.back())} style={[styles.headerIcon, { alignSelf: 'flex-start' }]} accessibilityLabel="Go back"><Feather name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
      <View style={[styles.communityMark, { backgroundColor: `${colors.buy}18` }]}><Feather name="users" size={28} color={colors.buy} /></View>
      <Text style={[styles.heroTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.centerBody, { color: colors.textSecondary }]}>{body}</Text>
      {error ? <Text style={[styles.errorText, { color: colors.sell }]}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.buy} /> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} disabled={loading} style={[styles.primaryButton, { backgroundColor: colors.buy }]}>
          {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{actionLabel}</Text>}
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.privacyNote, { color: colors.textMuted }]}>A space for market education and thoughtful discussion, not guaranteed financial outcomes.</Text>
    </View>
  );
}

function RuleLine({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.ruleLine}><Feather name="check" size={14} color={colors.buy} /><Text style={[styles.ruleText, { color: colors.textSecondary }]}>{text}</Text></View>;
}

function CommentCard({
  comment,
  colors,
  nested = false,
  onReply,
  onMore,
  onAuthorPress,
}: {
  comment: CommunityMessage;
  colors: ReturnType<typeof useColors>;
  nested?: boolean;
  onReply: () => void;
  onMore: () => void;
  onAuthorPress: () => void;
}) {
  return (
    <View style={[styles.commentCard, { marginLeft: nested ? 25 : 0, backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.commentHeader}>
        {comment.authorPictureUrl ? (
          <CachedImage source={{ uri: comment.authorPictureUrl }} style={styles.commentAvatar} contentFit="cover" cachePolicy="memory-disk" transition={120} accessibilityLabel={`${comment.authorUsername}'s profile picture`} />
        ) : (
          <View style={[styles.commentAvatar, { backgroundColor: comment.isOfficial ? colors.buy : colors.surface }]}>
            <Text style={[styles.composeAvatarText, { color: comment.isOfficial ? colors.primaryForeground : colors.text }]}>{comment.authorUsername.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onAuthorPress} style={{ flex: 1 }}>
          <Text style={[styles.username, { color: colors.text }]}>@{comment.authorUsername}{comment.isOfficial ? ' · FXSnap' : ''}</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{ageLabel(comment.createdAt)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onMore} accessibilityLabel="Comment actions"><Feather name="more-horizontal" size={18} color={colors.textMuted} /></TouchableOpacity>
      </View>
      {comment.replyTo ? <Text style={[styles.metaText, { color: colors.buy }]}>Replying to @{comment.replyTo.author_username}</Text> : null}
      <Text style={[styles.commentBody, { color: colors.text }]}>{comment.body}</Text>
      <TouchableOpacity onPress={onReply} style={styles.replyAction}><Feather name="corner-up-left" size={13} color={colors.textSecondary} /><Text style={[styles.replyActionText, { color: colors.textSecondary }]}>Reply</Text></TouchableOpacity>
    </View>
  );
}

function ModalTitle({ title, colors, onClose }: { title: string; colors: ReturnType<typeof useColors>; onClose: () => void }) {
  return (
    <View style={styles.modalTitleRow}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
      <TouchableOpacity onPress={onClose} accessibilityLabel="Close"><Feather name="x" size={20} color={colors.text} /></TouchableOpacity>
    </View>
  );
}

function BottomItem({ icon, label, active, colors, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; active?: boolean; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.bottomItem}>
      <Feather name={icon} size={18} color={active ? colors.buy : colors.textMuted} />
      <Text style={[styles.bottomLabel, { color: active ? colors.buy : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  onboardingHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerTitleWrap: { flex: 1, paddingLeft: 5 },
  headerTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  username: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  notificationDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', right: 8, top: 7 },
  feedContent: { paddingHorizontal: 12, paddingTop: 7 },
  feedTabRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 2 },
  onlineBanner: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  feedPostCell: { paddingVertical: 5 },
  feedTabs: { flexDirection: 'row', gap: 8 },
  feedTab: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 18 },
  feedTabText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  categories: { alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 8 },
  categoryChip: { minHeight: 33, justifyContent: 'center', borderWidth: 1, borderRadius: 17, paddingHorizontal: 13 },
  categoryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  composeAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  feedLoading: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyCard: { alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 18, padding: 22, marginTop: 8, marginBottom: 14 },
  emptyTitle: { fontSize: 14, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  emptyBody: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  emptyAction: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginTop: 4, paddingHorizontal: 16 },
  metaText: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, marginTop: 8, paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  inlineError: { borderRadius: 12, padding: 10, marginBottom: 11, gap: 8 },
  actionSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  actionSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingTop: 10, paddingHorizontal: 18, maxHeight: '78%' },
  actionSheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 3, opacity: 0.4, marginBottom: 10 },
  actionSheetHeading: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#80808030', paddingBottom: 7, marginBottom: 4 },
  actionSheetTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  actionSheetSubtitle: { marginTop: 3, fontSize: 10, fontFamily: 'Inter_400Regular' },
  actionSheetRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionSheetIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  actionSheetCopy: { flex: 1, gap: 3 },
  actionSheetLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  actionSheetDescription: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  errorText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  loadMoreButton: { alignSelf: 'center', paddingVertical: 13 },
  loadMoreText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  fab: { position: 'absolute', right: 19, width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 27, elevation: 7, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 7 },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  centerTab: { width: 58, alignItems: 'center', justifyContent: 'center', marginTop: -17 },
  centerTabCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  modalScreen: { flex: 1 },
  modalHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  modalTitle: { flex: 1, fontSize: 15, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  publishButton: { minWidth: 62, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 12 },
  publishText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  composerContent: { gap: 12, padding: 15, paddingBottom: 35 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 4 },
  composerInput: { minHeight: 145, borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  formInput: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_500Medium' },
  signalForm: { gap: 9 },
  directionRow: { flexDirection: 'row', gap: 9 },
  directionButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
  directionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  analysisSource: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  analysisSourceTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  attachmentPreview: { height: 175, position: 'relative', overflow: 'hidden', borderRadius: 13 },
  previewImage: { width: '100%', height: '100%' },
  removeAttachment: { position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  attachButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  attachText: { flex: 1, fontSize: 10, fontFamily: 'Inter_500Medium' },
  disclaimerText: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  commentsContent: { padding: 13, paddingBottom: 18 },
  commentsHeading: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 4, marginBottom: 10 },
  commentCard: { borderWidth: 1, borderRadius: 13, padding: 10, marginBottom: 8, gap: 8 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentAvatar: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  commentBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  replyAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  replyActionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  noComments: { alignItems: 'center', justifyContent: 'center', minHeight: 88 },
  commentComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 9 },
  commentInput: { flex: 1, maxHeight: 100, minHeight: 42, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10, fontSize: 12, fontFamily: 'Inter_400Regular' },
  sendComment: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: 2 },
  replyingBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 7 },
  modalScrim: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.58)' },
  smallModal: { borderWidth: 1, borderRadius: 18, padding: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  notificationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  notificationText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  blockRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  centeredScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 13 },
  communityMark: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 22, marginTop: 12 },
  heroTitle: { fontSize: 22, lineHeight: 29, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  heroBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  centerBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  onboardingContent: { paddingHorizontal: 22, paddingBottom: 35, gap: 12 },
  usernameField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  atSign: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  usernameInput: { flex: 1, height: 46, fontSize: 13, fontFamily: 'Inter_500Medium' },
  helperText: { minHeight: 15, fontSize: 10, fontFamily: 'Inter_400Regular' },
  rulesCard: { gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  rulesTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 1 },
  ruleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  acceptRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3 },
  checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6 },
  acceptText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  privacyNote: { fontSize: 9, lineHeight: 14, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 3 },
});
