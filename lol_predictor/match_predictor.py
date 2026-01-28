"""
LoL Esports Match Prediction Tracker
Users make predictions on match winners and scores, then track accuracy.
"""

import json
import os
from datetime import datetime
from typing import Optional, List, Dict
from dataclasses import dataclass, asdict
from api_client import LoLEsportsAPI


@dataclass
class UserPrediction:
    """A user's prediction for a match."""
    prediction_id: str
    match_id: str
    match_date: str
    team1_code: str
    team1_name: str
    team2_code: str
    team2_name: str
    predicted_winner: str  # team code
    predicted_score: str   # e.g., "2-1", "3-0"
    created_at: str
    # Results (filled in after match completes)
    actual_winner: Optional[str] = None
    actual_score: Optional[str] = None
    winner_correct: Optional[bool] = None
    score_correct: Optional[bool] = None


class PredictionTracker:
    """Tracks user predictions and compares against actual results."""

    def __init__(self, data_dir: str = "data"):
        self.api = LoLEsportsAPI()
        self.data_dir = data_dir
        self.predictions: List[UserPrediction] = []
        os.makedirs(data_dir, exist_ok=True)
        self.load_predictions()

    def get_upcoming_matches(self, league_slug: Optional[str] = None) -> List[Dict]:
        """Get upcoming matches that can be predicted."""
        leagues = self.api.get_leagues()

        if league_slug:
            league = next((l for l in leagues if l.get("slug") == league_slug), None)
            if not league:
                return []
            schedule = self.api.get_schedule(league_id=league["id"])
        else:
            schedule = self.api.get_schedule()

        events = schedule.get("events", [])
        upcoming = []

        for event in events:
            state = event.get("state", "")
            if state in ["unstarted", "inProgress"]:
                match = event.get("match", {})
                teams = match.get("teams", [])
                if len(teams) >= 2:
                    upcoming.append({
                        "match_id": match.get("id", ""),
                        "event_id": event.get("id", ""),
                        "start_time": event.get("startTime", ""),
                        "state": state,
                        "league": event.get("league", {}).get("name", "Unknown"),
                        "block_name": event.get("blockName", ""),
                        "team1": {
                            "code": teams[0].get("code", ""),
                            "name": teams[0].get("name", ""),
                            "image": teams[0].get("image", "")
                        },
                        "team2": {
                            "code": teams[1].get("code", ""),
                            "name": teams[1].get("name", ""),
                            "image": teams[1].get("image", "")
                        },
                        "strategy": match.get("strategy", {})
                    })

        return upcoming

    def get_recent_results(self, league_slug: Optional[str] = None, limit: int = 20) -> List[Dict]:
        """Get recent match results."""
        leagues = self.api.get_leagues()

        if league_slug:
            league = next((l for l in leagues if l.get("slug") == league_slug), None)
            if not league:
                return []
            schedule = self.api.get_schedule(league_id=league["id"])
        else:
            schedule = self.api.get_schedule()

        events = schedule.get("events", [])
        completed = []

        for event in events:
            state = event.get("state", "")
            if state == "completed":
                match = event.get("match", {})
                teams = match.get("teams", [])
                if len(teams) >= 2:
                    t1 = teams[0]
                    t2 = teams[1]

                    t1_wins = t1.get("result", {}).get("gameWins", 0)
                    t2_wins = t2.get("result", {}).get("gameWins", 0)

                    winner_code = t1.get("code") if t1.get("result", {}).get("outcome") == "win" else t2.get("code")

                    completed.append({
                        "match_id": match.get("id", ""),
                        "start_time": event.get("startTime", ""),
                        "league": event.get("league", {}).get("name", "Unknown"),
                        "team1_code": t1.get("code", ""),
                        "team1_name": t1.get("name", ""),
                        "team2_code": t2.get("code", ""),
                        "team2_name": t2.get("name", ""),
                        "winner_code": winner_code,
                        "score": f"{t1_wins}-{t2_wins}"
                    })

        return completed[:limit]

    def make_prediction(self, match: Dict, winner_code: str, score: str) -> UserPrediction:
        """Create a new prediction for a match."""
        prediction = UserPrediction(
            prediction_id=f"pred_{len(self.predictions) + 1}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            match_id=match["match_id"],
            match_date=match["start_time"],
            team1_code=match["team1"]["code"],
            team1_name=match["team1"]["name"],
            team2_code=match["team2"]["code"],
            team2_name=match["team2"]["name"],
            predicted_winner=winner_code,
            predicted_score=score,
            created_at=datetime.now().isoformat()
        )

        self.predictions.append(prediction)
        self.save_predictions()
        return prediction

    def update_prediction_results(self):
        """Check completed matches and update prediction results."""
        recent_results = self.get_recent_results(limit=50)
        results_map = {r["match_id"]: r for r in recent_results}

        updated = 0
        for pred in self.predictions:
            if pred.actual_winner is None and pred.match_id in results_map:
                result = results_map[pred.match_id]
                pred.actual_winner = result["winner_code"]
                pred.actual_score = result["score"]
                pred.winner_correct = pred.predicted_winner == result["winner_code"]
                pred.score_correct = pred.predicted_score == result["score"]
                updated += 1

        if updated > 0:
            self.save_predictions()
            print(f"Updated {updated} prediction(s) with results")

        return updated

    def get_stats(self) -> Dict:
        """Get prediction statistics."""
        total = len(self.predictions)
        completed = [p for p in self.predictions if p.actual_winner is not None]
        pending = total - len(completed)

        if not completed:
            return {
                "total_predictions": total,
                "completed": 0,
                "pending": pending,
                "winner_correct": 0,
                "winner_accuracy": 0.0,
                "score_correct": 0,
                "score_accuracy": 0.0
            }

        winner_correct = sum(1 for p in completed if p.winner_correct)
        score_correct = sum(1 for p in completed if p.score_correct)

        return {
            "total_predictions": total,
            "completed": len(completed),
            "pending": pending,
            "winner_correct": winner_correct,
            "winner_accuracy": winner_correct / len(completed) * 100,
            "score_correct": score_correct,
            "score_accuracy": score_correct / len(completed) * 100
        }

    def save_predictions(self):
        """Save predictions to file."""
        filepath = os.path.join(self.data_dir, "predictions.json")
        data = [asdict(p) for p in self.predictions]
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def load_predictions(self):
        """Load predictions from file."""
        filepath = os.path.join(self.data_dir, "predictions.json")
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.predictions = [UserPrediction(**p) for p in data]


