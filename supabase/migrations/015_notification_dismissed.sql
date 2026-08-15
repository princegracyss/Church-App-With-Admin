-- Migration 015: Per-user notification dismissal
--
-- The existing design uses notification_reads to track read/unread status.
-- When a member "deletes" a notification it should disappear from their view
-- permanently — but the notification row itself must stay in the DB for other
-- users.  We add a `dismissed` flag to notification_reads so a member can
-- soft-delete a notification for themselves without affecting anyone else.
--
-- Apply after migrations 001-014.

alter table notification_reads
  add column if not exists dismissed boolean not null default false;
