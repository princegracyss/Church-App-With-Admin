import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { fmtDate } from '../utils/date';

export default function SacramentsScreen({ navigation }) {
  const t = useTheme();
  const [list, setList] = useState([]);
  useEffect(() => {
    api.getMyProfile().then((me) => { if (me) api.getSacraments(me.id).then(setList); });
  }, []);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Sacraments" navigation={navigation} />
      <FlatList
        data={list}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={[styles.type, { color: t.primary }]}>{item.type}</Text>
            <Text style={styles.line}>{item.church_name}</Text>
            <Text style={styles.line}>{fmtDate(item.date)} · {item.minister_name}</Text>
            <Text style={styles.cert}>Certificate No: {item.certificate_number}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No sacrament records yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  type: { fontFamily: fonts.displaySemi, fontSize: 15 },
  line: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, marginTop: 4 },
  cert: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.inkSoft, marginTop: 6 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: fonts.body, color: colors.inkSoft },
});
