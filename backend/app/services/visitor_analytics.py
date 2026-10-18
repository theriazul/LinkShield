from __future__ import annotations

import hashlib
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List


RETENTION_DAYS = 90
ACTIVE_WINDOW_SECONDS = 5 * 60
VALID_PAGES = {
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
}


def _database_path() -> Path:
    configured_path = os.getenv('LINKSHIELD_ANALYTICS_DB')
    if configured_path:
        return Path(configured_path).expanduser().resolve()
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / 'data' / 'visitor_analytics.sqlite3'


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA busy_timeout = 10000')
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        '''
        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY,
            visitor_hash TEXT NOT NULL,
            session_hash TEXT NOT NULL,
            page TEXT NOT NULL,
            viewed_at REAL NOT NULL,
            UNIQUE(session_hash, page)
        )
        '''
    )
    connection.execute(
        'CREATE INDEX IF NOT EXISTS idx_page_views_time ON page_views(viewed_at)'
    )
    connection.execute(
        'CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_hash)'
    )


def record_page_view(visitor_id: str, session_id: str, page: str) -> bool:
    if page not in VALID_PAGES:
        raise ValueError('Unsupported page.')

    now = datetime.now(timezone.utc).timestamp()
    with _connect() as connection:
        _ensure_schema(connection)
        cursor = connection.execute(
            '''
            INSERT OR IGNORE INTO page_views
                (visitor_hash, session_hash, page, viewed_at)
            VALUES (?, ?, ?, ?)
            ''',
            (_digest(visitor_id), _digest(session_id), page, now),
        )
        connection.execute(
            'DELETE FROM page_views WHERE viewed_at < ?',
            (now - RETENTION_DAYS * 24 * 60 * 60,),
        )
        return cursor.rowcount == 1


def get_analytics(report_range: str) -> Dict[str, Any]:
    if report_range not in {'24h', '7d', '30d'}:
        raise ValueError('Unsupported analytics range.')

    now = datetime.now(timezone.utc)
    now_timestamp = now.timestamp()
    retention_start = now_timestamp - RETENTION_DAYS * 24 * 60 * 60

    if report_range == '24h':
        current_bucket = int(now_timestamp // 3600)
        bucket_ids = list(range(current_bucket - 23, current_bucket + 1))
        range_start = bucket_ids[0] * 3600
    else:
        day_count = 7 if report_range == '7d' else 30
        current_day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        first_day = current_day.timestamp() - (day_count - 1) * 24 * 60 * 60
        bucket_ids = list(range(day_count))
        range_start = first_day

    with _connect() as connection:
        _ensure_schema(connection)
        connection.execute('DELETE FROM page_views WHERE viewed_at < ?', (retention_start,))
        summary = connection.execute(
            '''
            SELECT
                COUNT(*) AS page_views,
                COUNT(DISTINCT visitor_hash) AS unique_visitors,
                COUNT(DISTINCT CASE WHEN date(viewed_at, 'unixepoch') = ? THEN visitor_hash END)
                    AS today_visitors,
                COUNT(DISTINCT CASE WHEN viewed_at >= ? THEN visitor_hash END)
                    AS active_visitors
            FROM page_views
            WHERE viewed_at >= ?
            ''',
            (
                now.date().isoformat(),
                now_timestamp - ACTIVE_WINDOW_SECONDS,
                retention_start,
            ),
        ).fetchone()

        if report_range == '24h':
            grouped = connection.execute(
                '''
                SELECT CAST(viewed_at / 3600 AS INTEGER) AS bucket,
                       COUNT(*) AS page_views,
                       COUNT(DISTINCT visitor_hash) AS visitors
                FROM page_views
                WHERE viewed_at >= ? AND viewed_at < ?
                GROUP BY bucket
                ''',
                (range_start, (bucket_ids[-1] + 1) * 3600),
            ).fetchall()
            series: List[Dict[str, Any]] = []
            by_bucket = {row['bucket']: row for row in grouped}
            for bucket in bucket_ids:
                period = datetime.fromtimestamp(bucket * 3600, timezone.utc)
                row = by_bucket.get(bucket)
                series.append({
                    'period': period.isoformat(timespec='minutes'),
                    'visitors': row['visitors'] if row else 0,
                    'page_views': row['page_views'] if row else 0,
                })
        else:
            grouped = connection.execute(
                '''
                SELECT date(viewed_at, 'unixepoch') AS bucket,
                       COUNT(*) AS page_views,
                       COUNT(DISTINCT visitor_hash) AS visitors
                FROM page_views
                WHERE viewed_at >= ? AND viewed_at < ?
                GROUP BY bucket
                ''',
                (range_start, now_timestamp + 1),
            ).fetchall()
            by_bucket = {row['bucket']: row for row in grouped}
            first_day = datetime.fromtimestamp(range_start, timezone.utc)
            series = []
            for offset in bucket_ids:
                day = first_day.timestamp() + offset * 24 * 60 * 60
                bucket = datetime.fromtimestamp(day, timezone.utc).date().isoformat()
                row = by_bucket.get(bucket)
                series.append({
                    'period': bucket,
                    'visitors': row['visitors'] if row else 0,
                    'page_views': row['page_views'] if row else 0,
                })

    return {
        'collection_enabled': True,
        'generated_at': now.isoformat(timespec='seconds'),
        'timezone': 'UTC',
        'retention_days': RETENTION_DAYS,
        'active_window_seconds': ACTIVE_WINDOW_SECONDS,
        'summary': {
            'page_views': summary['page_views'],
            'unique_visitors': summary['unique_visitors'],
            'today_visitors': summary['today_visitors'],
            'active_visitors': summary['active_visitors'],
        },
        'series': series,
    }
