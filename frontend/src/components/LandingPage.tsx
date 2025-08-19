import React, { useState } from "react";
import { Upload, FileText, Monitor, ArrowRight, Menu } from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const [showMenu, setShowMenu] = useState(false);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenu && !(event.target as Element).closest('.menu-container')) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-blue-900">Clearly AI</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4 relative menu-container">
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 text-gray-600 hover:text-gray-800"
              >
                <Menu className="h-6 w-6" />
              </button>
              
              {/* Dropdown Menu */}
              {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      window.location.href = '/login';
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      window.location.href = '/register';
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sign Up
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onGetStarted();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
                  >
                    Try for Free
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl tracking-tight font-extrabold text-blue-900 sm:text-5xl md:text-6xl">
            Generate SOAP notes & patient scripts with AI
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Upload your transcription and receive easy-to-read in seconds
          </p>
          <div className="mt-8">
            <button
              onClick={onGetStarted}
              className="inline-flex items-center px-8 py-4 border border-gray-300 text-lg font-medium rounded-lg text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <Upload className="mr-2 h-5 w-5" />
              Upload transcript (.txt or .mp3)
            </button>
          </div>
        </div>
      </main>

      {/* How It Works Section */}
      <section className="py-16 bg-gray-50 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-blue-900 sm:text-4xl">
              How It Works
            </h2>
          </div>

          <div className="mt-16">
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-8 sm:space-y-0 sm:space-x-8">
              {/* Step 1 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 text-blue-600 mx-auto mb-4">
                  <Upload className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Upload audio or text transcript at the end of the patient
                  visit
                </h3>
              </div>

              {/* Arrow 1 */}
              <div className="hidden sm:flex items-center justify-center">
                <ArrowRight className="h-8 w-8 text-gray-400" />
              </div>

              {/* Step 2 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 text-blue-600 mx-auto mb-4">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Get a complete SOAP note or patient-friendly summary
                </h3>
              </div>

              {/* Arrow 2 */}
              <div className="hidden sm:flex items-center justify-center">
                <ArrowRight className="h-8 w-8 text-gray-400" />
              </div>

              {/* Step 3 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 text-blue-600 mx-auto mb-4">
                  <Monitor className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Review or save the note in your HR to complete the chart
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 max-w-7xl mx-auto">
            {/* Feature 1 */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-blue-900 mb-3">
                Speed up charting
              </h3>
              <p className="text-gray-600">
                Stop spending hours crafting notes after a long clinic day
                --just upload and go
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-blue-900 mb-3">
                Minimize errors
              </h3>
              <p className="text-gray-600">
                Ensure your notes are complete, formatted correctly, and free of
                mistakes
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center">
              <h3 className="text-xl font-bold text-blue-900 mb-3">
                Improve patient communications
              </h3>
              <p className="text-gray-600">
                Receive a plain-language summary script you can share with the
                patient
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-white w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
          <button
            onClick={onGetStarted}
            className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Get started
          </button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
