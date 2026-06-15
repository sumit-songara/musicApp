import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

# When running inside the packaged Electron app, Electron sets these env vars
# so data lives in the user's home folder (survives app updates).
DOWNLOADS_DIR = os.environ.get(
    'OFFLINEBEATS_DOWNLOADS',
    os.path.join(ROOT_DIR, 'downloads'),
)

DB_PATH = os.environ.get(
    'OFFLINEBEATS_DB',
    os.path.join(BASE_DIR, 'musicapp.db'),
)

PORT = int(os.environ.get('FLASK_PORT', 7777))

FRONTEND_DIST = os.environ.get(
    'OFFLINEBEATS_FRONTEND',
    os.path.join(ROOT_DIR, 'frontend', 'dist'),
)

os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
