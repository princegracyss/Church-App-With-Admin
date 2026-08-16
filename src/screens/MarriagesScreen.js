import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import DatePicker from '../components/DatePicker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils/date';

// ── Add Marriage Modal ────────────────────────────────────────────────────────
function AddMarriageModal({ visible, onClose, onSaved, t }) {
  const [husbandSearch, setHusbandSearch] = useState('');
  const [wifeSearch,    setWifeSearch]    = useState('');
  const [husbandPick,   setHusbandPick]   = useState(null);
  const [wifePick,      setWifePick]      = useState(null);
  const [results,       setResults]       = useState([]);
  const [searchFor,     setSearchFor]     = useState(null); // 'husband' | 'wife'
  const [marriageDate,  setMarriageDate]  = useState('');
  const [church,        setChurch]        = useState('');
  const [certNumber,    setCertNumber]    = useState('');
  const [saving,        setSaving]        = useState(false);

  const reset = () => {
    setHusbandSearch(''); setWifeSearch('');
    setHusbandPick(null); setWifePick(null);
    setResults([]); setSearchFor(null);
    setMarriageDate(''); setChurch(''); setCertNumber('');
  };

  const handleClose = () => { reset(); onClose(); };

  const search = async (query, forField) => {
    setSearchFor(forField);
    if (!query.trim()) { setResults([]); return; }
    try {
      const list = await api.getMembers({ query: query.trim() });
      setResults(list.slice(0, 20));
    } catch (_) { setResults([]); }
  };

  const pickMember = (member) => {
    if (searchFor === 'husband') setHusbandPick(member);
    else setWifePick(member);
    setResults([]);
  };

  const save = async () => {
    if (!husbandPick || !wifePick) {
      Alert.alert('Required', 'Please select both husband and wife.'); return;
    }
    if (!marriageDate) {
      Alert.alert('Required', 'Please enter the marriage date.'); return;
    }
    setSaving(true);
    try {
      await api.createMarriage({
        husbandMemberId: husbandPick.id,
        wifeMemberId:    wifePick.id,
        marriageDate,
        church:       church.trim() || null,
        certNumber:   certNumber.trim() || null,
      });
      reset();
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ms.backdrop}>
        <View style={ms.sheet}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Record Marriage</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Husband */}
            <Text style={ms.label}>Husband *</Text>
            {husbandPick ? (
              <TouchableOpacity style={ms.pickedRow} onPress={() => setHusbandPick(null)}>
                <Ionicons name="person" size={15} color={t.primary} />
                <Text style={ms.pickedName}>{husbandPick.first_name} {husbandPick.last_name}</Text>
                <Text style={ms.pickedNum}>{husbandPick.member_number}</Text>
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
            ) : (
              <TextInput
                style={ms.input}
                placeholder="Search husband by name or member ID…"
                placeholderTextColor={colors.inkSoft}
                value={husbandSearch}
                onChangeText={(v) => { setHusbandSearch(v); search(v, 'husband'); }}
              />
            )}

            {/* Wife */}
            <Text style={[ms.label, { marginTop: 12 }]}>Wife *</Text>
            {wifePick ? (
              <TouchableOpacity style={ms.pickedRow} onPress={() => setWifePick(null)}>
                <Ionicons name="person" size={15} color={t.primary} />
                <Text style={ms.pickedName}>{wifePick.first_name} {wifePick.last_name}</Text>
                <Text style={ms.pickedNum}>{wifePick.member_number}</Text>
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
            ) : (
              <TextInput
                style={ms.input}
                placeholder="Search wife by name or member ID…"
                placeholderTextColor={colors.inkSoft}
                value={wifeSearch}
                onChangeText={(v) => { setWifeSearch(v); search(v, 'wife'); }}
              />
            )}

            {/* Inline member search results */}
            {results.length > 0 && (
              <View style={ms.resultsList}>
                {results.map((m) => (
                  <TouchableOpacity key={m.id} style={ms.resultRow} onPress={() => pickMember(m)}>
                    <Text style={ms.resultName}>{m.first_name} {m.last_name}</Text>
                    <Text style={ms.resultNum}>{m.member_number}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[ms.label, { marginTop: 12 }]}>Marriage Date *</Text>
            <DatePicker value={marriageDate} onChange={setMarriageDate} placeholder="Select date" />

            <Text style={[ms.label, { marginTop: 12 }]}>Church</Text>
            <TextInput
              style={ms.input} placeholder="Church name"
              placeholderTextColor={colors.inkSoft}
              value={church} onChangeText={setChurch}
            />

            <Text style={[ms.label, { marginTop: 12 }]}>Certificate Number</Text>
            <TextInput
              style={ms.input} placeholder="Optional"
              placeholderTextColor={colors.inkSoft}
              value={certNumber} onChangeText={setCertNumber}
            />

            <TouchableOpacity
              style={[ms.saveBtn, { backgroundColor: t.primary }, saving && ms.saveBtnDisabled]}
              onPress={save} disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={ms.saveBtnText}>Save marriage record</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MarriagesScreen({ navigation }) {
  const t = useTheme();
  const { isAdmin } = useAuth();

  const [list,     setList]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [addOpen,  setAddOpen]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getMarriages()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const confirmDelete = (item) => {
    const label = `${item.husband?.first_name ?? '?'} & ${item.wife?.first_name ?? '?'}`;
    Alert.alert('Delete marriage record', `Remove marriage record for ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMarriage(item.id);
            load();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Marriages" navigation={navigation} />
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: t.primaryLight }]}>
              <Ionicons name="heart" size={18} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.names}>
                {item.husband ? `${item.husband.first_name} ${item.husband.last_name}` : '—'}
                {'  ×  '}
                {item.wife ? `${item.wife.first_name} ${item.wife.last_name}` : '—'}
              </Text>
              <Text style={styles.sub}>
                {fmtDate(item.marriage_date)}
                {item.church ? ` · ${item.church}` : ''}
              </Text>
              {!!item.certificate_number && (
                <Text style={styles.cert}>Cert# {item.certificate_number}</Text>
              )}
            </View>
            {isAdmin && (
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="heart-outline" size={40} color={colors.inkSoft} />
              <Text style={styles.empty}>No marriage records yet.</Text>
            </View>
          ) : null
        }
      />

      {isAdmin && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: t.primary }]}
          onPress={() => setAddOpen(true)}
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </TouchableOpacity>
      )}

      <AddMarriageModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.white,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider,
    padding: 13, marginBottom: 10, gap: 12,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  names: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  sub:   { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  cert:  { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  empty:     { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
});

// ── Add Marriage Modal styles ─────────────────────────────────────────────────
const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle:  { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  label:       { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: {
    backgroundColor: colors.stone, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.divider, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink, marginBottom: 4,
  },
  pickedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.stone, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.divider, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4,
  },
  pickedName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.ink },
  pickedNum:  { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  resultsList: {
    backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.divider, marginBottom: 4, maxHeight: 180,
  },
  resultRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  resultName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  resultNum:  { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  saveBtn: {
    borderRadius: radius.sm, paddingVertical: 13, alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white },
});
