-- Extend the lead_actions.action enum so the lead detail view can record two
-- real workflow states that previously had dead, no-op buttons:
--   'contacted' — the rep has reached out (Mark Contacted / Gmail send)
--   'note'      — free-text internal note persisted from the Notes box
--
-- Existing values ('saved','dismissed','pushed_sfdc') are preserved.

ALTER TABLE public.lead_actions
  DROP CONSTRAINT IF EXISTS lead_actions_action_check;

ALTER TABLE public.lead_actions
  ADD CONSTRAINT lead_actions_action_check
  CHECK (action IN ('saved', 'dismissed', 'pushed_sfdc', 'contacted', 'note'));
