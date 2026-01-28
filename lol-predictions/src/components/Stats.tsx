import type { PredictionStats } from '../types';
import { POINTS } from '../types';
import './Stats.css';

interface StatsProps {
  stats: PredictionStats;
}

export function Stats({ stats }: StatsProps) {
  return (
    <div className="stats-container">
      <div className="stats-header">
        <h2>Your Stats</h2>
        <div className="points-display">
          <span className="points-value">{stats.totalPoints}</span>
          <span className="points-label">Points</span>
        </div>
      </div>

      <div className="points-legend">
        <span className="legend-item">
          <span className="legend-dot winner"></span>
          Winner: +{POINTS.CORRECT_WINNER}pts
        </span>
        <span className="legend-item">
          <span className="legend-dot perfect"></span>
          Perfect: +{POINTS.PERFECT_SCORE}pts
        </span>
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Predictions</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>

        <div className="stat-box highlight-green">
          <div className="stat-value">{stats.winnerAccuracy.toFixed(1)}%</div>
          <div className="stat-label">Winner Accuracy</div>
          <div className="stat-detail">{stats.winnerCorrect}/{stats.completed}</div>
        </div>

        <div className="stat-box highlight-gold">
          <div className="stat-value">{stats.scoreAccuracy.toFixed(1)}%</div>
          <div className="stat-label">Perfect Score</div>
          <div className="stat-detail">{stats.scoreCorrect}/{stats.completed}</div>
        </div>
      </div>
    </div>
  );
}
