/**
 * EventsScreen — Parish Calendar
 *
 * Full calendar view combining three data sources:
 *   • Parish events     (DB `events` table)  – blue
 *   • Member birthdays  (DB `members` DOB)   – purple
 *   • Liturgy dates     (DB `liturgy_assignments`) – green
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  ‹  Month Year  ›                        │ ← month nav
 *   │  Su Mo Tu We Th Fr Sa                   │
 *   │  [calendar grid — dots under days]       │
 *   ├─────────────────────────────────────────┤
 *   │  Events for <selected date>              │ ← event list
 *   │  • Event card ...                        │
 *   └─────────────────────────────────────────┘
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Dimensions, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { fmtDate, fmtDay, fmtMonthShort } from '../utils/date';
import { useTheme } from '../context/ParishContext';

const { width: SW } = Dimensions.get('window');

// ── constants ─────────────────────────────────────────────────────────────────
const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CELL_W      = Math.floor((SW - 32) / 7);

const TYPE_META = {
  event:    { icon: 'calendar',              label: 'Event',    bg: '#e8f0fb', border: '#1a5c8a', dot: '#1a5c8a' },
  birthday: { icon: 'gift-outline',          label: 'Birthday', bg: '#f0ecfb', border: '#7c5cd8', dot: '#7c5cd8' },
  liturgy:  { icon: 'business-outline',      label: 'Liturgy',  bg: '#e8f5ee', border: '#2e7a4f', dot: '#2e7a4f' },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDOW(y, m)    { return new Date(y, m, 1).getDay(); }

function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

function prettyDate(iso) {
  return fmtDate(iso, 'long', true);
}

// Group calendar events keyed by ISO date string.
function groupByDate(events) {
  const map = {};
  for (const e of events) {
    if (!map[e.iso]) map[e.iso] = [];
    map[e.iso].push(e);
  }
  return map;
}

// ── Legend strip ──────────────────────────────────────────────────────────────
function Legend() {
  return (
    <View style={styles.legend}>
      {Object.entries(TYPE_META).map(([type, m]) => (
        <View key={type} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: m.dot }]} />
          <Text style={styles.legendLabel}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────
function EventCard({ item }) {
  const meta = TYPE_META[item.type] || TYPE_META.event;
  return (
    <View style={[styles.eventCard, { borderLeftColor: meta.border, backgroundColor: meta.bg }]}>
      <View style={styles.eventIconWrap}>
        <Ionicons name={meta.icon} size={16} color={meta.border} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventTitle, { color: meta.border }]}>{item.title}</Text>
        {!!item.meta?.venue && (
          <View style={styles.eventVenueRow}>
            <Ionicons name="location-outline" size={11} color={colors.inkSoft} />
            <Text style={styles.eventVenue}>{item.meta.venue}</Text>
          </View>
        )}
        {!!item.meta?.description && (
          <Text style={styles.eventDesc} numberOfLines={2}>{item.meta.description}</Text>
        )}
        {!!item.meta?.notes && (
          <Text style={styles.eventDesc} numberOfLines={2}>{item.meta.notes}</Text>
        )}
      </View>
      <View style={[styles.typePill, { backgroundColor: meta.border + '22' }]}>
        <Text style={[styles.typePillText, { color: meta.border }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

// ── Calendar grid ─────────────────────────────────────────────────────────────
function CalendarGrid({ year, month, eventMap, selectedISO, onSelectDay }) {
  const t = useTheme();
  const today  = todayISO();
  const nDays  = daysInMonth(year, month);
  const offset = firstDOW(year, month);

  // Build cells array: null for leading blanks, day number for real cells.
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= nDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.gridWrap}>
      {/* Day-of-week headers */}
      <View style={styles.dowRow}>
        {DAYS_SHORT.map(d => (
          <Text key={d} style={[styles.dowCell, { width: CELL_W }]}>{d}</Text>
        ))}
      </View>

      {/* Grid rows */}
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`b${i}`} style={{ width: CELL_W, height: CELL_W + 14 }} />;
          const iso      = toISO(year, month, day);
          const isToday  = iso === today;
          const isSel    = iso === selectedISO;
          const dayEvts  = eventMap[iso] || [];

          // Up to 3 colour dots, de-duplicated by type
          const dotTypes = [...new Set(dayEvts.map(e => e.type))].slice(0, 3);

          // Inner circle size — perfectly square, fits inside the cell with 2px margin each side
          const circleSize = CELL_W - 6;

          return (
            <TouchableOpacity
              key={iso}
              style={[styles.cell, { width: CELL_W, height: CELL_W + 14 }]}
              onPress={() => onSelectDay(iso)}
              activeOpacity={0.7}
            >
              {/* Square highlight — sized to be a perfect square/circle */}
              <View style={[
                styles.cellInner,
                { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
                isSel   && { backgroundColor: t.primary },
                isToday && !isSel && { backgroundColor: t.primaryLight },
              ]}>
                <Text style={[
                  styles.cellNum,
                  isSel   && { color: '#fff', fontFamily: fonts.bodySemi },
                  isToday && !isSel && { color: t.primary, fontFamily: fonts.bodySemi },
                ]}>
                  {day}
                </Text>
              </View>
              {/* Event dots — always below the circle, never inside it */}
              <View style={styles.dotRow}>
                {dotTypes.map(dt => (
                  <View key={dt} style={[styles.dot, { backgroundColor: TYPE_META[dt]?.dot ?? colors.inkSoft }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function EventsScreen({ navigation }) {
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedISO, setSelectedISO] = useState(todayISO());
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const t = useTheme();

  const load = useCallback(async (y, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await api.getCalendarEvents(y);
      setAllEvents(data);
    } catch (e) {
      console.warn('[EventsScreen] load failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload when year changes (initial load + year navigation).
  useEffect(() => { load(year); }, [year]);

  // Reload on focus so the calendar refreshes when navigating back from
  // other screens (e.g. after a new liturgy is assigned).
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(year));
    return unsub;
  }, [navigation, year]);

  const eventMap = useMemo(() => groupByDate(allEvents), [allEvents]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // When month changes ensure selectedISO stays in sync (pick day 1 of new month)
  const handleMonthChange = (dir) => {
    let ny = year, nm = month;
    if (dir === 'prev') { if (month === 0) { ny = year - 1; nm = 11; } else nm = month - 1; }
    else                { if (month === 11) { ny = year + 1; nm = 0; } else nm = month + 1; }
    setYear(ny); setMonth(nm);
    setSelectedISO(toISO(ny, nm, 1));
    if (ny !== year) load(ny);
  };

  const selectedEvents = eventMap[selectedISO] || [];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Parish Calendar" navigation={navigation} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(year, true)} tintColor={t.primary} />
        }
      >
        {/* ── Month navigation ── */}
        <View style={[styles.monthNav, { backgroundColor: t.primary }]}>
          <TouchableOpacity onPress={() => handleMonthChange('prev')} hitSlop={12} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedISO(todayISO()); }} >
            <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleMonthChange('next')} hitSlop={12} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* ── Legend ── */}
        <Legend />

        {/* ── Calendar grid ── */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : (
          <CalendarGrid
            year={year}
            month={month}
            eventMap={eventMap}
            selectedISO={selectedISO}
            onSelectDay={setSelectedISO}
          />
        )}

        {/* ── Selected day header ── */}
        <View style={styles.dayHeader}>
          <Ionicons name="calendar-outline" size={15} color={t.primary} />
          <Text style={styles.dayHeaderText}>{prettyDate(selectedISO)}</Text>
          {selectedEvents.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: t.primary }]}>
              <Text style={styles.countBadgeText}>{selectedEvents.length}</Text>
            </View>
          )}
        </View>

        {/* ── Events for selected day ── */}
        {selectedEvents.length === 0 ? (
          <View style={styles.emptyDay}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.divider} />
            <Text style={styles.emptyDayText}>Nothing scheduled on this day</Text>
          </View>
        ) : (
          <View style={styles.eventList}>
            {selectedEvents.map(item => <EventCard key={item.id} item={item} />)}
          </View>
        )}

        {/* ── Monthly summary ── */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>All events this month</Text>
          {Object.entries(
            allEvents
              .filter(e => e.iso.startsWith(toISO(year, month, 1).slice(0, 7)))
              .reduce((acc, e) => { if (!acc[e.iso]) acc[e.iso] = []; acc[e.iso].push(e); return acc; }, {})
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([iso, evts]) => (
            <TouchableOpacity key={iso} onPress={() => setSelectedISO(iso)} style={styles.summaryRow}>
              <View style={styles.summaryDate}>
                <Text style={[styles.summaryDay, { color: t.primary }]}>{fmtDay(iso)}</Text>
                <Text style={styles.summaryDow}>{fmtMonthShort(iso)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {evts.map(e => (
                  <View key={e.id} style={styles.summaryItem}>
                    <View style={[styles.summaryDot, { backgroundColor: TYPE_META[e.type]?.dot }]} />
                    <Text style={styles.summaryTitle} numberOfLines={1}>{e.title}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
          {allEvents.filter(e => e.iso.startsWith(toISO(year, month, 1).slice(0, 7))).length === 0 && !loading && (
            <Text style={styles.emptySummary}>No events this month.</Text>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  monthNavBtn: { padding: 4 },
  monthTitle: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.white },

  // Legend
  legend: {
    flexDirection: 'row', gap: 16, justifyContent: 'center',
    paddingVertical: 8, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft },

  loadingWrap: { height: 200, alignItems: 'center', justifyContent: 'center' },

  // Grid
  gridWrap: { backgroundColor: colors.white, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  dowRow:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  dowCell:  { textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.inkSoft },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },

  cell: {
    alignItems: 'center', justifyContent: 'flex-start',
    paddingTop: 3,
  },
  // Inner square/circle that carries the selection or today highlight.
  // width & height are set inline to keep it perfectly square.
  cellInner: {
    alignItems: 'center', justifyContent: 'center',
  },

  cellNum: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },

  dotRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  dot:    { width: 4, height: 4, borderRadius: 2 },

  // Selected day
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.cream,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  dayHeaderText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  countBadge: {
    borderRadius: radius.pill,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  countBadgeText: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.white },

  emptyDay: {
    alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 24,
  },
  emptyDayText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft },

  eventList: { paddingHorizontal: 12, paddingBottom: 4 },
  eventCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderLeftWidth: 3, borderRadius: radius.sm,
    padding: 11, marginBottom: 8,
  },
  eventIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  eventTitle:   { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, marginBottom: 2 },
  eventVenueRow:{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  eventVenue:   { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft },
  eventDesc:    { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2, lineHeight: 16 },
  typePill: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  typePillText: { fontFamily: fonts.bodyMedium, fontSize: 10 },

  // Monthly summary
  summarySection: { paddingHorizontal: 12, paddingTop: 8 },
  sectionTitle: {
    fontFamily: fonts.bodySemi, fontSize: 11.5, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginLeft: 2,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.divider,
  },
  summaryDate: { alignItems: 'center', minWidth: 36 },
  summaryDay: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22 },
  summaryDow: { fontFamily: fonts.bodyMedium, fontSize: 9, color: colors.inkSoft },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  summaryDot:  { width: 6, height: 6, borderRadius: 3 },
  summaryTitle:{ fontFamily: fonts.body, fontSize: 12.5, color: colors.ink, flex: 1 },
  emptySummary:{ textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, paddingVertical: 16 },
});
