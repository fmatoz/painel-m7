# Administrative sale attribution

Only active administrators with CRM access can choose another active CRM seller.
Ordinary SDR sales retain the signed-in user as seller; attempts to select another
seller fail closed. The browser supplies only a requested ID, never trusted names,
roles or attribution. The n8n authorizer resolves both profiles from the panel's
Supabase under the caller's JWT and strips forged trusted fields.

The private PostgreSQL API independently checks administrator status and the
verified target. The existing commission trigger still snapshots the current
rate and creates a pending sale. New nullable created_by/created_by_name columns
record the actual actor; the update trigger preserves them. Existing sales are
not backfilled or reassigned.

The seller directory is read-only, administrator-only, and contains IDs/names
of active CRM users. Normal operations still query only the current profile;
delegated creation fetches the actor and chosen seller. No new polling or AI.

Deployment on 2026-09-28:
- Additive migration 20260928180000_admin_sale_seller.sql, with lock/statement timeouts.
- Existing n8n sales workflow vEkEiZ10faCfva34: two node parameter updates only.
- Frontend field and history attribution in src/routes/vendas.tsx.
- SDK warns about existing Supabase publishable apikey headers. These are public
  client keys, not service-role secrets; no new private credential was introduced.

Verification:
- Eleven local authorization/normalization tests.
- Existing sales regression SQL plus tests/sales-delegation.sql ran inside
  BEGIN/ROLLBACK with the migration; verified attribution, actor audit, seller
  visibility, cross-SDR isolation, rejection of disabled/unverified targets,
  commission snapshot and ordinary own-sale behavior.
- Original row count/hash unchanged after rollback and deployment.
- Build and targeted frontend lint.
- No real sale was created and no user message sent during testing.

Rollback: revert frontend and restore the preceding n8n workflow version, then
restore the previous sales_api/prepare_sdr_sale definitions from migration
20260922010000_route_sales_through_verified_backend.sql if necessary. Keep the
new audit columns and audit-preserving touch trigger so attribution is not lost.
Never delete sales or change their seller to roll back this feature.
