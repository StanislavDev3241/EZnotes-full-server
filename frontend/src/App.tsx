import { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import LoginPage from "./components/LoginPage";
import MainDashboard from "./components/MainDashboard";
import LandingPage from "./components/LandingPage";
import ErrorBoundary from "./components/ErrorBoundary";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

// Wrapper component to handle auth state and navigation
function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnregisteredUser, setIsUnregisteredUser] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  // Memoize navigation functions to prevent unnecessary re-renders
  const navigateTo = useCallback(
    (path: string) => {
      if (location.pathname !== path) {
        navigate(path);
      }
    },
    [navigate, location.pathname]
  );

  useEffect(() => {
    // Only run initialization once
    if (isInitialized) return;

    const initializeApp = async () => {
      try {
        const userToken = localStorage.getItem("userToken");
        const adminToken = localStorage.getItem("adminToken");

        if (userToken) {
          await verifyUserToken(userToken);
        } else if (adminToken) {
          // Handle admin token verification if needed
          // For now, just clear it and show landing page
          localStorage.removeItem("adminToken");
          // Don't redirect here - let the user stay where they are
        } else {
          // No tokens found, user can stay on current page
          // Only redirect if they're trying to access protected routes
        }
      } catch (error) {
        console.error("Initialization failed:", error);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, [isInitialized]);

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
        setIsUnregisteredUser(false);

        // Only redirect if user is on landing/login page and should be in app
        if (location.pathname === "/" || location.pathname === "/login") {
          navigateTo("/app");
        }
      } else {
        // Token is invalid, clear it
        localStorage.removeItem("userToken");
        setUser(null);

        // Only redirect if user is on protected routes
        if (location.pathname === "/app") {
          navigateTo("/");
        }
      }
    } catch (error) {
      console.error("Token verification failed:", error);
      localStorage.removeItem("userToken");
      setUser(null);

      // Only redirect if user is on protected routes
      if (location.pathname === "/app") {
        navigateTo("/");
      }
    }
  };

  const handleLogin = (token: string, userData: User) => {
    setUser(userData);
    localStorage.setItem("userToken", token);
    setIsUnregisteredUser(false);
    navigateTo("/app");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("userToken");
    setIsUnregisteredUser(false);
    navigateTo("/");
  };

  const handleGetStarted = () => {
    setIsUnregisteredUser(true);
    navigateTo("/app");
  };

  const handleBackToLanding = () => {
    setIsUnregisteredUser(false);
    navigateTo("/");
  };

  const handleShowLogin = () => {
    navigateTo("/login");
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

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                onGetStarted={handleGetStarted}
                onShowLogin={handleShowLogin}
              />
            }
          />
          <Route
            path="/login"
            element={
              <LoginPage
                onLogin={handleLogin}
                onBackToLanding={handleBackToLanding}
              />
            }
          />
          <Route
            path="/app"
            element={
              user || isUnregisteredUser ? (
                <MainDashboard
                  user={user}
                  onLogout={handleLogout}
                  isUnregisteredUser={isUnregisteredUser}
                  onBackToLanding={handleBackToLanding}
                  onShowLogin={handleShowLogin}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <div className="min-h-screen">
          <AppContent />
        </div>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
