# Financial deletion endpoint

- Workflow: `ZGVO0SfsJLHa5olq`, M7 | API | Excluir lançamento.
- POST path: `m7-financeiro-excluir/m7-financeiro/excluir`.
- Existing Edge Function performs JWT and Financial permission checks before forwarding the ID with its server-only token. No changes to login, CRM, or other Financial workflows.
- The versioned workflow intentionally contains a nonfunctional token placeholder. Inject the existing server token privately into the authorization node before publication; never commit it.
- Exact, unique ID lookup is required. Missing IDs return 400, invalid auth 401, missing records 404, duplicates/unsafe row indexes 409, Sheet errors 502.
- Removal clears only the matching row's contents, rather than shifting rows. Dashboard ignores blank IDs. This applies to one installment only, not all recurring entries.
- External manual sorting/row manipulation during deletion must be avoided; Sheets does not provide a transactional compare-and-delete operation.
- Validation: SDK validation; local regression tests; n8n tests with all Sheet writes mocked, including success, authorization, empty ID, missing ID, duplicate ID, header protection and write failure. Live read-only lookup of a unique nonexistent test ID returned 404 without reaching the write node.
- No real Financial record was deleted as part of testing.
