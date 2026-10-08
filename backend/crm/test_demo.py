from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from crm.models import Record, User


class DemoSeedTests(TestCase):
    def test_demo_api_keeps_real_and_demo_contacts_together(self):
        owner=User.objects.create_user(username='admin', email='owner@example.com', role='super_admin')
        Record.objects.create(kind='contact', name='Real customer', owner=owner)
        self.client.force_login(owner)
        self.assertEqual(self.client.post('/api/demo/load', data={'confirm': True}, content_type='application/json').status_code, 200)
        self.client.post('/api/demo/load', data={'confirm': True}, content_type='application/json')
        records=self.client.get('/api/records/contact').json()['records']
        self.assertEqual(len(records),9)
        self.assertIn('Real customer',[r['name'] for r in records])
        self.assertIn('Aarav Sharma',[r['name'] for r in records])

    def test_non_super_admin_cannot_load_demo(self):
        owner=User.objects.create_user(username='sales', email='sales@example.com', role='sales')
        self.client.force_login(owner)
        self.assertEqual(self.client.post('/api/demo/load', data={'confirm': True}, content_type='application/json').status_code,403)
        self.assertEqual(Record.objects.count(),0)

    def test_existing_cpanel_superuser_can_seed(self):
        owner = User.objects.create_user(username='cpanel-owner', email='admin@example.com', is_superuser=True)
        call_command('seed_demo', owner_email=owner.email, stdout=StringIO())
        self.assertEqual(Record.objects.filter(owner=owner).count(), 88)

    def test_repeatable_seed_preserves_existing_records(self):
        User.objects.create_user(username='owner', email='kr.praveengope@gmail.com', role='super_admin')
        existing = Record.objects.create(kind='contact', name='Existing customer')
        call_command('seed_demo', stdout=StringIO())
        self.assertEqual(Record.objects.count(), 89)
        demo = Record.objects.filter(source='Fictional demo data', kind='contact').first()
        demo.name = 'Edited demo customer'
        demo.save()
        call_command('seed_demo', stdout=StringIO())
        self.assertEqual(Record.objects.count(), 89)
        demo.refresh_from_db()
        existing.refresh_from_db()
        self.assertEqual(demo.name, 'Edited demo customer')
        self.assertEqual(existing.name, 'Existing customer')
