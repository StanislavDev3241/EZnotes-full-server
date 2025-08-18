const OpenAI = require("openai");
const fs = require("fs").promises;
const path = require("path");

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Transcribe audio with Whisper API
  async transcribeAudio(audioFilePath) {
    try {
      console.log(`🎵 Transcribing audio file: ${audioFilePath}`);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1",
        response_format: "text",
      });

      console.log(
        `✅ Transcription completed: ${transcription.length} characters`
      );
      return transcription;
    } catch (error) {
      console.error("❌ Whisper API error:", error);
      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  // Generate notes with custom prompt
  async generateNotes(transcription, customPrompt, context = {}) {
    try {
      console.log(
        `🤖 Generating notes with custom prompt for ${transcription.length} characters`
      );

      const systemPrompt =
        customPrompt.systemPrompt ||
        `SOAP note generator update; SYSTEM PROMPT — Dental SOAP Note Generator (Compact, <8k)

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

      const userPrompt =
        customPrompt.userPrompt ||
        `Based on the following dental transcript, generate a comprehensive SOAP note following the system prompt guidelines.

Dental Transcript:
${transcription}

Context: ${JSON.stringify(context)}

Please follow the exact output format specified in the system prompt, including the META JSON block and structured SOAP note with proper headings.`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const response = completion.choices[0].message.content;
      console.log(
        `✅ Notes generated successfully: ${response.length} characters`
      );

      return response;
    } catch (error) {
      console.error("❌ GPT API error:", error);
      throw new Error(`Note generation failed: ${error.message}`);
    }
  }

  // Chat with AI for note improvement
  async chatWithAI(conversationHistory, userMessage, noteContext) {
    try {
      console.log(
        `💬 Processing chat message: ${userMessage.length} characters`
      );

      // Build system message with note context
      let systemContent = `You are a dental AI assistant helping to improve dental SOAP notes and answer questions about dental procedures.

Your role:
- Provide helpful suggestions for SOAP note improvement
- Clarify dental terminology and concepts
- Suggest additions for missing information
- Ensure compliance with dental documentation standards
- Answer questions about dental procedures, materials, and techniques
- Help refine and enhance dental SOAP notes
- Follow dental-specific guidelines and best practices`;

      // Add note context if available
      if (noteContext && Object.keys(noteContext).length > 0) {
        systemContent += `\n\nCurrent note context:
- File: ${noteContext.fileName || "Unknown"}
- Custom Instructions: ${noteContext.customPrompt || "Default"}
- Transcription: ${
          noteContext.transcription
            ? noteContext.transcription.substring(0, 500) + "..."
            : "Not available"
        }
- SOAP Note: ${
          noteContext.soapNote
            ? noteContext.soapNote.substring(0, 500) + "..."
            : "Not available"
        }
- Patient Summary: ${
          noteContext.patientSummary
            ? noteContext.patientSummary.substring(0, 300) + "..."
            : "Not available"
        }`;
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

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: messages,
        max_tokens: parseInt(process.env.CHAT_MAX_TOKENS) || 1000,
        temperature: parseFloat(process.env.CHAT_TEMPERATURE) || 0.3,
      });

      const response = completion.choices[0].message.content;
      console.log(`✅ Chat response generated: ${response.length} characters`);

      return response;
    } catch (error) {
      console.error("❌ Chat API error:", error);
      throw new Error(`Chat processing failed: ${error.message}`);
    }
  }

  // Analyze note for missing information
  async analyzeNoteCompleteness(noteContent, procedureType) {
    try {
      console.log(`🔍 Analyzing note completeness for ${procedureType}`);

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

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
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
      });

      const response = completion.choices[0].message.content;
      const analysis = JSON.parse(response);

      console.log(
        `✅ Note analysis completed: ${analysis.overallQuality} quality`
      );
      return analysis;
    } catch (error) {
      console.error("❌ Note analysis error:", error);
      throw new Error(`Note analysis failed: ${error.message}`);
    }
  }
}

module.exports = new OpenAIService();
