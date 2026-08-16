import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
  Modal, TextInput, ScrollView,
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

// ── Notification type filter tabs ────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'ALL',      label: 'All' },
  { key: 'GENERAL',  label: 'General' },
  { key: 'BIRTHDAY', label: 'Birthday' },
  { key: 'LITURGY',  label: 'Liturgy' },
  { key: 'WISH',     label: 'Wishes' },
];

// Notification types that belong to the "Liturgy" filter tab
const LITURGY_TYPES = new Set(['LITURGY', 'LITURGY_REMINDER']);

function matchesFilter(item, filterKey) {
  if (filterKey === 'ALL') return true;
  if (filterKey === 'LITURGY') return LITURGY_TYPES.has(item.type);
  return item.type === filterKey;
}

// ── Create Notification Modal (admin only) ───────────────────────────────────
const NOTIF_TYPES = [
  { key: 'GENERAL',   label: 'General',   icon: 'megaphone-outline' },
  { key: 'FEAST',     label: 'Feast Day', icon: 'flame' },
  { key: 'FUNERAL',   label: 'Funeral',   icon: 'flower-outline' },
  { key: 'EMERGENCY', label: 'Emergency', icon: 'warning-outline' },
];

function CreateNotificationModal({ visible, onClose, onCreated, t }) {
  const [title,   setTitle]   = useState('');
  const [message, setMessage] = useState('');
  const [type,    setType]    = useState('GENERAL');
  const [saving,  setSaving]  = useState(false);

  const reset = () => { setTitle(''); setMessage(''); setType('GENERAL'); };

  const handleClose = () => { reset(); onClose(); };

  const send = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }
    if (!message.trim()) { Alert.alert('Required', 'Please enter a message.'); return; }
    setSaving(true);
    try {
      await api.createNotification({ title: title.trim(), message: message.trim(), type });
      reset();
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert('Could not send', e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={cnStyles.backdrop}>
        <View style={cnStyles.sheet}>
          <View style={cnStyles.header}>
            <Text style={cnStyles.title}>New Notification</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          {/* Type selector */}
          <Text style={cnStyles.label}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={cnStyles.typeRow}>
              {NOTIF_TYPES.map((nt) => (
                <TouchableOpacity
                  key={nt.key}
                  style={[cnStyles.typeChip, type === nt.key && { backgroundColor: t.primary, borderColor: t.primary }]}
                  onPress={() => setType(nt.key)}
                >
                  <Ionicons name={nt.icon} size={14} color={type === nt.key ? colors.white : colors.inkSoft} />
                  <Text style={[cnStyles.typeChipText, type === nt.key && { color: colors.white }]}>{nt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={cnStyles.label}>Title</Text>
          <TextInput
            style={cnStyles.input}
            placeholder="Notification title"
            placeholderTextColor={colors.inkSoft}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          <Text style={cnStyles.label}>Message</Text>
          <TextInput
            style={[cnStyles.input, cnStyles.inputMulti]}
            placeholder="Write your message here…"
            placeholderTextColor={colors.inkSoft}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[cnStyles.sendBtn, { backgroundColor: t.primary }, (saving || !title.trim() || !message.trim()) && cnStyles.sendBtnDisabled]}
            onPress={send}
            disabled={saving || !title.trim() || !message.trim()}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.white} />
              : <><Ionicons name="send" size={16} color={colors.white} /><Text style={cnStyles.sendBtnText}>Send to all members</Text></>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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

  // ── Filter tab ─────────────────────────────────────────────────────────────
  const [filterTab, setFilterTab] = useState('ALL');

  // ── Selection mode ─────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set()); // Set of notification IDs

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [sendWishTarget,   setSendWishTarget]   = useState(null);
  const [activeWish,       setActiveWish]       = useState(null);
  const [createModalOpen,  setCreateModalOpen]  = useState(false);

  const channelRef = useRef(null);


  // ── Load ───────────────────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState(null);
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api.getNotifications()
      .then(setList)
      .catch((e) => setLoadError(e?.message ?? 'Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    // Remove any stale channel before re-subscribing to avoid duplicates on
    // screen re-mount (navigate away → navigate back).
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    channelRef.current = supabase
      .channel(`notifications-screen-${Date.now()}`)
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

  // Select / deselect all — scoped to visible (filtered) items
  const filteredList = list.filter((n) => matchesFilter(n, filterTab));
  const allSelected = filteredList.length > 0 && filteredList.every((n) => selected.has(n.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(filteredList.map((n) => n.id)));
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
      'This permanently deletes all general notifications for everyone. Birthday notifications and personal wishes are kept.',
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
      notificationId:   item.id,                         // used to dismiss after send
      birthdayMemberId: meta.birthday_member_id,
      birthdayName:     meta.birthday_member_name ?? 'them',
    });
  };

  // ── Open received wish (mark read on open) ─────────────────────────────────
  const openWish = (item) => {
    setActiveWish(item);
    // Mark as read immediately when opened, regardless of prior state.
    api.markNotificationsRead([item.id]).catch(() => {});
    setList((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
  };

  // ── Close wish modal and dismiss the notification ─────────────────────────
  // Once the birthday person has read the wish, remove it from their list so
  // it doesn't pile up. Uses the same dismiss path as swiping-to-delete.
  const handleWishClose = () => {
    const wish = activeWish;
    setActiveWish(null);
    if (wish) {
      api.deleteNotifications([wish.id], false).catch(() => {});
      setList((prev) => prev.filter((n) => n.id !== wish.id));
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
        <TouchableOpacity style={styles.headerBtn} onPress={() => setCreateModalOpen(true)} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={21} color={colors.white} />
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

      {/* ── Filter tabs ── */}
      {!selectMode && (
        <View style={styles.filterBar}>
          {FILTER_TABS.map((ft) => {
            const tabUnread = ft.key === 'ALL'
              ? unreadCount
              : list.filter((n) => matchesFilter(n, ft.key) && !n.read).length;
            return (
              <TouchableOpacity
                key={ft.key}
                style={[styles.filterTab, filterTab === ft.key && { backgroundColor: t.primary, borderColor: t.primary }]}
                onPress={() => { setFilterTab(ft.key); exitSelect(); }}
              >
                <Text style={[styles.filterTabText, filterTab === ft.key && { color: colors.white }]}>{ft.label}</Text>
                {tabUnread > 0 && (
                  <View style={[styles.filterTabDot, filterTab === ft.key ? { backgroundColor: t.secondary } : { backgroundColor: t.primary }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {selectMode && (
        <View style={[styles.selectBar, { backgroundColor: t.primaryLight }]}>
          <Text style={[styles.selectBarText, { color: t.primary }]}>
            {selectedCount === 0
              ? 'Tap to select — long-press to start'
              : `${selectedCount} of ${filteredList.length} selected`}
          </Text>
        </View>
      )}

      <FlatList
        data={filteredList}
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
              <Text style={styles.empty}>
                {loadError ?? (filterTab !== 'ALL' ? `No ${FILTER_TABS.find(f=>f.key===filterTab)?.label} notifications.` : 'No notifications yet.')}
              </Text>
            </View>
          ) : null
        }
      />

      <CreateNotificationModal
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={load}
        t={t}
      />

      <SendWishModal
        visible={!!sendWishTarget}
        birthdayMemberId={sendWishTarget?.birthdayMemberId}
        birthdayName={sendWishTarget?.birthdayName}
        onClose={() => setSendWishTarget(null)}
        onSent={() => {
          const nid = sendWishTarget?.notificationId;
          setSendWishTarget(null);
          // Dismiss the BIRTHDAY notification for this user so the
          // "Send Wishes" row disappears once they've sent their wish.
          if (nid) {
            api.deleteNotifications([nid], false).catch(() => {});
            setList((prev) => prev.filter((n) => n.id !== nid));
          }
          Alert.alert('Wish sent! 🎉', 'Your birthday wish has been delivered.');
        }}
      />

      <WishModal
        visible={!!activeWish}
        wish={activeWish}
        onClose={handleWishClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },

  // Filter tabs bar
  filterBar: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.stone, borderWidth: 1, borderColor: colors.divider,
  },
  filterTabText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft },
  filterTabDot:  { width: 7, height: 7, borderRadius: 4 },

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

// ── Create Notification Modal styles ─────────────────────────────────────────
const cnStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.stone,
  },
  typeChipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.inkSoft },
  input: {
    backgroundColor: colors.stone, borderRadius: radius.sm, borderWidth: 1,
    borderColor: colors.divider, paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: fonts.body, fontSize: 14, color: colors.ink, marginBottom: 14,
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: radius.sm, paddingVertical: 14, marginTop: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white },
});
