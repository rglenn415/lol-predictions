import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getUserPredictions,
  createOrUpdatePrediction,
  deletePrediction,
  migratePredictions,
  getPredictionByMatch,
  updatePredictionResult,
} from '../services/predictionService.js';

const router = Router();

// GET /api/predictions - Get all predictions for current user
router.get('/', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const predictions = getUserPredictions(req.user.userId);
    res.json({ predictions });
  } catch (error) {
    console.error('Get predictions error:', error);
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

// GET /api/predictions/:matchId - Get prediction for specific match
router.get('/:matchId', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const matchId = req.params.matchId as string;
    const prediction = getPredictionByMatch(req.user.userId, matchId);
    if (!prediction) {
      res.status(404).json({ error: 'Prediction not found' });
      return;
    }

    res.json({ prediction });
  } catch (error) {
    console.error('Get prediction error:', error);
    res.status(500).json({ error: 'Failed to get prediction' });
  }
});

// POST /api/predictions - Create or update prediction
router.post('/', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { matchId, eventId, team1Code, team2Code, predictedWinner, predictedScore } = req.body;

    if (!matchId || !eventId || !team1Code || !team2Code || !predictedWinner || !predictedScore) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const prediction = createOrUpdatePrediction(req.user.userId, {
      matchId,
      eventId,
      team1Code,
      team2Code,
      predictedWinner,
      predictedScore,
    });

    res.json({ prediction });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save prediction';
    res.status(400).json({ error: message });
  }
});

// DELETE /api/predictions/:matchId - Delete prediction
router.delete('/:matchId', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const matchId = req.params.matchId as string;
    const deleted = deletePrediction(req.user.userId, matchId);
    if (!deleted) {
      res.status(404).json({ error: 'Prediction not found' });
      return;
    }

    res.json({ message: 'Prediction deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete prediction';
    res.status(400).json({ error: message });
  }
});

// POST /api/predictions/migrate - Import predictions from localStorage
router.post('/migrate', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { predictions } = req.body;

    if (!Array.isArray(predictions)) {
      res.status(400).json({ error: 'predictions must be an array' });
      return;
    }

    const result = migratePredictions(req.user.userId, predictions);
    res.json(result);
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Failed to migrate predictions' });
  }
});

// POST /api/predictions/:matchId/result - Update prediction with match result
router.post('/:matchId/result', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { actualWinner, actualScore } = req.body;

    if (!actualWinner || !actualScore) {
      res.status(400).json({ error: 'actualWinner and actualScore required' });
      return;
    }

    const matchId = req.params.matchId as string;
    const prediction = updatePredictionResult(
      req.user.userId,
      matchId,
      actualWinner,
      actualScore
    );

    if (!prediction) {
      res.status(404).json({ error: 'Prediction not found' });
      return;
    }

    res.json({ prediction });
  } catch (error) {
    console.error('Update result error:', error);
    res.status(500).json({ error: 'Failed to update result' });
  }
});

export default router;
