import React, { useState, useEffect } from "react";

interface CustomPrompt {
  id: number;
  name: string;
  system_prompt: string;
  user_prompt?: string;
  note_type: "soap" | "summary" | "both";
  created_at: string;
  updated_at: string;
}

interface CustomPromptManagerProps {
  API_BASE_URL: string;
  onPromptSelect?: (prompt: CustomPrompt) => void;
  selectedPromptId?: number;
  isUnregisteredUser?: boolean;
}

const CustomPromptManager: React.FC<CustomPromptManagerProps> = ({
  API_BASE_URL,
  onPromptSelect,
  selectedPromptId,
  isUnregisteredUser = false,
}) => {
  const [prompts, setPrompts] = useState<CustomPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    systemPrompt: "",
    userPrompt: "",
    noteType: "both" as "soap" | "summary" | "both",
  });

  const loadPrompts = async () => {
    if (isUnregisteredUser) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/custom-prompts`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPrompts(data.prompts || []);
      } else {
        setError("Failed to load custom prompts");
      }
    } catch (error) {
      setError("Network error loading custom prompts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, [isUnregisteredUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/custom-prompts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          systemPrompt: formData.systemPrompt.trim() || null,
          userPrompt: formData.userPrompt.trim() || null,
          noteType: formData.noteType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPrompts([data.prompt, ...prompts]);
        setFormData({
          name: "",
          systemPrompt: "",
          userPrompt: "",
          noteType: "both",
        });
        setShowCreateForm(false);
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to save custom prompt");
      }
    } catch (error) {
      setError("Network error saving custom prompt");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (promptId: number) => {
    if (!confirm("Are you sure you want to delete this custom prompt?")) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/custom-prompts/${promptId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("userToken")}`,
          },
        }
      );

      if (response.ok) {
        setPrompts(prompts.filter((p) => p.id !== promptId));
      } else {
        setError("Failed to delete custom prompt");
      }
    } catch (error) {
      setError("Network error deleting custom prompt");
    } finally {
      setIsLoading(false);
    }
  };

  if (isUnregisteredUser) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          Sign up or log in to create and manage custom prompts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Custom Prompts</h3>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          New Prompt
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {showCreateForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            Create Custom Prompt
          </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prompt Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., My SOAP Note Template"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note Type
              </label>
              <select
                value={formData.noteType}
                onChange={(e) =>
                  setFormData({ ...formData, noteType: e.target.value as any })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="both">
                  Both SOAP Notes and Patient Summaries
                </option>
                <option value="soap">SOAP Notes Only</option>
                <option value="summary">Patient Summaries Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                System Prompt (Optional)
              </label>
              <textarea
                value={formData.systemPrompt}
                onChange={(e) =>
                  setFormData({ ...formData, systemPrompt: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={8}
                placeholder="Leave empty to use default prompt as starting point, or enter your custom system prompt here..."
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.systemPrompt.length}/10,000 characters. Leave empty to initialize with default {formData.noteType} prompt.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Prompt (Optional)
              </label>
              <textarea
                value={formData.userPrompt}
                onChange={(e) =>
                  setFormData({ ...formData, userPrompt: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={4}
                placeholder="Enter optional user prompt template..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({
                    name: "",
                    systemPrompt: "",
                    userPrompt: "",
                    noteType: "both",
                  });
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create Prompt"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && !showCreateForm ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No custom prompts yet</p>
            <p className="text-sm">
              Create your first custom prompt to get started
            </p>
          </div>
        ) : (
          prompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`bg-white border rounded-lg p-4 ${
                selectedPromptId === prompt.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <h4 className="font-medium text-gray-900">{prompt.name}</h4>
                    <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {prompt.note_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {prompt.system_prompt.substring(0, 100)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    Updated {new Date(prompt.updated_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  {onPromptSelect && (
                    <button
                      onClick={() => onPromptSelect(prompt)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Select
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(prompt.id)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CustomPromptManager;
