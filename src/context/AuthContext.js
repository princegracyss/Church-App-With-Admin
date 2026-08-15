import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api, { setGuestMember as setApiGuestMember, clearGuestMember as clearApiGuestMember } from '../services/api';
import { STAFF_ROLES, Role, canManageUsers, canApproveCertificates, canReassignRoles, creatableRolesFor, canEditUnitMembers } from '../theme/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // memberMode: an admin/staff user is viewing the app as a plain member.
  // Their Supabase session and DB role are unchanged; only the UI privilege
  // flags are overridden so they see exactly what a member sees.
  const [memberMode, setMemberMode] = useState(false);

  // guestMember: set when OTP is disabled and the member was identified by
  // lookup only (no Supabase session). Acts as a read-only member dashboard.
  // Shape matches a `members` row so DashboardScreen / MemberProfileScreen
  // can render it without any changes.
  const [guestMember, setGuestMember] = useState(null);

  // Keeps the session in sync with Supabase Auth (survives app restarts).
  useEffect(() => {
    const unsubscribe = api.onAuthChange((u) => {
      setUser(u);
      setInitializing(false);
      // If a real Supabase session arrives, clear any guest session.
      if (u) setGuestMember(null);
      // If the user changes (logout/login) always reset member mode.
      setMemberMode(false);
    });
    return unsubscribe;
  }, []);

  // Admin password login
  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await api.login(email, password);
      return true;
    } catch (e) {
      setError(e.message?.includes('auth/') ? 'Invalid email or password' : e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Member login — phone OTP request
  const requestOtp = useCallback(async (phone) => {
    setLoading(true);
    setError(null);
    try {
      await api.requestOtp(phone);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Member login — phone OTP verify
  const verifyOtp = useCallback(async (phone, token) => {
    setLoading(true);
    setError(null);
    try {
      await api.verifyOtp(phone, token);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Member login — email OTP request
  const requestEmailOtp = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      await api.requestMemberOtpByEmail(email);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Member login — email OTP verify
  // memberId: optional UUID of the resolved member (from the lookup step),
  // forwarded to the API so it can link profiles.member_id if not yet set.
  const verifyEmailOtp = useCallback(async (email, token, memberId = null) => {
    setLoading(true);
    setError(null);
    try {
      await api.verifyMemberEmailOtp(email, token, memberId);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Guest login — OTP disabled path. Accepts the member row returned by
  // lookupMemberByIdentifier. Creates a synthetic user object so the navigator
  // opens the dashboard without a Supabase session.
  const loginAsGuest = useCallback((memberRow) => {
    setGuestMember(memberRow);         // React state (for screens)
    setApiGuestMember(memberRow);      // api module store (for api calls)
    // Synthetic user: id is the member's DB id, role is always 'member'.
    // No real auth token — only member-facing screens are accessible.
    setUser({ id: memberRow.id, role: Role.MEMBER, member_id: memberRow.id, is_active: true });
  }, []);

  const logout = useCallback(async () => {
    setMemberMode(false);
    setGuestMember(null);              // React state
    clearApiGuestMember();             // api module store
    // Only sign out of Supabase if there is a real session.
    await api.logout();
  }, []);

  // An admin/staff user switches to member view — no re-auth needed.
  const enterMemberMode = useCallback(() => setMemberMode(true), []);
  const exitMemberMode = useCallback(() => setMemberMode(false), []);

  const dbRole = user?.role;

  // When in memberMode, treat the user as a plain member regardless of DB role.
  const effectiveRole = memberMode ? Role.MEMBER : dbRole;

  const isAdmin = !!user && !memberMode && STAFF_ROLES.includes(dbRole);
  const isSuperAdmin = !memberMode && dbRole === Role.SUPER_ADMIN;
  const isParishPriest = !memberMode && dbRole === Role.PARISH_PRIEST;
  const isChurchSecretary = !memberMode && dbRole === Role.CHURCH_SECRETARY;
  // unit_admin: BCC-scoped edit access only; not in STAFF_ROLES.
  const isUnitAdmin = !!user && !memberMode && dbRole === Role.UNIT_ADMIN;

  const canManageUsersFlag = !!user && !memberMode && canManageUsers(dbRole);
  const creatableRoles = user && !memberMode ? creatableRolesFor(dbRole) : [];
  const canApproveCerts = !!user && !memberMode && canApproveCertificates(dbRole);
  const canReassignUserRoles = !!user && !memberMode && canReassignRoles(dbRole);
  const isUnitAdminEditCapable = !!user && !memberMode && canEditUnitMembers(dbRole);

  // True when the signed-in account has a staff DB role (used to show "Exit member view" button).
  // unit_admin is included here so they also get the "Exit member view" toggle if needed.
  const isStaffAccount = !!user && (STAFF_ROLES.includes(dbRole) || dbRole === Role.UNIT_ADMIN);

  return (
    <AuthContext.Provider
      value={{
        user,
        initializing,
        loading,
        error,
        login,
        loginAsGuest,
        requestOtp,
        verifyOtp,
        requestEmailOtp,
        verifyEmailOtp,
        logout,
        memberMode,
        enterMemberMode,
        exitMemberMode,
        isStaffAccount,
        isAdmin,
        isSuperAdmin,
        isParishPriest,
        isChurchSecretary,
        isUnitAdmin,
        isUnitAdminEditCapable,
        canManageUsers: canManageUsersFlag,
        creatableRoles,
        canApproveCertificates: canApproveCerts,
        canReassignUserRoles,
        effectiveRole,
        // Guest mode — member identified without OTP / Supabase session.
        guestMember,
        isGuest: !!guestMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
