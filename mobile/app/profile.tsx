import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  getCachedFxsnapProfile,
  getAuthenticatedAccount,
  type FxsnapAccount,
  type CachedFxsnapProfile,
} from '@/services/account';
import { notifyAccountDataChanged } from '@/services/accountDataEvents';
import {
  checkCommunityUsername,
  getCommunityMember,
  updateCommunityUsername,
} from '@/services/community';
import {
  EMPTY_TRADER_PROFILE,
  getTraderProfile,
  saveTraderProfile,
  type TraderProfile,
  type TradingExperience,
  type TradingMarket,
  type TradingStyle,
} from '@/services/traderProfile';
import { getFavoriteInstrumentError, getProfileCompletion } from '@/services/traderProfileModel';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { getLearningAchievements } from '@/services/learningAchievements';
import { getLearningProgress, type LearningProgress } from '@/services/learningProgress';

const PROFILE_PHOTO_KEY = 'fxsnap:profilePhoto:v1';
const EXPERIENCE_OPTIONS: Array<{ value: TradingExperience; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const MARKET_OPTIONS: Array<{ value: TradingMarket; label: string }> = [
  { value: 'forex', label: 'Forex' },
  { value: 'indices', label: 'Indices' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
];
const STYLE_OPTIONS: Array<{ value: TradingStyle; label: string }> = [
  { value: 'scalping', label: 'Scalping' },
  { value: 'day_trading', label: 'Day trading' },
  { value: 'swing', label: 'Swing trading' },
];
type CompletionField = 'name' | 'photo' | 'username' | 'bio' | 'complete';

function profileInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'FX';
}

function splitInstruments(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();
  const [account, setAccount] = useState<FxsnapAccount | null>(null);
  const [cachedProfile, setCachedProfile] = useState<CachedFxsnapProfile | null>(null);
  const [accountLoading, setAccountLoading] = useState(Platform.OS !== 'web');
  const [profileError, setProfileError] = useState('');
  const [communityCounts, setCommunityCounts] = useState<{ followers: number; following: number } | null>(null);
  const [communityStatsError, setCommunityStatsError] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [traderProfile, setTraderProfile] = useState<TraderProfile>(EMPTY_TRADER_PROFILE);
  const [learningProgress, setLearningProgress] = useState<LearningProgress | null>(null);
  const [learningProgressLoading, setLearningProgressLoading] = useState(true);
  const [learningProgressError, setLearningProgressError] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUsername, setDraftUsername] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftExperience, setDraftExperience] = useState<TradingExperience | ''>('');
  const [draftMarkets, setDraftMarkets] = useState<TradingMarket[]>([]);
  const [draftStyle, setDraftStyle] = useState<TradingStyle | ''>('');
  const [draftInstruments, setDraftInstruments] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [activeField, setActiveField] = useState<CompletionField>('complete');

  const refreshProfile = useCallback(async () => {
    setProfileError('');
    try {
      const [storedProfile, storedPhoto, cachedAccountProfile] = await Promise.all([
        getTraderProfile(),
        AsyncStorage.getItem(PROFILE_PHOTO_KEY),
        Platform.OS !== 'web' ? getCachedFxsnapProfile() : Promise.resolve(null),
      ]);
      setTraderProfile(storedProfile);
      setPhoto(storedPhoto);
      setCachedProfile(cachedAccountProfile);
      if (Platform.OS !== 'web') {
        if (cachedAccountProfile) {
          setAccountLoading(false);
        } else {
          setAccountLoading(true);
        }
        const currentAccount = await getAuthenticatedAccount();
        setAccount(currentAccount);
        const communityUsername = currentAccount?.communityUsername || cachedAccountProfile?.communityUsername || '';
        if (communityUsername) {
          try {
            const result = await getCommunityMember(communityUsername);
            setCommunityCounts({
              followers: result.member.followerCount,
              following: result.member.followingCount,
            });
            setCommunityStatsError('');
          } catch (error) {
            setCommunityCounts(null);
            setCommunityStatsError(error instanceof Error ? error.message : 'Community counts could not be loaded.');
          }
        } else {
          setCommunityCounts({ followers: 0, following: 0 });
          setCommunityStatsError('');
        }
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to load your profile.');
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshProfile().catch((error: unknown) => {
      if (active) setProfileError(error instanceof Error ? error.message : 'Unable to load your profile.');
    });
    return () => { active = false; };
  }, [refreshProfile]));

  useFocusEffect(useCallback(() => {
    let active = true;
    setLearningProgressLoading(true);
    setLearningProgressError('');
    void getLearningProgress()
      .then((progress) => {
        if (active) setLearningProgress(progress);
      })
      .catch((error: unknown) => {
        console.error('[Profile] Learning progress could not be loaded.', error);
        if (active) {
          setLearningProgressError(error instanceof Error ? error.message : 'Learning progress could not be loaded.');
        }
      })
      .finally(() => {
        if (active) setLearningProgressLoading(false);
      });
    return () => { active = false; };
  }, []));

  const displayName = settings.displayName.trim() || account?.displayName.trim() || cachedProfile?.displayName.trim() || '';
  const username = account?.communityUsername || cachedProfile?.communityUsername || '';
  const resolvedPhoto = photo || account?.pictureUrl || cachedProfile?.pictureUrl || null;
  const profileCompletion = getProfileCompletion({
    displayName,
    hasPhoto: Boolean(resolvedPhoto),
    username,
    bio: traderProfile.bio,
  });
  const completion = profileCompletion.percentage;
  const nextField: CompletionField = profileCompletion.nextField;
  const showCompletionCard = !accountLoading && !account && !cachedProfile && completion < 100;
  const animatedCompletion = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${animatedCompletion.value}%`,
  }));
  useEffect(() => {
    animatedCompletion.value = reduceMotion ? completion : withTiming(completion, { duration: 300 });
  }, [animatedCompletion, completion, reduceMotion]);
  const completionAction = {
    name: 'Add your display name',
    photo: 'Add a profile photo',
    username: 'Choose a community username',
    bio: 'Add a short bio',
    complete: 'Your profile is complete',
  }[nextField];

  useEffect(() => {
    if (!editVisible || !account || !username || draftUsername.trim().toLowerCase() === username.toLowerCase()) {
      setUsernameStatus(null);
      setCheckingUsername(false);
      return;
    }
    const candidate = draftUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(candidate)) {
      setUsernameStatus({ available: false, reason: 'Use 3–24 lowercase letters, numbers, or underscores.' });
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    setUsernameStatus(null);
    const timer = setTimeout(() => {
      void checkCommunityUsername(candidate)
        .then(setUsernameStatus)
        .catch((error: unknown) => setUsernameStatus({
          available: false,
          reason: error instanceof Error ? error.message : 'Username availability could not be checked.',
        }))
        .finally(() => setCheckingUsername(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [account, draftUsername, editVisible, username]);

  const openEditor = (field: CompletionField = 'complete') => {
    setActiveField(field);
    setDraftName(settings.displayName || account?.displayName || cachedProfile?.displayName || '');
    setDraftUsername(username);
    setDraftBio(traderProfile.bio);
    setDraftExperience(traderProfile.experience);
    setDraftMarkets(traderProfile.markets);
    setDraftStyle(traderProfile.tradingStyle);
    setDraftInstruments(traderProfile.favoriteInstruments.join(', '));
    setFieldError('');
    setUsernameStatus(null);
    setEditVisible(true);
  };

  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setProfileError('Allow photo-library access to choose a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        quality: 0.65,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.base64 || asset.base64.length > 1_800_000) {
        throw new Error('Choose a smaller profile photo and try again.');
      }
      const photoData = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
      await AsyncStorage.setItem(PROFILE_PHOTO_KEY, photoData);
      notifyAccountDataChanged();
      setPhoto(photoData);
      setPhotoFailed(false);
      setProfileError('');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to update your profile photo. Please try again.');
    }
  };

  const toggleMarket = (market: TradingMarket) => {
    setDraftMarkets((current) => current.includes(market)
      ? current.filter((item) => item !== market)
      : [...current, market]);
  };

  const saveProfile = async () => {
    const name = draftName.trim();
    const bio = draftBio.trim();
    const favoriteInstruments = splitInstruments(draftInstruments);
    if (name.length > 40) {
      setFieldError('Display name must be 40 characters or fewer.');
      return;
    }
    if (bio.length > 160) {
      setFieldError('Bio must be 160 characters or fewer.');
      return;
    }
    const instrumentError = getFavoriteInstrumentError(draftInstruments);
    if (instrumentError) {
      setFieldError(instrumentError);
      return;
    }
    const nextUsername = draftUsername.trim().toLowerCase();
    const usernameChanged = Boolean(username && nextUsername !== username.toLowerCase());
    if (usernameChanged && !usernameStatus?.available) {
      setFieldError(usernameStatus?.reason || 'Check that your username is available before saving.');
      return;
    }

    setSaving(true);
    setFieldError('');
    try {
      if (usernameChanged) {
        await updateCommunityUsername(nextUsername);
        const latestAccount = await getAuthenticatedAccount();
        setAccount(latestAccount);
      }
      const saved = await saveTraderProfile({
        bio,
        experience: draftExperience,
        markets: draftMarkets,
        tradingStyle: draftStyle,
        favoriteInstruments,
      });
      setTraderProfile(saved);
      updateSettings({ displayName: name });
      setEditVisible(false);
      Alert.alert('Profile updated', 'Your profile details have been saved.');
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : 'Your profile could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompletionAction = () => {
    if (nextField === 'photo') {
      void choosePhoto();
      return;
    }
    if (nextField === 'username' && !username) {
      router.push('/community');
      return;
    }
    if (nextField !== 'complete') openEditor(nextField);
  };

  const shareProfile = async () => {
    if (!username) {
      Alert.alert('Community profile unavailable', 'Join FXSnap Community to create a shareable community identity.');
      return;
    }
    try {
      await Share.share({
        message: `${displayName || `@${username}`} on FXSnap Community\nCommunity username: @${username}`,
      });
    } catch (error) {
      Alert.alert('Unable to share profile', error instanceof Error ? error.message : 'Please try again in a moment.');
    }
  };

  const infoMarkets = useMemo(
    () => traderProfile.markets.map((market) => MARKET_OPTIONS.find((option) => option.value === market)?.label || market),
    [traderProfile.markets],
  );
  const learningAchievements = learningProgress
    ? getLearningAchievements(learningProgress)
    : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AmbientBackdrop />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={[styles.headerButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
        >
          <Feather name="settings" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 92 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {profileError ? (
          <View style={[styles.errorBox, { borderColor: colors.sell, backgroundColor: colors.card }]}>
            <Feather name="alert-circle" size={16} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.sell }]}>{profileError}</Text>
            <TouchableOpacity onPress={() => void refreshProfile()} accessibilityLabel="Retry loading profile">
              <Feather name="refresh-cw" size={16} color={colors.sell} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.card, styles.identityCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.identityRow}>
            <View style={styles.avatarWrap}>
              {resolvedPhoto && !photoFailed ? (
                <Image
                  source={{ uri: resolvedPhoto }}
                  onError={() => setPhotoFailed(true)}
                  style={[styles.avatar, { borderColor: colors.cardBorder }]}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.avatarInitials, { color: colors.buy }]}>{profileInitials(displayName)}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => void choosePhoto()}
                style={[styles.avatarEdit, { backgroundColor: colors.buy, borderColor: colors.card }]}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
              >
                <Feather name="camera" size={13} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.identityCopy}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{displayName || 'Your profile'}</Text>
              <Text style={[styles.username, { color: username ? colors.buy : colors.textSecondary }]}>
                {username ? `@${username}` : 'Set your community username'}
              </Text>
              <Text style={[styles.bio, { color: traderProfile.bio ? colors.textSecondary : colors.textMuted }]} numberOfLines={2}>
                {traderProfile.bio || 'Add a short bio to introduce yourself.'}
              </Text>
            </View>
          </View>
          <View style={[styles.profileStats, { borderTopColor: colors.cardBorder }]}>
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatCount, { color: colors.text }]}>
                {communityCounts?.followers ?? (username ? '—' : 0)}
              </Text>
              <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>Followers</Text>
            </View>
            <View style={[styles.profileStatDivider, { backgroundColor: colors.cardBorder }]} />
            <View style={styles.profileStat}>
              <Text style={[styles.profileStatCount, { color: colors.text }]}>
                {communityCounts?.following ?? (username ? '—' : 0)}
              </Text>
              <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>Following</Text>
            </View>
          </View>
          {communityStatsError ? (
            <Text style={[styles.helperText, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
              {communityStatsError}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => openEditor()}
            style={[styles.secondaryAction, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
            accessibilityRole="button"
          >
            <Feather name="edit-2" size={15} color={colors.text} />
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>Edit profile</Text>
          </TouchableOpacity>
          {accountLoading ? (
            <View style={styles.loadingLine}>
              <ActivityIndicator size="small" color={colors.buy} />
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading account profile…</Text>
            </View>
          ) : !account && !cachedProfile && Platform.OS !== 'web' ? (
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={styles.signInPrompt}
              accessibilityRole="button"
            >
              <Feather name="cloud" size={15} color={colors.buy} />
              <Text style={[styles.signInPromptText, { color: colors.textSecondary }]}>
                Sign in from Settings to sync your profile across devices.
              </Text>
              <Feather name="chevron-right" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {showCompletionCard ? (
        <View style={[styles.card, styles.completionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.completionTop}>
            <View style={styles.completionTitleBlock}>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>COMPLETE YOUR PROFILE</Text>
              <Text style={[styles.completionTitle, { color: colors.text }]}>{completion}% complete</Text>
            </View>
            <View style={[styles.completionIcon, { backgroundColor: `${colors.buy}20` }]}>
              <Feather name={completion === 100 ? 'check' : 'user-plus'} size={18} color={colors.buy} />
            </View>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: completion }}
            style={[styles.progressTrack, { backgroundColor: colors.surface }]}
          >
            <Animated.View style={[styles.progressFill, { backgroundColor: colors.buy }, animatedProgressStyle]} />
          </View>
          <Text style={[styles.nextAction, { color: colors.textSecondary }]}>{completionAction}</Text>
          {nextField !== 'complete' ? (
            <TouchableOpacity
              onPress={handleCompletionAction}
              style={[styles.completionButton, { borderColor: colors.cardBorder }]}
              accessibilityRole="button"
            >
              <Text style={[styles.completionButtonText, { color: colors.buy }]}>
                {nextField === 'username' && !username ? 'Set username in Community' : 'Complete profile'}
              </Text>
              <Feather name="arrow-right" size={15} color={colors.buy} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.helperText, { color: colors.textMuted }]}>Based on your name, photo, community username, and bio.</Text>
        </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: '#E8B96A20' }]}>
              <Feather name="award" size={16} color="#C78B31" />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Learning progress</Text>
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Private to you · achievements are earned from completed lessons</Text>
            </View>
          </View>
          {learningProgressLoading ? (
            <View style={styles.learningLoading}>
              <ActivityIndicator size="small" color={colors.buy} />
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading learning progress…</Text>
            </View>
          ) : learningProgressError ? (
            <View style={styles.learningError}>
              <Text style={[styles.helperText, { color: colors.sell }]} accessibilityRole="alert">{learningProgressError}</Text>
              <TouchableOpacity
                onPress={() => {
                  setLearningProgressLoading(true);
                  setLearningProgressError('');
                  void getLearningProgress()
                    .then(setLearningProgress)
                    .catch((error: unknown) => {
                      console.error('[Profile] Learning progress retry failed.', error);
                      setLearningProgressError(error instanceof Error ? error.message : 'Learning progress could not be loaded.');
                    })
                    .finally(() => setLearningProgressLoading(false));
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading learning progress"
              >
                <Text style={[styles.completionButtonText, { color: colors.buy }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : learningAchievements ? (
            <>
              <View style={styles.learningStats}>
                <View style={[styles.learningStat, { backgroundColor: colors.surface }]}>
                  <Feather name="zap" size={16} color="#C78B31" />
                  <Text style={[styles.learningStatValue, { color: colors.text }]}>
                    {learningAchievements.currentStreak} {learningAchievements.currentStreak === 1 ? 'day' : 'days'}
                  </Text>
                  <Text style={[styles.learningStatLabel, { color: colors.textMuted }]}>Current streak</Text>
                </View>
                <View style={[styles.learningStat, { backgroundColor: colors.surface }]}>
                  <Feather name="book-open" size={16} color={colors.buy} />
                  <Text style={[styles.learningStatValue, { color: colors.text }]}>{learningAchievements.completedCount}</Text>
                  <Text style={[styles.learningStatLabel, { color: colors.textMuted }]}>Lessons completed</Text>
                </View>
              </View>
              {learningAchievements.earned.length ? (
                <View style={styles.achievementList}>
                  <Text style={[styles.learningSectionLabel, { color: colors.textSecondary }]}>EARNED ACHIEVEMENTS</Text>
                  {learningAchievements.earned.map((achievement) => (
                    <View key={achievement.id} style={[styles.achievementRow, { borderColor: colors.cardBorder }]}>
                      <View style={[styles.achievementIcon, { backgroundColor: '#E8B96A20' }]}>
                        <Feather name={achievement.icon} size={15} color="#C78B31" />
                      </View>
                      <View style={styles.achievementCopy}>
                        <Text style={[styles.achievementTitle, { color: colors.text }]}>{achievement.title}</Text>
                        <Text style={[styles.helperText, { color: colors.textMuted }]}>{achievement.description}</Text>
                      </View>
                      <Feather name="check-circle" size={15} color={colors.buy} />
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Complete your first lesson to earn an achievement. Your streak starts when you finish a lesson.
                </Text>
              )}
              <TouchableOpacity
                onPress={() => router.push('/learning-hub')}
                style={[styles.communityLink, { marginTop: 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Open Learning Hub"
              >
                <Text style={[styles.completionButtonText, { color: colors.buy }]}>Open Learning Hub</Text>
                <Feather name="arrow-up-right" size={15} color={colors.buy} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="bar-chart-2" size={16} color={colors.buy} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trading Profile</Text>
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Optional preferences · self-reported</Text>
            </View>
            <TouchableOpacity onPress={() => openEditor()} accessibilityRole="button" accessibilityLabel="Edit trading profile">
              <Feather name="edit-2" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ProfileDetail label="Experience" value={EXPERIENCE_OPTIONS.find((item) => item.value === traderProfile.experience)?.label} colors={colors} />
          <ProfileDetail label="Markets" value={infoMarkets.join(' · ')} colors={colors} />
          <ProfileDetail label="Style" value={STYLE_OPTIONS.find((item) => item.value === traderProfile.tradingStyle)?.label} colors={colors} />
          <ProfileDetail label="Favourite instruments" value={traderProfile.favoriteInstruments.join(' · ')} colors={colors} last />
          {!traderProfile.experience && !infoMarkets.length && !traderProfile.tradingStyle && !traderProfile.favoriteInstruments.length ? (
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Add any preferences you would like to keep with your profile.</Text>
          ) : null}
        </View>

        {username ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: `${colors.buy}18` }]}>
              <Feather name="users" size={16} color={colors.buy} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Community</Text>
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Your public identity in discussions</Text>
            </View>
          </View>
          {username ? (
            <>
              <View style={styles.communityIdentity}>
                <Text style={[styles.communityAt, { color: colors.buy }]}>@</Text>
                <Text style={[styles.communityName, { color: colors.text }]}>{username}</Text>
                <View style={[styles.memberBadge, { backgroundColor: `${colors.buy}18` }]}>
                  <Text style={[styles.memberBadgeText, { color: colors.buy }]}>MEMBER</Text>
                </View>
              </View>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Only your username is shown with community posts. Your bio and trading preferences stay private unless you choose to share them.
              </Text>
              <TouchableOpacity onPress={() => router.push('/community')} style={styles.communityLink} accessibilityRole="button">
                <Text style={[styles.completionButtonText, { color: colors.buy }]}>Open Community</Text>
                <Feather name="arrow-up-right" size={15} color={colors.buy} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void shareProfile()} style={styles.shareLink} accessibilityRole="button">
                <Feather name="share-2" size={15} color={colors.textSecondary} />
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>Share username</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        ) : null}

      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 6), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <TabItem icon="home" label="Home" colors={colors} onPress={() => router.replace('/(tabs)/home')} />
        <TabItem icon="users" label="Community" colors={colors} onPress={() => router.push('/community')} />
        <TouchableOpacity onPress={() => router.replace('/analysis')} style={styles.aiTab} accessibilityLabel="Open FXSnap AI analysis">
          <View style={[styles.aiCircle, { backgroundColor: colors.buy }]}>
            <Feather name="aperture" size={22} color={colors.primaryForeground} />
          </View>
        </TouchableOpacity>
        <TabItem icon="calendar" label="Events" colors={colors} onPress={() => router.replace('/events')} />
        <TabItem icon="user" label="Profile" active colors={colors} onPress={() => {}} />
      </View>

      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.editor, { backgroundColor: colors.card, borderColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.editorHeader}>
              <View>
                <Text style={[styles.editorTitle, { color: colors.text }]}>Edit profile</Text>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>Share only what you’re comfortable sharing.</Text>
              </View>
              <TouchableOpacity onPress={() => setEditVisible(false)} accessibilityLabel="Close profile editor">
                <Feather name="x" size={21} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <KeyboardAwareScrollViewCompat
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bottomOffset={20}
            >
              <TouchableOpacity onPress={() => void choosePhoto()} style={styles.photoEditorButton} accessibilityRole="button">
                {resolvedPhoto && !photoFailed
                  ? <Image source={{ uri: resolvedPhoto }} style={styles.editorAvatar} />
                  : <View style={[styles.editorAvatar, styles.avatarFallback, { backgroundColor: colors.surface }]}><Feather name="user" size={24} color={colors.buy} /></View>}
                <View>
                  <Text style={[styles.fieldTitle, { color: colors.text }]}>Profile photo</Text>
                  <Text style={[styles.helperText, { color: colors.buy }]}>Choose or change photo</Text>
                </View>
              </TouchableOpacity>

              <FieldLabel label="Display name" colors={colors} />
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                maxLength={40}
                autoFocus={activeField === 'name'}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
              />

              <FieldLabel label="Community username" colors={colors} />
              {username ? (
                <>
                  <View style={[styles.usernameInput, { backgroundColor: colors.surface, borderColor: usernameStatus?.available ? colors.buy : colors.cardBorder }]}>
                    <Text style={[styles.atSign, { color: colors.textMuted }]}>@</Text>
                    <TextInput
                      value={draftUsername}
                      onChangeText={(value) => setDraftUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24))}
                      maxLength={24}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="trader_name"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.usernameTextInput, { color: colors.text }]}
                    />
                    {checkingUsername ? <ActivityIndicator size="small" color={colors.buy} /> : null}
                  </View>
                  <Text style={[styles.helperText, { color: usernameStatus?.available ? colors.buy : colors.textMuted }]}>
                    {draftUsername.trim().toLowerCase() === username.toLowerCase()
                      ? 'Your current username.'
                      : usernameStatus?.reason || (usernameStatus?.available ? 'Username available.' : '3–24 lowercase letters, numbers, or underscores.')}
                  </Text>
                </>
              ) : (
                <TouchableOpacity onPress={() => { setEditVisible(false); router.push('/community'); }} style={styles.inlineLink}>
                  <Text style={[styles.helperText, { color: colors.buy }]}>Join Community to choose a unique username.</Text>
                  <Feather name="arrow-right" size={14} color={colors.buy} />
                </TouchableOpacity>
              )}

              <FieldLabel label="Bio" colors={colors} />
              <TextInput
                value={draftBio}
                onChangeText={setDraftBio}
                maxLength={160}
                multiline
                autoFocus={activeField === 'bio'}
                placeholder="A few words about yourself"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.bioInput, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
              />
              <Text style={[styles.counter, { color: colors.textMuted }]}>{draftBio.length}/160</Text>

              <FieldLabel label="Experience" colors={colors} />
              <OptionRow
                values={EXPERIENCE_OPTIONS}
                selected={draftExperience}
                onSelect={(value) => setDraftExperience(value as TradingExperience)}
                onClear={() => setDraftExperience('')}
                colors={colors}
              />
              <FieldLabel label="Preferred markets" colors={colors} />
              <View style={styles.chipWrap}>
                {MARKET_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.value}
                    label={option.label}
                    selected={draftMarkets.includes(option.value)}
                    onPress={() => toggleMarket(option.value)}
                    colors={colors}
                  />
                ))}
              </View>
              <FieldLabel label="Trading style" colors={colors} />
              <OptionRow
                values={STYLE_OPTIONS}
                selected={draftStyle}
                onSelect={(value) => setDraftStyle(value as TradingStyle)}
                onClear={() => setDraftStyle('')}
                colors={colors}
              />
              <FieldLabel label="Favourite instruments" colors={colors} />
              <TextInput
                value={draftInstruments}
                onChangeText={setDraftInstruments}
                maxLength={100}
                autoCapitalize="characters"
                placeholder="EURUSD, GBPUSD"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
              />
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Up to five codes, separated by commas. Kept private with your app profile.</Text>
              {fieldError ? <Text style={[styles.fieldError, { color: colors.sell }]}>{fieldError}</Text> : null}
              <TouchableOpacity
                onPress={() => void saveProfile()}
                disabled={saving || checkingUsername || (Boolean(username) && draftUsername.trim().toLowerCase() !== username.toLowerCase() && !usernameStatus?.available)}
                style={[styles.saveButton, { backgroundColor: colors.buy, opacity: saving ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={17} color={colors.primaryForeground} />}
                <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save profile'}</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FieldLabel({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return <Text style={[styles.fieldTitle, { color: colors.text }]}>{label}</Text>;
}

function ChoiceChip({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.choiceChip, { backgroundColor: selected ? `${colors.buy}20` : colors.surface, borderColor: selected ? colors.buy : colors.cardBorder }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      {selected ? <Feather name="check" size={12} color={colors.buy} /> : null}
      <Text style={[styles.choiceText, { color: selected ? colors.buy : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function OptionRow<T extends string>({
  values,
  selected,
  onSelect,
  onClear,
  colors,
}: {
  values: Array<{ value: T; label: string }>;
  selected: T | '';
  onSelect: (value: T) => void;
  onClear: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.chipWrap}>
      {values.map((option) => (
        <ChoiceChip
          key={option.value}
          label={option.label}
          selected={selected === option.value}
          onPress={() => selected === option.value ? onClear() : onSelect(option.value)}
          colors={colors}
        />
      ))}
    </View>
  );
}

function ProfileDetail({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value?: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && { borderBottomColor: colors.cardBorder, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: value ? colors.text : colors.textMuted }]}>{value || 'Not set'}</Text>
    </View>
  );
}

function TabItem({
  icon,
  label,
  active,
  colors,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tabItem} accessibilityRole="button" accessibilityLabel={label}>
      <Feather name={icon} size={20} color={active ? colors.buy : colors.textMuted} />
      <Text style={[styles.tabLabel, { color: active ? colors.buy : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  headerButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  card: { borderWidth: 1, borderRadius: 17, padding: 15, gap: 12 },
  identityCard: { gap: 13 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 23, fontFamily: 'Inter_700Bold' },
  avatarEdit: { position: 'absolute', right: -2, bottom: -1, width: 27, height: 27, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, gap: 4 },
  name: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  username: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  bio: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  secondaryAction: { minHeight: 42, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  profileStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  profileStat: { flex: 1, alignItems: 'center', gap: 2 },
  profileStatCount: { fontSize: 16, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  profileStatLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  profileStatDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  signInPrompt: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  signInPromptText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  loadingLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helperText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  completionCard: { gap: 10 },
  completionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completionTitleBlock: { gap: 3 },
  eyebrow: { fontSize: 9, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  completionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  completionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  nextAction: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  completionButton: { minHeight: 38, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11 },
  completionButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  learningLoading: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  learningError: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  learningStats: { flexDirection: 'row', gap: 9 },
  learningStat: { minHeight: 74, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 13, paddingVertical: 8 },
  learningStatValue: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  learningStatLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  achievementList: { gap: 7 },
  learningSectionLabel: { marginTop: 2, fontSize: 8, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  achievementRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  achievementIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  achievementCopy: { flex: 1, gap: 2 },
  achievementTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  detailRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  emptyHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  communityIdentity: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 3 },
  communityAt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  communityName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  memberBadge: { marginLeft: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  memberBadgeText: { fontSize: 8, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  communityLink: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shareLink: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7 },
  errorBox: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8 },
  tabItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  aiTab: { width: 58, alignItems: 'center', justifyContent: 'center', marginTop: -18 },
  aiCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  editor: { maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingTop: 18, paddingHorizontal: 17 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#88888855' },
  editorTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  editorContent: { gap: 9, paddingTop: 13, paddingBottom: 8 },
  photoEditorButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  editorAvatar: { width: 48, height: 48, borderRadius: 24 },
  fieldTitle: { marginTop: 5, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, fontFamily: 'Inter_500Medium' },
  bioInput: { minHeight: 72, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', marginTop: -5, fontSize: 10, fontFamily: 'Inter_400Regular' },
  usernameInput: { minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  atSign: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  usernameTextInput: { flex: 1, height: '100%', paddingVertical: 8, fontSize: 13, fontFamily: 'Inter_500Medium' },
  inlineLink: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceChip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderWidth: 1, borderRadius: 18 },
  choiceText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  fieldError: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  saveButton: { minHeight: 46, marginTop: 5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
