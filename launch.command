#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display alert "Python 3 est requis" message "Installez Python 3, puis relancez ce fichier." as critical'
  exit 1
fi

echo ""
echo "Démarrage de l’assistant GTFS…"
echo "Un autre port sera choisi automatiquement si une ancienne copie utilise déjà le port 8765."
echo "Gardez cette fenêtre ouverte. Appuyez sur Ctrl+C pour arrêter le programme."
echo ""

python3 serve.py
