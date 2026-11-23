BEGIN;
CREATE POLICY crm_presence_read ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = 'm7-crm-presence-v1' AND extension = 'presence'
  AND EXISTS (SELECT 1 FROM public.app_users u WHERE u.user_id = auth.uid()
    AND u.active AND (u.can_crm OR u.is_admin)));
CREATE POLICY crm_presence_write ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (realtime.topic() = 'm7-crm-presence-v1' AND extension = 'presence'
  AND EXISTS (SELECT 1 FROM public.app_users u WHERE u.user_id = auth.uid()
    AND u.active AND (u.can_crm OR u.is_admin)));
COMMIT;
