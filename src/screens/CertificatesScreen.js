import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, FlatList, ScrollView,
  Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme/theme';
import ScreenHeader from '../components/ScreenHeader';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useParish, useTheme } from '../context/ParishContext';
import { ROLE_LABELS } from '../theme/roles';
import { fmtDate, fmtDateTime } from '../utils/date';

const TYPES = [
  'Baptism Certificate', 'First Holy Communion Certificate', 'Confirmation Certificate',
  'Marriage Certificate', 'Family Certificate', 'Membership Certificate',
  'Recommendation Letter', 'Parish Transfer Certificate',
];

const STATUS_COLORS = {
  submitted: '#C9A24B',
  forwarded: '#7C5CD8',
  approved: colors.success,
  rejected: colors.danger,
  issued: '#6B1E3C',
};

const STATUS_LABELS = {
  submitted: 'Submitted',
  forwarded: 'Forwarded for Review',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
};

// ── Certificate Preview Modal ────────────────────────────────────────────────
function CertificatePreviewModal({ visible, request, onClose }) {
  const { settings } = useParish();
  if (!request) return null;
  const member = request.members;
  const today = fmtDate(new Date().toISOString().slice(0, 10), 'long');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={prev.flex}>
        <View style={[prev.header, { backgroundColor: settings.primaryColor }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={prev.headerTitle}>Certificate Preview</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={prev.content}>
          <View style={[prev.cert, { borderColor: settings.primaryColor }]}>
            {/* Header band */}
            <View style={[prev.band, { backgroundColor: settings.primaryColor }]}>
              <Text style={[prev.bandText, { color: settings.secondaryColor }]}>{settings.name}</Text>
              {!!settings.description && (
                <Text style={[prev.bandSub, { color: colors.white }]}>{settings.description}</Text>
              )}
            </View>

            {/* Title */}
            <Text style={[prev.certTitle, { color: settings.primaryColor }]}>{request.type}</Text>

            {/* Body */}
            <Text style={prev.body}>
              This is to certify that{' '}
              <Text style={prev.bodyBold}>
                {member ? `${member.first_name} ${member.last_name}` : 'the above-named individual'}
              </Text>
              {member?.member_number ? ` (Member No. ${member.member_number})` : ''}
              {' '}is a registered parishioner of {settings.name}.
            </Text>

            {/* Type-specific note */}
            <Text style={prev.bodyNote}>
              Certificate Type: {request.type}
            </Text>

            <View style={prev.divider} />

            {/* Issued info */}
            <View style={prev.row}>
              <Text style={prev.metaLabel}>Date of issue</Text>
              <Text style={prev.metaValue}>{today}</Text>
            </View>
            <View style={prev.row}>
              <Text style={prev.metaLabel}>Status</Text>
              <Text style={[prev.metaValue, { color: STATUS_COLORS[request.status] }]}>
                {STATUS_LABELS[request.status] || request.status}
              </Text>
            </View>

            {/* Seal placeholder */}
            <View style={[prev.seal, { borderColor: settings.primaryColor }]}>
              <Ionicons name="ribbon" size={28} color={settings.primaryColor} />
              <Text style={[prev.sealText, { color: settings.primaryColor }]}>Parish Seal</Text>
            </View>

            {/* Signature line */}
            <View style={prev.sigRow}>
              <View style={prev.sigBlock}>
                <View style={[prev.sigLine, { backgroundColor: settings.primaryColor }]} />
                <Text style={prev.sigLabel}>Parish Priest</Text>
                <Text style={prev.sigName}>{settings.name}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Forward Modal ──────────────────────────────────────────────────────────
function ForwardModal({ visible, request, onClose, onForwarded }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.getUsers().then((list) => {
      // Show all active users except plain members
      setUsers(list.filter((u) => u.is_active && u.role !== 'member'));
      setLoading(false);
    });
  }, [visible]);

  const forward = async (user) => {
    try {
      await api.forwardCertificateRequest(request.id, user.id);
      onForwarded();
      onClose();
    } catch (e) {
      Alert.alert('Could not forward', e.message || 'Something went wrong.');
    }
  };

  if (!request) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={fwd.backdrop}>
        <View style={fwd.sheet}>
          <Text style={fwd.title}>Forward for Approval</Text>
          <Text style={fwd.subtitle}>Select an official to review "{request.type}"</Text>
          {loading ? (
            <Text style={fwd.loading}>Loading users…</Text>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={fwd.row} onPress={() => forward(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={fwd.rowName}>{item.username}</Text>
                    <Text style={fwd.rowSub}>
                      {item.members ? `${item.members.first_name} ${item.members.last_name} · ` : ''}
                      {ROLE_LABELS[item.role] || item.role}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward-circle-outline" size={22} color={colors.inkSoft} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={fwd.empty}>No other officials found.</Text>}
            />
          )}
          <TouchableOpacity style={fwd.cancelBtn} onPress={onClose}>
            <Text style={fwd.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Request Tab (all users) ─────────────────────────────────────────────────
function RequestTab() {
  const t = useTheme();
  const [requesting, setRequesting] = useState(null);

  const request = async (type) => {
    setRequesting(type);
    try {
      const me = await api.getMyProfile();
      if (me) {
        await api.requestCertificate(me.id, type);
        Alert.alert('Request submitted', `${type} request sent to the parish office for approval.`);
      } else {
        Alert.alert('No profile', 'Your account is not linked to a member record. Contact the parish office.');
      }
    } catch (e) {
      Alert.alert('Could not submit', e.message || 'Something went wrong.');
    } finally {
      setRequesting(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.sectionHint}>
        Select the certificate type you need. The parish office will review your request.
      </Text>
      {TYPES.map((type) => (
        <TouchableOpacity key={type} style={styles.typeRow} onPress={() => request(type)} disabled={requesting === type}>
          <View style={[styles.iconWrap, { backgroundColor: t.primaryLight }]}><Ionicons name="ribbon" size={18} color={t.primary} /></View>
          <Text style={styles.typeLabel}>{type}</Text>
          <Ionicons name={requesting === type ? 'hourglass' : 'chevron-forward'} size={18} color={colors.inkSoft} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Requested Tab (members see their own requests + approved cert) ──────────
function RequestedTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getMyCertificateRequests().then(setList).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const isApproved = item.status === 'approved' || item.status === 'issued';
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={isApproved ? () => setPreview({ ...item, members: null }) : undefined}
              activeOpacity={isApproved ? 0.7 : 1}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{item.type}</Text>
                <Text style={styles.cardSub}>
                  Requested {fmtDate(item.created_at)}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[item.status] || colors.divider }]}>
                  <Text style={styles.statusText}>{STATUS_LABELS[item.status] || item.status}</Text>
                </View>
                {isApproved && (
                  <Text style={styles.viewHint}>Tap to view certificate →</Text>
                )}
              </View>
              <Ionicons
                name={isApproved ? 'document-text' : 'time-outline'}
                size={20}
                color={isApproved ? colors.success : colors.inkSoft}
              />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="ribbon-outline" size={36} color={colors.inkSoft} />
            <Text style={styles.empty}>No certificate requests yet.</Text>
            <Text style={styles.emptyHint}>Use the "Request" tab to submit one.</Text>
          </View>
        ) : null}
      />
      <CertificatePreviewModal
        visible={!!preview}
        request={preview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

// ── Approvals Tab (Parish Priest only + forwarded officials) ─────────────────
function ApprovalsTab({ isParishPriest, t }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const fetch = isParishPriest
      ? api.getCertificateRequests()
      : api.getForwardedCertificateRequests();
    fetch.then(setList).finally(() => setLoading(false));
  }, [isParishPriest]);

  useEffect(() => { load(); }, [load]);

  const decide = async (req, action) => {
    setDeciding(req.id);
    try {
      await api.decideCertificateRequest(req.id, action);
      load();
    } catch (e) {
      Alert.alert('Could not update request', e.message || 'Something went wrong.');
    } finally {
      setDeciding(null);
    }
  };

  const isPending = (item) => item.status === 'submitted' || item.status === 'forwarded';

  return (
    <>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const canDecide = isPending(item);
          const isApproved = item.status === 'approved' || item.status === 'issued';
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={isApproved ? () => setPreview(item) : undefined}
              activeOpacity={isApproved ? 0.7 : 1}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{item.type}</Text>
                <Text style={styles.cardSub}>
                  {item.members
                    ? `${item.members.first_name} ${item.members.last_name} · ${item.members.member_number}`
                    : 'Unknown member'}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[item.status] || colors.divider }]}>
                  <Text style={styles.statusText}>{STATUS_LABELS[item.status] || item.status}</Text>
                </View>
                {isApproved && <Text style={styles.viewHint}>Tap to preview certificate →</Text>}
              </View>
              <View style={styles.actions}>
                {canDecide && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.success }]}
                      onPress={() => decide(item, 'approved')}
                      disabled={deciding === item.id}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                      onPress={() => decide(item, 'rejected')}
                      disabled={deciding === item.id}
                    >
                      <Ionicons name="close" size={16} color={colors.white} />
                    </TouchableOpacity>
                    {isParishPriest && item.status === 'submitted' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#7C5CD8' }]}
                        onPress={() => setForwardTarget(item)}
                        disabled={deciding === item.id}
                      >
                        <Ionicons name="arrow-forward" size={16} color={colors.white} />
                      </TouchableOpacity>
                    )}
                  </>
                )}
                {isApproved && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: t.primary }]}
                    onPress={() => decide(item, 'issued')}
                    disabled={deciding === item.id || item.status === 'issued'}
                  >
                    <Ionicons name="print" size={15} color={colors.white} />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={36} color={colors.inkSoft} />
            <Text style={styles.empty}>No requests to review.</Text>
          </View>
        ) : null}
      />

      <ForwardModal
        visible={!!forwardTarget}
        request={forwardTarget}
        onClose={() => setForwardTarget(null)}
        onForwarded={load}
      />
      <CertificatePreviewModal
        visible={!!preview}
        request={preview}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function CertificatesScreen({ navigation }) {
  const t = useTheme();
  const { isParishPriest, isAdmin, isChurchSecretary } = useAuth();

  // Tab visibility rules:
  // - "Request"   → everyone (members request, priest can request on behalf)
  // - "Requested" → NOT shown to Parish Priest (they don't submit requests;
  //                 they only handle approvals)
  // - "Approvals" → Parish Priest always (sees all).
  //                 Admin / Church Secretary only (they may have items
  //                 forwarded to them; the API filters to forwarded-only).
  //                 Plain members never see this tab.
  const showRequested = !isParishPriest;
  const showApprovals = isParishPriest || isAdmin || isChurchSecretary;

  const TABS = [
    { key: 'request', label: 'Request' },
    ...(showRequested ? [{ key: 'requested', label: 'Requested' }] : []),
    ...(showApprovals ? [{ key: 'approvals', label: 'Approvals' }] : []),
  ];

  const [tab, setTab] = useState(isParishPriest ? 'approvals' : 'request');

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Certificates" navigation={navigation} />
      <View style={styles.tabBar}>
        {TABS.map((tabItem) => (
          <TouchableOpacity
            key={tabItem.key}
            style={[styles.tab, tab === tabItem.key && { backgroundColor: t.primary, borderColor: t.primary }]}
            onPress={() => setTab(tabItem.key)}
          >
            <Text style={[styles.tabText, tab === tabItem.key && styles.tabTextActive]}>{tabItem.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'request' && <RequestTab />}
      {tab === 'requested' && <RequestedTab />}
      {tab === 'approvals' && <ApprovalsTab isParishPriest={isParishPriest} t={t} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.stone, borderWidth: 1, borderColor: colors.divider },
  tabActive: {},
  tabText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.ink },
  tabTextActive: { color: colors.white },
  sectionHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginBottom: 14, lineHeight: 18 },
  typeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  typeLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.ink },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.divider },
  cardLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  cardSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.white, textTransform: 'capitalize' },
  viewHint: { fontFamily: fonts.body, fontSize: 11, color: colors.success, marginTop: 5 },
  actions: { gap: 6, alignItems: 'flex-end' },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 50, gap: 8 },
  empty: { textAlign: 'center', fontFamily: fonts.body, color: colors.inkSoft },
  emptyHint: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
});

