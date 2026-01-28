"""
Data Collector for LoL Esports
Collects match history and team statistics for prediction model training.
"""

import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from api_client import LoLEsportsAPI
import time


@dataclass
class TeamStats:
    """Aggregated team statistics."""
    team_id: str
    team_name: str
    team_code: str
    wins: int = 0
    losses: int = 0
    games_played: int = 0
    blue_side_wins: int = 0
    blue_side_games: int = 0
    red_side_wins: int = 0
    red_side_games: int = 0

    @property
    def win_rate(self) -> float:
        if self.games_played == 0:
            return 0.0
        return self.wins / self.games_played

    @property
    def blue_side_win_rate(self) -> float:
        if self.blue_side_games == 0:
            return 0.0
        return self.blue_side_wins / self.blue_side_games

    @property
    def red_side_win_rate(self) -> float:
        if self.red_side_games == 0:
            return 0.0
        return self.red_side_wins / self.red_side_games


@dataclass
class MatchRecord:
    """Record of a completed match for training data."""
    match_id: str
    tournament_id: str
    tournament_name: str
    date: str
    team1_id: str
    team1_name: str
    team1_code: str
    team2_id: str
    team2_name: str
    team2_code: str
    winner_id: str
    winner_code: str
    team1_score: int
    team2_score: int
    num_games: int
    # Pre-match statistics (for prediction features)
    team1_win_rate: float = 0.0
    team2_win_rate: float = 0.0
    team1_recent_form: float = 0.0  # Win rate in last 5 matches
    team2_recent_form: float = 0.0


class DataCollector:
    """Collects and processes esports data for ML predictions."""

    def __init__(self, data_dir: str = "data"):
        self.api = LoLEsportsAPI()
        self.data_dir = data_dir
        self.team_stats: Dict[str, TeamStats] = {}
        self.match_history: Dict[str, List[str]] = {}  # team_id -> list of match results

        os.makedirs(data_dir, exist_ok=True)

    def collect_league_data(self, league_slug: str, num_tournaments: int = 5) -> List[MatchRecord]:
        """Collect match data from a league's recent tournaments."""
        print(f"🔍 Finding league: {league_slug}")

        leagues = self.api.get_leagues()
        league = next((l for l in leagues if l.get("slug") == league_slug), None)

        if not league:
            print(f"❌ League '{league_slug}' not found")
            return []

        print(f"✅ Found: {league['name']}")

        tournaments = self.api.get_tournaments_for_league(league["id"])
        print(f"📅 Found {len(tournaments)} tournaments")

        all_matches = []

        for tournament in tournaments[:num_tournaments]:
            print(f"\n📊 Processing: {tournament['slug']}")
            matches = self._collect_tournament_matches(tournament)
            all_matches.extend(matches)
            time.sleep(0.5)  # Rate limiting

        return all_matches

    def _collect_tournament_matches(self, tournament: Dict) -> List[MatchRecord]:
        """Collect all matches from a tournament."""
        tournament_id = tournament["id"]
        tournament_name = tournament.get("slug", "unknown")

        events = self.api.get_completed_events(tournament_id)
        matches = []

        for event in events:
            match = event.get("match", {})
            if not match:
                continue

            teams = match.get("teams", [])
            if len(teams) < 2:
                continue

            team1 = teams[0]
            team2 = teams[1]

            # Determine winner
            t1_outcome = team1.get("result", {}).get("outcome")
            t2_outcome = team2.get("result", {}).get("outcome")

            if t1_outcome == "win":
                winner_id = team1.get("id", "")
                winner_code = team1.get("code", "")
            elif t2_outcome == "win":
                winner_id = team2.get("id", "")
                winner_code = team2.get("code", "")
            else:
                continue  # Skip matches without a winner

            # Get scores
            t1_score = team1.get("result", {}).get("gameWins", 0)
            t2_score = team2.get("result", {}).get("gameWins", 0)

            # Update team stats
            self._update_team_stats(team1, t1_outcome == "win")
            self._update_team_stats(team2, t2_outcome == "win")

            # Create match record
            record = MatchRecord(
                match_id=match.get("id", ""),
                tournament_id=tournament_id,
                tournament_name=tournament_name,
                date=event.get("startTime", ""),
                team1_id=team1.get("id", ""),
                team1_name=team1.get("name", ""),
                team1_code=team1.get("code", ""),
                team2_id=team2.get("id", ""),
                team2_name=team2.get("name", ""),
                team2_code=team2.get("code", ""),
                winner_id=winner_id,
                winner_code=winner_code,
                team1_score=t1_score,
                team2_score=t2_score,
                num_games=t1_score + t2_score,
                team1_win_rate=self._get_team_win_rate(team1.get("id")),
                team2_win_rate=self._get_team_win_rate(team2.get("id")),
                team1_recent_form=self._get_recent_form(team1.get("id")),
                team2_recent_form=self._get_recent_form(team2.get("id")),
            )

            matches.append(record)

            # Update match history for recent form calculation
            self._update_match_history(team1.get("id"), t1_outcome == "win")
            self._update_match_history(team2.get("id"), t2_outcome == "win")

        print(f"  ✓ Collected {len(matches)} matches")
        return matches

    def _update_team_stats(self, team: Dict, won: bool):
        """Update aggregated team statistics."""
        team_id = team.get("id", "")
        if not team_id:
            return

        if team_id not in self.team_stats:
            self.team_stats[team_id] = TeamStats(
                team_id=team_id,
                team_name=team.get("name", ""),
                team_code=team.get("code", "")
            )

        stats = self.team_stats[team_id]
        stats.games_played += 1
        if won:
            stats.wins += 1
        else:
            stats.losses += 1

    def _update_match_history(self, team_id: str, won: bool):
        """Update recent match history for a team."""
        if team_id not in self.match_history:
            self.match_history[team_id] = []

        self.match_history[team_id].append("W" if won else "L")
        # Keep only last 10 matches
        self.match_history[team_id] = self.match_history[team_id][-10:]

    def _get_team_win_rate(self, team_id: str) -> float:
        """Get team's overall win rate."""
        if team_id not in self.team_stats:
            return 0.5  # Default for unknown teams
        return self.team_stats[team_id].win_rate

    def _get_recent_form(self, team_id: str, num_matches: int = 5) -> float:
        """Get team's recent form (win rate in last N matches)."""
        if team_id not in self.match_history:
            return 0.5

        history = self.match_history[team_id][-num_matches:]
        if not history:
            return 0.5

        wins = sum(1 for r in history if r == "W")
        return wins / len(history)

    def save_data(self, matches: List[MatchRecord], filename: str = "match_data.json"):
        """Save collected match data to JSON."""
        filepath = os.path.join(self.data_dir, filename)

        data = {
            "collected_at": datetime.now().isoformat(),
            "num_matches": len(matches),
            "matches": [asdict(m) for m in matches],
            "team_stats": {k: asdict(v) for k, v in self.team_stats.items()}
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"\n💾 Saved {len(matches)} matches to {filepath}")

    def load_data(self, filename: str = "match_data.json") -> Tuple[List[MatchRecord], Dict[str, TeamStats]]:
        """Load previously collected match data."""
        filepath = os.path.join(self.data_dir, filename)

        if not os.path.exists(filepath):
            return [], {}

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        matches = [MatchRecord(**m) for m in data.get("matches", [])]
        team_stats = {k: TeamStats(**v) for k, v in data.get("team_stats", {}).items()}

        return matches, team_stats


