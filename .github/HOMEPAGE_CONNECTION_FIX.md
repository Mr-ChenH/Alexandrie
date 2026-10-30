# Homepage connection failure handling

The browser error `[GET] http://localhost:8201/api/users/@me: <no response> Failed to fetch` was caused by an unavailable API service and an unhandled current-user fetch in the dashboard shell. Both localhost and 127.0.0.1 refused connections on port 8201 during diagnosis; this was not an HTTP authentication response.

The public landing page does not require a current-user request. The dashboard shell now catches failures, retains local data, and shows a translated connection notice with a retry button. A successful retry refreshes nodes and preferences and clears the notice. User-fetch failures are Error objects with stack information, rather than thrown strings. Administrator route checks also contain failed account lookups and fall back to the dashboard without granting administrator access.

This change does not mark offline requests as successful, clear the logged-in marker, delete local notes or drafts, substitute a mock account, or alter the configured API address. Running the actual Go backend and its configured database is still required for sign-in and server synchronization. No backend or database was provisioned with guessed settings.

Validation completed:

- Targeted ESLint checks passed for dashboard, user store, authentication middleware, and all eight added locale dictionaries.
- Dashboard Stylelint and `vue-tsc --noEmit` passed.
- Nuxt production build completed successfully, including Nitro and PWA output.
- Ten existing API-base, autosave, and draft tests passed, using TypeScript-transpiled temporary test files without modifying their source.
- Direct browser navigation to the real public homepage returned HTTP 200 with no page errors, failed requests, or console errors.
- An isolated browser with mocked API responses verified failed current-user requests, visible Chinese retry UI, a contained failed retry, a successful retry clearing the notice, and retention of a local draft. No uncaught page errors occurred. At a 390px viewport with the navigation drawer closed, the notice fit in the workspace and the document width remained 390px.

Local development service was restarted on 127.0.0.1:3000 after verification. Port 8201 remained unavailable at completion. Dependency verification generated pnpm lock/workspace files; these were retained outside the repository, and package.json and bun.lock were not changed. Existing unrelated workspace edits remain intact.
