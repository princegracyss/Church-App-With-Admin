import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { fmtDate } from '../utils/date';

export default function DonationsScreen({ navigation }) {
  const t = useTheme();
  const [list, setList] = useState([]);
  useEffect(() => {
    api.getMyProfile().then((me) => { if (me) api.getDonations(me.id).then(setList); });
  }, []);
  const total = list.reduce((sum, d) => sum + d.amount, 0);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Donations" navigation={navigation} />
      <View style={[styles.totalCard, { backgroundColor: t.primary }]}>
        <Text style={[styles.totalLabel, { color: t.secondary }]}>Total contributed</Text>
        <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.purpose}>{item.purpose}</Text>
              <Text style={styles.meta}>{fmtDate(item.paid_on)} · {item.payment_mode}</Text>
            </View>
            <Text style={[styles.amount, { color: t.primary }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  totalCard: { margin: 16, marginBottom: 4, borderRadius: radius.md, padding: 18 },
  totalLabel: { fontFamily: fonts.body, fontSize: 12 },
  totalValue: { fontFamily: fonts.display, fontSize: 24, color: colors.white, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  purpose: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  amount: { fontFamily: fonts.displaySemi, fontSize: 15 },
});
