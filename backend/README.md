# FlowDesk Django Backend

Website support capture is now available at POST `/api/support/capture`. The Support Tickets page uses scoped records and assignments, with automatic refresh every five seconds. External website setup and examples are in `../SUPPORT-API.md`. Configure `SUPPORT_FORM_ORIGINS` for the submitting website and restart the server.

## Local Preview

Double-click `../start-flowdesk.cmd` from File Explorer. Keep its terminal open, then visit http://127.0.0.1:3000/html/sign-in.html. This launcher runs a Node HTTP listener and forwards requests to the same Django application through a local process transport. Django still performs authentication, CSRF checks, permissions, database operations, and HTML serving. It is for development preview only. The launcher verifies that the login page responds before printing the ready URL.

Servers launched inside the agent sandbox may not be reachable by the desktop browser, even when an internal HTTP check succeeds. Run this launcher on the desktop when the in-app preview times out. `start-django.ps1` uses the same preview launcher.

Django 5.2, session authentication, CSRF protection, SQLite, custom users, five roles, teams, assigned records, and audit events. Existing HTML/CSS remain the frontend.

## Run

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py bootstrap
.venv\Scripts\python manage.py runserver 127.0.0.1:8000
```

Open http://localhost:8000/html/sign-in.html. Bootstrap creates five local accounts with independently generated passwords in `LOCAL-ACCOUNTS.md`. It does not reset existing accounts. The Super Admin account uses kr.praveengope@gmail.com. Keep the credentials file private. Existing leads from the old Node JSON store are imported once by ID. New submissions are stored in SQLite.

## Access Rules

| Role | Visibility | Permissions |
| --- | --- | --- |
| Super Admin | All records | All record modules, users, roles, teams, system audit/configuration view |
| Admin | All business records | All business modules, assignments, team management, create/manage Manager, Sales, Support users |
| Manager | Records in assigned teams | Team records, scoped reports, create Manager/Sales/Support users within their teams |
| Sales Executive | Owned or explicitly assigned sales records | Sales records, tasks, authorized communications; create Support/User accounts |
| Support/User | Explicitly assigned support-enabled records | Permitted customer details, tickets, notes, tasks, documents; create Support/User accounts |

Unassigned website leads initially appear only to administrators. Use Captured Leads > Assign to choose a team, owner, additional assignees, and support visibility. Support permissions require BOTH explicit assignment and support access. UI navigation adapts to roles, while API queryset and write checks enforce access independently of UI. Reports use the same scoped querysets. Direct access to another user's record returns 404.

User creation hierarchy: Super Admin can create all five roles; Admin can create Manager, Sales Executive, and Support/User; Manager can create Manager, Sales Executive, and Support/User within assigned teams; Sales Executive and Support/User can create Support/User accounts only. Admin account creation and promotion remain exclusive to Super Admin.

Managers can manage their own invitations and lower-role members in their team scope. Sales/Support can manage only Support accounts they personally created. Team assignments cannot exceed the creator's team scope. Account creation does not automatically grant access to customer records; record assignment rules still apply. Self-access changes are blocked. The five roles are fixed policy definitions; arbitrary custom roles are not implemented.

## API

- GET `/api/auth/session`: authenticated user or null, plus CSRF token.
- POST `/api/auth/login`: email, password. Include `X-CSRFToken` from session endpoint.
- POST `/api/auth/logout`: authenticated logout with CSRF.
- POST `/api/capture`: public website form; name/email required, optional phone/company/message/source. No CRM credentials in public forms.
- GET `/api/leads`: scoped captured leads; authentication required.
- GET/POST `/api/records/{kind}`: scoped collection/create.
- GET/PATCH/DELETE `/api/record/{uuid}`: scoped detail/update/delete.
- GET `/api/reports`: scoped module counts.
- GET/POST `/api/users`, PATCH `/api/users/{id}`: restricted user administration.
- GET/POST `/api/teams`: role-checked teams.
- GET `/api/assignees`: allowed assignment directory.
- GET `/api/system`: Super Admin-only roles/configuration/audit view.

Record kinds: lead, contact, company, deal, task, communication, note, document, product, invoice. Assignment fields: owner (user ID/null), team (team ID/null), assigned_to (array of user IDs), support_access (boolean). Optional `details` stores module fields. Support documents are metadata records; binary upload/download is not implemented.

For another website, set `LEAD_FORM_ORIGINS` to its exact origin and use the absolute deployed `/api/capture` URL in its form. CORS applies only to the public capture endpoint, never private CRM APIs. Public capture ignores owner/role/assignment fields. Rate limits use local-memory cache for development; production needs shared cache and stronger spam prevention.

## Tests

```powershell
python manage.py test crm
python manage.py check
```

## Scope and Deployment

This is a backend foundation: authentication, role policy, record CRUD, assignment, user/team management, capture and scoped reports are connected. Calendar scheduling, password recovery, outbound email, integration providers, CSV bulk import, document file storage, and financial analytics need further backend work. Existing decorative dashboard charts are demo visuals, not financial reports. Public self-registration is disabled; administrators create users.

Development defaults use DEBUG=1 and SQLite. Before hosting, set DJANGO_DEBUG=0, DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, HTTPS, a production WSGI server, durable database/backups, and shared rate-limit storage. No Django admin site is exposed; user administration uses the FlowDesk interface and APIs.

The old Node server is superseded by Django. Start the Django URL rather than opening HTML files directly.
