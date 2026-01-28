import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { PredictionsProvider } from './contexts/PredictionsContext'
import './index.css'
import App from './App'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { UserProfile } from './pages/UserProfile'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PredictionsProvider>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/user/:username" element={<UserProfile />} />
          </Routes>
        </PredictionsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
