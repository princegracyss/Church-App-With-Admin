import React, { useState } from 'react';
import {
  View, Text, TextInput, Image, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, ScrollView, Platform, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { useParish, useTheme } from '../context/ParishContext';
import api from '../services/api';

// ─── helpers ────────────────────────────────────────────────────────────────
function isLikelyE164(v)    { return /^\+[1-9]\d{7,14}$/.test(v.trim()); }
function isLikelyEmail(v)   { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isLikelyMemberId(v){ return /^MEM-\d+$/i.test(v.trim()); }

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * 0.75);
  const g = Math.floor(((n >> 8) & 0xff) * 0.75);
  const b = Math.floor((n & 0xff) * 0.75);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Admin (password) login ──────────────────────────────────────────────────
function AdminLoginForm() {
  const { login, loading, error } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <>
      <Text style={styles.fieldHint}>
        For staff accounts (Admin, Priest, Secretary). Created by the parish office.
      </Text>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="name@parish.org"
        placeholderTextColor={colors.inkSoft}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="next"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="••••••••"
        placeholderTextColor={colors.inkSoft}
        secureTextEntry
        returnKeyType="done"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => !loading && email && password && login(email, password)}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: t.primary }, (loading || !email || !password) && styles.buttonDisabled]}
        onPress={() => login(email, password)}
        disabled={loading || !email || !password}
      >
        <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Member login ─────────────────────────────────────────────────────────────
