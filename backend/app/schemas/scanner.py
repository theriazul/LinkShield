from typing import List, Literal

from pydantic import BaseModel, Field


class URLScanRequest(BaseModel):
    url: str = Field(..., min_length=1, description='URL to inspect')


class ScanFinding(BaseModel):
    title: str
    detail: str
    severity: Literal['good', 'warn', 'bad']


class URLScanResponse(BaseModel):
    url: str
    score: int
    level: Literal['low', 'caution', 'high']
    findings: List[ScanFinding]
    note: str = 'Heuristic analysis only; this does not prove a domain is safe.'
