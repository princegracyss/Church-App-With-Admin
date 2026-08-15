import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import { useTheme } from '../context/ParishContext';
import ScreenHeader from '../components/ScreenHeader';
import SendWishModal from '../components/SendWishModal';
import WishModal from '../components/WishModal';
import api from '../services/api';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const TYPE_META = {
  FEAST:            { icon: 'flame',             accent: '#C9A24B' },
  GENERAL:          { icon: 'megaphone-outline', accent: '#6B1E3C' },
  FUNERAL:          { icon: 'flower-outline',    accent: colors.inkSoft },
  EMERGENCY:        { icon: 'warning-outline',   accent: '#B0413E' },
  BIRTHDAY:         { icon: 'gift-outline',      accent: '#7c5cd8' },
  WISH:             { icon: 'heart-outline',     accent: '#c0395a' },
  LITURGY:          { icon: 'business-outline',  accent: '#1a5c8a' },
  LITURGY_REMINDER: { icon: 'alarm-outline',     accent: '#1a5c8a' },
};

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen({ navigation }) {
  const { user, guestMember, isAdmin } = useAuth();
  const t = useTheme();

  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);   // spinner for bulk actions

  // ── Selection mode ─────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set()); // Set of notification IDs

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [sendWishTarget, setSendWishTarget] = useState(null);
  const [activeWish,     setActiveWish]     = useState(null);

  const channelRef = useRef(null);


  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true);
    api.getNotifications()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    channelRef.current = supabase
      .channel('notifications-screen')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          () => load())
      .subscribe();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [load]);

  // Exit select mode and clear selection
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  // Toggle individual item selection
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Select / deselect all
  const allSelected = list.length > 0 && selected.size === list.length;
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(list.map((n) => n.id)));
  };

  const unreadCount    = list.filter((n) => !n.read).length;
  const selectedCount  = selected.size;

  // ── Mark selected as read ──────────────────────────────────────────────────
  const handleMarkSelectedRead = async () => {
    if (!selectedCount) return;
    const ids = [...selected];
    // Optimistic update
    setList((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n));
    exitSelect();
    await api.markNotificationsRead(ids).catch(() => {});
  };

  // ── Mark ALL as read ───────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    if (!unreadCount) return;
    setList((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.markAllNotificationsRead().catch(() => {});
  };

  // ── Delete selected ────────────────────────────────────────────────────────
  const handleDeleteSelected = () => {
    if (!selectedCount) return;
    Alert.alert(
      `Delete ${selectedCount} notification${selectedCount > 1 ? 's' : ''}`,
      isAdmin
        ? 'These notifications will be permanently deleted for everyone.'
        : 'These notifications will be removed from your view.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ids = [...selected];
            // Optimistic: remove from list immediately
            setList((prev) => prev.filter((n) => !ids.includes(n.id)));
            exitSelect();
            setBusy(true);
            try {
              await api.deleteNotifications(ids, isAdmin);
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not delete notifications.');
              load(); // reload to restore accurate state
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  // ── Clear all (admin) ──────────────────────────────────────────────────────
  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'This permanently deletes all broadcast notifications for everyone. Individual birthday wishes are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.clearAllNotifications();
              load();
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not clear notifications.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  // ── Open send-wish ─────────────────────────────────────────────────────────
  const openSendWish = (item) => {
    const meta = item.metadata ?? {};
    if (!meta.birthday_member_id) {
      Alert.alert('Unavailable', 'Could not identify the birthday person.');
      return;
    }
    setSendWishTarget({
      birthdayMemberId: meta.birthday_member_id,
      birthdayName:     meta.birthday_member_name ?? 'them',
    });
  };

  // ── Open received wish (mark read on open) ─────────────────────────────────
  const openWish = (item) => {
    setActiveWish(item);
    if (!item.read) {
      api.markNotificationsRead([item.id]).catch(() => {});
      setList((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
    }
  };

  // ── Tap any row (outside select mode) → mark as read ─────────────────────
  const handleRowTap = (item) => {
    if (!item.read) {
      api.markNotificationsRead([item.id]).catch(() => {});
      setList((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
    }
    if (item.type === 'WISH') openWish(item);
    if (item.type === 'BIRTHDAY' && item.metadata?.can_send_wish) openSendWish(item);
  };

  // ── Row render ─────────────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const meta       = TYPE_META[item.type] || TYPE_META.GENERAL;
    const isBirthday = item.type === 'BIRTHDAY';
    const isWish     = item.type === 'WISH';
    const isSelected = selected.has(item.id);

    // For WISH rows, show the sender name + unit instead of the generic title.
    const wishMeta    = isWish ? (item.metadata ?? {}) : null;
    const rowTitle    = isWish && wishMeta?.sender_name
      ? `🎉 Birthday wish from ${wishMeta.sender_name}`
      : item.title;
    const rowSubtitle = isWish && wishMeta?.sender_unit
      ? wishMeta.sender_unit
      : null;

    const onPress     = selectMode ? () => toggleSelect(item.id) : () => handleRowTap(item);
    const onLongPress = selectMode ? undefined : () => { setSelectMode(true); toggleSelect(item.id); };

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.78}
        delayLongPress={350}
      >
        <View style={[
          styles.row,
          !item.read && !isSelected && { borderLeftWidth: 3, borderColor: t.secondary },
          isWish     && !isSelected && { borderLeftWidth: 3, borderColor: t.primary + '44', backgroundColor: t.primaryLight },
          isSelected && { borderLeftWidth: 3, borderColor: t.primary, backgroundColor: t.primaryLight },
        ]}>

          {/* Checkbox (select mode) or icon bubble */}
          {selectMode ? (
            <View style={[styles.checkbox, isSelected && { backgroundColor: t.primary, borderColor: t.primary }]}>
              {isSelected && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
          ) : (
            <View style={[styles.iconWrap, { backgroundColor: meta.accent + '22' }]}>
              <Ionicons name={meta.icon} size={18} color={meta.accent} />
            </View>
          )}

          {/* Content */}
          <View style={{ flex: 1 }}>
            <View style={styles.topLine}>
              <Text style={styles.title} numberOfLines={2}>{rowTitle}</Text>
              {!item.read && !isSelected && (
                <View style={[styles.dot, { backgroundColor: t.primary }]} />
              )}
            </View>
            {!!rowSubtitle && (
              <Text style={styles.senderUnit}>{rowSubtitle}</Text>
            )}
            <Text style={styles.message} numberOfLines={isSelected ? 1 : 3}>{item.message}</Text>
            <Text style={styles.time}>{relativeTime(item.created_at)}</Text>

            {/* "Send Wishes" CTA for BIRTHDAY rows — hidden in select mode */}
            {!selectMode && isBirthday && item.metadata?.can_send_wish && (
              <TouchableOpacity
                style={[styles.sendWishBtn, { backgroundColor: t.accent }]}
                onPress={() => openSendWish(item)}
                activeOpacity={0.8}
              >
                <Ionicons name="paper-plane-outline" size={13} color={colors.white} />
                <Text style={styles.sendWishBtnText}>Send Wishes 🎁</Text>
              </TouchableOpacity>
            )}

            {!selectMode && isWish && (
              <Text style={[styles.tapHint, { color: t.primary }]}>Tap to open wish ›</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  const headerRight = selectMode ? (
    // Select-mode toolbar
    <View style={styles.headerActions}>
      {/* Select all / deselect all */}
      <TouchableOpacity style={styles.headerBtn} onPress={toggleSelectAll} hitSlop={8}>
        <Ionicons
          name={allSelected ? 'checkbox' : 'checkbox-outline'}
          size={20}
          color={colors.white}
        />
      </TouchableOpacity>

      {/* Mark selected as read */}
      {selectedCount > 0 && (
        <TouchableOpacity style={styles.headerBtn} onPress={handleMarkSelectedRead} hitSlop={8}>
          <Ionicons name="checkmark-done-outline" size={20} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Delete selected */}
      {selectedCount > 0 && (
        <TouchableOpacity style={styles.headerBtn} onPress={handleDeleteSelected} hitSlop={8} disabled={busy}>
          {busy
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="trash-outline" size={20} color={colors.white} />
          }
        </TouchableOpacity>
      )}

      {/* Count badge */}
      {selectedCount > 0 && (
        <View style={[styles.badge, { backgroundColor: t.secondary }]}>
          <Text style={styles.badgeText}>{selectedCount}</Text>
        </View>
      )}

      {/* Cancel */}
      <TouchableOpacity style={styles.headerBtn} onPress={exitSelect} hitSlop={8}>
        <Ionicons name="close" size={20} color={colors.white} />
      </TouchableOpacity>
    </View>
  ) : (
    // Normal toolbar
    <View style={styles.headerActions}>
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.headerBtn} onPress={handleMarkAllRead} hitSlop={8}>
          <Ionicons name="checkmark-done-outline" size={19} color={colors.white} />
        </TouchableOpacity>
      )}
      {isAdmin && (
        <TouchableOpacity style={styles.headerBtn} onPress={handleClearAll} hitSlop={8} disabled={busy}>
          {busy
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="trash-outline" size={19} color={colors.white} />
          }
        </TouchableOpacity>
      )}
      {unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: t.secondary }]}>
          <Text style={styles.badgeText}>{unreadCount}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.flex}>
      <ScreenHeader title={selectMode ? `Select notifications` : 'Notifications'} navigation={navigation} right={headerRight} />

      {selectMode && (
        <View style={[styles.selectBar, { backgroundColor: t.primaryLight }]}>
          <Text style={[styles.selectBarText, { color: t.primary }]}>
            {selectedCount === 0
              ? 'Tap to select — long-press to start'
              : `${selectedCount} of ${list.length} selected`}
          </Text>
        </View>
      )}

      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={renderItem}
        extraData={{ selected, selectMode }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.inkSoft} />
              <Text style={styles.empty}>No notifications yet.</Text>
            </View>
          ) : null
        }
      />

      <SendWishModal
        visible={!!sendWishTarget}
        birthdayMemberId={sendWishTarget?.birthdayMemberId}
        birthdayName={sendWishTarget?.birthdayName}
        onClose={() => setSendWishTarget(null)}
        onSent={() => {
          setSendWishTarget(null);
          Alert.alert('Wish sent! 🎉', 'Your birthday wish has been delivered.');
        }}
      />

      <WishModal
        visible={!!activeWish}
        wish={activeWish}
        onClose={() => setActiveWish(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // Header actions
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn:     { padding: 4 },
  badge: {
    borderRadius: radius.pill, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.white },

  // Select mode info bar
  selectBar: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  selectBarText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },

  // Notification row
  row: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderRadius: radius.md, padding: 13, marginBottom: 10,
    borderWidth: 1, borderColor: colors.divider,
  },

  // Checkbox (select mode)
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.divider,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0, marginTop: 1,
  },

  // Icon bubble (normal mode)
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },

  topLine:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title:    { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  message:  { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 3, lineHeight: 17 },
  time:     { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 5 },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkSoft, marginTop: 4, flexShrink: 0 },

  sendWishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 8,
  },
  sendWishBtnText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.white },

  senderUnit: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  tapHint: { fontFamily: fonts.body, fontSize: 11, marginTop: 6 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
  empty:     { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
});
