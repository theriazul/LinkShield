from fastapi import APIRouter

router = APIRouter()


@router.get('/api/health')
def health_check() -> dict:
    return {
        'status': 'ok',
        'service': 'LinkShield backend',
        'version': '1.0.0'
    }
