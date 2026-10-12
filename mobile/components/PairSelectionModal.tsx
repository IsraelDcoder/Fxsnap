import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedTouchableOpacity as TouchableOpacity } from '@/components/AnimatedTouchableOpacity';
import { Feather } from '@expo/vector-icons';
import {
  INSTRUMENTS,
  INSTRUMENT_GROUPS,
  type InstrumentCategory,
} from '@/services/instruments';
import { useColors } from '@/hooks/useColors';

interface PairSelectionModalProps {
  visible: boolean;
  onSelectPair: (pair: string) => void;
  onCancel: () => void;
}

export function PairSelectionModal({ visible, onSelectPair, onCancel }: PairSelectionModalProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState<InstrumentCategory | null>('popular');
  const [selectedPair, setSelectedPair] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelectedPair(null);
  }, [visible]);

  const handleSelect = (pair: string) => {
    setSelectedPair(pair);
    onSelectPair(pair);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0, 0, 0, 0.6)' }]}>
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Select Asset</Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surface }]} onPress={onCancel}>
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Focused instruments. Clearer signals. Less noise.</Text>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {INSTRUMENT_GROUPS.map((group) => {
              const instruments = INSTRUMENTS.filter((instrument) => instrument.category === group.key);
              return (
              <View key={group.key} style={styles.category}>
                <TouchableOpacity
                  style={[styles.categoryHeader, { backgroundColor: colors.surface }]}
                  onPress={() =>
                    setExpanded(expanded === group.key ? null : group.key)
                  }
                >
                  <View style={styles.categoryTitleRow}>
                      <View style={[styles.categoryIcon, { backgroundColor: colors.surface }]}>
                      <Feather name={group.icon as any} size={14} color={colors.accent} />
                    </View>
                    <View>
                      <Text style={[styles.categoryTitle, { color: colors.text }]}>{group.title}</Text>
                      <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>{group.description}</Text>
                    </View>
                  </View>
                  <Feather
                    name={expanded === group.key ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {expanded === group.key && (
                  <View style={styles.pairsList}>
                    {instruments.map((instrument) => (
                      <TouchableOpacity
                        key={instrument.id}
                        style={[
                          styles.pairItem,
                          { backgroundColor: colors.surface },
                          selectedPair === instrument.id && {
                            backgroundColor: colors.segmentBackground,
                            borderLeftColor: colors.accent,
                          },
                        ]}
                        onPress={() => handleSelect(instrument.id)}
                      >
                        <View style={styles.pairInfo}>
                          <Text style={[styles.pairText, { color: colors.text }]}>{instrument.id}</Text>
                          <Text style={[styles.pairLabel, { color: colors.textSecondary }]}>{instrument.label}</Text>
                        </View>
                        {instrument.tier === 'core' && (
                          <View style={[styles.coreBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={[styles.coreBadgeText, { color: colors.gold }]}>CORE</Text>
                          </View>
                        )}
                        {selectedPair === instrument.id ? (
                          <Feather name="check" size={16} color={colors.accent} />
                        ) : (
                          <View style={styles.emptyCheckPlaceholder} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={[styles.footerHint, { color: colors.textSecondary }]}>⭐ Start with Popular for the most focused coverage</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  subtitle: {
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  content: {
    paddingHorizontal: 20,
  },
  category: {
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  categoryDescription: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  pairsList: {
    marginTop: 8,
    paddingHorizontal: 8,
  },
  pairItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  pairInfo: {
    flex: 1,
    gap: 2,
  },
  pairText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  pairLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  coreBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    marginRight: 8,
  },
  coreBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  emptyCheckPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  footerHint: {
    fontSize: 12,
    textAlign: 'center',
  },
});
