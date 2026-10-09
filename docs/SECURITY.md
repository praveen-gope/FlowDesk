# Django/cPanel security hardening

FlowDesk uses Django database-backed sessions: a random opaque session ID is
stored in an HttpOnly cookie; no login bearer token is stored in localStorage.
Passwords use Django's password hashing and validators. Login rotates the
session ID, logout destroys the session, and password changes invalidate old
authenticated sessions through Django's authentication hash checks.
See [Django session security](https://docs.djangoproject.com/en/5.2/topics/http/sessions/).

## Enabled controls

- Secure session/CSRF cookies and HTTPS redirect with `DJANGO_DEBUG=0`.
- CSRF tokens on login and all authenticated writes; anonymous capture endpoints
  remain exempt by design and are restricted by configured browser origins.
- Server-enforced role and record scope; disabled accounts cannot authenticate.
- 30-minute idle timeout and eight-hour absolute session lifetime by default.
- Minimum 12-character passwords; login/logout audit events contain no secrets.
- Shared database-backed fixed-window IP throttling: login 10/minute, each
  capture endpoint 20/minute. It uses REMOTE_ADDR, not untrusted forwarded headers.
- Private HTML/API no-store responses, frame denial, nosniff, same-origin
  referrer policy, and disabled camera/microphone/geolocation permissions.
- Frontend routing restricted to index and HTML/CSS/JavaScript folders.

## Deploy this update

Back up the database and environment first. Activate the cPanel virtual environment:

```bash
source /home/audiolor/virtualenv/flowdesk-app/3.11/bin/activate
cd ~/flowdesk-app/FlowDesk
git pull --ff-only origin main
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py check --deploy
```

The migration creates the shared rate-limit table. **Run it before restarting**;
otherwise login and capture requests will fail. Restart Passenger afterward.
This document does not mean the update has been published to GitHub yet.

Optional backend/.env settings:

```dotenv
SESSION_IDLE_TIMEOUT=1800
SESSION_ABSOLUTE_TIMEOUT=28800
SECURE_HSTS_SECONDS=0
DJANGO_TRUST_PROXY_HTTPS=0
```

Keep DEBUG off, the secret private and stable, and ALLOWED_HOSTS restricted.
Only enable `DJANGO_TRUST_PROXY_HTTPS=1` when the hosting provider confirms its
proxy strips client-supplied X-Forwarded-Proto and sets a trusted value. Otherwise
attackers may spoof HTTPS. See [Django proxy-header warnings](https://docs.djangoproject.com/en/5.2/ref/settings/#secure-proxy-ssl-header).
HSTS is initially off to avoid locking an unverified deployment into HTTPS;
after certificate/proxy verification, start with a short value such as 300
seconds and increase deliberately. Subdomain inclusion and preload are not enabled.

Schedule `python backend/manage.py prune_security` daily using the application's
full virtual-environment Python path in cPanel Cron Jobs to remove expired
throttle rows and sessions. Monitor SQLite contention and database growth.

## Remaining production work

This hardens Django/cPanel, not the separate Netlify Identity/Functions backend.
It is not a penetration test or a guarantee of security. Enforce WAF/request
limits at the hosting layer, keep dependencies patched, use encrypted tested
backups, protect the public document root, and review audit/access logs.
IP limits may affect users behind a shared proxy; confirm REMOTE_ADDR behavior
with the host rather than trusting client headers. Fixed windows allow bursts
across minute boundaries. Use a tested shared limiter/WAF for larger workloads.

MFA, verified password recovery, verified email-change workflows, account-based
distributed brute-force controls, and a strict CSP are not implemented.
The existing inline handlers/styles require refactoring before a strict CSP
can be enforced without breaking the UI. Session IDs remain bearer credentials;
XSS prevention and HTTPS are still essential. Existing sessions acquire the new
timestamp bounds on their next authenticated request. Review security warnings
and perform staged role/session testing before handling real customer data.
