# FlowDesk

FlowDesk is a Django-powered CRM with role-based access, lead capture and support ticket APIs, team assignments, and a responsive HTML, CSS, and JavaScript frontend.

## Run Locally

From the project folder, create a Python environment and install Django:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python backend/manage.py migrate
backend/.venv/Scripts/python backend/manage.py bootstrap
.\start-flowdesk.cmd
```

Node.js is required for the preview launcher. Open http://127.0.0.1:3000 after the ready message. Bootstrap generates local role-account credentials in `backend/LOCAL-ACCOUNTS.md`; that file is intentionally excluded from Git. On other operating systems, use the virtual environment's Python executable to run `backend/manage.py runserver` and open port 8000.

## Documentation

- [Netlify Identity, Functions and PostgreSQL deployment](docs/NETLIFY-DEPLOYMENT.md)

## Netlify Deployment

Use `npm ci` and `npm run build`; publish `dist` with Functions from `netlify/functions`. `netlify.toml` supplies these settings. Enable Identity and managed Netlify Database, then follow the deployment guide above for migrations and verified first-administrator setup. The canonical login is `/sign-in`. This deployment uses a separate PostgreSQL database and Identity accounts; Django users and SQLite records are not imported automatically. Production sign-in must be verified after deployment, not inferred from a successful build.


- [Backend setup, permissions and API](backend/README.md)
- [Website lead capture](API.md)
- [Website support tickets](SUPPORT-API.md)
- [Git setup](GIT-SETUP.md)

This is a development CRM foundation. Email sending, password recovery, integration providers, and binary document uploads are not implemented. Review deployment requirements before hosting.

## Editing

Licensed under the MIT License. See [LICENSE](LICENSE). Copyright (c) 2026 Dev Praveen.

The Django backend is now the main server. Run `start-django.ps1`, then open http://localhost:8000. Setup, roles, API endpoints, and current limitations are in `backend/README.md`. Local role-account credentials are in `backend/LOCAL-ACCOUNTS.md`. The old Node server is superseded.

Open `index.html` to view the dashboard. Every menu item has a separate page in `html/`.

- Edit page headings, labels, buttons, tables, and other visible content directly in the matching HTML file.
- Edit all sidebar links and sidebar account defaults in `html/menu.html`. Every CRM page includes this one shared menu through Django; use the local server to view it.
- Change colors, spacing, and responsive layout in `css/style.css`.
- Change interactive behavior in `javascript/app.js`.

`index.html` is the public landing page. The protected dashboard is `html/dashboard.html`. The standalone login form is in `html/sign-in.html`; public-page styles are in `css/public.css` and login behavior is in `javascript/auth.js`.

Forms and tables work with browser-local demo storage. Saved profile values can override HTML defaults; clear the site's local storage to restore the defaults. Calendar dates and events are generated dynamically by JavaScript when navigating the calendar.

Authentication, emails, and integration connections are frontend demos.
