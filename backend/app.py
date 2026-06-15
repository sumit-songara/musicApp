import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from database import init_db
from config import FRONTEND_DIST
from routes.playlists import bp as playlists_bp
from routes.downloads import bp as downloads_bp
from routes.audio import bp as audio_bp
from routes.local import bp as local_bp
from routes.network import bp as network_bp
from routes.mobile import bp as mobile_bp

app = Flask(__name__)
CORS(app, resources={r'/*': {'origins': '*'}})

app.register_blueprint(playlists_bp)
app.register_blueprint(downloads_bp)
app.register_blueprint(audio_bp)
app.register_blueprint(local_bp)
app.register_blueprint(network_bp)
app.register_blueprint(mobile_bp)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return 'Frontend not built. Run: cd frontend && npm install && npm run build', 503


if __name__ == '__main__':
    init_db()
    from config import PORT
    app.run(host='0.0.0.0', port=PORT, debug=False)
