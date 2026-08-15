import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet,
  TouchableOpacity, Alert, Linking, Modal, TextInput,
  FlatList, ActivityIndicator, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils/date';
import { ROLE_LABELS } from '../theme/roles';

// ── Reusable row components ───────────────────────────────────────────────────

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function PhoneRow({ label, value }) {
  const t = useTheme();
  if (!value) return null;
  const dial = () => Linking.openURL(`tel:${value.replace(/\s/g, '')}`).catch(() => {});
  return (
    <TouchableOpacity style={styles.infoRow} onPress={dial} activeOpacity={0.7}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.contactVal}>
        <Text style={[styles.infoValue, { color: t.primary }]}>{value}</Text>
        <Ionicons name="call-outline" size={13} color={colors.success} style={{ marginLeft: 5 }} />
      </View>
    </TouchableOpacity>
  );
}

function EmailRow({ label, value }) {
  const t = useTheme();
  if (!value) return null;
  const mail = () => Linking.openURL(`mailto:${value.trim()}`).catch(() => {});
  return (
    <TouchableOpacity style={styles.infoRow} onPress={mail} activeOpacity={0.7}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.contactVal}>
        <Text style={[styles.infoValue, { color: t.primary }]}>{value}</Text>
        <Ionicons name="mail-outline" size={13} color={t.primary} style={{ marginLeft: 5 }} />
      </View>
    </TouchableOpacity>
  );
}

