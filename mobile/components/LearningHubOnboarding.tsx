import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Animated, {
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useColors } from '@/hooks/useColors';
import type { LearningExperienceLevel } from '@/services/learningProgress';

const JOURNEY_STAGES = [
  { title: 'Forex Fundamentals', detail: 'Understand currencies, quotes, and how a trade works.', icon: 'book-open' as const },
  { title: 'Technical Analysis', detail: 'Read charts, price structure, and market context.', icon: 'bar-chart-2' as const },
  { title: 'Risk Management', detail: 'Plan position size, exposure, and downside.', icon: 'shield' as const },
  { title: 'Trading Psychology', detail: 'Build process-focused habits and disciplined review.', icon: 'heart' as const },
  { title: 'Advanced Concepts', detail: 'Explore economic context, research, and strategy practice.', icon: 'trending-up' as const },
];

const EXPERIENCE_LEVELS: Array<{
  id: LearningExperienceLevel;
  title: string;
  detail: string;
}> = [
  { id: 'new_to_fx', title: 'New to forex', detail: 'Start with the essential ideas.' },
  { id: 'know_the_basics', title: 'I know the basics', detail: 'Build confidence and connect concepts.' },
  { id: 'experienced', title: 'Experienced', detail: 'Sharpen my process and fill gaps.' },
];

const SCREEN_COUNT = 4;

