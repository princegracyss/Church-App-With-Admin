import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Linking, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils/date';

// ── Small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ContactChip({ icon, value, onPress, color }) {
  if (!value) return null;
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

// ── Per-member expanded card ──────────────────────────────────────────────────

function MemberCard({ member, isCurrentUser, onViewProfile, showProfileLink, t }) {
  const initials = `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase();

  const dial  = () => member.mobile && Linking.openURL(`tel:${member.mobile.replace(/\s/g, '')}`).catch(() => {});
  const mail  = () => member.email  && Linking.openURL(`mailto:${member.email.trim()}`).catch(() => {});

  return (
    <View style={[styles.memberCard, isCurrentUser && { borderColor: t.primary, borderWidth: 1.5 }]}>

      {/* Avatar + name header */}
      <View style={styles.memberHeader}>
        {member.photo ? (
          <Image source={{ uri: member.photo }} style={[styles.avatar, { borderColor: t.secondary }]} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: t.primaryLight, borderColor: t.secondary }]}>
            <Text style={[styles.avatarInitials, { color: t.primary }]}>{initials}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.first_name} {member.last_name}
            </Text>
            {member.is_family_head && (
              <View style={[styles.headBadge, { backgroundColor: t.secondary + '22' }]}>
                <Ionicons name="star" size={10} color={t.secondary} />
                <Text style={[styles.headBadgeText, { color: t.secondary }]}>Head</Text>
              </View>
            )}
            {isCurrentUser && (
              <View style={[styles.youBadge, { backgroundColor: t.primary + '18' }]}>
                <Text style={[styles.youBadgeText, { color: t.primary }]}>You</Text>
              </View>
            )}
          </View>
          {!!member.baptism_name && (
            <Text style={styles.baptismName}>{member.baptism_name}</Text>
          )}
          <Text style={[styles.memberNumber, { color: t.primary }]}>{member.member_number}</Text>
        </View>
      </View>

      {/* Contact chips */}
      {(!!member.mobile || !!member.email) && (
        <View style={styles.chipRow}>
          <ContactChip icon="call-outline"  value={member.mobile} onPress={dial} color={colors.success} />
          <ContactChip icon="mail-outline"  value={member.email}  onPress={mail} color={t.primary} />
        </View>
      )}

      {/* Details grid */}
      <View style={styles.detailsBox}>
        <InfoRow label="Relationship"     value={member.relationship_to_head} />
        <InfoRow label="Gender"           value={member.gender} />
        <InfoRow label="Date of Birth"    value={fmtDate(member.date_of_birth)} />
        <InfoRow label="Blood Group"      value={member.blood_group} />
        <InfoRow label="Marital Status"   value={member.marital_status} />
        <InfoRow label="Occupation"       value={member.occupation} />
        <InfoRow label="Education"        value={member.education} />
        <InfoRow label="BCC Unit"         value={member.basic_christian_community} />
      </View>

      {/* View full profile link — admin only */}
      {showProfileLink && (
        <TouchableOpacity style={[styles.profileLink, { borderTopColor: colors.divider }]} onPress={onViewProfile} activeOpacity={0.75}>
          <Text style={[styles.profileLinkText, { color: t.primary }]}>View full profile</Text>
          <Ionicons name="chevron-forward" size={14} color={t.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function FamilyScreen({ navigation, route }) {
  const { isAdmin, isGuest, guestMember, user } = useAuth();
  const t = useTheme();

  const paramFamilyId = route?.params?.familyId;
  const [family,   setFamily]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [noFamily, setNoFamily] = useState(false);

  // Determine the current user's own member_id so we can badge "You"
  const myMemberId = isGuest ? guestMember?.id : (user?.member_id ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setNoFamily(false);
    setFamily(null);
    try {
      if (paramFamilyId) {
        const f = await api.getFamily(paramFamilyId);
        setFamily(f);
        return;
      }
      if (isGuest && guestMember?.family_id) {
        const f = await api.getFamily(guestMember.family_id);
        setFamily(f);
        return;
      }
      // Authenticated member — resolve via profile → member row
      const me = await api.getMyProfile();
      if (me?.family_id) {
        const f = await api.getFamily(me.family_id);
        setFamily(f);
      } else {
        setNoFamily(true);
      }
    } catch (_) {
      setNoFamily(true);
    } finally {
      setLoading(false);
    }
  }, [paramFamilyId, isGuest, guestMember]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="My Family" navigation={navigation} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </View>
    );
  }

  // ── No family ─────────────────────────────────────────────────────────────
  if (noFamily || !family) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="My Family" navigation={navigation} />
        <View style={styles.centerWrap}>
          <Ionicons name="home-outline" size={44} color={colors.inkSoft} />
          <Text style={styles.emptyTitle}>No family record linked</Text>
          <Text style={styles.emptySub}>
            Your account is not yet linked to a family in the parish register.
            Contact the parish office to get this set up.
          </Text>
        </View>
      </View>
    );
  }

  const dialFamily = () =>
    family.phone && Linking.openURL(`tel:${family.phone.replace(/\s/g, '')}`).catch(() => {});
  const mailFamily = () =>
    family.email && Linking.openURL(`mailto:${family.email.trim()}`).catch(() => {});

  const screenTitle = paramFamilyId ? (family.house_name || 'Family') : 'My Family';

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={screenTitle}
        navigation={navigation}
        right={isAdmin && paramFamilyId ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('EditFamily', { familyId: family.id })}
            hitSlop={10}
          >
            <Ionicons name="create-outline" size={20} color={t.secondary} />
          </TouchableOpacity>
        ) : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Family summary card ── */}
        <View style={[styles.familyCard, { borderColor: colors.divider }]}>
          {/* House name + code */}
          <View style={styles.familyCardHeader}>
            <View style={[styles.homeIcon, { backgroundColor: t.primaryLight }]}>
              <Ionicons name="home" size={20} color={t.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.houseName}>{family.house_name || '—'}</Text>
              <Text style={[styles.familyCode, { color: t.primary }]}>
                {family.family_code}{family.ward ? ` · ${family.ward}` : ''}
              </Text>
            </View>
          </View>

          {/* Address */}
          {!!(family.address_line1 || family.place || family.district) && (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={13} color={colors.inkSoft} />
              <Text style={styles.addressText}>
                {[family.address_line1, family.address_line2, family.place, family.district, family.state, family.pincode]
                  .filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {/* BCC Unit */}
          {!!family.basic_christian_community && (
            <View style={styles.addressRow}>
              <Ionicons name="people-outline" size={13} color={colors.inkSoft} />
              <Text style={styles.addressText}>{family.basic_christian_community}</Text>
            </View>
          )}

          {/* Contact chips */}
          {(!!family.phone || !!family.email) && (
            <View style={[styles.chipRow, { marginTop: 10 }]}>
              <ContactChip icon="call-outline" value={family.phone} onPress={dialFamily} color={colors.success} />
              <ContactChip icon="mail-outline" value={family.email} onPress={mailFamily} color={t.primary} />
            </View>
          )}

          {/* Stats row */}
          <View style={[styles.statsRow, { borderTopColor: colors.divider }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: t.primary }]}>{family.members?.length ?? 0}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Ionicons
                name={family.head_member_id ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={family.head_member_id ? colors.success : colors.danger}
              />
              <Text style={styles.statLabel}>
                {family.head_member_id ? 'Head assigned' : 'No head yet'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Add member button (admin + param family) ── */}
        {isAdmin && paramFamilyId && (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: t.primary }]}
            onPress={() => navigation.navigate('AddMember', {
              familyId: family.id,
              familyName: family.house_name,
              isHeadMember: !family.head_member_id,
            })}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={16} color={t.primary} />
            <Text style={[styles.addBtnText, { color: t.primary }]}>
              {family.head_member_id ? 'Add another member' : 'Add head of family'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Members section ── */}
        {family.members?.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>
              FAMILY MEMBERS ({family.members.length})
            </Text>
            {family.members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isCurrentUser={myMemberId === member.id}
                t={t}
                showProfileLink={isAdmin}
                onViewProfile={() => navigation.navigate('MemberProfile', { memberId: member.id })}
              />
            ))}
          </>
        ) : (
          <View style={styles.noMembersWrap}>
            <Ionicons name="person-outline" size={32} color={colors.inkSoft} />
            <Text style={styles.noMembersText}>No members added yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  centerWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 10,
  },
  emptyTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.inkSoft, textAlign: 'center' },
  emptySub:   { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },

  scroll: { padding: 16, paddingBottom: 36 },

  // ── Family summary card ──
  familyCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, marginBottom: 16, overflow: 'hidden',
  },
  familyCardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  homeIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  houseName:   { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.ink },
  familyCode:  { fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  addressRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 16, marginBottom: 4 },
  addressText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, lineHeight: 17 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.stone,
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12 },

  statsRow: {
    flexDirection: 'row', borderTopWidth: 1,
    paddingVertical: 12, marginTop: 8,
  },
  statItem:    { flex: 1, alignItems: 'center', gap: 3 },
  statNum:     { fontFamily: fonts.bodySemi, fontSize: 18 },
  statLabel:   { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft },
  statDivider: { width: 1, marginVertical: 4 },

  // ── Add member button ──
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: 13, marginBottom: 16,
    borderWidth: 1,
  },
  addBtnText: { fontFamily: fonts.bodySemi, fontSize: 13.5 },

  // ── Section label ──
  sectionLabel: {
    fontFamily: fonts.bodySemi, fontSize: 11, color: colors.inkSoft,
    letterSpacing: 0.6, marginBottom: 10, marginLeft: 2,
  },

  // ── Per-member card ──
  memberCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.divider,
    marginBottom: 14, overflow: 'hidden',
  },
  memberHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, gap: 12,
  },
  avatar: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 2, flexShrink: 0,
  },
  avatarFallback: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, flexShrink: 0,
  },
  avatarInitials: { fontFamily: fonts.display, fontSize: 20 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  memberName: { fontFamily: fonts.displaySemi, fontSize: 15, color: colors.ink },
  baptismName: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },
  memberNumber: { fontFamily: fonts.bodyMedium, fontSize: 11.5, marginTop: 2 },

  headBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2,
  },
  headBadgeText: { fontFamily: fonts.bodySemi, fontSize: 10 },
  youBadge: {
    borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2,
  },
  youBadgeText: { fontFamily: fonts.bodySemi, fontSize: 10 },

  // Details table inside member card
  detailsBox: {
    borderTopWidth: 1, borderTopColor: colors.divider,
    paddingHorizontal: 14, paddingTop: 2, paddingBottom: 4,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  infoLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, flex: 1 },
  infoValue: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink, flex: 2, textAlign: 'right' },

  // View full profile link at the bottom of each card
  profileLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 3, paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1,
  },
  profileLinkText: { fontFamily: fonts.bodySemi, fontSize: 12 },

  // No members placeholder
  noMembersWrap: { alignItems: 'center', paddingTop: 30, gap: 8 },
  noMembersText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
});
