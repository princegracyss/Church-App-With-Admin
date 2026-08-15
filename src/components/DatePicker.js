/**
 * DatePicker  — pure React Native, no native modules required.
 *
 * Renders a tappable field showing the selected date. Tapping opens a
 * full-screen modal with:
 *   • Month / year header with ‹ › navigation
 *   • 7-column calendar grid (Sun–Sat)
 *   • Tapping a day selects it and closes the modal
 *
 * Props:
 *   label       string   – field label (default "Date")
 *   value       string   – ISO date "YYYY-MM-DD" or "" / null
 *   onChange    fn(iso)  – called with "YYYY-MM-DD" when user picks a date
 *   minDate     string   – optional ISO min date (days before are greyed out)
 *   maxDate     string   – optional ISO max date (days after are greyed out)
 *   placeholder string   – shown when value is empty
 *   required    bool     – appends * to label
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';

const { width: SW } = Dimensions.get('window');

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── helpers ────────────────────────────────────────────────────────────────────

function toDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? null : d;
}

function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDisplay(iso) {
  const d = toDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

// Build a 6×7 grid of { day, iso, disabled } objects for a given year/month.
function buildGrid(year, month, minIso, maxIso) {
  const totalDays = daysInMonth(year, month);
  const startDow  = firstDayOfWeek(year, month);
  const cells = [];

  // Leading blanks
  for (let i = 0; i < startDow; i++) cells.push(null);

  for (let d = 1; d <= totalDays; d++) {
    const iso = toISO(year, month, d);
    let disabled = false;
    if (minIso && iso < minIso) disabled = true;
    if (maxIso && iso > maxIso) disabled = true;
    cells.push({ day: d, iso, disabled });
  }

  // Trailing blanks to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

// ── Calendar modal ─────────────────────────────────────────────────────────────

function CalendarModal({ visible, value, minDate, maxDate, onSelect, onClose, t }) {
  const todayISO = toISO(
    new Date().getFullYear(), new Date().getMonth(), new Date().getDate(),
  );

  const initialDate = toDate(value) ?? new Date();
  const [year,  setYear]  = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());

  // Sync to current value whenever modal opens
  useEffect(() => {
    if (visible) {
      const d = toDate(value) ?? new Date();
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const prevYear = () => setYear(y => y - 1);
  const nextYear = () => setYear(y => y + 1);

  const grid = buildGrid(year, month, minDate, maxDate);
  const cellW = Math.floor((SW - 64) / 7);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>

          {/* ── Year / Month navigation ── */}
          <View style={styles.navRow}>
            <TouchableOpacity onPress={prevYear} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="chevron-back-circle-outline" size={22} color={t.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={prevMonth} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </TouchableOpacity>
            <Text style={styles.navTitle}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity onPress={nextYear} hitSlop={10} style={styles.navBtn}>
              <Ionicons name="chevron-forward-circle-outline" size={22} color={t.primary} />
            </TouchableOpacity>
          </View>

          {/* ── Day-of-week headers ── */}
          <View style={styles.dowRow}>
            {DAYS.map(d => (
              <Text key={d} style={[styles.dowCell, { width: cellW }]}>{d}</Text>
            ))}
          </View>

          {/* ── Day grid ── */}
          <View style={styles.grid}>
            {grid.map((cell, i) => {
              if (!cell) return <View key={`e-${i}`} style={{ width: cellW, height: cellW }} />;
              const isSelected = cell.iso === value;
              const isToday    = cell.iso === todayISO;
              return (
                <TouchableOpacity
                  key={cell.iso}
                  style={{ width: cellW, height: cellW, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => { if (!cell.disabled) { onSelect(cell.iso); onClose(); } }}
                  disabled={cell.disabled}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.dayCircle,
                    isSelected && { backgroundColor: t.primary },
                    isToday && !isSelected && styles.dayCircleToday,
                    isToday && !isSelected && { borderColor: t.primary },
                    { width: cellW - 4, height: cellW - 4, borderRadius: (cellW - 4) / 2 },
                  ]}>
                    <Text style={[
                      styles.dayText,
                      isSelected   && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                      isToday && !isSelected && { color: t.primary },
                      cell.disabled && styles.dayTextDisabled,
                    ]}>
                      {cell.day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Today shortcut & cancel ── */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: t.primary }]}
              onPress={() => { onSelect(todayISO); onClose(); }}
            >
              <Text style={styles.footerBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerBtn, styles.footerBtnCancel]} onPress={onClose}>
              <Text style={styles.footerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

export default function DatePicker({
  label = 'Date',
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  required = false,
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const display = value ? formatDisplay(value) : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Ionicons
          name="calendar-outline"
          size={17}
          color={value ? t.primary : colors.inkSoft}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]}>
          {display || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.inkSoft} />
      </TouchableOpacity>

      <CalendarModal
        visible={open}
        value={value || ''}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { marginBottom: 14 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },

  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  fieldText:        { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  fieldPlaceholder: { color: colors.inkSoft },

  // Modal
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16,
    width: '100%', maxWidth: 360,
  },

  // Navigation
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  navBtn:   { padding: 4 },
  navTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },

  // Day-of-week
  dowRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: 4,
  },
  dowCell: {
    textAlign: 'center',
    fontFamily: fonts.bodyMedium, fontSize: 11,
    color: colors.inkSoft,
  },

  // Grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dayCircle: { alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: {},
  dayCircleToday:    { backgroundColor: colors.stone, borderWidth: 1.5 },

  dayText:         { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  dayTextSelected: { fontFamily: fonts.bodySemi, color: colors.white },
  dayTextToday:    { fontFamily: fonts.bodySemi },
  dayTextDisabled: { color: colors.divider },

  // Footer
  footerRow: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  footerBtn: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: radius.sm,
  },
  footerBtnText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
  footerBtnCancel: { backgroundColor: colors.stone, borderWidth: 1, borderColor: colors.divider },
  footerCancelText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSoft },
});
