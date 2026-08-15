import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, SectionList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import api from '../services/api';

// Reusable BCC unit picker grouped by ward.
// Props:
//   label    – field label (default "Basic Christian Community")
//   value    – currently selected BCC unit name (string)
//   onChange – called with the selected unit name
//   required – show asterisk on label
export default function BccPicker({ label = 'Basic Christian Community', value, onChange, required }) {
  const t = useTheme();
  const [units, setUnits] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.getBccUnits().then(setUnits).catch(() => {});
  }, []);

  // Group by ward for SectionList
  const wardMap = {};
  units.forEach((u) => {
    const w = u.ward || 'Ward 1';
    if (!wardMap[w]) wardMap[w] = [];
    wardMap[w].push(u);
  });
  const sections = Object.keys(wardMap).sort().map((w) => ({ title: w, data: wardMap[w] }));

  const select = (name) => { onChange(name); setOpen(false); };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity style={styles.selector} onPress={() => setOpen(true)}>
        <Text style={[styles.selectorText, !value && styles.placeholder]}>
          {value || 'Select BCC unit'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select BCC Unit</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {sections.length === 0 ? (
              <Text style={styles.empty}>No BCC units added yet. Ask a staff member to add them.</Text>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={(u) => u.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                renderSectionHeader={({ section }) => (
                  <View style={styles.sectionHeader}>
                    <Ionicons name="location-outline" size={12} color={t.primary} />
                    <Text style={[styles.sectionTitle, { color: t.primary }]}>{section.title}</Text>
                  </View>
                )}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.option, item.name === value && { backgroundColor: t.primaryLight, marginHorizontal: -16, paddingHorizontal: 16 }]}
                    onPress={() => select(item.name)}
                  >
                    <Text style={[styles.optionText, item.name === value && { fontFamily: fonts.bodySemi, color: t.primary }]}>
                      {item.name}
                    </Text>
                    {item.name === value && <Ionicons name="checkmark" size={16} color={t.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.divider },
  selectorText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, flex: 1 },
  placeholder: { color: colors.inkSoft },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.stone, paddingVertical: 7, paddingHorizontal: 0, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  option: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  empty: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, margin: 24, lineHeight: 20 },
});
