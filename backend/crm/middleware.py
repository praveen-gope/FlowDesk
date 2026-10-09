from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.utils.cache import patch_vary_headers
from django.contrib.auth import logout
from django.core.exceptions import RequestDataTooBig
import time


class SessionSecurityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            now = int(time.time())
            started = request.session.get('security_started', now)
            last = request.session.get('security_last', now)
            if now - started >= settings.SESSION_ABSOLUTE_TIMEOUT or now - last >= settings.SESSION_IDLE_TIMEOUT:
                logout(request)
            elif request.path.startswith('/api/') or request.path.endswith('.html') or request.path == '/':
                request.session['security_started'] = started
                request.session['security_last'] = now
                request.session.set_expiry(min(settings.SESSION_IDLE_TIMEOUT, settings.SESSION_ABSOLUTE_TIMEOUT - (now - started)))
        try:
            response = self.get_response(request)
        except RequestDataTooBig:
            response = JsonResponse({'error': 'Request is too large.'}, status=413)
        if request.path.startswith('/api/') or 'text/html' in response.get('Content-Type', ''):
            response['Cache-Control'] = 'no-store, private'
            patch_vary_headers(response, ['Cookie'])
        response['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response


class CaptureCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path not in ['/api/capture', '/api/support/capture']:
            return self.get_response(request)
        origin = request.headers.get('Origin')
        own = f'{request.scheme}://{request.get_host()}'
        allowed = settings.SUPPORT_FORM_ORIGINS if request.path == '/api/support/capture' else settings.LEAD_FORM_ORIGINS
        if origin and origin != own and origin not in allowed:
            return JsonResponse({'error': 'Website origin is not allowed.'}, status=403)
        response = HttpResponse(status=204) if request.method == 'OPTIONS' else self.get_response(request)
        if origin:
            response['Access-Control-Allow-Origin'] = origin
        response['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type'
        patch_vary_headers(response, ['Origin'])
        return response
