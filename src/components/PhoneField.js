import React, { useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';

/**
 * PhoneField
 *
 * A labelled phone number input that:
 * - Auto-populates "+91" when the value is empty on mount.
 * - Shows a call-icon button that dials the number via Linking.
 *
 * Props:
 *   label        — string label (required)
 *   value        — controlled value (string)
 *   onChange     — (text) => void
 *   placeholder  — optional placeholder
 *   dialable     — if true AND a value exists, show the call icon (default true)
 */
export default function PhoneField({ label, value, onChange, placeholder = '+91XXXXXXXXXX', dialable = true }) {
  // Auto-populate country code when the field is first rendered empty.
  useEffect(() => {
    if (!value || value === '') {
      onChange('+91');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCall = () => {
    const cleaned = (value || '').replace(/\s/g, '');
    if (!cleaned) return;
    Linking.openURL(`tel:${cleaned}`).catch(() =>
      Alert.alert('Cannot make call', 'Your device does not support phone calls.')
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
          keyboardType="phone-pad"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {dialable && !!value && value !== '+91' && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleCall} hitSlop={8}>
            <Ionicons name="call-outline" size={18} color={colors.success} />
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
