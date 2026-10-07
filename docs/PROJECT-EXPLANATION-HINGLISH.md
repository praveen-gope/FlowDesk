# FlowDesk: Project Explanation Aur Requirement Mapping

Yeh document current source code ka explanation, open-source comparison, presentation script aur future implementation plan hai. Proposed architecture ko implemented feature samajhna sahi nahi hoga. Research desk-based hai; comparison CRMs ko locally install karke performance benchmark nahi kiya gaya.

Update: Neeche local Django architecture ka explanation hai. Netlify ke liye separate Identity + JavaScript Functions + PostgreSQL migration add hui hai; deployment details aur remaining production verification `NETLIFY-DEPLOYMENT.md` mein hain. Dono backends ke accounts/data automatically synchronize nahi hote.

## 1. Project Kaise Bana Hai

FlowDesk ek custom Django CRM foundation hai. Yeh Frappe, Twenty, EspoCRM ya SuiteCRM ka clone/fork nahi hai. Existing frontend ko separate HTML, CSS aur JavaScript files mein organize kiya gaya, phir Django authentication, record APIs aur role-based access add hua.

Frontend mein public landing page aur standalone login hai. CRM pages ek shared `html/menu.html` include karte hain, isliye menu edit ek jagah hota hai. Django HTML templates render karta hai; sirf static hosting se shared menu aur backend workflows nahi chalenge.

```text
Browser / External Website
        |
        | HTTP requests / JSON
        v
Django URLs -> Authentication + CSRF + Role Checks
        |
        v
CRM Views -> Django ORM -> SQLite
        |
        v
JSON response / Rendered HTML
```

Website form se public endpoint par submission aati hai, validate hoti hai aur database mein lead/ticket save hota hai. CRM mein visibility owner, team aur explicit assignments ke basis par decide hoti hai. Browser-side hidden menu security boundary nahi hai; backend access checks bhi lagata hai.

### Actual Tech Stack

| Layer | Current technology | Purpose |
| --- | --- | --- |
| Frontend | HTML5, CSS, vanilla JavaScript | Pages, responsive layout aur interactions |
| Rendering | Django template engine | Shared menu aur protected HTML serving |
| Backend | Python, Django 5.2.18 | Authentication, API, validation, permissions |
| API | Django views + JsonResponse | JSON endpoints; Django REST Framework use nahi hua |
| Database | SQLite + Django ORM | Local records aur relational schema |
| Authentication | Django sessions, password hashing, CSRF | Private CRM requests |
| Configuration | python-dotenv | backend/.env loading; process env ko precedence |
| Local preview | Node.js bridge + Django process | Windows development launcher, production server nahi |
| Tests | Django test runner | Last verified suite: 25 passing tests |
| Version control | Git + GitHub | Source tracking |
| Project license | MIT | Repository ke original code ka license |

### Repository Structure

```text
FlowDesk/
  index.html                  Public landing
  html/                       CRM, auth aur website-form pages
    menu.html                 Shared sidebar
  css/                        CRM aur public-page styles
  javascript/                 UI, login aur API interactions
  backend/
    manage.py
    requirements.txt
    flowdesk/                 Settings, URLs, WSGI
    crm/
      models.py               Schema aur visibility query
      views.py                API aur policy enforcement
      middleware.py           Capture CORS
      migrations/             Versioned database schema
      tests.py                Automated tests
      management/commands/
        bootstrap.py          Local accounts aur teams
  docs/                       Explanation aur presentation
  API.md                      Lead capture guide
  SUPPORT-API.md              Ticket capture guide
  WEBSITE-INTEGRATION-GUIDE.md Website integration examples
```

`server/server.cjs` legacy implementation hai; main backend Django hai. Actual .env, database aur local account passwords Git mein commit nahi hote.

### Database Design

User custom Django user hai: role, team membership aur created_by relationship store karta hai. Team team names store karta hai. Record UUID-based shared model hai: kind, customer fields, status, JSON details, owner, team, assignees, support_access aur timestamps. AuditEvent actor, action, target aur timestamp store karta hai.

Record kinds: lead, ticket, contact, company, deal, task, communication, note, document, product aur invoice. Document abhi metadata hai, binary file nahi. Company/customer links ke kuch fields plain text ya JSON hain; fully normalized customer/timeline schema future work hai. Migrations authoritative database schema hain.

## 2. Research: Four Open-Source CRMs

Sources below official repositories hain. UI aur deployment-overhead judgments qualitative assessment hain, measured performance nahi. Provider fees, edition restrictions aur exact release requirements deployment se pehle recheck karne honge.

