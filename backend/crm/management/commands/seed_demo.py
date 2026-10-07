import uuid
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.models import Record, Team, User


class Command(BaseCommand):
    help = 'Add fictional Indian CRM demo records without replacing existing data.'

    @transaction.atomic
    def handle(self, *args, **options):
        owner = User.objects.filter(email__iexact='kr.praveengope@gmail.com').first()
        if not owner:
            raise CommandError('Run bootstrap first to create the local administrator.')
        team, _ = Team.objects.get_or_create(name='Sales Team')
        members = list(User.objects.filter(teams=team, is_active=True))
        support = list(User.objects.filter(role='support', is_active=True))
        today = timezone.localdate()
        people = ['Aarav Sharma', 'Ananya Patel', 'Rohan Mehta', 'Priya Nair',
                  'Vikram Singh', 'Sneha Rao', 'Arjun Iyer', 'Kavya Gupta']
        companies = ['Banyan Digital', 'Lotus Retail', 'Narmada Logistics', 'Monsoon Labs',
                     'Aster Foods', 'Saffron Systems', 'Deccan Healthcare', 'Horizon Textiles']
        cities = ['Delhi', 'Ahmedabad', 'Mumbai', 'Kochi', 'Jaipur', 'Bengaluru', 'Chennai', 'Pune']
        products = ['CRM Starter', 'CRM Professional', 'Customer Support Suite', 'Sales Automation',
                    'Analytics Dashboard', 'Email Campaigns', 'Document Storage', 'API Integration']
        added = 0

        def add(kind, index, name, status='New', details=None, **fields):
            nonlocal added
            identifier = uuid.uuid5(uuid.NAMESPACE_URL, f'flowdesk:indian-demo:v1:{kind}:{index}')
            record, created = Record.objects.get_or_create(id=identifier, defaults={
                'kind': kind, 'name': name, 'status': status, 'details': details or {},
                'owner': owner, 'team': team, 'source': 'Fictional demo data',
                'support_access': kind in ['contact', 'task', 'ticket', 'note', 'document', 'communication'],
                **fields,
            })
            if created:
                record.assigned_to.set(members + (support if record.support_access else []))
                added += 1
            return str(record.id)

        for i, (person, company, city, product) in enumerate(zip(people, companies, cities, products)):
            email = person.lower().replace(' ', '.') + '@example.com'
            contact = add('contact', i, person, ['Customer', 'Qualified', 'Lead', 'Partner'][i % 4],
                          {'Job title': ['Founder', 'Operations Manager', 'Sales Director', 'IT Manager'][i % 4]},
                          email=email, company=company)
            add('company', i, company, 'Customer', {'Address': city + ', India', 'URL': 'https://example.com'})
            add('lead', i, person, ['New', 'Qualified', 'Contacted'][i % 3],
                {'Contact ID': contact}, email=email, company=company, message=f'Interested in {product}.')
            add('product', i, product, 'Active', {'Tags': 'Software, Subscription', 'Unit': 'Month',
                'Price': f'INR {(i + 1) * 2500:,}', 'Code': f'FD-{i + 1:03d}'})
            deal = add('deal', i, company + ' - ' + product, ['New', 'Qualified', 'Proposal', 'Won'][i % 4],
                {'Price': f'INR {(i + 1) * 75000:,}', 'Amount': (i + 1) * 75000, 'Contact ID': contact}, company=company)
            add('task', i, ['Schedule product demo', 'Send proposal', 'Follow up on quotation', 'Customer onboarding'][i % 4]
                + ' - ' + person, ['To-Do', 'Waiting', 'Completed'][i % 3],
                {'Category': 'Customer follow-up', 'Due date': str(today + timedelta(days=i - 2)),
                 'Team': team.name, 'Contact ID': contact, 'Deal ID': deal}, company=company)
            add('invoice', i, f'DEMO-INV-{i + 1:04d}', ['Paid', 'Pending', 'Overdue'][i % 3],
                {'Amount': f'INR {(i + 1) * 25000:,}', 'Due date': str(today + timedelta(days=i)), 'Deal ID': deal}, company=company)
            add('communication', i, 'Product enquiry - ' + person, 'Received',
                {'Channel': 'Email', 'Contact ID': contact}, email=email, company=company,
                message=f'Hello, please share pricing and availability for {product}. Thank you, {person}.')
            add('ticket', i, 'Onboarding assistance - ' + company, ['Open', 'In progress', 'Resolved'][i % 3],
                {'Requester': person, 'Priority': ['Low', 'Medium', 'High'][i % 3], 'Category': 'Account setup'},
                email=email, company=company, message='Please help our team configure the demo workspace.')
            add('note', i, 'Meeting notes - ' + person, 'Active', {'Contact ID': contact},
                company=company, message=f'{person} requested a follow-up demo for the {city} team.')
            add('document', i, company + ' proposal.pdf', 'Draft',
                {'Contact ID': contact, 'Type': 'Proposal', 'Description': 'Demo metadata only; no file uploaded.'}, company=company)
        self.stdout.write(self.style.SUCCESS(f'Added {added} fictional demo records. Existing records left unchanged.'))
