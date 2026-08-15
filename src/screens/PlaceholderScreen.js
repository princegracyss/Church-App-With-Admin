import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';

export default function PlaceholderScreen({ route, navigation }) {
  const t = useTheme();
  const { title, icon = 'construct', note } = route.params || {};
  return (
    <View style={styles.flex}>
      <ScreenHeader title={title} navigation={navigation} />
      <View style={styles.center}>
        <View style={[styles.iconWrap, { backgroundColor: t.primaryLight }]}><Ionicons name={icon} size={30} color={t.primary} /></View>
        <Text style={styles.text}>
          {note || `${title} follows the same pattern as the other modules — wire it to the matching REST endpoint in src/services/api.js when the backend is ready.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  text: { fontFamily: fonts.body, fontSize: 13.5, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
});
