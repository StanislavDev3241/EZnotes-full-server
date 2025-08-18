import React from "react";
import { FileText, MessageSquare, Shield, Zap, ArrowRight } from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-blue-600">ClearlyAI</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">Transform Your Medical</span>
            <span className="block text-blue-600">Documentation</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            AI-powered SOAP notes, patient summaries, and intelligent chat assistance. 
            Streamline your medical documentation workflow with ClearlyAI.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <button
                onClick={onGetStarted}
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10 transition-colors"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Everything you need for medical documentation
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              From audio transcription to AI-generated notes, ClearlyAI has you covered.
            </p>
          </div>

          <div className="mt-20">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  AI-Generated SOAP Notes
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Automatically generate comprehensive SOAP notes from your transcriptions with advanced AI.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  Intelligent Chat Assistant
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Chat with AI to refine notes, ask questions, and get instant medical documentation help.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  HIPAA Compliant
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Enterprise-grade security with end-to-end encryption and full HIPAA compliance.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  Fast & Accurate
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Process audio files and generate notes in seconds with industry-leading accuracy.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  Custom Prompts
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Tailor AI responses to your specialty and documentation requirements.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white mx-auto">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-medium text-gray-900">
                  Conversation History
                </h3>
                <p className="mt-2 text-base text-gray-500">
                  Save and continue conversations, with full audit trails and version control.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span className="block">Ready to get started?</span>
            <span className="block text-blue-200">Join ClearlyAI today.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50 transition-colors"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white">ClearlyAI</h3>
            <p className="mt-2 text-gray-400">
              Transforming medical documentation with AI
            </p>
            <p className="mt-4 text-sm text-gray-500">
              © 2024 ClearlyAI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 