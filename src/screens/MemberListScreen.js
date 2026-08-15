import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function MemberListScreen({ navigation, route }) {
  const { isAdmin } = useAuth();
  const t = useTheme();
  const bccUnit = route.params?.bccUnit ?? null;   // set when drilled from BCC Wards
  const [query, setQuery] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback((q) => {
    setLoading(true);
    setLoadError(null);
    return api.getMembers({ query: q, bccUnit })
      .then(setList)
      .catch((e) => setLoadError(e.message ?? 'Failed to load members.'))
      .finally(() => setLoading(false));
  }, [bccUnit]);

  // Reset search query and reload whenever the BCC unit filter changes
  // (e.g. navigating from one unit's member list to another, or on first mount).
  useEffect(() => {
    setQuery('');
    load('');
  }, [bccUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on screen focus (e.g. returning from MemberProfile after an edit).
  // Uses a ref so the listener always reads the latest query without
  // re-registering the listener on every keystroke.
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => load(queryRef.current));
    return unsubscribe;
  }, [navigation, load]);

  const confirmDelete = (member) => {
    Alert.alert(
      'Remove member',
      `Remove ${member.first_name} ${member.last_name} from the active register? Their sacrament, donation and event history is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await api.deleteMember(member.id);
            load(query);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title={bccUnit ? bccUnit : 'Member List'} navigation={navigation} />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or member number"
          placeholderTextColor={colors.inkSoft}
          value={query}
          onChangeText={(text) => { setQuery(text); load(text); }}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshing={loading}
        onRefresh={() => load(query)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, item.status === 'inactive' && styles.rowInactive]}
            onPress={() => navigation.navigate('MemberProfile', { memberId: item.id })}
            onLongPress={() => isAdmin && confirmDelete(item)}
          >
            <View style={[styles.avatar, { backgroundColor: t.primaryLight }]}>
              <Text style={[styles.avatarText, { color: t.primary }]}>{item.first_name[0]}{item.last_name[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.sub}>
                {item.member_number} · {item.relationship_to_head}{item.status === 'inactive' ? ' · Inactive' : ''}
              </Text>
            </View>
            {isAdmin && (
              <TouchableOpacity hitSlop={10} onPress={() => confirmDelete(item)} style={styles.trash}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} />
          ) : loadError ? (
            <Text style={styles.empty}>{loadError}</Text>
          ) : (
            <Text style={styles.empty}>
              {query.trim() ? 'No members match your search.' : 'No members found.'}
            </Text>
          )
        }
      />
      {isAdmin && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => navigation.navigate('AddMember')}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, margin: 16, marginBottom: 0,
    borderRadius: radius.sm, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.divider,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 8, fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.divider,
  },
  rowInactive: { opacity: 0.55 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  name: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  trash: { padding: 6, marginRight: 4 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: fonts.body, color: colors.inkSoft },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
