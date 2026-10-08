from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from crm.models import Record, User


class DemoSeedTests(TestCase):
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
