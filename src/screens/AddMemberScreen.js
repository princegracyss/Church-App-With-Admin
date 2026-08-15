import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal, FlatList, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import BccPicker from '../components/BccPicker';
import PhoneField from '../components/PhoneField';
import DatePicker from '../components/DatePicker';
import api from '../services/api';

const GENDERS = ['Male', 'Female'];
const MARITAL = ['Single', 'Married', 'Widowed'];

function Field({ label, value, onChangeText, placeholder, keyboardType }) {
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
      />
    </View>
  );
}

function ChipGroup({ label, options, value, onChange, t }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} style={[styles.chip, value === opt && { backgroundColor: t.primary, borderColor: t.primary }]} onPress={() => onChange(opt)}>
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function PhotoPicker({ photoUri, onPhoto, t }) {
  const pick = async (useCamera) => {
    const permFn = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permFn();
    if (status !== 'granted') {
      Alert.alert('Permission needed', useCamera
        ? 'Camera access is required to take a photo.'
        : 'Photo library access is required.');
      return;
    }
    const launchFn = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;
    const result = await launchFn({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      onPhoto(result.assets[0].uri);
    }
  };

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.label}>Photo</Text>
      <View style={styles.photoRow}>
        <TouchableOpacity style={styles.photoBox} onPress={() => pick(false)}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="person-outline" size={30} color={colors.inkSoft} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.photoButtons}>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pick(false)}>
            <Ionicons name="images-outline" size={18} color={t.primary} />
            <Text style={[styles.photoBtnText, { color: t.primary }]}>Choose from library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pick(true)}>
            <Ionicons name="camera-outline" size={18} color={t.primary} />
            <Text style={[styles.photoBtnText, { color: t.primary }]}>Take a selfie / photo</Text>
          </TouchableOpacity>
          {photoUri && (
            <TouchableOpacity style={styles.photoBtn} onPress={() => onPhoto(null)}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.photoBtnText, { color: colors.danger }]}>Remove photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default function AddMemberScreen({ navigation, route }) {
  const t = useTheme();
  // Optional: opened from the Family screen with a family already chosen.
  const presetFamilyId = route.params?.familyId;
  const presetFamilyName = route.params?.familyName;
  // True when this screen is step 2 of the "Add Family" flow (opened right
  // after AddFamilyScreen created an empty family) — see AddFamilyScreen.
  const isHeadMember = route.params?.isHeadMember === true;

  const [families, setFamilies] = useState([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [numLoading, setNumLoading] = useState(true);

  const [form, setForm] = useState({
    family_id: presetFamilyId || '',
    family_label: presetFamilyName || '',
    member_number: '',
    first_name: '',
    last_name: '',
    gender: 'Male',
    date_of_birth: '',
    mobile: '',
    relationship_to_head: isHeadMember ? 'Head of Family' : '',
    baptism_name: '',
    marital_status: 'Single',
    basic_christian_community: '',
  });

  useEffect(() => {
    if (!presetFamilyId) api.getFamilies().then(setFamilies);
    // Show a non-consuming preview of the next number — the real number is
    // fetched from the sequence only at save time so cancelling doesn't waste numbers.
    api.peekNextMemberNumber()
      .then((num) => setForm((f) => ({ ...f, member_number: num })))
      .catch(() => {})
      .finally(() => setNumLoading(false));
  }, [presetFamilyId]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const canSave = form.family_id && form.first_name && form.last_name && form.member_number;

  const save = async () => {
    if (!canSave) {
      Alert.alert('Missing details', 'Family, member number, first name and last name are required.');
      return;
    }
    setSaving(true);
    try {
      // Strip UI-only keys that have no matching DB column.
      const { family_label, ...rest } = form;
      // Map photo_uri → photo (the actual column name in the members table).
      const { basic_christian_community, ...dto } = rest;
      if (basic_christian_community) dto.basic_christian_community = basic_christian_community;
      if (isHeadMember) dto.is_family_head = true;
      if (photoUri) dto.photo = photoUri;  // column is `photo`, not `photo_uri`
      // Replace the preview number with the real sequence value right before insert.
      // This is the only point that consumes the sequence, so cancelling never wastes a number.
      dto.member_number = await api.nextMemberNumber();
      // Show the confirmed number in the UI before the success alert.
      setForm((f) => ({ ...f, member_number: dto.member_number }));
      const member = await api.createMember(dto);

      if (isHeadMember) {
        try {
          await api.setFamilyHead(presetFamilyId, member.id);
        } catch (linkError) {
          Alert.alert(
            'Member added, but not linked',
            `${form.first_name} ${form.last_name} was added, but couldn't be set as head of family: ${linkError.message}. You can link them from the Family List.`,
            [{ text: 'OK', onPress: () => navigation.navigate('FamilyList') }],
          );
          return;
        }
        Alert.alert('Family set up', `${form.first_name} ${form.last_name} is now the head of ${presetFamilyName}.`, [
          { text: 'OK', onPress: () => navigation.replace('Family', { familyId: presetFamilyId }) },
        ]);
        return;
      }

      Alert.alert('Member added', `${form.first_name} ${form.last_name} was added to the family register.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not add member', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title={isHeadMember ? 'Add Head of Family' : 'Add Member'} navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>

        {/* Photo */}
        <PhotoPicker photoUri={photoUri} onPhoto={setPhotoUri} t={t} />

        {/* Family */}
        <Text style={styles.label}>Family</Text>
        {presetFamilyId ? (
          <View style={[styles.input, { backgroundColor: t.primaryLight }]}>
            <Text style={{ fontFamily: fonts.body, color: colors.ink }}>{presetFamilyName}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.input} onPress={() => setPickerVisible(true)}>
            <Text style={{ fontFamily: fonts.body, color: form.family_label ? colors.ink : colors.inkSoft }}>
              {form.family_label || 'Select a family'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 14 }} />
        {/* Member number — pre-filled from server sequence; still editable */}
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.label}>Member number *</Text>
          <View style={styles.memberNumRow}>
            {numLoading
              ? <ActivityIndicator size="small" color={t.primary} style={{ marginRight: 8 }} />
              : null}
            <TextInput
              style={[styles.input, styles.memberNumInput]}
              value={form.member_number}
              onChangeText={set('member_number')}
              placeholder="Auto-generating…"
              placeholderTextColor={colors.inkSoft}
            />
          </View>
        </View>
        <Field label="First name" value={form.first_name} onChangeText={set('first_name')} placeholder="First name" />
        <Field label="Last name" value={form.last_name} onChangeText={set('last_name')} placeholder="Last name" />
        <ChipGroup label="Gender" options={GENDERS} value={form.gender} onChange={set('gender')} t={t} />
        <DatePicker label="Date of birth" value={form.date_of_birth} onChange={set('date_of_birth')} maxDate={new Date().toISOString().slice(0,10)} />
        <PhoneField label="Mobile (used for OTP login)" value={form.mobile} onChange={set('mobile')} />
        <Field label="Relationship to head" value={form.relationship_to_head} onChangeText={set('relationship_to_head')} placeholder="e.g. Son, Daughter, Spouse" />
        <Field label="Baptism name" value={form.baptism_name} onChangeText={set('baptism_name')} placeholder="Baptism name" />
        <ChipGroup label="Marital status" options={MARITAL} value={form.marital_status} onChange={set('marital_status')} t={t} />
        <BccPicker value={form.basic_christian_community} onChange={set('basic_christian_community')} />

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: t.primary }, !canSave && { opacity: 0.5 }]} onPress={save} disabled={saving || !canSave}>
          <Text style={styles.saveBtnText}>
            {saving ? 'Adding…' : isHeadMember ? 'Add head of family' : 'Add member'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.flex}>
          <ScreenHeader title="Select family" navigation={{ goBack: () => setPickerVisible(false) }} />
          <FlatList
            data={families}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.familyRow}
                onPress={() => {
                  setForm((f) => ({ ...f, family_id: item.id, family_label: `${item.house_name} · ${item.family_code}` }));
                  setPickerVisible(false);
                }}
              >
                <Text style={styles.familyName}>{item.house_name}</Text>
                <Text style={styles.familyCode}>{item.family_code} · {item.place}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.inkSoft, marginTop: 40 }}>No families yet.</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.divider },
  inputDisabled: {},
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.divider },
  chipActive: {},
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink },
  chipTextActive: { color: colors.white },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
  familyRow: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  familyName: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink },
  familyCode: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  memberNumRow: { flexDirection: 'row', alignItems: 'center' },
  memberNumInput: { flex: 1 },
  // Photo picker
  photoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  photoBox: { width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: colors.divider, overflow: 'hidden', borderStyle: 'dashed', backgroundColor: colors.white },
  photoImage: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoButtons: { flex: 1, gap: 8, justifyContent: 'center' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
});
