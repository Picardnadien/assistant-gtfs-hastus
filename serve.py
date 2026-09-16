#!/usr/bin/env python3
"""Serve the dependency-free local application."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import errno
import os
import webbrowser


HOST = "127.0.0.1"
PREFERRED_PORT = 8765
LAST_PORT = 8795


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    server = None
    for port in range(PREFERRED_PORT, LAST_PORT + 1):
        try:
            server = ThreadingHTTPServer((HOST, port), NoCacheHandler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    if server is None:
        raise SystemExit(f"Aucun port disponible entre {PREFERRED_PORT} et {LAST_PORT}.")
    url = f"http://{HOST}:{server.server_port}/"
    print(f"Assistant GTFS disponible sur {url}")
    if server.server_port != PREFERRED_PORT:
        print(f"Le port {PREFERRED_PORT} était déjà utilisé : ouverture sur le port {server.server_port}.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêté.")
    finally:
        server.server_close()
