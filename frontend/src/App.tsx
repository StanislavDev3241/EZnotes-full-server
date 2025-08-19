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
  const [showLoginPage, setShowLoginPage] = useState(false);

  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";

  useEffect(() => {
    // Check if user is already logged in first
    const userToken = localStorage.getItem("userToken");
    const adminToken = localStorage.getItem("adminToken");

    if (userToken) {
      verifyUserToken(userToken);
    } else if (adminToken) {
      // Handle admin token verification if needed
      // For now, just clear it and show landing page
      localStorage.removeItem("adminToken");
      setIsLoading(false);
    } else {
      // No tokens found, show landing page
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
    setShowLoginPage(false); // Hide login page after login
    setIsUnregisteredUser(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("userToken");
    setShowLanding(true); // Show landing page after logout
    setShowLoginPage(false); // Hide login page after logout
    setIsUnregisteredUser(false);
  };

  const handleGetStarted = () => {
    setShowLanding(false); // Hide landing page when user clicks "Get Started"
    setShowLoginPage(false); // Hide login page when user clicks "Get Started"
    setIsUnregisteredUser(true); // Mark as unregistered user - they can only upload and get notes
  };

  const handleBackToLanding = () => {
    setShowLanding(true);
    setShowLoginPage(false);
    setIsUnregisteredUser(false);
    // Don't clear user data here - let the landing page handle it if needed
  };

  const handleShowLogin = () => {
    console.log(
      "handleShowLogin called - setting showLanding to false, showLoginPage to true"
    );
    setShowLanding(false);
    setShowLoginPage(true);
    setIsUnregisteredUser(false);
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

  console.log("Routing debug:", {
    showLanding,
    showLoginPage,
    user: !!user,
    isUnregisteredUser,
  });

  // Show landing page if landing should be shown
  if (showLanding) {
    console.log("Showing LandingPage");
    return (
      <LandingPage
        onGetStarted={handleGetStarted}
        onShowLogin={handleShowLogin}
      />
    );
  }

  // Show login page if login page should be shown
  if (showLoginPage) {
    console.log("Showing LoginPage");
    return (
      <LoginPage onLogin={handleLogin} onBackToLanding={handleBackToLanding} />
    );
  }

  // Show main application if user is logged in OR if unregistered user wants to use the app
  console.log("Showing MainDashboard/AdminPage");
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
