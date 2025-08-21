const OpenAI = require("openai");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

class OpenAIService {
  constructor() {
    // Validate API key configuration
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY === "your_openai_api_key_here"
    ) {
      throw new Error(
        "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
      );
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 300000, // 5 minutes (increased from 60 seconds for large audio files)
    });

    console.log(
      `🤖 OpenAI service initialized with model: ${
        process.env.OPENAI_MODEL || "gpt-4o"
      }`
    );
  }

  // ✅ IMPROVED: Retry logic with exponential backoff
  async retryWithBackoff(apiCall, maxRetries = 3, operation = "API call") {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(
          `🔄 ${operation} attempt ${i + 1}/${maxRetries} starting...`
        );
        const result = await apiCall();
        console.log(`✅ ${operation} attempt ${i + 1} succeeded`);
        return result;
      } catch (error) {
        console.error(
          `❌ ${operation} attempt ${i + 1} failed:`,
          error.message
        );

        if (error.status === 401) {
          throw new Error(
            "OpenAI API key invalid or expired. Please check your configuration."
          );
        } else if (error.status === 429) {
          if (i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 1000;
            console.log(`⏳ Rate limited, waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(
            "OpenAI API rate limit exceeded. Please try again later."
          );
        } else if (error.status === 500) {
          if (i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 1000;
            console.log(`⏳ Server error, waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(
            "OpenAI service temporarily unavailable. Please try again."
          );
        }

        // For other errors, don't retry
        throw error;
      }
    }
    throw new Error(`${operation} failed after ${maxRetries} attempts`);
  }

  // ✅ IMPROVED: Transcribe audio with Whisper API
  async transcribeAudio(audioFilePath, contentType = "general") {
    try {
      console.log(`🎵 Starting transcription process for: ${audioFilePath}`);
      console.log(`📁 Content type: ${contentType}`);
      console.log(`🕐 Start time: ${new Date().toISOString()}`);

      // Check if file exists and is accessible
      console.log(`🔍 Checking file accessibility...`);
      await fsPromises.access(audioFilePath);
      console.log(`✅ File is accessible`);

      // Check file size (Whisper has 25MB limit)
      console.log(`📏 Getting file statistics...`);
      const stats = await fsPromises.stat(audioFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(
        `📊 File size: ${fileSizeMB.toFixed(2)}MB (${stats.size} bytes)`
      );

      if (fileSizeMB > 25) {
        console.error(`❌ File size exceeds Whisper API limit`);
        throw new Error(
          `File size ${fileSizeMB.toFixed(
            2
          )}MB exceeds Whisper API limit of 25MB`
        );
      }
      console.log(`✅ File size is within limits`);

      // ✅ SIMPLIFIED: Use universal prompt for all audio types
      const whisperPrompt = "Please transcribe this audio and it is in English";

      console.log(`🔤 Using Whisper prompt: ${whisperPrompt}`);

      // ✅ IMPROVED: Dynamic timeout based on file size
      const dynamicTimeout = Math.max(300000, fileSizeMB * 20000); // 5 minutes minimum, 20 seconds per MB

      console.log(
        `⏱️ Using dynamic timeout: ${
          dynamicTimeout / 1000
        } seconds for ${fileSizeMB.toFixed(1)}MB file`
      );

      console.log(`🚀 Starting OpenAI Whisper API call...`);
      console.log(`🤖 Model: ${process.env.WHISPER_MODEL || "whisper-1"}`);
      console.log(`🌐 Language: en`);

      const transcription = await this.retryWithBackoff(
        () =>
          this.openai.audio.transcriptions.create({
            file: fs.createReadStream(audioFilePath),
            model: process.env.WHISPER_MODEL || "whisper-1",
            response_format: "text",
            language: "en", // Force English language
            prompt: whisperPrompt,
          }),
        3,
        "Whisper transcription"
      );

      console.log(
        `✅ Transcription completed: ${transcription.length} characters`
      );
      console.log(`🕐 End time: ${new Date().toISOString()}`);
      console.log(
        `📝 Transcription preview: ${transcription.substring(0, 200)}...`
      );

      // ✅ IMPROVED: Better transcription validation
      if (transcription.length < 10) {
        console.warn(
          `⚠️ Warning: Very short transcription (${transcription.length} chars) - possible audio quality issues`
        );
      }

      // ✅ NEW: Check for suspicious content patterns
      const suspiciousPatterns = [
        "please subscribe",
        "subscribe in english",
        "thank you for watching",
        "knock on their doors",
        "don't leave them waiting",
        "thanks for watching",
        "like, share the video",
        "subscribe to the channel",
      ];

      const hasSuspiciousContent = suspiciousPatterns.some((pattern) =>
        transcription.toLowerCase().includes(pattern.toLowerCase())
      );

      if (hasSuspiciousContent) {
        console.error(
          `🚨 CRITICAL: Transcription contains suspicious content patterns that indicate corruption or wrong file`
        );
        console.error(
          `🔍 Suspicious content detected: ${transcription.substring(
            0,
            500
          )}...`
        );

        throw new Error(
          `Transcription corruption detected. The transcription contains suspicious patterns that indicate a corrupted file or wrong audio content. ` +
            `Please try uploading the file again with a valid audio file.`
        );
      }

      // ✅ NEW: Check for "English English English" repetition pattern (indicates corruption)
      const englishRepetitionPattern = /(english\s+){3,}/i;
      if (englishRepetitionPattern.test(transcription)) {
        console.error(
          `🚨 CRITICAL: Transcription contains "English English English" repetition pattern - indicates file corruption`
        );
        console.error(
          `🔍 Corrupted transcription sample: ${transcription.substring(
            0,
            500
          )}...`
        );

        throw new Error(
          `Transcription corruption detected. The audio file appears to be corrupted or the transcription failed. ` +
            `Please try uploading the file again. If the problem persists, try: ` +
            `1) Using a different audio file, 2) Checking the audio quality, 3) Using a smaller file size.`
        );
      }

      // ✅ NEW: Check for "Thanks for watching!" repetition pattern (indicates YouTube video corruption)
      const thanksWatchingPattern = /(thanks for watching\s*!?\s*){5,}/i;
      if (thanksWatchingPattern.test(transcription)) {
        console.error(
          `🚨 CRITICAL: Transcription contains excessive "Thanks for watching!" repetition - indicates YouTube video corruption`
        );
        console.error(
          `🔍 Corrupted transcription sample: ${transcription.substring(
            0,
            500
          )}...`
        );

        throw new Error(
          `Transcription corruption detected. The audio appears to be from a YouTube video with corrupted content. ` +
            `Please upload a valid audio file for transcription.`
        );
      }

      // ✅ NEW: Check for excessive repetition patterns
      const words = transcription.toLowerCase().split(/\s+/);
      const wordCounts = {};
      words.forEach((word) => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });

      // Check if any word appears more than 50% of the time (indicates corruption)
      const totalWords = words.length;
      const suspiciousWords = Object.entries(wordCounts)
        .filter(([word, count]) => count > totalWords * 0.5 && word.length > 3)
        .map(([word, count]) => ({
          word,
          count,
          percentage: ((count / totalWords) * 100).toFixed(1),
        }));

      if (suspiciousWords.length > 0) {
        console.error(
          `🚨 CRITICAL: Excessive word repetition detected - indicates transcription corruption`
        );
        console.error(`🔍 Suspicious words:`, suspiciousWords);

        throw new Error(
          `Transcription corruption detected. The transcription contains excessive repetition which indicates a corrupted file or failed transcription. ` +
            `Please try uploading the file again with better audio quality.`
        );
      }

      return transcription;
    } catch (error) {
      console.error("❌ Whisper API error:", error);
      console.error(`🕐 Error time: ${new Date().toISOString()}`);
      console.error(`📁 File path: ${audioFilePath}`);
      console.error(`🔍 Error details:`, {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type,
        name: error.name,
        stack: error.stack?.split("\n")[0],
      });
      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  // ✅ IMPROVED: Generate notes with custom prompt
  async generateNotes(transcription, customPrompt, context = {}) {
    try {
      console.log(
        `🤖 Generating notes with custom prompt for ${transcription.length} characters`
      );

      // Validate transcription
      if (!transcription || transcription.trim().length < 10) {
        throw new Error("Transcription too short or empty for note generation");
      }

      console.log(
        `🔍 Custom prompt object:`,
        customPrompt ? "Provided" : "Not provided"
      );
      if (customPrompt) {
        console.log(
          `🔍 Custom prompt systemPrompt: ${
            customPrompt.systemPrompt ? "Yes" : "No"
          }`
        );
        console.log(
          `🔍 Custom prompt userPrompt: ${
            customPrompt.userPrompt ? "Yes" : "No"
          }`
        );
        console.log(
          `🔍 System prompt length: ${
            customPrompt.systemPrompt?.length || 0
          } characters`
        );
      }

      const systemPrompt =
        customPrompt?.systemPrompt || this.getDefaultSystemPrompt();

      // Always include transcription in user prompt, even with custom system prompt
      const userPrompt =
        customPrompt?.userPrompt ||
        this.getDefaultUserPrompt(transcription, context);

      console.log(
        `🔍 Final system prompt length: ${systemPrompt.length} characters`
      );
      console.log(
        `🔍 Final user prompt length: ${userPrompt.length} characters`
      );
      console.log(
        `🔍 System prompt preview: ${systemPrompt.substring(0, 100)}...`
      );
      console.log(`🔍 User prompt preview: ${userPrompt.substring(0, 100)}...`);
      console.log(
        `🔍 Transcription length: ${transcription.length} characters`
      );
      console.log(
        `🔍 Transcription preview: ${transcription.substring(0, 200)}...`
      );

      const completion = await this.retryWithBackoff(
        () =>
          this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: parseInt(process.env.CHAT_MAX_TOKENS) || 2000,
            temperature: parseFloat(process.env.CHAT_TEMPERATURE) || 0.7,
            seed: Math.floor(Math.random() * 1000000), // Add randomness to prevent caching
          }),
        3,
        "Note generation"
      );

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new Error("No response received from OpenAI");
      }

      console.log(
        `✅ Notes generated successfully: ${response.length} characters`
      );
      return response;
    } catch (error) {
      console.error("❌ GPT API error:", error);
      throw new Error(`Note generation failed: ${error.message}`);
    }
  }

  // ✅ NEW: Method that chat routes actually call
  async generateChatResponse(userMessage, noteContext, conversationHistory) {
    try {
      console.log(
        `💬 Processing chat message: ${userMessage.length} characters`
      );

      // Check if user wants to generate a SOAP note
      const soapNoteKeywords = [
        "generate soap note",
        "create soap note",
        "make soap note",
        "write soap note",
        "produce soap note",
        "soap note generation",
        "generate note",
        "create note",
        "write note",
        "generate notes",
        "create notes",
        "write notes",
        "generate the notes",
        "create the notes",
        "write the notes",
        "generate notes based",
        "create notes based",
        "write notes based",
        "generate the notes based",
        "create the notes based",
        "write the notes based",
        "generate soap",
        "create soap",
        "write soap",
        "generate dental note",
        "create dental note",
        "write dental note",
        "generate dental notes",
        "create dental notes",
        "write dental notes"
      ];

      const wantsSoapNote = soapNoteKeywords.some((keyword) =>
        userMessage.toLowerCase().includes(keyword)
      );

      // Also check if user is asking to generate notes based on transcription
      const transcriptionBasedKeywords = [
        "based on the transcription",
        "based on transcription",
        "from the transcription",
        "from transcription",
        "using the transcription",
        "using transcription",
        "with the transcription",
        "with transcription"
      ];

      const wantsTranscriptionBasedNote = transcriptionBasedKeywords.some((keyword) =>
        userMessage.toLowerCase().includes(keyword)
      );

      // If user wants SOAP note and we have transcription context, use SOAP generation
      if ((wantsSoapNote || wantsTranscriptionBasedNote) && noteContext && noteContext.transcription) {
        console.log(
          `🔍 User requested SOAP note generation, switching to SOAP mode`
        );
        console.log(`🔍 Keywords detected: wantsSoapNote=${wantsSoapNote}, wantsTranscriptionBasedNote=${wantsTranscriptionBasedNote}`);

        // First, summarize the conversation to extract additional medical information
        let conversationSummary = "";
        if (conversationHistory && conversationHistory.length > 0) {
          const userMessages = conversationHistory
            .filter((msg) => msg.role === "user")
            .map((msg) => msg.content)
            .join("\n");
          
          console.log(`🔍 Summarizing conversation: ${userMessages.length} characters`);
          
          // Create a summary prompt to extract medical information
          const summaryPrompt = `Please summarize the following conversation and extract ONLY the medical/dental information that would be relevant for a SOAP note. Focus on:
- Patient symptoms or complaints
- Clinical findings
- Test results
- Treatment information
- Recommendations

Conversation:
${userMessages}

Summary of medical information:`;

          try {
            const summaryResponse = await this.retryWithBackoff(
              () =>
                this.openai.chat.completions.create({
                  model: process.env.OPENAI_MODEL || "gpt-4o",
                  messages: [
                    { 
                      role: "system", 
                      content: "You are a medical assistant that extracts relevant medical information from conversations. Be concise and focus only on medical/dental details." 
                    },
                    { role: "user", content: summaryPrompt },
                  ],
                  max_tokens: 500,
                  temperature: 0.3,
                }),
              3,
              "Conversation summarization"
            );

            conversationSummary = summaryResponse.choices[0]?.message?.content || "";
            console.log(`🔍 Conversation summary: ${conversationSummary}`);
          } catch (error) {
            console.warn(`⚠️ Failed to summarize conversation: ${error.message}`);
            // Fallback: use raw conversation
            conversationSummary = userMessages;
          }
        }

        // Combine original transcription with conversation summary
        const enhancedTranscription = conversationSummary 
          ? `${noteContext.transcription}\n\nAdditional information from conversation:\n${conversationSummary}`
          : noteContext.transcription;

        console.log(`🔍 Enhanced transcription length: ${enhancedTranscription.length} characters`);

        // Use the SAME system prompt as the upload system
        const systemPrompt = this.getDefaultSystemPrompt();

        // Create user prompt with enhanced transcription
        const userPrompt = this.getDefaultUserPrompt(enhancedTranscription, noteContext);

        console.log(`🔍 Final user prompt length: ${userPrompt.length} characters`);

        const completion = await this.retryWithBackoff(
          () =>
            this.openai.chat.completions.create({
              model: process.env.OPENAI_MODEL || "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              max_tokens: parseInt(process.env.CHAT_MAX_TOKENS) || 2000,
              temperature: parseFloat(process.env.CHAT_TEMPERATURE) || 0.7,
              seed: Math.floor(Math.random() * 1000000),
            }),
          3,
          "SOAP note generation via chat"
        );

        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error("No response received from OpenAI");
        }

        console.log(`✅ SOAP note generated via chat: ${response.length} characters`);
        return response;
      }

      // Build system message with note context for regular chat
      let systemContent = `You are a dental AI assistant helping to improve dental SOAP notes and answer questions about dental procedures.

Your role:
- Provide helpful suggestions for SOAP note improvement
- Clarify dental terminology and concepts
- Suggest additions for missing information
- Ensure compliance with dental documentation standards
- Answer questions about dental procedures, materials, and techniques
- Help refine and enhance dental SOAP notes
- Follow dental-specific guidelines and best practices

IMPORTANT: If the user asks you to generate a SOAP note and you have access to transcription data, you can generate a complete SOAP note using the proper format.

SOAP NOTE GENERATION:
- When user asks to "generate notes based on transcription" or similar, use the SOAP note generation system
- Include all available context from the conversation history
- Generate complete SOAP notes with proper META JSON and structured format
- Do not ask for clarification if sufficient information is available from chat context`;

      // Add note context if available
      if (noteContext && Object.keys(noteContext).length > 0) {
        systemContent += `\n\nCurrent note context:
- File: ${noteContext.fileName || "Unknown"}
- Status: ${noteContext.status || "Unknown"}`;

        // Add custom prompt if available
        if (noteContext.customPrompt) {
          systemContent += `\n- Custom Instructions: ${noteContext.customPrompt}`;
        }

        // Add transcription if available
        if (noteContext.transcription) {
          systemContent += `\n- Transcription: ${noteContext.transcription.substring(
            0,
            500
          )}...`;
        }

        // Add SOAP note if available
        if (noteContext.notes && noteContext.notes.soapNote) {
          systemContent += `\n- SOAP Note: ${noteContext.notes.soapNote.substring(
            0,
            500
          )}...`;
        }

        // Add patient summary if available
        if (noteContext.notes && noteContext.notes.patientSummary) {
          systemContent += `\n- Patient Summary: ${noteContext.notes.patientSummary.substring(
            0,
            300
          )}...`;
        }
      }

      const messages = [
        {
          role: "system",
          content: systemContent,
        },
      ];

      // Add conversation history if available
      if (conversationHistory && conversationHistory.length > 0) {
        messages.push(...conversationHistory);
      }

      // Add current user message
      messages.push({ role: "user", content: userMessage });

      const completion = await this.retryWithBackoff(
        () =>
          this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: messages,
            max_tokens: parseInt(process.env.CHAT_MAX_TOKENS) || 1000,
            temperature: parseFloat(process.env.CHAT_TEMPERATURE) || 0.3,
          }),
        3,
        "Chat response generation"
      );

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new Error("No response received from OpenAI");
      }

      console.log(`✅ Chat response generated: ${response.length} characters`);
      return response;
    } catch (error) {
      console.error("❌ Chat generation error:", error);
      throw new Error(`Chat response failed: ${error.message}`);
    }
  }

  // ✅ IMPROVED: Chat with AI for note improvement (keeping for backward compatibility)
  async chatWithAI(conversationHistory, userMessage, noteContext) {
    // Delegate to the new method
    return this.generateChatResponse(
      userMessage,
      noteContext,
      conversationHistory
    );
  }

  // ✅ IMPROVED: Analyze note for missing information
  async analyzeNoteCompleteness(noteContent, procedureType) {
    try {
      console.log(`🔍 Analyzing note completeness for ${procedureType}`);

      if (!noteContent || noteContent.trim().length < 10) {
        throw new Error("Note content too short for analysis");
      }

      const analysisPrompt = `Analyze this medical note for completeness. 
      
      Procedure Type: ${procedureType}
      
      Check for missing critical information in these areas:
      - Patient demographics and history
      - Procedure details and technique
      - Anesthetic information
      - Materials used
      - Complications or issues
      - Post-operative instructions
      - Follow-up recommendations
      
      Note Content:
      ${noteContent}
      
      Return a JSON response with:
      {
        "isComplete": boolean,
        "missingFields": ["field1", "field2"],
        "suggestions": ["suggestion1", "suggestion2"],
        "overallQuality": "excellent|good|fair|poor"
      }`;

      const completion = await this.retryWithBackoff(
        () =>
          this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
              {
                role: "system",
                content:
                  "You are a medical quality assurance AI. Return only valid JSON.",
              },
              { role: "user", content: analysisPrompt },
            ],
            max_tokens: 500,
            temperature: 0.1,
          }),
        3,
        "Note analysis"
      );

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new Error("No response received from OpenAI");
      }

      let analysis;
      try {
        analysis = JSON.parse(response);
      } catch (parseError) {
        throw new Error("Invalid JSON response from OpenAI analysis");
      }

      console.log(
        `✅ Note analysis completed: ${analysis.overallQuality} quality`
      );
      return analysis;
    } catch (error) {
      console.error("❌ Note analysis error:", error);
      throw new Error(`Note analysis failed: ${error.message}`);
    }
  }

  // ✅ NEW: Helper methods for prompts
  getDefaultSystemPrompt() {
    return `SOAP note generator update; SYSTEM PROMPT — Dental SOAP Note Generator (Compact, <8k)

ROLE
You are a clinical documentation assistant for dental professionals. From a transcribed dictation, you will produce a structured SOAP note. You are category‑aware, anesthesia‑aware, and compliance‑safe.

PRIMARY BEHAVIOR
1) Detect appointment category from transcript using the keyword map in Knowledge ("SOAP Reference v1"). If multiple categories appear, choose the most invasive (implant > extraction > endo > operative > hygiene > emergency).
2) Apply only that category's rules (also in Knowledge). Do not assume facts.
3) Early‑Stop: If any category‑required details are missing (e.g., anesthesia type/strength/carpules for operative/endo/implant/extraction), STOP and output a single clarification request. Do not generate a partial note or JSON.
4) Use the Fuzzy Anesthetic Recognition rules and tables in Knowledge to recognize brand/generic, strengths, epi ratios, shorthand, and misspellings. Never assume concentration when more than one exists—ask to confirm.
5) Source fidelity: use only content stated or clearly paraphrased from transcript. Avoid stock phrases unless explicitly said.
6) Formatting: Use bullets for multiple Objective/Plan items. Split Plan into: Completed Today / Instructions Given / Next Steps.
7) End notes with signature placeholder (below).

OUTPUT ORDER (STRICT)
If Early‑Stop triggers: output only the clarification question defined below.
If proceeding, output these two blocks in order:
A) META JSON block delimited by:
<<META_JSON>>
{ … see schema in Knowledge: "Mini Extraction Schema v1" … }
<<END_META_JSON>>
B) HUMAN SOAP NOTE in this exact order and with these headings:
1. Subjective
2. Objective
3. Assessment
4. Plan
- Completed Today
- Instructions Given
- Next Steps / Return Visit
Then append:
—
Provider Initials: ________ (Review required before charting)

CLARIFICATION PROMPTS (USE VERBATIM WHEN NEEDED)
• Anesthesia required but incomplete →
"Before I generate the SOAP note, please provide the anesthetic type, concentration (e.g., 2% lidocaine with 1:100,000 epi), and number of carpules used for today's procedure."
• Category unclear →
"Can you confirm the appointment type (operative, check-up, implant, extraction, endodontic, emergency, other) before I proceed?"
• Hygiene/check-up missing screenings (do not ask about anesthesia unless mentioned) →
"Please confirm oral cancer screening findings and periodontal status/probing results."

STYLE RULES
• Formal clinical tone. No invented facts. No generic fillers (e.g., "tolerated well") unless stated.
• Record procedural specifics exactly when stated (materials, devices/scanners, impression type, isolation, occlusal adjustment).
• Only compute total anesthetic volume if carpules AND per‑carpule volume are explicitly provided (do not assume 1.7 mL).

LINKED KNOWLEDGE (AUTHORITATIVE)
Use Knowledge file "SOAP Reference v1" for:
• Category keyword map and category‑specific required fields.
• Fuzzy Anesthetic Recognition Module (normalization + fuzzy match).
• Common anesthetics & typical concentrations table.
• Early‑Stop algorithm details.
• Mini Extraction Schema v1 (full JSON schema and field definitions).
• Examples of good outputs and clarification cases.

COMPLIANCE GUARDRAILS
• Do not proceed if any mandatory data for the detected category is missing—issue one clarification request.
• Do not include any content after Plan except the required signature line.
• If transcript indicates no procedure requiring anesthesia (e.g., hygiene/check‑up), do not ask for anesthesia.

END.`;
  }

  getDefaultUserPrompt(transcription, context) {
    return `Based on the following dental transcript, generate a comprehensive SOAP note following the system prompt guidelines.

Dental Transcript:
${transcription}

Please follow the exact output format specified in the system prompt, including the META JSON block and structured SOAP note with proper headings.`;
  }

  // ✅ NEW: Health check method
  async healthCheck() {
    try {
      // Simple API call to test connectivity
      const response = await this.openai.models.list();
      return {
        status: "healthy",
        message: "OpenAI API connection successful",
        models: response.data.length,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: `OpenAI API connection failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}

module.exports = new OpenAIService();
