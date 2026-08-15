import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import Header from '../components/Header';
import DashboardCard from '../components/DashboardCard';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { supabase } from '../services/supabase';

// Modules visible to ALL signed-in users (members and staff in member mode).
const MEMBER_MODULES = [
  { key: 'Notifications',    label: 'Notifications',    icon: 'notifications' },
  { key: 'LiturgySchedule',  label: 'Liturgy Schedule', icon: 'calendar-clear' },
  { key: 'Events',           label: 'Events',           icon: 'calendar' },
  { key: 'PrayerRequests',   label: 'Prayer Requests',  icon: 'heart' },
  { key: 'QR',               label: 'My QR Card',       icon: 'qr-code' },
  { key: 'Sacraments',       label: 'Sacraments',       icon: 'water' },
  { key: 'Certificates',     label: 'Certificates',     icon: 'ribbon' },
  { key: 'Profile',          label: 'My Profile',       icon: 'person-circle' },
];

// Extra modules only staff can see (when NOT in member mode).
const ADMIN_EXTRA_MODULES = [
  { key: 'MemberList',    label: 'Member List',    icon: 'people' },
  { key: 'Organizations', label: 'Organizations',  icon: 'flag' },
  { key: 'Documents',     label: 'Documents',      icon: 'document-text' },
  { key: 'Donations',     label: 'Donations',      icon: 'gift' },
  { key: 'Search',        label: 'Advanced Search',icon: 'search' },
  { key: 'Reports',       label: 'Reports',        icon: 'bar-chart' },
  { key: 'News',          label: 'Parish News',    icon: 'newspaper' },
];

export default function DashboardScreen({ navigation }) {
  const {
    user, canManageUsers, isAdmin, isSuperAdmin,
    memberMode, enterMemberMode, exitMemberMode, isStaffAccount,
    guestMember, isGuest,
  } = useAuth();
  const t = useTheme();
  const [profile, setProfile] = useState(null);
  const [unread, setUnread] = useState(0);
  const channelRef = useRef(null);

  const refreshUnread = () => {
    // Guest sessions have no Supabase auth — skip the authenticated query.
    if (isGuest) return;
    api.getNotifications().then((list) => setUnread(list.filter((n) => !n.read).length));
  };

  useEffect(() => {
    if (isGuest) {
      // Use the member row captured at lookup time — no Supabase query needed.
      setProfile(guestMember);
    } else {
      api.getMyProfile().then(setProfile);
      refreshUnread();
    }
    const unsub = navigation.addListener('focus', refreshUnread);
    return unsub;
  }, [navigation, isGuest]);

  useEffect(() => {
    // Real-time subscription — badge updates on any notification change:
    // INSERT (new broadcast/birthday), DELETE (admin clear), UPDATE (rare).
    channelRef.current = supabase
      .channel('dashboard-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => refreshUnread(),
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Build the module list based on current view mode.
  let modules = [...MEMBER_MODULES];
  if (isAdmin) {
    // Staff sees all modules; admin-specific tiles prepended below.
    // Also re-add the Family (My Family) tile that was removed from MEMBER_MODULES
    // for the plain-member view (members access it via My Profile instead).
    modules = [...MEMBER_MODULES, { key: 'Family', label: 'My Family', icon: 'home-outline' }, ...ADMIN_EXTRA_MODULES];
    modules = [{ key: 'FamilyList', label: 'Families', icon: 'home' }, ...modules];
    modules = [{ key: 'ManageBcc', label: 'BCC Wards', icon: 'people-circle' }, ...modules];
    // Liturgy Assign tile — shortcut to create a new assignment (staff only).
    modules = [{ key: 'LiturgyAssign', label: 'Assign Liturgy', icon: 'create-outline' }, ...modules];
  }
  if (canManageUsers) {
    modules = [{ key: 'ManageUsers', label: 'Manage Users', icon: 'shield-checkmark' }, ...modules];
  }

  return (
    <View style={styles.flex}>
      <Header
        name={profile ? `${profile.first_name} ${profile.last_name}` : '—'}
        onMenuPress={() => {
          const myMemberId = isGuest ? guestMember?.id : user?.member_id;
          navigation.navigate('Profile', myMemberId ? { memberId: myMemberId, isSelf: true } : undefined);
        }}
        onSettingsPress={isSuperAdmin ? () => navigation.navigate('ParishSettings') : undefined}
      />

      {/* Member-mode banner — shown when a staff user switched to member view */}
      {memberMode && (
        <View style={[styles.memberBanner, { backgroundColor: t.primary }]}>
          <Ionicons name="eye-outline" size={14} color={colors.white} />
          <Text style={styles.memberBannerText}>Viewing as Member</Text>
          <TouchableOpacity onPress={exitMemberMode} hitSlop={8}>
            <Text style={[styles.memberBannerExit, { color: t.secondary }]}>Exit</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {modules.map((m) => (
          <DashboardCard
            key={m.key}
            label={m.label}
            icon={m.icon}
            badge={m.key === 'Notifications' && unread > 0 ? unread : null}
            onPress={() => {
              const myMemberId = isGuest ? guestMember?.id : user?.member_id;
              const params = m.key === 'Profile' && myMemberId
                ? { memberId: myMemberId, isSelf: true }
                : undefined;
              navigation.navigate(m.key, params);
            }}
          />
        ))}

        {/* "View as Member" button — only shown to staff when NOT already in member mode */}
        {isStaffAccount && !memberMode && (
          <TouchableOpacity style={styles.memberModeBtn} onPress={enterMemberMode}>
            <Ionicons name="person-outline" size={16} color={t.primary} />
            <Text style={[styles.memberModeBtnText, { color: t.primary }]}>View as Member</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 30,
  },
  memberBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  memberBannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.white },
  memberBannerExit: { fontFamily: fonts.bodySemi, fontSize: 12.5 },
  memberModeBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 4,
    backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: colors.divider,
  },
  memberModeBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13.5 },
});