| CRM | Features / UI assessment | Stack | Community / customization | License | Deployment assessment |
| --- | --- | --- | --- | --- | --- |
| Frappe CRM | Leads/deals, Kanban, notes/tasks, Twilio/Exotel calls aur WhatsApp integration; focused sales UI | Python Frappe, Vue/Frappe UI | Forum, docs, contributors; framework-based custom apps | AGPLv3 | Bench/framework aur supporting services: medium-high overhead |
| Twenty | Custom CRM objects, fields/views aur app tooling; modern configurable workspace | TypeScript, React, NestJS, PostgreSQL | GitHub, docs, Discord; app/SDK customization | Mostly AGPLv3; specified MIT packages aur commercial Enterprise files | Multi-service stack: medium-high overhead |
| EspoCRM | Leads, contacts, opportunities, campaigns aur cases; business-focused SPA | PHP REST backend, JS/TypeScript frontend; SQL databases | Forum, metadata, extensions aur contributor guidelines | AGPLv3 | PHP + SQL setup: comparatively moderate overhead |
| SuiteCRM 8 | Broad CRM platform; Angular-based refreshed UI | Angular, PHP/Symfony, MySQL/LAMP | Established forum, partners aur extensions | AGPLv3 | PHP/SQL plus frontend/backend customization: medium-high overhead |

