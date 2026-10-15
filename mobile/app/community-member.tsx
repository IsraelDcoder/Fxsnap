import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Image as CachedImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import CommunityPostCard from '@/components/CommunityPostCard';
import CommunityPreviewNotice from '@/components/CommunityPreviewNotice';
import { useColors } from '@/hooks/useColors';
import {
  followCommunityMember,
  getCommunityMember,
  shareCommunityPost,
  toggleCommunityReaction,
  unfollowCommunityMember,
  type CommunityMember,
  type CommunityMessage,
  type CommunityReaction,
} from '@/services/community';
import { applyCommunityReaction } from '@/services/communityEngagement';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'The member profile could not be loaded.';
}

export default function CommunityMemberScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const [member, setMember] = useState<CommunityMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reactionBusyIds, setReactionBusyIds] = useState<Set<string>>(() => new Set());
  const [followBusy, setFollowBusy] = useState(false);
  const pendingReactionIds = useRef(new Set<string>());
  const pendingFollow = useRef(false);

  const loadMember = useCallback(async () => {
    if (!username) {
      setError('This profile link is incomplete.');
      setLoading(false);
      return;
    }
    setError('');
    try {
      const response = await getCommunityMember(username);
      setMember(response.member);
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => { void loadMember(); }, [loadMember]);

  const toggleFollow = async () => {
    if (!member || pendingFollow.current) return;
    pendingFollow.current = true;
    setFollowBusy(true);
    const wasFollowing = member.isFollowing;
    setMember((current) => current ? {
      ...current,
      isFollowing: !wasFollowing,
      followerCount: Math.max(0, current.followerCount + (wasFollowing ? -1 : 1)),
    } : current);
    try {
      if (wasFollowing) await unfollowCommunityMember(member.username);
      else await followCommunityMember(member.username);
    } catch (failure) {
      setMember((current) => current ? {
        ...current,
        isFollowing: wasFollowing,
        followerCount: Math.max(0, current.followerCount + (wasFollowing ? 1 : -1)),
      } : current);
      Alert.alert('Could not update follow', messageFor(failure));
    } finally {
      pendingFollow.current = false;
      setFollowBusy(false);
    }
  };

  const toggleReaction = async (post: CommunityMessage, reaction: CommunityReaction) => {
    if (pendingReactionIds.current.has(post.id)) return;
    pendingReactionIds.current.add(post.id);
    setReactionBusyIds((current) => new Set(current).add(post.id));
    const previousReactions = post.reactions;
    const optimisticReactions = applyCommunityReaction(previousReactions, reaction);
    setMember((current) => current ? {
      ...current,
      posts: current.posts.map((item) => item.id === post.id ? { ...item, reactions: optimisticReactions } : item),
    } : current);
    try {
      const result = await toggleCommunityReaction(post.id, reaction);
      setMember((current) => current ? {
        ...current,
        posts: current.posts.map((item) => item.id === post.id ? { ...item, reactions: result.reactions } : item),
      } : current);
    } catch (failure) {
      setMember((current) => current ? {
        ...current,
        posts: current.posts.map((item) => item.id === post.id ? { ...item, reactions: previousReactions } : item),
      } : current);
      Alert.alert('Could not update reaction', messageFor(failure));
    } finally {
      pendingReactionIds.current.delete(post.id);
      setReactionBusyIds((current) => {
        const updated = new Set(current);
        updated.delete(post.id);
        return updated;
      });
    }
  };

  const sharePost = async (post: CommunityMessage, cardView: View | null) => {
    try {
      const shareCount = await shareCommunityPost(post, cardView);
      if (shareCount !== null) {
        setMember((current) => current ? {
          ...current,
          posts: current.posts.map((item) => item.id === post.id ? { ...item, shareCount } : item),
        } : current);
      }
    } catch (failure) {
      Alert.alert('Could not share post', messageFor(failure));
    }
  };

  const recentViews = member?.posts.reduce((total, post) => total + post.viewCount, 0) || 0;
  const recentReactions = member?.posts.reduce(
    (total, post) => total + post.reactions.reduce((count, reaction) => count + (reaction.reaction === 'like' ? 0 : reaction.count), 0),
    0,
  ) || 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Member profile</Text>
        <View style={styles.iconButton} />
      </View>
      <CommunityPreviewNotice />
      {loading && !member ? <ActivityIndicator style={styles.loading} color={colors.buy} /> : null}
      {error && !member ? (
        <View style={styles.errorState}>
          <Feather name="user-x" size={27} color={colors.textMuted} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Profile unavailable</Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void loadMember(); }} style={[styles.retryButton, { borderColor: colors.cardBorder }]}>
            <Text style={[styles.followText, { color: colors.buy }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {member ? (
        <FlatList
          data={member.posts}
          keyExtractor={(post) => post.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void loadMember(); }}
              tintColor={colors.buy}
            />
          }
          ListHeaderComponent={
            <>
              {error ? <Text style={[styles.refreshError, { color: colors.sell }]}>{error}</Text> : null}
              <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.profileTop}>
                  {member.pictureUrl ? (
                    <CachedImage
                      source={{ uri: member.pictureUrl }}
                      style={styles.avatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={120}
                      accessibilityLabel={`@${member.username}'s profile photo`}
                    />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: `${colors.buy}20` }]}>
                      <Text style={[styles.avatarLetter, { color: colors.buy }]}>
                        {member.username.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {!member.isCurrentUser ? (
                    <TouchableOpacity
                      onPress={() => void toggleFollow()}
                      disabled={followBusy}
                      style={[
                        styles.followButton,
                        {
                          backgroundColor: member.isFollowing ? colors.surface : colors.buy,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.followText,
                          { color: member.isFollowing ? colors.text : colors.primaryForeground },
                        ]}
                      >
                        {followBusy ? 'Updating…' : member.isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.selfBadge, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.selfText, { color: colors.textSecondary }]}>Your profile</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.username, { color: colors.text }]}>@{member.username}</Text>
                <Text style={[styles.joined, { color: colors.textMuted }]}>
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </Text>
                <View style={[styles.stats, { borderTopColor: colors.cardBorder }]}>
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{member.posts.length}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>Recent posts</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{member.followerCount}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{member.followingCount}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>Following</Text>
                  </View>
                </View>
                <View style={[styles.credibilityCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <View style={styles.credibilityHeading}>
                    <Feather name="shield" size={15} color={colors.buy} />
                    <Text style={[styles.credibilityTitle, { color: colors.text }]}>Creator context</Text>
                  </View>
                  <View style={styles.credibilityStats}>
                    <View style={styles.credibilityStat}>
                      <Text style={[styles.credibilityValue, { color: colors.text }]}>{recentReactions}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Reactions</Text>
                    </View>
                    <View style={styles.credibilityStat}>
                      <Text style={[styles.credibilityValue, { color: colors.text }]}>{recentViews}</Text>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>Post views</Text>
                    </View>
                  </View>
                  <Text style={[styles.credibilityNote, { color: colors.textMuted }]}>
                    Engagement across up to 30 recent posts; this is not verified trading performance. Signals and analysis are for discussion.
                  </Text>
                </View>
                <Text style={[styles.postsHeading, { color: colors.text }]}>Posts</Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <CommunityPostCard
              post={item}
              ownAccount={member.isCurrentUser}
              reactionBusy={reactionBusyIds.has(item.id)}
              onReact={(reaction) => void toggleReaction(item, reaction)}
              onComment={() => router.push({ pathname: '/community', params: { postId: item.id } })}
              onShare={(cardView) => { void sharePost(item, cardView); }}
              onMore={() => router.push({ pathname: '/community', params: { postId: item.id } })}
              onFollow={() => void toggleFollow()}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Posts shared by this member will appear here.</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 54, paddingHorizontal: 14, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  loading: { marginTop: 40 },
  errorState: { padding: 28, paddingTop: 60, alignItems: 'center', gap: 10 },
  errorTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  errorBody: { textAlign: 'center', lineHeight: 18, fontSize: 12, fontFamily: 'Inter_400Regular' },
  retryButton: { marginTop: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 9 },
  list: { padding: 14, gap: 11 },
  profileCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 2 },
  profileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#80808020' },
  avatarFallback: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 25, fontFamily: 'Inter_700Bold' },
  followButton: { minWidth: 96, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  followText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  selfBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  selfText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  username: { marginTop: 14, fontSize: 20, fontFamily: 'Inter_700Bold' },
  joined: { marginTop: 4, fontSize: 11, fontFamily: 'Inter_400Regular' },
  stats: { marginTop: 15, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  credibilityCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14, gap: 10 },
  credibilityHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  credibilityTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  credibilityStats: { flexDirection: 'row', paddingVertical: 2 },
  credibilityStat: { flex: 1, alignItems: 'center', gap: 3 },
  credibilityValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  credibilityNote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  postsHeading: { marginTop: 18, fontSize: 14, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 25, gap: 7 },
  refreshError: { marginBottom: 2, fontSize: 11, fontFamily: 'Inter_500Medium' },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  emptyBody: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
});
