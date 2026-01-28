"""
LoL Esports Match Predictor
Uses collected match data to predict match outcomes.
"""

import json
import os
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import math
from collections import defaultdict
from data_collector import MatchRecord, TeamStats, DataCollector


@dataclass
class Prediction:
    """Prediction result for a match."""
    team1_name: str
    team2_name: str
    predicted_winner: str
    team1_win_probability: float
    team2_win_probability: float
    confidence: str  # "low", "medium", "high"
    factors: Dict[str, float]


class EloRating:
    """Elo rating system for teams."""

    def __init__(self, k_factor: float = 32, initial_rating: float = 1500):
        self.k_factor = k_factor
        self.initial_rating = initial_rating
        self.ratings: Dict[str, float] = {}

    def get_rating(self, team_id: str) -> float:
        """Get team's current Elo rating."""
        return self.ratings.get(team_id, self.initial_rating)

    def expected_score(self, rating_a: float, rating_b: float) -> float:
        """Calculate expected score for team A against team B."""
        return 1 / (1 + math.pow(10, (rating_b - rating_a) / 400))

    def update_ratings(self, winner_id: str, loser_id: str, score_margin: float = 1.0):
        """Update ratings after a match."""
        winner_rating = self.get_rating(winner_id)
        loser_rating = self.get_rating(loser_id)

        expected_winner = self.expected_score(winner_rating, loser_rating)
        expected_loser = self.expected_score(loser_rating, winner_rating)

        # Adjust K-factor based on score margin
        adjusted_k = self.k_factor * (1 + 0.1 * score_margin)

        self.ratings[winner_id] = winner_rating + adjusted_k * (1 - expected_winner)
        self.ratings[loser_id] = loser_rating + adjusted_k * (0 - expected_loser)

    def predict(self, team1_id: str, team2_id: str) -> Tuple[float, float]:
        """Predict win probabilities for both teams."""
        r1 = self.get_rating(team1_id)
        r2 = self.get_rating(team2_id)

        p1 = self.expected_score(r1, r2)
        p2 = self.expected_score(r2, r1)

        return p1, p2


class HeadToHead:
    """Head-to-head record tracking."""

    def __init__(self):
        self.records: Dict[str, Dict[str, Tuple[int, int]]] = defaultdict(dict)

    def add_result(self, team1_id: str, team2_id: str, team1_won: bool):
        """Record a match result."""
        key = tuple(sorted([team1_id, team2_id]))
        t1, t2 = key

        if t2 not in self.records[t1]:
            self.records[t1][t2] = (0, 0)

        w, l = self.records[t1][t2]
        if (team1_id == t1 and team1_won) or (team1_id == t2 and not team1_won):
            self.records[t1][t2] = (w + 1, l)
        else:
            self.records[t1][t2] = (w, l + 1)

    def get_record(self, team1_id: str, team2_id: str) -> Tuple[int, int]:
        """Get head-to-head record (team1 wins, team2 wins)."""
        key = tuple(sorted([team1_id, team2_id]))
        t1, t2 = key

        if t2 not in self.records[t1]:
            return (0, 0)

        w, l = self.records[t1][t2]
        if team1_id == t1:
            return (w, l)
        return (l, w)


