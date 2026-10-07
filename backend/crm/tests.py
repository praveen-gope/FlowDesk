import json
from django.test import TestCase, Client
from django.core.cache import cache
from .models import User, Team, Record


class RoleAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.team = Team.objects.create(name='A')
        cls.other = Team.objects.create(name='B')
        cls.users = {role: User.objects.create_user(username=role, email=role+'@example.com', password='StrongExample!947', role=role) for role in User.Role.values}
        cls.users['manager'].teams.add(cls.team)
        cls.users['sales'].teams.add(cls.team)
        cls.owned = Record.objects.create(kind='lead', name='Owned', team=cls.team, owner=cls.users['sales'])
        cls.unrelated = Record.objects.create(kind='lead', name='Other', team=cls.other)
        cls.support = Record.objects.create(kind='task', name='Support', team=cls.other, support_access=True)
        cls.support.assigned_to.add(cls.users['support'])
        cls.customer = Record.objects.create(kind='contact', name='Customer', support_access=True)
        cls.customer.assigned_to.add(cls.users['support'])

    def setUp(self):
        cache.clear()

    def as_role(self, role):
        self.client.force_login(self.users[role])

    def request_json(self, method, url, data):
        return getattr(self.client, method)(url, data=json.dumps(data), content_type='application/json')

    def test_all_five_visibility_scopes(self):
        expected = {'super_admin': 2, 'admin': 2, 'manager': 1, 'sales': 1, 'support': 0}
        for role, count in expected.items():
            self.as_role(role)
            self.assertEqual(len(self.client.get('/api/leads').json()['leads']), count)
        self.as_role('support')
        self.assertEqual(len(self.client.get('/api/records/task').json()['records']), 1)
        self.assertEqual(len(self.client.get('/api/records/contact').json()['records']), 1)

    def test_direct_record_access_and_writes_are_scoped(self):
        for role in ['manager', 'sales', 'support']:
            self.as_role(role)
            url = '/api/record/'+str(self.unrelated.pk)
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.request_json('patch', url, {'name': 'Stolen'}).status_code, 404)
            self.assertEqual(self.client.delete(url).status_code, 404)

    def test_sales_cannot_reassign_or_delete(self):
        self.as_role('sales')
        url = '/api/record/'+str(self.owned.pk)
        self.assertEqual(self.request_json('patch', url, {'owner': self.users['admin'].pk}).status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.assertEqual(self.request_json('patch', url, {'status': 'Qualified'}).status_code, 200)

    def test_support_permissions(self):
        self.as_role('support')
        self.assertEqual(self.request_json('post', '/api/records/lead', {'name':'Forbidden'}).status_code, 403)
        self.assertEqual(self.request_json('post', '/api/records/note', {'name':'Support note'}).status_code, 201)
        self.assertEqual(self.request_json('patch', '/api/record/'+str(self.customer.pk), {'name':'Edited'}).status_code, 403)

    def test_admin_cannot_escalate_users(self):
        self.as_role('admin')
        self.assertEqual(self.request_json('post', '/api/users', {'email':'new@example.com', 'password':'StrongExample!947', 'role':'super_admin'}).status_code, 403)
        self.assertEqual(self.request_json('patch', '/api/users/'+str(self.users['sales'].pk), {'role':'admin'}).status_code, 403)
        self.assertEqual(self.request_json('patch', '/api/users/'+str(self.users['super_admin'].pk), {'active':False}).status_code, 403)
        self.assertEqual(self.client.get('/api/system').status_code, 403)
        self.as_role('super_admin')
        self.assertEqual(self.client.get('/api/system').status_code, 200)

    def test_manager_assignment_cannot_escape_team(self):
        self.as_role('manager')
        url = '/api/record/'+str(self.owned.pk)
        self.assertEqual(self.request_json('patch', url, {'team':self.other.pk}).status_code, 403)
        self.assertEqual(self.request_json('patch', url, {'assigned_to':[self.users['support'].pk]}).status_code, 403)

    def test_csrf_and_real_login(self):
        client = Client(enforce_csrf_checks=True)
        data = {'email':'sales@example.com','password':'StrongExample!947'}
        self.assertEqual(client.post('/api/auth/login', json.dumps(data), content_type='application/json').status_code, 403)
        token = client.get('/api/auth/session').json()['csrfToken']
        self.assertEqual(client.post('/api/auth/login', json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.assertEqual(client.get('/api/leads').status_code, 200)

    def test_capture_cannot_inject_assignments(self):
        response = self.request_json('post', '/api/capture', {'name':'Website Lead','email':'lead@example.com','owner':self.users['sales'].pk,'status':'Won','support_access':True})
        self.assertEqual(response.status_code, 201)
        record = Record.objects.get(pk=response.json()['id'])
        self.assertIsNone(record.owner)
        self.assertEqual(record.status, 'New')
        self.assertFalse(record.support_access)
        self.assertEqual(self.client.get('/api/leads').status_code, 401)

    def test_capture_validation_and_origin(self):
        self.assertEqual(self.request_json('post','/api/capture',{'name':'Test','email':'bad'}).status_code,400)
        self.assertEqual(self.client.post('/api/capture','{}',content_type='application/json',HTTP_ORIGIN='https://forbidden.example').status_code,403)

    def test_external_website_lead_is_saved_and_visible_to_admin(self):
        client = Client(enforce_csrf_checks=True)
        with self.settings(LEAD_FORM_ORIGINS=['https://website.example']):
            response = client.post('/api/capture', json.dumps({'name':'External Customer','email':'customer@example.com','message':'Please contact me','source':'External website'}), content_type='application/json', HTTP_ORIGIN='https://website.example')
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response['Access-Control-Allow-Origin'], 'https://website.example')
            self.assertNotIn('Access-Control-Allow-Credentials', response)
            record = Record.objects.get(pk=response.json()['id'])
            self.assertEqual(record.kind, 'lead')
            self.assertEqual(record.source, 'External website')
            self.assertEqual(record.status, 'New')
            self.assertEqual(client.get('/api/leads').status_code, 401)
            client.force_login(self.users['admin'])
            ids = [r['id'] for r in client.get('/api/leads').json()['leads']]
            self.assertIn(str(record.pk), ids)
            preflight = client.options('/api/capture', HTTP_ORIGIN='https://website.example')
            self.assertEqual(preflight.status_code, 204)

    def test_reports_are_scoped_and_backend_files_private(self):
        self.as_role('sales')
        self.assertEqual(self.client.get('/api/reports').json()['counts']['lead'],1)
        self.assertEqual(self.client.get('/backend/LOCAL-ACCOUNTS.md').status_code,404)
        self.assertEqual(self.client.get('/backend/flowdesk/settings.py').status_code,404)

    def test_user_creation_and_team_membership(self):
        self.as_role('admin')
        response=self.request_json('post','/api/users',{'name':'New Sales','email':'new.sales@example.com','password':'UniqueExample!9485','role':'sales','teams':[self.team.pk]})
        self.assertEqual(response.status_code,201)
        created=User.objects.get(pk=response.json()['user']['id'])
        self.assertTrue(created.check_password('UniqueExample!9485'))
        self.assertTrue(created.teams.filter(pk=self.team.pk).exists())
        self.assertEqual(self.request_json('patch','/api/users/'+str(created.pk),{'active':False}).status_code,200)
        created.refresh_from_db()
        self.assertFalse(created.is_active)

    def test_assignment_makes_captured_lead_visible_to_sales(self):
        self.as_role('admin')
        url='/api/record/'+str(self.unrelated.pk)
        self.assertEqual(self.request_json('patch',url,{'team':self.team.pk,'assigned_to':[self.users['sales'].pk]}).status_code,200)
        self.as_role('sales')
        self.assertEqual(self.client.get(url).status_code,200)

    def test_frontend_requires_real_session(self):
        self.assertEqual(self.client.get('/index.html').status_code,200)
        self.assertEqual(self.client.get('/html/dashboard.html').status_code,302)
        landing=self.client.get('/index.html')
        self.assertContains(landing,'Open your workspace')
        login_page=self.client.get('/html/sign-in.html')
        self.assertNotContains(login_page,'id="nav"')
        self.assertNotContains(login_page,'<aside')
        self.assertEqual(self.client.get('/html/sign-in.html').status_code,200)
        self.assertEqual(self.client.get('/html/lead-form.html').status_code,200)
        self.as_role('sales')
        self.assertEqual(self.client.get('/html/contacts.html').status_code,200)
        response = self.client.get('/html/contacts.html')
        self.assertContains(response, 'id="nav"', count=1)
        self.assertContains(response, 'Support Tickets')
        self.assertNotContains(response, '{% include')


class SupportCaptureTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(username='support-admin', email='support-admin@example.com', role='admin')
        self.support_user = User.objects.create_user(username='support-agent', email='support-agent@example.com', role='support')
        self.other_user = User.objects.create_user(username='other-agent', email='other-agent@example.com', role='support')
        self.data = {'name':'Jane Smith','email':'jane@example.com','subject':'Account access','message':'Please help me sign in.','priority':'High','category':'Technical issue'}

    def submit(self, data=None, **headers):
        return self.client.post('/api/support/capture', json.dumps(self.data if data is None else data), content_type='application/json', **headers)

    def test_public_capture_and_private_read(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201)
        ticket = Record.objects.get(pk=response.json()['id'])
        self.assertEqual(ticket.kind, 'ticket')
        self.assertEqual(ticket.status, 'Open')
        self.assertEqual(ticket.details['Requester'], 'Jane Smith')
        self.assertTrue(ticket.support_access)
        self.assertIsNone(ticket.owner)
        self.assertEqual(self.client.get('/api/records/ticket').status_code, 401)
        self.assertEqual(self.client.get('/api/support/capture').status_code, 405)
        self.client.force_login(self.admin)
        self.assertEqual(len(self.client.get('/api/records/ticket').json()['records']), 1)

    def test_assignment_and_support_update(self):
        ticket = Record.objects.get(pk=self.submit().json()['id'])
        self.client.force_login(self.support_user)
        self.assertEqual(self.client.get('/api/record/'+str(ticket.pk)).status_code, 404)
        ticket.assigned_to.add(self.support_user)
        self.assertEqual(self.client.get('/api/record/'+str(ticket.pk)).status_code, 200)
        response = self.client.patch('/api/record/'+str(ticket.pk), json.dumps({'status':'Resolved'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.client.force_login(self.other_user)
        self.assertEqual(self.client.get('/api/record/'+str(ticket.pk)).status_code, 404)
        ticket.support_access = False
        ticket.save()
        self.client.force_login(self.support_user)
        self.assertEqual(self.client.get('/api/record/'+str(ticket.pk)).status_code, 404)

    def test_cannot_inject_owner_or_permissions(self):
        response = self.submit({**self.data, 'owner':self.support_user.pk,'assigned_to':[self.support_user.pk],'status':'Resolved','support_access':False})
        self.assertEqual(response.status_code, 201)
        ticket = Record.objects.get(pk=response.json()['id'])
        self.assertIsNone(ticket.owner)
        self.assertFalse(ticket.assigned_to.exists())
        self.assertEqual(ticket.status, 'Open')
        self.assertTrue(ticket.support_access)

    def test_invalid_inputs_and_honeypot(self):
        for changed in [{'email':'not-email'},{'subject':''},{'message':''},{'priority':'invalid'},{'category':'invalid'},{'website':'bot'}]:
            self.assertEqual(self.submit({**self.data, **changed}).status_code, 400)
        self.assertFalse(Record.objects.filter(kind='ticket').exists())

    def test_support_origin_and_preflight(self):
        self.assertEqual(self.submit(HTTP_ORIGIN='https://blocked.example').status_code, 403)
        with self.settings(SUPPORT_FORM_ORIGINS=['https://help.example']):
            response = self.submit(HTTP_ORIGIN='https://help.example')
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response['Access-Control-Allow-Origin'], 'https://help.example')
            response = self.client.options('/api/support/capture', HTTP_ORIGIN='https://help.example')
            self.assertEqual(response.status_code, 204)
            self.assertNotIn('Access-Control-Allow-Credentials', response)

    def test_rate_limit_and_public_form(self):
        self.assertEqual(self.client.get('/html/support-form.html').status_code, 200)
        for _ in range(20):
            self.assertEqual(self.submit({'name':'invalid'}).status_code, 400)
        self.assertEqual(self.submit().status_code, 429)


class UserHierarchyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.team = Team.objects.create(name='Hierarchy Team')
        cls.other_team = Team.objects.create(name='Outside Team')
        cls.accounts = {}
        for role in User.Role.values:
            user = User.objects.create_user(username='h-'+role, email='h-'+role+'@example.com', role=role)
            user.teams.add(cls.team)
            cls.accounts[role] = user

    def create(self, actor, target, **extra):
        self.client.force_login(self.accounts[actor])
        data = {'name':'New Account','email':actor+'-'+target+'@hierarchy.example','role':target,'password':'Distinct!Phrase9847','teams':[self.team.pk]}
        data.update(extra)
        return self.client.post('/api/users',json.dumps(data),content_type='application/json')

    def test_complete_creation_matrix(self):
        allowed = {'super_admin':set(User.Role.values),'admin':{'manager','sales','support'},'manager':{'manager','sales','support'},'sales':{'support'},'support':{'support'}}
        for actor in User.Role.values:
            for target in User.Role.values:
                with self.subTest(actor=actor,target=target):
                    response=self.create(actor,target)
                    self.assertEqual(response.status_code,201 if target in allowed[actor] else 403)
                    if response.status_code==201:
                        created=User.objects.get(pk=response.json()['user']['id'])
                        self.assertEqual(created.created_by_id,self.accounts[actor].pk)
                        self.assertEqual(created.role,target)

    def test_manager_and_lower_roles_cannot_assign_outside_teams(self):
        for actor in ['manager','sales','support']:
            with self.subTest(actor=actor):
                self.assertEqual(self.create(actor,'support',teams=[self.other_team.pk]).status_code,403)

    def test_sales_and_support_manage_only_their_invites(self):
        for actor in ['sales','support']:
            created=User.objects.get(pk=self.create(actor,'support').json()['user']['id'])
            self.client.force_login(self.accounts[actor])
            self.assertEqual(self.client.patch('/api/users/'+str(created.pk),json.dumps({'active':False}),content_type='application/json').status_code,200)
            self.assertEqual(self.client.patch('/api/users/'+str(self.accounts['admin'].pk),json.dumps({'active':False}),content_type='application/json').status_code,403)
            self.assertEqual(self.client.patch('/api/users/'+str(created.pk),json.dumps({'role':'sales'}),content_type='application/json').status_code,403)

    def test_manager_peer_and_outside_team_changes_are_blocked(self):
        peer=User.objects.create_user(username='peer-manager',email='peer@example.com',role='manager')
        peer.teams.add(self.team)
        outside=User.objects.create_user(username='outside-sales',email='outside@example.com',role='sales')
        outside.teams.add(self.team,self.other_team)
        self.client.force_login(self.accounts['manager'])
        for target in [peer,outside,self.accounts['admin']]:
            self.assertEqual(self.client.patch('/api/users/'+str(target.pk),json.dumps({'active':False}),content_type='application/json').status_code,403)

    def test_role_choices_match_server_policy(self):
        expected={'super_admin':5,'admin':3,'manager':3,'sales':1,'support':1}
        for actor,count in expected.items():
            self.client.force_login(self.accounts[actor])
            response=self.client.get('/api/users')
            self.assertEqual(response.status_code,200)
            self.assertEqual(len(response.json()['roles']),count)
            if actor not in ['super_admin','admin']:
                self.assertEqual(len(self.client.get('/api/teams').json()['teams']),1)
                self.assertEqual(self.client.post('/api/teams',json.dumps({'name':'Unauthorized'}),content_type='application/json').status_code,403)
