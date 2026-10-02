"""Independent ZIP/CRC verification using Python's standard ZIP implementation."""
from pathlib import Path
import io
import json
import csv
import re
import sys
import zipfile

path = Path(__file__).resolve().parent.parent / "tmp" / "report-editor-package-test.zip"
with zipfile.ZipFile(path) as bundle:
    assert bundle.testzip() is None
    assert "Compte rendu" in bundle.read("rapport_corrige.html").decode("utf-8")
    changes = json.loads(bundle.read("modifications.json"))
    assert len(changes["places"]) == len(changes["stops"]) == 1
    with zipfile.ZipFile(io.BytesIO(bundle.read("GTFS_finalise.zip"))) as gtfs:
        assert gtfs.testzip() is None
        assert len(gtfs.namelist()) == 12
        assert all("/" not in name for name in gtfs.namelist())
        assert "Abcdefgh" in gtfs.read("stops.txt").decode("utf-8")
        assert "Été" in gtfs.read("locations.geojson").decode("utf-8")
print("PASS: outer ZIP and nested GTFS ZIP independently verified, CRCs valid, UTF-8 preserved.")

# Optional browser-generated synthetic package, after renaming AAA and moving 001.
if len(sys.argv) > 1:
    with zipfile.ZipFile(sys.argv[1]) as bundle:
        assert bundle.testzip() is None
        html = bundle.read(next(n for n in bundle.namelist() if n.endswith('.html'))).decode('utf-8')
        payload = json.loads(re.search(r'<script id="report-data" type="application/json">(.*?)</script>', html, re.S)[1])
        assert payload['hideFileExports'] is True
        assert payload['savedAt']
        assert payload['edits']['places'][0]['code'] == 'Abcdefgh'
        assert payload['places'][0]['code'] == 'AAA'  # immutable comparison baseline
        assert html.index('id="client-change-summary"') < html.index('id="report-top"')
        button = re.search(r'<button[^>]*id="download-client-package"[^>]*>(.*?)</button>', html)[0]
        assert 'Télécharger le ZIP de retour client' in button
        assert 'disabled' not in button
        assert 'id="download-client-stops"' not in html
        changes = json.loads(bundle.read('modifications.json'))
        assert len(changes['places']) == len(changes['stops']) == 1
        with zipfile.ZipFile(io.BytesIO(bundle.read('GTFS_finalise.zip'))) as gtfs:
            assert gtfs.testzip() is None and len(gtfs.namelist()) == 6
            rows = list(csv.DictReader(io.StringIO(gtfs.read('stops.txt').decode('utf-8'))))
            assert next(r for r in rows if r['stop_id'] == '001')['parent_station'] == 'BBB'
            assert next(r for r in rows if r['stop_id'] == 'Abcdefgh')['stop_name'] == 'École du Nord – entrée principale'
            assert '25:01:00' in gtfs.read('stop_times.txt').decode('utf-8')
    print('PASS: browser download, complete GTFS, edits, baseline and first-page summary verified.')
