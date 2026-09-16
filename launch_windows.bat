@echo off
setlocal
cd /d "%~dp0"

echo.
echo Demarrage de l'assistant GTFS HASTUS...
echo La page doit s'ouvrir sur http://127.0.0.1 et non sur file:///
echo Gardez cette fenetre ouverte. Appuyez sur Ctrl+C pour arreter le programme.
echo.

where py >nul 2>nul
if not errorlevel 1 (
  py -3 serve.py
  goto :end
)

where python >nul 2>nul
if not errorlevel 1 (
  python serve.py
  goto :end
)

where python3 >nul 2>nul
if not errorlevel 1 (
  python3 serve.py
  goto :end
)

echo Python 3 est requis pour lancer l'application et afficher les cartes OpenStreetMap.
echo Installez Python depuis https://www.python.org/downloads/windows/
start "" "https://www.python.org/downloads/windows/"

:end
echo.
pause