// Section renders a card. hasContent must be passed explicitly (boolean of
// whether any values are non-empty) because React.Children.toArray cannot
// inspect the runtime render output of child components.
function Section({ title, icon, children, hasContent, onAdd, addLabel }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={colors.inkSoft} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>
        {hasContent
          ? children
          : onAdd
            ? (
              <TouchableOpacity style={styles.addPromptRow} onPress={onAdd} activeOpacity={0.75}>
                <Ionicons name="add-circle-outline" size={16} color={colors.inkSoft} />
                <Text style={styles.addPromptText}>{addLabel || `Add ${title.toLowerCase()} details`}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
              </TouchableOpacity>
            )
            : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No details available</Text>
              </View>
            )
        }
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MemberProfileScreen({ route, navigation }) {
  const { isAdmin, isStaffAccount, guestMember, isGuest, isUnitAdmin, user } = useAuth();
  const t = useTheme();
  const memberId = route.params?.memberId;
  const isSelf   = route.params?.isSelf ?? false;
  const [member,  setMember]  = useState(null);
  const [loading, setLoading] = useState(true);
  const isMyProfile = !memberId || isSelf;

  // ── Linked login account (staff view) ────────────────────────────────────
  const [linkedProfile,  setLinkedProfile]  = useState(undefined);
  const [linkModalOpen,  setLinkModalOpen]  = useState(false);
  const [allUsers,       setAllUsers]       = useState([]);
  const [linkFilter,     setLinkFilter]     = useState('');
  const [linkBusy,       setLinkBusy]       = useState(false);

  // ── Family linking (admin view) ───────────────────────────────────────────
  const [linkedFamily,    setLinkedFamily]    = useState(null);
  const [familyModalOpen, setFamilyModalOpen] = useState(false);
  const [allFamilies,     setAllFamilies]     = useState([]);
  const [familyFilter,    setFamilyFilter]    = useState('');
  const [familyBusy,      setFamilyBusy]      = useState(false);

  // ── Photo upload (self view only) ─────────────────────────────────────────
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async (source) => {
    const { status } = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required',
        source === 'camera' ? 'Camera access is needed.' : 'Photo library access is needed.');
      return;
    }
    const pickerOpts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);
    if (result.canceled || !result.assets?.[0]?.uri) return;
    if (!member?.id) return;
    setUploading(true);
    try {
      const publicUrl = await api.uploadMemberPhoto(member.id, result.assets[0].uri, result.assets[0].mimeType);
      await api.updateMemberSelf(member.id, { photo: publicUrl });
      setMember((prev) => ({ ...prev, photo: publicUrl }));
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoPress = () => {
    if (Platform.OS === 'ios') {
      const { ActionSheetIOS } = require('react-native');
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 },
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

  // ── Load member + family + linked profile ─────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    if (isSelf && isGuest) {
      setMember(guestMember);
      // guestMember comes from lookup_member_for_login which only returns
      // login-safe fields — family_id is not included. Use the guest RPC
      // (guest_get_my_family) which looks up by member id directly.
      api.getFamily(guestMember?.id)
        .then((f) => setLinkedFamily(f ?? null))
        .catch(() => setLinkedFamily(null))
        .finally(() => setLoading(false));
      return;
    }

    // isSelf: use the security-definer RPC so the query always works
    // regardless of whether profiles.member_id is linked via RLS.
    // For other members (admin viewing someone else), use getMember().
    (isSelf ? api.getMyProfile() : memberId ? api.getMember(memberId) : api.getMyProfile())
      .then((m) => {
        setMember(m);
        if (m?.family_id) {
          api.getFamily(m.family_id)
            .then((f) => setLinkedFamily(f))
            .catch(() => setLinkedFamily(null));
        } else {
          setLinkedFamily(null);
        }
      })
      .catch(() => setMember(null))
      .finally(() => setLoading(false));

    if (isStaffAccount && memberId) {
      setLinkedProfile(undefined);
      api.getProfileByMemberId(memberId)
        .then(setLinkedProfile)
        .catch(() => setLinkedProfile(null));
    }
  }, [memberId, isSelf, isGuest, guestMember, isStaffAccount]);

  useEffect(() => {
    load();                                          // fire immediately on mount
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // ── Remove member ─────────────────────────────────────────────────────────
  const remove = () => {
    Alert.alert(
      'Remove member',
      `Remove ${member.first_name} ${member.last_name} from the active register?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive',
          onPress: async () => { await api.deleteMember(member.id); navigation.goBack(); } },
      ],
    );
  };

  // ── Family-link helpers ───────────────────────────────────────────────────
  const openFamilyModal = async () => {
    setFamilyFilter('');
    try {
      const families = await api.getFamilies();
      setAllFamilies(families);
    } catch (_) { setAllFamilies([]); }
    setFamilyModalOpen(true);
  };
  const closeFamilyModal = () => {
    setFamilyModalOpen(false);
    setFamilyFilter('');
    setAllFamilies([]);
  };

  const filteredFamilies = familyFilter.trim()
    ? allFamilies.filter((f) => {
        const q = familyFilter.trim().toLowerCase();
        return f.house_name?.toLowerCase().includes(q) || f.family_code?.toLowerCase().includes(q);
      })
    : allFamilies;

  const confirmLinkFamily = (family) => {
    Alert.alert(
      'Link family',
      `Link ${member.first_name} ${member.last_name} to "${family.house_name || family.family_code}" (${family.family_code})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: async () => {
          setFamilyBusy(true);
          try {
            await api.updateMember(memberId, { family_id: family.id });
            closeFamilyModal();
            load();
          } catch (e) {
            Alert.alert('Could not link', e.message || 'Something went wrong.');
          } finally { setFamilyBusy(false); }
        }},
      ],
    );
  };

  // ── Login-account helpers ─────────────────────────────────────────────────
  const openLinkModal = async () => {
    setLinkFilter('');
    try {
      const users = await api.getUsers();
      setAllUsers(users);
    } catch (_) { setAllUsers([]); }
    setLinkModalOpen(true);
  };
  const closeLinkModal = () => {
    setLinkModalOpen(false);
    setLinkFilter('');
    setAllUsers([]);
  };

  const filteredUsers = linkFilter.trim()
    ? allUsers.filter((u) => {
        const q = linkFilter.trim().toLowerCase();
        if (u.username?.toLowerCase().includes(q)) return true;
        const m = u.members;
        if (m?.first_name?.toLowerCase().includes(q)) return true;
        if (m?.last_name?.toLowerCase().includes(q)) return true;
        return false;
      })
    : allUsers;

  const confirmLink = (profile) => {
    Alert.alert(
      'Link login account',
      `Link "${profile.username}" to ${member.first_name} ${member.last_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: async () => {
          setLinkBusy(true);
          try {
            await api.linkMemberToProfile(profile.id, member.id);
            closeLinkModal();
            load();
            Alert.alert('Linked ✓', `${profile.username} is now linked to ${member.first_name} ${member.last_name}.`);
          } catch (e) {
            Alert.alert('Could not link', e.message || 'Something went wrong.');
          } finally { setLinkBusy(false); }
        }},
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title={isSelf ? 'My Profile' : memberId ? 'Member Profile' : 'My Profile'} navigation={navigation} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </View>
    );
  }

  if (!member) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title={isSelf ? 'My Profile' : memberId ? 'Member Profile' : 'My Profile'} navigation={navigation} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="person-outline" size={48} color={colors.inkSoft} />
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.inkSoft, marginTop: 14, textAlign: 'center' }}>
            Profile not found
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
            Your member record is not linked to this account yet. Contact the parish office.
          </Text>
        </View>
      </View>
    );
  }

  const photoUri = member.photo || null;

  // unit_admin can edit members in their own BCC unit.
  // user.bcc_unit is populated by api.js currentProfile() join.
  const isUnitAdminOfThisMember =
    isUnitAdmin && !!memberId && !!member.basic_christian_community &&
    !!user?.bcc_unit && member.basic_christian_community === user.bcc_unit;

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={isSelf ? 'My Profile' : memberId ? 'Member Profile' : 'My Profile'}
        navigation={navigation}
        right={
          isAdmin && memberId ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={() => navigation.navigate('EditMember', { memberId })} hitSlop={10}>
                <Ionicons name="create-outline" size={20} color={t.secondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={remove} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={t.secondary} />
              </TouchableOpacity>
            </View>
          ) : isUnitAdminOfThisMember ? (
            <TouchableOpacity onPress={() => navigation.navigate('EditMember', { memberId })} hitSlop={10}>
              <Ionicons name="create-outline" size={20} color={t.secondary} />
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          {/* Avatar — tappable with camera badge when viewing own profile */}
          <TouchableOpacity
            onPress={isMyProfile ? handlePhotoPress : undefined}
            disabled={!isMyProfile || uploading}
            activeOpacity={isMyProfile ? 0.8 : 1}
            style={styles.avatarWrap}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={[styles.avatarPhoto, { borderColor: t.secondary }]} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: t.primaryLight, borderColor: t.secondary }]}>
                <Text style={[styles.avatarText, { color: t.primary }]}>
                  {member.first_name[0]}{member.last_name[0]}
                </Text>
              </View>
            )}
            {isMyProfile && (
              <View style={[styles.cameraBadge, { backgroundColor: t.primary }]}>
                {uploading
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Ionicons name="camera" size={12} color={colors.white} />
                }
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.heroName}>{member.first_name} {member.last_name}</Text>
          {!!member.baptism_name && <Text style={styles.heroBaptism}>{member.baptism_name}</Text>}
          <View style={styles.heroChipRow}>
            <View style={[styles.heroChip, { backgroundColor: t.primaryLight }]}>
              <Text style={[styles.heroChipText, { color: t.primary }]}>{member.member_number}</Text>
            </View>
            {member.status === 'inactive' && (
              <View style={[styles.heroChip, { backgroundColor: colors.danger + '18' }]}>
                <Text style={[styles.heroChipText, { color: colors.danger }]}>Inactive</Text>
              </View>
            )}
            {member.is_family_head && (
              <View style={[styles.heroChip, { backgroundColor: t.secondaryLight || t.primaryLight }]}>
                <Ionicons name="star" size={10} color={t.secondary} />
                <Text style={[styles.heroChipText, { color: t.secondary }]}>Head of Family</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Family (always visible to everyone if linked) ── */}
        {linkedFamily && (
          <TouchableOpacity
            style={styles.familyBanner}
            onPress={() => navigation.navigate('Family', { familyId: linkedFamily.id })}
            activeOpacity={0.8}
          >
            <View style={[styles.familyBannerIcon, { backgroundColor: t.primaryLight }]}>
              <Ionicons name="home" size={18} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.familyBannerName}>{linkedFamily.house_name || linkedFamily.family_code}</Text>
              <Text style={styles.familyBannerSub}>
                {linkedFamily.family_code}
                {linkedFamily.ward ? ` · ${linkedFamily.ward}` : ''}
                {linkedFamily.place ? ` · ${linkedFamily.place}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.primary} />
          </TouchableOpacity>
        )}

        {/* ── Parish Details ── */}
        <Section
          title="Parish Details"
          icon="people-outline"
          hasContent={!!(member.basic_christian_community || linkedFamily?.ward || member.relationship_to_head)}
        >
          <InfoRow label="BCC Unit"       value={member.basic_christian_community} />
          <InfoRow label="Ward"           value={linkedFamily?.ward} />
          <InfoRow label="Relationship"   value={member.relationship_to_head} />
        </Section>

        {/* ── Personal ── */}
        <Section
          title="Personal"
          icon="person-outline"
          hasContent={!!(member.gender || member.date_of_birth || member.blood_group || member.marital_status)}
        >
          <InfoRow label="Gender"         value={member.gender} />
          <InfoRow label="Date of birth"  value={fmtDate(member.date_of_birth)} />
          <InfoRow label="Blood group"    value={member.blood_group} />
          <InfoRow label="Marital status" value={member.marital_status} />
        </Section>

        {/* ── Contact ── */}
        <Section
          title="Contact"
          icon="call-outline"
          hasContent={!!(member.mobile || member.email)}
        >
          <PhoneRow label="Mobile"  value={member.mobile} />
          <EmailRow label="Email"   value={member.email} />
        </Section>

        {/* ── Professional ── */}
        <Section
          title="Professional"
          icon="briefcase-outline"
          hasContent={!!(member.occupation || member.education)}
        >
          <InfoRow label="Occupation"     value={member.occupation} />
          <InfoRow label="Qualification"  value={member.education} />
        </Section>

        {/* ── Admin-only: Family linking ── */}
        {isAdmin && !!memberId && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="home-outline" size={14} color={colors.inkSoft} />
              <Text style={styles.sectionTitle}>Family</Text>
            </View>
            <View style={[styles.card, { overflow: 'visible' }]}>
              {linkedFamily ? (
                <TouchableOpacity style={styles.infoRow} onPress={openFamilyModal} activeOpacity={0.75}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkRowPrimary} numberOfLines={1}>
                      {linkedFamily.house_name || linkedFamily.family_code}
                    </Text>
                    <Text style={styles.infoLabel}>
                      {linkedFamily.family_code}{linkedFamily.place ? ` · ${linkedFamily.place}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.pillBtn, { borderColor: t.primary }]}>
                    <Ionicons name="swap-horizontal" size={13} color={t.primary} />
                    <Text style={[styles.pillBtnText, { color: t.primary }]}>Change</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.infoRow} onPress={openFamilyModal} activeOpacity={0.75}>
                  <View style={styles.noLinkChip}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                    <Text style={styles.noLinkText}>No family linked</Text>
                  </View>
                  <View style={[styles.pillBtn, { borderColor: t.primary, backgroundColor: t.primaryLight }]}>
                    <Ionicons name="link-outline" size={13} color={t.primary} />
                    <Text style={[styles.pillBtnText, { color: t.primary }]}>Link</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Admin-only: Login account linking ── */}
        {isStaffAccount && !!memberId && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="key-outline" size={14} color={colors.inkSoft} />
              <Text style={styles.sectionTitle}>Login Account</Text>
            </View>
            <View style={[styles.card, { overflow: 'visible' }]}>
              {linkedProfile === undefined ? (
                <View style={styles.infoRow}>
                  <ActivityIndicator size="small" color={t.primary} />
                </View>
              ) : linkedProfile ? (
                <TouchableOpacity style={styles.infoRow} onPress={openLinkModal} activeOpacity={0.75}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkRowPrimary}>{linkedProfile.username}</Text>
                    <Text style={styles.infoLabel}>
                      {ROLE_LABELS[linkedProfile.role] || linkedProfile.role}
                      {linkedProfile.is_active ? '' : ' · Deactivated'}
                    </Text>
                  </View>
                  <View style={[styles.pillBtn, { borderColor: t.primary }]}>
                    <Ionicons name="swap-horizontal" size={13} color={t.primary} />
                    <Text style={[styles.pillBtnText, { color: t.primary }]}>Change</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.infoRow} onPress={openLinkModal} activeOpacity={0.75}>
                  <View style={styles.noLinkChip}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                    <Text style={styles.noLinkText}>No login account linked</Text>
                  </View>
                  <View style={[styles.pillBtn, { borderColor: t.primary, backgroundColor: t.primaryLight }]}>
                    <Ionicons name="link-outline" size={13} color={t.primary} />
                    <Text style={[styles.pillBtnText, { color: t.primary }]}>Link</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Login Account Modal ── */}
      <Modal visible={linkModalOpen} transparent animationType="slide" onRequestClose={closeLinkModal}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Link Login Account</Text>
                <Text style={styles.sheetSub}>
                    Linking to{' '}
                    <Text style={styles.sheetBold}>{member?.first_name} {member?.last_name}</Text>
                    {'. Search by username or the member name already tied to the account.'}
                  </Text>
              </View>
              <TouchableOpacity onPress={closeLinkModal} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterWrap}>
              <Ionicons name="search-outline" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.filterInput}
                placeholder="Search by username or member name…"
                placeholderTextColor={colors.inkSoft}
                value={linkFilter}
                onChangeText={setLinkFilter}
                autoCapitalize="none"
                autoFocus
              />
              {linkFilter.length > 0 && (
                <TouchableOpacity onPress={() => setLinkFilter('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredUsers}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.sheetEmpty}>{allUsers.length === 0 ? 'No accounts found' : 'No accounts match'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.sheetRow} onPress={() => confirmLink(item)} disabled={linkBusy} activeOpacity={0.75}>
                  <View style={[styles.sheetAvatar, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name="person" size={16} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetRowName}>{item.username}</Text>
                    <Text style={styles.sheetRowMeta}>
                      {ROLE_LABELS[item.role] || item.role}
                      {item.members
                        ? ` · ${item.members.first_name} ${item.members.last_name}`
                        : item.member_id ? ' · already linked' : ' · no member linked'}
                    </Text>
                  </View>
                  {linkBusy ? <ActivityIndicator size="small" color={t.primary} /> : <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Family Picker Modal ── */}
      <Modal visible={familyModalOpen} transparent animationType="slide" onRequestClose={closeFamilyModal}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Select Family</Text>
                <Text style={styles.sheetSub}>
                  Linking{' '}
                  <Text style={styles.sheetBold}>{member?.first_name} {member?.last_name}</Text>
                </Text>
              </View>
              <TouchableOpacity onPress={closeFamilyModal} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterWrap}>
              <Ionicons name="search-outline" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.filterInput}
                placeholder="Filter by house name or family code…"
                placeholderTextColor={colors.inkSoft}
                value={familyFilter}
                onChangeText={setFamilyFilter}
                autoFocus
              />
              {familyFilter.length > 0 && (
                <TouchableOpacity onPress={() => setFamilyFilter('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredFamilies}
              keyExtractor={(f) => f.id}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.sheetEmpty}>{allFamilies.length === 0 ? 'No families found' : 'No families match'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.sheetRow} onPress={() => confirmLinkFamily(item)} disabled={familyBusy} activeOpacity={0.75}>
                  <View style={[styles.sheetAvatar, { backgroundColor: t.primaryLight }]}>
                    <Ionicons name="home-outline" size={16} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetRowName}>{item.house_name || item.family_code}</Text>
                    <Text style={styles.sheetRowMeta}>{item.family_code}{item.place ? ` · ${item.place}` : ''}</Text>
                  </View>
                  {familyBusy ? <ActivityIndicator size="small" color={t.primary} /> : <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // ── Hero ──
  hero: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  avatarWrap: { position: 'relative' },
  avatarPhoto: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5 },
  avatarFallback: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5,
  },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  avatarText: { fontFamily: fonts.display, fontSize: 30 },
  heroName: { fontFamily: fonts.displaySemi, fontSize: 22, color: colors.ink, marginTop: 14, textAlign: 'center' },
  heroBaptism: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 3 },
  heroChipRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  heroChipText: { fontFamily: fonts.bodyMedium, fontSize: 12 },

  // ── Family banner (visible to all if linked) ──
  familyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.divider,
    padding: 14, marginBottom: 14,
  },
  familyBannerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  familyBannerName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  familyBannerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },

  // ── Section ──
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, marginLeft: 2 },
  sectionTitle: {
    fontFamily: fonts.bodySemi, fontSize: 11, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },

  // ── Info rows ──
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  infoLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, flex: 1 },
  infoValue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink, flex: 2, textAlign: 'right' },
  contactVal: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },

  // ── Empty / Add prompt ──
  emptyRow: { paddingHorizontal: 16, paddingVertical: 16 },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  addPromptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  addPromptText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkSoft },

  // ── Link rows (Family / Login Account) ──
  linkRowPrimary: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.ink },
  pillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  pillBtnText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  noLinkChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noLinkText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },

  // ── Modals ──
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 32, maxHeight: '82%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  sheetTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  sheetSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 3, lineHeight: 18 },
  sheetBold: { fontFamily: fonts.bodySemi, color: colors.ink },
  filterWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: colors.stone, borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  filterInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  sheetEmpty: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, paddingVertical: 24 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  sheetAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheetRowName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  sheetRowMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
});
