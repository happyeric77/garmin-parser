import { GarminConnect } from 'garmin-connect';
import * as path from 'path';
import * as fs from 'fs';
import * as cliProgress from 'cli-progress';

export interface GarminCredentials {
  username: string;
  password: string;
}

export interface SleepDuration {
  hours: number;
  minutes: number;
}

export interface GarminDateWeight {
  samplePk: number;
  date: number;
  calendarDate: string;
  weight: number;              // in grams
  bmi: number | null;
  bodyFat: number | null;
  bodyWater: number | null;
  boneMass: number | null;
  muscleMass: number | null;
  physiqueRating: number | null;
  visceralFat: number | null;
  metabolicAge: number | null;
  sourceType: string;
  timestampGMT: number;
  weightDelta: number;
}

export interface GarminWeightTotalAverage {
  from: number;
  until: number;
  weight: number;              // in grams
  bmi: number | null;
  bodyFat: number | null;
  bodyWater: number | null;
  boneMass: number | null;
  muscleMass: number | null;
  physiqueRating: number | null;
  visceralFat: number | null;
  metabolicAge: number | null;
}

export interface GarminWeightData {
  startDate: string;
  endDate: string;
  dateWeightList: GarminDateWeight[];
  totalAverage: GarminWeightTotalAverage;
}

export interface CaloriesData {
  total: number | null;           // Total calories burned (BMR + active)
  active: number | null;          // Active calories burned
  bmr: number | null;             // Basal Metabolic Rate calories
}

export interface DailyData {
  date: string;
  steps: number | null;
  calories: CaloriesData;
  heartRate: {
    restingHeartRate: number | null;
    maxHeartRate: number | null;
    minHeartRate: number | null;
  };
  sleep: {
    durationSeconds: number | null;
    deepSleepSeconds: number | null;
    lightSleepSeconds: number | null;
    remSleepSeconds: number | null;
    awakeSleepSeconds: number | null;
  };
  weight: number | null;
  hydration: number | null;
}

export interface ActivityCalories {
  date: string;
  activityName: string;
  activityType: string;
  calories: number;
  bmrCalories: number;
  duration: number; // seconds
}

export interface DateRangeData {
  fetchedAt: string;
  dateRange: {
    from: string;
    to: string;
    days: number;
  };
  dailyData: DailyData[];
  activities: unknown[];
  activityCaloriesByDate: { [date: string]: ActivityCalories[] };
}

// Extended GarminConnect type to include methods not in type definitions
interface ExtendedGarminConnect extends GarminConnect {
  exportTokenToFile(path: string): void;
  loadTokenByFile(path: string): void;
  get<T>(url: string, data?: any): Promise<T>;
}

export class GarminClient {
  private client: ExtendedGarminConnect;
  private tokenPath: string;
  private displayName: string | null = null;
  private readonly API_BASE = 'https://connectapi.garmin.com';

  constructor(credentials: GarminCredentials) {
    this.client = new GarminConnect({
      username: credentials.username,
      password: credentials.password,
    }) as ExtendedGarminConnect;
    this.tokenPath = path.join(process.cwd(), 'tokens');
  }

  /**
   * Login to Garmin Connect
   * Will try to restore session from saved tokens first
   */
  async login(): Promise<void> {
    // Try to restore session from saved tokens
    if (this.hasStoredTokens()) {
      try {
        console.log('Found stored tokens, attempting to restore session...');
        this.client.loadTokenByFile(this.tokenPath);
        // Test if session is valid by making a simple request
        await this.client.getUserProfile();
        console.log('Session restored successfully!');
        return;
      } catch (error) {
        console.log('Stored session expired, logging in again...');
      }
    }

    // Fresh login
    console.log('Logging in to Garmin Connect...');
    await this.client.login();
    console.log('Login successful!');

    // Save tokens for future use
    this.saveTokens();
  }

