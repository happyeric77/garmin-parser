import * as dotenv from 'dotenv';
import { GarminConnect } from 'garmin-connect';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

// Extended GarminConnect type to include methods not in type definitions
interface ExtendedGarminConnect extends GarminConnect {
  exportTokenToFile(path: string): void;
  loadTokenByFile(path: string): void;
  get<T>(url: string, data?: any): Promise<T>;
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(color: string, label: string, message: string): void {
  console.log(`${color}[${label}]${colors.reset} ${message}`);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function testEndpoint(
  client: ExtendedGarminConnect,
  name: string,
  url: string,
  params?: any
): Promise<any> {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}Testing: ${name}${colors.reset}`);
  console.log(`${colors.cyan}URL: ${url}${colors.reset}`);
  if (params) {
    console.log(`${colors.cyan}Params: ${JSON.stringify(params)}${colors.reset}`);
  }
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);

  try {
    const result = await client.get(url, params ? { params } : undefined);
    log(colors.green, 'SUCCESS', 'API returned data');
    
    // Pretty print the result (limited)
    const resultStr = JSON.stringify(result, null, 2);
    if (resultStr.length > 2000) {
      console.log(resultStr.substring(0, 2000) + '\n... (truncated)');
    } else {
      console.log(resultStr);
    }
    
    return result;
  } catch (error: any) {
    log(colors.red, 'FAILED', error.message || 'Unknown error');
    return null;
  }
}

async function main() {
  console.log(`
${colors.bright}${colors.green}
╔════════════════════════════════════════════════════════════╗
║         Garmin API Endpoint Tester - Calories              ║
╚════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Validate environment variables
  const username = process.env.GARMIN_USERNAME;
  const password = process.env.GARMIN_PASSWORD;

  if (!username || !password) {
    console.error(`${colors.red}Error: Missing Garmin credentials in .env${colors.reset}`);
    process.exit(1);
  }

  // Create client
  const client = new GarminConnect({
    username,
    password,
  }) as ExtendedGarminConnect;

  const tokenPath = path.join(process.cwd(), 'tokens');

  // Try to load existing tokens
  try {
    if (fs.existsSync(path.join(tokenPath, 'oauth1_token.json'))) {
      log(colors.yellow, 'AUTH', 'Loading stored tokens...');
      client.loadTokenByFile(tokenPath);
      // Test if session is valid
      await client.getUserProfile();
      log(colors.green, 'AUTH', 'Session restored successfully!');
    } else {
      throw new Error('No tokens found');
    }
  } catch {
    log(colors.yellow, 'AUTH', 'Logging in fresh...');
    await client.login();
    client.exportTokenToFile(tokenPath);
    log(colors.green, 'AUTH', 'Login successful!');
  }

  // Test date - use yesterday to ensure data exists
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const dateStr = formatDate(yesterday);
  log(colors.cyan, 'INFO', `Testing with date: ${dateStr}`);

  // Base API URL
  const API_BASE = 'https://connectapi.garmin.com';

  // Get user display name for some endpoints
  const profile = await client.getUserProfile() as any;
  const displayName = profile.displayName || profile.userName;
  log(colors.cyan, 'INFO', `User display name: ${displayName}`);

  // ============================================================
  // Test various endpoints that might contain calorie data
  // ============================================================

  const results: { [key: string]: any } = {};

  // 1. User Summary Daily - This is the most likely endpoint
  results['usersummary-daily'] = await testEndpoint(
    client,
    'User Summary Daily',
    `${API_BASE}/usersummary-service/usersummary/daily/${dateStr}`
  );

  // 2. User Summary Daily with displayName
  results['usersummary-daily-displayname'] = await testEndpoint(
    client,
    'User Summary Daily (with displayName)',
    `${API_BASE}/usersummary-service/usersummary/daily/${displayName}`,
    { calendarDate: dateStr }
  );

  // 3. Wellness Daily Summary Chart
  results['wellness-dailysummary'] = await testEndpoint(
    client,
    'Wellness Daily Summary Chart',
    `${API_BASE}/wellness-service/wellness/dailySummaryChart/${displayName}`,
    { date: dateStr }
  );

  // 4. Wellness Daily Summary (alternative)
  results['wellness-dailysummary-alt'] = await testEndpoint(
    client,
    'Wellness Daily Summary (alt)',
    `${API_BASE}/wellness-service/wellness/dailySummaryChart`,
    { date: dateStr }
  );

  // 5. Fitness Stats - Calories
  results['fitnessstats-calories'] = await testEndpoint(
    client,
    'Fitness Stats - Calories',
    `${API_BASE}/fitnessstats-service/activity`,
    {
      aggregation: 'daily',
      startDate: dateStr,
      endDate: dateStr,
      metric: 'calories'
    }
  );

  // 6. User Summary - All Stats
  results['usersummary-stats'] = await testEndpoint(
    client,
    'User Summary Stats',
    `${API_BASE}/usersummary-service/stats/${dateStr}/${dateStr}`
  );

  // 7. Daily Summary from proxy
  results['proxy-dailysummary'] = await testEndpoint(
    client,
    'Proxy Daily Summary',
    `https://connect.garmin.com/modern/proxy/usersummary-service/usersummary/daily/${dateStr}`
  );

  // 8. Wellness epoch
  results['wellness-epoch'] = await testEndpoint(
    client,
    'Wellness Epoch',
    `${API_BASE}/wellness-service/wellness/epoch/wellness/${dateStr}/${dateStr}`
  );

  // 9. User Summary Calories Burned
  results['usersummary-caloriesburned'] = await testEndpoint(
    client,
    'User Summary Calories Burned',
    `${API_BASE}/usersummary-service/stats/calories/daily/${dateStr}/${dateStr}`
  );

  // ============================================================
  // Summary
  // ============================================================

  console.log(`\n${colors.bright}${colors.green}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.green}SUMMARY - Calorie Fields Found${colors.reset}`);
  console.log(`${colors.green}${'='.repeat(60)}${colors.reset}\n`);

  const calorieFields = [
    'totalKilocalories',
    'activeKilocalories', 
    'bmrKilocalories',
    'wellnessKilocalories',
    'burnedKilocalories',
    'consumedKilocalories',
    'remainingKilocalories',
    'netCalorieGoal',
    'totalCalories',
    'calories',
  ];

  for (const [endpointName, result] of Object.entries(results)) {
    if (result) {
      const resultStr = JSON.stringify(result);
      const foundFields: string[] = [];
      
      for (const field of calorieFields) {
        if (resultStr.includes(field)) {
          foundFields.push(field);
        }
      }

      if (foundFields.length > 0) {
        console.log(`${colors.green}✓ ${endpointName}${colors.reset}`);
        console.log(`  Fields: ${foundFields.join(', ')}`);
        
        // Try to extract actual values
        for (const field of foundFields) {
          const value = extractValue(result, field);
          if (value !== undefined) {
            console.log(`  ${field}: ${value}`);
          }
        }
        console.log('');
      }
    }
  }

  // Save all results to file for analysis
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, `api-test-results-${formatDate(new Date())}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${colors.cyan}Full results saved to: ${outputPath}${colors.reset}`);
}

function extractValue(obj: any, field: string): any {
  if (obj === null || obj === undefined) return undefined;
  
  if (typeof obj === 'object') {
    if (field in obj) {
      return obj[field];
    }
    
    for (const key of Object.keys(obj)) {
      const value = extractValue(obj[key], field);
      if (value !== undefined) {
        return value;
      }
    }
  }
  
  return undefined;
}

main().catch(console.error);
