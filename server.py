"""Dev server with Cache-Control: no-store so ES module changes are picked up immediately."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7777
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else '.'

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silence request logs

if __name__ == '__main__':
    with http.server.HTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving {DIRECTORY} on port {PORT} (no-cache)', flush=True)
        httpd.serve_forever()
