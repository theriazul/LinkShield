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

## Deploying the API with GitHub Pages

GitHub Pages hosts the static frontend only; it does not run the FastAPI
backend or retain its SQLite database. The analytics dashboard and page-view
collection therefore require a separately deployed, publicly reachable
FastAPI backend. There is no backend deployment configured in this repository.

1. Deploy the `backend` directory to a Python web-service host that supports
   HTTPS and persistent disk storage. Install dependencies with
   `pip install -r requirements.txt` from that directory and start the service
   with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (use the port syntax
   required by your host).
2. Set `CORS_ORIGINS` in the backend service to the exact frontend **origin**.
   For this repository's GitHub Pages project site, that is
   `https://theriazul.github.io` (do not include `/LinkShield/`). If you use a
   custom domain, use its HTTPS origin instead.
3. Attach persistent storage to the backend and set `LINKSHIELD_ANALYTICS_DB`
   to a SQLite file path on that storage. Without a persistent disk, analytics
   records may be lost when the backend is redeployed or restarted.
4. After the backend is running, set the `linkshield-api-base` meta tag in
   `index.html` to its public HTTPS origin, for example
   `https://your-linkshield-api.example.com`. The API origin is public
   configuration, not a secret. GitHub Pages does not inject backend
   environment variables into static HTML, so this value must be committed
   before publishing the frontend.
5. Verify `https://your-linkshield-api.example.com/api/health` returns a
   healthy response, then visit the published site's Analytics page and
   confirm it loads aggregate values. A new backend database correctly
   reports real zeros until actual page views are recorded.

For local development, leave the meta tag empty and run the frontend on
`localhost` plus the backend using the Uvicorn command above with port `8001`.
The frontend uses `http://localhost:8001` only when opened from `localhost` or
`127.0.0.1`; a deployed site will not silently send analytics to localhost.
The frontend reports configuration, network/CORS, HTTP, and malformed-response
errors in the Analytics page without displaying backend response contents or
visitor identifiers.

## Important security note
This project is designed for local heuristic review and education. It does not connect to a real threat-intelligence service or guarantee that a website is safe. Use the results as a guide, not as a final verdict.
