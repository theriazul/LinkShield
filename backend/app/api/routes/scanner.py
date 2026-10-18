from fastapi import APIRouter, HTTPException

from app.schemas.scanner import URLScanRequest, URLScanResponse
from app.services.url_analyzer import analyze_url

router = APIRouter()


@router.post('/api/scan', response_model=URLScanResponse)
def scan_url(payload: URLScanRequest) -> URLScanResponse:
    try:
        result = analyze_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return URLScanResponse(
        url=result['url'],
        score=result['score'],
        level=result['level'],
        findings=result['findings'],
        note=result['note'],
    )
