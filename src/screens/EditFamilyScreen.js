import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import BccPicker from '../components/BccPicker';
import api from '../services/api';

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value ?? ''}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.inkSoft}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export default function EditFamilyScreen({ route, navigation }) {
  const t = useTheme();
  const { familyId } = route.params ?? {};

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [houseName,    setHouseName]    = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [place,        setPlace]        = useState('');
  const [district,     setDistrict]     = useState('');
  const [state,        setState]        = useState('');
  const [pincode,      setPincode]      = useState('');
  const [phone,        setPhone]        = useState('');
  const [email,        setEmail]        = useState('');
  const [ward,         setWard]         = useState('');
  const [bcc,          setBcc]          = useState('');

  // ── Load existing data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!familyId) { setLoading(false); return; }
    api.getFamily(familyId)
      .then((f) => {
        if (!f) return;
        setHouseName(f.house_name ?? '');
        setAddressLine1(f.address_line1 ?? '');
        setAddressLine2(f.address_line2 ?? '');
        setPlace(f.place ?? '');
        setDistrict(f.district ?? '');
        setState(f.state ?? '');
        setPincode(f.pincode ?? '');
        setPhone(f.phone ?? '');
        setEmail(f.email ?? '');
        setWard(f.ward ?? '');
        setBcc(f.basic_christian_community ?? '');
      })
      .catch(() => Alert.alert('Error', 'Could not load family details.'))
      .finally(() => setLoading(false));
  }, [familyId]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!houseName.trim()) {
      Alert.alert('Required', 'House / family name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await api.updateFamily(familyId, {
        house_name:               houseName.trim()    || null,
        address_line1:            addressLine1.trim() || null,
        address_line2:            addressLine2.trim() || null,
        place:                    place.trim()        || null,
        district:                 district.trim()     || null,
        state:                    state.trim()        || null,
        pincode:                  pincode.trim()      || null,
        phone:                    phone.trim()        || null,
        email:                    email.trim()        || null,
        ward:                     ward.trim()         || null,
        basic_christian_community: bcc               || null,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Edit Family" navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Edit Family" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionLabel}>IDENTIFICATION</Text>
        <Field label="House / Family Name *" value={houseName} onChangeText={setHouseName} placeholder="e.g. The Mathew House" />
        <Field label="Ward" value={ward} onChangeText={setWard} placeholder="e.g. Ward 1" />

        <Text style={styles.sectionLabel}>BCC UNIT</Text>
        <BccPicker value={bcc} onChange={setBcc} placeholder="Select BCC unit" />

        <Text style={styles.sectionLabel}>ADDRESS</Text>
        <Field label="Address Line 1" value={addressLine1} onChangeText={setAddressLine1} placeholder="Street / House No." />
        <Field label="Address Line 2" value={addressLine2} onChangeText={setAddressLine2} placeholder="Landmark / Area" />
        <Field label="Place / City"   value={place}        onChangeText={setPlace}        placeholder="e.g. Kalamassery" />
        <Field label="District"       value={district}     onChangeText={setDistrict}      placeholder="e.g. Ernakulam" />
        <Field label="State"          value={state}        onChangeText={setState}         placeholder="e.g. Kerala" />
        <Field label="Pincode"        value={pincode}      onChangeText={setPincode}       placeholder="e.g. 683104" keyboardType="number-pad" />

        <Text style={styles.sectionLabel}>CONTACT</Text>
        <Field label="Phone"  value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />
        <Field label="Email"  value={email} onChangeText={setEmail} placeholder="family@example.com" keyboardType="email-address" />

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: t.primary }, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.white} />
            : <><Ionicons name="checkmark" size={18} color={colors.white} /><Text style={styles.saveBtnText}>Save changes</Text></>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: colors.stone },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  sectionLabel: {
    fontFamily: fonts.bodySemi, fontSize: 11, color: colors.inkSoft,
    letterSpacing: 0.6, marginTop: 18, marginBottom: 6, marginLeft: 2,
  },

  fieldWrap: { marginBottom: 12 },
  label:     { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 5 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 13, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.sm, paddingVertical: 14, marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white },
});
