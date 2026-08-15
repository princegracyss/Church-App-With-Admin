import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';

/**
 * EmailField
 *
 * A labelled email input that shows a mail-icon button to open the
 * device mail client via Linking when a value is present.
 *
 * Props:
 *   label      — string label (required)
 *   value      — controlled value (string)
 *   onChange   — (text) => void
 *   placeholder — optional placeholder
 *   mailable   — if true AND a value exists, show the mail icon (default true)
 */
export default function EmailField({ label, value, onChange, placeholder = 'email@example.com', mailable = true }) {
  const t = useTheme();
  const handleMail = () => {
    const addr = (value || '').trim();
    if (!addr) return;
    Linking.openURL(`mailto:${addr}`).catch(() =>
      Alert.alert('Cannot open mail', 'No mail app is configured on this device.')
    );
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSoft}
          keyboardType="email-address"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {mailable && !!value && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleMail} hitSlop={8}>
            <Ionicons name="mail-outline" size={18} color={t.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
  },
});
