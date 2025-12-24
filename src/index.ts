import * as dotenv from 'dotenv';
import { GarminClient, DateRangeData } from './garmin-client';

// Load environment variables
dotenv.config();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function logSection(title: string): void {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(50)}${colors.reset}`);
}

function printBanner(): void {
  console.log(`
${colors.bright}${colors.green}
  ____                      _         ____                            _   
 / ___| __ _ _ __ _ __ ___ (_)_ __   / ___|___  _ __  _ __   ___  ___| |_ 
| |  _ / _\` | '__| '_ \` _ \\| | '_ \\ | |   / _ \\| '_ \\| '_ \\ / _ \\/ __| __|
| |_| | (_| | |  | | | | | | | | | || |__| (_) | | | | | | |  __/ (__| |_ 
 \\____|\\__,_|_|  |_| |_| |_|_|_| |_| \\____\\___/|_| |_|_| |_|\\___|\\___|\\__|
                                                                          
${colors.reset}${colors.cyan}                     POC - Garmin Data Fetcher${colors.reset}
`);
}

function printUsage(): void {
  console.log(`
${colors.bright}Usage:${colors.reset}
  npm run start                    ${colors.dim}# Fetch today's data (interactive mode)${colors.reset}
  npm run start -- --days 7        ${colors.dim}# Fetch last 7 days and save to JSON${colors.reset}
  npm run start -- --days 28       ${colors.dim}# Fetch last 28 days (4 weeks) and save to JSON${colors.reset}
  npm run start -- --help          ${colors.dim}# Show this help message${colors.reset}

${colors.bright}Options:${colors.reset}
  --days <number>    Number of days to fetch (1-28)
  --help, -h         Show this help message

${colors.bright}Output:${colors.reset}
  When using --days, data is saved to ./output/garmin-data-<days>days-<date>.json
`);
}

function parseArgs(): { days: number | null; help: boolean } {
  const args = process.argv.slice(2);
  let days: number | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    } else if (args[i] === '--days' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 28) {
        days = parsed;
      } else {
        console.error(`${colors.red}Error: --days must be a number between 1 and 28${colors.reset}`);
        process.exit(1);
      }
      i++; // Skip next argument
    }
  }

  return { days, help };
}

