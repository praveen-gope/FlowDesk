# FlowDesk deployment on cPanel

This guide deploys the repository's **Django backend and editable HTML/CSS/JS
frontend together** using Passenger. It does not deploy Netlify Functions or
Netlify Identity. Hosting has not been tested on a live cPanel account.

## 1. Hosting prerequisites

Ask your provider for Python 3.12, pip, a virtual environment, Passenger WSGI,
Terminal/SSH access, and HTTPS. A PHP-only hosting plan is insufficient.
Python 3.10 or newer is required by the pinned Django 5.2 dependency.

CloudLinux hosts may provide **Software > Setup Python App**; other hosts use
**Application Manager**. The provider must enable the relevant hosting modules.
See the official [Python Selector registration instructions](https://support.cpanel.net/hc/en-us/articles/360057849753-How-to-register-an-application-with-Python-Selector)
and [cPanel WSGI guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-python-wsgi-application/).

Use a dedicated subdomain such as `crm.example.com`, mounted at `/`.
FlowDesk uses root-relative URLs; a `/crm` subdirectory deployment needs code changes.

## 2. Repository location

Replace `CPANEL_USER` and all example domains with your own values.
In cPanel Terminal:

```bash
cd /home/CPANEL_USER
git clone https://github.com/praveen-gope/FlowDesk.git FlowDesk
cd FlowDesk
```

If Git is unavailable, upload a repository archive and extract it to the same
location using File Manager. Keep the application source **outside public_html**.
Do not upload your Windows virtual environment, `.env`, local credentials,
`.dev-secret`, local SQLite database, `node_modules`, or generated `dist`.

Expected layout:

```text
/home/CPANEL_USER/FlowDesk/
    index.html
    html/
    css/
    javascript/
    backend/
        manage.py
        requirements.txt
        flowdesk/
        crm/
        .env                 # created on server; never committed
        db.sqlite3           # created by migrations
    passenger_wsgi.py        # created on server
```

Do not copy all HTML into the public document root: workspace pages must pass
through Django authentication, and shared menu includes need Django rendering.
Do not expose `html/menu.html` directly through Apache.

## 3. Register the Python application

For **Setup Python App**, create an application with these values:

| Field | Value |
| --- | --- |
| Python | 3.12, if offered |
| Application root | `FlowDesk` (relative to your home directory) |
| Application URL | `https://crm.example.com/` |
| Startup file | `passenger_wsgi.py` |
| Entry point | `application` |
| Log path | A private path such as `/home/CPANEL_USER/logs/flowdesk-passenger.log` |

Use the virtual-environment activation command displayed by the host's panel.
Do not guess its path. With plain Application Manager, have the provider configure
the application's Python interpreter to use your virtual environment.

Once the environment is active:

```bash
cd /home/CPANEL_USER/FlowDesk
python --version
python -m pip install -r backend/requirements.txt
```

Node.js and `npm run build` are **not needed** for this Django deployment.
Do not use `preview.cjs`, `runserver`, or `start-flowdesk.cmd` in production.

## 4. Configure the production environment

Generate a unique secret in the activated Python environment:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

In File Manager, create `/home/CPANEL_USER/FlowDesk/backend/.env` with:

```dotenv
DJANGO_DEBUG=0
DJANGO_SECRET_KEY='REPLACE_WITH_GENERATED_SECRET'
DJANGO_ALLOWED_HOSTS=crm.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://crm.example.com
DJANGO_TIME_ZONE=Asia/Kolkata
DJANGO_DATABASE_PATH=/home/CPANEL_USER/FlowDesk/backend/db.sqlite3
LEAD_FORM_ORIGINS=https://www.example.com,https://example.com
SUPPORT_FORM_ORIGINS=https://www.example.com,https://example.com
```

Use domains without schemes in `DJANGO_ALLOWED_HOSTS`, but full origins with
schemes in the CSRF/capture settings. Add only required external website origins.
Leave capture-origin lists empty if you do not use cross-origin website forms.
Never use `*` for allowed hosts or commit this file.

```bash
chmod 600 backend/.env
```

The settings load this exact file using python-dotenv; exported process variables
take precedence. Application Manager environment variables are also an option.
Protect the secret and retain it across deployments so sessions are not invalidated.
Netlify-specific `FLOWDESK_FIRST_ADMIN_*` and database variables are not used here.

## 5. Add the Passenger entry point

Create `/home/CPANEL_USER/FlowDesk/passenger_wsgi.py` in File Manager:

```python
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'flowdesk.settings')

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
```

Select the virtual environment in the hosting panel; the entry point does not
replace the host's interpreter configuration. Verify imports from the project root:

```bash
python -c "from passenger_wsgi import application; print('WSGI import OK')"
```

## 6. HTTPS and proxy verification

Issue/enable a valid certificate for the subdomain before testing login.
`DJANGO_DEBUG=0` enables HTTPS redirects and secure session/CSRF cookies.

If HTTPS requests loop between redirects, Passenger may receive an HTTP scheme
behind a TLS proxy. Ask the provider how it supplies a trustworthy HTTPS signal.
Only if the proxy strips client-supplied headers and sets `X-Forwarded-Proto`
itself, add this to `backend/flowdesk/settings.py`:

```python
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

This setting is **not currently in the repository**. Do not add it blindly or
disable production secure cookies/redirects to bypass a proxy problem.
Test HTTPS end to end with the provider before going live.

## 7. Database and first administrator

The Django settings currently support **SQLite only**. A `DATABASE_URL` or
creating a MySQL database in cPanel will not switch the backend automatically.
PostgreSQL/MySQL requires a settings change, a compatible driver, migrations,
and data-transfer testing. Netlify PostgreSQL records are not imported here.

For a small test deployment with SQLite on a writable local filesystem:

```bash
python backend/manage.py migrate
python backend/manage.py createsuperuser
```

Enter a username, your administrator email, and a strong password interactively.
An `is_superuser` account has effective **Super Admin** permissions in FlowDesk.
Do not put passwords in shell commands or documentation. The CRM login is
`https://crm.example.com/html/sign-in.html`, not Netlify's `/sign-in` route.
There is currently no configured Django `/admin/` route; manage users inside
the CRM's **Users & Teams** page.

Passenger must run as the account user and be able to write both the database
and its containing directory for SQLite journal files. Do not use `chmod 777`.
If the database is on network storage or has sustained concurrent writes,
move to a tested server database before production use.

Do not run `bootstrap` on production merely to create a Super Admin: it creates
five development role accounts and writes passwords to `backend/LOCAL-ACCOUNTS.md`.
The `seed_demo` command is optional for a **separate demo deployment**, not a real
customer database; use `--owner-email` to select an existing active Super Admin.
See [demo-data instructions](DEMO-DATA.md).

## 8. Frontend assets and production checks

The current `crm.views.frontend` serves HTML, `/css/`, and `/javascript/` through
Django and renders shared menu includes. Preserve that routing in Passenger.
Do not publish Netlify's `dist` or `.build/workspace` for this deployment.
The current frontend view only accepts HTML/CSS/JS: extra image, font, and media
routes require deliberate asset-serving configuration if added later.

`STATIC_ROOT` is not configured and this frontend does not use Django's normal
`/static/` pipeline. A blanket `collectstatic` command is not a working deployment
step for this repository. Configure public-asset serving separately if needed;
never map private workspace HTML or backend files into Apache's public directory.

Run:

```bash
python backend/manage.py check
python backend/manage.py check --deploy
python backend/manage.py test crm
```

Review all deployment warnings; a successful basic check is not a security audit.
HSTS and other production hardening are not configured here. Add them only after
confirming HTTPS, host/proxy behavior, and the domains they will affect.

Restart using the Python application's **Restart** control. On a Passenger
installation using a restart marker:

```bash
mkdir -p tmp
touch tmp/restart.txt
```

This is the standard [Passenger restart mechanism documented by cPanel](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-python-wsgi-application/#restart-the-application).

## 9. Website lead and support forms

The Django public endpoints are:

| Feature | URL |
| --- | --- |
| Lead capture | `POST https://crm.example.com/api/capture` |
| Support ticket | `POST https://crm.example.com/api/support/capture` |

Use the request fields and examples in [API.md](../API.md) and
[SUPPORT-API.md](../SUPPORT-API.md). Cross-origin websites must match the relevant
origin allowlist exactly. Do not include a Super Admin password or session cookie
in a public website form. These capture endpoints do not require API keys.

CORS is a browser policy, not an authentication or abuse-prevention guarantee.
Before exposing public forms, configure provider-level rate limits/WAF protections;
the current application cache-based throttling is not a shared multi-worker limit.
New submissions require assignment to be visible to scoped sales/support users.

## 10. Acceptance checklist

- Landing page, CSS, JavaScript, and shortcut dialogs load without console errors.
- Anonymous access to `/html/dashboard.html` redirects to login.
- Private APIs reject anonymous access; sign-in/sign-out work over HTTPS.
- Each role sees only the intended records; non-admin users cannot escalate roles.
- A created contact/task survives an application restart.
- Approved website forms create leads/tickets, and disallowed browser origins fail.
- `.env`, database files, credentials, and source configuration are not publicly accessible.
- Logs contain no passwords, cookies, or submitted secrets.

There is no Django `/api/health` route in this version. For a non-mutating server
check, request `/api/auth/session` and confirm its JSON response.

## 11. Updates, backups, and troubleshooting

Before updates, take a consistent database backup and record the current commit.
For SQLite use a database-aware backup (for example `sqlite3 ... '.backup ...'`)
or stop application writes before copying the database. Keep encrypted backups
outside the public document root and test restoration. A plain file copy during
active writes is not a reliable backup strategy.

Activate the correct virtual environment, then:

```bash
cd /home/CPANEL_USER/FlowDesk
git pull --ff-only origin main
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py check --deploy
touch tmp/restart.txt
```

Retain `.env`, database, logs, and server-specific Passenger configuration.
Do not assume rolling back code reverses database migrations; plan restoration
and migration compatibility before updating customer data.

| Problem | Check |
| --- | --- |
| No Python application option | Provider must enable Python/Passenger; PHP-only hosting cannot run Django. |
| `No module named django` | Install requirements into the same interpreter selected by Passenger. |
| HTTP 500/503 | Read the private Passenger log; verify startup file, settings, dependencies, and environment. |
| Missing tables | Run migrations against the configured database in the activated environment. |
| `DisallowedHost` | Set the exact hostname in `DJANGO_ALLOWED_HOSTS`, then restart. |
| CSRF failure | Check HTTPS, exact trusted origins, cookies, and verified proxy scheme handling. |
| Redirect loop | Verify HTTPS forwarding; do not leave `DJANGO_DEBUG=1` as a workaround. |
| Missing CSS/JS | Route `/css/` and `/javascript/` to Django; check source folders and avoid a static root index shadowing Passenger. |
| Empty CRM | Accounts/data are separate from Netlify; create/assign records in this Django database. |
| Database locked/read-only | Check account ownership, writable directory, concurrency, and local disk support. |

## Current limitations

This is deployment documentation, not a certification that FlowDesk is hardened
for production. Django password recovery, complete email send/receive pipelines,
voice/WhatsApp/SMS providers, and binary document uploads are not connected.
SMTP settings alone do not implement those workflows. No MySQL/PostgreSQL adapter,
shared rate-limit backend, or automatic Netlify-to-Django account/data migration
is included. Review these gaps before hosting real customer information.
