import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Image, Modal, FlatList, Switch, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors as defaultColors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import { useParish } from '../context/ParishContext';
import api from '../services/api';

// A curated palette of swatches for the color picker.
const SWATCHES = [
  '#6B1E3C', '#4E1530', '#8A2E52', // burgundy family
  '#1A3A5C', '#1E5C8A', '#2E7AB5', // navy/blue
  '#1A4731', '#2E7A4F', '#3F9A6B', // forest green
  '#5C3A1A', '#8A5C2E', '#B57A3F', // brown/amber
  '#4A1A5C', '#7A2E8A', '#9A3FB5', // purple
  '#5C1A1A', '#8A2E2E', '#B54040', // crimson
  '#1A4A4A', '#2E7A7A', '#3F9A9A', // teal
  '#2A2A2A', '#555555', '#888888', // grays
  '#C9A24B', '#E8D5A0', '#FFD700', // golds
  '#FFFFFF', '#F2E9DE', '#FBF7F1', // creams
];

function ColorPickerModal({ visible, current, onSelect, onClose, title }) {
  const [hex, setHex] = useState(current);

  // Validate and normalise a hex string
  const normalise = (v) => {
    const clean = v.trim().replace(/^#+/, '');
    return `#${clean}`;
  };

  const confirm = () => {
    const val = normalise(hex);
    if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
      Alert.alert('Invalid colour', 'Enter a 6-character hex code, e.g. #6B1E3C');
      return;
    }
    onSelect(val);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cpStyles.backdrop}>
        <View style={cpStyles.sheet}>
          <Text style={cpStyles.title}>{title}</Text>

          {/* Swatch grid */}
          <FlatList
            data={SWATCHES}
            keyExtractor={(c) => c}
            numColumns={6}
            scrollEnabled={false}
            contentContainerStyle={cpStyles.swatchGrid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[cpStyles.swatch, { backgroundColor: item }, item === current && cpStyles.swatchSelected]}
                onPress={() => { setHex(item); onSelect(item); onClose(); }}
              />
            )}
          />

          {/* Manual hex input */}
          <Text style={cpStyles.hexLabel}>Or enter a hex code</Text>
          <View style={cpStyles.hexRow}>
            <View style={[cpStyles.preview, { backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(normalise(hex)) ? normalise(hex) : '#ccc' }]} />
            <TextInput
              style={cpStyles.hexInput}
              value={hex}
              onChangeText={setHex}
              placeholder="#6B1E3C"
              placeholderTextColor={defaultColors.inkSoft}
              autoCapitalize="none"
              maxLength={7}
            />
            <TouchableOpacity style={cpStyles.hexConfirm} onPress={confirm}>
              <Text style={cpStyles.hexConfirmText}>Apply</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={cpStyles.closeBtn} onPress={onClose}>
            <Text style={cpStyles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ParishSettingsScreen({ navigation }) {
  const { settings, updateSettings } = useParish();

  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description);
  // logoUri can be:
  //   • null                     — no logo
  //   • 'file:///...'            — freshly picked, not yet uploaded
  //   • 'https://...'            — already uploaded / loaded from DB
  const [logoUri, setLogoUri] = useState(settings.logoUri);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(settings.secondaryColor);
  const [accentColor, setAccentColor] = useState(settings.accentColor || '#2E7A4F');
  const [memberOtpEnabled, setMemberOtpEnabled] = useState(!!settings.memberOtpEnabled);
  const [primaryPickerOpen, setPrimaryPickerOpen] = useState(false);
  const [secondaryPickerOpen, setSecondaryPickerOpen] = useState(false);
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to pick a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const removeLogo = () => {
    Alert.alert('Remove logo', 'Remove the current parish logo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setLogoUri(null) },
    ]);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Parish name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      let finalLogoUri = logoUri;

      // If the logo is a local file URI (freshly picked), upload it to
      // Supabase Storage so every device gets the same public HTTPS URL.
      if (logoUri && logoUri.startsWith('file://')) {
        setUploading(true);
        try {
          finalLogoUri = await api.uploadParishLogo(logoUri);
          setLogoUri(finalLogoUri); // update local state to the remote URL
        } catch (e) {
          setUploading(false);
          setSaving(false);
          Alert.alert('Upload failed', `Could not upload the logo: ${e.message}`);
          return;
        }
        setUploading(false);
      }

      await updateSettings({
        name: name.trim(),
        description: description.trim(),
        logoUri: finalLogoUri,
        primaryColor,
        secondaryColor,
        accentColor,
        memberOtpEnabled,
      });

      Alert.alert('Saved', 'Parish settings updated. All devices will reflect the changes immediately.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Parish Settings" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Logo */}
        <Text style={styles.sectionLabel}>Church Logo</Text>
        <View style={styles.logoRow}>
          <TouchableOpacity style={[styles.logoBox, logoUri && styles.logoBoxFilled]} onPress={pickLogo}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={28} color={defaultColors.inkSoft} />
                <Text style={styles.logoHint}>Tap to pick</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.logoActions}>
            <TouchableOpacity style={styles.logoBtn} onPress={pickLogo}>
              <Ionicons name="folder-open-outline" size={16} color={primaryColor} />
              <Text style={[styles.logoBtnText, { color: primaryColor }]}>Choose from library</Text>
            </TouchableOpacity>
            {logoUri && (
              <TouchableOpacity style={styles.logoBtn} onPress={removeLogo}>
                <Ionicons name="trash-outline" size={16} color={defaultColors.danger} />
                <Text style={[styles.logoBtnText, { color: defaultColors.danger }]}>Remove logo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Name */}
        <Text style={styles.sectionLabel}>Parish Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Parish name"
          placeholderTextColor={defaultColors.inkSoft}
        />

        {/* Description */}
        <Text style={styles.sectionLabel}>Description / Sub-heading</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={description}
          onChangeText={setDescription}
          placeholder="Diocese, location, or tagline"
          placeholderTextColor={defaultColors.inkSoft}
          multiline
          numberOfLines={2}
        />

        {/* Primary colour */}
        <Text style={styles.sectionLabel}>Primary Colour</Text>
        <Text style={styles.colorNote}>Used for headers, buttons, and active states throughout the app.</Text>
        <TouchableOpacity style={styles.colorRow} onPress={() => setPrimaryPickerOpen(true)}>
          <View style={[styles.colorSwatch, { backgroundColor: primaryColor }]} />
          <Text style={styles.colorHex}>{primaryColor}</Text>
          <Ionicons name="chevron-forward" size={18} color={defaultColors.inkSoft} />
        </TouchableOpacity>

        {/* Secondary colour */}
        <Text style={styles.sectionLabel}>Secondary / Highlight Colour</Text>
        <Text style={styles.colorNote}>Used for parish name text, icon highlights in the header.</Text>
        <TouchableOpacity style={styles.colorRow} onPress={() => setSecondaryPickerOpen(true)}>
          <View style={[styles.colorSwatch, { backgroundColor: secondaryColor }]} />
          <Text style={styles.colorHex}>{secondaryColor}</Text>
          <Ionicons name="chevron-forward" size={18} color={defaultColors.inkSoft} />
        </TouchableOpacity>

        {/* Accent colour */}
        <Text style={styles.sectionLabel}>Accent / Icon Colour</Text>
        <Text style={styles.colorNote}>Used for dashboard icons, notification dots, and badges throughout the app.</Text>
        <TouchableOpacity style={styles.colorRow} onPress={() => setAccentPickerOpen(true)}>
          <View style={[styles.colorSwatch, { backgroundColor: accentColor }]} />
          <Text style={styles.colorHex}>{accentColor}</Text>
          <Ionicons name="chevron-forward" size={18} color={defaultColors.inkSoft} />
        </TouchableOpacity>

        {/* Member Login */}
        <Text style={styles.sectionLabel}>Member Login</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Enable OTP login for members</Text>
            <Text style={styles.toggleSub}>
              When on, members can sign in using a one-time code sent to their registered phone or email.
            </Text>
          </View>
          <Switch
            value={memberOtpEnabled}
            onValueChange={(val) => {
              if (val) {
                Alert.alert(
                  'Enable OTP login?',
                  'Members will be able to sign in using a one-time code sent to their registered phone or email. Make sure Supabase SMS/email is configured before turning this on.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Enable', onPress: () => setMemberOtpEnabled(true) },
                  ],
                );
              } else {
                setMemberOtpEnabled(false);
              }
            }}
            trackColor={{ false: defaultColors.divider, true: defaultColors.success }}
            thumbColor={defaultColors.white}
          />
        </View>

        {/* Preview strip */}
        <Text style={styles.sectionLabel}>Preview</Text>
        {/* Header bar preview */}
        <View style={[styles.previewCard, { backgroundColor: primaryColor }]}>
          <View style={[styles.previewBadge, { backgroundColor: secondaryColor }]} />
          <View style={styles.previewTextWrap}>
            <Text style={[styles.previewName, { color: defaultColors.white }]} numberOfLines={1}>{name || 'Parish name'}</Text>
            <Text style={[styles.previewSub, { color: secondaryColor }]} numberOfLines={1}>{description || 'Description'}</Text>
          </View>
        </View>
        {/* Dashboard tile preview */}
        <View style={styles.previewTiles}>
          {['notifications', 'people', 'calendar', 'flag', 'ribbon'].map((ic) => (
            <View key={ic} style={styles.previewTile}>
              <View style={[styles.previewTileRing, { backgroundColor: accentColor + '22' }]}>
                <Ionicons name={ic} size={20} color={accentColor} />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.previewCaption}>← Dashboard icons use the Accent colour</Text>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: primaryColor }, (saving || uploading) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving || uploading}
        >
          {(saving || uploading) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={defaultColors.white} />
              <Text style={styles.saveBtnText}>{uploading ? 'Uploading logo…' : 'Saving…'}</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Save settings</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ColorPickerModal
        visible={primaryPickerOpen}
        current={primaryColor}
        title="Primary Colour"
        onSelect={setPrimaryColor}
        onClose={() => setPrimaryPickerOpen(false)}
      />
      <ColorPickerModal
        visible={secondaryPickerOpen}
        current={secondaryColor}
        title="Secondary / Highlight Colour"
        onSelect={setSecondaryColor}
        onClose={() => setSecondaryPickerOpen(false)}
      />
      <ColorPickerModal
        visible={accentPickerOpen}
        current={accentColor}
        title="Accent / Icon Colour"
        onSelect={setAccentColor}
        onClose={() => setAccentPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: defaultColors.stone },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: defaultColors.inkSoft, marginBottom: 4, marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorNote: { fontFamily: fonts.body, fontSize: 11.5, color: defaultColors.inkSoft, marginBottom: 8, lineHeight: 16 },
  input: { backgroundColor: defaultColors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: defaultColors.ink, borderWidth: 1, borderColor: defaultColors.divider },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoBox: { width: 80, height: 80, borderRadius: radius.md, borderWidth: 1.5, borderColor: defaultColors.divider, borderStyle: 'dashed', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: defaultColors.white },
  logoBoxFilled: { borderStyle: 'solid', borderColor: defaultColors.divider },
  logoImage: { width: '100%', height: '100%' },
  logoPlaceholder: { alignItems: 'center', gap: 4 },
  logoHint: { fontFamily: fonts.body, fontSize: 10, color: defaultColors.inkSoft },
  logoActions: { flex: 1, gap: 8 },
  logoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  colorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: defaultColors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: defaultColors.divider, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  colorSwatch: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  colorHex: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: defaultColors.ink },
  previewCard: { borderRadius: radius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  previewBadge: { width: 36, height: 36, borderRadius: 18 },
  previewTextWrap: { flex: 1 },
  previewName: { fontFamily: fonts.display, fontSize: 15 },
  previewSub: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  previewTiles: { flexDirection: 'row', gap: 10, backgroundColor: defaultColors.white, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: defaultColors.divider },
  previewTile: { alignItems: 'center', justifyContent: 'center' },
  previewTileRing: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  previewCaption: { fontFamily: fonts.body, fontSize: 11, color: defaultColors.inkSoft, textAlign: 'center', marginTop: 6, marginBottom: 4 },
  saveBtn: { borderRadius: radius.sm, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: defaultColors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: defaultColors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: defaultColors.divider, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  toggleTitle: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: defaultColors.ink, marginBottom: 3 },
  toggleSub: { fontFamily: fonts.body, fontSize: 12, color: defaultColors.inkSoft, lineHeight: 17 },
});

const cpStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: defaultColors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: defaultColors.ink, marginBottom: 14, textAlign: 'center' },
  swatchGrid: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  swatch: { width: 42, height: 42, borderRadius: 8, margin: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  swatchSelected: { borderWidth: 3, borderColor: defaultColors.ink },
  hexLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: defaultColors.inkSoft, marginBottom: 8 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  preview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  hexInput: { flex: 1, backgroundColor: defaultColors.stone, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.body, fontSize: 14, color: defaultColors.ink, borderWidth: 1, borderColor: defaultColors.divider },
  hexConfirm: { backgroundColor: defaultColors.burgundy, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10 },
  hexConfirmText: { color: defaultColors.white, fontFamily: fonts.bodySemi, fontSize: 13 },
  closeBtn: { alignItems: 'center', paddingVertical: 10 },
  closeBtnText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: defaultColors.inkSoft },
});
