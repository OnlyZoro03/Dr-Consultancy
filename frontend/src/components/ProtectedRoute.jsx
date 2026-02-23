import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles }) => {
    const { user } = useAuth();
    const location = useLocation();

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    // Allow users to access /complete-profile even if their profile is incomplete
    if (!user.is_profile_complete && location.pathname !== '/complete-profile') {
        return <Navigate to="/complete-profile" replace />;
    }

    // Redirect complete profiles away from /complete-profile if they try to access it
    if (user.is_profile_complete && location.pathname === '/complete-profile') {
        return <Navigate to={user.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard'} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
