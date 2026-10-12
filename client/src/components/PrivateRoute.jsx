import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route element — redirects unauthenticated users to /login.
 * Usage: <Route path="/room/:roomId" element={<PrivateRoute><Room /></PrivateRoute>} />
 */
export default function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}
