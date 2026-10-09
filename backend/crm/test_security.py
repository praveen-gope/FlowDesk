import time
from django.test import TestCase, Client, override_settings
from crm.models import User, SecurityRateLimit


class SecurityTests(TestCase):
    def setUp(self):
        self.user=User.objects.create_user(username='secure', email='secure@example.com', password='SecureExample!48291', role='super_admin')

    @override_settings(SESSION_IDLE_TIMEOUT=60, SESSION_ABSOLUTE_TIMEOUT=120)
    def test_idle_and_absolute_session_expiry(self):
        self.client.force_login(self.user)
        session=self.client.session
        session['security_started']=int(time.time())-70
        session['security_last']=int(time.time())-61
        session.save()
        self.assertEqual(self.client.get('/api/reports').status_code,401)
        self.client.force_login(self.user)
        session=self.client.session
        session['security_started']=int(time.time())-121
        session['security_last']=int(time.time())
        session.save()
        self.assertEqual(self.client.get('/api/reports').status_code,401)

    def test_csrf_required_for_login_and_private_writes(self):
        client=Client(enforce_csrf_checks=True)
        self.assertEqual(client.post('/api/auth/login',{'email':self.user.email,'password':'SecureExample!48291'},content_type='application/json').status_code,403)
        client.force_login(self.user)
        self.assertEqual(client.post('/api/records/contact',{'name':'Example'},content_type='application/json').status_code,403)

    def test_headers_and_private_source_blocked(self):
        response=self.client.get('/html/sign-in.html')
        self.assertEqual(response['X-Frame-Options'],'DENY')
        self.assertIn('no-store',response['Cache-Control'])
        self.assertEqual(self.client.get('/netlify/functions/crm.mjs').status_code,404)
        self.assertEqual(self.client.get('/backend/.env').status_code,404)

    def test_login_throttle_is_persisted(self):
        for _ in range(10):
            self.client.post('/api/auth/login',{'email':'nobody@example.com','password':'WrongPassword!782'},content_type='application/json')
        response=self.client.post('/api/auth/login',{'email':self.user.email,'password':'SecureExample!48291'},content_type='application/json')
        self.assertEqual(response.status_code,429)
        self.assertTrue(SecurityRateLimit.objects.exists())