def main():
    """Collect data from major leagues."""
    collector = DataCollector(data_dir="data")

    # Major leagues to collect from
    leagues = [
        "lck",      # Korea
        "lpl",      # China
        "lec",      # Europe
        "lcs",      # North America
        "worlds",   # World Championship
        "msi",      # Mid-Season Invitational
    ]

    all_matches = []

    for league_slug in leagues:
        print(f"\n{'='*60}")
        print(f"Collecting data from {league_slug.upper()}")
        print("=" * 60)

        try:
            matches = collector.collect_league_data(league_slug, num_tournaments=3)
            all_matches.extend(matches)
        except Exception as e:
            print(f"❌ Error collecting {league_slug}: {e}")
            continue

        time.sleep(1)  # Rate limiting between leagues

    # Save all collected data
    collector.save_data(all_matches)

    # Print summary
    print("\n" + "=" * 60)
    print("📊 Collection Summary")
    print("=" * 60)
    print(f"Total matches collected: {len(all_matches)}")
    print(f"Unique teams: {len(collector.team_stats)}")

    # Top teams by win rate
    sorted_teams = sorted(
        collector.team_stats.values(),
        key=lambda t: (t.win_rate, t.games_played),
        reverse=True
    )

    print("\n🏆 Top 10 Teams by Win Rate:")
    for team in sorted_teams[:10]:
        if team.games_played >= 5:  # Minimum games filter
            print(f"  {team.team_name}: {team.win_rate:.1%} ({team.wins}W-{team.losses}L)")


if __name__ == "__main__":
    main()
