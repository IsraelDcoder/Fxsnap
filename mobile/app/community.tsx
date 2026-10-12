import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
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
  deleteCommunityMessage,
  followCommunityMember,
  getCommunityComments,
  getCommunityFollows,
  getCommunityMe,
  getCommunityMessages,
  getCommunityNotifications,
  getCommunityPost,
  getCommunityReplies,
  joinCommunity,
  markCommunityNotificationRead,
  publishCommunityComment,
  publishCommunityMessage,
  reportCommunityMessage,
  shareCommunityPost,
  subscribeToCommunityChanges,
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
} from '@/services/community';
import CommunityPostCard from '@/components/CommunityPostCard';

type ComposerKind = 'text' | 'signal' | 'analysis';
type CommunityNotification = {
  id: string;
  kind: string;
  message: string;
  object_id: string | null;
  read_at: string | null;
  created_at: string;
};

function apiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The Community request failed. Please try again.';
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

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postId?: string; shareAnalysisId?: string }>();
  const postIdParam = firstParam(params.postId);
  const shareAnalysisId = firstParam(params.shareAnalysisId);
  const { currentAnalysis, savedAnalyses, isSubscribed } = useApp();
  const [account, setAccount] = useState<FxsnapAccount | null>(null);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [stage, setStage] = useState<'loading' | 'signed_out' | 'onboarding' | 'feed' | 'error'>('loading');
  const [screenError, setScreenError] = useState('');
  const [feed, setFeed] = useState<CommunityFeed>('global');
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [posts, setPosts] = useState<CommunityMessage[]>([]);
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
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [blocksVisible, setBlocksVisible] = useState(false);
  const [blocks, setBlocks] = useState<Array<{ accountId: string; username: string }>>([]);
  const [followedNames, setFollowedNames] = useState<string[]>([]);
  const flatListRef = useRef<FlatList<CommunityMessage>>(null);
  const processedPostId = useRef<string | null>(null);
  const processedAnalysisId = useRef<string | null>(null);
  const publishId = useRef<string | null>(null);
  const commentId = useRef<string | null>(null);

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
    } catch (error) {
      setFeedError(apiErrorMessage(error));
    } finally {
      setLoadingFeed(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [category, feed, nextCursor, profile, stage]);

  const refreshNotifications = useCallback(async () => {
    const result = await getCommunityNotifications();
    setNotifications(result.notifications);
  }, []);

  const bootstrap = useCallback(async () => {
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
      const membership = await getCommunityMe();
      if (!membership.profile) {
        setProfile(null);
        setStage('onboarding');
        return;
      }
      setProfile(membership.profile);
      setStage('feed');
    } catch (error) {
      setScreenError(apiErrorMessage(error));
      setStage('error');
    }
  }, []);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) return;
    void loadFeed(true);
  }, [category, feed, profile, stage]);

  useEffect(() => {
    if (stage !== 'feed' || !profile) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToCommunityChanges((eventType) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void loadFeed(true); }, 220);
      if (eventType === 'notification') {
        void refreshNotifications().catch((error) => {
          console.error('[Community] Could not refresh notifications.', error);
        });
      }
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [loadFeed, profile, refreshNotifications, stage]);

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
    if (!isSubscribed && !selected.freeAnalysisUsed) {
      return {
        ...buildAnalysisSnapshot(selected),
        takeProfits: (selected.takeProfitLevels || (selected.tradeSetup?.takeProfit ? [selected.tradeSetup.takeProfit] : [])).slice(0, 1),
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
        }
        : composerKind === 'analysis'
          ? { ...pendingAnalysis, imageUrl }
          : { imageUrl };
      const message = editingPost
        ? (await updateCommunityMessage(editingPost.id, {
          body,
          category: composerCategory,
          imageUrl,
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
    if (!commentPost || !body || commentSending) return;
    setCommentSending(true);
    try {
      const result = await publishCommunityComment(
        commentPost.id,
        body,
        commentId.current || (commentId.current = createCommunityClientId()),
        replyTarget?.id,
      );
      if (replyTarget && replyTarget.id !== commentPost.id) {
        setThreadReplies((previous) => [...previous, result.message]);
      } else {
        setComments((previous) => [...previous, result.message]);
      }
      setCommentDraft('');
      commentId.current = null;
      setPosts((previous) => previous.map((post) => post.id === commentPost.id
        ? { ...post, commentCount: post.commentCount + 1 }
        : post));
      setCommentPost((previous) => previous?.id === commentPost.id
        ? { ...previous, commentCount: previous.commentCount + 1 }
        : previous);
    } catch (error) {
      Alert.alert('Could not send reply', apiErrorMessage(error));
    } finally {
      setCommentSending(false);
    }
  };

  const handleLike = async (post: CommunityMessage) => {
    const currentLike = post.reactions.find((reaction) => reaction.reaction === 'like')?.reacted;
    try {
      await toggleCommunityReaction(post.id, 'like');
      setPosts((previous) => previous.map((item) => {
        if (item.id !== post.id) return item;
        const reactions = item.reactions.filter((reaction) => reaction.reaction !== 'like');
        const oldCount = item.reactions.find((reaction) => reaction.reaction === 'like')?.count || 0;
        const nextCount = Math.max(0, oldCount + (currentLike ? -1 : 1));
        if (nextCount) reactions.push({ reaction: 'like', count: nextCount, reacted: !currentLike });
        return { ...item, reactions };
      }));
    } catch (error) {
      Alert.alert('Could not update reaction', apiErrorMessage(error));
    }
  };

  const handleFollow = async (post: CommunityMessage) => {
    const wasFollowing = post.isFollowed;
    try {
      if (wasFollowing) await unfollowCommunityMember(post.authorUsername);
      else await followCommunityMember(post.authorUsername);
      setPosts((previous) => previous.map((item) => item.authorUsername === post.authorUsername
        ? { ...item, isFollowed: !wasFollowing }
        : item));
      setFollowedNames((previous) => wasFollowing
        ? previous.filter((name) => name !== post.authorUsername)
        : [...previous, post.authorUsername]);
    } catch (error) {
      Alert.alert('Could not update following', apiErrorMessage(error));
    }
  };

  const askReportReason = (post: CommunityMessage) => {
    Alert.alert('Report this post', 'Choose the reason that best describes the issue.', [
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
    ]);
  };

  const showPostActions = (post: CommunityMessage) => {
    const ownPost = post.authorUsername === profile?.username;
    Alert.alert(`@${post.authorUsername}`, undefined, [
      ownPost && !post.replyTo && post.kind === 'text' ? {
        text: 'Edit post',
        onPress: () => editPost(post),
      } : null,
      ownPost ? {
        text: post.replyTo ? 'Delete comment' : 'Delete post',
        style: 'destructive' as const,
        onPress: () => Alert.alert(
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
        ),
      } : null,
      {
        text: 'Copy post',
        onPress: () => {
          void Clipboard.setStringAsync(`${post.body}\n\n@${post.authorUsername} · FXSnap Community`)
            .then(() => Alert.alert('Copied', 'Post text copied to clipboard.'));
        },
      },
      !ownPost && !post.isOfficial ? {
        text: post.isFollowed ? 'Unfollow trader' : 'Follow trader',
        onPress: () => { void handleFollow(post); },
      } : null,
      !ownPost ? { text: 'Report post', style: 'destructive' as const, onPress: () => askReportReason(post) } : null,
      !ownPost && !post.isOfficial ? {
        text: 'Block trader',
        style: 'destructive' as const,
        onPress: () => Alert.alert('Block trader?', 'Their posts and interactions will be hidden from your Community feed.', [
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
        ]),
      } : null,
      ...(profile?.isAdmin ? [{
        text: post.pinnedAt ? 'Unpin post' : 'Pin post',
        onPress: () => void moderate(post.pinnedAt ? 'unpin' : 'pin', post),
      }, {
        text: 'Remove post',
        style: 'destructive' as const,
        onPress: () => void moderate('remove_message', post),
      }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ].filter(Boolean) as Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }>);
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

  const sharePost = async (post: CommunityMessage) => {
    try {
      await shareCommunityPost(post);
    } catch (error) {
      Alert.alert('Could not share post', apiErrorMessage(error));
    }
  };

  const openNotifications = async () => {
    try {
      const result = await getCommunityNotifications();
      setNotifications(result.notifications);
      setNotificationsVisible(true);
    } catch (error) {
      Alert.alert('Notifications unavailable', apiErrorMessage(error));
    }
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

  const markNotification = async (notification: CommunityNotification) => {
    try {
      await markCommunityNotificationRead(notification.id);
      setNotifications((previous) => previous.map((item) => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString() }
        : item));
      if (notification.object_id) {
        try {
          const { post } = await getCommunityPost(notification.object_id);
          setNotificationsVisible(false);
          await openComments(post);
        } catch {
          Alert.alert('Discussion unavailable', 'The related post may have been removed.');
        }
      }
    } catch (error) {
      Alert.alert('Could not update notification', apiErrorMessage(error));
    }
  };

  const renderPost = ({ item, index }: { item: CommunityMessage; index: number }) => (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 35, 210)).duration(330)}>
      <CommunityPostCard
        post={item}
        ownAccount={item.authorUsername === profile?.username}
        onLike={() => void handleLike(item)}
        onComment={() => void openComments(item)}
        onShare={() => void sharePost(item)}
        onMore={() => showPostActions(item)}
        onFollow={() => void handleFollow(item)}
      />
    </Animated.View>
  );

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const visibleCategories = COMMUNITY_CATEGORIES.filter((item) => profile?.isAdmin || item.id !== 'events');

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
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Community</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Trading knowledge, shared</Text>
        </View>
        <TouchableOpacity onPress={() => void openNotifications()} style={styles.headerIcon} accessibilityLabel="Community notifications">
          <Feather name="bell" size={19} color={colors.text} />
          {unreadCount > 0 ? <View style={[styles.notificationDot, { backgroundColor: colors.sell }]} /> : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/community-support')} style={styles.headerIcon} accessibilityLabel="Contact FXSnap support">
          <Feather name="headphones" size={19} color={colors.text} />
        </TouchableOpacity>
        {profile?.isAdmin ? (
          <TouchableOpacity onPress={() => router.push('/community-admin')} style={styles.headerIcon} accessibilityLabel="Open community moderation">
            <Feather name="shield" size={19} color={colors.buy} />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
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
            <Animated.View entering={FadeInDown.duration(380)} style={[styles.feedHero, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={[styles.heroIcon, { backgroundColor: `${colors.buy}18` }]}>
                <Feather name="trending-up" size={19} color={colors.buy} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={[styles.feedHeroTitle, { color: colors.text }]}>Better traders learn together.</Text>
                <Text style={[styles.feedHeroSubtitle, { color: colors.textSecondary }]}>Ideas and education. No guaranteed outcomes.</Text>
              </View>
              <TouchableOpacity onPress={() => void openBlockedMembers()} accessibilityLabel="Manage blocked traders">
                <Feather name="shield" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            </Animated.View>
            <View style={styles.feedTabs}>
              {(['global', 'following'] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setFeed(item)}
                  style={[styles.feedTab, { borderColor: feed === item ? colors.buy : colors.cardBorder, backgroundColor: feed === item ? `${colors.buy}15` : colors.card }]}
                >
                  <Text style={[styles.feedTabText, { color: feed === item ? colors.buy : colors.textSecondary }]}>{item === 'global' ? 'For you' : 'Following'}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
            <TouchableOpacity
              onPress={() => openComposer('text')}
              style={[styles.composePrompt, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              accessibilityLabel="Create a community post"
            >
              <View style={[styles.composeAvatar, { backgroundColor: colors.buy }]}>
                <Text style={[styles.composeAvatarText, { color: colors.primaryForeground }]}>{profile?.username.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={[styles.composePlaceholder, { color: colors.textMuted }]}>What are you learning in the markets?</Text>
              <Feather name="edit-3" size={17} color={colors.buy} />
            </TouchableOpacity>
            <View style={styles.quickPostActions}>
              <QuickAction label="Chart post" icon="image" colors={colors} onPress={() => openComposer('text', 'chart_analysis')} />
              <QuickAction label="Share signal" icon="activity" colors={colors} onPress={() => openComposer('signal', 'chart_analysis')} />
              {profile?.isAdmin ? <QuickAction label="Announcement" icon="volume-2" colors={colors} onPress={() => openComposer('text', 'events')} /> : null}
            </View>
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
        <KeyboardAvoidingView style={[styles.modalScreen, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(commentPost)} animationType="slide" onRequestClose={() => setCommentPost(null)}>
        <KeyboardAvoidingView style={[styles.modalScreen, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.cardBorder }]}>
            <TouchableOpacity onPress={() => setCommentPost(null)} style={styles.headerIcon} accessibilityLabel="Close discussion"><Feather name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Discussion</Text>
            <View style={styles.headerIcon} />
          </View>
          <ScrollView contentContainerStyle={styles.commentsContent} keyboardShouldPersistTaps="handled">
            {commentPost ? <CommunityPostCard post={commentPost} ownAccount={commentPost.authorUsername === profile?.username} onLike={() => void handleLike(commentPost)} onComment={() => {}} onShare={() => void sharePost(commentPost)} onMore={() => showPostActions(commentPost)} onFollow={() => void handleFollow(commentPost)} /> : null}
            <Text style={[styles.commentsHeading, { color: colors.text }]}>Trader discussion</Text>
            {commentsLoading ? <ActivityIndicator color={colors.buy} /> : comments.length ? comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} colors={colors} onReply={() => void startReply(comment)} onMore={() => showPostActions(comment)} />
            )) : (
              <View style={styles.noComments}>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>No replies yet. Add a constructive thought or ask a follow-up question.</Text>
              </View>
            )}
            {threadLoading ? <ActivityIndicator color={colors.buy} /> : threadReplies.map((reply) => (
              <CommentCard key={reply.id} comment={reply} colors={colors} nested onReply={() => void startReply(reply)} onMore={() => showPostActions(reply)} />
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
              style={[styles.commentInput, { color: colors.text, backgroundColor: colors.surface }]}
            />
            <TouchableOpacity onPress={() => void submitComment()} disabled={!commentDraft.trim() || commentSending} style={[styles.sendComment, { backgroundColor: colors.buy }]}>
              {commentSending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up" size={18} color={colors.primaryForeground} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={notificationsVisible} transparent animationType="fade" onRequestClose={() => setNotificationsVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.smallModal, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <ModalTitle title="Notifications" colors={colors} onClose={() => setNotificationsVisible(false)} />
            <ScrollView style={{ maxHeight: 420 }}>
              {notifications.length ? notifications.map((notification) => (
                <TouchableOpacity key={notification.id} onPress={() => void markNotification(notification)} style={[styles.notificationRow, { borderBottomColor: colors.cardBorder }]}>
                  <View style={[styles.notificationDot, { backgroundColor: notification.read_at ? colors.cardBorder : colors.buy }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notificationText, { color: colors.text }]}>{notification.message}</Text>
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>{ageLabel(notification.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              )) : <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>You are all caught up.</Text>}
            </ScrollView>
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

function QuickAction({ label, icon, colors, onPress }: { label: string; icon: React.ComponentProps<typeof Feather>['name']; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Feather name={icon} size={14} color={colors.buy} />
      <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CommentCard({
  comment,
  colors,
  nested = false,
  onReply,
  onMore,
}: {
  comment: CommunityMessage;
  colors: ReturnType<typeof useColors>;
  nested?: boolean;
  onReply: () => void;
  onMore: () => void;
}) {
  return (
    <View style={[styles.commentCard, { marginLeft: nested ? 25 : 0, backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.commentHeader}>
        {comment.authorPictureUrl ? (
          <Image source={{ uri: comment.authorPictureUrl }} style={styles.commentAvatar} accessibilityLabel={`${comment.authorUsername}'s profile picture`} />
        ) : (
          <View style={[styles.commentAvatar, { backgroundColor: comment.isOfficial ? colors.buy : colors.surface }]}>
            <Text style={[styles.composeAvatarText, { color: comment.isOfficial ? colors.primaryForeground : colors.text }]}>{comment.authorUsername.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.username, { color: colors.text }]}>@{comment.authorUsername}{comment.isOfficial ? ' · FXSnap' : ''}</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>{ageLabel(comment.createdAt)}</Text>
        </View>
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
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  onboardingHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerTitleWrap: { flex: 1, paddingLeft: 5 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  username: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  notificationDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', right: 8, top: 7 },
  feedContent: { paddingHorizontal: 13, paddingTop: 12 },
  feedHero: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  heroIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  heroCopy: { flex: 1, gap: 3 },
  feedHeroTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  feedHeroSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  feedTabs: { flexDirection: 'row', gap: 8, marginTop: 13, marginBottom: 8 },
  feedTab: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderRadius: 17, paddingHorizontal: 15 },
  feedTabText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  categories: { alignItems: 'center', gap: 7, paddingVertical: 7, paddingRight: 8 },
  categoryChip: { minHeight: 32, justifyContent: 'center', borderWidth: 1, borderRadius: 17, paddingHorizontal: 12 },
  categoryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  composePrompt: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, marginTop: 7 },
  composeAvatar: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  composeAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  composePlaceholder: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular' },
  quickPostActions: { flexDirection: 'row', gap: 7, marginTop: 8, marginBottom: 15 },
  quickAction: { minHeight: 33, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9 },
  quickActionText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  feedLoading: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyCard: { alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 18, padding: 22, marginTop: 8, marginBottom: 14 },
  emptyTitle: { fontSize: 14, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  emptyBody: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  emptyAction: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginTop: 4, paddingHorizontal: 16 },
  metaText: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, marginTop: 8, paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  inlineError: { borderRadius: 12, padding: 10, marginBottom: 11, gap: 8 },
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
