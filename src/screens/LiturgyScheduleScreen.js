/**
 * LiturgyScheduleScreen — uses shared date utils to avoid UTC-day-shift bugs.
 *
 * Displays all liturgy assignments.
 *   • Staff (priest / admin / secretary): see every assignment with a
 *     "Delete" swipe action and an "Assign New" FAB.
 *   • Member: filtered to their own BCC unit's assignments, read-only.
 *
 * Both views group entries into "Upcoming" and "Past" sections.
 * Today's assignment is highlighted with a "TODAY" badge.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, SectionList, StyleSheet,
  TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtDay, fmtMonthShort } from '../utils/date';
import { useTheme } from '../context/ParishContext';

// ── helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  return fmtDate(iso, 'long', true);
}

function daysUntil(iso) {
  const today = new Date(todayStr() + 'T00:00:00');
  const target = new Date(iso + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  return diff;
}

function dueLabel(iso) {
  const d = daysUntil(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d > 1 && d <= 7) return `In ${d} days`;
  if (d < 0 && d >= -1) return 'Yesterday';
  if (d < -1) return `${Math.abs(d)} days ago`;
  return '';
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({ item, isAdmin, onDelete }) {
  const t = useTheme();
  const today = todayStr();
  const isToday = item.liturgy_date === today;
  const isPast  = item.liturgy_date < today;
  const due     = dueLabel(item.liturgy_date);

  return (
    <View style={[styles.row, isToday && { borderColor: t.secondary, borderWidth: 2, backgroundColor: '#fffdf6' }, isPast && styles.rowPast]}>
      {/* Date badge */}
      <View style={[styles.dateBadge, { backgroundColor: isPast ? colors.inkSoft : isToday ? t.secondary : t.primary }]}>
        <Text style={[styles.dateDay, isToday && styles.dateDayToday, isPast && styles.dateDayPast]}>
          {fmtDay(item.liturgy_date)}
        </Text>
        <Text style={[styles.dateMonth, { color: isToday ? colors.ink : isPast ? colors.cream : t.secondaryLight }]}>
          {fmtMonthShort(item.liturgy_date)}
        </Text>
        {isToday && <View style={styles.todayDot} />}
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTopLine}>
          <Text style={[styles.unitName, isPast && styles.unitNamePast]} numberOfLines={1}>
            {item.bcc_unit_name || item.org_name || 'Parish'}
          </Text>
          {isToday && (
            <View style={[styles.todayBadge, { backgroundColor: t.secondary }]}>
              <Text style={styles.todayBadgeText}>TODAY</Text>
            </View>
          )}
          {!!due && !isToday && (
            <Text style={[styles.duePill, isPast ? { color: colors.inkSoft } : { color: t.primary }]}>{due}</Text>
          )}
        </View>
        <Text style={styles.dateLabel}>{formatDate(item.liturgy_date)}</Text>
        {!!item.notes && (
          <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
        )}
      </View>

      {/* Delete (staff only) */}
      {isAdmin && !isPast && (
        <TouchableOpacity hitSlop={10} style={styles.deleteBtn} onPress={() => onDelete(item)}>
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LiturgyScheduleScreen({ navigation }) {
  const { isAdmin, isParishPriest } = useAuth();
  const isStaff = isAdmin || isParishPriest;
  const t = useTheme();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Staff see all assignments; members see only their BCC unit's assignments.
      const data = isStaff
        ? await api.getLiturgyAssignments()
        : await api.getMyLiturgyAssignments();
      setList(data || []);
    } catch (e) {
      console.warn('[LiturgySchedule] load failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Real-time: refresh when a new assignment is created.
  useEffect(() => {
    channelRef.current = supabase
      .channel('liturgy-schedule')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liturgy_assignments' }, load)
      .subscribe();
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [load]);

  const confirmDelete = (item) => {
    const hostName = item.bcc_unit_name || item.org_name || 'Parish';
    Alert.alert(
      'Delete assignment',
      `Remove the liturgy assignment for ${hostName} on ${formatDate(item.liturgy_date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLiturgyAssignment(item.id);
              load();
            } catch (e) {
              Alert.alert('Could not delete', e.message);
            }
          },
        },
      ],
    );
  };

  // ── Split into Upcoming / Past sections ──────────────────────────────────
  const today = todayStr();
  const upcoming = list.filter((a) => a.liturgy_date >= today);
  const past     = list.filter((a) => a.liturgy_date < today).reverse(); // most recent first

  const sections = [];
  if (upcoming.length > 0) sections.push({ title: 'Upcoming', data: upcoming });
  if (past.length > 0)     sections.push({ title: 'Past', data: past });

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={isStaff ? 'Liturgy Schedule' : 'My Liturgy Schedule'}
        navigation={navigation}
      />

      {list.length === 0 && !loading ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="calendar-outline" size={48} color={colors.inkSoft} />
          <Text style={styles.emptyTitle}>
            {isStaff ? 'No liturgy assignments yet.' : 'No upcoming liturgy assignments found.'}
          </Text>
          {isStaff ? (
            <Text style={styles.emptySub}>Tap + to assign a BCC unit or organization to a liturgy date.</Text>
          ) : (
            <Text style={styles.emptySub}>Assignments for your BCC unit or organizations will appear here.</Text>
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshing={loading}
          onRefresh={load}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <AssignmentRow
              item={item}
              isAdmin={isStaff}
              onDelete={confirmDelete}
            />
          )}
        />
      )}

      {/* FAB — staff only */}
      {isStaff && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: t.primary }]} onPress={() => navigation.navigate('LiturgyAssign')}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  rowToday: { borderWidth: 2, backgroundColor: '#fffdf6' },
  rowPast: { opacity: 0.6 },

  dateBadge: {
    width: 52, minHeight: 58, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, paddingVertical: 6,
  },
  dateBadgeToday: {},
  dateBadgePast:  {},
  dateDay:       { fontFamily: fonts.display, fontSize: 20, color: colors.white },
  dateDayToday:  { color: colors.ink },
  dateDayPast:   { color: colors.white },
  dateMonth:     { fontFamily: fonts.bodySemi, fontSize: 10, marginTop: 2 },
  dateMonthToday:{},
  dateMonthPast: {},
  todayDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white, marginTop: 4 },

  rowContent: { flex: 1 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 },
  unitName:     { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink, flex: 1 },
  unitNamePast: { color: colors.inkSoft },

  todayBadge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  todayBadgeText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.ink },

  duePill:     { fontFamily: fonts.bodyMedium, fontSize: 11 },
  duePillPast: {},

  dateLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginBottom: 4 },
  notes:     { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, lineHeight: 17 },

  deleteBtn: { padding: 6, marginLeft: 4 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 8,
  },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11.5, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.inkSoft },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.inkSoft, textAlign: 'center' },
  emptySub:   { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },

  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
