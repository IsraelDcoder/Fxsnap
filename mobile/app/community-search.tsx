import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import CommunityPostCard from '@/components/CommunityPostCard';
import CommunityPreviewNotice from '@/components/CommunityPreviewNotice';
import { useColors } from '@/hooks/useColors';
import {
  COMMUNITY_CATEGORIES,
  searchCommunity,
  followCommunityMember,
  shareCommunityPost,
  toggleCommunityReaction,
  unfollowCommunityMember,
  type CommunityMessage,
  type CommunityReaction,
  type CommunitySearchKind,
  type CommunitySearchResults,
} from '@/services/community';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EMPTY_RESULTS: CommunitySearchResults = { posts: [], people: [], topics: [] };
const SEARCH_TABS: Array<{ id: CommunitySearchKind; label: string }> = [
  { id: 'posts', label: 'Posts' },
  { id: 'people', label: 'People' },
  { id: 'topics', label: 'Topics' },
];

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Community search failed. Please try again.';
}

function avatarColor(color: string, textColor: string, username: string) {
  return (
    <View style={[styles.avatarFallback, { backgroundColor: color }]}>
      <Text style={[styles.avatarLetter, { color: textColor }]}>{username.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function CommunitySearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CommunitySearchKind>('posts');
  const [results, setResults] = useState<CommunitySearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [reactionBusyIds, setReactionBusyIds] = useState<Set<string>>(() => new Set());
  const pendingReactionIds = useRef(new Set<string>());

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError('');
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      void searchCommunity(normalized, kind).then((value) => {
        if (active) {
          setResults(value);
          setRecentSearches((previous) => [
            normalized,
            ...previous.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
          ].slice(0, 5));
        }
      }).catch((failure: unknown) => {
        if (active) setError(messageFor(failure));
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, query, retryCount]);

  const toggleReaction = async (post: CommunityMessage, reaction: CommunityReaction) => {
    if (pendingReactionIds.current.has(post.id)) return;
    pendingReactionIds.current.add(post.id);
    setReactionBusyIds((current) => new Set(current).add(post.id));
    try {
      const response = await toggleCommunityReaction(post.id, reaction);
      setResults((previous) => ({
        ...previous,
        posts: previous.posts.map((item) => item.id === post.id ? { ...item, reactions: response.reactions } : item),
      }));
    } catch (failure) {
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
        setResults((previous) => ({
          ...previous,
          posts: previous.posts.map((item) => item.id === post.id ? { ...item, shareCount } : item),
        }));
      }
    } catch (failure) {
      Alert.alert('Could not share post', messageFor(failure));
    }
  };

  const toggleFollow = async (post: CommunityMessage) => {
    const wasFollowing = post.isFollowed;
    setResults((previous) => ({
      ...previous,
      posts: previous.posts.map((item) => item.id === post.id ? { ...item, isFollowed: !wasFollowing } : item),
    }));
    try {
      if (wasFollowing) await unfollowCommunityMember(post.authorUsername);
      else await followCommunityMember(post.authorUsername);
    } catch (failure) {
      setResults((previous) => ({
        ...previous,
        posts: previous.posts.map((item) => item.id === post.id ? { ...item, isFollowed: wasFollowing } : item),
      }));
      Alert.alert('Could not update follow', messageFor(failure));
    }
  };

  const posts = kind === 'posts' ? results.posts : [];
  const people = kind === 'people' ? results.people : [];
  const topics = kind === 'topics' ? results.topics : [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Feather name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search posts, people, topics"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search Community"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View style={[styles.tabs, { borderBottomColor: colors.cardBorder }]}>
        {SEARCH_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setKind(tab.id)}
            style={[styles.tab, kind === tab.id && { borderBottomColor: colors.buy }]}
          >
            <Text style={[styles.tabText, { color: kind === tab.id ? colors.buy : colors.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <CommunityPreviewNotice />
      {loading ? <ActivityIndicator style={styles.loading} color={colors.buy} /> : null}
      {error ? (
        <View style={styles.state}>
          <Text style={[styles.stateText, { color: colors.sell }]}>{error}</Text>
          <TouchableOpacity onPress={() => setRetryCount((value) => value + 1)} style={[styles.retry, { borderColor: colors.cardBorder }]}>
            <Text style={[styles.retryText, { color: colors.buy }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {query.trim().length < 2 ? (
        <ScrollView contentContainerStyle={[styles.discoverContent, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          {recentSearches.length ? (
            <View style={styles.discoverSection}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent searches</Text>
                <TouchableOpacity onPress={() => setRecentSearches([])} accessibilityLabel="Clear recent searches">
                  <Text style={[styles.clearText, { color: colors.buy }]}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((item) => (
                <View key={item} style={styles.recentRow}>
                  <Feather name="clock" size={15} color={colors.textMuted} />
                  <TouchableOpacity onPress={() => { setKind('posts'); setQuery(item); }} style={styles.recentQuery}>
                    <Text style={[styles.recentText, { color: colors.textSecondary }]} numberOfLines={1}>{item}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setRecentSearches((previous) => previous.filter((queryItem) => queryItem !== item))} accessibilityLabel={`Remove ${item} from recent searches`}>
                    <Feather name="x" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.discoverSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Explore topics</Text>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>Browse supported Community topics. Results are loaded from FXSnap.</Text>
            <View style={styles.topicChips}>
              {COMMUNITY_CATEGORIES.filter((item) => item.id !== 'events').map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => { setKind('topics'); setQuery(item.label); }}
                  style={[styles.topicChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={[styles.topicChipText, { color: colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {!recentSearches.length ? (
            <View style={styles.discoverHint}>
              <Feather name="search" size={19} color={colors.buy} />
              <Text style={[styles.stateText, { color: colors.textMuted }]}>Search posts, people, and topics with at least two characters.</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      {kind === 'posts' ? (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <CommunityPostCard
              post={item}
              ownAccount={false}
              reactionBusy={reactionBusyIds.has(item.id)}
              onReact={(reaction) => void toggleReaction(item, reaction)}
              onComment={() => router.push({ pathname: '/community', params: { postId: item.id } })}
              onShare={(cardView) => { void sharePost(item, cardView); }}
              onMore={() => router.push({ pathname: '/community', params: { postId: item.id } })}
              onFollow={() => void toggleFollow(item)}
              onAuthorPress={() => router.push({ pathname: '/community-member', params: { username: item.authorUsername } })}
            />
          )}
          ListEmptyComponent={query.trim().length >= 2 && !loading && !error ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No posts match “{query.trim()}”.</Text>
          ) : null}
        />
      ) : null}
      {kind === 'people' ? (
        <FlatList
          data={people}
          keyExtractor={(person) => person.accountId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/community-member', params: { username: item.username } })}
              style={[styles.person, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              {item.pictureUrl ? <Image source={{ uri: item.pictureUrl }} style={styles.avatar} /> : avatarColor(colors.surface, colors.text, item.username)}
              <View style={styles.personCopy}>
                <Text style={[styles.personName, { color: colors.text }]}>@{item.username}</Text>
                <Text style={[styles.personSub, { color: colors.textMuted }]}>FXSnap Community member</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={query.trim().length >= 2 && !loading && !error ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No members match “{query.trim()}”.</Text>
          ) : null}
        />
      ) : null}
      {kind === 'topics' ? (
        <FlatList
          data={topics}
          keyExtractor={(topic) => topic.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/community', params: { category: item.id } })}
              style={[styles.topic, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={[styles.topicIcon, { backgroundColor: `${colors.buy}18` }]}>
                <Feather name="hash" size={17} color={colors.buy} />
              </View>
              <Text style={[styles.topicName, { color: colors.text }]}>{item.label}</Text>
              <Feather name="arrow-up-right" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={query.trim().length >= 2 && !loading && !error ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No topics match “{query.trim()}”.</Text>
          ) : null}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, fontFamily: 'Inter_400Regular' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loading: { marginTop: 18 },
  list: { padding: 14, gap: 10 },
  discoverContent: { padding: 16, gap: 24 },
  discoverSection: { gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  clearText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  state: { paddingHorizontal: 18, paddingTop: 20, alignItems: 'center', gap: 10 },
  recentRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentQuery: { flex: 1, minHeight: 38, justifyContent: 'center' },
  recentText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  topicChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12 },
  topicChipText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  discoverHint: { alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 6 },
  stateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  empty: { textAlign: 'center', paddingTop: 32, fontSize: 13, fontFamily: 'Inter_400Regular' },
  retry: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  retryText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  person: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  personCopy: { flex: 1, gap: 3 },
  personName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  personSub: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  topic: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  topicIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topicName: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
