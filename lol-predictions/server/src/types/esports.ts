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
