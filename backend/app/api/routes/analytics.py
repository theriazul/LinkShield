from __future__ import annotations

import hashlib
import re
import threading
import time
from collections import OrderedDict, deque
from typing import Deque, Dict, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.services.visitor_analytics import get_analytics, record_page_view


router = APIRouter(prefix='/api/analytics', tags=['analytics'])
_rate_limit_lock = threading.Lock()
_request_times: OrderedDict[str, Deque[float]] = OrderedDict()
_MAX_REQUESTS_PER_MINUTE = 120
_RATE_WINDOW_SECONDS = 60
_MAX_RATE_LIMIT_CLIENTS = 4096
_TOKEN_PATTERN = re.compile(r'^[a-f0-9]{32}$')


class PageViewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    visitor_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    session_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    page: Literal[
        'overview',
        'scanner',
        'scam',
        'qr',
        'password',
        'utilities',
        'history',
        'learning',
        'settings',
        'analytics',
    ]


def _enforce_rate_limit(request: Request) -> None:
    client_host = request.client.host if request.client else 'unknown'
    client_key = hashlib.sha256(client_host.encode('utf-8')).hexdigest()
    now = time.monotonic()

    with _rate_limit_lock:
        timestamps = _request_times.get(client_key)
        if timestamps is None:
            if len(_request_times) >= _MAX_RATE_LIMIT_CLIENTS:
                _request_times.popitem(last=False)
            timestamps = deque()
            _request_times[client_key] = timestamps
        else:
            _request_times.move_to_end(client_key)
        while timestamps and timestamps[0] <= now - _RATE_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= _MAX_REQUESTS_PER_MINUTE:
            raise HTTPException(status_code=429, detail='Analytics request limit exceeded.')
        timestamps.append(now)


@router.post('/pageview', status_code=202)
def track_page_view(payload: PageViewRequest, request: Request) -> dict:
    _enforce_rate_limit(request)
    if not _TOKEN_PATTERN.fullmatch(payload.visitor_id) or not _TOKEN_PATTERN.fullmatch(payload.session_id):
        raise HTTPException(status_code=422, detail='Invalid anonymous analytics identifier.')

    try:
        recorded = record_page_view(payload.visitor_id, payload.session_id, payload.page)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {'accepted': True, 'recorded': recorded}


@router.get('')
def read_analytics(
    request: Request,
    report_range: Literal['24h', '7d', '30d'] = '7d',
) -> dict:
    _enforce_rate_limit(request)
    return get_analytics(report_range)
