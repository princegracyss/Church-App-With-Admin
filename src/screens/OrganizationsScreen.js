/**
 * OrganizationsScreen
 *
 * Staff (admin / priest / secretary):
 *   • View all organizations with member counts
 *   • Add / edit / delete organizations
 *   • Tap an org → OrgMembersScreen to manage its members
 *
 * Members (read-only):
 *   • View list of active organizations
 *   • Tap an org → see its members (name + designation)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ScrollView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ParishContext';
import { fmtDate } from '../utils/date';

// ── Icon options for orgs ────────────────────────────────────────────────────
const ICONS = [
  'flag', 'people', 'star', 'heart', 'musical-notes',
  'book', 'rose', 'leaf', 'ribbon', 'shield-checkmark',
];

// ── Org Form Modal ───────────────────────────────────────────────────────────
function OrgFormModal({ visible, org, onClose, onSaved }) {
  const t = useTheme();
  const isEdit = !!org;
  const [name, setName]        = useState('');
  const [desc, setDesc]        = useState('');
  const [icon, setIcon]        = useState('flag');
  const [saving, setSaving]    = useState(false);

  useEffect(() => {
    if (visible) {
      setName(org?.name || '');
      setDesc(org?.description || '');
      setIcon(org?.icon || 'flag');
    }
  }, [visible, org]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Organization name is required.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateOrganization(org.id, { name: name.trim(), description: desc.trim() || null, icon });
      } else {
        await api.createOrganization({ name: name.trim(), description: desc.trim() || null, icon });
      }
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save organization.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{isEdit ? 'Edit Organization' : 'Add Organization'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">

            {/* Icon picker */}
            <Text style={styles.formLabel}>Icon</Text>
            <View style={styles.iconRow}>
              {ICONS.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconOption, icon === ic && { backgroundColor: t.primary, borderColor: t.primaryDark }]}
                  onPress={() => setIcon(ic)}
                >
                  <Ionicons name={ic} size={20} color={icon === ic ? colors.white : t.primary} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Name */}
            <Text style={styles.formLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Parish Choir"
              placeholderTextColor={colors.inkSoft}
              maxLength={100}
              autoCapitalize="words"
            />

            {/* Description */}
            <Text style={[styles.formLabel, { marginTop: 14 }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Optional short description…"
              placeholderTextColor={colors.inkSoft}
              multiline
              numberOfLines={3}
              maxLength={300}
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: t.primary }, saving && styles.saveBtnDisabled]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="checkmark-done-outline" size={17} color={colors.white} />
              )}
              <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Organization'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Org Members Modal ────────────────────────────────────────────────────────
