import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { auth, googleProvider } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync Firebase auth state with local state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          // Verify with backend and get local user data (role, username)
          const res = await api.post('/auth/firebase', { idToken });

          const userData = {
            token: idToken,
            role: res.data.user.role,
            username: res.data.user.username,
            user_id: res.data.user.id,
            is_profile_complete: res.data.user.is_profile_complete,
            gender: res.data.user.gender,
            age: res.data.user.age,
            height: res.data.user.height,
            weight: res.data.user.weight,
            phone_number: res.data.user.phone_number
          };

          localStorage.setItem('token', userData.token);
          localStorage.setItem('role', userData.role);
          localStorage.setItem('username', userData.username);
          localStorage.setItem('user_id', userData.user_id);
          localStorage.setItem('is_profile_complete', userData.is_profile_complete);
          localStorage.setItem('gender', userData.gender || '');
          localStorage.setItem('age', userData.age || '');
          localStorage.setItem('height', userData.height || '');
          localStorage.setItem('weight', userData.weight || '');
          localStorage.setItem('phone_number', userData.phone_number || '');

          setUser(userData);
        } catch (err) {
          console.error("Firebase sync error:", err);
          // Optional: clear local storage if sync fails
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('username');
          localStorage.removeItem('user_id');
          localStorage.removeItem('is_profile_complete');
          setUser(null);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      const res = await api.post('/auth/firebase', { idToken });

      const userData = {
        token: idToken,
        role: res.data.user.role,
        username: res.data.user.username,
        user_id: res.data.user.id,
        is_profile_complete: res.data.user.is_profile_complete,
        gender: res.data.user.gender,
        age: res.data.user.age,
        height: res.data.user.height,
        weight: res.data.user.weight,
        phone_number: res.data.user.phone_number
      };

      localStorage.setItem('token', userData.token);
      localStorage.setItem('role', userData.role);
      localStorage.setItem('username', userData.username);
      localStorage.setItem('user_id', userData.user_id);
      localStorage.setItem('is_profile_complete', userData.is_profile_complete);
      localStorage.setItem('gender', userData.gender || '');
      localStorage.setItem('age', userData.age || '');
      localStorage.setItem('height', userData.height || '');
      localStorage.setItem('weight', userData.weight || '');
      localStorage.setItem('phone_number', userData.phone_number || '');

      setUser(userData);
      return { success: true, role: userData.role };
    } catch (err) {
      console.error("Login error:", err);
      // Fallback for non-firebase users or if firebase fails
      try {
        const res = await api.post('/login', { email, password });
        const userData = {
          token: res.data.token,
          role: res.data.role,
          username: res.data.username,
          user_id: res.data.user_id,
          is_profile_complete: res.data.is_profile_complete,
          gender: res.data.gender,
          age: res.data.age,
          height: res.data.height,
          weight: res.data.weight,
          phone_number: res.data.phone_number
        };
        localStorage.setItem('token', userData.token);
        localStorage.setItem('role', userData.role);
        localStorage.setItem('username', userData.username);
        localStorage.setItem('user_id', userData.user_id);
        localStorage.setItem('is_profile_complete', userData.is_profile_complete);
        localStorage.setItem('gender', userData.gender || '');
        localStorage.setItem('age', userData.age || '');
        localStorage.setItem('height', userData.height || '');
        localStorage.setItem('weight', userData.weight || '');
        localStorage.setItem('phone_number', userData.phone_number || '');
        setUser(userData);
        return { success: true, role: userData.role };
      } catch (legacyErr) {
        return { success: false, message: err.message || 'Login failed' };
      }
    }
  };

  const register = async (userData) => {
    try {
      const { email, password, username, role } = userData;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const idToken = await userCredential.user.getIdToken();

      // Sync with backend to set role and username
      await api.post('/auth/firebase', {
        idToken,
        role,
        username
      });

      return { success: true };
    } catch (err) {
      console.error("Registration error:", err);
      return { success: false, message: err.message || 'Registration failed' };
    }
  };

  const loginWithGoogle = async (role = 'patient') => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Sync with backend (role will be used if creating new user)
      const res = await api.post('/auth/firebase', { idToken, role });

      const userData = {
        token: idToken,
        role: res.data.user.role,
        username: res.data.user.username,
        user_id: res.data.user.id,
        is_profile_complete: res.data.user.is_profile_complete,
        gender: res.data.user.gender,
        age: res.data.user.age,
        height: res.data.user.height,
        weight: res.data.user.weight,
        phone_number: res.data.user.phone_number
      };

      localStorage.setItem('token', userData.token);
      localStorage.setItem('role', userData.role);
      localStorage.setItem('username', userData.username);
      localStorage.setItem('user_id', userData.user_id);
      localStorage.setItem('is_profile_complete', userData.is_profile_complete);
      localStorage.setItem('gender', userData.gender || '');
      localStorage.setItem('age', userData.age || '');
      localStorage.setItem('height', userData.height || '');
      localStorage.setItem('weight', userData.weight || '');
      localStorage.setItem('phone_number', userData.phone_number || '');

      setUser(userData);
      return { success: true, role: userData.role };
    } catch (err) {
      console.error("Google Auth Error:", err);
      return { success: false, message: err.message || 'Google Sign-In failed' };
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const res = await api.put('/user/profile', profileData);
      const updatedUser = {
        ...user,
        username: res.data.user.username,
        is_profile_complete: res.data.user.is_profile_complete,
        gender: res.data.user.gender,
        age: res.data.user.age,
        height: res.data.user.height,
        weight: res.data.user.weight,
        phone_number: res.data.user.phone_number
      };

      localStorage.setItem('username', updatedUser.username);
      localStorage.setItem('is_profile_complete', updatedUser.is_profile_complete);
      localStorage.setItem('gender', updatedUser.gender || '');
      localStorage.setItem('age', updatedUser.age || '');
      localStorage.setItem('height', updatedUser.height || '');
      localStorage.setItem('weight', updatedUser.weight || '');
      localStorage.setItem('phone_number', updatedUser.phone_number || '');

      setUser(updatedUser);
      return { success: true };
    } catch (err) {
      console.error("Profile update error:", err);
      return { success: false, message: err.response?.data?.message || 'Update failed' };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: '16px',
        background: '#f8fafc'
      }}>
        <div style={{
          width: '48px', height: '48px', border: '4px solid #e2e8f0',
          borderTop: '4px solid #4f46e5', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Loading…</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, updateProfile, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
