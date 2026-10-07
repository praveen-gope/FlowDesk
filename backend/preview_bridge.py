"""Development-only WSGI transport for environments blocking Python sockets."""
import base64
import contextlib
import io
import json
import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'flowdesk.settings')
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()

for line in sys.stdin:
    request = json.loads(line)
    try:
        body = base64.b64decode(request['body'])
        environ = {
            'REQUEST_METHOD': request['method'], 'SCRIPT_NAME': '',
            'PATH_INFO': request['path'], 'QUERY_STRING': request['query'],
            'SERVER_NAME': 'localhost', 'SERVER_PORT': str(request['port']),
            'SERVER_PROTOCOL': 'HTTP/1.1', 'REMOTE_ADDR': '127.0.0.1',
            'wsgi.version': (1, 0), 'wsgi.url_scheme': 'http',
            'wsgi.input': io.BytesIO(body), 'wsgi.errors': sys.stderr,
            'wsgi.multithread': False, 'wsgi.multiprocess': False,
            'wsgi.run_once': False, 'CONTENT_LENGTH': str(len(body)),
        }
        for key, value in request['headers'].items():
            name = key.upper().replace('-', '_')
            environ[name if name in ['CONTENT_TYPE', 'CONTENT_LENGTH'] else 'HTTP_' + name] = value
        result = {}
        def start_response(status, headers, exc_info=None):
            result.update(status=int(status.split()[0]), headers=headers)
        with contextlib.redirect_stdout(sys.stderr):
            response = application(environ, start_response)
            try:
                content = b''.join(response)
            finally:
                if hasattr(response, 'close'):
                    response.close()
        result.update(id=request['id'], body=base64.b64encode(content).decode())
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        result = {'id': request['id'], 'status': 500, 'headers': [], 'body': base64.b64encode(b'Preview request failed.').decode()}
    sys.stdout.write(json.dumps(result) + '\n')
    sys.stdout.flush()
