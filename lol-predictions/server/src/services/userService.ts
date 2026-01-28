import { db, DbPrediction } from '../db/database.js';
import { getUserByUsername, UserResponse } from './authService.js';

export interface UserStats {
  total: number;
  completed: number;
  pending: number;
  winnerCorrect: number;
  winnerAccuracy: number;
  scoreCorrect: number;
  scoreAccuracy: number;
  totalPoints: number;
}

export interface PublicProfile {
  user: {
    username: string;
    displayName: string | null;
    bio: string | null;
    totalPoints: number;
    createdAt: string;
  };
  stats: UserStats;
}

export function getPublicProfile(username: string): PublicProfile | null {
  const user = getUserByUsername(username);
  if (!user) return null;

  const stats = getUserStats(user.id);

  return {
    user: {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      totalPoints: user.totalPoints,
      createdAt: user.createdAt,
    },
    stats,
  };
}

export function getUserStats(userId: number): UserStats {
  const predictions = db.prepare(`
    SELECT * FROM predictions WHERE user_id = ?
  `).all(userId) as DbPrediction[];

  const completed = predictions.filter(p => p.actual_winner !== null);
  const winnerCorrect = completed.filter(p => p.is_correct_winner).length;
  const scoreCorrect = completed.filter(p => p.is_correct_score).length;
  const totalPoints = completed.reduce((sum, p) => sum + p.points_earned, 0);

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

export interface CompletedPrediction {
  matchId: string;
  eventId: string;
  team1Code: string;
  team2Code: string;
  predictedWinner: string;
  predictedScore: string;
  actualWinner: string;
  actualScore: string;
  isCorrectWinner: boolean;
  isCorrectScore: boolean;
  pointsEarned: number;
  createdAt: string;
}

export function getUserCompletedPredictions(username: string): CompletedPrediction[] | null {
  const user = getUserByUsername(username);
  if (!user) return null;

  const predictions = db.prepare(`
    SELECT * FROM predictions
    WHERE user_id = ? AND actual_winner IS NOT NULL
    ORDER BY created_at DESC
  `).all(user.id) as DbPrediction[];

  return predictions.map(p => ({
    matchId: p.match_id,
    eventId: p.event_id,
    team1Code: p.team1_code,
    team2Code: p.team2_code,
    predictedWinner: p.predicted_winner,
    predictedScore: p.predicted_score,
    actualWinner: p.actual_winner!,
    actualScore: p.actual_score!,
    isCorrectWinner: Boolean(p.is_correct_winner),
    isCorrectScore: Boolean(p.is_correct_score),
    pointsEarned: p.points_earned,
    createdAt: p.created_at,
  }));
}
