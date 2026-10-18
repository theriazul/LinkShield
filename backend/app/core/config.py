import os
from typing import List


DEFAULT_CORS_ORIGINS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
]


def get_cors_origins() -> List[str]:
    raw = os.getenv('CORS_ORIGINS', ','.join(DEFAULT_CORS_ORIGINS))
    origins = [origin.strip() for origin in raw.split(',') if origin.strip()]
    return origins or DEFAULT_CORS_ORIGINS
