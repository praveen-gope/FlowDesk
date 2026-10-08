# Local demo data

On Django/cPanel, a Super Admin can select **Add demo data** in the CRM toolbar
and confirm. This stores demo rows in the same database as added records, so
both appear together after refresh. Loading again does not create duplicates
or replace real records. Other users see only records permitted by their role
and assignments. This action is for test workspaces and is not supported by
the separate Netlify backend.

From the FlowDesk project directory, run:

```powershell
python backend/manage.py seed_demo
```

This adds eight fictional records each for contacts, companies, leads, deals,
tasks, products, invoices, communications, tickets, notes, and document metadata.
Names and companies are fictional, email addresses use example.com, and no
emails are sent or files uploaded. Prices are labelled INR. Tasks are scheduled
relative to the first seed date. Dashboard/report counts and calendar entries
use these persisted records; existing forecast charts remain illustrative.

An active Super Admin must already exist. The command prefers the original
administrator email, then the first active Super Admin. To choose explicitly:

```bash
python backend/manage.py seed_demo --owner-email admin@example.com
```

Use your existing administrator email. Do not run development bootstrap on a
production server merely to seed records. Use demo data only in a test workspace.
Existing credentials and records are not changed. Stable demo IDs prevent
duplicates and preserve edits when the command is repeated. Demo records are
assigned to active Sales Team members, with permitted support records also
assigned to active support users.

This command seeds Django's configured database only. It does not populate the
Netlify PostgreSQL database. Local database files are not committed to GitHub.