  /**
   * Check if we have stored tokens
   */
  private hasStoredTokens(): boolean {
    const oauth1Path = path.join(this.tokenPath, 'oauth1_token.json');
    const oauth2Path = path.join(this.tokenPath, 'oauth2_token.json');
    return fs.existsSync(oauth1Path) && fs.existsSync(oauth2Path);
  }

  /**
   * Save tokens to file for session reuse
   */
  private saveTokens(): void {
    if (!fs.existsSync(this.tokenPath)) {
      fs.mkdirSync(this.tokenPath, { recursive: true });
    }
    this.client.exportTokenToFile(this.tokenPath);
    console.log('Tokens saved for future sessions.');
  }

  /**
   * Get user profile
   */
  async getUserProfile(): Promise<unknown> {
    return await this.client.getUserProfile();
  }

  /**
   * Get user settings
   */
  async getUserSettings(): Promise<unknown> {
    return await this.client.getUserSettings();
  }

  /**
   * Get steps for a specific date
   * @param date - Date to get steps for (defaults to today)
   */
  async getSteps(date?: Date): Promise<number> {
    return await this.client.getSteps(date);
  }

  /**
   * Get heart rate data for a specific date
   * @param date - Date to get heart rate for (defaults to today)
   */
  async getHeartRate(date?: Date): Promise<unknown> {
    return await this.client.getHeartRate(date);
  }

  /**
   * Get sleep data for a specific date
   * @param date - Date to get sleep data for (defaults to today)
   */
  async getSleepData(date?: Date): Promise<unknown> {
    return await this.client.getSleepData(date);
  }

  /**
   * Get sleep duration for a specific date
   * @param date - Date to get sleep duration for (defaults to today)
   */
  async getSleepDuration(date?: Date): Promise<SleepDuration> {
    return await this.client.getSleepDuration(date);
  }

  /**
   * Get daily weight data (in kg)
   * @param date - Date to get weight for (defaults to today)
   */
  async getDailyWeightData(date?: Date): Promise<number> {
    try {
      const weightData = await this.client.getDailyWeightData(date) as GarminWeightData;
      return this.parseWeightInKg(weightData) ?? 0;
    } catch (error) {
      // Weight data might not be available
      return 0;
    }
  }

  /**
   * Get daily hydration data
   * @param date - Date to get hydration for (defaults to today)
   */
  async getDailyHydration(date?: Date): Promise<number> {
    try {
      return await this.client.getDailyHydration(date);
    } catch (error) {
      // Hydration data might not be available
      return 0;
    }
  }

  /**
   * Get user display name (cached)
   */
  private async getDisplayName(): Promise<string> {
    if (this.displayName) {
      return this.displayName;
    }
    const profile = await this.client.getUserProfile() as any;
    const name = profile.displayName || profile.userName || '';
    this.displayName = name;
    return name;
  }

  /**
   * Get daily calories data (total, active, BMR)
   * @param date - Date to get calories for (defaults to today)
   */
  async getDailyCalories(date?: Date): Promise<CaloriesData> {
    const dateString = this.formatDate(date || new Date());
    const displayName = await this.getDisplayName();
    
    try {
      const url = `${this.API_BASE}/usersummary-service/usersummary/daily/${displayName}`;
      const result = await this.client.get<any>(url, { params: { calendarDate: dateString } });
      
      return {
        total: result?.totalKilocalories ?? null,
        active: result?.activeKilocalories ?? null,
        bmr: result?.bmrKilocalories ?? null,
      };
    } catch (error) {
      // Calories data might not be available
      return { total: null, active: null, bmr: null };
    }
  }

  /**
   * Get activities
   * @param start - Start index for pagination
   * @param limit - Number of activities to retrieve
   */
  async getActivities(start: number = 0, limit: number = 10): Promise<unknown[]> {
    return await this.client.getActivities(start, limit);
  }

  /**
   * Get a specific activity by ID
   * @param activityId - The activity ID
   */
  async getActivity(activityId: string | number): Promise<unknown> {
    return await this.client.getActivity({ activityId: activityId as number });
  }

