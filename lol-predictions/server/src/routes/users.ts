import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { updateProfile } from '../services/authService.js';
import { getPublicProfile, getUserCompletedPredictions } from '../services/userService.js';

const router = Router();

// GET /api/users/:username - Get public profile
router.get('/:username', (req: Request, res: Response) => {
  try {
    const username = req.params.username as string;
    const profile = getPublicProfile(username);

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users/:username/predictions - Get user's completed predictions
router.get('/:username/predictions', (req: Request, res: Response) => {
  try {
    const username = req.params.username as string;
    const predictions = getUserCompletedPredictions(username);

    if (predictions === null) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ predictions });
  } catch (error) {
    console.error('Get user predictions error:', error);
    res.status(500).json({ error: 'Failed to get predictions' });
  }
});

// PUT /api/users/profile - Update own profile
router.put('/profile', authenticateToken, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { displayName, bio } = req.body;

    // Validate inputs
    if (displayName !== undefined && displayName.length > 50) {
      res.status(400).json({ error: 'Display name must be 50 characters or less' });
      return;
    }

    if (bio !== undefined && bio.length > 500) {
      res.status(400).json({ error: 'Bio must be 500 characters or less' });
      return;
    }

    const user = updateProfile(req.user.userId, { displayName, bio });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