function printDataSummary(data: DateRangeData): void {
  console.log(`\n${colors.bright}Data Summary:${colors.reset}`);
  console.log(`${colors.dim}Date Range: ${data.dateRange.from} to ${data.dateRange.to} (${data.dateRange.days} days)${colors.reset}`);
  
  // Calculate statistics
  const stepsData = data.dailyData.filter(d => d.steps !== null).map(d => d.steps as number);
  const sleepData = data.dailyData.filter(d => d.sleep.durationSeconds !== null).map(d => d.sleep.durationSeconds as number);
  const hrData = data.dailyData.filter(d => d.heartRate.restingHeartRate !== null).map(d => d.heartRate.restingHeartRate as number);
  const totalCaloriesData = data.dailyData.filter(d => d.calories.total !== null).map(d => d.calories.total as number);
  const activeCaloriesData = data.dailyData.filter(d => d.calories.active !== null).map(d => d.calories.active as number);

  // === Calories Section ===
  console.log(`\n${colors.cyan}Calories (Total):${colors.reset}`);
  if (totalCaloriesData.length > 0) {
    const avgTotal = Math.round(totalCaloriesData.reduce((a, b) => a + b, 0) / totalCaloriesData.length);
    const maxTotal = Math.max(...totalCaloriesData);
    const minTotal = Math.min(...totalCaloriesData);
    const totalSum = totalCaloriesData.reduce((a, b) => a + b, 0);
    console.log(`  Average: ${avgTotal.toLocaleString()} kcal/day`);
    console.log(`  Max: ${maxTotal.toLocaleString()} kcal`);
    console.log(`  Min: ${minTotal.toLocaleString()} kcal`);
    console.log(`  Total burned: ${totalSum.toLocaleString()} kcal`);
    console.log(`  Days with data: ${totalCaloriesData.length}/${data.dateRange.days}`);
  } else {
    console.log(`  No calorie data available`);
  }

  console.log(`\n${colors.cyan}Calories (Active Only):${colors.reset}`);
  if (activeCaloriesData.length > 0) {
    const avgActive = Math.round(activeCaloriesData.reduce((a, b) => a + b, 0) / activeCaloriesData.length);
    const maxActive = Math.max(...activeCaloriesData);
    const totalActive = activeCaloriesData.reduce((a, b) => a + b, 0);
    console.log(`  Average: ${avgActive.toLocaleString()} kcal/day`);
    console.log(`  Max: ${maxActive.toLocaleString()} kcal`);
    console.log(`  Total active: ${totalActive.toLocaleString()} kcal`);
  }

  // Activity calories breakdown
  const activityCaloriesTotal = Object.values(data.activityCaloriesByDate || {})
    .flat()
    .reduce((sum, a) => sum + a.calories, 0);
  
  if (activityCaloriesTotal > 0) {
    console.log(`\n${colors.cyan}Activity Calories Breakdown:${colors.reset}`);
    console.log(`  Total from activities: ${activityCaloriesTotal.toLocaleString()} kcal`);
    
    // Group by activity type
    const caloriesByType: { [type: string]: number } = {};
    Object.values(data.activityCaloriesByDate || {})
      .flat()
      .forEach(a => {
        caloriesByType[a.activityType] = (caloriesByType[a.activityType] || 0) + a.calories;
      });
    
    Object.entries(caloriesByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, calories]) => {
        console.log(`    - ${type}: ${calories.toLocaleString()} kcal`);
      });
  }

  // === Steps Section ===
  console.log(`\n${colors.cyan}Steps:${colors.reset}`);
  if (stepsData.length > 0) {
    const avgSteps = Math.round(stepsData.reduce((a, b) => a + b, 0) / stepsData.length);
    const maxSteps = Math.max(...stepsData);
    const minSteps = Math.min(...stepsData);
    console.log(`  Average: ${avgSteps.toLocaleString()} steps/day`);
    console.log(`  Max: ${maxSteps.toLocaleString()} steps`);
    console.log(`  Min: ${minSteps.toLocaleString()} steps`);
    console.log(`  Days with data: ${stepsData.length}/${data.dateRange.days}`);
  } else {
    console.log(`  No step data available`);
  }

  console.log(`\n${colors.cyan}Sleep:${colors.reset}`);
  if (sleepData.length > 0) {
    const avgSleep = Math.round(sleepData.reduce((a, b) => a + b, 0) / sleepData.length);
    const avgHours = Math.floor(avgSleep / 3600);
    const avgMins = Math.round((avgSleep % 3600) / 60);
    console.log(`  Average: ${avgHours}h ${avgMins}m/night`);
    console.log(`  Days with data: ${sleepData.length}/${data.dateRange.days}`);
  } else {
    console.log(`  No sleep data available`);
  }

  console.log(`\n${colors.cyan}Resting Heart Rate:${colors.reset}`);
  if (hrData.length > 0) {
    const avgHR = Math.round(hrData.reduce((a, b) => a + b, 0) / hrData.length);
    const maxHR = Math.max(...hrData);
    const minHR = Math.min(...hrData);
    console.log(`  Average: ${avgHR} bpm`);
    console.log(`  Max: ${maxHR} bpm`);
    console.log(`  Min: ${minHR} bpm`);
    console.log(`  Days with data: ${hrData.length}/${data.dateRange.days}`);
  } else {
    console.log(`  No heart rate data available`);
  }

  console.log(`\n${colors.cyan}Activities:${colors.reset}`);
  console.log(`  Total: ${data.activities.length} activities`);
  
  // Group by activity type
  const activityTypes: { [key: string]: number } = {};
  data.activities.forEach((activity: any) => {
    const type = activity.activityType?.typeKey || 'unknown';
    activityTypes[type] = (activityTypes[type] || 0) + 1;
  });
  
  Object.entries(activityTypes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`    - ${type}: ${count}`);
    });
}

async function runDateRangeMode(garmin: GarminClient, days: number): Promise<void> {
  logSection(`Fetching ${days} Days of Data`);
  console.log(`\n${colors.dim}This will make approximately ${days * 5} API requests...${colors.reset}\n`);

  const data = await garmin.getDataForDateRange(days, true);

  // Save to JSON
  const outputPath = await garmin.saveToJson(data);
  
  // Print summary
  printDataSummary(data);

  logSection('Done!');
  console.log(`
${colors.green}Successfully fetched ${days} days of Garmin data!${colors.reset}

${colors.bright}Output saved to:${colors.reset}
${colors.cyan}${outputPath}${colors.reset}

${colors.dim}You can use this JSON file for further analysis or integration with other tools.${colors.reset}
`);
}

