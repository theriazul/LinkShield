import hashlib
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

from app.api.routes.analytics import _enforce_rate_limit, _request_times
from app.services.visitor_analytics import get_analytics, record_page_view


class VisitorAnalyticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.directory.name) / 'analytics.sqlite3'
        self.previous_database = os.environ.get('LINKSHIELD_ANALYTICS_DB')
        os.environ['LINKSHIELD_ANALYTICS_DB'] = str(self.database_path)

    def tearDown(self) -> None:
        if self.previous_database is None:
            os.environ.pop('LINKSHIELD_ANALYTICS_DB', None)
        else:
            os.environ['LINKSHIELD_ANALYTICS_DB'] = self.previous_database
        self.directory.cleanup()

    def test_records_deduplicated_pseudonymous_visits_and_aggregates(self) -> None:
        visitor_one = 'a' * 32
        session_one = '1' * 32
        visitor_two = 'b' * 32
        session_two = '2' * 32

        self.assertTrue(record_page_view(visitor_one, session_one, 'overview'))
        self.assertFalse(record_page_view(visitor_one, session_one, 'overview'))
        self.assertTrue(record_page_view(visitor_one, session_one, 'scanner'))
        self.assertTrue(record_page_view(visitor_two, session_two, 'overview'))

        result = get_analytics('7d')
        self.assertEqual(result['summary']['page_views'], 3)
        self.assertEqual(result['summary']['unique_visitors'], 2)
        self.assertEqual(result['summary']['today_visitors'], 2)
        self.assertEqual(result['summary']['active_visitors'], 2)
        self.assertEqual(len(result['series']), 7)
        self.assertEqual(result['timezone'], 'UTC')
        self.assertEqual(sum(point['page_views'] for point in result['series']), 3)
        self.assertEqual(sum(point['visitors'] for point in result['series']), 2)

        connection = sqlite3.connect(self.database_path)
        try:
            stored_values = [value for row in connection.execute(
                'SELECT visitor_hash, session_hash FROM page_views'
            ) for value in row]
        finally:
            connection.close()
        self.assertNotIn(visitor_one, stored_values)
        self.assertNotIn(session_one, stored_values)

    def test_empty_ranges_have_real_zero_values(self) -> None:
        result = get_analytics('24h')

        self.assertEqual(result['summary']['page_views'], 0)
        self.assertEqual(result['summary']['unique_visitors'], 0)
        self.assertEqual(len(result['series']), 24)
        self.assertTrue(all(point['visitors'] == 0 for point in result['series']))

    def test_invalid_range_and_page_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            record_page_view('a' * 32, 'b' * 32, 'not-a-page')
        with self.assertRaises(ValueError):
            get_analytics('all-time')

    def test_old_events_are_removed_after_the_retention_period(self) -> None:
        record_page_view('a' * 32, '1' * 32, 'overview')
        connection = sqlite3.connect(self.database_path)
        try:
            old_time = (datetime.now(timezone.utc) - timedelta(days=91)).timestamp()
            connection.execute(
                '''
                INSERT INTO page_views (visitor_hash, session_hash, page, viewed_at)
                VALUES (?, ?, ?, ?)
                ''',
                (
                    hashlib.sha256(('b' * 32).encode('utf-8')).hexdigest(),
                    hashlib.sha256(('2' * 32).encode('utf-8')).hexdigest(),
                    'overview',
                    old_time,
                ),
            )
            connection.commit()
        finally:
            connection.close()

        result = get_analytics('30d')
        self.assertEqual(result['summary']['page_views'], 1)
        connection = sqlite3.connect(self.database_path)
        try:
            remaining_events = connection.execute('SELECT COUNT(*) FROM page_views').fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(remaining_events, 1)

    def test_rate_limit_rejects_requests_over_the_per_minute_limit(self) -> None:
        request = Request({
            'type': 'http',
            'client': ('192.0.2.1', 8000),
            'headers': [],
            'query_string': b'',
        })
        for _ in range(120):
            _enforce_rate_limit(request)
        with self.assertRaises(HTTPException) as error:
            _enforce_rate_limit(request)
        self.assertEqual(error.exception.status_code, 429)


if __name__ == '__main__':
    unittest.main()
