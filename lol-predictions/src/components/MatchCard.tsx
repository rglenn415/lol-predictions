import type { ScheduleEvent, Team } from '../types';
import { useMatchPrediction } from '../hooks/useMatchPrediction';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { getLeagueImage } from '../utils/leagueImages';
import { isEventTrulyCompleted, getCorrectedEventState } from '../services/api';
import './MatchCard.css';

interface MatchCardProps {
  event: ScheduleEvent;
  onPredictionMade?: () => void;
}

export function MatchCard({ event, onPredictionMade }: MatchCardProps) {
  const { match, league, startTime, state } = event;
  const { isAuthenticated, accessToken } = useAuth();

  const {
    winner,
    prediction,
    saving,
    selectTeam,
    selectScore,
    isScoreSelected,
  } = useMatchPrediction({
    event,
    isAuthenticated,
    accessToken,
    onPredictionMade,
  });

  // Guard invalid data
  if (!match?.teams || match.teams.length < 2) return null;

  const [team1, team2] = match.teams;
  const bestOf = match.strategy?.count || 1;
  // Use corrected state to prevent future games from showing as completed
  const correctedState = getCorrectedEventState(event);
  const isLive = correctedState === 'inProgress';
  const isCompleted = isEventTrulyCompleted(event);
  const canEdit = !isCompleted && !prediction?.actualWinner;

  // Generate score options (e.g., Bo5 → ["3-0", "3-1", "3-2"])
  const scoreOptions = (() => {
    const winsNeeded = Math.ceil(bestOf / 2);
    return Array.from({ length: winsNeeded }, (_, i) => `${winsNeeded}-${i}`);
  })();

  // Determine card result state
  const resultClass = prediction?.actualWinner
    ? prediction.isCorrectScore
      ? 'perfect'
      : prediction.isCorrectWinner
        ? 'correct'
        : 'wrong'
    : '';

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className={cn('match-card', resultClass)}>
      {/* Header */}
      <div className="match-header">
        <img
          src={getLeagueImage(league.slug, league.image)}
          alt={league.name}
          className="league-logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span className="league-name">{league.name}</span>
        {isLive && <span className="live-badge">LIVE</span>}
        {isCompleted && <span className="completed-badge">FINAL</span>}
        <span className="match-time">{formatDate(startTime)}</span>
      </div>

      <div className="match-format">Best of {bestOf}</div>

      {/* Teams */}
      <div className="teams-container">
        <TeamCard
          team={team1}
          isSelected={winner === team1.code}
          isWinner={isCompleted && team1.result?.outcome === 'win'}
          canEdit={canEdit}
          showScore={isCompleted}
          onSelect={() => selectTeam(team1.code)}
        />

        <div className="vs">VS</div>

        <TeamCard
          team={team2}
          isSelected={winner === team2.code}
          isWinner={isCompleted && team2.result?.outcome === 'win'}
          canEdit={canEdit}
          showScore={isCompleted}
          onSelect={() => selectTeam(team2.code)}
        />
      </div>

      {/* Score Selection */}
      {canEdit && (
        <div className="score-select">
          <p>
            {winner
              ? `Predict score (${winner} wins):`
              : 'Select a team first, then predict the score:'}
          </p>
          <div className="score-options">
            {scoreOptions.map(opt => (
              <button
                key={opt}
                className={cn('score-btn', isScoreSelected(opt) && 'selected', saving && 'saving')}
                onClick={() => selectScore(opt)}
                disabled={!winner || saving}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result Display */}
      {prediction?.actualWinner && (
        <div className="prediction-display">
          <div className="prediction-label">Your Prediction:</div>
          <div className="prediction-value">
            {prediction.predictedWinner} wins {prediction.predictedScore}
          </div>
          <div className="result-row">
            <div className="result-badge">
              {prediction.isCorrectScore
                ? 'PERFECT!'
                : prediction.isCorrectWinner
                  ? 'Winner Correct'
                  : 'Wrong'}
            </div>
            <div className={cn('points-earned', !!prediction.pointsEarned && 'has-points')}>
              +{prediction.pointsEarned || 0} pts
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted team card component for cleaner rendering
interface TeamCardProps {
  team: Team;
  isSelected: boolean;
  isWinner: boolean;
  canEdit: boolean;
  showScore: boolean;
  onSelect: () => void;
}

function TeamCard({ team, isSelected, isWinner, canEdit, showScore, onSelect }: TeamCardProps) {
  return (
    <div
      className={cn('team', isSelected && 'selected', isWinner && 'winner', canEdit && 'clickable')}
      onClick={canEdit ? onSelect : undefined}
    >
      <img src={team.image} alt={team.name} className="team-logo" />
      <span className="team-code">{team.code}</span>
      <span className="team-name">{team.name}</span>
      {showScore && <span className="team-score">{team.result?.gameWins || 0}</span>}
    </div>
  );
}
