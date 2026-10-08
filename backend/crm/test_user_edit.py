from django.test import TestCase
from crm.models import User, Team


class UserEditingTests(TestCase):
    def setUp(self):
        self.admin=User.objects.create_user(username='owner', email='owner@example.com', role='super_admin')
        self.target=User.objects.create_user(username='sales', email='sales@example.com', first_name='Aarav', role='sales', password='OriginalSafe!4821')
        self.client.force_login(self.admin)

    def patch(self, data):
        return self.client.patch(f'/api/users/{self.target.pk}', data, content_type='application/json')

    def test_edit_and_activation(self):
        team=Team.objects.create(name='Mumbai Sales')
        response=self.patch({'name':'Priya Nair','email':'priya@example.com','password':'UniqueReset!78329','teams':[team.pk],'active':False})
        self.assertEqual(response.status_code,200)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name,'Priya Nair')
        self.assertEqual(self.target.email,'priya@example.com')
        self.assertTrue(self.target.check_password('UniqueReset!78329'))
        self.assertFalse(self.target.is_active)
        self.assertEqual(self.patch({'active':True}).status_code,200)
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)

    def test_invalid_edit_is_not_partially_saved(self):
        self.assertEqual(self.patch({'name':'Changed','password':'short'}).status_code,400)
        self.target.refresh_from_db()
        self.assertEqual(self.target.first_name,'Aarav')

    def test_admin_cannot_edit_super_admin(self):
        self.client.force_login(self.target)
        response=self.client.patch(f'/api/users/{self.admin.pk}',{'password':'UniqueReset!78329'},content_type='application/json')
        self.assertEqual(response.status_code,403)