  /**
   * Get all data for a specific date (convenience method)
   * @param date - Date to get data for (defaults to today)
   */
  async getAllDailyData(date?: Date): Promise<{
    steps: number;
    heartRate: unknown;
    sleep: unknown;
    sleepDuration: SleepDuration;
    weight: number;
    hydration: number;
  }> {
    const [steps, heartRate, sleep, sleepDuration, weight, hydration] = await Promise.all([
      this.getSteps(date),
      this.getHeartRate(date),
      this.getSleepData(date),
      this.getSleepDuration(date),
      this.getDailyWeightData(date),
      this.getDailyHydration(date),
    ]);

    return {
      steps,
      heartRate,
      sleep,
      sleepDuration,
      weight,
      hydration,
    };
  }

  /**
   * Helper to format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Helper to extract weight in kg from GarminWeightData
   * Garmin API returns weight in grams, this converts to kg with 2 decimal places
   * @returns weight in kg, or null if no valid weight data
   */
  private parseWeightInKg(weightData: GarminWeightData): number | null {
    const weightInGrams = weightData.totalAverage?.weight
      ?? weightData.dateWeightList?.[0]?.weight
      ?? null;
    if (typeof weightInGrams === 'number' && weightInGrams > 0) {
      return Math.round((weightInGrams / 1000) * 100) / 100;
    }
    return null;
  }

  /**
   * Helper to add delay between API calls to avoid rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Safely get steps with error handling
   */
  private async safeGetSteps(date: Date): Promise<number | null> {
    try {
      return await this.client.getSteps(date);
    } catch {
      return null;
    }
  }

  /**
   * Safely get heart rate with error handling
   */
  private async safeGetHeartRate(date: Date): Promise<{
    restingHeartRate: number | null;
    maxHeartRate: number | null;
    minHeartRate: number | null;
  }> {
    try {
      const hr = await this.client.getHeartRate(date) as any;
      return {
        restingHeartRate: hr?.restingHeartRate ?? null,
        maxHeartRate: hr?.maxHeartRate ?? null,
        minHeartRate: hr?.minHeartRate ?? null,
      };
    } catch {
      return { restingHeartRate: null, maxHeartRate: null, minHeartRate: null };
    }
  }

  /**
   * Safely get sleep data with error handling
   */
  private async safeGetSleepData(date: Date): Promise<{
    durationSeconds: number | null;
    deepSleepSeconds: number | null;
    lightSleepSeconds: number | null;
    remSleepSeconds: number | null;
    awakeSleepSeconds: number | null;
  }> {
    try {
      const sleep = await this.client.getSleepData(date) as any;
      const daily = sleep?.dailySleepDTO;
      return {
        durationSeconds: daily?.sleepTimeSeconds ?? null,
        deepSleepSeconds: daily?.deepSleepSeconds ?? null,
        lightSleepSeconds: daily?.lightSleepSeconds ?? null,
        remSleepSeconds: daily?.remSleepSeconds ?? null,
        awakeSleepSeconds: daily?.awakeSleepSeconds ?? null,
      };
    } catch {
      return {
        durationSeconds: null,
        deepSleepSeconds: null,
        lightSleepSeconds: null,
        remSleepSeconds: null,
        awakeSleepSeconds: null,
      };
    }
  }

  /**
   * Safely get weight with error handling
   */
  private async safeGetWeight(date: Date): Promise<number | null> {
    try {
      const weightData = await this.client.getDailyWeightData(date) as GarminWeightData;
      return this.parseWeightInKg(weightData);
    } catch {
      return null;
    }
  }

  /**
   * Safely get hydration with error handling
   */
  private async safeGetHydration(date: Date): Promise<number | null> {
    try {
      const hydration = await this.client.getDailyHydration(date);
      return hydration > 0 ? hydration : null;
    } catch {
      return null;
    }
  }

