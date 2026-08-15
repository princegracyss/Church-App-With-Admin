import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Image, ActivityIndicator, Platform, ActionSheetIOS,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import BccPicker from '../components/BccPicker';
import PhoneField from '../components/PhoneField';
import EmailField from '../components/EmailField';
import DatePicker from '../components/DatePicker';
import api from '../services/api';

const GENDERS = ['Male', 'Female'];
const MARITAL = ['Single', 'Married', 'Widowed'];
const STATUS = ['active', 'inactive'];

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
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} style={[styles.chip, value === opt && { backgroundColor: t.primary, borderColor: t.primary }]} onPress={() => onChange(opt)}>
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const BLANK = {
  member_number: '', first_name: '', last_name: '', gender: 'Male', date_of_birth: '',
  blood_group: '', mobile: '', email: '', occupation: '', education: '',
  relationship_to_head: '', baptism_name: '', marital_status: 'Single', status: 'active',
  basic_christian_community: '', photo: '',
};

export default function EditMemberScreen({ route, navigation }) {
  const t = useTheme();
  const memberId = route.params?.memberId;
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [familyLabel,   setFamilyLabel]   = useState('');
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    api.getMember(memberId).then((m) => {
      if (!m) return;
      setForm({
        member_number:             m.member_number             || '',
        first_name:                m.first_name                || '',
        last_name:                 m.last_name                 || '',
        gender:                    m.gender                    || 'Male',
        date_of_birth:             m.date_of_birth             || '',
        blood_group:               m.blood_group               || '',
        mobile:                    m.mobile                    || '',
        email:                     m.email                     || '',
        occupation:                m.occupation                || '',
        education:                 m.education                 || '',
        relationship_to_head:      m.relationship_to_head      || '',
        baptism_name:              m.baptism_name              || '',
        marital_status:            m.marital_status            || 'Single',
        status:                    m.status                    || 'active',
        basic_christian_community: m.basic_christian_community || '',
        photo:                     m.photo                     || '',
      });
      setLoading(false);
      if (m.family_id) {
        api.getFamily(m.family_id).then((f) => setFamilyLabel(f ? `${f.house_name} · ${f.family_code}` : ''));
      }
    });
  }, [memberId]);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // ── Photo pick + upload ───────────────────────────────────────────────────
  const pickPhoto = async (source) => {
    const { status } = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required',
        source === 'camera' ? 'Camera access is needed.' : 'Photo library access is needed.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploading(true);
    try {
      const publicUrl = await api.uploadMemberPhoto(memberId, result.assets[0].uri);
      await api.updateMember(memberId, { photo: publicUrl });
      set('photo')(publicUrl);
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickPhoto = () => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (idx) => { if (idx === 0) pickPhoto('camera'); if (idx === 1) pickPhoto('library'); },
      );
    } else {
      Alert.alert('Change Photo', '', [
        { text: 'Take Photo',          onPress: () => pickPhoto('camera') },
        { text: 'Choose from Library', onPress: () => pickPhoto('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const canSave = form.first_name && form.last_name && form.member_number;

  const save = async () => {
    if (!canSave) {
      Alert.alert('Missing details', 'Member number, first name and last name are required.');
      return;
    }
    setSaving(true);
    try {
      // photo is saved immediately on pick; exclude it to avoid re-saving stale URL
      const { photo: _photo, ...rest } = form;
      await api.updateMember(memberId, rest);
      Alert.alert('Changes saved', `${form.first_name} ${form.last_name}'s details were updated.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save changes', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.flex}><ScreenHeader title="Edit Member" navigation={navigation} /></View>;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Edit Member" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">

        {/* ── Profile photo ── */}
        <View style={styles.photoSection}>
          <TouchableOpacity
            onPress={handlePickPhoto}
            disabled={uploading}
            activeOpacity={0.8}
            style={styles.avatarWrap}
          >
            {form.photo ? (
              <Image source={{ uri: form.photo }} style={[styles.avatarImg, { borderColor: t.secondary }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: t.primaryLight, borderColor: t.secondary }]}>
                <Ionicons name="person-outline" size={34} color={t.primary} />
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: t.primary }]}>
              {uploading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Ionicons name="camera" size={13} color={colors.white} />
              }
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>{uploading ? 'Uploading…' : 'Tap to change photo'}</Text>
        </View>

        {!!familyLabel && (
          <>
            <Text style={styles.label}>Family</Text>
            <View style={[styles.input, { backgroundColor: t.primaryLight }]}>
              <Text style={{ fontFamily: fonts.body, color: colors.ink }}>{familyLabel}</Text>
            </View>
            <View style={{ height: 14 }} />
          </>
        )}
        <Field label="Member number" value={form.member_number} onChangeText={set('member_number')} placeholder="e.g. MEM-1003" />
        <Field label="First name" value={form.first_name} onChangeText={set('first_name')} placeholder="First name" />
        <Field label="Last name" value={form.last_name} onChangeText={set('last_name')} placeholder="Last name" />
        <ChipGroup label="Gender" options={GENDERS} value={form.gender} onChange={set('gender')} t={t} />
        <DatePicker label="Date of birth" value={form.date_of_birth} onChange={set('date_of_birth')} maxDate={new Date().toISOString().slice(0,10)} />
        <Field label="Blood group" value={form.blood_group} onChangeText={set('blood_group')} placeholder="e.g. O+" />
        <PhoneField label="Mobile (used for OTP login)" value={form.mobile} onChange={set('mobile')} />
        <EmailField label="Email" value={form.email} onChange={set('email')} />
        <Field label="Occupation" value={form.occupation} onChangeText={set('occupation')} placeholder="Occupation" />
        <Field label="Education" value={form.education} onChangeText={set('education')} placeholder="Education" />
        <Field label="Relationship to head" value={form.relationship_to_head} onChangeText={set('relationship_to_head')} placeholder="e.g. Son, Daughter, Spouse" />
        <Field label="Baptism name" value={form.baptism_name} onChangeText={set('baptism_name')} placeholder="Baptism name" />
        <ChipGroup label="Marital status" options={MARITAL} value={form.marital_status} onChange={set('marital_status')} t={t} />
        <ChipGroup label="Status" options={STATUS} value={form.status} onChange={set('status')} t={t} />
        <BccPicker value={form.basic_christian_community} onChange={set('basic_christian_community')} />

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: t.primary }, !canSave && { opacity: 0.5 }]} onPress={save} disabled={saving || !canSave}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // ── Photo picker ──
  photoSection: { alignItems: 'center', paddingVertical: 20, marginBottom: 12 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 2 },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  photoHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 8 },

  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.ink, borderWidth: 1, borderColor: colors.divider },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.divider },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink },
  chipTextActive: { color: colors.white },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center', marginTop: 10, marginBottom: 30 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
});
