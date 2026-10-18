from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.analytics import router as analytics_router
from app.api.routes.health import router as health_router
from app.api.routes.scanner import router as scanner_router
from app.core.config import get_cors_origins

app = FastAPI(
    title='LinkShield API',
    description='URL heuristic checks and privacy-conscious aggregate visitor analytics.',
    version='1.0.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health_router)
app.include_router(scanner_router)
app.include_router(analytics_router)


@app.get('/')
def root() -> dict:
    return {'message': 'LinkShield backend running'}
