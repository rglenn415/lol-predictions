import type { UserPrediction, PredictionStats, ScheduleEvent } from '../types';
import { POINTS } from '../types';
import { isEventTrulyCompleted } from './api';

function calculatePoints(isCorrectWinner: boolean, isCorrectScore: boolean): number {
  if (isCorrectScore) {
    return POINTS.PERFECT_SCORE;
  }
  if (isCorrectWinner) {
    return POINTS.CORRECT_WINNER;
  }
  return 0;
}

const STORAGE_KEY = 'lol_predictions';

// ===== LOCAL STORAGE FUNCTIONS (for non-authenticated users) =====

export function getPredictions(): UserPrediction[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  return JSON.parse(stored);
}

export function savePrediction(prediction: UserPrediction): void {
  const predictions = getPredictions();

  // Check if prediction already exists for this match
  const existingIndex = predictions.findIndex(p => p.matchId === prediction.matchId);

  if (existingIndex >= 0) {
    predictions[existingIndex] = prediction;
  } else {
    predictions.push(prediction);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
}

export function getPredictionForMatch(matchId: string): UserPrediction | undefined {
  const predictions = getPredictions();
  return predictions.find(p => p.matchId === matchId);
}

export function updatePredictionsWithResults(completedEvents: ScheduleEvent[]): number {
  const predictions = getPredictions();
  let updated = 0;

  for (const prediction of predictions) {
    if (prediction.actualWinner) continue; // Already has result

    const event = completedEvents.find(e => e.match.id === prediction.matchId);
    // Use stricter validation to ensure game is truly completed
    if (!event || !isEventTrulyCompleted(event)) continue;

    const teams = event.match.teams;
    if (teams.length < 2) continue;

    const winner = teams.find(t => t.result?.outcome === 'win');
    if (!winner) continue;

    const t1Wins = teams[0].result?.gameWins || 0;
    const t2Wins = teams[1].result?.gameWins || 0;
    const actualScore = `${t1Wins}-${t2Wins}`;

    prediction.actualWinner = winner.code;
    prediction.actualScore = actualScore;
    prediction.isCorrectWinner = prediction.predictedWinner === winner.code;
    prediction.isCorrectScore = prediction.predictedScore === actualScore;
    prediction.pointsEarned = calculatePoints(
      prediction.isCorrectWinner,
      prediction.isCorrectScore
    );

    updated++;
  }

  if (updated > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
  }

  return updated;
}

export function getStats(): PredictionStats {
  const predictions = getPredictions();
  const completed = predictions.filter(p => p.actualWinner);

  const winnerCorrect = completed.filter(p => p.isCorrectWinner).length;
  const scoreCorrect = completed.filter(p => p.isCorrectScore).length;
  const totalPoints = completed.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);

  return {
    total: predictions.length,
    completed: completed.length,
    pending: predictions.length - completed.length,
    winnerCorrect,
    winnerAccuracy: completed.length > 0 ? (winnerCorrect / completed.length) * 100 : 0,
    scoreCorrect,
    scoreAccuracy: completed.length > 0 ? (scoreCorrect / completed.length) * 100 : 0,
    totalPoints,
  };
}

export function clearPredictions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Migrate existing predictions to add points if missing
export function migratePredictions(): void {
  const predictions = getPredictions();
  let migrated = false;

  for (const prediction of predictions) {
    // Only migrate completed predictions that don't have points calculated
    if (prediction.actualWinner && prediction.pointsEarned === undefined) {
      prediction.pointsEarned = calculatePoints(
        prediction.isCorrectWinner || false,
        prediction.isCorrectScore || false
      );
      migrated = true;
    }
  }

  if (migrated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
  }
}

// ===== API FUNCTIONS (for authenticated users) =====

export async function fetchPredictions(accessToken: string): Promise<UserPrediction[]> {
  const res = await fetch('/api/predictions', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch predictions');
  }

  const data = await res.json();
  return data.predictions.map((p: Record<string, unknown>) => ({
    id: String(p.id),
    matchId: p.matchId,
    eventId: p.eventId,
    team1Code: p.team1Code,
    team2Code: p.team2Code,
    predictedWinner: p.predictedWinner,
    predictedScore: p.predictedScore,
    createdAt: p.createdAt,
    actualWinner: p.actualWinner || undefined,
    actualScore: p.actualScore || undefined,
    isCorrectWinner: p.isCorrectWinner ?? undefined,
    isCorrectScore: p.isCorrectScore ?? undefined,
    pointsEarned: p.pointsEarned ?? undefined,
  }));
}

export async function savePredictionToApi(
  accessToken: string,
  prediction: {
    matchId: string;
    eventId: string;
    team1Code: string;
    team2Code: string;
    predictedWinner: string;
    predictedScore: string;
  }
): Promise<UserPrediction> {
  const res = await fetch('/api/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(prediction),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save prediction');
  }

  const data = await res.json();
  const p = data.prediction;
  return {
    id: String(p.id),
    matchId: p.matchId,
    eventId: p.eventId,
    team1Code: p.team1Code,
    team2Code: p.team2Code,
    predictedWinner: p.predictedWinner,
    predictedScore: p.predictedScore,
    createdAt: p.createdAt,
    actualWinner: p.actualWinner || undefined,
    actualScore: p.actualScore || undefined,
    isCorrectWinner: p.isCorrectWinner ?? undefined,
    isCorrectScore: p.isCorrectScore ?? undefined,
    pointsEarned: p.pointsEarned ?? undefined,
  };
}

export async function deletePredictionFromApi(
  accessToken: string,
  matchId: string
): Promise<void> {
  const res = await fetch(`/api/predictions/${matchId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete prediction');
  }
}

export async function fetchStats(accessToken: string): Promise<PredictionStats> {
  const predictions = await fetchPredictions(accessToken);
  const completed = predictions.filter(p => p.actualWinner);

  const winnerCorrect = completed.filter(p => p.isCorrectWinner).length;
  const scoreCorrect = completed.filter(p => p.isCorrectScore).length;
  const totalPoints = completed.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);

  return {
    total: predictions.length,
    completed: completed.length,
    pending: predictions.length - completed.length,
    winnerCorrect,
    winnerAccuracy: completed.length > 0 ? (winnerCorrect / completed.length) * 100 : 0,
    scoreCorrect,
    scoreAccuracy: completed.length > 0 ? (scoreCorrect / completed.length) * 100 : 0,
    totalPoints,
  };
}