//
// Flow:
//   Step 'lookup'      — user enters phone / email / member-ID
//   Step 'disambiguate'— phone or email returned multiple matches; ask for member ID
//   Step 'otp'         — send & verify OTP (only active when memberOtpEnabled is true
//                        in Parish Settings, toggled by Super Admin)
//
// Rules:
//   • Member ID (MEM-xxxx) → always unique → skip picker, go straight to OTP/confirm
//   • Phone / email → 1 result  → go straight to OTP/confirm
//   • Phone / email → 2+ results → show "enter your member ID" step to narrow down
function MemberLoginForm() {
  const { requestOtp, verifyOtp, requestEmailOtp, verifyEmailOtp, loginAsGuest, loading, error } = useAuth();
  const { settings } = useParish();
  const t = useTheme();
  const otpEnabled = !!settings.memberOtpEnabled;

  const [step, setStep] = useState('lookup');        // 'lookup' | 'disambiguate' | 'otp'
  const [identifier, setIdentifier] = useState('MEM-');  // pre-filled so user just types the number
  const [disambigId, setDisambigId] = useState('MEM-');  // member ID entered to disambiguate — pre-filled
  const [lookupError, setLookupError] = useState('');
  const [chosen, setChosen] = useState(null);         // resolved member record
  const [otpTarget, setOtpTarget] = useState('');
  const [otpType, setOtpType] = useState('phone');    // 'phone' | 'email'
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const busy = loading || localLoading;

  // ── resolve a single member ──
  // OTP enabled  → collect OTP target and advance to send/verify step.
  // OTP disabled → call loginAsGuest immediately; navigator opens dashboard.
  const proceedWithMember = (member) => {
    if (!otpEnabled) {
      loginAsGuest(member);
      return;
    }
    if (member.mobile && isLikelyE164(member.mobile)) {
      setOtpTarget(member.mobile);
      setOtpType('phone');
    } else if (member.email) {
      setOtpTarget(member.email);
      setOtpType('email');
    } else {
      setLookupError('This member record has no mobile or email on file. Contact the parish office.');
      return;
    }
    setChosen(member);
    setStep('otp');
  };

  // ── Step A: initial identifier lookup ──
  const lookup = async () => {
    const val = identifier.trim();
    if (!val) return;
    setLookupError('');
    setLocalLoading(true);
    try {
      if (isLikelyMemberId(val)) {
        // Member ID is always unique — look it up directly, no picker needed.
        const results = await api.lookupMemberByIdentifier(val);
        if (!results.length) {
          setLookupError('No active member found with that member ID. Contact the parish office.');
          return;
        }
        proceedWithMember(results[0]);
      } else {
        // Phone or email — may have duplicates.
        const results = await api.lookupMemberByIdentifier(val);
        if (!results.length) {
          setLookupError('No active member found. Check your entry or contact the parish office.');
          return;
        }
        if (results.length === 1) {
          proceedWithMember(results[0]);
        } else {
          // Multiple people share this phone/email — ask for member ID to narrow down.
          setStep('disambiguate');
        }
      }
    } catch (e) {
      setLookupError(e.message || 'Lookup failed. Try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  // ── Step B: member ID disambiguation ──
  const disambiguate = async () => {
    const mid = disambigId.trim();
    if (!mid || mid === 'MEM-') return;
    setLookupError('');
    setLocalLoading(true);
    try {
      const results = await api.lookupMemberByIdentifier(identifier.trim(), mid);
      if (!results.length) {
        setLookupError('No match found. Make sure the member ID belongs to this phone/email.');
        return;
      }
      proceedWithMember(results[0]);
    } catch (e) {
      setLookupError(e.message || 'Lookup failed. Try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  // ── Step C: send OTP ──
  const sendOtp = async () => {
    setLocalLoading(true);
    try {
      if (otpType === 'phone') {
        await api.requestMemberOtpByPhone(otpTarget);
      } else {
        await api.requestMemberOtpByEmail(otpTarget);
      }
      setSent(true);
    } catch (e) {
      setLookupError(e.message || 'Could not send code.');
    } finally {
      setLocalLoading(false);
    }
  };

  // ── Step C: verify OTP ──
  const verify = async () => {
    if (otpType === 'phone') {
      await verifyOtp(otpTarget, code);
    } else {
      // Pass the resolved member's UUID so the API can link profiles.member_id
      // if the email-OTP trigger didn't auto-link it.
      await verifyEmailOtp(otpTarget, code, chosen?.id ?? null);
    }
  };

  const reset = () => {
    setStep('lookup'); setIdentifier('MEM-'); setDisambigId('MEM-');
    setChosen(null); setOtpTarget(''); setCode('');
    setSent(false); setLookupError('');
  };

  // ── Render: Step A — initial entry ──
  if (step === 'lookup') {
    // If the user has typed "MEM-" or more, show a secondary hint
    const isMemberIdEntry = identifier.toUpperCase().startsWith('MEM-');
    return (
      <>
        <Text style={styles.fieldHint}>
          Enter your registered mobile number, email address, or member ID (MEM-xxxx).
        </Text>
        <Text style={styles.label}>Mobile / Email / Member ID</Text>
        <View style={styles.memberIdRow}>
          <TextInput
            style={[styles.input, styles.memberIdInput]}
            placeholder="MEM-1004"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            value={identifier}
            onChangeText={(v) => {
              const up = v.toUpperCase();
              if (up.startsWith('MEM-')) {
                // Typing a member ID — keep it uppercase.
                setIdentifier(up);
              } else if (up === 'M' || up === 'ME' || up === 'MEM') {
                // User backspaced into the prefix — clear fully so they can
                // type a phone number or email instead.
                setIdentifier('');
              } else {
                // Phone / email — leave as typed.
                setIdentifier(v);
              }
            }}
            onSubmitEditing={lookup}
            returnKeyType="search"
          />
          {identifier !== 'MEM-' && (
            <TouchableOpacity
              style={styles.memberIdClear}
              onPress={() => setIdentifier('MEM-')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          )}
        </View>
        {isMemberIdEntry && identifier !== 'MEM-' && (
          <Text style={styles.memberIdHint}>Enter your member number after MEM-</Text>
        )}
        {(lookupError || error) ? <Text style={styles.error}>{lookupError || error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: t.primary }, (busy || !identifier.trim() || identifier.trim() === 'MEM-') && styles.buttonDisabled]}
          onPress={lookup}
          disabled={busy || !identifier.trim() || identifier.trim() === 'MEM-'}
        >
          <Text style={styles.buttonText}>{busy ? 'Looking up…' : 'Continue'}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>No password needed — we'll send a one-time code to your registered contact.</Text>
      </>
    );
  }

  // ── Render: Step B — disambiguate duplicate phone/email ──
  if (step === 'disambiguate') {
    return (
      <>
        <Text style={styles.pickTitle}>Multiple accounts found</Text>
        <Text style={styles.fieldHint}>
          More than one member is registered with that {isLikelyE164(identifier.trim()) ? 'phone number' : 'email address'}.{'\n'}
          Please enter your <Text style={{ fontWeight: '700', color: colors.ink }}>Member ID</Text> (e.g. MEM-1004) to confirm which account is yours.
        </Text>
        <Text style={styles.label}>Your Member ID</Text>
        <TextInput
          style={styles.input}
          placeholder="MEM-1004"
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="characters"
          value={disambigId}
          onChangeText={(v) => {
            // Always keep MEM- prefix; if user clears past it, restore it
            const up = v.toUpperCase();
            if (up.startsWith('MEM-')) {
              setDisambigId(up);
            } else {
              setDisambigId('MEM-' + v.replace(/^mem-?/i, ''));
            }
          }}
          onSubmitEditing={disambiguate}
          returnKeyType="search"
        />
        {(lookupError || error) ? <Text style={styles.error}>{lookupError || error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: t.primary }, (busy || disambigId.trim() === 'MEM-') && styles.buttonDisabled]}
          onPress={disambiguate}
          disabled={busy || disambigId.trim() === 'MEM-'}
        >
          <Text style={styles.buttonText}>{busy ? 'Checking…' : 'Confirm identity'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={reset} disabled={busy}>
          <Text style={[styles.linkBtnText, { color: t.primary }]}>← Try a different contact</Text>
        </TouchableOpacity>
      </>
    );
  }

  // ── Render: Step C — OTP send & verify (only reached when otpEnabled is true) ──
  const maskedTarget = otpType === 'phone'
    ? otpTarget.replace(/(\+\d{2})\d+(\d{3})/, '$1•••••$2')
    : otpTarget.replace(/(.{2}).+(@.+)/, '$1•••$2');

  return (
    <>
      <Text style={styles.pickTitle}>{chosen?.first_name} {chosen?.last_name}</Text>
      <Text style={styles.fieldHint}>
        {sent
          ? `Enter the 6-digit code sent to ${maskedTarget}`
          : `We'll send a one-time code to ${maskedTarget}`}
      </Text>

      {sent && (
        <>
          <Text style={styles.label}>6-digit code</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={colors.inkSoft}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => !busy && code.length === 6 && verify()}
          />
        </>
      )}

      {(lookupError || error) ? <Text style={styles.error}>{lookupError || error}</Text> : null}

      {!sent ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: t.primary }, busy && styles.buttonDisabled]}
          onPress={sendOtp}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? 'Sending…' : `Send code via ${otpType === 'phone' ? 'SMS' : 'email'}`}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: t.primary }, (busy || code.length !== 6) && styles.buttonDisabled]}
            onPress={verify}
            disabled={busy || code.length !== 6}
          >
            <Text style={styles.buttonText}>{busy ? 'Verifying…' : 'Verify & sign in'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => { setSent(false); setCode(''); }} disabled={busy}>
            <Text style={[styles.linkBtnText, { color: t.primary }]}>Resend code</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.linkBtn} onPress={reset} disabled={busy}>
        <Text style={[styles.linkBtnText, { color: t.primary }]}>← Start over</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Root login screen ───────────────────────────────────────────────────────
