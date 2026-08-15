import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import { useAuth } from '../context/AuthContext';

export default function ScreenHeader({ title, navigation, right }) {
  const theme = useTheme();
  const { logout } = useAuth();
  const primary = theme.primary;

  const confirmLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: primary }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.white} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.rightRow}>
        {right && <View style={styles.rightExtra}>{right}</View>}
        <TouchableOpacity onPress={confirmLogout} hitSlop={12} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={theme.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 14, paddingBottom: 16, paddingHorizontal: 12,
  },
  back: { padding: 4 },
  title: { flex: 1, fontFamily: fonts.displaySemi, fontSize: 17, color: colors.white, marginLeft: 6 },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rightExtra: { alignItems: 'flex-end' },
  logoutBtn: { padding: 4 },
});
