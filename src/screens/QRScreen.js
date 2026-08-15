import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useParish, useTheme } from '../context/ParishContext';

export default function QRScreen({ navigation }) {
  const { settings } = useParish();
  const t = useTheme();
  const [member, setMember] = useState(null);
  useEffect(() => { api.getMyProfile().then(setMember); }, []);
  if (!member) return <View style={styles.flex} />;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="My QR Card" navigation={navigation} />
      <View style={styles.cardWrap}>
        <View style={styles.card}>
          <Text style={[styles.parish, { color: t.primary }]}>{settings.name}</Text>
          <View style={styles.qrBox}>
            <QRCode value={`MEMBER:${member.member_number}`} size={170} color={colors.ink} backgroundColor={colors.white} />
          </View>
          <Text style={styles.name}>{member.first_name} {member.last_name}</Text>
          <Text style={styles.number}>{member.member_number}</Text>
        </View>
        <Text style={styles.hint}>Show this at parish events and offices for quick check-in and verification.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  cardWrap: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 20 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.divider, width: '100%' },
  parish: { fontFamily: fonts.bodyMedium, fontSize: 12, marginBottom: 16 },
  qrBox: { padding: 14, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm },
  name: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.ink, marginTop: 16 },
  number: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: 18, lineHeight: 17 },
});
