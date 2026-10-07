# FlowDesk on Netlify

## Architecture

The frontend is built from the existing HTML pages with Vite. The build expands the shared sidebar that previously depended on Django templates. Only `dist` is published, so Django configuration, environment files, database files, and server source are not exposed as static assets.

Netlify Identity handles sign-in, sign-out, invitations, and password recovery. The browser uses `@netlify/identity`; the Function also resolves the authenticated user through this library. Passwords are not stored in the CRM database. Identity callbacks that arrive on the landing page are forwarded to `/sign-in`, where invitations and recovery links can be completed.

`netlify/functions/api.mts` serves the existing `/api/*` routes. Netlify Database and Drizzle store accounts, teams, records, assignment scopes, audit events, and shared submission rate limits. The API preserves the five CRM roles and their user-management hierarchy. Record reads and mutations are scoped on the server, and private writes require a same-origin request. Public lead and support capture validate fields and enforce origin allowlists.

An Edge Function redirects anonymous visitors away from workspace HTML pages. Public sign-in, recovery, lead, and support forms remain accessible. Authenticated workspace responses are not cached publicly; the APIs independently validate workspace membership and permissions.

## First Administrator

1. Deploy the site and confirm that Identity is enabled in the Netlify dashboard. The repository contains the feature activation marker.
2. In Identity, set registration to **Invite only** and invite the first administrator.
3. Accept the email invitation and choose a password on the sign-in page.
4. In the Identity user details, add the **super_admin** role. Sign out and sign in again so the session includes the updated role.
5. Open **Users & Teams** to create teams and additional workspace accounts.

Accepting an invitation before assigning a CRM role may show a no-workspace-access message; assign the role in the dashboard and sign in again. Identity accounts without a trusted CRM role or an existing administrator-created workspace account cannot obtain workspace access. Ordinary users cannot grant themselves roles through profile metadata. Deactivated CRM accounts are rejected by every private API even if an Identity session remains valid.

The `admin` Identity role also grants the CRM Admin role on initial provisioning. It does not grant Super Admin permissions. CRM roles and team assignments are authoritative in Netlify Database after the account is provisioned; subsequent changes belong in the workspace administration APIs.

## Database Deployment

The schema is in `db/schema.ts`. Migrations are in `netlify/database/migrations`. Netlify applies these migrations during deployment and provisions the managed database on first connection. Do not apply schema changes from request handlers or manually against a deployed database.

For future schema changes, edit the schema and generate a named migration:

```sh
npx drizzle-kit generate --name describe_schema_change
```

The new managed database starts empty. This change does not import the legacy SQLite database, copy Django accounts, or reuse Django password hashes. If there are existing records to retain, export them from the old backend and plan an explicit import before retiring it. Old Django credentials do not automatically become Identity credentials.

## Website Forms

The public endpoints remain `/api/capture` and `/api/support/capture`. Configure `LEAD_FORM_ORIGINS` and `SUPPORT_FORM_ORIGINS` in Netlify for external websites that submit to these endpoints. Each accepts a comma-separated list of full origins; trailing slashes are normalized. Same-origin forms work without an external allowlist. No CORS access is granted to private CRM APIs.

Capture rate limits are stored in Netlify Database, not process memory. Invalid and honeypot submissions cannot inject record ownership, teams, permissions, or arbitrary details.

## Local Development

```sh
npm install
netlify dev --port 8889
```

Open `http://localhost:8889/sign-in`. With Netlify CLI authenticated and connected to the site, Netlify Dev supplies the platform context. An offline session can render pages and test anonymous routes, but Identity sign-in and database-backed operations need their platform services and an applied schema. A 503 from a database-backed endpoint before migration deployment does not indicate a successful record save.

The deployed sign-in URL is `https://flow-deck.netlify.app/sign-in`; older links to `/html/sign-in.html` are redirected there. Local preview URLs are not public deployment addresses.

## Checks

```sh
npm test
npm run typecheck
```

Tests cover role-scoped access, role escalation, team boundaries, input validation, request-size limits, origin checks, unauthenticated API behavior, sidebar rendering, and the canonical sign-in links. Live authentication and database writes additionally require a deployed Identity account and deployed migrations.
