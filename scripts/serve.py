# 本機開發伺服器：加大連線佇列，避免同時載入大量素材時掉連線
import http.server, socketserver, sys

class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
with Server(('', port), http.server.SimpleHTTPRequestHandler) as s:
    print(f'Serving http://localhost:{port}', flush=True)
    s.serve_forever()
