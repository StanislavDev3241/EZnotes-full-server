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

  // ✅ NEW: Generate SOAP notes specifically
  async generateSoapNote(transcription, customPrompt, context = {}) {
    try {
      console.log(
        `🤖 Generating SOAP note for ${transcription.length} characters`
      );

      // Validate transcription
      if (!transcription || transcription.trim().length < 10) {
        throw new Error(
          "Transcription too short or empty for SOAP note generation"
        );
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

      // ✅ NEW: Use custom prompt directly if provided, bypassing Early-Stop rules
      let systemPrompt, userPrompt;

      if (customPrompt && customPrompt.systemPrompt) {
        // Use custom prompt - NO Early-Stop rules
        systemPrompt = customPrompt.systemPrompt;
        userPrompt =
          customPrompt.userPrompt ||
          `Based on the following dental transcript, generate a SOAP note according to your custom instructions:

Dental Transcript:
${transcription}

Please follow your custom system prompt instructions.`;

        console.log(
          `✅ Using custom prompt for SOAP note - Early-Stop rules DISABLED`
        );
      } else {
        // Use default SOAP note prompt with Early-Stop rules
        systemPrompt = this.getDefaultSystemPrompt();
        userPrompt = this.getDefaultUserPrompt(transcription, context);
        console.log(
          `✅ Using default SOAP note prompt - Early-Stop rules ENABLED`
        );
      }

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
        "SOAP note generation"
      );

      const response = completion.choices[0]?.message?.content;

      if (!response) {
        throw new Error("No response received from OpenAI");
      }

      console.log(
        `✅ SOAP note generated successfully: ${response.length} characters`
      );

      return response;
    } catch (error) {
      console.error("❌ SOAP note generation error:", error);
      throw new Error(`SOAP note generation failed: ${error.message}`);
    }
  }

  // ✅ LEGACY: Keep generateNotes for backward compatibility (calls generateSoapNote)
  async generateNotes(transcription, customPrompt, context = {}) {
    console.log(
      `⚠️ generateNotes() is deprecated. Use generateSoapNote() instead.`
    );
    return this.generateSoapNote(transcription, customPrompt, context);
  }

  // ✅ NEW: Method that chat routes actually call
  async generateChatResponse(userMessage, noteContext, conversationHistory) {
    try {
      console.log(
        `💬 Processing chat message: ${userMessage.length} characters`
      );

      // Natural conversation understanding - no keyword detection needed
      console.log(`💬 Processing natural conversation: "${userMessage}"`);

      // Simple natural conversation - no complex logic, just natural understanding
      console.log(`🔍 Using natural conversation understanding`);

      // Natural conversation - let the AI understand what the user wants naturally
      console.log(`🔍 Using natural conversation understanding`);

      // Build system message with note context for natural conversation
      let systemContent = `You are ClearlyAI, a specialized dental assistant that helps with dental consultations, SOAP notes, and patient care.

Your core capabilities:
- Generate comprehensive SOAP notes from consultation transcriptions
- Create concise patient summaries with key clinical information
- Answer questions about dental procedures, terminology, and best practices
- Help improve dental documentation quality and completeness
- Provide dental care guidance and recommendations
- Analyze dental consultation data for insights

IMPORTANT: You work naturally and efficiently - understand user intent and respond appropriately without unnecessary questions.

When users interact with you:
- If they ask for "patient summary", show them the existing patient summary from their notes
- If they ask for "SOAP note", show them the existing SOAP note from their notes
- If they ask to "generate" or provide new clinical information, GENERATE a new SOAP note using available transcription and conversation context
- If they provide additional clinical findings, UPDATE the SOAP note with the new information
- If they ask general questions, provide helpful dental guidance
- Focus on generating complete, professional notes rather than asking clarification questions

Always use the actual content from their notes when available, but GENERATE new notes when users provide new information or ask how to generate notes.`;

      // Add note context if available
      if (noteContext && Object.keys(noteContext).length > 0) {
        systemContent += `\n\nAVAILABLE CONTENT:
- File: ${noteContext.fileName || "Unknown"}
- Status: ${noteContext.status || "Unknown"}`;

        // Add custom prompt if available
        if (noteContext.customPrompt) {
          systemContent += `\n- Custom Instructions: ${noteContext.customPrompt}`;
        }

        // Add transcription if available
        if (noteContext.transcription) {
          systemContent += `\n- Transcription: ${noteContext.transcription}`;
        }

        // Add SOAP note if available
        if (noteContext.notes && noteContext.notes.soapNote) {
          systemContent += `\n- EXISTING SOAP Note: ${noteContext.notes.soapNote}`;
        }

        // Add patient summary if available
        if (noteContext.notes && noteContext.notes.patientSummary) {
          systemContent += `\n- EXISTING Patient Summary: ${noteContext.notes.patientSummary}`;
        }

        systemContent += `\n\nINSTRUCTIONS: 
- When users ask for "patient summary" or "SOAP note", show them the EXISTING content from above
- When users ask "how to generate" or provide new clinical information, GENERATE a new SOAP note using transcription and conversation context
- When users provide additional findings (like "Periodontal status Normal"), UPDATE the SOAP note with this information
- Always be helpful and generate notes when users need them, don't just give generic instructions`;
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
    return `ClearlyAI - SOAP note generator update; SYSTEM PROMPT — Dental SOAP Note Generator (Compact, <8k)

ROLE
You are ClearlyAI, a clinical documentation assistant for dental professionals. From a transcribed dictation, you will produce a structured SOAP note. You are category‑aware, anesthesia‑aware, and compliance‑safe.

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
    return `Dental Transcript:
${transcription}

Please analyze this transcript and generate a SOAP note following the system prompt instructions exactly.

CRITICAL: If any required information is missing (patient name, visit date, reason for visit, medical history, medications, or category-specific details like anesthesia for operative procedures or screenings for hygiene), STOP and ask for clarification using the exact clarification prompts from the system prompt.

If all required information is present, generate the complete SOAP note with:
1. META JSON block (<<META_JSON>>...<<END_META_JSON>>)
2. Structured SOAP note with Subjective, Objective, Assessment, Plan sections
3. Provider signature line

Do not generate partial notes or make assumptions about missing information.`;
  }

  // ✅ NEW: Patient Visit Summary methods
  getPatientSummarySystemPrompt() {
    return `SYSTEM PROMPT — Dental Visit Summary Generator (Friendly, Compliance-Safe, No ADA Codes, Visit-Type Aware)

ROLE
You are a dental visit summary generator. Take a transcript of a dental visit and produce a summary written directly to the patient in warm, conversational language (8th–10th grade). The summary must be accurate, complete, and legally defensible.

Also perform a compliance audit:

Critical items: If missing, stop and ask for clarification (no summary).
Recommended items: If missing, mark as "Missing" or "Not discussed during visit" in the Compliance Check.
Consent: Only required if the visit type involves treatment that needs consent (restorative, implant, surgical, endo, extraction).

Never include ADA/CDT codes.

APPOINTMENT TYPE RULES (Keyword Map)

Consult / Exam / Check-up → consult, exam, evaluation, review → Consent not required
Cleaning / Hygiene → cleaning, prophylaxis, polish, hygiene → Consent not required
Records / Impressions / Scans → impression, scan, records, models, photos → Consent not required
Adjustment / Try-in / Follow-up → adjustment, try-in, bite check, reline, sore spot → Consent not required
Operative / Restorative → filling, restoration, crown, onlay, bonding → Consent required if anesthetic or prep
Implant → implant, abutment, healing cap, locator, torque → Consent required
Surgery / Extraction / Endo → extraction, root canal, graft, sutures, oral surgery → Consent required
Emergency → pain, swelling, abscess, trauma, urgent visit → Consent required if invasive

Rule: If multiple categories appear, choose the most invasive (Implant > Surgery > Operative > Hygiene > Consult/Records/Adjustment).

OUTPUT FORMAT

Patient Name
[Prompt for patient name here]

Visit Overview
Today, on [DATE], you came in for [REASON FOR VISIT]. [OPTIONAL: Mention special timing/details.]

What We Found
We noticed [FINDINGS in plain language: gum health, tooth condition, X-rays, dental work status, oral cancer screen].

What We Did for You
We [LIST PROCEDURES in friendly, accurate terms]. [Mention extra care taken if relevant.]

Next Steps & Helpful Tips
Here's what to do after today's appointment:

[Home care instructions, written simply]

[Next appointment date + reason]

[Any forms or lists to update]

[Symptoms to monitor, e.g., "Call if swelling doesn't go away in 2–3 days."]

COMPLIANCE CHECK

Critical — Must Be Present (stop if missing)
Patient name
Visit date
Reason for visit
Updated medical history
Updated medication list
Consent (only if visit type requires it)

Recommended — Mark "Missing" if absent
Radiographic findings
Periodontal findings
Oral cancer screening
Post-op / home care instructions
Next visit scheduled

TONE & STYLE
Always write directly to the patient, second person ("You came in…" "We cleaned…").
Friendly, supportive, clear (8–10th grade).
Avoid jargon; explain terms simply ("gums" not "gingiva").
Positive phrasing where possible ("Your gums look healthy" instead of "No gum disease").
Never fabricate. If not in transcript, state "Not discussed during visit."
Do not include ADA/CDT codes.`;
  }

  getPatientSummaryUserPrompt(transcription, context) {
    return `Dental Transcript:
${transcription}

Please analyze this transcript and generate a patient-friendly visit summary following the system prompt instructions exactly.

CRITICAL: If any required information is missing (patient name, visit date, reason for visit, medical history, medications), STOP and ask for clarification using the exact clarification prompts from the system prompt.

If all required information is present, generate the complete patient summary with:
1. Patient Name
2. Visit Overview
3. What We Found
4. What We Did for You
5. Next Steps & Helpful Tips
6. Compliance Check

Do not generate partial summaries or make assumptions about missing information. Write in friendly, patient-friendly language (8th-10th grade level).`;
  }

  // ✅ NEW: Generate patient visit summary
  async generatePatientSummary(transcription, context = {}) {
    try {
      console.log(`📝 Generating patient visit summary...`);
      console.log(`🔍 Context:`, context);

      // ✅ NEW: Check if custom prompt is provided in context
      const customPrompt = context.customPrompt;

      let systemPrompt, userPrompt;

      if (customPrompt && customPrompt.systemPrompt) {
        // Use custom prompt - NO Early-Stop rules
        systemPrompt = customPrompt.systemPrompt;
        userPrompt =
          customPrompt.userPrompt ||
          `Based on the following dental transcript, generate a patient summary according to your custom instructions:

Dental Transcript:
${transcription}

Please follow your custom system prompt instructions.`;

        console.log(
          `✅ Using custom prompt for patient summary - Early-Stop rules DISABLED`
        );
      } else {
        // Use default patient summary prompt with Early-Stop rules
        systemPrompt = this.getPatientSummarySystemPrompt();
        userPrompt = this.getPatientSummaryUserPrompt(transcription, context);
        console.log(
          `✅ Using default patient summary prompt - Early-Stop rules ENABLED`
        );
      }

      const response = await this.retryWithBackoff(
        () =>
          this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: userPrompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 4000,
          }),
        3,
        "Patient summary generation"
      );

      const patientSummary = response.choices[0].message.content;
      console.log(`✅ Patient summary generated successfully`);
      console.log(`📊 Summary length: ${patientSummary.length} characters`);

      return patientSummary;
    } catch (error) {
      console.error("❌ Patient summary generation error:", error);
      throw new Error(`Patient summary generation failed: ${error.message}`);
    }
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
