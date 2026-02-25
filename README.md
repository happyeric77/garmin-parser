# Garmin Parser

TypeScript client and REST API for fetching health and fitness data from [Garmin Connect](https://connect.garmin.com/).

## Features

- **CLI mode** — Fetch today's data interactively or export a date range to JSON
- **REST API mode** — Serve Garmin data over HTTP with Express
- **Docker support** — Multi-arch container image with GitHub Actions CI/CD
- **Session persistence** — OAuth tokens are saved and reused across restarts
- Daily steps, calories (total / active / BMR), heart rate, sleep, weight, and hydration
- Recent activities with per-activity calorie breakdown

## Prerequisites

- Node.js >= 20
- A [Garmin Connect](https://connect.garmin.com/) account

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` and fill in your Garmin Connect credentials:

```
GARMIN_USERNAME=your.email@example.com
GARMIN_PASSWORD=your_password_here
```

### 3. Run in CLI mode

```bash
# Show today's data
npm start

# Export last 7 days to JSON
npm start -- --days 7

# Export last 28 days to JSON
npm start -- --days 28
```

Output files are saved to `./output/`.

### 4. Run as REST API server

```bash
# Build and start
npm run build
npm run serve

# Or run in dev mode
npm run dev:server
```

The server starts on port `3000` by default (configurable via `PORT` env var).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe (checks Garmin client status) |
| `GET` | `/api/profile` | User profile |
| `GET` | `/api/daily?date=YYYY-MM-DD` | Daily data for a specific date (defaults to today) |
| `GET` | `/api/range?days=7` | Aggregated data for a date range (1–28 days) |
| `GET` | `/api/activities?limit=10` | Recent activities (1–50) |

### Example response — `/api/daily`

```json
{
  "success": true,
  "data": {
    "date": "2025-12-25",
    "steps": 8432,
    "calories": { "total": 2150, "active": 650, "bmr": 1500 },
    "heartRate": { "restingHeartRate": 58, "maxHeartRate": 142, "minHeartRate": 52 },
    "sleep": { "durationSeconds": 28800, "deepSleepSeconds": 7200, "lightSleepSeconds": 14400, "remSleepSeconds": 5400, "awakeSleepSeconds": 1800 },
    "weight": 68.2,
    "hydration": 2000
  }
}
```

## Docker

### Pull from GitHub Container Registry

```bash
docker pull ghcr.io/happyeric77/garmin-parser:latest
```

### Run

```bash
docker run -d \
  -p 3000:3000 \
  -e GARMIN_USERNAME=your.email@example.com \
  -e GARMIN_PASSWORD=your_password \
  -v garmin-tokens:/app/tokens \
  ghcr.io/happyeric77/garmin-parser:latest
```

### Build locally

```bash
docker build -t garmin-parser .
```

## Project Structure

```
src/
  garmin-client.ts   # Garmin Connect client wrapper
  server.ts          # Express REST API server
  index.ts           # CLI entry point
```

## License

[MIT](LICENSE)
