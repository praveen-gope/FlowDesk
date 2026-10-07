# FlowDesk on Netlify

## Deployment model

The Netlify build serves the existing design with Identity authentication, JavaScript CRM Functions and managed PostgreSQL. Django remains available for local development, but it does not run in Netlify. These are separate databases and authentication systems.

Canonical login: `/sign-in`. Old `/html/sign-in` and `/html/sign-in.html` links redirect there. Public lead and support forms remain public. Workspace HTML is built into `.build/workspace` and bundled only with the authenticated workspace Function, never copied into the public `dist` directory. Each private API verifies Identity, loads the current active database account and enforces role/record scope. Browser metadata cannot grant roles.

## Netlify setup

1. Connect the GitHub repository and select the branch containing this migration.
2. Use repository root as base, `npm run build` as build command, `dist` as publish directory, and `netlify/functions` as Functions directory. The committed netlify.toml supplies these settings. Remove the previous static-copy build command. Deploy by Git/build, not by dragging only dist to Netlify.
3. Keep Identity enabled. Set registration to invite-only for this internal CRM. Confirm the administrator account and set its password through Identity. Django passwords are not valid here.
4. Confirm Data & Storage > Database is provisioned. `@netlify/database` resolves the managed connection. Do not expose NETLIFY_DB_URL in HTML/JavaScript or put it in Git.
5. The first-admin email defaults to the project owner, `kr.praveengope@gmail.com`. It must be a confirmed Identity account. For a different owner, set FLOWDESK_FIRST_ADMIN_EMAIL with Functions scope. The Function verifies the persisted account using the Identity admin API before granting access. No password is hardcoded. Optional FLOWDESK_FIRST_ADMIN_ID supports exact UUID provisioning instead.
6. Set LEAD_FORM_ORIGINS and SUPPORT_FORM_ORIGINS to exact submitting origins, comma-separated. Same-origin forms are allowed without these values. Private APIs never enable cross-origin credential access.
7. Deploy. Netlify detects SQL files under netlify/database/migrations and applies them before publication. Inspect the deploy's migration log; successful frontend build alone is insufficient.
8. Sign in at `/sign-in`. The verified owner is bootstrapped as Super Admin only if no Super Admin exists. The bootstrap is serialized in a transaction and never trusts editable metadata. Once it has succeeded, set FLOWDESK_FIRST_ADMIN_EMAIL to a blank value, remove any FLOWDESK_FIRST_ADMIN_ID and redeploy to disable initial provisioning.
9. Use Users & Teams to create other accounts. Their passwords must have at least 12 characters; Identity accounts are created by an authorized Function. CRM hierarchy remains enforced in PostgreSQL. Disabling a CRM user blocks future API/workspace access even if their Identity token remains valid.

Environment reference: ../.env.netlify.example. Netlify deployment uses dashboard variables, not backend/.env. A Functions-only variable need not be exposed to the build. Do not manually override the managed database URL with a production URL on previews.

The code uses Netlify's native migration tracker. `npm run db:migrate` is a fallback for a separate local test database configured through NETLIFY_DB_URL; it has its own tracker and must NOT be used on the managed deploy database. Never switch migration trackers on an already initialized database without an explicit baseline plan.

## Verification checklist

- GET `/sign-in`: 200, no sidebar, CSS/JS load.
- GET `/api/auth/session` logged out: JSON with user=null and backend=netlify, not HTML/404.
- GET `/api/health`: 200 JSON with database=ready. This probes the CRM schema without returning records.
- Unauthenticated `/html/dashboard.html`: redirect to `/sign-in`.
- Wrong password: authentication error, no workspace access.
- Confirmed administrator login: session user role is super_admin.
- Create contact/task, refresh and log in again: record persists.
- Submit lead/support form: administrator sees captured record; assign owner/team; verify lower-role visibility.
- Sales cannot make Admin, Support cannot access unassigned records, non-Super cannot access `/api/system`.
- Disable an account: its existing session is denied by database checks.
- Test invitations using a disposable account. Identity email links landing on the homepage are forwarded to the login callback; invite acceptance asks for a new password.

The migration's local tests use PGlite (PostgreSQL in WASM), not a live Netlify database. Run `npm ci` and `npm test`. Identity SDK calls require the Netlify runtime; mocks and local database tests do not prove deployed authentication works. Netlify CLI 26+ linked to the site can be used for `netlify dev` after npm run build. Do not use the Django launcher to test this migration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/sign-in` is 404 | Wrong/old deploy, missing netlify.toml, incorrect build settings |
| `/api/auth/session` is 404 or HTML | CRM Function or API rewrite not deployed |
| `/api/health` is 503 | Database provisioning, connection or migration failure |
| Identity login succeeds but CRM returns 403 | User UUID not provisioned/active; first admin ID absent or wrong |
| Old local credentials fail | Django accounts are not imported into Identity |
| Public capture returns 403 | Exact website origin is missing from capture allowlist |
| Login has CSRF 403 | Same-origin POST Origin must match request origin |

Errors/logs intentionally do not echo connection strings or passwords. Check Netlify Function logs for error codes. Database setup errors produce 503 rather than a false login-success message.

## Data migration and limitations

No Django users, SQLite records or passwords are automatically imported. Back up SQLite first. A future import must map Identity UUIDs to new CRM IDs, preserve record UUIDs where practical, map owners/teams/assignees, compare counts, test permissions and provide rollback. Do not run two active systems against divergent data and claim they are synchronized.

Record lists currently return at most 1,000 records; full pagination is future work. Documents remain metadata-only, communication providers are not connected, and password-recovery UI is not implemented. Identity account creation and database writes are not a distributed transaction: an unexpected database commit failure may leave an orphan Identity account without CRM access; reconcile it manually. Do not retry account creation blindly.

Before production use, review spam prevention, rate limiting, backups, monitoring and authenticated browser security. The Identity SDK manages its session cookies; avoid introducing third-party scripts or unsafe HTML. This migration does not introduce custom client-side role tokens.

Official references: [Identity in Functions](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/use-identity-in-functions/), [Database migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/), [Database tooling](https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/).
