"""Local WSGI launcher that avoids reverse-DNS lookup during binding."""
import os
from socketserver import TCPServer
from wsgiref.simple_server import WSGIServer, make_server

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'flowdesk.settings')
from django.core.wsgi import get_wsgi_application


class LocalServer(WSGIServer):
    def server_bind(self):
        TCPServer.server_bind(self)
        self.server_name = 'localhost'
        self.server_port = self.server_address[1]
        self.setup_environ()


if __name__ == '__main__':
    with make_server('127.0.0.1', 8000, get_wsgi_application(), server_class=LocalServer) as server:
        print('FlowDesk running at http://127.0.0.1:8000', flush=True)
        server.serve_forever()
