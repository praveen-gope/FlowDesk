import json
import secrets
from django.conf import settings
from django.core.management.base import BaseCommand
from crm.models import User, Team, Record


class Command(BaseCommand):
    help = 'Create five local role accounts with random passwords; import existing captured leads once.'

    def handle(self, *args, **options):
        sales, _ = Team.objects.get_or_create(name='Sales Team')
        support, _ = Team.objects.get_or_create(name='Support Team')
        accounts = [
            ('super_admin', 'Praveen Gope', 'kr.praveengope@gmail.com'),
            ('admin', 'Business Admin', 'admin@flowdesk.local'),
            ('manager', 'Team Manager', 'manager@flowdesk.local'),
            ('sales', 'Sales Executive', 'sales@flowdesk.local'),
            ('support', 'Support User', 'support@flowdesk.local'),
        ]
        credentials = []
        for role, name, email in accounts:
            if User.objects.filter(email__iexact=email).exists():
                continue
            password = secrets.token_urlsafe(18)
            user = User.objects.create_user(username=email, email=email, password=password, first_name=name, role=role)
            user.teams.add(support if role == 'support' else sales)
            credentials.append(f'| {User.Role(role).label} | {email} | `{password}` |')
        if credentials:
            file = settings.BASE_DIR / 'LOCAL-ACCOUNTS.md'
            with file.open('a', encoding='utf-8') as stream:
                stream.write('# Local development accounts\n\nKeep this file private. These accounts are for local development.\n\n| Role | Email | Password |\n| --- | --- | --- |\n' + '\n'.join(credentials) + '\n\n')
        legacy = settings.FRONTEND_DIR / 'server/data/leads.json'
        if legacy.exists():
            for lead in json.loads(legacy.read_text(encoding='utf-8')):
                Record.objects.get_or_create(id=lead['id'], defaults={
                    'kind': 'lead', **{key: lead.get(key, '') for key in ['name', 'email', 'phone', 'company', 'message', 'source']},
                    'status': lead.get('status', 'New'),
                })
        self.stdout.write(self.style.SUCCESS('Accounts ready. Credentials are in backend/LOCAL-ACCOUNTS.md. Existing leads imported.'))
