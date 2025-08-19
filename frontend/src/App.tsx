import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import LoginPage from "./components/LoginPage";
import MainDashboard from "./components/MainDashboard";
import LandingPage from "./components/LandingPage";
import AdminPage from "./components/AdminPage";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const [isUnregisteredUser, setIsUnregisteredUser] = useState(false);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  useEffect(() => {
    // Clear any existing tokens to ensure landing page shows first
    localStorage.removeItem("userToken");
    localStorage.removeItem("adminToken");

    // Check if user is already logged in
    const token = localStorage.getItem("userToken");
    if (token) {
      verifyUserToken(token);
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
        setShowLanding(false); // Skip landing page if user is logged in
        setIsUnregisteredUser(false);
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

  const handleLogin = (token: string, userData: any) => {
    setUser(userData);
    localStorage.setItem("userToken", token);
    setShowLanding(false); // Hide landing page after login
    setIsUnregisteredUser(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("userToken");
    setShowLanding(true); // Show landing page after logout
    setIsUnregisteredUser(false);
  };

  const handleGetStarted = () => {
    setShowLanding(false); // Hide landing page when user clicks "Get Started"
    setIsUnregisteredUser(true); // Mark as unregistered user - they can only upload and get notes
  };

  const handleBackToLanding = () => {
    setShowLanding(true);
    setIsUnregisteredUser(false);
    setUser(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show landing page if not logged in and landing should be shown
  if (showLanding && !user) {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  // Show login page if not logged in and landing is hidden
  if (!user && !isUnregisteredUser) {
    return (
      <LoginPage onLogin={handleLogin} onBackToLanding={handleBackToLanding} />
    );
  }

  // Show main application if user is logged in OR if unregistered user wants to use the app
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            user?.role === "admin" ? (
              <AdminPage
                API_BASE_URL={API_BASE_URL}
                onBackToMain={() => {}} // Admin doesn't need to go back to main
                onLogout={handleLogout}
              />
            ) : (
              <MainDashboard
                user={user}
                onLogout={handleLogout}
                isUnregisteredUser={isUnregisteredUser}
                onBackToLanding={handleBackToLanding}
              />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
