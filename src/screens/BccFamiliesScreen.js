import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';

// Lists all families that belong to the selected BCC unit.
// Tapping a family opens FamilyScreen (which already shows the member list;
// tapping a member there opens MemberProfileScreen).
export default function BccFamiliesScreen({ route, navigation }) {
  const t = useTheme();
  const { bccName, wardName } = route.params;
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getFamiliesByBcc(bccName).then(setList).finally(() => setLoading(false));
  }, [bccName]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const totalMembers = list.reduce((sum, f) => sum + (f.memberCount || 0), 0);

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={bccName}
        navigation={navigation}
        right={wardName ? <Text style={{ fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.75)', marginRight: 4 }}>{wardName}</Text> : null}
      />

      {/* Summary strip */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: t.primary }]}>{list.length}</Text>
            <Text style={styles.summaryLabel}>Families</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: t.primary }]}>{totalMembers}</Text>
            <Text style={styles.summaryLabel}>Members</Text>
          </View>
      </View>

      <FlatList
        data={list}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Family', { familyId: item.id })}
          >
            <View style={[styles.iconWrap, { backgroundColor: t.primaryLight }]}>
              <Ionicons name="home-outline" size={18} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.house_name}</Text>
              <Text style={styles.sub}>
                {item.family_code}
                {item.place ? ` · ${item.place}` : ''}
                {` · ${item.memberCount} member${item.memberCount === 1 ? '' : 's'}`}
              </Text>
              {item.needsHead && (
                <View style={styles.alertBadge}>
                  <Ionicons name="alert-circle" size={11} color={colors.danger} />
                  <Text style={styles.alertText}>Needs head of family</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="home-outline" size={38} color={colors.inkSoft} />
              <Text style={styles.empty}>No families in this BCC unit yet.</Text>
              <Text style={styles.emptyHint}>
                Assign families to "{bccName}" when adding or editing a family.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  summary: {
    flexDirection: 'row', backgroundColor: colors.white,
    marginHorizontal: 16, marginTop: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.divider, overflow: 'hidden',
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryNum: { fontFamily: fonts.display, fontSize: 22 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.divider },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  alertBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 5,
  },
  alertText: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: colors.danger },
  emptyWrap: { alignItems: 'center', paddingTop: 50, gap: 8 },
  empty: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },
});
