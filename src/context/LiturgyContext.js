/**
 * LiturgyContext
 *
 * On every app launch (after the user is authenticated) this context checks
 * whether the current user's BCC unit has a liturgy assignment for TODAY.
 * If it does — and no reminder notification has been sent yet — it inserts
 * a LITURGY_REMINDER notification (idempotent, deduped by title+date so it
 * fires at most once per day per unit).
 *
 * Staff (isAdmin / isParishPriest) see reminders for ALL units that have a
 * liturgy today so they always stay informed.
 *
 * Exposed via useLiturgy():
 *   (currently just a context mount — consumers use api.getLiturgyAssignments
 *    directly, this context only drives the reminder side-effect)
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import api from '../services/api';
import { useAuth } from './AuthContext';

const LiturgyContext = createContext(null);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function LiturgyProvider({ children }) {
  const { user, isAdmin, isParishPriest } = useAuth();
  const checkedKey = useRef(null);

  useEffect(() => {
    if (!user) { checkedKey.current = null; return; }

    const key = `${user.id}:${todayStr()}`;
    if (checkedKey.current === key) return;
    checkedKey.current = key;

    runReminderCheck(isAdmin || isParishPriest);
  }, [user, isAdmin, isParishPriest]);

  const runReminderCheck = async (isStaff) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return; // guests have no session — skip

      const today = todayStr();

      // Fetch today's assignments
      const { data: todaysAssignments, error } = await supabase
        .from('liturgy_assignments')
        .select('*')
        .eq('liturgy_date', today);

      if (error || !todaysAssignments || todaysAssignments.length === 0) return;

      // Determine which assignments this user should be reminded about.
      // Staff → all of today's assignments.
      // Member → their own BCC unit OR any org they belong to.
      let relevantAssignments = todaysAssignments;
      if (!isStaff) {
        // Resolve the member's BCC unit name and org IDs.
        let myBcc = null;
        let myOrgIds = [];
        try {
          const profile = await supabase
            .from('profiles')
            .select('member_id')
            .eq('id', authUser.id)
            .single();
          if (profile.data?.member_id) {
            const memberId = profile.data.member_id;
              const [memberRow, orgRows] = await Promise.all([
                // Join families so we get BCC from either the member row or the family row.
                supabase.from('members')
                  .select('basic_christian_community, families(basic_christian_community)')
                  .eq('id', memberId).single(),
                supabase.from('organization_members').select('organization_id').eq('member_id', memberId),
              ]);
              // Prefer member-level BCC; fall back to family-level BCC.
              myBcc    = memberRow.data?.basic_christian_community
                         || memberRow.data?.families?.basic_christian_community
                         || null;
              myOrgIds = (orgRows.data || []).map((r) => r.organization_id);
          }
        } catch (_) {}

        relevantAssignments = todaysAssignments.filter((a) =>
          (a.bcc_unit_name && a.bcc_unit_name === myBcc) ||
          (a.org_id        && myOrgIds.includes(a.org_id))
        );
        if (relevantAssignments.length === 0) return;
      }

      // For each relevant assignment, insert a LITURGY_REMINDER notification
      // if one doesn't already exist for today (deduped by title).
      for (const assignment of relevantAssignments) {
        // Use bcc_unit_name or org_name — whichever is set.
        const hostName = assignment.bcc_unit_name || assignment.org_name || 'Parish';
        const title = `🔔 Liturgy Reminder — ${hostName} [${today}]`;

        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('title', title)
          .eq('type', 'LITURGY_REMINDER')
          .limit(1);

        if (existing && existing.length > 0) {
          console.log('[LiturgyContext] reminder already exists for', hostName);
          continue;
        }

        const message = `Today is the day! ${hostName} hosts the liturgy on ${formatDate(today)}.${assignment.notes ? ' ' + assignment.notes : ''}`;

        const { error: insertErr } = await supabase.from('notifications').insert({
          title,
          message,
          type: 'LITURGY_REMINDER',
          target: 'ALL',
          created_by: authUser.id,
          metadata: {
            liturgy_assignment_id: assignment.id,
            host_name:             hostName,
            liturgy_date:          today,
          },
        });

        if (insertErr) {
          console.warn('[LiturgyContext] reminder insert failed:', insertErr.message);
        } else {
          console.log('[LiturgyContext] inserted LITURGY_REMINDER for', hostName);
        }
      }
    } catch (e) {
      console.warn('[LiturgyContext] reminder check failed:', e?.message ?? e);
    }
  };

  return (
    <LiturgyContext.Provider value={{}}>
      {children}
    </LiturgyContext.Provider>
  );
}

export const useLiturgy = () => useContext(LiturgyContext);
