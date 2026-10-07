from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.utils.cache import patch_vary_headers


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