// Two top-level modes:
//   'member' — passwordless flow (default, for parishioners)
//   'admin'  — email + password (for staff accounts)
export default function LoginScreen() {
  const [mode, setMode] = useState('member'); // 'member' | 'admin'
  const { settings } = useParish();
  const primary = settings.primaryColor;
  const secondary = settings.secondaryColor;

  return (
    <LinearGradient colors={[darken(primary), primary]} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / crest */}
          <View style={styles.crestWrap}>
            <View style={[styles.crest, { backgroundColor: secondary + '33', borderColor: secondary }]}>
              {settings.logoUri ? (
                <Image key={settings.logoUri} source={{ uri: settings.logoUri }} style={styles.logoImg} />
              ) : (
                <Ionicons name="business" size={30} color={secondary} />
              )}
            </View>
            <Text style={styles.title}>Parish Connect</Text>
            <Text style={[styles.subtitle, { color: secondary }]}>{settings.name}</Text>
            {!!settings.description && (
              <Text style={[styles.subtitleSub, { color: secondary }]}>{settings.description}</Text>
            )}
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Mode toggle */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, mode === 'member' && { backgroundColor: primary }]}
                onPress={() => setMode('member')}
              >
                <Ionicons name="person-outline" size={15} color={mode === 'member' ? colors.white : colors.inkSoft} />
                <Text style={[styles.modeTabText, mode === 'member' && styles.modeTabTextActive]}>Member Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, mode === 'admin' && { backgroundColor: primary }]}
                onPress={() => setMode('admin')}
              >
                <Ionicons name="shield-outline" size={15} color={mode === 'admin' ? colors.white : colors.inkSoft} />
                <Text style={[styles.modeTabText, mode === 'admin' && styles.modeTabTextActive]}>Admin Login</Text>
              </TouchableOpacity>
            </View>

            {mode === 'member' ? <MemberLoginForm /> : <AdminLoginForm />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 40 },
  crestWrap: { alignItems: 'center', marginTop: 50, marginBottom: 30 },
  crest: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  subtitleSub: { fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  card: { backgroundColor: colors.cream, marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, marginBottom: 40 },
  // Mode tabs
  modeTabs: { flexDirection: 'row', backgroundColor: colors.stone, borderRadius: radius.pill, padding: 4, marginBottom: 16 },
  modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.pill },
  modeTabActive: {},
  modeTabText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft },
  modeTabTextActive: { color: colors.white },
  // Fields
  fieldHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginBottom: 12, lineHeight: 17 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.divider },
  error: { color: colors.danger, fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 10 },
  button: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 15 },
  linkBtn: { alignItems: 'center', marginTop: 14 },
  linkBtnText: { fontFamily: fonts.bodyMedium, fontSize: 12.5 },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, textAlign: 'center', marginTop: 14, lineHeight: 16 },
  // Disambiguation picker
  pickTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.ink, marginBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.sm, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.divider },
  pickName: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.ink },
  pickSub: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  // Member ID entry row (input + clear button overlay)
  memberIdRow: { position: 'relative' },
  memberIdInput: { paddingRight: 38 },  // room for clear icon
  memberIdClear: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center',
  },
  memberIdHint: {
    fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft,
    marginTop: 5, marginLeft: 2,
  },
});
