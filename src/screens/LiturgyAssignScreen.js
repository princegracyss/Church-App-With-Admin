/**
 * LiturgyAssignScreen
 *
 * Allows a Parish Priest (or admin) to assign a BCC unit OR an Organization
 * to host the liturgy on a specific date. On save:
 *   1. A `liturgy_assignments` row is created.
 *   2. A LITURGY notification is broadcast to ALL members.
 *
 * Accessible from: DashboardScreen → Assign Liturgy tile (staff view)
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Modal, SectionList, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import DatePicker from '../components/DatePicker';
import api from '../services/api';
import { useTheme } from '../context/ParishContext';

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Assignment mode toggle ────────────────────────────────────────────────────
// 'bcc' = assign to a BCC unit; 'org' = assign to an Organization
const MODES = [
  { key: 'bcc', label: 'BCC Unit',    icon: 'people-circle-outline' },
  { key: 'org', label: 'Organization', icon: 'flag-outline' },
];

// ── BCC Unit picker (sheet modal) ─────────────────────────────────────────────
function UnitPickerModal({ visible, onClose, onSelect }) {
  const t = useTheme();
  const [units, setUnits] = useState([]);

  useEffect(() => {
    if (visible) api.getBccUnits().then(setUnits).catch(() => {});
  }, [visible]);

  const wardMap = {};
  units.forEach((u) => {
    const w = u.ward || 'Ward 1';
    if (!wardMap[w]) wardMap[w] = [];
    wardMap[w].push(u);
  });
  const sections = Object.keys(wardMap).sort().map((w) => ({ title: w, data: wardMap[w] }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select BCC Unit</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>
          {sections.length === 0 ? (
            <Text style={styles.emptyPicker}>No BCC units added yet.</Text>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(u) => u.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Ionicons name="location-outline" size={12} color={t.primary} />
                  <Text style={[styles.sectionTitle, { color: t.primary }]}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.unitOption}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <View style={[styles.unitIconWrap, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name="people-circle-outline" size={18} color={t.primary} />
                  </View>
                  <Text style={styles.unitOptionText}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.inkSoft} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Organization picker (sheet modal) ─────────────────────────────────────────
function OrgPickerModal({ visible, onClose, onSelect }) {
  const t = useTheme();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    if (visible) api.getOrganizations().then(setOrgs).catch(() => {});
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Organization</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>
          {orgs.length === 0 ? (
            <Text style={styles.emptyPicker}>No organizations added yet.</Text>
          ) : (
            <FlatList
              data={orgs}
              keyExtractor={(o) => o.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.unitOption}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <View style={[styles.unitIconWrap, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name={item.icon || 'flag'} size={18} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitOptionText}>{item.name}</Text>
                    {!!item.description && (
                      <Text style={styles.unitOptionSub} numberOfLines={1}>{item.description}</Text>
                    )}
                  </View>
                  <Text style={styles.unitOptionCount}>{item.member_count}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.inkSoft} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LiturgyAssignScreen({ navigation }) {
  const [mode, setMode]             = useState('bcc');  // 'bcc' | 'org'
  const [bccPickerOpen, setBccPickerOpen] = useState(false);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [selectedUnit, setSelectedUnit]   = useState(null); // { id, name, ward }
  const [selectedOrg,  setSelectedOrg]    = useState(null); // { id, name, icon }
  const [dateStr, setDateStr]         = useState(todayStr());
  const [notes,   setNotes]           = useState('');
  const [saving,  setSaving]          = useState(false);
  const t = useTheme();

  // Clear the other selection when mode changes.
  const switchMode = (m) => {
    setMode(m);
    if (m === 'bcc') setSelectedOrg(null);
    else             setSelectedUnit(null);
  };

  const hostName = mode === 'bcc' ? selectedUnit?.name : selectedOrg?.name;
  const canSave  = !!hostName && !!dateStr;

  const save = async () => {
    if (!hostName) {
      Alert.alert('Missing', mode === 'bcc' ? 'Please select a BCC unit.' : 'Please select an organization.');
      return;
    }
    if (!dateStr) { Alert.alert('Missing', 'Please select a date.'); return; }

    setSaving(true);
    try {
      await api.createLiturgyAssignment({
        bccUnitId:   mode === 'bcc' ? selectedUnit?.id   : null,
        bccUnitName: mode === 'bcc' ? selectedUnit?.name : null,
        orgId:       mode === 'org' ? selectedOrg?.id    : null,
        orgName:     mode === 'org' ? selectedOrg?.name  : null,
        liturgyDate: dateStr,
        notes:       notes.trim() || null,
      });
      Alert.alert(
        'Liturgy assigned ✓',
        `${hostName} is assigned for ${formatDisplayDate(dateStr)}. All members have been notified.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Assign Liturgy" navigation={navigation} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={t.primary} />
          <Text style={styles.infoText}>
            Assign a BCC unit or Organization to host the liturgy on a specific date.
            All parish members will receive a notification immediately, and a reminder on the day.
          </Text>
        </View>

        {/* Mode toggle: BCC / Org */}
        <View style={styles.toggleRow}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.toggleBtn, mode === m.key && { backgroundColor: t.primary, borderColor: t.primary }]}
              onPress={() => switchMode(m.key)}
            >
              <Ionicons name={m.icon} size={15} color={mode === m.key ? colors.white : colors.inkSoft} />
              <Text style={[styles.toggleBtnText, mode === m.key && { color: '#fff' }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── BCC Unit picker ── */}
        {mode === 'bcc' && (
          <>
            <Text style={styles.label}>BCC Unit *</Text>
            <TouchableOpacity style={styles.selector} onPress={() => setBccPickerOpen(true)}>
              {selectedUnit ? (
                <View style={styles.selectedUnit}>
                  <View style={[styles.selectedUnitIcon, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name="people-circle-outline" size={18} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedUnitName}>{selectedUnit.name}</Text>
                    <Text style={styles.selectedUnitWard}>{selectedUnit.ward}</Text>
                  </View>
                  <Ionicons name="swap-horizontal" size={16} color={colors.inkSoft} />
                </View>
              ) : (
                <View style={styles.selectorPlaceholder}>
                  <Ionicons name="people-circle-outline" size={18} color={colors.inkSoft} />
                  <Text style={styles.selectorPlaceholderText}>Select BCC unit</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* ── Organization picker ── */}
        {mode === 'org' && (
          <>
            <Text style={styles.label}>Organization *</Text>
            <TouchableOpacity style={styles.selector} onPress={() => setOrgPickerOpen(true)}>
              {selectedOrg ? (
                <View style={styles.selectedUnit}>
                  <View style={[styles.selectedUnitIcon, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name={selectedOrg.icon || 'flag'} size={18} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedUnitName}>{selectedOrg.name}</Text>
                  </View>
                  <Ionicons name="swap-horizontal" size={16} color={colors.inkSoft} />
                </View>
              ) : (
                <View style={styles.selectorPlaceholder}>
                  <Ionicons name="flag-outline" size={18} color={colors.inkSoft} />
                  <Text style={styles.selectorPlaceholderText}>Select organization</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Date field */}
        <DatePicker
          label="Liturgy Date"
          value={dateStr}
          onChange={setDateStr}
          minDate={todayStr()}
          required
        />

        {/* Notes */}
        <Text style={[styles.label, { marginTop: 16 }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Theme, special instructions, venue details…"
          placeholderTextColor={colors.inkSoft}
          multiline
          numberOfLines={3}
          maxLength={400}
        />

        {/* Summary preview */}
        {!!hostName && !!dateStr && (
          <View style={styles.previewCard}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.previewText}>
              <Text style={{ fontFamily: fonts.bodySemi }}>{hostName}</Text>
              {' will host the liturgy on '}
              <Text style={{ fontFamily: fonts.bodySemi }}>{formatDisplayDate(dateStr)}</Text>
              {notes.trim() ? `\n${notes.trim()}` : ''}
            </Text>
          </View>
        )}

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: t.primary }, !canSave && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || !canSave}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={colors.white} />
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving & notifying…' : 'Assign & Notify All Members'}
          </Text>
        </TouchableOpacity>

      </ScrollView>

      <UnitPickerModal
        visible={bccPickerOpen}
        onClose={() => setBccPickerOpen(false)}
        onSelect={setSelectedUnit}
      />
      <OrgPickerModal
        visible={orgPickerOpen}
        onClose={() => setOrgPickerOpen(false)}
        onSelect={setSelectedOrg}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  content: { padding: 16, paddingBottom: 40 },

  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.stone, borderRadius: radius.md,
    padding: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.divider,
  },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, lineHeight: 18 },

  // Mode toggle
  toggleRow: {
    flexDirection: 'row', gap: 8, marginBottom: 20,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.divider, borderRadius: radius.sm,
    paddingVertical: 10, backgroundColor: colors.white,
  },
  toggleBtnActive: {},
  toggleBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSoft },
  toggleBtnTextActive: {},

  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },

  selector: {
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider, overflow: 'hidden',
    marginBottom: 16,
  },
  selectorPlaceholder: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  selectorPlaceholderText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft },
  selectedUnit: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectedUnitIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedUnitName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  selectedUnitWard: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },

  input: {
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  previewCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#f0faf4', borderRadius: radius.md,
    padding: 12, marginTop: 18, borderWidth: 1, borderColor: '#b7e4c7',
  },
  previewText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 19 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: radius.sm,
    paddingVertical: 15, marginTop: 22,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },

  // Picker modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '68%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  modalTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  emptyPicker: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, margin: 24, lineHeight: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.stone, paddingVertical: 7, marginTop: 4,
  },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  unitOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  unitIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  unitOptionText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  unitOptionSub: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  unitOptionCount: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginRight: 4 },
});
