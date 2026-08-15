/**
 * MemberSelfEditScreen
 *
 * Lets a signed-in member (OTP login or guest mode) update a safe subset
 * of their own profile:
 *   • Profile photo (pick from gallery or camera)
 *   • Mobile number
 *   • Email address
 *   • Occupation
 *   • Education / Qualification
 *   • Baptism name
 *   • Blood group
 *   • Marital status
 *   • Relationship to family head
 *
 * Fields that only admin can change (member_number, status, BCC unit,
 * family assignment, ward) are intentionally omitted.
 *
 * Accessible from: MemberProfileScreen → "Edit My Profile" button
 * (shown when isMyProfile AND (isGuest OR memberMode OR effectiveRole === 'member'))
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Image,
  ActionSheetIOS, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import PhoneField from '../components/PhoneField';
import EmailField from '../components/EmailField';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const MARITAL_OPTIONS = ['Single', 'Married', 'Widowed'];
const BLOOD_GROUPS    = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];

// ── Small reusable field ──────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
      />
    </View>
  );
}

// ── Chip selector ─────────────────────────────────────────────────────────────
function ChipGroup({ label, options, value, onChange, t }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[
              styles.chip,
              value === opt && { backgroundColor: t.primary, borderColor: t.primary },
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.chipText, value === opt && { color: colors.white }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Photo picker section ──────────────────────────────────────────────────────
function PhotoPicker({ photoUri, onPickImage, uploading, t }) {
  const hasPhoto = !!photoUri;
  const initials = '';   // shown only before any photo

  return (
    <View style={styles.photoPicker}>
      <TouchableOpacity
        onPress={onPickImage}
        disabled={uploading}
        activeOpacity={0.8}
        style={styles.avatarWrap}
      >
        {hasPhoto ? (
          <Image
            source={{ uri: photoUri }}
            style={[styles.avatarImg, { borderColor: t.secondary }]}
          />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: t.primaryLight, borderColor: t.secondary }]}>
            <Ionicons name="person-outline" size={36} color={t.primary} />
          </View>
        )}

        {/* Camera badge */}
        <View style={[styles.cameraBadge, { backgroundColor: t.primary }]}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="camera" size={14} color={colors.white} />
          }
        </View>
      </TouchableOpacity>

      <Text style={styles.photoHint}>
        {uploading ? 'Uploading photo…' : 'Tap photo to change'}
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MemberSelfEditScreen({ navigation }) {
  const t = useTheme();
  const { guestMember, isGuest } = useAuth();

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [memberId,  setMemberId]  = useState(null);
  const [form, setForm] = useState({
    photo:                '',
    mobile:               '',
    email:                '',
    occupation:           '',
    education:            '',
    baptism_name:         '',
    blood_group:          '',
    marital_status:       'Single',
    relationship_to_head: '',
  });

  // Load current data on mount.
  useEffect(() => {
    (async () => {
      try {
        let member;
        if (isGuest && guestMember) {
          member = guestMember;
        } else {
          member = await api.getMyProfile();
        }
        if (!member) { navigation.goBack(); return; }
        setMemberId(member.id);
        setForm({
          photo:                member.photo                || '',
          mobile:               member.mobile               || '',
          email:                member.email                || '',
          occupation:           member.occupation           || '',
          education:            member.education            || '',
          baptism_name:         member.baptism_name         || '',
          blood_group:          member.blood_group          || '',
          marital_status:       member.marital_status       || 'Single',
          relationship_to_head: member.relationship_to_head || '',
        });
      } catch (e) {
        Alert.alert('Error', e.message || 'Could not load profile.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // ── Pick photo from gallery or camera ────────────────────────────────────────
  const pickImage = async (source) => {
    const { status } = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        source === 'camera'
          ? 'Camera access is needed to take a photo.'
          : 'Photo library access is needed to pick a photo.',
      );
      return;
    }

    const pickerOpts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const { uri: localUri, mimeType } = result.assets[0];

    if (!memberId) return;
    setUploading(true);
    try {
      const publicUrl = await api.uploadMemberPhoto(memberId, localUri, mimeType);
      set('photo')(publicUrl);
      // Save the photo URL to the member row immediately.
      await api.updateMemberSelf(memberId, { photo: publicUrl });
      Alert.alert('Photo updated ✓', 'Your profile photo has been saved.');
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  // Show an action sheet on both platforms so the user can choose camera or gallery.
  const handlePickImage = () => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) pickImage('camera');
          if (idx === 1) pickImage('library');
        },
      );
    } else {
      Alert.alert('Change Photo', '', [
        { text: 'Take Photo',          onPress: () => pickImage('camera') },
        { text: 'Choose from Library', onPress: () => pickImage('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // ── Save all other fields ────────────────────────────────────────────────────
  const save = async () => {
    if (!memberId) return;
    setSaving(true);
    try {
      // photo is saved immediately on pick, so exclude it from the text-field save
      const { photo: _photo, ...rest } = form;
      await api.updateMemberSelf(memberId, rest);
      Alert.alert('Profile updated ✓', 'Your details have been saved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Edit My Profile" navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator color={t.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Edit My Profile" navigation={navigation} />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Photo picker ── */}
        <PhotoPicker
          photoUri={form.photo}
          onPickImage={handlePickImage}
          uploading={uploading}
          t={t}
        />

        {/* Info note */}
        <View style={[styles.noteCard, { backgroundColor: t.primaryLight, borderColor: t.primary + '44' }]}>
          <Ionicons name="information-circle-outline" size={15} color={t.primary} />
          <Text style={[styles.noteText, { color: t.primaryDark }]}>
            You can update your contact info, occupation, and personal details here.
            For changes to your member number or BCC unit, contact the parish office.
          </Text>
        </View>

        <PhoneField
          label="Mobile number"
          value={form.mobile}
          onChange={set('mobile')}
        />

        <EmailField
          label="Email address"
          value={form.email}
          onChange={set('email')}
        />

        <Field
          label="Occupation / Job"
          value={form.occupation}
          onChangeText={set('occupation')}
          placeholder="e.g. Teacher, Engineer"
        />

        <Field
          label="Education / Qualification"
          value={form.education}
          onChangeText={set('education')}
          placeholder="e.g. B.Tech, MBA"
        />

        <Field
          label="Baptism name"
          value={form.baptism_name}
          onChangeText={set('baptism_name')}
          placeholder="Your baptism / saint name"
        />

        <Field
          label="Relationship to family head"
          value={form.relationship_to_head}
          onChangeText={set('relationship_to_head')}
          placeholder="e.g. Son, Daughter, Spouse"
        />

        <ChipGroup
          label="Blood group"
          options={BLOOD_GROUPS}
          value={form.blood_group}
          onChange={set('blood_group')}
          t={t}
        />

        <ChipGroup
          label="Marital status"
          options={MARITAL_OPTIONS}
          value={form.marital_status}
          onChange={set('marital_status')}
          t={t}
        />

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: t.primary }, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || uploading}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <><Ionicons name="checkmark-done-outline" size={17} color={colors.white} /><Text style={styles.saveBtnText}>Save Changes</Text></>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: colors.stone },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body:   { padding: 16, paddingBottom: 40 },

  // ── Photo picker ──
  photoPicker: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImg: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  photoHint: {
    marginTop: 8,
    fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft,
  },

  // ── Info note ──
  noteCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    borderRadius: radius.md, borderWidth: 1,
    padding: 12, marginBottom: 20,
  },
  noteText: {
    flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18,
  },

  // ── Fields ──
  fieldWrap: { marginBottom: 16 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.divider,
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink },

  // ── Save button ──
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.sm,
    paddingVertical: 15, marginTop: 10,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
});
