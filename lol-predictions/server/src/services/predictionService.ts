import { db, DbPrediction, recalculateUserPoints } from '../db/database.js';
import type { ScheduleEvent } from '../types/esports.js';
import { isEventTrulyCompleted } from './esportsService.js';

export interface PredictionInput {
  matchId: string;
  eventId: string;
  team1Code: string;
  team2Code: string;
  predictedWinner: string;
  predictedScore: string;
}

export interface PredictionResponse {
  id: number;
  matchId: string;
  eventId: string;
  team1Code: string;
  team2Code: string;
  predictedWinner: string;
  predictedScore: string;
  actualWinner: string | null;
  actualScore: string | null;
  isCorrectWinner: boolean | null;
  isCorrectScore: boolean | null;
  pointsEarned: number;
  createdAt: string;
}

function toPredictionResponse(p: DbPrediction): PredictionResponse {
  return {
    id: p.id,
    matchId: p.match_id,
    eventId: p.event_id,
    team1Code: p.team1_code,
    team2Code: p.team2_code,
    predictedWinner: p.predicted_winner,
    predictedScore: p.predicted_score,
    actualWinner: p.actual_winner,
    actualScore: p.actual_score,
    isCorrectWinner: p.is_correct_winner === null ? null : Boolean(p.is_correct_winner),
    isCorrectScore: p.is_correct_score === null ? null : Boolean(p.is_correct_score),
    pointsEarned: p.points_earned,
    createdAt: p.created_at,
  };
}

export function getUserPredictions(userId: number): PredictionResponse[] {
  const predictions = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as DbPrediction[];

  return predictions.map(toPredictionResponse);
}

export function getPredictionByMatch(userId: number, matchId: string): PredictionResponse | null {
  const prediction = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND match_id = ?
  `).get(userId, matchId) as DbPrediction | undefined;

  return prediction ? toPredictionResponse(prediction) : null;
}

export function createOrUpdatePrediction(
  userId: number,
  input: PredictionInput
): PredictionResponse {
  const existing = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND match_id = ?
  `).get(userId, input.matchId) as DbPrediction | undefined;

  if (existing) {
    // Don't allow updates if result is already recorded
    if (existing.actual_winner) {
      throw new Error('Cannot update prediction after match is completed');
    }

    db.prepare(`
      UPDATE predictions
      SET predicted_winner = ?, predicted_score = ?
      WHERE id = ?
    `).run(input.predictedWinner, input.predictedScore, existing.id);

    return getPredictionByMatch(userId, input.matchId)!;
  }

  const result = db.prepare(`
    INSERT INTO predictions (
      user_id, match_id, event_id, team1_code, team2_code,
      predicted_winner, predicted_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    input.matchId,
    input.eventId,
    input.team1Code,
    input.team2Code,
    input.predictedWinner,
    input.predictedScore
  );

  return toPredictionResponse(
    db.prepare('SELECT * FROM predictions WHERE id = ?').get(result.lastInsertRowid) as DbPrediction
  );
}

export function deletePrediction(userId: number, matchId: string): boolean {
  const existing = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND match_id = ?
  `).get(userId, matchId) as DbPrediction | undefined;

  if (!existing) return false;

  // Don't allow deletion if result is already recorded
  if (existing.actual_winner) {
    throw new Error('Cannot delete prediction after match is completed');
  }

  db.prepare('DELETE FROM predictions WHERE id = ?').run(existing.id);
  return true;
}

export interface MigrationPrediction {
  matchId: string;
  eventId: string;
  team1Code: string;
  team2Code: string;
  predictedWinner: string;
  predictedScore: string;
  createdAt?: string;
}

export function migratePredictions(
  userId: number,
  predictions: MigrationPrediction[]
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO predictions (
      user_id, match_id, event_id, team1_code, team2_code,
      predicted_winner, predicted_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of predictions) {
    const result = insertStmt.run(
      userId,
      p.matchId,
      p.eventId,
      p.team1Code,
      p.team2Code,
      p.predictedWinner,
      p.predictedScore,
      p.createdAt || new Date().toISOString()
    );

    if (result.changes > 0) {
      imported++;
    } else {
      skipped++;
    }
  }

  return { imported, skipped };
}

const POINTS = {
  CORRECT_WINNER: 10,
  PERFECT_SCORE: 25,
} as const;

export function updatePredictionResult(
  userId: number,
  matchId: string,
  actualWinner: string,
  actualScore: string
): PredictionResponse | null {
  const prediction = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND match_id = ?
  `).get(userId, matchId) as DbPrediction | undefined;

  if (!prediction) return null;

  const isCorrectWinner = prediction.predicted_winner === actualWinner;
  const isCorrectScore = prediction.predicted_score === actualScore;

  let pointsEarned = 0;
  if (isCorrectScore) {
    pointsEarned = POINTS.PERFECT_SCORE;
  } else if (isCorrectWinner) {
    pointsEarned = POINTS.CORRECT_WINNER;
  }

  db.prepare(`
    UPDATE predictions
    SET actual_winner = ?, actual_score = ?,
        is_correct_winner = ?, is_correct_score = ?, points_earned = ?
    WHERE id = ?
  `).run(
    actualWinner,
    actualScore,
    isCorrectWinner ? 1 : 0,
    isCorrectScore ? 1 : 0,
    pointsEarned,
    prediction.id
  );

  // Update user's total points
  recalculateUserPoints(userId);

  return getPredictionByMatch(userId, matchId);
}

export function autoScoreCompletedMatches(completedEvents: ScheduleEvent[]): number {
  let scored = 0;

  for (const event of completedEvents) {
    if (!isEventTrulyCompleted(event)) continue;

    const teams = event.match?.teams;
    if (!teams || teams.length < 2) continue;

    const winner = teams.find(t => t.result?.outcome === 'win');
    if (!winner) continue;

    const t1Wins = teams[0].result?.gameWins || 0;
    const t2Wins = teams[1].result?.gameWins || 0;
    const actualScore = `${t1Wins}-${t2Wins}`;
    const actualWinner = winner.code;
    const matchId = event.match.id;

    // Find all unscored predictions for this match
    const unscoredPredictions = db.prepare(`
      SELECT * FROM predictions WHERE match_id = ? AND actual_winner IS NULL
    `).all(matchId) as DbPrediction[];

    for (const prediction of unscoredPredictions) {
      const isCorrectWinner = prediction.predicted_winner === actualWinner;
      const isCorrectScore = prediction.predicted_score === actualScore;

      let pointsEarned = 0;
      if (isCorrectScore) {
        pointsEarned = POINTS.PERFECT_SCORE;
      } else if (isCorrectWinner) {
        pointsEarned = POINTS.CORRECT_WINNER;
      }

      db.prepare(`
        UPDATE predictions
        SET actual_winner = ?, actual_score = ?,
            is_correct_winner = ?, is_correct_score = ?, points_earned = ?
        WHERE id = ?
      `).run(
        actualWinner,
        actualScore,
        isCorrectWinner ? 1 : 0,
        isCorrectScore ? 1 : 0,
        pointsEarned,
        prediction.id
      );

      recalculateUserPoints(prediction.user_id);
      scored++;
    }
  }

  if (scored > 0) {
    console.log(`Auto-scored ${scored} predictions`);
  }

  return scored;
}
