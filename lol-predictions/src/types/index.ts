export interface Player {
  id: string;
  summonerName: string;
  firstName: string;
  lastName: string;
  image: string;
  role: 'top' | 'jungle' | 'mid' | 'bottom' | 'support' | string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  image: string;
  result?: {
    outcome: string | null;
    gameWins: number;
  };
  players?: Player[];
}

export interface Match {
  id: string;
  teams: Team[];
  strategy: {
    type: string;
    count: number;
  };
}

export interface League {
  id: string;
  slug: string;
  name: string;
  image: string;
}

export interface ScheduleEvent {
  id: string;
  startTime: string;
  state: 'unstarted' | 'inProgress' | 'completed';
  type: string;
  blockName: string;
  league: League;
  match: Match;
}

export interface UserPrediction {
  id: string;
  matchId: string;
  eventId: string;
  team1Code: string;
  team2Code: string;
  predictedWinner: string;
  predictedScore: string;
  createdAt: string;
  actualWinner?: string;
  actualScore?: string;
  isCorrectWinner?: boolean;
  isCorrectScore?: boolean;
  pointsEarned?: number;
}

// Points configuration
export const POINTS = {
  CORRECT_WINNER: 10,
  PERFECT_SCORE: 25, // Total for getting both winner and score correct
} as const;

export interface PredictionStats {
  total: number;
  completed: number;
  pending: number;
  winnerCorrect: number;
  winnerAccuracy: number;
  scoreCorrect: number;
  scoreAccuracy: number;
  totalPoints: number;
}

// User types
export interface User {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
}

export interface PublicProfile {
  user: {
    username: string;
    displayName: string | null;
    bio: string | null;
    createdAt: string;
  };
  stats: PredictionStats;
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
