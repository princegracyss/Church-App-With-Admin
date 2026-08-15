/**
 * BirthdayContext
 *
 * On every app launch (after the user is authenticated), this context:
 *
 *  • Fetches today's birthdays (family-scoped for members; all-parish for staff).
 *  • For each birthday person found it decides what the *current* user should see:
 *
 *    ┌─────────────────────────────────────────────────────────────────┐
 *    │ Current user IS the birthday person                             │
 *    │   → show the BirthdayModal popup with song (existing behaviour) │
 *    ├─────────────────────────────────────────────────────────────────┤
 *    │ Current user is NOT the birthday person                         │
 *    │   → insert a BIRTHDAY notification (idempotent) with a          │
 *    │     `can_send_wish: true` flag in metadata, so                  │
 *    │     NotificationsScreen can render a "Send Wishes" CTA          │
 *    └─────────────────────────────────────────────────────────────────┘
 *
 * Exposed via useBirthday():
 *   { birthdayPeople, modalVisible, dismiss }
 *   – birthdayPeople  : array of member rows whose birthday is today AND
 *                        who are NOT the current user (used by SendWishModal)
 *   – modalVisible    : true only when the current user is a birthday person
 *   – dismiss         : close the modal + stop song
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import api from '../services/api';
import { useAuth } from './AuthContext';

const BirthdayContext = createContext(null);

// ── helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Deduplication key for BIRTHDAY broadcast notifications (non-self).
function dedupTitle(member) {
  return `🎂 Happy Birthday, ${member.first_name}! [${todayStr()}]`;
}

// ── provider ───────────────────────────────────────────────────────────────────
export function BirthdayProvider({ children }) {
  const { user, isAdmin, guestMember } = useAuth();

  // People whose birthday is today and who are NOT the current user.
  // These are the people others can send wishes to.
  const [birthdayPeople, setBirthdayPeople] = useState([]);

  // True only when the current user IS themselves a birthday person.
  const [modalVisible, setModalVisible] = useState(false);

  // The current user's own birthday row (for the modal).
  const [selfBirthday, setSelfBirthday] = useState([]);

  const checkedKey = useRef(null);

  useEffect(() => {
    if (!user) {
      setBirthdayPeople([]);
      setSelfBirthday([]);
      setModalVisible(false);
      checkedKey.current = null;
      return;
    }

    const key = `${user.id}:${todayStr()}`;
    if (checkedKey.current === key) return;
    checkedKey.current = key;

    runBirthdayCheck(isAdmin, guestMember);
  }, [user]);

  const runBirthdayCheck = async (isAdminNow, guestMemberNow) => {
    try {
      // Always fetch all-parish birthdays for notification purposes.
      // Family-scoped fetch (allParish=false) would miss members outside the
      // current user's family, so their birthday notifications would never be
      // inserted. Guests have no auth session so they skip the insert anyway.
      const people = await api.getTodaysBirthdays(true);
      if (!people || people.length === 0) return;

      // ── Resolve the current user's own member id ──────────────────────────
      // Priority:
      //   1. Guest mode  → guestMember.id  (synthetic session, no Supabase auth)
      //   2. Real session → user.member_id  (set by AuthContext via currentProfile)
      //   3. Fallback    → direct profile query (belt-and-braces)
      let myMemberId = null;
      if (guestMemberNow) {
        myMemberId = guestMemberNow.id;
      } else {
        // user object is the merged { id, ...profile } built in api.onAuthChange.
        // For staff who have no linked member, member_id is null/undefined — that
        // is correct; they see all birthdays as "others".
        myMemberId = user?.member_id ?? null;
        if (!myMemberId) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('member_id')
              .eq('id', authUser.id)
              .single();
            myMemberId = profile?.member_id ?? null;
          }
        }
      }

      console.log('[BirthdayContext] myMemberId:', myMemberId,
        '| people found:', people.map((p) => p.id));

      // Split: birthday person sees the modal; everyone else gets a notification.
      const selfRows   = myMemberId ? people.filter((p) => p.id === myMemberId) : [];
      const othersRows = myMemberId ? people.filter((p) => p.id !== myMemberId) : people;

      // ── Birthday person path: show modal ──────────────────────────────────
      if (selfRows.length > 0) {
        setSelfBirthday(selfRows);
        setModalVisible(true);
      }

      // ── Others' birthdays: insert a BIRTHDAY notification (idempotent) ────
      // We need a Supabase auth user to satisfy the RLS insert policy
      // (notifications_birthday_insert requires auth.uid() is not null).
      // Guest members have no Supabase session — skip the insert for them;
      // the notification was already created when a staff/authenticated member
      // triggered the birthday check first.
      const { data: { user: authUser } } = await supabase.auth.getUser();

      for (const member of othersRows) {
        const title = dedupTitle(member);

        // Check for existing notification (dedup). The RLS read policy requires
        // auth.uid() is not null — so this only works for authenticated users.
        // For guests we skip both the check and the insert.
        if (!authUser) {
          console.log('[BirthdayContext] guest session — skipping notification insert for', member.first_name);
          continue;
        }

        const { data: existing, error: readErr } = await supabase
          .from('notifications')
          .select('id')
          .eq('title', title)
          .eq('type', 'BIRTHDAY')
          .limit(1);

        if (readErr) {
          console.warn('[BirthdayContext] dedup read failed:', readErr.message);
        }

        if (!existing || existing.length === 0) {
          const age = member.date_of_birth
            ? new Date().getFullYear() - new Date(member.date_of_birth).getFullYear()
            : null;
          const message = age
            ? `Wishing ${member.first_name} ${member.last_name} a blessed ${age}th birthday! 🎉`
            : `Wishing ${member.first_name} ${member.last_name} a very happy birthday! 🎉`;

          // Expire at 23:59:59 tonight so the notification vanishes after today.
          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);

          const { error: insertErr } = await supabase.from('notifications').insert({
            title,
            message,
            type: 'BIRTHDAY',
            target: 'ALL',
            created_by: authUser.id,
            expires_at: endOfDay.toISOString(),
            metadata: {
              can_send_wish: true,
              birthday_member_id: member.id,
              birthday_member_name: `${member.first_name} ${member.last_name}`,
            },
          });

          if (insertErr) {
            console.warn('[BirthdayContext] notification insert failed:', insertErr.message,
              '| Make sure migration 006_wish_notifications.sql has been applied.');
          } else {
            console.log('[BirthdayContext] inserted BIRTHDAY notification for', member.first_name);
          }
        } else {
          console.log('[BirthdayContext] BIRTHDAY notification already exists for', member.first_name);
        }
      }

      setBirthdayPeople(othersRows);
    } catch (e) {
      console.warn('[BirthdayContext] check failed:', e?.message ?? e);
    }
  };

  const dismiss = () => {
    setModalVisible(false);
    setSelfBirthday([]);
  };

  return (
    <BirthdayContext.Provider value={{
      birthdayPeople,       // others whose birthday is today
      selfBirthday,         // rows for the current user (used by BirthdayModal)
      modalVisible,
      dismiss,
    }}>
      {children}
    </BirthdayContext.Provider>
  );
}

export const useBirthday = () => useContext(BirthdayContext);
