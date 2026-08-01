import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surface }] } onPress={onCancel}>
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
                  style={styles.categoryHeader}
                  onPress={() =>
                    setExpanded(expanded === group.key ? null : group.key)
                  }
                >
                  <View style={styles.categoryTitleRow}>
                      <View style={[styles.categoryIcon, { backgroundColor: colors.surface }]}>
                      <Feather name={group.icon as any} size={14} color="#00E676" />
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
                        style={[styles.pairItem, selectedPair === instrument.id && styles.pairItemSelected]}
                        onPress={() => handleSelect(instrument.id)}
                      >
                        <View style={styles.pairInfo}>
                          <Text style={styles.pairText}>{instrument.id}</Text>
                          <Text style={styles.pairLabel}>{instrument.label}</Text>
                        </View>
                        {instrument.tier === 'core' && (
                          <View style={styles.coreBadge}>
                            <Text style={styles.coreBadgeText}>CORE</Text>
                          </View>
                        )}
                        {selectedPair === instrument.id ? (
                          <Feather name="check" size={16} color="#00E676" />
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

          <View style={styles.footer}>
            <Text style={styles.footerHint}>⭐ Start with Popular for the most focused coverage</Text>
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
    backgroundColor: '#1A1A1A',
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
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
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
    backgroundColor: '#0D0D0D',
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
    backgroundColor: '#0D1A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  categoryDescription: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
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
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  pairItemSelected: {
    backgroundColor: '#0D1A12',
    borderLeftColor: '#00E676',
  },
  pairInfo: {
    flex: 1,
    gap: 2,
  },
  pairText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  pairLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#8E8E93',
  },
  coreBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#1A1800',
    borderWidth: 1,
    borderColor: '#3D3400',
    marginRight: 8,
  },
  coreBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#FFD60A',
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
    borderTopColor: '#2A2A2A',
  },
  footerHint: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});
