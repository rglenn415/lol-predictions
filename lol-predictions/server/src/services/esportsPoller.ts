import { refreshScheduleCache, refreshLeaguesCache, getCachedSchedule } from './esportsService.js';
import { autoScoreCompletedMatches } from './predictionService.js';

const SCHEDULE_INTERVAL_MS = 2 * 60 * 1000;   // 2 minutes
const LEAGUES_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let leaguesTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAndScore(): Promise<void> {
  try {
    await refreshScheduleCache();
    const events = getCachedSchedule();
    const completed = events.filter(e => e.state === 'completed');
    autoScoreCompletedMatches(completed);
  } catch (error) {
    console.error('Schedule refresh/score cycle failed:', error);
  }
}

export async function startPolling(): Promise<void> {
  console.log('Esports poller: starting...');

  // Immediate fetch on startup (cold start)
  try {
    await Promise.all([
      refreshAndScore(),
      refreshLeaguesCache(),
    ]);
  } catch (error) {
    console.error('Esports poller: initial fetch failed (will retry on schedule):', error);
  }

  // Schedule recurring refreshes
  scheduleTimer = setInterval(refreshAndScore, SCHEDULE_INTERVAL_MS);
  leaguesTimer = setInterval(async () => {
    try {
      await refreshLeaguesCache();
    } catch (error) {
      console.error('Leagues refresh failed:', error);
    }
  }, LEAGUES_INTERVAL_MS);

  console.log('Esports poller: started (schedule every 2min, leagues every 6h)');
}

export function stopPolling(): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  if (leaguesTimer) {
    clearInterval(leaguesTimer);
    leaguesTimer = null;
  }
  console.log('Esports poller: stopped');
}
