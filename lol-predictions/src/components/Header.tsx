import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="header-content">
        <Link to="/" className="logo">
          <h1>LoL Esports Predictions</h1>
        </Link>

        <nav className="nav">
          {isAuthenticated ? (
            <>
              <Link to={`/user/${user?.username}`} className="nav-link profile-link">
                <span className="avatar">
                  {(user?.displayName || user?.username || 'U').charAt(0).toUpperCase()}
                </span>
                <span className="username">{user?.displayName || user?.username}</span>
              </Link>
              <button onClick={handleLogout} className="nav-btn logout-btn">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-btn login-btn">
                Login
              </Link>
              <Link to="/register" className="nav-btn register-btn">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
      <p className="header-subtitle">Pick winners and predict scores for upcoming matches</p>
    </header>
  );
}
