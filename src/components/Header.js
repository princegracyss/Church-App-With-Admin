import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import { useParish } from '../context/ParishContext';
import { useAuth } from '../context/AuthContext';

// onMenuPress → My Profile  |  onSettingsPress → Parish Settings (admin only)
export default function Header({ name, photo, onMenuPress, onSettingsPress }) {
  const theme = useTheme();
  const { settings } = useParish();
  const { logout } = useAuth();

  const confirmLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <LinearGradient colors={[theme.primary, theme.primaryDark]} style={styles.wrap}>
      <TouchableOpacity onPress={onMenuPress} hitSlop={12} style={styles.avatarRing}>
        {photo ? (
          <Image key={photo} source={{ uri: photo }} style={styles.avatar} />
        ) : settings.logoUri ? (
          // key=logoUri forces React Native to reload the image whenever the
          // URL changes (including the ?t= cache-buster after a new upload).
          <Image key={settings.logoUri} source={{ uri: settings.logoUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={22} color={theme.primary} />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.textWrap}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={[styles.parish, { color: theme.secondary }]} numberOfLines={1}>{settings.name}</Text>
        {!!settings.description && (
          <Text style={[styles.subParish, { color: theme.secondary }]} numberOfLines={1}>{settings.description}</Text>
        )}
      </View>
      <View style={styles.actions}>
        {onSettingsPress && (
          <TouchableOpacity onPress={onSettingsPress} hitSlop={12} style={styles.actionBtn}>
            <Ionicons name="settings-outline" size={20} color={theme.secondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={confirmLogout} hitSlop={12} style={styles.actionBtn}>
          <Ionicons name="log-out-outline" size={22} color={theme.secondary} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: 2,
    overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%', borderRadius: 23 },
  avatarFallback: { backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, marginLeft: 14 },
  name: { fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' },
  parish: { fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  subParish: { fontFamily: fonts.body, fontSize: 11, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 4 },
});