export function LearningHubOnboarding({
  saving,
  error,
  onStart,
  onBack,
}: {
  saving: boolean;
  error: string | null;
  onStart: (experienceLevel: LearningExperienceLevel) => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [screen, setScreen] = useState(0);
  const [experienceLevel, setExperienceLevel] = useState<LearningExperienceLevel>('new_to_fx');

  const next = () => setScreen((current) => Math.min(SCREEN_COUNT - 1, current + 1));
  const back = () => {
    if (screen === 0) onBack();
    else setScreen((current) => Math.max(0, current - 1));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <AmbientBackdrop />
      <View style={styles.topBar}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={screen === 0 ? 'Leave Learning Hub onboarding' : 'Previous onboarding screen'}
          onPress={back}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Feather name={screen === 0 ? 'x' : 'arrow-left'} size={18} color={colors.text} />
        </TouchableOpacity>
        <View
          style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}
          accessibilityLabel={`Screen ${screen + 1} of ${SCREEN_COUNT}`}
        >
          <View style={[styles.progressFill, { width: `${((screen + 1) / SCREEN_COUNT) * 100}%`, backgroundColor: colors.buy }]} />
        </View>
        <Text style={[styles.counter, { color: colors.textSecondary }]}>{String(screen + 1).padStart(2, '0')} <Text style={{ color: colors.textMuted }}>/ {String(SCREEN_COUNT).padStart(2, '0')}</Text></Text>
      </View>

      <ScrollView
        key={screen}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(420)}>
          {screen === 0 ? <WelcomeScreen colors={colors} /> : null}
          {screen === 1 ? <JourneyScreen colors={colors} /> : null}
          {screen === 2 ? <RewardScreen colors={colors} /> : null}
          {screen === 3 ? (
            <BeginScreen
              colors={colors}
              experienceLevel={experienceLevel}
              onSelectLevel={setExperienceLevel}
            />
          ) : null}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={15} color={colors.sell} />
            <Text style={[styles.errorText, { color: colors.sell }]}>{error}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={screen === SCREEN_COUNT - 1 ? 'Start my first lesson' : 'Continue Learning Hub introduction'}
          disabled={saving}
          onPress={() => screen === SCREEN_COUNT - 1 ? onStart(experienceLevel) : next()}
          style={[styles.primaryButton, { backgroundColor: colors.buy, opacity: saving ? 0.75 : 1 }]}
        >
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : (
            <>
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                {screen === SCREEN_COUNT - 1 ? 'Start my first lesson' : 'Continue'}
              </Text>
              <Feather name={screen === SCREEN_COUNT - 1 ? 'play' : 'arrow-right'} size={17} color={colors.primaryForeground} />
            </>
          )}
        </TouchableOpacity>
        <View style={styles.footerTrustRow}>
          <Feather name={screen === SCREEN_COUNT - 1 ? 'bookmark' : 'clock'} size={11} color={colors.textMuted} />
          <Text style={[styles.footerCaption, { color: colors.textMuted }]}>
            {screen === SCREEN_COUNT - 1 ? 'Saved to your learning profile' : 'About 30 seconds · Pick up anytime'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function WelcomeScreen({ colors }: { colors: ReturnType<typeof useColors> }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return undefined;
    }
    pulse.value = withRepeat(withTiming(1.12, { duration: 1400 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View>
      <LinearGradient
        colors={['#062E27', '#0A5B4C', '#0F806A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.welcomeArtwork}
      >
        <View style={styles.artworkOrbLarge} />
        <View style={styles.artworkOrbSmall} />
        <View style={styles.artworkTopline}>
          <View style={styles.artworkBrandMark}>
            <Feather name="book-open" size={12} color="#D8FFF2" />
          </View>
          <Text style={styles.artworkBrand}>FXSNAP ACADEMY</Text>
          <View style={styles.artworkLevelPill}>
            <Feather name="layers" size={9} color="#F3D38A" />
            <Text style={styles.artworkLevelText}>20 LEVELS</Text>
          </View>
        </View>
        <View style={styles.chartFrame}>
          <View style={styles.chartTitleRow}>
            <View>
              <Text style={styles.chartEyebrow}>YOUR LEARNING CURVE</Text>
              <Text style={styles.chartHeadline}>Build skill with every lesson</Text>
            </View>
            <Animated.View style={[styles.chartPulse, pulseStyle]}>
              <Feather name="trending-up" size={15} color="#F3D38A" />
            </Animated.View>
          </View>
          <Svg width="100%" height={80} viewBox="0 0 320 80" preserveAspectRatio="none">
            {[18, 39, 60].map((y) => (
              <Line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#D8FFF2" strokeOpacity="0.12" strokeWidth="1" />
            ))}
            <Path d="M5 66 C28 60 33 52 55 57 S86 49 104 46 S134 50 151 38 S177 41 197 30 S223 35 240 22 S270 28 286 13 S304 16 315 8" fill="none" stroke="#F3D38A" strokeOpacity="0.18" strokeWidth="8" />
            <Path d="M5 66 C28 60 33 52 55 57 S86 49 104 46 S134 50 151 38 S177 41 197 30 S223 35 240 22 S270 28 286 13 S304 16 315 8" fill="none" stroke="#F3D38A" strokeWidth="2.5" />
            <Circle cx="315" cy="8" r="8" fill="#F3D38A" fillOpacity="0.19" />
            <Circle cx="315" cy="8" r="3.5" fill="#F3D38A" />
          </Svg>
        </View>
        <View style={styles.artworkFooter}>
          <View style={styles.artworkFooterItem}><Feather name="book-open" size={11} color="#CFF4E7" /><Text style={styles.artworkFooterText}>LESSONS</Text></View>
          <View style={styles.artworkFooterDivider} />
          <View style={styles.artworkFooterItem}><Feather name="check-circle" size={11} color="#CFF4E7" /><Text style={styles.artworkFooterText}>KNOWLEDGE CHECKS</Text></View>
          <View style={styles.artworkFooterDivider} />
          <View style={styles.artworkFooterItem}><Feather name="award" size={11} color="#F3D38A" /><Text style={styles.artworkFooterText}>MILESTONES</Text></View>
        </View>
      </LinearGradient>
      <Text style={[styles.eyebrow, { color: colors.buy }]}>WELCOME TO THE LEARNING HUB</Text>
      <Text style={[styles.heading, { color: colors.text }]}>Become more confident in how you read the markets.</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        A guided forex education built to turn complex ideas into clear, practical knowledge—one milestone at a time.
      </Text>
      <View style={styles.valueGrid}>
        <ValueCard icon="map" title="A clear path" detail="Know what to learn next." colors={colors} />
        <ValueCard icon="target" title="Practical checks" detail="Reinforce each idea." colors={colors} />
        <ValueCard icon="clock" title="Your pace" detail="Progress stays saved." colors={colors} />
      </View>
      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Education helps build understanding; it cannot remove trading risk or guarantee results.</Text>
    </View>
  );
}

function JourneyScreen({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View>
      <JourneyHero />
      <Text style={[styles.eyebrow, { color: colors.buy }]}>THE JOURNEY</Text>
      <Text style={[styles.heading, { color: colors.text }]}>A curriculum with a destination.</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Build from the basics to more advanced ideas. Lessons and assessment checks unlock as you complete each part of the path.
      </Text>
      <View style={styles.stageList}>
        {JOURNEY_STAGES.map((stage, index) => (
          <Animated.View key={stage.title} entering={FadeInDown.delay(index * 70).duration(300)} style={styles.stageRow}>
            <View style={styles.stageRail}>
              <View style={[styles.stageNode, { backgroundColor: index === 0 ? colors.buy : colors.card, borderColor: `${colors.buy}45` }]}>
                <Feather name={stage.icon} size={14} color={index === 0 ? '#FFFFFF' : colors.buy} />
              </View>
              {index < JOURNEY_STAGES.length - 1 ? <View style={[styles.stageConnector, { backgroundColor: `${colors.buy}30` }]} /> : null}
            </View>
            <View style={[styles.stageCard, { backgroundColor: colors.card, borderColor: index === 0 ? `${colors.buy}50` : colors.cardBorder }]}>
              <View style={styles.stageTitleRow}>
                <Text style={[styles.stageIndex, { color: colors.buy }]}>0{index + 1}</Text>
                <Text style={[styles.stageTitle, { color: colors.text }]}>{stage.title}</Text>
              </View>
              <Text style={[styles.stageDetail, { color: colors.textSecondary }]}>{stage.detail}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
      <View style={[styles.trustNote, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Feather name="check-circle" size={17} color={colors.buy} />
        <Text style={[styles.trustNoteText, { color: colors.textSecondary }]}>Progress is earned through lessons and assessments—not market results.</Text>
      </View>
    </View>
  );
}

function RewardScreen({ colors }: { colors: ReturnType<typeof useColors> }) {
  const reduceMotion = useReducedMotion();
  const shine = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      shine.value = 0;
      return undefined;
    }
    shine.value = withRepeat(withTiming(1, { duration: 2400 }), -1, false);
    return () => cancelAnimation(shine);
  }, [reduceMotion, shine]);
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -230 + shine.value * 460 }, { rotate: '24deg' }],
  }));

  return (
    <View>
      <RewardArtwork colors={colors} />
      <Text style={[styles.eyebrow, { color: colors.buy }]}>A MILESTONE TO WORK TOWARD</Text>
      <Text style={[styles.heading, { color: colors.text }]}>Earn recognition for what you’ve learned.</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Complete the curriculum and pass its required knowledge assessments to unlock the FXSnap Pro Trader learning badge.
      </Text>
      <LinearGradient
        colors={['#092E27', '#0B5A4C', '#087463']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rewardCard}
      >
        <Animated.View pointerEvents="none" style={[styles.rewardShine, shineStyle]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View style={styles.rewardBadge}>
          <Feather name="award" size={33} color="#F2CF79" />
        </View>
        <View style={styles.rewardCopy}>
          <Text style={styles.rewardEyebrow}>CURRICULUM MILESTONE</Text>
          <Text style={styles.rewardTitle}>Pro Trader</Text>
          <View style={styles.rewardRequirement}>
            <Feather name="check" size={10} color="#C8F2DF" />
            <Text style={styles.rewardSubtitle}>Learning path completed</Text>
          </View>
          <View style={styles.rewardRequirement}>
            <Feather name="check" size={10} color="#C8F2DF" />
            <Text style={styles.rewardSubtitle}>Required assessments passed</Text>
          </View>
        </View>
        <View style={styles.lockedBadge}><Feather name="lock" size={13} color="#EAF8F1" /></View>
      </LinearGradient>
      <View style={[styles.credentialNote, { backgroundColor: `${colors.gold}12`, borderColor: `${colors.gold}35` }]}>
        <Feather name="info" size={16} color={colors.gold} />
        <Text style={[styles.credentialText, { color: colors.textSecondary }]}>
          This is recognition of FXSnap curriculum completion only—not profitability, professional qualification, or a promise of trading results. When supported, your earned badge can be displayed on your profile and learning identity.
        </Text>
      </View>
    </View>
  );
}

function BeginScreen({
  colors,
  experienceLevel,
  onSelectLevel,
}: {
  colors: ReturnType<typeof useColors>;
  experienceLevel: LearningExperienceLevel;
  onSelectLevel: (level: LearningExperienceLevel) => void;
}) {
  return (
    <View>
      <BeginHero />
      <Text style={[styles.eyebrow, { color: colors.buy }]}>READY WHEN YOU ARE</Text>
      <Text style={[styles.heading, { color: colors.text }]}>Your first lesson is waiting.</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        We’ll save your starting point. Everyone begins with the foundations and builds forward as they learn.
      </Text>
      <Text style={[styles.levelPrompt, { color: colors.text }]}>Choose a starting level <Text style={{ color: colors.textMuted, fontFamily: 'Inter_400Regular' }}>· optional</Text></Text>
      <View style={styles.levelList}>
        {EXPERIENCE_LEVELS.map((level) => {
          const selected = experienceLevel === level.id;
          return (
            <TouchableOpacity
              key={level.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onSelectLevel(level.id)}
              style={[
                styles.levelCard,
                {
                  backgroundColor: selected ? `${colors.buy}12` : colors.card,
                  borderColor: selected ? colors.buy : colors.cardBorder,
                },
              ]}
            >
              <View style={[styles.radioOuter, { borderColor: selected ? colors.buy : colors.textMuted }]}>
                {selected ? <View style={[styles.radioInner, { backgroundColor: colors.buy }]} /> : null}
              </View>
              <View style={styles.levelCopy}>
                <Text style={[styles.levelTitle, { color: colors.text }]}>{level.title}</Text>
                <Text style={[styles.levelDetail, { color: colors.textSecondary }]}>{level.detail}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.beginPromise, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Feather name="bookmark" size={14} color={colors.buy} />
        <Text style={[styles.optionalNote, { color: colors.textSecondary }]}>Your progress is saved automatically. Revisit lessons or continue your path whenever you’re ready.</Text>
      </View>
    </View>
  );
}

function ValueCard({ icon, title, detail, colors }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  detail: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.valueCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[styles.valueIcon, { backgroundColor: `${colors.buy}13` }]}>
        <Feather name={icon} size={14} color={colors.buy} />
      </View>
      <Text style={[styles.valueTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.valueDetail, { color: colors.textSecondary }]}>{detail}</Text>
    </View>
  );
}

function JourneyHero() {
  return (
    <LinearGradient colors={['#092F28', '#0B6D5B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.journeyHero}>
      <View style={styles.journeyHeroTop}>
        <View>
          <Text style={styles.journeyHeroEyebrow}>YOUR CURRICULUM</Text>
          <Text style={styles.journeyHeroTitle}>From first steps{'\n'}to deeper insight.</Text>
        </View>
        <View style={styles.journeyHeroIcon}><Feather name="map" size={21} color="#E4F9EF" /></View>
      </View>
      <View style={styles.journeyHeroBottom}>
        <View style={styles.journeyHeroStat}>
          <Text style={styles.journeyHeroNumber}>20</Text>
          <Text style={styles.journeyHeroLabel}>CURRICULUM LEVELS</Text>
        </View>
        <View style={styles.journeyHeroDivider} />
        <View style={styles.journeyHeroStat}>
          <Feather name="check-circle" size={16} color="#F1D28A" />
          <Text style={styles.journeyHeroLabel}>KNOWLEDGE CHECKS</Text>
        </View>
        <View style={styles.journeyHeroDivider} />
        <View style={styles.journeyHeroStat}>
          <Feather name="award" size={16} color="#F1D28A" />
          <Text style={styles.journeyHeroLabel}>MILESTONE BADGE</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

function RewardArtwork({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <LinearGradient colors={['#102F28', '#0B6A58', '#0E856C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rewardArtwork}>
      <View style={styles.rewardHaloOuter} />
      <View style={styles.rewardHaloInner} />
      <View style={[styles.sectionIcon, styles.rewardArtworkIcon, { backgroundColor: `${colors.gold}1A`, borderColor: `${colors.gold}55` }]}>
        <Feather name="award" size={25} color="#F2CF79" />
      </View>
      <Text style={styles.rewardArtworkCaption}>A MARK OF LEARNING MILESTONES</Text>
      <View style={styles.rewardArtworkSpark}><Feather name="star" size={12} color="#F2CF79" /></View>
    </LinearGradient>
  );
}

function BeginHero() {
  return (
    <LinearGradient colors={['#092F28', '#0A6D5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.beginHero}>
      <View style={styles.beginHeroIcon}><Feather name="play" size={19} color="#F2CF79" /></View>
      <View style={styles.beginHeroCopy}>
        <Text style={styles.beginHeroEyebrow}>NEXT UP · LEVEL 01</Text>
        <Text style={styles.beginHeroTitle}>Trading Foundations</Text>
        <Text style={[styles.beginHeroDetail, { color: '#D2ECE2' }]}>Understand what a market is and how trades work.</Text>
      </View>
      <Feather name="arrow-down" size={15} color="#DFF5EC" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 20 },
  progressTrack: { width: 130, height: 4, overflow: 'hidden', borderRadius: 3 },
  progressFill: { height: '100%', borderRadius: 3 },
  counter: { minWidth: 42, textAlign: 'right', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20 },
  welcomeArtwork: { height: 225, justifyContent: 'space-between', marginBottom: 23, paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderColor: 'rgba(217,255,242,0.14)', borderRadius: 27, overflow: 'hidden' },
  artworkOrbLarge: { position: 'absolute', width: 240, height: 240, top: -104, right: -68, borderRadius: 120, borderWidth: 1, borderColor: 'rgba(217,255,242,0.15)', backgroundColor: 'rgba(217,255,242,0.06)' },
  artworkOrbSmall: { position: 'absolute', width: 135, height: 135, bottom: -84, left: -37, borderRadius: 68, borderWidth: 1, borderColor: 'rgba(217,255,242,0.17)', backgroundColor: 'rgba(217,255,242,0.08)' },
  artworkTopline: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  artworkBrandMark: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: 'rgba(230,255,246,0.14)' },
  artworkBrand: { flex: 1, color: '#D4F5E8', fontSize: 8, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  artworkLevelPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(243,211,138,0.3)', borderRadius: 10, backgroundColor: 'rgba(243,211,138,0.1)' },
  artworkLevelText: { color: '#F3D38A', fontSize: 7, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  chartFrame: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderWidth: 1, borderColor: 'rgba(230,255,246,0.17)', borderRadius: 15, backgroundColor: 'rgba(3,35,29,0.24)' },
  chartTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 },
  chartEyebrow: { color: '#B7DDCE', fontSize: 7, letterSpacing: 0.9, fontFamily: 'Inter_700Bold' },
  chartHeadline: { marginTop: 3, color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  chartPulse: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(243,211,138,0.15)' },
  artworkFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  artworkFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  artworkFooterText: { color: '#D4F5E8', fontSize: 6, letterSpacing: 0.35, fontFamily: 'Inter_700Bold' },
  artworkFooterDivider: { width: 1, height: 11, backgroundColor: 'rgba(230,255,246,0.2)' },
  eyebrow: { marginTop: 9, fontSize: 9, letterSpacing: 1.15, fontFamily: 'Inter_700Bold' },
  heading: { marginTop: 8, fontSize: 28, lineHeight: 35, letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  body: { marginTop: 10, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  trustNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18, padding: 13, borderWidth: 1, borderRadius: 15 },
  trustNoteText: { flex: 1, fontSize: 10, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  sectionIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderRadius: 17 },
  disclaimer: { marginTop: 13, fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  valueGrid: { flexDirection: 'row', gap: 8, marginTop: 17 },
  valueCard: { flex: 1, minHeight: 91, padding: 9, borderWidth: 1, borderRadius: 14 },
  valueIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderRadius: 8 },
  valueTitle: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  valueDetail: { marginTop: 3, fontSize: 8, lineHeight: 11, fontFamily: 'Inter_400Regular' },
  journeyHero: { minHeight: 148, justifyContent: 'space-between', marginBottom: 21, padding: 16, borderWidth: 1, borderColor: 'rgba(217,255,242,0.14)', borderRadius: 23, overflow: 'hidden' },
  journeyHeroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  journeyHeroEyebrow: { color: '#C2E8DB', fontSize: 8, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  journeyHeroTitle: { marginTop: 7, color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontFamily: 'Inter_700Bold' },
  journeyHeroIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(230,255,246,0.2)', borderRadius: 13, backgroundColor: 'rgba(230,255,246,0.1)' },
  journeyHeroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(230,255,246,0.15)' },
  journeyHeroStat: { flex: 1, alignItems: 'center', gap: 4 },
  journeyHeroNumber: { color: '#F1D28A', fontSize: 16, fontFamily: 'Inter_700Bold' },
  journeyHeroLabel: { color: '#D2ECE2', fontSize: 6, textAlign: 'center', letterSpacing: 0.3, fontFamily: 'Inter_700Bold' },
  journeyHeroDivider: { width: 1, height: 24, backgroundColor: 'rgba(230,255,246,0.2)' },
  stageList: { marginTop: 15 },
  stageRow: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch', gap: 11 },
  stageRail: { width: 31, alignItems: 'center' },
  stageNode: { zIndex: 1, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 15 },
  stageConnector: { position: 'absolute', top: 27, bottom: -3, width: 2 },
  stageCard: { flex: 1, justifyContent: 'center', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 14 },
  stageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stageIndex: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  stageTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  stageDetail: { marginTop: 3, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  rewardArtwork: { height: 142, alignItems: 'center', justifyContent: 'center', marginBottom: 21, borderWidth: 1, borderColor: 'rgba(217,255,242,0.14)', borderRadius: 23, overflow: 'hidden' },
  rewardHaloOuter: { position: 'absolute', width: 172, height: 172, borderWidth: 1, borderColor: 'rgba(242,207,121,0.14)', borderRadius: 90 },
  rewardHaloInner: { position: 'absolute', width: 126, height: 126, borderWidth: 1, borderColor: 'rgba(242,207,121,0.2)', borderRadius: 65 },
  rewardArtworkIcon: { width: 66, height: 66, marginBottom: 10, borderWidth: 1, borderRadius: 23 },
  rewardArtworkCaption: { color: '#E2F4EA', fontSize: 7, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  rewardArtworkSpark: { position: 'absolute', top: 27, right: '28%' },
  rewardCard: { minHeight: 119, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 20, paddingHorizontal: 13, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(222,255,241,0.17)', borderRadius: 20, overflow: 'hidden' },
  rewardShine: { position: 'absolute', top: -60, bottom: -60, width: 95, opacity: 0.75 },
  rewardBadge: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(242,207,121,0.38)', backgroundColor: 'rgba(242,207,121,0.14)' },
  rewardCopy: { flex: 1 },
  rewardEyebrow: { color: '#C1E3D7', fontSize: 7, letterSpacing: 0.9, fontFamily: 'Inter_700Bold' },
  rewardTitle: { marginTop: 5, color: '#FFFFFF', fontSize: 19, fontFamily: 'Inter_700Bold' },
  rewardRequirement: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  rewardSubtitle: { color: '#D1EAE1', fontSize: 8, fontFamily: 'Inter_500Medium' },
  lockedBadge: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(222,255,241,0.2)', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  credentialNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: 12, borderWidth: 1, borderRadius: 14 },
  credentialText: { flex: 1, fontSize: 9, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  beginHero: { minHeight: 111, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 20, padding: 14, borderWidth: 1, borderColor: 'rgba(217,255,242,0.14)', borderRadius: 20 },
  beginHeroIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(242,207,121,0.38)', borderRadius: 15, backgroundColor: 'rgba(242,207,121,0.14)' },
  beginHeroCopy: { flex: 1 },
  beginHeroEyebrow: { color: '#C1E3D7', fontSize: 7, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  beginHeroTitle: { marginTop: 4, color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  beginHeroDetail: { marginTop: 3, fontSize: 8, lineHeight: 12, fontFamily: 'Inter_400Regular' },
  levelPrompt: { marginTop: 21, marginBottom: 10, fontSize: 12, fontFamily: 'Inter_700Bold' },
  levelList: { gap: 9 },
  levelCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 15 },
  radioOuter: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 10 },
  radioInner: { width: 9, height: 9, borderRadius: 5 },
  levelCopy: { flex: 1 },
  levelTitle: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  levelDetail: { marginTop: 3, fontSize: 9, fontFamily: 'Inter_400Regular' },
  beginPromise: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderRadius: 13 },
  optionalNote: { flex: 1, fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  footer: { paddingHorizontal: 22, paddingTop: 12 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 9 },
  errorText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 17 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  footerTrustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  footerCaption: { marginTop: 8, textAlign: 'center', fontSize: 9, fontFamily: 'Inter_400Regular' },
});
