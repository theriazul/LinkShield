# LinkShield

LinkShield is a browser-first security dashboard that helps users inspect suspicious links, scam messages, QR codes, and weak password patterns. It emphasizes privacy-first heuristics and clear explanations rather than claiming guaranteed security verdicts.

## Features
- Overview landing hero with animated LinkShield shield, scanner and learning actions, real activity statistics, charts, and quick tools
- URL scanner with local heuristic checks and scoring
- Scam-style message analyzer for suspicious text
- QR inspection with upload + decode support using a browser library
- Password strength checker with recommendations
- URL encoder, decoder, SHA-256 generator, and normalizer
- Local report/history storage with export and deletion controls
- Security learning center and theme preferences
- First-party visitor analytics with pseudonymous identifiers and SQLite aggregation
- Automatically updated copyright footer
- Sticky horizontal top navigation on wide screens, with an accessible dropdown menu on smaller screens

## Running the front end
1. Open the project folder in a browser directly, or serve it locally.
2. For easiest local testing, run:
   python -m http.server 8000
3. Open http://localhost:8000 in a browser.

## Optional FastAPI backend
A minimal backend is included under the `backend` folder.

To install dependencies:

cd backend
python -m pip install -r requirements.txt

To run the API:

python -m uvicorn app.main:app --reload --no-access-log --host 0.0.0.0 --port 8001

Endpoints:
- GET /api/health
- POST /api/scan
- POST /api/analytics/pageview
- GET /api/analytics?report_range=24h|7d|30d

## Visitor analytics
Visitor analytics are stored by the FastAPI backend in SQLite at
`backend/data/visitor_analytics.sqlite3` by default. The table is created
automatically on first use; no migration or extra package is required. Set
`LINKSHIELD_ANALYTICS_DB` to an absolute path to store the database elsewhere.
Keep the database on persistent storage in production and restrict write access
to the backend process.

The browser creates a random 128-bit visitor identifier in localStorage and a
session identifier in sessionStorage. The API stores only SHA-256 hashes of
those identifiers, accepted page names, and server-generated UTC timestamps.
It does not persist IP addresses, referrers, credentials, or user-provided
content. A browser session contributes at most one view per page; repeating a
page or refreshing it in the same tab session is deduplicated. Unique visitors
are distinct pseudonymous browser identifiers in the 90-day retention window,
not people across devices. Active visitors are identifiers with a recorded
view in the last five minutes. Daily rollups use UTC. Analytics collection can
be disabled in Settings; disabling removes the browser identifiers and stops
future collection, but already aggregated records remain until normal
90-day retention cleanup.

The public analytics read endpoint returns aggregates only. Page-view writes
are validated and rate-limited per client address in process memory; this
limit resets when the API restarts and should be replaced or shared across
workers before running multiple production API instances. Real traffic
collection requires the backend to be running and reachable from the site.
The local Uvicorn command disables access logs so it does not write client
addresses. Apply equivalent anonymization or log-retention controls to any
reverse proxy or hosting platform.

For deployment, change the `linkshield-api-base` meta tag in `index.html` to
the public HTTPS API origin and set `CORS_ORIGINS` to the exact frontend
origin. Use persistent storage for the SQLite file. The default
`localhost:8001` API origin is for local development only.

## Important security note
This project is designed for local heuristic review and education. It does not connect to a real threat-intelligence service or guarantee that a website is safe. Use the results as a guide, not as a final verdict.
