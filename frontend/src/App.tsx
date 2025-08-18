import { useState, useEffect } from "react";
import AdminPage from "./components/AdminPage";
import EnhancedUpload from "./components/EnhancedUpload";
import ResultsDisplay from "./components/ResultsDisplay";

interface UploadResult {
  fileId: string;
  status: string;
  notes?: {
    soapNote: string;
    patientSummary: string;
  };
  transcription?: string;
  error?: string;
}

function App() {
  // API Configuration - Point to backend server on VPS IP address
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://83.229.115.190:3001";
  const API_ENDPOINTS = {
    login: `${API_BASE_URL}/api/auth/login`,
    upload: `${API_BASE_URL}/api/upload`,
    health: `${API_BASE_URL}/health`,
  };

  // Simplified admin authentication state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<"main" | "admin">("main");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // New state for enhanced upload
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Check URL on component mount and handle routing
  useEffect(() => {
    const path = window.location.pathname;
    console.log(
      "🔍 URL routing effect - path:",
      path,
      "currentPage:",
      currentPage
    );

    if (path === "/admin") {
      // Check if admin token exists
      const token = localStorage.getItem("adminToken");
      console.log("🔍 Admin path detected - token exists:", !!token);

      if (token) {
        console.log("🔍 Setting admin state and page");
        setCurrentPage("admin");
        setIsAdmin(true);
        setIsLoggedIn(true);
      } else {
        // Redirect to main page if no admin token
        console.log("🔍 No admin token, redirecting to main");
        window.history.pushState({}, "", "/");
        setCurrentPage("main");
      }
    } else {
      console.log("🔍 Main path detected, setting main page");
      setCurrentPage("main");
    }
  }, []);

  // Enhanced upload handlers
  const handleUploadComplete = (result: UploadResult) => {
    setUploadResult(result);
    setShowResults(true);
    console.log("🎉 Upload completed:", result);
  };

  const handleUploadError = (errorMessage: string) => {
    console.error("❌ Upload error:", errorMessage);
    // You can add error handling here if needed
  };

  const handleCloseResults = () => {
    setShowResults(false);
    setUploadResult(null);
  };

  // Admin functions
  const handleAdminLogin = async (email: string, password: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.login, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("adminToken", data.token);
        setIsAdmin(true);
        setIsLoggedIn(true);
        setCurrentPage("admin");
        setShowAdminLogin(false);
        setAdminEmail("");
        setAdminPassword("");
        window.history.pushState({}, "", "/admin");
      } else {
        alert("Login failed. Please check your credentials.");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed. Please try again.");
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("adminToken");
    setIsAdmin(false);
    setIsLoggedIn(false);
    setCurrentPage("main");
    window.history.pushState({}, "", "/");
  };

  const handleBackToMain = () => {
    setCurrentPage("main");
    window.history.pushState({}, "", "/");
  };

  return (
    <>
      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Admin Login</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdminLogin(adminEmail, adminPassword);
              }}
            >
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Password"
                  required
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminLogin(false)}
                  className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main App or Admin Page Routing */}
      {currentPage === "admin" ? (
        (() => {
          console.log(
            "🔍 Rendering AdminPage - currentPage:",
            currentPage,
            "isAdmin:",
            isAdmin,
            "isLoggedIn:",
            isLoggedIn
          );
          return (
            <AdminPage
              API_BASE_URL={API_BASE_URL}
              onBackToMain={handleBackToMain}
              onLogout={handleAdminLogout}
            />
          );
        })()
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-clearly-blue">
                    ClearlyAI
                  </h1>
                  <p className="text-gray-600">Medical Notes Generator</p>
                </div>
                <div className="flex items-center space-x-4">
                  {!isLoggedIn ? (
                    <button
                      onClick={() => setShowAdminLogin(true)}
                      className="bg-clearly-blue hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                    >
                      Admin Login
                    </button>
                  ) : (
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          Welcome, Admin
                        </p>
                        <p className="text-xs text-gray-500">
                          {isAdmin ? "Administrator" : "User"}
                        </p>
                      </div>
                      <button
                        onClick={handleAdminLogout}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <section className="bg-white py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-clearly-blue mb-6">
                Generate SOAP notes & patient-ready appointment summaries with
                AI
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Upload your audio recording or transcription and receive
                easy-to-read notes in seconds.
              </p>

              {/* Upload Section */}
              <div className="max-w-4xl mx-auto">
                <EnhancedUpload
                  onUploadComplete={handleUploadComplete}
                  onError={handleUploadError}
                />
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section className="bg-gray-50 py-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  How It Works
                </h2>
                <p className="text-xl text-gray-600">
                  Generate professional medical notes in three simple steps
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">1</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Upload or Record
                  </h3>
                  <p className="text-gray-600">
                    Upload your audio file or record directly on the website. We
                    support MP3, M4A, WAV, and text files.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">2</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    AI Processing
                  </h3>
                  <p className="text-gray-600">
                    Our advanced AI analyzes your content and generates
                    comprehensive SOAP notes and patient summaries.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-clearly-blue rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">3</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Download & Use
                  </h3>
                  <p className="text-gray-600">
                    Download your generated notes in a clean, professional
                    format ready for medical records.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Get Started Section */}
          <section className="bg-gradient-to-r from-clearly-blue to-blue-600 py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-xl text-blue-100 mb-8">
                Join healthcare professionals who are already saving time with
                ClearlyAI
              </p>
              <button
                onClick={() => {
                  document
                    .querySelector(".upload-area")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="bg-white text-clearly-blue px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
              >
                Start Generating Notes
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Results Display Modal */}
      {showResults && uploadResult && (
        <ResultsDisplay result={uploadResult} onClose={handleCloseResults} />
      )}
    </>
  );
}

export default App;
