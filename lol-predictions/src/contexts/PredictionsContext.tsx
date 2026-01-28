import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { UserPrediction } from '../types';
import { fetchPredictions, getPredictions } from '../services/predictions';
import { useAuth } from './AuthContext';

interface PredictionsContextType {
  predictions: Map<string, UserPrediction>;
  isLoading: boolean;
  getPrediction: (matchId: string) => UserPrediction | undefined;
  setPrediction: (prediction: UserPrediction) => void;
  refreshPredictions: () => Promise<void>;
}

const PredictionsContext = createContext<PredictionsContextType | null>(null);

export function PredictionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, accessToken } = useAuth();
  const [predictions, setPredictions] = useState<Map<string, UserPrediction>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const loadPredictions = useCallback(async () => {
    setIsLoading(true);
    try {
      let predictionsList: UserPrediction[];

      if (isAuthenticated && accessToken) {
        predictionsList = await fetchPredictions(accessToken);
      } else {
        predictionsList = getPredictions();
      }

      // Convert to map for O(1) lookups
      const predictionsMap = new Map<string, UserPrediction>();
      for (const pred of predictionsList) {
        predictionsMap.set(pred.matchId, pred);
      }
      setPredictions(predictionsMap);
    } catch (error) {
      console.error('Failed to load predictions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, accessToken]);

  // Load predictions on mount and when auth changes
  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  const getPrediction = useCallback((matchId: string): UserPrediction | undefined => {
    return predictions.get(matchId);
  }, [predictions]);

  const setPrediction = useCallback((prediction: UserPrediction) => {
    setPredictions(prev => {
      const next = new Map(prev);
      next.set(prediction.matchId, prediction);
      return next;
    });
  }, []);

  return (
    <PredictionsContext.Provider
      value={{
        predictions,
        isLoading,
        getPrediction,
        setPrediction,
        refreshPredictions: loadPredictions,
      }}
    >
      {children}
    </PredictionsContext.Provider>
  );
}

export function usePredictions() {
  const context = useContext(PredictionsContext);
  if (!context) {
    throw new Error('usePredictions must be used within a PredictionsProvider');
  }
  return context;
}
