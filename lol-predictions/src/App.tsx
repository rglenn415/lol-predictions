import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ScheduleEvent, League, PredictionStats } from './types';
import { getSchedule, getLeagues, isEventTrulyCompleted, getCorrectedEventState } from './services/api';
import {
  getStats,
  updatePredictionsWithResults,
  migratePredictions,
  getPredictions,
  clearPredictions,
  fetchStats,
} from './services/predictions';
import { useAuth } from './contexts/AuthContext';
import { Header } from './components/Header';
import { MatchCard } from './components/MatchCard';
import { Stats } from './components/Stats';
import { LeagueFilter } from './components/LeagueFilter';
import { DaySelector } from './components/DaySelector';
import { usePredictions } from './contexts/PredictionsContext';
import './App.css';

// Default leagues to show on load
const DEFAULT_LEAGUES = new Set(['lck', 'lpl', 'lec', 'lcs']);

function App() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<Set<string>>(DEFAULT_LEAGUES);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PredictionStats>(getStats());
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { isAuthenticated, accessToken } = useAuth();
  const { refreshPredictions } = usePredictions();

  const loadStats = useCallback(async () => {
    if (isAuthenticated && accessToken) {
      const apiStats = await fetchStats(accessToken);
      setStats(apiStats);
    } else {
      setStats(getStats());
    }
  }, [isAuthenticated, accessToken]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsData, leaguesData] = await Promise.all([
        getSchedule(), // Fetch from our server's cache
        leagues.length === 0 ? getLeagues() : Promise.resolve(leagues),
      ]);

      setEvents(eventsData);
      if (leagues.length === 0) {
        setLeagues(leaguesData);
      }

      // For non-authenticated users, score predictions client-side from localStorage
      if (!isAuthenticated) {
        const completed = eventsData.filter(e => isEventTrulyCompleted(e));
        const updatedCount = updatePredictionsWithResults(completed);
        if (updatedCount > 0) {
          await refreshPredictions();
        }
      } else {
        // Authenticated users are auto-scored server-side; just refresh
        await refreshPredictions();
      }

      await loadStats();
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [leagues, isAuthenticated, loadStats, refreshPredictions]);

  // Migrate old predictions to include points
  useEffect(() => {
    migratePredictions();
  }, []);

  // Check for localStorage predictions when user logs in and reload stats
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      const localPredictions = getPredictions();
      if (localPredictions.length > 0) {
        setShowMigrationPrompt(true);
      }
      // Reload stats from API
      loadStats();
    }
  }, [isAuthenticated, accessToken, loadStats]);

  const handleMigratePredictions = async () => {
    if (!accessToken) return;

    setMigrating(true);
    try {
      const localPredictions = getPredictions();
      const migrationData = localPredictions.map(p => ({
        matchId: p.matchId,
        eventId: p.eventId,
        team1Code: p.team1Code,
        team2Code: p.team2Code,
        predictedWinner: p.predictedWinner,
        predictedScore: p.predictedScore,
        createdAt: p.createdAt,
      }));

      const res = await fetch('/api/predictions/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ predictions: migrationData }),
      });

      if (res.ok) {
        clearPredictions();
        await loadStats();
      }
    } catch (error) {
      console.error('Migration failed:', error);
    } finally {
      setMigrating(false);
      setShowMigrationPrompt(false);
    }
  };

  const handleSkipMigration = () => {
    setShowMigrationPrompt(false);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handlePredictionMade = async () => {
    await loadStats();
  };

  const handleToggleLeague = useCallback((leagueSlug: string) => {
    setSelectedLeagues(prev => {
      const next = new Set(prev);
      if (next.has(leagueSlug)) {
        next.delete(leagueSlug);
      } else {
        next.add(leagueSlug);
      }
      return next;
    });
  }, []);

  const filteredEvents = events.filter(event => {
    // Filter out events without valid match data
    if (!event.match?.teams || event.match.teams.length < 2) {
      return false;
    }
    // Exclude sub-leagues (e.g. LCK Challengers) that share a parent slug
    const leagueName = event.league.name.toLowerCase();
    if (leagueName.includes('challengers') || leagueName.includes('academy')) {
      return false;
    }
    // Filter by selected leagues
    if (selectedLeagues.size > 0 && !selectedLeagues.has(event.league.slug)) {
      return false;
    }
    return true;
  });

  // Sort: live first, then by date (use corrected state)
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const stateA = getCorrectedEventState(a);
    const stateB = getCorrectedEventState(b);
    if (stateA === 'inProgress' && stateB !== 'inProgress') return -1;
    if (stateB === 'inProgress' && stateA !== 'inProgress') return 1;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  // Group events by day (local date string YYYY-MM-DD)
  const { days, matchCounts, eventsByDay } = useMemo(() => {
    const grouped: Record<string, ScheduleEvent[]> = {};
    for (const event of sortedEvents) {
      const d = new Date(event.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    }
    const sortedDays = Object.keys(grouped).sort();
    const counts: Record<string, number> = {};
    for (const day of sortedDays) {
      counts[day] = grouped[day].length;
    }
    return { days: sortedDays, matchCounts: counts, eventsByDay: grouped };
  }, [sortedEvents]);

  // Auto-select the best default day when days change
  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null);
      return;
    }
    // If current selection is still valid, keep it
    if (selectedDay && days.includes(selectedDay)) return;

    // Pick today if available, otherwise the nearest day
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (days.includes(todayKey)) {
      setSelectedDay(todayKey);
    } else {
      // Find the closest day to today
      const todayTime = now.getTime();
      let closest = days[0];
      let closestDiff = Math.abs(new Date(days[0] + 'T00:00:00').getTime() - todayTime);
      for (const day of days) {
        const diff = Math.abs(new Date(day + 'T00:00:00').getTime() - todayTime);
        if (diff < closestDiff) {
          closest = day;
          closestDiff = diff;
        }
      }
      setSelectedDay(closest);
    }
  }, [days, selectedDay]);

  const visibleEvents = selectedDay ? (eventsByDay[selectedDay] || []) : sortedEvents;

  return (
    <div className="app">
      <Header />

      {showMigrationPrompt && (
        <div className="migration-overlay">
          <div className="migration-modal">
            <h2>Import Local Predictions?</h2>
            <p>
              You have {getPredictions().length} prediction(s) saved locally.
              Would you like to import them to your account?
            </p>
            <div className="migration-actions">
              <button
                onClick={handleMigratePredictions}
                disabled={migrating}
                className="migrate-btn primary"
              >
                {migrating ? 'Importing...' : 'Import Predictions'}
              </button>
              <button
                onClick={handleSkipMigration}
                disabled={migrating}
                className="migrate-btn secondary"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        <Stats stats={stats} />

        <LeagueFilter
          leagues={leagues}
          selectedLeagues={selectedLeagues}
          onToggleLeague={handleToggleLeague}
        />

        {!loading && days.length > 0 && selectedDay && (
          <DaySelector
            days={days}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            matchCounts={matchCounts}
          />
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading matches...</p>
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="empty">
            <p>No matches found</p>
          </div>
        ) : (
          <div className="matches-grid">
            {visibleEvents.map(event => (
              <MatchCard
                key={event.id}
                event={event}
                onPredictionMade={handlePredictionMade}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Data from LoL Esports API</p>
        <button className="refresh-btn" onClick={fetchData} disabled={loading}>
          Refresh
        </button>
      </footer>
    </div>
  );
}

export default App;
