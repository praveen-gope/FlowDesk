# Local demo data

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

The local administrator must already exist (run bootstrap for a new database).
Existing credentials and records are not changed. Stable demo IDs prevent
duplicates and preserve edits when the command is repeated. Demo records are
assigned to active Sales Team members, with permitted support records also
assigned to active support users.

This command seeds Django's configured database only. It does not populate the
Netlify PostgreSQL database. Local database files are not committed to GitHub.
