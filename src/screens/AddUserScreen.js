import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../theme/roles';

function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'none'}
      />
    </View>
  );
}

export default function AddUserScreen({ navigation }) {
  const t = useTheme();
  const { creatableRoles } = useAuth();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: creatableRoles[0] || '',
  });
  const [memberId, setMemberId] = useState(null);
  const [memberLabel, setMemberLabel] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    if (!pickerVisible) return;
    const t = setTimeout(() => {
      api.getMembers({ query: memberQuery }).then(setMemberResults);
    }, 250);
    return () => clearTimeout(t);
  }, [memberQuery, pickerVisible]);

  const canSave = form.email.trim() && form.password.length >= 8 && form.role;

  const save = async () => {
    if (!canSave) {
      Alert.alert('Missing details', 'Email, a role, and a password of at least 8 characters are required.');
      return;
    }
    setSaving(true);
    try {
      await api.createUserAccount({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        fullName: form.fullName.trim() || undefined,
        memberId: memberId || undefined,
      });
      Alert.alert('User added', `${form.email} was added as ${ROLE_LABELS[form.role]}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not add user', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (creatableRoles.length === 0) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Add User" navigation={navigation} />
        <Text style={styles.empty}>Your role doesn't have permission to add user accounts.</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Add User" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.label}>Role</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {creatableRoles.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, form.role === r && { backgroundColor: t.primary, borderColor: t.primary }]}
              onPress={() => set('role')(r)}
            >
              <Text style={[styles.chipText, form.role === r && styles.chipTextActive]}>{ROLE_LABELS[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} placeholder="Full name" autoCapitalize="words" />
        <Field label="Email" value={form.email} onChangeText={set('email')} placeholder="name@example.com" keyboardType="email-address" />
        <Field
          label="Temporary password"
          value={form.password}
          onChangeText={set('password')}
          placeholder="At least 8 characters"
          secureTextEntry
        />

        <Text style={styles.label}>Link to member record (optional)</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerVisible(true)}>
          <Text style={{ fontFamily: fonts.body, color: memberLabel ? colors.ink : colors.inkSoft }}>
            {memberLabel || 'Select an existing member'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Links this login to a family register entry (so "My Profile" shows their details). Skip this for a
          staff-only account.
        </Text>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: t.primary }, !canSave && { opacity: 0.5 }]} onPress={save} disabled={saving || !canSave}>
          <Text style={styles.saveBtnText}>{saving ? 'Adding…' : 'Add user'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.flex}>
          <ScreenHeader title="Select member" navigation={{ goBack: () => setPickerVisible(false) }} />
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or member number"
              placeholderTextColor={colors.inkSoft}
              value={memberQuery}
              onChangeText={setMemberQuery}
            />
          </View>
          <FlatList
            data={memberResults}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.memberRow}
                onPress={() => {
                  setMemberId(item.id);
                  setMemberLabel(`${item.first_name} ${item.last_name} · ${item.member_number}`);
                  setPickerVisible(false);
                }}
              >
                <Text style={styles.memberName}>{item.first_name} {item.last_name}</Text>
                <Text style={styles.memberSub}>{item.member_number}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No members match your search.</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 6, marginBottom: 14, lineHeight: 16 },
  input: { backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.divider },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.divider },
  chipActive: {},
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink },
  chipTextActive: { color: colors.white },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, marginHorizontal: 16, marginTop: 12,
    borderRadius: radius.sm, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.divider,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 8, fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  memberRow: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  memberName: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  memberSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: fonts.body, color: colors.inkSoft },
});
