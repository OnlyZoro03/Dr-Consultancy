import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import CompleteProfile from './pages/CompleteProfile';
import ReportAnalysis from './pages/ReportAnalysis';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import AIChatbot from './components/AIChatbot';
import VoiceTriageAssistant from './components/VoiceTriageAssistant';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="font-sans text-gray-900 antialiased">
          <AIChatbot />
          <VoiceTriageAssistant />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
              <Route path="/patient-dashboard" element={<PatientDashboard />} />
              <Route path="/report-analysis" element={<ReportAnalysis />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
              <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/complete-profile" element={<CompleteProfile />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
