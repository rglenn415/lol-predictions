import type { ScheduleEvent, League } from '../types';

/**
 * Validates if an event is truly completed by checking:
 * 1. API state says 'completed'
 * 2. Start time is in the past (with 1 hour buffer for timezone issues)
 * 3. There's an actual winner declared
 */
export function isEventTrulyCompleted(event: ScheduleEvent): boolean {
  if (event.state !== 'completed') {
    return false;
  }

  const startTime = new Date(event.startTime).getTime();
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  if (startTime > now + oneHourMs) {
    return false;
  }

  const teams = event.match?.teams;
  if (!teams || teams.length < 2) {
    return false;
  }

  const hasWinner = teams.some(t => t.result?.outcome === 'win');
  return hasWinner;
}

/**
 * Gets the corrected state for an event, fixing API inconsistencies
 */
export function getCorrectedEventState(event: ScheduleEvent): 'unstarted' | 'inProgress' | 'completed' {
  const startTime = new Date(event.startTime).getTime();
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  if (event.state === 'completed') {
    if (!isEventTrulyCompleted(event)) {
      if (startTime > now + oneHourMs) {
        return 'unstarted';
      }
      return 'inProgress';
    }
  }

  return event.state;
}

export async function getSchedule(): Promise<ScheduleEvent[]> {
  const response = await fetch('/api/esports/schedule');
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: { events: ScheduleEvent[]; lastUpdated: string } = await response.json();
  return data.events;
}

export async function getLeagues(): Promise<League[]> {
  const response = await fetch('/api/esports/leagues');
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: { leagues: League[]; lastUpdated: string } = await response.json();
  return data.leagues;
}