  /**
   * Safely get daily calories with error handling
   */
  private async safeGetCalories(date: Date): Promise<CaloriesData> {
    try {
      return await this.getDailyCalories(date);
    } catch {
      return { total: null, active: null, bmr: null };
    }
  }

  /**
   * Get data for a single date
   */
  private async getDailyDataForDate(date: Date): Promise<DailyData> {
    const [steps, heartRate, sleep, weight, hydration, calories] = await Promise.all([
      this.safeGetSteps(date),
      this.safeGetHeartRate(date),
      this.safeGetSleepData(date),
      this.safeGetWeight(date),
      this.safeGetHydration(date),
      this.safeGetCalories(date),
    ]);

    return {
      date: this.formatDate(date),
      steps,
      calories,
      heartRate,
      sleep,
      weight,
      hydration,
    };
  }

  /**
   * Get data for a date range
   * @param days - Number of days to fetch (default 7, max 28)
   * @param showProgress - Whether to show progress bar (default true)
   */
  async getDataForDateRange(days: number = 7, showProgress: boolean = true): Promise<DateRangeData> {
    // Limit to 28 days max
    const actualDays = Math.min(Math.max(1, days), 28);
    
    // Generate date array (from most recent to oldest)
    const dates: Date[] = [];
    for (let i = 0; i < actualDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date);
    }

    // Create progress bar
    let progressBar: cliProgress.SingleBar | null = null;
    if (showProgress) {
      progressBar = new cliProgress.SingleBar({
        format: 'Fetching data |{bar}| {percentage}% | {value}/{total} days | {date}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      }, cliProgress.Presets.shades_classic);
      progressBar.start(actualDays, 0, { date: '' });
    }

    // Fetch data for each date sequentially to avoid rate limiting
    const dailyData: DailyData[] = [];
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      
      if (progressBar) {
        progressBar.update(i, { date: this.formatDate(date) });
      }

      const data = await this.getDailyDataForDate(date);
      dailyData.push(data);

      // Small delay between requests to avoid rate limiting
      if (i < dates.length - 1) {
        await this.delay(200);
      }
    }

    if (progressBar) {
      progressBar.update(actualDays, { date: 'Done!' });
      progressBar.stop();
    }

    // Fetch activities for the date range
    const activities = await this.client.getActivities(0, actualDays * 3);

    // Filter activities to only include those within the date range
    const fromDate = this.formatDate(dates[dates.length - 1]);
    const toDate = this.formatDate(dates[0]);
    const filteredActivities = (activities as any[]).filter((activity: any) => {
      const activityDate = activity.startTimeLocal?.split(' ')[0];
      return activityDate >= fromDate && activityDate <= toDate;
    });

    // Group activity calories by date
    const activityCaloriesByDate: { [date: string]: ActivityCalories[] } = {};
    for (const activity of filteredActivities as any[]) {
      const activityDate = activity.startTimeLocal?.split(' ')[0];
      if (!activityDate) continue;

      if (!activityCaloriesByDate[activityDate]) {
        activityCaloriesByDate[activityDate] = [];
      }

      activityCaloriesByDate[activityDate].push({
        date: activityDate,
        activityName: activity.activityName || 'Unknown',
        activityType: activity.activityType?.typeKey || 'unknown',
        calories: activity.calories || 0,
        bmrCalories: activity.bmrCalories || 0,
        duration: activity.duration || 0,
      });
    }

    return {
      fetchedAt: new Date().toISOString(),
      dateRange: {
        from: fromDate,
        to: toDate,
        days: actualDays,
      },
      dailyData: dailyData.reverse(), // Return in chronological order (oldest first)
      activities: filteredActivities,
      activityCaloriesByDate,
    };
  }

  /**
   * Save data to JSON file
   */
  async saveToJson(data: DateRangeData, filename?: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const defaultFilename = `garmin-data-${data.dateRange.days}days-${this.formatDate(new Date())}.json`;
    const outputPath = path.join(outputDir, filename || defaultFilename);
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    return outputPath;
  }
}