// Used for both staff (add/remove) and read-only member views.
function OrgMembersModal({ visible, org, isAdmin, onClose }) {
  const t = useTheme();
  const [members, setMembers]          = useState([]);
  const [loading, setLoading]          = useState(false);
  const [showAdd, setShowAdd]          = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]      = useState(false);
  const [designation, setDesignation]  = useState('');

  // Use a ref for orgId so the load callback doesn't go stale when the org
  // prop reference changes between renders.
  const orgIdRef = React.useRef(org?.id);
  orgIdRef.current = org?.id;

  const load = useCallback(async () => {
    const id = orgIdRef.current;
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getOrgMembers(id);
      setMembers(data);
    } catch (e) {
      console.warn('[OrgMembers] load failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads orgId via ref

  useEffect(() => {
    if (visible) load();
  }, [visible, org?.id]); // re-run when org changes too

  const doSearch = async (q) => {
    setMemberSearch(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await api.searchMembers({ text: q.trim(), textField: 'name' });
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addMember = async (member) => {
    try {
      await api.addOrgMember(org.id, member.id, { designation: designation.trim() || null });
      setShowAdd(false);
      setMemberSearch('');
      setSearchResults([]);
      setDesignation('');
      await load(); // await so the list is refreshed before the spinner clears
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not add member.');
    }
  };

  const removeMember = (om) => {
    Alert.alert(
      'Remove Member',
      `Remove ${om.members?.first_name} ${om.members?.last_name} from ${org?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await api.removeOrgMember(om.id);
              load();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.membersOverlay}>
        <View style={styles.membersSheet}>
          {/* Header */}
          <View style={styles.membersSheetHeader}>
            <View style={styles.membersSheetTitleWrap}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{org?.name}</Text>
              <Text style={styles.sheetSubtitle}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.membersSheetActions}>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.addMemberBtn, { borderColor: t.primary }]}
                  onPress={() => setShowAdd(v => !v)}
                >
                  <Ionicons name={showAdd ? 'close' : 'person-add-outline'} size={16} color={t.primary} />
                  <Text style={[styles.addMemberBtnText, { color: t.primary }]}>{showAdd ? 'Cancel' : 'Add'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Add-member inline panel */}
          {showAdd && (
            <View style={styles.addPanel}>
              <TextInput
                style={styles.searchInput}
                value={memberSearch}
                onChangeText={doSearch}
                placeholder="Search member by name or number…"
                placeholderTextColor={colors.inkSoft}
                autoFocus
              />
              <TextInput
                style={[styles.searchInput, { marginTop: 8 }]}
                value={designation}
                onChangeText={setDesignation}
                placeholder="Designation (optional)"
                placeholderTextColor={colors.inkSoft}
              />
              {searching && <ActivityIndicator size="small" color={t.primary} style={{ marginTop: 6 }} />}
              {searchResults.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.searchRow}
                  onPress={() => addMember(m)}
                >
                  <View style={styles.searchAvatar}>
                    <Text style={styles.searchAvatarText}>{m.first_name?.[0]}{m.last_name?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchName}>{m.first_name} {m.last_name}</Text>
                    <Text style={styles.searchSub}>{m.member_number}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={20} color={colors.success} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Member list */}
          {loading ? (
            <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={om => om.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
              ListEmptyComponent={
                <View style={styles.emptyMembers}>
                  <Ionicons name="people-outline" size={30} color={colors.divider} />
                  <Text style={styles.emptyMembersText}>No members yet</Text>
                </View>
              }
              renderItem={({ item: om }) => (
                <View style={styles.omRow}>
                  <View style={styles.omAvatar}>
                    <Text style={styles.omAvatarText}>
                      {om.members?.first_name?.[0]}{om.members?.last_name?.[0]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.omName}>{om.members?.first_name} {om.members?.last_name}</Text>
                    <Text style={styles.omSub}>
                      {om.designation || om.members?.member_number || ''}
                      {om.joined_date ? ` · Joined ${fmtDate(om.joined_date)}` : ''}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => removeMember(om)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Org Card ─────────────────────────────────────────────────────────────────
function OrgCard({ item, isAdmin, onEdit, onDelete, onPress }) {
  const t = useTheme();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.cardIconWrap, { backgroundColor: t.primaryLight }]}>
        <Ionicons name={item.icon || 'flag'} size={20} color={t.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{item.name}</Text>
        {!!item.description && (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.cardMeta}>
          <Ionicons name="people-outline" size={12} color={colors.inkSoft} />
          <Text style={styles.cardMetaText}>{item.member_count} member{item.member_count !== 1 ? 's' : ''}</Text>
          {item.status === 'inactive' && (
            <View style={styles.inactivePill}>
              <Text style={styles.inactivePillText}>Inactive</Text>
            </View>
          )}
        </View>
      </View>
      {isAdmin && (
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => onEdit(item)} hitSlop={6} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={17} color={colors.inkSoft} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item)} hitSlop={6} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OrganizationsScreen({ navigation }) {
  const { isAdmin } = useAuth();
  const t = useTheme();
  const [list, setList]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editOrg, setEditOrg]     = useState(null);   // org being edited
  const [viewOrg, setViewOrg]     = useState(null);   // org whose members are shown

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await api.getOrganizations();
      setList(data);
    } catch (e) {
      console.warn('[Organizations] load failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  const openAdd = () => {
    setEditOrg(null);
    setFormVisible(true);
  };

  const openEdit = (org) => {
    setEditOrg(org);
    setFormVisible(true);
  };

  const confirmDelete = (org) => {
    Alert.alert(
      'Delete Organization',
      `Delete "${org.name}"? This cannot be undone and will remove all member associations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteOrganization(org.id);
              load();
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not delete.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Organizations"
        navigation={navigation}
        right={isAdmin ? (
          <TouchableOpacity onPress={openAdd} hitSlop={8} style={styles.addHdrBtn}>
            <Ionicons name="add" size={22} color={colors.white} />
          </TouchableOpacity>
        ) : undefined}
      />

      {loading && list.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={o => o.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="flag-outline" size={40} color={colors.divider} />
              <Text style={styles.emptyTitle}>No organizations yet</Text>
              {isAdmin && (
                <Text style={styles.emptyHint}>Tap the + button to create one.</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <OrgCard
              item={item}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={confirmDelete}
              onPress={() => setViewOrg(item)}
            />
          )}
        />
      )}

      {/* Add/Edit form */}
      <OrgFormModal
        visible={formVisible}
        org={editOrg}
        onClose={() => setFormVisible(false)}
        onSaved={load}
      />

      {/* Members view (staff: editable; member: read-only) */}
      <OrgMembersModal
        visible={!!viewOrg}
        org={viewOrg}
        isAdmin={isAdmin}
        onClose={() => setViewOrg(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 14, paddingBottom: 36 },
  addHdrBtn: { padding: 4 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  cardIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  cardName: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  cardDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  cardMetaText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft },
  inactivePill: {
    backgroundColor: '#fce8e8', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 1, marginLeft: 6,
  },
  inactivePillText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.danger },
  cardActions: { flexDirection: 'row', gap: 2, marginLeft: 8 },
  actionBtn: { padding: 6 },

  // Empty state
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  emptyHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft },

  // Modal sheet (form)
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  sheetTitle: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: colors.ink, flex: 1 },
  sheetSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  sheetBody: { padding: 16, paddingBottom: 36 },

  // Form
  formLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  iconOption: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
    backgroundColor: colors.stone,
  },
  iconOptionSelected: {},
  input: {
    backgroundColor: colors.stone, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 13, paddingVertical: 10,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: radius.sm,
    paddingVertical: 14, marginTop: 22,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 14.5 },

  // Members modal
  membersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  membersSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  // Separate header style for members modal (title + action buttons side by side,
  // title truncates gracefully instead of pushing buttons off-screen).
  membersSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider,
    gap: 10,
  },
  membersSheetTitleWrap: { flex: 1, minWidth: 0 },
  membersSheetActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  closeBtn: { padding: 4 },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5,
  },
  addMemberBtnText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },

  // Add panel
  addPanel: {
    backgroundColor: colors.stone,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  searchInput: {
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: fonts.body, fontSize: 13.5, color: colors.ink,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white, borderRadius: radius.sm,
    marginTop: 8, padding: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  searchAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  searchAvatarText: { fontFamily: fonts.bodySemi, fontSize: 12 },
  searchName: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  searchSub:  { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },

  // Org member rows
  omRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  omAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  omAvatarText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  omName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  omSub:  { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  emptyMembers: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyMembersText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft },
});
