import socket
from flask import Blueprint, jsonify
from config import PORT

bp = Blueprint('network', __name__)


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


@bp.get('/api/network')
def network_info():
    ip = local_ip()
    return jsonify({'ip': ip, 'port': PORT, 'url': f'http://{ip}:{PORT}'})
