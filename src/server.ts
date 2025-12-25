import express, { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import { GarminClient } from './garmin-client';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Garmin client instance (singleton)
let garminClient: GarminClient | null = null;
let isReady = false;
let initError: string | null = null;

/**
 * Initialize Garmin client
 */
async function initializeGarminClient(): Promise<void> {
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;

  if (!username || !password) {
    initError = 'Missing GARMIN_USERNAME or GARMIN_PASSWORD environment variables';
    console.error(`[ERROR] ${initError}`);
    return;
  }

  try {
    console.log('[INFO] Initializing Garmin client...');
    garminClient = new GarminClient({ username, password });
    await garminClient.login();
    isReady = true;
    console.log('[INFO] Garmin client initialized successfully');
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Unknown error during initialization';
    console.error(`[ERROR] Failed to initialize Garmin client: ${initError}`);
  }
}

/**
 * Middleware to check if Garmin client is ready
 */
function requireGarminClient(req: Request, res: Response, next: NextFunction): void {
  if (!isReady || !garminClient) {
    res.status(503).json({
      error: 'Service not ready',
      message: initError || 'Garmin client is not initialized',
    });
    return;
  }
  next();
}

/**
 * Parse date from query parameter
 */
function parseDate(dateStr: string | undefined): Date {
  if (!dateStr) {
    return new Date();
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

// ============================================================
// Health Check Endpoints
// ============================================================

/**
 * GET /health
 * Liveness probe - returns 200 if server is running
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready
 * Readiness probe - returns 200 if Garmin client is ready
 */
app.get('/ready', (req: Request, res: Response) => {
  if (isReady && garminClient) {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      error: initError || 'Garmin client is not initialized',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// API Endpoints
// ============================================================

/**
 * GET /api/profile
 * Get user profile
 */
app.get('/api/profile', requireGarminClient, async (req: Request, res: Response) => {
  try {
    const profile = await garminClient!.getUserProfile();
    res.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERROR] Failed to get profile:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get profile',
    });
  }
});

/**
 * GET /api/daily
 * Get daily data for a specific date
 * Query params:
 *   - date: YYYY-MM-DD (optional, defaults to today)
 */
app.get('/api/daily', requireGarminClient, async (req: Request, res: Response) => {
  try {
    const date = parseDate(req.query.date as string | undefined);
    const dateStr = date.toISOString().split('T')[0];

    console.log(`[INFO] Fetching daily data for ${dateStr}`);

    // Fetch all daily data in parallel
    const [steps, calories, heartRate, sleep, weight, hydration] = await Promise.all([
      garminClient!.getSteps(date).catch(() => null),
      garminClient!.getDailyCalories(date).catch(() => ({ total: null, active: null, bmr: null })),
      garminClient!.getHeartRate(date).catch(() => null),
      garminClient!.getSleepData(date).catch(() => null),
      garminClient!.getDailyWeightData(date).catch(() => null),
      garminClient!.getDailyHydration(date).catch(() => null),
    ]);

    res.json({
      success: true,
      data: {
        date: dateStr,
        steps,
        calories,
        heartRate,
        sleep,
        weight,
        hydration,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERROR] Failed to get daily data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get daily data',
    });
  }
});

/**
 * GET /api/range
 * Get data for a date range
 * Query params:
 *   - days: number of days (1-28, defaults to 7)
 */
app.get('/api/range', requireGarminClient, async (req: Request, res: Response) => {
  try {
    const daysParam = parseInt(req.query.days as string, 10);
    const days = isNaN(daysParam) ? 7 : Math.min(Math.max(1, daysParam), 28);

    console.log(`[INFO] Fetching data for ${days} days`);

    const data = await garminClient!.getDataForDateRange(days, false);

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERROR] Failed to get range data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get range data',
    });
  }
});

/**
 * GET /api/activities
 * Get recent activities
 * Query params:
 *   - limit: number of activities (1-50, defaults to 10)
 */
app.get('/api/activities', requireGarminClient, async (req: Request, res: Response) => {
  try {
    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = isNaN(limitParam) ? 10 : Math.min(Math.max(1, limitParam), 50);

    console.log(`[INFO] Fetching ${limit} recent activities`);

    const activities = await garminClient!.getActivities(0, limit);

    res.json({
      success: true,
      data: activities,
      count: Array.isArray(activities) ? activities.length : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERROR] Failed to get activities:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get activities',
    });
  }
});

// ============================================================
// Error handling
// ============================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET /health',
      'GET /ready',
      'GET /api/profile',
      'GET /api/daily?date=YYYY-MM-DD',
      'GET /api/range?days=7',
      'GET /api/activities?limit=10',
    ],
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// ============================================================
// Server startup
// ============================================================

async function startServer(): Promise<void> {
  // Initialize Garmin client before starting server
  await initializeGarminClient();

  app.listen(PORT, () => {
    console.log(`
========================================
  Garmin Parser API Server
========================================
  Status: Running
  Port: ${PORT}
  Ready: ${isReady}
  
  Endpoints:
    GET /health          - Liveness probe
    GET /ready           - Readiness probe
    GET /api/profile     - User profile
    GET /api/daily       - Daily data (?date=YYYY-MM-DD)
    GET /api/range       - Date range data (?days=7)
    GET /api/activities  - Recent activities (?limit=10)
========================================
`);
  });
}

startServer().catch((error) => {
  console.error('[FATAL] Failed to start server:', error);
  process.exit(1);
});