// Certificate preview styles
const prev = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.stone },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 54, paddingBottom: 16, paddingHorizontal: 18 },
  headerTitle: { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.white },
  content: { padding: 20, paddingBottom: 50 },
  cert: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, overflow: 'hidden' },
  band: { paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center' },
  bandText: { fontFamily: fonts.display, fontSize: 16, textAlign: 'center' },
  bandSub: { fontFamily: fonts.body, fontSize: 12, marginTop: 3, textAlign: 'center' },
  certTitle: { fontFamily: fonts.display, fontSize: 22, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.ink, lineHeight: 22, paddingHorizontal: 20, paddingBottom: 10 },
  bodyBold: { fontFamily: fonts.bodySemi },
  bodyNote: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.inkSoft, paddingHorizontal: 20, paddingBottom: 10 },
  divider: { height: 1, backgroundColor: colors.divider, marginHorizontal: 20, marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 6 },
  metaLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  metaValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
  seal: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 20 },
  sealText: { fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 4 },
  sigRow: { paddingHorizontal: 20, paddingBottom: 24, alignItems: 'flex-end' },
  sigBlock: { alignItems: 'center', width: 150 },
  sigLine: { width: 120, height: 1, marginBottom: 6 },
  sigLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
  sigName: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, textAlign: 'center' },
});

// Forward modal styles
const fwd = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '70%' },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', marginBottom: 16 },
  loading: { textAlign: 'center', fontFamily: fonts.body, color: colors.inkSoft, paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  empty: { textAlign: 'center', fontFamily: fonts.body, color: colors.inkSoft, paddingVertical: 20 },
  cancelBtn: { alignItems: 'center', paddingTop: 14 },
  cancelBtnText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkSoft },
});
