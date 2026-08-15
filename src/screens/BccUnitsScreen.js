import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useTheme } from '../context/ParishContext';

// ── Add / Edit unit modal ─────────────────────────────────────────────────────
function EditUnitModal({ visible, unit, wardName, onClose, onSaved, t }) {
  const isNew = !unit?.id;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(unit?.name || '');
      setDescription(unit?.description || '');
    }
  }, [visible, unit]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Unit name cannot be empty.'); return; }
    setSaving(true);
    try {
      const dto = { name: name.trim(), ward: wardName, description: description.trim() || null };
      if (isNew) await api.createBccUnit(dto);
      else await api.updateBccUnit(unit.id, dto);
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
          <Text style={styles.modalTitle}>{isNew ? 'Add Unit' : 'Edit Unit'}</Text>
          <Text style={styles.modalSubtitle}>{wardName}</Text>

          <Text style={styles.fieldLabel}>Unit name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. St. Antony Unit"
            placeholderTextColor={colors.inkSoft}
            autoFocus
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
            style={[styles.saveBtn, { backgroundColor: t.primary }, (!name.trim() || saving) && { opacity: 0.5 }]}
            onPress={save}
            disabled={!name.trim() || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : isNew ? 'Add unit' : 'Save changes'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Units for a single ward ───────────────────────────────────────────────────
export default function BccUnitsScreen({ route, navigation }) {
  const t = useTheme();
  const { wardName } = route.params;
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getBccUnitsByWard(wardName).then(setUnits).finally(() => setLoading(false));
  }, [wardName]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const confirmDelete = (unit) => {
    Alert.alert(
      'Remove unit',
      `Remove "${unit.name}"? Existing family records are not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try { await api.deleteBccUnit(unit.id); load(); }
            catch (e) { Alert.alert('Could not remove', e.message); }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title={wardName} navigation={navigation} />

      <FlatList
        data={units}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item: unit }) => (
          <TouchableOpacity
            style={styles.unitRow}
            onPress={() => navigation.navigate('BccFamilies', { bccName: unit.name, wardName })}
          >
            <View style={[styles.unitIconWrap, { backgroundColor: t.primaryLight }]}>
              <Ionicons name="people-circle-outline" size={20} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.unitName}>{unit.name}</Text>
              {!!unit.description && <Text style={styles.unitSub}>{unit.description}</Text>}
            </View>
            <TouchableOpacity
              hitSlop={10}
              style={styles.iconBtn}
              onPress={() => { setEditTarget(unit); setModalOpen(true); }}
            >
              <Ionicons name="create-outline" size={17} color={t.primary} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={10} style={styles.iconBtn} onPress={() => confirmDelete(unit)}>
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={15} color={colors.inkSoft} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-circle-outline" size={40} color={colors.inkSoft} />
              <Text style={styles.empty}>No units in {wardName} yet.</Text>
              <Text style={styles.emptyHint}>Tap + to add the first unit.</Text>
            </View>
          ) : null
        }
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => { setEditTarget({}); setModalOpen(true); }}>
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      <EditUnitModal
        visible={modalOpen}
        unit={editTarget}
        wardName={wardName}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  unitRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: radius.md, padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: colors.divider,
  },
  unitIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  unitName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  unitSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  iconBtn: { padding: 5, marginLeft: 4 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  empty: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: { backgroundColor: colors.stone, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.divider, marginBottom: 14 },
  inputMulti: { minHeight: 56, textAlignVertical: 'top' },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
});
