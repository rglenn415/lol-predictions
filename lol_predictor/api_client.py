"""
LoL Esports API Client
Pulls data from the unofficial LoL Esports API for match predictions.
"""

import requests
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
import time


class LoLEsportsAPI:
    """Client for the LoL Esports API."""

    BASE_URL = "https://esports-api.lolesports.com/persisted/gw"
    FEED_URL = "https://feed.lolesports.com/livestats/v1"

    def __init__(self, locale: str = "en-US"):
        self.locale = locale
        self.session = requests.Session()
        self.session.headers.update({
            "x-api-key": "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z",
            "Accept": "application/json"
        })

    def _get(self, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """Make a GET request to the API."""
        if params is None:
            params = {}
        params["hl"] = self.locale

        url = f"{self.BASE_URL}/{endpoint}"
        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def get_leagues(self) -> List[Dict]:
        """Get all available leagues (LCS, LEC, LCK, LPL, etc.)."""
        data = self._get("getLeagues")
        return data.get("data", {}).get("leagues", [])

    def get_tournaments_for_league(self, league_id: str) -> List[Dict]:
        """Get tournaments for a specific league."""
        data = self._get("getTournamentsForLeague", {"leagueId": league_id})
        leagues = data.get("data", {}).get("leagues", [])
        if leagues:
            return leagues[0].get("tournaments", [])
        return []

    def get_schedule(self, league_id: Optional[str] = None, page_token: Optional[str] = None) -> Dict:
        """Get match schedule. Can filter by league."""
        params = {}
        if league_id:
            params["leagueId"] = league_id
        if page_token:
            params["pageToken"] = page_token

        data = self._get("getSchedule", params)
        return data.get("data", {}).get("schedule", {})

    def get_completed_events(self, tournament_id: str) -> List[Dict]:
        """Get completed events/matches for a tournament."""
        data = self._get("getCompletedEvents", {"tournamentId": tournament_id})
        schedule = data.get("data", {}).get("schedule", {})
        return schedule.get("events", [])

    def get_event_details(self, match_id: str) -> Dict:
        """Get detailed information about a specific match."""
        data = self._get("getEventDetails", {"id": match_id})
        return data.get("data", {}).get("event", {})

    def get_standings(self, tournament_id: str) -> List[Dict]:
        """Get standings for a tournament."""
        data = self._get("getStandings", {"tournamentId": tournament_id})
        return data.get("data", {}).get("standings", [])

    def get_teams(self, team_slug: Optional[str] = None) -> List[Dict]:
        """Get team information."""
        params = {}
        if team_slug:
            params["id"] = team_slug
        data = self._get("getTeams", params)
        return data.get("data", {}).get("teams", [])

    def get_live_events(self) -> Dict:
        """Get currently live events."""
        data = self._get("getLive")
        return data.get("data", {})

    def get_game_window(self, game_id: str, starting_time: Optional[str] = None) -> Dict:
        """
        Get game state window (10-second interval snapshots).
        Includes objectives and player scoreboard data.
        """
        url = f"{self.FEED_URL}/window/{game_id}"
        params = {}
        if starting_time:
            params["startingTime"] = starting_time

        response = self.session.get(url, params=params)
        if response.status_code == 200:
            return response.json()
        return {}

    def get_game_details(self, game_id: str, starting_time: Optional[str] = None) -> Dict:
        """
        Get detailed game data.
        Includes champion levels, stats, CS, gold, ability sequences.
        """
        url = f"{self.FEED_URL}/details/{game_id}"
        params = {}
        if starting_time:
            params["startingTime"] = starting_time

        response = self.session.get(url, params=params)
        if response.status_code == 200:
            return response.json()
        return {}


def main():
    """Test the API client."""
    api = LoLEsportsAPI()

    print("=" * 60)
    print("LoL Esports API - Data Exploration")
    print("=" * 60)

    # Get all leagues
    print("\n[*] Fetching leagues...")
    leagues = api.get_leagues()
    print(f"Found {len(leagues)} leagues:\n")

    for league in leagues:
        print(f"  - {league.get('name')} (ID: {league.get('id')}, Slug: {league.get('slug')})")

    # Get tournaments for a major league (LCK for example)
    lck = next((l for l in leagues if l.get("slug") == "lck"), None)
    if lck:
        print(f"\n[*] Fetching tournaments for {lck['name']}...")
        tournaments = api.get_tournaments_for_league(lck["id"])
        print(f"Found {len(tournaments)} tournaments:\n")

        for t in tournaments[:5]:  # Show last 5
            print(f"  - {t.get('slug')} ({t.get('startDate')} to {t.get('endDate')})")

        if tournaments:
            # Get standings for the most recent tournament
            recent_tournament = tournaments[0]
            print(f"\n[*] Fetching standings for {recent_tournament['slug']}...")
            standings = api.get_standings(recent_tournament["id"])

            if standings:
                for stage in standings:
                    for section in stage.get("stages", []):
                        print(f"\n  Stage: {section.get('name', 'Unknown')}")
                        for sec in section.get("sections", []):
                            rankings = sec.get("rankings", [])
                            for rank in rankings[:5]:
                                teams = rank.get("teams", [])
                                for team in teams:
                                    record = team.get("record", {})
                                    print(f"    {rank.get('ordinal')}. {team.get('name')} - {record.get('wins', 0)}W {record.get('losses', 0)}L")

            # Get completed events
            print(f"\n[*] Fetching completed matches...")
            events = api.get_completed_events(recent_tournament["id"])
            print(f"Found {len(events)} completed matches\n")

            for event in events[:5]:
                match_info = event.get("match", {})
                teams = match_info.get("teams", [])
                if len(teams) >= 2:
                    t1 = teams[0]
                    t2 = teams[1]
                    winner = "TBD"
                    if t1.get("result", {}).get("outcome") == "win":
                        winner = t1.get("code")
                    elif t2.get("result", {}).get("outcome") == "win":
                        winner = t2.get("code")

                    print(f"  {t1.get('code')} vs {t2.get('code')} - Winner: {winner}")

    print("\n" + "=" * 60)
    print("API exploration complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
