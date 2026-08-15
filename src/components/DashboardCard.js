import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';

export default function DashboardCard({ label, icon, badge, onPress }) {
  const theme = useTheme();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={[styles.iconRing, { backgroundColor: theme.accentLight }]}>
        <Ionicons name={icon} size={24} color={theme.accent} />
      </View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '31%',
    aspectRatio: 0.92,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  iconRing: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 12.5,
    color: colors.ink,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 10,
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
  },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.ink },
});
