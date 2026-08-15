import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ParishContext';
import { ROLE_LABELS, CREATABLE_ROLES } from '../theme/roles';

function RoleBadge({ role, t }) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.badgeText, { color: t.primary }]}>{ROLE_LABELS[role] || role}</Text>
    </View>
  );
}

export default function ManageUsersScreen({ navigation }) {
  const t = useTheme();
  const { user, canManageUsers, canReassignUserRoles } = useAuth();
  const [list,       setList]      = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [rolePicker, setRolePicker] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getUsers().then(setList).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // ── Toggle active / deactivate ───────────────────────────────────────────
  const toggleActive = (row) => {
    Alert.alert(
      row.is_active ? 'Deactivate account' : 'Reactivate account',
      row.is_active
        ? `${row.username} won't be able to sign in until reactivated.`
        : `${row.username} will be able to sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: row.is_active ? 'Deactivate' : 'Reactivate',
          style: row.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api.setUserActive(row.id, !row.is_active);
              load();
            } catch (e) {
              Alert.alert('Could not update account', e.message || 'Something went wrong.');
            }
          },
        },
      ],
    );
  };

  // ── Change role ──────────────────────────────────────────────────────────
  const changeRole = async (newRole) => {
    if (!rolePicker) return;
    try {
      await api.updateUserRole(rolePicker.id, newRole);
      setRolePicker(null);
      load();
    } catch (e) {
      Alert.alert('Could not change role', e.message || 'Something went wrong.');
    }
  };

  const assignableRoles = user ? CREATABLE_ROLES[user.role] || [] : [];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Manage Users" navigation={navigation} />

      {!canReassignUserRoles && (
        <View style={styles.notice}>
          <Ionicons name="eye-outline" size={14} color={colors.inkSoft} />
          <Text style={styles.noticeText}>
            View only — only a Super Admin can change roles or deactivate accounts.
          </Text>
        </View>
      )}

      <FlatList
        data={list}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const isSelf = item.id === user?.id;
          const canEditThisRow = canReassignUserRoles && !isSelf;
          const isLinked = !!item.member_id;
          const memberName = item.members
            ? `${item.members.first_name} ${item.members.last_name}`
            : null;

          return (
            <View style={[styles.row, !item.is_active && styles.rowInactive]}>
              <View style={styles.rowInner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.username}{isSelf ? ' (you)' : ''}
                  </Text>
                  <View style={styles.subRow}>
                    {isLinked ? (
                      <View style={styles.linkedChip}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        <Text style={styles.linkedText}>{memberName}</Text>
                      </View>
                    ) : (
                      <View style={styles.unlinkedChip}>
                        <Ionicons name="alert-circle-outline" size={12} color={colors.danger} />
                        <Text style={styles.unlinkedText}>No member linked</Text>
                      </View>
                    )}
                    <Text style={styles.activeText}>
                      {item.is_active ? 'Active' : 'Deactivated'}
                    </Text>
                  </View>
                </View>

                <RoleBadge role={item.role} t={t} />

                {/* Change role */}
                {canEditThisRow && (
                  <TouchableOpacity hitSlop={10} style={styles.iconBtn} onPress={() => setRolePicker(item)}>
                    <Ionicons name="swap-horizontal" size={18} color={t.primary} />
                  </TouchableOpacity>
                )}

                {/* Activate / deactivate */}
                {canEditThisRow && (
                  <TouchableOpacity hitSlop={10} style={styles.iconBtn} onPress={() => toggleActive(item)}>
                    <Ionicons
                      name={item.is_active ? 'lock-closed-outline' : 'lock-open-outline'}
                      size={18}
                      color={item.is_active ? colors.danger : colors.success}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading
            ? <Text style={styles.empty}>No user accounts yet — add the first one below.</Text>
            : null
        }
      />

      {canManageUsers && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: t.primary }]}
          onPress={() => navigation.navigate('AddUser')}
        >
          <Ionicons name="person-add" size={24} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* ── Change Role modal ── */}
      <Modal
        visible={!!rolePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setRolePicker(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setRolePicker(null)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change role for {rolePicker?.username}</Text>
            {assignableRoles.map((r) => (
              <TouchableOpacity key={r} style={styles.modalOption} onPress={() => changeRole(r)}>
                <Text style={styles.modalOptionText}>{ROLE_LABELS[r]}</Text>
                {rolePicker?.role === r && (
                  <Ionicons name="checkmark" size={18} color={t.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 14,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm,
  },
  noticeText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, flex: 1 },

  row: {
    backgroundColor: colors.white, borderRadius: radius.md,
    marginBottom: 10, borderWidth: 1, borderColor: colors.divider,
    overflow: 'hidden',
  },
  rowInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14,
  },
  rowInactive: { opacity: 0.5 },

  name: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  activeText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft },

  linkedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.success + '15', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  linkedText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.success },

  unlinkedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.danger + '15', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  unlinkedText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.danger },

  badge: {
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginRight: 4,
  },
  badgeText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  iconBtn: { padding: 6, marginLeft: 2, borderRadius: radius.sm },

  empty: { textAlign: 'center', marginTop: 40, fontFamily: fonts.body, color: colors.inkSoft },

  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 30 },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: 18 },
  modalTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink, marginBottom: 12 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  modalOptionText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
});