class MatchPredictor:
    """Predicts match outcomes using multiple factors."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.elo = EloRating()
        self.h2h = HeadToHead()
        self.team_stats: Dict[str, TeamStats] = {}
        self.team_names: Dict[str, str] = {}  # id -> name mapping

    def train(self, matches: List[MatchRecord]):
        """Train the predictor on historical match data."""
        print("🎓 Training predictor...")

        # Sort matches by date for chronological processing
        sorted_matches = sorted(matches, key=lambda m: m.date)

        correct_predictions = 0
        total_predictions = 0

        for match in sorted_matches:
            # Store team names
            self.team_names[match.team1_id] = match.team1_name
            self.team_names[match.team2_id] = match.team2_name

            # Make prediction before seeing result (for validation)
            if total_predictions > 20:  # Need some data first
                pred = self._predict_internal(match.team1_id, match.team2_id)
                if pred:
                    predicted_winner = match.team1_id if pred[0] > pred[1] else match.team2_id
                    if predicted_winner == match.winner_id:
                        correct_predictions += 1
                    total_predictions += 1

            # Update Elo ratings
            team1_won = match.winner_id == match.team1_id
            score_margin = abs(match.team1_score - match.team2_score)

            if team1_won:
                self.elo.update_ratings(match.team1_id, match.team2_id, score_margin)
            else:
                self.elo.update_ratings(match.team2_id, match.team1_id, score_margin)

            # Update head-to-head
            self.h2h.add_result(match.team1_id, match.team2_id, team1_won)

        # Load team stats
        collector = DataCollector(self.data_dir)
        _, self.team_stats = collector.load_data()

        if total_predictions > 0:
            accuracy = correct_predictions / total_predictions
            print(f"✅ Training complete! Validation accuracy: {accuracy:.1%}")
        else:
            print("✅ Training complete!")

    def _predict_internal(self, team1_id: str, team2_id: str) -> Optional[Tuple[float, float]]:
        """Internal prediction without formatting."""
        if team1_id not in self.elo.ratings and team2_id not in self.elo.ratings:
            return None

        return self.elo.predict(team1_id, team2_id)

    def predict(self, team1_id: str, team2_id: str) -> Prediction:
        """Predict match outcome with detailed factors."""
        factors = {}

        # Elo-based prediction
        elo_p1, elo_p2 = self.elo.predict(team1_id, team2_id)
        factors["elo"] = elo_p1

        # Head-to-head
        h2h_record = self.h2h.get_record(team1_id, team2_id)
        h2h_games = sum(h2h_record)
        if h2h_games > 0:
            h2h_factor = h2h_record[0] / h2h_games
            factors["head_to_head"] = h2h_factor
        else:
            h2h_factor = 0.5

        # Recent form
        if team1_id in self.team_stats and team2_id in self.team_stats:
            t1_wr = self.team_stats[team1_id].win_rate
            t2_wr = self.team_stats[team2_id].win_rate
            form_factor = t1_wr / (t1_wr + t2_wr) if (t1_wr + t2_wr) > 0 else 0.5
            factors["win_rate"] = form_factor
        else:
            form_factor = 0.5

        # Combine factors (weighted average)
        weights = {
            "elo": 0.5,
            "head_to_head": 0.25,
            "win_rate": 0.25
        }

        team1_prob = (
            weights["elo"] * elo_p1 +
            weights["head_to_head"] * h2h_factor +
            weights["win_rate"] * form_factor
        )
        team2_prob = 1 - team1_prob

        # Determine confidence
        prob_diff = abs(team1_prob - team2_prob)
        if prob_diff > 0.3:
            confidence = "high"
        elif prob_diff > 0.15:
            confidence = "medium"
        else:
            confidence = "low"

        predicted_winner = self.team_names.get(team1_id, team1_id) if team1_prob > team2_prob else self.team_names.get(team2_id, team2_id)

        return Prediction(
            team1_name=self.team_names.get(team1_id, team1_id),
            team2_name=self.team_names.get(team2_id, team2_id),
            predicted_winner=predicted_winner,
            team1_win_probability=team1_prob,
            team2_win_probability=team2_prob,
            confidence=confidence,
            factors=factors
        )

    def find_team_id(self, name_or_code: str) -> Optional[str]:
        """Find team ID by name or code."""
        name_lower = name_or_code.lower()
        for team_id, team_name in self.team_names.items():
            if name_lower in team_name.lower():
                return team_id
        return None

    def get_team_rankings(self, top_n: int = 20) -> List[Tuple[str, float]]:
        """Get top teams by Elo rating."""
        sorted_ratings = sorted(
            self.elo.ratings.items(),
            key=lambda x: x[1],
            reverse=True
        )

        return [
            (self.team_names.get(team_id, team_id), rating)
            for team_id, rating in sorted_ratings[:top_n]
        ]

    def save_model(self, filename: str = "model.json"):
        """Save trained model."""
        filepath = os.path.join(self.data_dir, filename)

        model_data = {
            "elo_ratings": self.elo.ratings,
            "team_names": self.team_names,
            "h2h_records": {k: dict(v) for k, v in self.h2h.records.items()}
        }

        with open(filepath, "w") as f:
            json.dump(model_data, f, indent=2)

        print(f"💾 Model saved to {filepath}")

    def load_model(self, filename: str = "model.json") -> bool:
        """Load trained model."""
        filepath = os.path.join(self.data_dir, filename)

        if not os.path.exists(filepath):
            return False

        with open(filepath, "r") as f:
            model_data = json.load(f)

        self.elo.ratings = model_data.get("elo_ratings", {})
        self.team_names = model_data.get("team_names", {})

        # Reconstruct h2h records
        h2h_data = model_data.get("h2h_records", {})
        for k, v in h2h_data.items():
            for k2, record in v.items():
                self.h2h.records[k][k2] = tuple(record)

        print(f"✅ Model loaded from {filepath}")
        return True


def main():
    """Demo the predictor."""
    predictor = MatchPredictor(data_dir="data")

    # Try to load existing model
    if predictor.load_model():
        print("Using saved model")
    else:
        # Train from collected data
        collector = DataCollector(data_dir="data")
        matches, _ = collector.load_data()

        if not matches:
            print("❌ No match data found. Run data_collector.py first!")
            return

        predictor.train(matches)
        predictor.save_model()

    # Show team rankings
    print("\n" + "=" * 60)
    print("🏆 Team Power Rankings (by Elo)")
    print("=" * 60)

    rankings = predictor.get_team_rankings(15)
    for i, (team_name, rating) in enumerate(rankings, 1):
        print(f"  {i:2}. {team_name}: {rating:.0f}")

    # Interactive prediction
    print("\n" + "=" * 60)
    print("🔮 Match Predictor")
    print("=" * 60)

    while True:
        print("\nEnter two team names to predict (or 'quit' to exit):")
        team1_input = input("Team 1: ").strip()

        if team1_input.lower() == 'quit':
            break

        team2_input = input("Team 2: ").strip()

        team1_id = predictor.find_team_id(team1_input)
        team2_id = predictor.find_team_id(team2_input)

        if not team1_id:
            print(f"❌ Team '{team1_input}' not found")
            continue
        if not team2_id:
            print(f"❌ Team '{team2_input}' not found")
            continue

        prediction = predictor.predict(team1_id, team2_id)

        print(f"\n{'─' * 40}")
        print(f"📊 {prediction.team1_name} vs {prediction.team2_name}")
        print(f"{'─' * 40}")
        print(f"🏆 Predicted Winner: {prediction.predicted_winner}")
        print(f"📈 {prediction.team1_name}: {prediction.team1_win_probability:.1%}")
        print(f"📉 {prediction.team2_name}: {prediction.team2_win_probability:.1%}")
        print(f"🎯 Confidence: {prediction.confidence.upper()}")

        if "head_to_head" in prediction.factors:
            h2h = predictor.h2h.get_record(team1_id, team2_id)
            print(f"⚔️  Head-to-head: {h2h[0]}-{h2h[1]}")


if __name__ == "__main__":
    main()
