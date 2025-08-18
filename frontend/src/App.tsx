import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import LoginPage from "./components/LoginPage";
import MainDashboard from "./components/MainDashboard";
import AdminPage from "./components/AdminPage";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

function App() {
  // API Configuration
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";
  
  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication on app load
  useEffect(() => {
    const token = localStorage.getItem("userToken");
    const adminToken = localStorage.getItem("adminToken");
    
    if (token) {
      // Verify user token
      verifyUserToken(token);
    } else if (adminToken) {
      // Verify admin token
      verifyAdminToken(adminToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyUserToken = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
      } else {
        localStorage.removeItem("userToken");
      }
    } catch (error) {
      console.error("Token verification failed:", error);
      localStorage.removeItem("userToken");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAdminToken = async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const adminData = await response.json();
        setUser({ ...adminData.user, role: "admin" });
      } else {
        localStorage.removeItem("adminToken");
      }
    } catch (error) {
      console.error("Admin token verification failed:", error);
      localStorage.removeItem("adminToken");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (token: string, userData: any) => {
    localStorage.setItem("userToken", token);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("adminToken");
    setUser(null);
  };

  // Protected Route component
  const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) => {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return <Navigate to="/login" replace />;
    }

    if (requireAdmin && user.role !== "admin") {
      return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={
              user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />
            } 
          />

          {/* User Dashboard */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <MainDashboard user={user!} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />

          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requireAdmin>
                <AdminPageWrapper 
                  API_BASE_URL={API_BASE_URL}
                  onLogout={handleLogout}
                />
              </ProtectedRoute>
            } 
          />

          {/* Default Route */}
          <Route 
            path="/" 
            element={<Navigate to={user ? "/dashboard" : "/login"} replace />} 
          />

          {/* Catch all route */}
          <Route 
            path="*" 
            element={<Navigate to={user ? "/dashboard" : "/login"} replace />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

// Wrapper component to use useNavigate hook
function AdminPageWrapper({ API_BASE_URL, onLogout }: { API_BASE_URL: string; onLogout: () => void }) {
  const navigate = useNavigate();
  
  return (
    <AdminPage 
      API_BASE_URL={API_BASE_URL}
      onBackToMain={() => navigate("/dashboard")}
      onLogout={onLogout}
    />
  );
}

export default App;
