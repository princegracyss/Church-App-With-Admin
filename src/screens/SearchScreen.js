import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ScrollView, Animated, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';

// ── Constants ──────────────────────────────────────────────────────────────────
const TEXT_FIELDS = [
  { key: 'name',          label: 'Name' },
  { key: 'member_number', label: 'Member #' },
  { key: 'mobile',        label: 'Mobile' },
  { key: 'email',         label: 'Email' },
  { key: 'occupation',    label: 'Occupation' },
  { key: 'education',     label: 'Education' },
  { key: 'baptism_name',  label: 'Baptism Name' },
];

const GENDERS        = ['Male', 'Female'];
const BLOOD_GROUPS   = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARITAL_STATUS = ['Single', 'Married', 'Widowed'];
const STATUSES       = ['active', 'inactive'];

const EMPTY_FILTERS = {
  gender: '',
  bloodGroup: '',
  maritalStatus: '',
  status: '',
  bccUnit: '',
  ward: '',
  place: '',
  familyCode: '',
  houseName: '',
};

// ── Small reusable chip ────────────────────────────────────────────────────────
function Chip({ label, active, onPress, t }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: t.primary, borderColor: t.primary }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Filter row: label + horizontal chip strip ──────────────────────────────────
function FilterRow({ label, options, value, onChange, t }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {options.map((opt) => (
          <Chip
            key={opt}
            label={opt}
            active={value === opt}
            onPress={() => onChange(value === opt ? '' : opt)}
            t={t}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── Filter row with a text input ───────────────────────────────────────────────
function FilterTextRow({ label, value, onChange, placeholder, keyboardType }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <TextInput
        style={styles.filterInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        keyboardType={keyboardType}
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  );
}

// ── Count active filters ───────────────────────────────────────────────────────
function countActive(f) {
  return Object.values(f).filter(Boolean).length;
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function SearchScreen({ navigation }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [textField, setTextField] = useState('name');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Animated height for the filter panel
  const panelAnim = useRef(new Animated.Value(0)).current;
  const togglePanel = () => {
    const toValue = panelOpen ? 0 : 1;
    Animated.timing(panelAnim, { toValue, duration: 220, useNativeDriver: false }).start();
    setPanelOpen(!panelOpen);
  };

  const setFilter = (key) => (val) => setFilters((f) => ({ ...f, [key]: val }));

  const runSearch = useCallback(async (overrideText, overrideField, overrideFilters) => {
    const t = overrideText  !== undefined ? overrideText  : text;
    const f = overrideField !== undefined ? overrideField : textField;
    const fi = overrideFilters !== undefined ? overrideFilters : filters;
    setLoading(true);
    setSearched(false);
    try {
      const rows = await api.searchMembers({ textField: f, text: t, ...fi });
      setResults(rows);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [text, textField, filters]);

  const clearAll = () => {
    setText('');
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setSearched(false);
  };

  const activeFilterCount = countActive(filters);
  const hasAny = text.trim() || activeFilterCount > 0;

  const panelHeight = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 460] });

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Advanced Search" navigation={navigation} />

      {/* ── Search bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search by ${TEXT_FIELDS.find(f => f.key === textField)?.label ?? 'Name'}…`}
          placeholderTextColor={colors.inkSoft}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => runSearch()}
          returnKeyType="search"
          autoCorrect={false}
        />
        {hasAny && (
          <TouchableOpacity onPress={clearAll} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Text-field selector ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.fieldRow}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
      >
        {TEXT_FIELDS.map(({ key, label }) => (
          <Chip
            key={key}
            label={label}
            active={textField === key}
            onPress={() => {
              setTextField(key);
              if (text.trim()) runSearch(text, key, filters);
            }}
          />
        ))}
      </ScrollView>

      {/* ── Filters toggle + Search button ── */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.filterToggle, panelOpen && { backgroundColor: t.primary, borderColor: t.primary }]}
          onPress={togglePanel}
        >
          <Ionicons name="options-outline" size={16} color={panelOpen ? colors.white : t.primary} />
          <Text style={[styles.filterToggleText, { color: panelOpen ? colors.white : t.primary }]}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
          <Ionicons
            name={panelOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={panelOpen ? colors.white : t.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: t.primary }, !hasAny && { opacity: 0.5 }]}
          onPress={() => runSearch()}
          disabled={loading}
        >
          <Text style={styles.searchBtnText}>{loading ? 'Searching…' : 'Search'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Collapsible filter panel ── */}
      <Animated.View style={[styles.filterPanel, { maxHeight: panelHeight, overflow: 'hidden' }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <FilterRow label="Gender"         options={GENDERS}        value={filters.gender}        onChange={setFilter('gender')}        t={t} />
          <FilterRow label="Blood Group"    options={BLOOD_GROUPS}   value={filters.bloodGroup}    onChange={setFilter('bloodGroup')}    t={t} />
          <FilterRow label="Marital Status" options={MARITAL_STATUS} value={filters.maritalStatus} onChange={setFilter('maritalStatus')} t={t} />
          <FilterRow label="Status"         options={STATUSES}       value={filters.status}        onChange={setFilter('status')}        t={t} />
          <FilterTextRow label="BCC Unit"     value={filters.bccUnit}    onChange={setFilter('bccUnit')}    placeholder="e.g. St. Antony Unit" />
          <FilterTextRow label="Ward"         value={filters.ward}       onChange={setFilter('ward')}       placeholder="e.g. Ward 1" />
          <FilterTextRow label="Place"        value={filters.place}      onChange={setFilter('place')}      placeholder="Place" />
          <FilterTextRow label="House Name"   value={filters.houseName}  onChange={setFilter('houseName')}  placeholder="House name" />
          <FilterTextRow label="Family Code"  value={filters.familyCode} onChange={setFilter('familyCode')} placeholder="e.g. FAM-0001" />

          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => { setFilters(EMPTY_FILTERS); }}
            >
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>

      {/* ── Results count ── */}
      {searched && (
        <Text style={styles.resultCount}>
          {results.length === 0
            ? 'No results'
            : `${results.length} result${results.length !== 1 ? 's' : ''}`}
        </Text>
      )}

      {/* ── Result list ── */}
      <FlatList
        data={results}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ResultRow item={item} navigation={navigation} textField={textField} t={t} />}
        ListEmptyComponent={
          searched && !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="search-outline" size={36} color={colors.inkSoft} />
              <Text style={styles.empty}>No members match your search.</Text>
              <Text style={styles.emptyHint}>Try fewer or different criteria.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ── Result row ─────────────────────────────────────────────────────────────────
function ResultRow({ item, navigation, textField, t }) {
  // Show the matched field as the subtitle when it's not the name
  const getSubtitle = () => {
    switch (textField) {
      case 'mobile':        return item.mobile;
      case 'email':         return item.email;
      case 'member_number': return item.member_number;
      case 'occupation':    return item.occupation;
      case 'education':     return item.education;
      case 'baptism_name':  return item.baptism_name ? `Baptism: ${item.baptism_name}` : null;
      default:              return [item.member_number, item.family_ward ?? item.family_place].filter(Boolean).join(' · ');
    }
  };

  const subtitle = getSubtitle();
  const hasPhone = !!item.mobile;
  const hasEmail = !!item.email;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('MemberProfile', { memberId: item.id })}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: t.primaryLight }]}>
        <Text style={[styles.avatarText, { color: t.primary }]}>
          {item.first_name?.[0]}{item.last_name?.[0]}
        </Text>
      </View>

      {/* Text block */}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTopLine}>
          <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
          {item.status === 'inactive' && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>
        {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
        {/* Family + BCC context */}
        {!!(item.house_name || item.basic_christian_community) && (
          <Text style={styles.meta}>
            {[item.house_name, item.basic_christian_community].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {/* Quick-action icons */}
      <View style={styles.actions}>
        {hasPhone && (
          <TouchableOpacity
            hitSlop={8}
            onPress={() => Linking.openURL(`tel:${item.mobile.replace(/\s/g, '')}`).catch(() => {})}
          >
            <Ionicons name="call-outline" size={18} color={colors.success} />
          </TouchableOpacity>
        )}
        {hasEmail && (
          <TouchableOpacity
            hitSlop={8}
            onPress={() => Linking.openURL(`mailto:${item.email.trim()}`).catch(() => {})}
          >
            <Ionicons name="mail-outline" size={18} color={t.primary} />
          </TouchableOpacity>
        )}
        <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, margin: 16, marginBottom: 8,
    borderRadius: radius.sm, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.divider,
  },
  searchInput: {
    flex: 1, paddingVertical: 11, marginLeft: 8,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },

  // Text-field selector chips
  fieldRow: { flexGrow: 0, marginBottom: 8 },

  // Action row
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 4, gap: 10,
  },
  filterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.divider,
    backgroundColor: colors.white,
  },
  filterToggleText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  searchBtn: {
    flex: 1, borderRadius: radius.pill,
    paddingVertical: 9, alignItems: 'center',
  },
  searchBtnText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },

  // Filter panel
  filterPanel: {
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 14,
  },
  filterRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  filterLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.inkSoft, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  filterInput: {
    backgroundColor: colors.stone, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
    fontFamily: fonts.body, fontSize: 13, color: colors.ink,
    borderWidth: 1, borderColor: colors.divider,
  },
  clearFiltersBtn: { alignSelf: 'center', paddingVertical: 8, marginTop: 4 },
  clearFiltersText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.danger },

  // Chips
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.divider,
  },
  chipActive: {},
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
  chipTextActive: { color: colors.white },

  // Result count
  resultCount: {
    fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft,
    paddingHorizontal: 18, paddingBottom: 4,
  },

  // Result row
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 13, marginBottom: 9,
    borderWidth: 1, borderColor: colors.divider,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 14 },
  rowTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  meta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  inactiveBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  inactiveBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.danger },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 8 },
  empty: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  emptyHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
});
