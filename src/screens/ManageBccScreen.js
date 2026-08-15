import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useTheme } from '../context/ParishContext';

// ── Add Unit modal (used when adding the very first unit in a brand-new ward) ─
function AddUnitModal({ visible, onClose, onSaved, t }) {
  const [name, setName] = useState('');
  const [ward, setWard] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setName(''); setWard(''); setDescription(''); }
  }, [visible]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Unit name cannot be empty.'); return; }
    if (!ward.trim()) { Alert.alert('Required', 'Ward name cannot be empty.'); return; }
    setSaving(true);
    try {
      await api.createBccUnit({
        name: name.trim(),
        ward: ward.trim(),
        description: description.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add BCC Unit</Text>

          <Text style={styles.fieldLabel}>Ward name *</Text>
          <TextInput
            style={styles.input}
            value={ward}
            onChangeText={setWard}
            placeholder="e.g. Ward 1"
            placeholderTextColor={colors.inkSoft}
            autoFocus
          />

          <Text style={styles.fieldLabel}>Unit name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. St. Antony Unit"
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder="Area or notes"
            placeholderTextColor={colors.inkSoft}
            multiline
            numberOfLines={2}
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: t.primary }, (!name.trim() || !ward.trim() || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!name.trim() || !ward.trim() || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add unit'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Ward list (top level) ─────────────────────────────────────────────────────
export default function ManageBccScreen({ navigation }) {
  const t = useTheme();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getBccUnits().then(setUnits).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Group units by ward to build summary counts
  const wardMap = {};
  units.forEach((u) => {
    const w = u.ward || 'Ward 1';
    if (!wardMap[w]) wardMap[w] = [];
    wardMap[w].push(u);
  });
  const wards = Object.keys(wardMap).sort();

  return (
    <View style={styles.flex}>
      <ScreenHeader title="BCC Wards" navigation={navigation} />

      <FlatList
        data={wards}
        keyExtractor={(w) => w}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item: ward }) => {
          const count = wardMap[ward]?.length || 0;
          return (
            <TouchableOpacity
              style={styles.wardRow}
              onPress={() => navigation.navigate('BccUnits', { wardName: ward })}
            >
              <View style={[styles.wardIconWrap, { backgroundColor: t.primaryLight }]}>
                <Ionicons name="location-outline" size={20} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wardName}>{ward}</Text>
                <Text style={styles.wardSub}>{count} unit{count !== 1 ? 's' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="location-outline" size={40} color={colors.inkSoft} />
              <Text style={styles.empty}>No wards yet.</Text>
              <Text style={styles.emptyHint}>Tap + to add the first ward and unit.</Text>
            </View>
          ) : null
        }
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => setModalOpen(true)}>
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      <AddUnitModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  wardRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  wardIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  wardName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  wardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  empty: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: { backgroundColor: colors.stone, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.divider, marginBottom: 14 },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
});
