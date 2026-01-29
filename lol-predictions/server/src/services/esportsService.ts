import { db } from '../db/database.js';
import type { ScheduleEvent, League } from '../types/esports.js';

const BASE_URL = 'https://esports-api.lolesports.com/persisted/gw';
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

interface ApiResponse<T> {
  data: T;
}

interface ScheduleApiResponse {
  schedule: {
    events: ScheduleEvent[];
    pages?: {
      older?: string;
      newer?: string;
    };
  };
}

interface LeaguesApiResponse {
  leagues: League[];
}

async function fetchExternalApi<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const searchParams = new URLSearchParams({
    hl: 'en-US',
    ...params,
  });

  const response = await fetch(`${BASE_URL}/${endpoint}?${searchParams}`, {
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`LoL Esports API error: ${response.status} ${response.statusText}`);
  }

  const json: ApiResponse<T> = await response.json();
  return json.data;
}

function updateCacheMeta(key: string, error?: string): void {
  const now = new Date().toISOString();
  if (error) {
    db.prepare(`
      INSERT INTO esports_cache_meta (key, last_fetched_at, fetch_count, last_error)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        last_fetched_at = ?,
        fetch_count = fetch_count + 1,
        last_error = ?
    `).run(key, now, error, now, error);
  } else {
    db.prepare(`
      INSERT INTO esports_cache_meta (key, last_fetched_at, last_success_at, fetch_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET
        last_fetched_at = ?,
        last_success_at = ?,
        fetch_count = fetch_count + 1,
        last_error = NULL
    `).run(key, now, now, now, now);
  }
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_FORWARD_PAGES = 5;

export async function refreshScheduleCache(): Promise<number> {
  try {
    const allEvents: ScheduleEvent[] = [];
    const twoWeeksFromNow = Date.now() + TWO_WEEKS_MS;
    let pageToken: string | undefined;
    let pagesRead = 0;

    // Fetch the current page, then follow "newer" pages until we cover 2 weeks ahead
    while (pagesRead < MAX_FORWARD_PAGES + 1) {
      const params: Record<string, string> = {};
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const data = await fetchExternalApi<ScheduleApiResponse>('getSchedule', params);
      const events = data.schedule.events;
      allEvents.push(...events);
      pagesRead++;

      // Stop if there's no next page
      const newerToken = data.schedule.pages?.newer;
      if (!newerToken) break;

      // Stop if the latest event on this page already exceeds 2 weeks out
      if (events.length > 0) {
        const latestTime = Math.max(...events.map(e => new Date(e.startTime).getTime()));
        if (latestTime > twoWeeksFromNow) break;
      }

      pageToken = newerToken;
    }

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO esports_events (id, start_time, state, league_slug, match_id, event_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Remove stale events that share a match_id with an incoming event
    // but have a different event id (API reassigned event IDs)
    const cleanupDuplicateMatch = db.prepare(`
      DELETE FROM esports_events WHERE match_id = ? AND id != ?
    `);

    const runTransaction = db.transaction(() => {
      for (const event of allEvents) {
        const matchId = event.match?.id || null;
        if (matchId) {
          cleanupDuplicateMatch.run(matchId, event.id);
        }
        upsert.run(
          event.id,
          event.startTime,
          event.state,
          event.league.slug,
          matchId,
          JSON.stringify(event)
        );
      }
    });

    runTransaction();
    updateCacheMeta('schedule');
    console.log(`Schedule cached: ${allEvents.length} events (${pagesRead} page${pagesRead > 1 ? 's' : ''})`);
    return allEvents.length;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateCacheMeta('schedule', msg);
    console.error('Failed to refresh schedule cache:', msg);
    throw error;
  }
}

export async function refreshLeaguesCache(): Promise<number> {
  try {
    const data = await fetchExternalApi<LeaguesApiResponse>('getLeagues');
    const leagues = data.leagues;

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO esports_leagues (id, slug, name, image)
      VALUES (?, ?, ?, ?)
    `);

    const runTransaction = db.transaction(() => {
      for (const league of leagues) {
        upsert.run(league.id, league.slug, league.name, league.image);
      }
    });

    runTransaction();
    updateCacheMeta('leagues');
    console.log(`Leagues cached: ${leagues.length} leagues`);
    return leagues.length;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateCacheMeta('leagues', msg);
    console.error('Failed to refresh leagues cache:', msg);
    throw error;
  }
}

export function getCachedSchedule(): ScheduleEvent[] {
  // Return events from the past 7 days through 14 days ahead,
  // deduplicated by match_id (keep the most recently inserted row per match).
  const now = new Date();
  const pastCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const futureCutoff = new Date(now.getTime() + TWO_WEEKS_MS).toISOString();

  const rows = db.prepare(`
    SELECT event_json FROM esports_events e
    WHERE e.start_time >= ? AND e.start_time <= ?
      AND (
        e.match_id IS NULL
        OR e.rowid = (
          SELECT MAX(e2.rowid) FROM esports_events e2
          WHERE e2.match_id = e.match_id
        )
      )
    ORDER BY start_time ASC
  `).all(pastCutoff, futureCutoff) as { event_json: string }[];

  return rows.map(r => JSON.parse(r.event_json) as ScheduleEvent);
}

export function getCachedLeagues(): League[] {
  return db.prepare(`
    SELECT id, slug, name, image FROM esports_leagues ORDER BY name ASC
  `).all() as League[];
}

export function getCacheLastUpdated(key: string): string | null {
  const row = db.prepare(`
    SELECT last_success_at FROM esports_cache_meta WHERE key = ?
  `).get(key) as { last_success_at: string | null } | undefined;

  return row?.last_success_at || null;
}

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
