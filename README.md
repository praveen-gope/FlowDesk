# FlowDesk

FlowDesk is a Netlify-powered CRM with role-based access, lead capture and support ticket APIs, team assignments, and a responsive HTML, CSS, and JavaScript frontend. Netlify Identity handles authentication, Netlify Functions serve the APIs, and Netlify Database stores workspace data.

## Run Locally

Install the Node dependencies and start Netlify Dev:

```sh
npm install
netlify dev --port 8889
```

Open http://localhost:8889/sign-in. Use a current Node 22 release. Connect Netlify CLI to this site for live Identity integration. Offline development can render the interface and verify anonymous API responses, but it cannot authenticate users against an unconfigured Identity service. Database schema migrations are applied by Netlify during deployment, not by application requests.

## Netlify Deployment

The public sign-in address is https://flow-deck.netlify.app/sign-in. The previous `/html/sign-in.html` address redirects there. Netlify uses `netlify.toml` to build the static frontend and deploy the Functions alongside it. The Identity activation marker is included in `.netlify/features/netlify-identity`.

After deployment, invite the first administrator in **Netlify dashboard > Identity**. After accepting the invitation, assign the `super_admin` role in the Identity user details and sign in again. Set registration to **Invite only**. That administrator can create the other workspace accounts in **Users & Teams**. Existing Django accounts and SQLite records are not automatically copied to the new services; see [Netlify setup](NETLIFY-SETUP.md) for migration and operational details.

## Validation

```sh
npm test
npm run typecheck
```

## Documentation

- [Backend setup, permissions and API](backend/README.md)
- [Netlify setup and first administrator](NETLIFY-SETUP.md)
- [Website lead capture](API.md)
- [Website support tickets](SUPPORT-API.md)
- [Git setup](GIT-SETUP.md)

This is a development CRM foundation. Email sending, password recovery, integration providers, and binary document uploads are not implemented. Review deployment requirements before hosting.

## Editing

Licensed under the MIT License. See [LICENSE](LICENSE). Copyright (c) 2026 Dev Praveen.

Netlify Functions are the deployed backend. The previous Django code and desktop launchers remain in the repository as legacy references, but they are not used by the Netlify deployment. Never publish the repository root or the `backend` directory; only the generated `dist` directory is public.

Use Netlify Dev to view the landing page and workspace. Every menu item has a separate page in `html/`.

- Edit page headings, labels, buttons, tables, and other visible content directly in the matching HTML file.
- Edit sidebar links in `html/menu.html`. Vite includes this shared menu in every CRM page during development and deployment; account details come from the signed-in user.
- Change colors, spacing, and responsive layout in `css/style.css`.
- Change interactive behavior in `javascript/app.js`.

`index.html` is the public landing page. The protected dashboard is `html/dashboard.html`. The standalone login form is in `html/sign-in.html`; public-page styles are in `css/public.css` and login behavior is in `javascript/auth.js`.

Workspace record forms and tables use the scoped Netlify APIs. Authentication and password recovery use Netlify Identity. Decorative sample charts and unfinished email, integration, bulk-import, and document-upload features remain separate from those real APIs.
