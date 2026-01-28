import { Router } from 'express';
import { getCachedSchedule, getCachedLeagues, getCacheLastUpdated } from '../services/esportsService.js';

const router = Router();

router.get('/schedule', (_req, res) => {
  const events = getCachedSchedule();
  const lastUpdated = getCacheLastUpdated('schedule');

  if (events.length === 0 && !lastUpdated) {
    return res.status(503).json({
      error: 'Schedule data not yet available. Server is still warming up.',
    });
  }

  res.json({ events, lastUpdated });
});

router.get('/leagues', (_req, res) => {
  const leagues = getCachedLeagues();
  const lastUpdated = getCacheLastUpdated('leagues');

  if (leagues.length === 0 && !lastUpdated) {
    return res.status(503).json({
      error: 'League data not yet available. Server is still warming up.',
    });
  }

  res.json({ leagues, lastUpdated });
});

export default router;
