import { useState, useEffect, useCallback } from 'react';
import type { ScheduleEvent, UserPrediction } from '../types';
import { savePrediction, savePredictionToApi } from '../services/predictions';
import { usePredictions } from '../contexts/PredictionsContext';

interface UseMatchPredictionOptions {
  event: ScheduleEvent;
  isAuthenticated: boolean;
  accessToken: string | null;
  onPredictionMade?: () => void;
}

export function useMatchPrediction({
  event,
  isAuthenticated,
  accessToken,
  onPredictionMade,
}: UseMatchPredictionOptions) {
  const { match } = event;
  const [team1, team2] = match?.teams || [];
  const { getPrediction: getCachedPrediction, setPrediction: setCachedPrediction } = usePredictions();

  const [winner, setWinner] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<UserPrediction | null>(null);
  const [saving, setSaving] = useState(false);

  // Load existing prediction from context (no API call needed)
  useEffect(() => {
    if (!match?.id) return;

    const pred = getCachedPrediction(match.id);
    if (pred) {
      setWinner(pred.predictedWinner);
      setScore(pred.predictedScore);
      setPrediction(pred);
    }
  }, [match?.id, getCachedPrediction]);

  // Normalize score based on selected team
  const normalizeScore = (rawScore: string, selectedTeam: string): string => {
    if (selectedTeam === team2?.code) {
      const [w, l] = rawScore.split('-');
      return `${l}-${w}`;
    }
    return rawScore;
  };

  // Check if score option matches selection
  const isScoreSelected = useCallback((baseScore: string): boolean => {
    if (!score || !winner) return false;
    const [w, l] = baseScore.split('-');
    return score === baseScore || score === `${l}-${w}`;
  }, [score, winner]);

  // Save prediction
  const save = async (selectedWinner: string, selectedScore: string) => {
    if (saving) return;

    // Validate all required fields (use match.id as fallback for eventId)
    const payload = {
      matchId: match?.id,
      eventId: event?.id || match?.id,
      team1Code: team1?.code,
      team2Code: team2?.code,
      predictedWinner: selectedWinner,
      predictedScore: normalizeScore(selectedScore, selectedWinner),
    };

    // Check for missing fields
    const missingFields = Object.entries(payload)
      .filter(([_, v]) => !v)
      .map(([k]) => k);

    if (missingFields.length > 0) {
      console.error('Missing fields:', missingFields, payload);
      return;
    }

    const finalScore = payload.predictedScore;
    setSaving(true);

    try {
      let saved: UserPrediction;

      if (isAuthenticated && accessToken) {
        saved = await savePredictionToApi(accessToken, {
          matchId: payload.matchId!,
          eventId: payload.eventId!,
          team1Code: payload.team1Code!,
          team2Code: payload.team2Code!,
          predictedWinner: selectedWinner,
          predictedScore: finalScore,
        });
      } else {
        saved = {
          id: prediction?.id || `pred_${Date.now()}`,
          matchId: payload.matchId!,
          eventId: payload.eventId!,
          team1Code: payload.team1Code!,
          team2Code: payload.team2Code!,
          predictedWinner: selectedWinner,
          predictedScore: finalScore,
          createdAt: prediction?.createdAt || new Date().toISOString(),
        };
        savePrediction(saved);
      }

      setScore(finalScore);
      setPrediction(saved);
      setCachedPrediction(saved);
      onPredictionMade?.();
    } catch (err) {
      console.error('Failed to save prediction:', err);
    } finally {
      setSaving(false);
    }
  };

  // Select team
  const selectTeam = async (teamCode: string) => {
    if (saving) return;
    setWinner(teamCode);

    if (score) {
      const [a, b] = score.split('-').map(Number);
      const baseScore = `${Math.max(a, b)}-${Math.min(a, b)}`;
      await save(teamCode, baseScore);
    }
  };

  // Select score
  const selectScore = async (rawScore: string) => {
    if (!winner || saving) return;
    await save(winner, rawScore);
  };

  return {
    winner,
    score,
    prediction,
    saving,
    selectTeam,
    selectScore,
    isScoreSelected,
  };
}