def display_matches(matches: List[Dict]):
    """Display upcoming matches."""
    print("\n" + "=" * 60)
    print("UPCOMING MATCHES")
    print("=" * 60)

    for i, match in enumerate(matches, 1):
        t1 = match["team1"]["code"]
        t2 = match["team2"]["code"]
        league = match["league"]
        state = "[LIVE]" if match["state"] == "inProgress" else ""
        time_str = match["start_time"][:10] if match["start_time"] else "TBD"

        print(f"\n  [{i}] {t1} vs {t2}  {state}")
        print(f"      League: {league}")
        print(f"      Date: {time_str}")

        strategy = match.get("strategy", {})
        match_type = strategy.get("type", "")
        count = strategy.get("count", 0)
        if match_type == "bestOf":
            print(f"      Format: Best of {count}")


def display_predictions(predictions: List[UserPrediction]):
    """Display user's predictions."""
    print("\n" + "=" * 60)
    print("YOUR PREDICTIONS")
    print("=" * 60)

    for pred in predictions[-10:]:  # Show last 10
        status = ""
        if pred.actual_winner:
            if pred.winner_correct and pred.score_correct:
                status = "[PERFECT]"
            elif pred.winner_correct:
                status = "[WINNER OK]"
            else:
                status = "[WRONG]"
        else:
            status = "[PENDING]"

        print(f"\n  {pred.team1_code} vs {pred.team2_code} {status}")
        print(f"    Your pick: {pred.predicted_winner} ({pred.predicted_score})")
        if pred.actual_winner:
            print(f"    Actual:    {pred.actual_winner} ({pred.actual_score})")


def main():
    """Main interactive loop."""
    tracker = PredictionTracker(data_dir="data")

    print("=" * 60)
    print("LoL ESPORTS MATCH PREDICTOR")
    print("=" * 60)

    while True:
        print("\n[1] View upcoming matches")
        print("[2] Make a prediction")
        print("[3] View my predictions")
        print("[4] Check results & stats")
        print("[5] Quit")

        choice = input("\nSelect option: ").strip()

        if choice == "1":
            print("\nFetching upcoming matches...")
            matches = tracker.get_upcoming_matches()
            if matches:
                display_matches(matches[:15])
            else:
                print("No upcoming matches found")

        elif choice == "2":
            print("\nFetching upcoming matches...")
            matches = tracker.get_upcoming_matches()

            if not matches:
                print("No upcoming matches to predict")
                continue

            display_matches(matches[:10])

            try:
                match_num = int(input("\nSelect match number: ").strip()) - 1
                if match_num < 0 or match_num >= len(matches):
                    print("Invalid match number")
                    continue

                match = matches[match_num]
                t1 = match["team1"]["code"]
                t2 = match["team2"]["code"]

                print(f"\n{t1} vs {t2}")
                print(f"  [1] {t1} wins")
                print(f"  [2] {t2} wins")

                winner_choice = input("Pick winner (1 or 2): ").strip()
                if winner_choice == "1":
                    winner = t1
                elif winner_choice == "2":
                    winner = t2
                else:
                    print("Invalid choice")
                    continue

                score = input("Predict score (e.g., 2-1, 3-0): ").strip()
                if not score or "-" not in score:
                    print("Invalid score format")
                    continue

                pred = tracker.make_prediction(match, winner, score)
                print(f"\nPrediction saved: {winner} to win {score}")

            except ValueError:
                print("Invalid input")

        elif choice == "3":
            if tracker.predictions:
                display_predictions(tracker.predictions)
            else:
                print("\nNo predictions yet")

        elif choice == "4":
            print("\nChecking for results...")
            tracker.update_prediction_results()

            stats = tracker.get_stats()
            print("\n" + "=" * 40)
            print("YOUR STATS")
            print("=" * 40)
            print(f"  Total predictions: {stats['total_predictions']}")
            print(f"  Completed:         {stats['completed']}")
            print(f"  Pending:           {stats['pending']}")
            print(f"  Winner correct:    {stats['winner_correct']} ({stats['winner_accuracy']:.1f}%)")
            print(f"  Score correct:     {stats['score_correct']} ({stats['score_accuracy']:.1f}%)")

        elif choice == "5":
            print("\nGoodbye!")
            break

        else:
            print("Invalid option")


if __name__ == "__main__":
    main()
