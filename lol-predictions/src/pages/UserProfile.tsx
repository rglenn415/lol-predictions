import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { PublicProfile, CompletedPrediction } from '../types';
import { Stats } from '../components/Stats';
import './UserProfile.css';

export function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [predictions, setPredictions] = useState<CompletedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!username) return;

      setLoading(true);
      setError('');

      try {
        const [profileRes, predictionsRes] = await Promise.all([
          fetch(`/api/users/${username}`),
          fetch(`/api/users/${username}/predictions`),
        ]);

        if (!profileRes.ok) {
          if (profileRes.status === 404) {
            setError('User not found');
          } else {
            setError('Failed to load profile');
          }
          return;
        }

        const profileData = await profileRes.json();
        setProfile(profileData);

        if (predictionsRes.ok) {
          const predictionsData = await predictionsRes.json();
          setPredictions(predictionsData.predictions);
        }
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-page">
        <div className="profile-error">
          <h2>{error || 'Profile not found'}</h2>
          <Link to="/" className="back-link">Back to Home</Link>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar">
          {(profile.user.displayName || profile.user.username).charAt(0).toUpperCase()}
        </div>
        <div className="profile-info">
          <h1>{profile.user.displayName || profile.user.username}</h1>
          <p className="profile-username">@{profile.user.username}</p>
          {profile.user.bio && <p className="profile-bio">{profile.user.bio}</p>}
          <p className="profile-joined">Member since {formatDate(profile.user.createdAt)}</p>
        </div>
      </div>

      <Stats stats={profile.stats} />

      {predictions.length > 0 && (
        <div className="predictions-history">
          <h2>Prediction History</h2>
          <div className="predictions-list">
            {predictions.slice(0, 20).map(p => (
              <div
                key={p.matchId}
                className={`prediction-item ${p.isCorrectScore ? 'perfect' : p.isCorrectWinner ? 'correct' : 'wrong'}`}
              >
                <div className="prediction-teams">
                  <span className={p.actualWinner === p.team1Code ? 'winner' : ''}>
                    {p.team1Code}
                  </span>
                  <span className="vs">vs</span>
                  <span className={p.actualWinner === p.team2Code ? 'winner' : ''}>
                    {p.team2Code}
                  </span>
                </div>
                <div className="prediction-details">
                  <span className="predicted">
                    Predicted: {p.predictedWinner} {p.predictedScore}
                  </span>
                  <span className="actual">
                    Actual: {p.actualWinner} {p.actualScore}
                  </span>
                </div>
                <div className="prediction-result">
                  <span className="result-badge">
                    {p.isCorrectScore ? 'PERFECT' : p.isCorrectWinner ? 'CORRECT' : 'WRONG'}
                  </span>
                  <span className="points">+{p.pointsEarned} pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
