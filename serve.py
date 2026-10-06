#!/usr/bin/env python3
"""Serve the dependency-free local application."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import errno
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import webbrowser


HOST = "127.0.0.1"
PREFERRED_PORT = 8765
LAST_PORT = 8795
OVERPASS_PROVIDERS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/osm":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 200_000:
                raise ValueError("Taille de requête invalide")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            query = payload.get("query", "")
            if not isinstance(query, str) or not query.strip():
                raise ValueError("Requête OSM manquante")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_error(400, str(error))
            return

        body = urlencode({"data": query}).encode("utf-8")
        last_error = "service indisponible"
        for provider in OVERPASS_PROVIDERS:
            request = Request(
                provider,
                data=body,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "User-Agent": "Assistant-GTFS-HASTUS/22 (local report generator)",
                },
                method="POST",
            )
            try:
                with urlopen(request, timeout=25) as response:
                    data = response.read()
                json.loads(data.decode("utf-8"))
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
                last_error = str(error)
        data = json.dumps({"error": last_error}).encode("utf-8")
        self.send_response(502)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

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
    print(f"The GTFS Missing Link disponible sur {url}")
    if server.server_port != PREFERRED_PORT:
        print(f"Le port {PREFERRED_PORT} était déjà utilisé : ouverture sur le port {server.server_port}.")
    if os.environ.get("GTFS_NO_BROWSER") != "1":
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêté.")
    finally:
        server.server_close()
