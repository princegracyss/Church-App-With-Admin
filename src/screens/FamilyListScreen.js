import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Staff-only. Mirrors MemberListScreen's list + FAB pattern. Families with
// no head member yet (e.g. the "Add Family" flow was interrupted before the
// head-of-family step finished) are flagged rather than hidden, so nothing
// created here is ever silently lost — see AddFamilyScreen/AddMemberScreen.
export default function FamilyListScreen({ navigation }) {
  const t = useTheme();
  const { isAdmin } = useAuth();
  const [list, setList] = useState([]);

  const load = useCallback(() => api.getFamiliesWithStatus().then(setList), []);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const confirmDeleteEmpty = (family) => {
    Alert.alert(
      'Delete family',
      `${family.house_name} has no members yet. Delete this family record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await api.deleteFamily(family.id);
            load();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Families" navigation={navigation} />
      <FlatList
        data={list}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Family', { familyId: item.id })}
            onLongPress={() => isAdmin && item.memberCount === 0 && confirmDeleteEmpty(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.house_name}</Text>
              <Text style={styles.sub}>
                {item.family_code} · {item.place || '—'} · {item.memberCount} member{item.memberCount === 1 ? '' : 's'}
              </Text>
              {item.needsHead && (
                <View style={[styles.needsHeadBadge, { backgroundColor: t.primaryLight }]}>
                  <Ionicons name="alert-circle" size={12} color={colors.danger} />
                  <Text style={styles.needsHeadText}>Needs head of family</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No families yet.</Text>}
      />
      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => navigation.navigate('AddFamily')}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider,
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  needsHeadBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  needsHeadText: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: colors.danger },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: fonts.body, color: colors.inkSoft },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