async function runInteractiveMode(garmin: GarminClient): Promise<void> {
  // Get User Profile
  logSection('User Profile');
  const profile = await garmin.getUserProfile() as any;
  console.log(`${colors.cyan}Name: ${profile.fullName}${colors.reset}`);
  console.log(`${colors.cyan}Username: ${profile.userName}${colors.reset}`);
  console.log(`${colors.cyan}Location: ${profile.location || 'Not set'}${colors.reset}`);

  // Get today's date for display
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  console.log(`\n${colors.dim}Fetching data for: ${dateStr}${colors.reset}`);

  // Get Steps
  logSection('Steps');
  try {
    const steps = await garmin.getSteps();
    console.log(`${colors.cyan}Today's Steps: ${steps.toLocaleString()}${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}Steps data not available${colors.reset}`);
  }

  // Get Calories
  logSection('Calories');
  try {
    const calories = await garmin.getDailyCalories();
    if (calories.total !== null) {
      console.log(`${colors.cyan}Total Calories: ${calories.total.toLocaleString()} kcal${colors.reset}`);
      console.log(`${colors.cyan}Active Calories: ${(calories.active ?? 0).toLocaleString()} kcal${colors.reset}`);
      console.log(`${colors.cyan}BMR Calories: ${(calories.bmr ?? 0).toLocaleString()} kcal${colors.reset}`);
    } else {
      console.log(`${colors.yellow}No calorie data recorded for today${colors.reset}`);
    }
  } catch {
    console.log(`${colors.yellow}Calorie data not available${colors.reset}`);
  }

  // Get Heart Rate
  logSection('Heart Rate');
  try {
    const heartRate = await garmin.getHeartRate() as any;
    console.log(`${colors.cyan}Resting HR: ${heartRate.restingHeartRate || 'N/A'} bpm${colors.reset}`);
    console.log(`${colors.cyan}Max HR: ${heartRate.maxHeartRate || 'N/A'} bpm${colors.reset}`);
    console.log(`${colors.cyan}Min HR: ${heartRate.minHeartRate || 'N/A'} bpm${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}Heart rate data not available${colors.reset}`);
  }

  // Get Sleep Data
  logSection('Sleep');
  try {
    const sleepDuration = await garmin.getSleepDuration();
    console.log(`${colors.cyan}Sleep Duration: ${sleepDuration.hours}h ${sleepDuration.minutes}m${colors.reset}`);
  } catch {
    console.log(`${colors.yellow}Sleep data not available${colors.reset}`);
  }

  // Get Weight
  logSection('Weight');
  try {
    const weight = await garmin.getDailyWeightData();
    if (weight > 0) {
      console.log(`${colors.cyan}Weight: ${weight.toFixed(1)} kg${colors.reset}`);
    } else {
      console.log(`${colors.yellow}No weight data recorded for today${colors.reset}`);
    }
  } catch {
    console.log(`${colors.yellow}Weight data not available${colors.reset}`);
  }

  // Get Hydration
  logSection('Hydration');
  try {
    const hydration = await garmin.getDailyHydration();
    if (hydration > 0) {
      console.log(`${colors.cyan}Hydration: ${hydration.toLocaleString()} ml${colors.reset}`);
    } else {
      console.log(`${colors.yellow}No hydration data recorded for today${colors.reset}`);
    }
  } catch {
    console.log(`${colors.yellow}Hydration data not available${colors.reset}`);
  }

  // Get Recent Activities
  logSection('Recent Activities');
  try {
    const activities = await garmin.getActivities(0, 5);
    if (activities && activities.length > 0) {
      console.log(`\n${colors.bright}Found ${activities.length} recent activities:${colors.reset}\n`);
      
      activities.forEach((activity: any, index: number) => {
        const date = activity.startTimeLocal?.split(' ')[0] || 'Unknown date';
        const name = activity.activityName || 'Unnamed activity';
        const type = activity.activityType?.typeKey || 'Unknown type';
        const distance = activity.distance 
          ? `${(activity.distance / 1000).toFixed(2)} km` 
          : 'N/A';
        const duration = activity.duration 
          ? `${Math.floor(activity.duration / 60)} min` 
          : 'N/A';
        
        console.log(`${colors.cyan}${index + 1}. ${name}${colors.reset}`);
        console.log(`   Type: ${type}`);
        console.log(`   Date: ${date}`);
        console.log(`   Distance: ${distance}`);
        console.log(`   Duration: ${duration}`);
        console.log('');
      });
    } else {
      console.log(`${colors.yellow}No activities found${colors.reset}`);
    }
  } catch {
    console.log(`${colors.yellow}Could not fetch activities${colors.reset}`);
  }

  // Summary
  logSection('Done!');
  console.log(`
${colors.green}Successfully fetched today's Garmin data!${colors.reset}

${colors.dim}Tips:
- Use ${colors.reset}${colors.cyan}npm run start -- --days 7${colors.reset}${colors.dim} to fetch last 7 days
- Use ${colors.reset}${colors.cyan}npm run start -- --days 28${colors.reset}${colors.dim} to fetch last 4 weeks
- Data will be saved to ./output/ as JSON${colors.reset}
`);
}

async function main(): Promise<void> {
  printBanner();

  // Parse command line arguments
  const { days, help } = parseArgs();

  if (help) {
    printUsage();
    process.exit(0);
  }

  // Validate environment variables
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;

  if (!username || !password) {
    console.error(`${colors.red}Error: Missing Garmin credentials!${colors.reset}`);
    console.error(`Please create a .env file with:`);
    console.error(`  GARMIN_USERNAME=your.email@example.com`);
    console.error(`  GARMIN_PASSWORD=your_password`);
    console.error(`\nYou can copy .env.example as a starting point.`);
    process.exit(1);
  }

  // Create Garmin client
  const garmin = new GarminClient({ username, password });

  try {
    // Login
    logSection('Authentication');
    await garmin.login();

    if (days !== null) {
      // Date range mode - fetch multiple days and save to JSON
      await runDateRangeMode(garmin, days);
    } else {
      // Interactive mode - show today's data
      await runInteractiveMode(garmin);
    }

  } catch (error) {
    console.error(`\n${colors.red}Error occurred:${colors.reset}`);
    if (error instanceof Error) {
      console.error(colors.red + error.message + colors.reset);
      if (error.message.includes('credentials')) {
        console.error(`\n${colors.yellow}Please check your username and password in .env file${colors.reset}`);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
