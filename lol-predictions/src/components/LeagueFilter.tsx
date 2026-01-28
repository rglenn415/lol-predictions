import { useState } from 'react';
import type { League } from '../types';
import { getLeagueImage } from '../utils/leagueImages';
import './LeagueFilter.css';

interface LeagueFilterProps {
  leagues: League[];
  selectedLeagues: Set<string>;
  onToggleLeague: (leagueSlug: string) => void;
}

// Major leagues to show by default
const MAJOR_LEAGUES = ['lck', 'lpl', 'lec', 'lcs', 'worlds', 'msi'];

export function LeagueFilter({
  leagues,
  selectedLeagues,
  onToggleLeague,
}: LeagueFilterProps) {
  const [showAllLeagues, setShowAllLeagues] = useState(false);

  // Sort leagues with major ones first
  const sortedLeagues = [...leagues].sort((a, b) => {
    const aIndex = MAJOR_LEAGUES.indexOf(a.slug);
    const bIndex = MAJOR_LEAGUES.indexOf(b.slug);

    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.name.localeCompare(b.name);
  });

  const minorLeaguesCount = sortedLeagues.filter(
    league => !MAJOR_LEAGUES.includes(league.slug)
  ).length;

  return (
    <div className={`league-filter ${showAllLeagues ? 'show-all' : ''}`}>
      {sortedLeagues.map(league => {
        const isMajor = MAJOR_LEAGUES.includes(league.slug);
        const isSelected = selectedLeagues.has(league.slug);
        return (
          <button
            key={league.id}
            className={`league-btn ${isSelected ? 'active' : ''} ${!isMajor ? 'minor-league' : ''}`}
            onClick={() => onToggleLeague(league.slug)}
          >
            <img
              src={getLeagueImage(league.slug, league.image)}
              alt={league.name}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span>{league.slug.toUpperCase()}</span>
          </button>
        );
      })}
      {minorLeaguesCount > 0 && (
        <button
          className="toggle-leagues-btn"
          onClick={() => setShowAllLeagues(!showAllLeagues)}
        >
          {showAllLeagues ? 'Hide Minor' : `+${minorLeaguesCount} More`}
        </button>
      )}
    </div>
  );
}