References: [Frappe CRM](https://github.com/frappe/crm), [Twenty](https://github.com/twentyhq/twenty), [Twenty license exceptions](https://github.com/twentyhq/twenty/blob/main/LICENSE), [EspoCRM](https://github.com/espocrm/espocrm), [SuiteCRM 8](https://github.com/SuiteCRM/SuiteCRM-Core).

### Selection Justification

Ready-made sales CRM adopt karna ho to Frappe CRM strongest shortlist hai: Python ecosystem aur documented communication integrations requirements se align karte hain. Yeh recommendation desk research se hai; final adoption se pehle actual demo, permission checks aur deployment trial chahiye.

Existing FlowDesk ke liye decision custom Django project continue karna hai, kyunki current UI, website-capture APIs aur requested role hierarchy already is codebase mein hain. Benefit: direct control aur familiar stack. Trade-off: mature CRMs ke automation, integrations aur operational hardening humein khud implement karne honge. Custom project banana prebuilt CRM select/clone karne ke requirement ka equivalent nahi hai.

### License Explanation

MIT aur Apache-2.0 permissive license families hain; Apache-2.0 explicit patent provisions bhi include karta hai. AGPL network-use source-sharing obligations la sakta hai. Exact license text aur dependencies review karna zaroori hai. In four products ko MIT/Apache kehna incorrect hoga. FlowDesk ka MIT license kisi copied AGPL code ko automatically MIT nahi banata.

License references: [MIT](https://opensource.org/license/mit), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html). Yeh engineering summary hai, legal advice nahi.

## 3. Six Requirements: Current Status

| Requirement | Actual status | Remaining deliverable |
| --- | --- | --- |
| 1. Research 3-5 CRMs | Four-product desk comparison documented | Hands-on deployment, task-based UI evaluation, measured overhead |
| 2. Complete source/local repository | Custom frontend, Django API, migrations aur guides present | Third-party selected CRM clone only if adoption required; remaining services incomplete |
| 3. Docker multi-container | Not implemented | Frontend gateway, Django, PostgreSQL, private object storage, persistent volumes |
| 4. CRM + five-tier RBAC | CRUD, record scope, user hierarchy implemented | Configurable permission matrix, real calendar/reminders, timeline, file uploads, advanced reports |
| 5. Omni-channel | Communication record type aur SMTP configuration only | Email send/receive, telephony, recordings, WhatsApp, SMS adapters/workers/webhooks |
| 6. Deployment/live demo | Migrations, bootstrap, API docs aur local launcher present; .env.example added with this documentation | Storage setup, container verification, production hardening aur executed presentation |

Pages exist hone ka matlab backend feature complete hona nahi hai. Calendar, password recovery, CSV import, providers aur decorative dashboard analytics ko production-ready claim nahi karna chahiye.

## 4. Core Features Aur RBAC

Working foundation: login/logout/session, leads/support capture, scoped record CRUD, team/owner assignments, user administration hierarchy, module counts aur audit events.

| Role | Record scope | User creation hierarchy |
| --- | --- | --- |
| Super Admin | All records | All five roles |
| Admin | All business records | Manager, Sales, Support; Admin/Super nahi |
| Manager | Assigned teams | Manager, Sales, Support within permitted team scope |
| Sales Executive | Owned/explicitly assigned sales records | Support/User only |
| Support/User | Explicitly assigned, support-enabled permitted records | Support/User only |

Sales/Support apne created Support users tak management scope rakhte hain. Manager team-scope exceed nahi kar sakta. Sirf Super Admin Admin bana/promote kar sakta hai. User creation customer records ki access automatically grant nahi karti.

Current module policies code mein fixed hain. Configurable module permissions abhi nahi hain. Proposed model: RoleModulePermission(role, module, action, allowed), default-deny checks on every API, audit log aur permission-change tests. Configuration record visibility ko widen na kare: action permission AND visibility scope dono required hon.

## 5. Proposed Docker Architecture (Not Implemented)

```text
Browser -> Frontend/Gateway (Nginx)
                    |
                    v
          Backend (Django + Gunicorn)
             |        |         |
             v        v         v
         PostgreSQL  Redis   MinIO/S3
                       |
                       v
               Background Worker
```

Frontend/gateway CSS/JS serve kare aur HTML/API requests Django ko proxy kare, kyunki pages Django includes use karte hain. PostgreSQL durable application database hoga. MinIO/S3 private documents aur recordings store karega. Redis shared cache/queue aur worker reminders/provider jobs handle karega. Worker extra supporting service hai, core four containers ka replacement nahi.

Proposed volumes: postgres_data, object_data; backups separate location par. Database/storage private network mein, browser ko database credentials kabhi nahi. Container secrets ignored env/config se inject hon. Health checks, readiness, migration step aur restart policies required hain.

Acceptance: compose up ke baad login/API work kare; restart ke baad records/files survive; DB/storage public expose na ho; fresh DB migration pass ho; backup restore verified ho. Abhi Dockerfile/compose file nahi diya gaya aur docker demo run nahi hua.

## 6. Proposed Omni-Channel Architecture (Not Implemented)

| Channel | Required implementation | Timeline linkage |
| --- | --- | --- |
| Email | SMTP send worker; IMAP/OAuth receiving; threading/deduplication | Customer ID, message ID, direction, status, attachments |
| Voice | Provider adapter, signed callbacks, incoming/outgoing call events | Contact, call ID, duration, recording object key |
| WhatsApp | Official Business/Cloud API adapter, tokens, verified webhooks | Customer, provider message ID, status, conversation |
| SMS | Configurable gateway adapter, delivery callbacks | Customer, message ID, direction, delivery status |

Shared pipeline: authorized action -> queued job -> provider -> verified callback -> CommunicationEvent -> customer timeline. Proposed persistent models: CommunicationEvent, ProviderConnection, StoredFile, DeliveryAttempt. Current generic communication Record is not this full pipeline.

Security acceptance: webhook signatures, replay protection, idempotency, RBAC on timeline/downloads, retries with limits, consent/opt-out handling, private buckets, short-lived download URLs, retention/deletion policies. Call recording needs applicable consent/legal review. Third-party credentials must be backend-only; live provider accounts and approvals may be needed.

Provider implementation references: [Meta Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), [Twilio documentation](https://www.twilio.com/docs). Exact APIs and credentials must be verified when implementing, not assumed from this design.

## 7. Current Local Setup Aur Demo

```powershell
git clone https://github.com/praveen-gope/FlowDesk.git
cd FlowDesk
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
backend/.venv/Scripts/python backend/manage.py migrate
backend/.venv/Scripts/python backend/manage.py bootstrap
.\start-flowdesk.cmd
```

Node.js installed hona chahiye. Launcher ready message ke baad http://127.0.0.1:3000 kholein. Alternative: virtual-environment Python se manage.py runserver, port 8000. Yeh local development setup hai, public production deployment nahi.

Bootstrap new accounts ke random passwords private `backend/LOCAL-ACCOUNTS.md` mein likhta hai. Super Admin email kr.praveengope@gmail.com hai. Existing users reset nahi hote. Demo ke liye credentials private file se use karein; public documentation/GitHub mein actual passwords nahi.

Public APIs: POST /api/capture (lead), POST /api/support/capture (ticket). Private APIs session authentication require karti hain. Exact payload examples aur origins setup API.md, SUPPORT-API.md aur WEBSITE-INTEGRATION-GUIDE.md mein hain. Public capture mein API key nahi; current rate limiting local-memory hai, production anti-spam incomplete hai.

### Presentation Script

1. Intro: "FlowDesk ek custom Django CRM hai jo website inquiries ko leads aur support tickets mein capture karta hai."
2. Architecture: frontend, Django request checks, ORM aur SQLite diagram dikhayein.
3. Workflow: website form submit karein, administrator list mein record dekhein, team/owner assign karein.
4. RBAC: Sales/Support login karke permitted records dikhayein; doosre user's record access denied verify karein.
5. Task/notes: assigned record create/update dikhayein. Document screen ko metadata-only explain karein.
6. Reports: scoped module counts dikhayein; decorative charts ko live analytics na bolein.
7. Scope: Docker/PostgreSQL/storage aur omni-channel roadmap clearly batayein.
8. Verification: tests command aur known limitations explain karein. Fresh setup/demo actually run hone ke baad hi success claim karein.

## 8. Implementation Order Aur Scalability

First: PostgreSQL settings/driver, production WSGI aur Docker orchestration. Second: private object uploads/downloads aur authorization. Third: configurable module policies, real event/calendar schema aur customer relationships. Fourth: queue/worker aur provider adapters. Fifth: end-to-end tests, security audit, backup restore aur demo sign-off.

Scaling ke liye pagination, query indexes, select/prefetch optimization, shared throttling, observability, stateless web replicas, managed secrets aur durable external storage chahiye. PostgreSQL/Redis/MinIO names roadmap hain, current stack ka claim nahi.

Definition of complete: six requirements ke acceptance checks actually pass hon, UI workflows backend se connected hon, documentation current ho aur measured deployment/demo evidence available ho.
