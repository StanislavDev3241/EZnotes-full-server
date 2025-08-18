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
        "You are a medical AI assistant specializing in creating professional SOAP notes and patient summaries. Generate comprehensive, accurate, and HIPAA-compliant medical documentation.";

      const userPrompt =
        customPrompt.userPrompt ||
        `Based on the following medical transcript, generate a comprehensive SOAP note and patient summary. 
        
        SOAP Note Requirements:
        - Subjective: Patient's chief complaint and history
        - Objective: Clinical findings and examination results
        - Assessment: Diagnosis and clinical impression
        - Plan: Treatment plan and follow-up recommendations
        
        Patient Summary Requirements:
        - Clear, patient-friendly language
        - Key findings and recommendations
        - Follow-up instructions
        
        Medical Transcript:
        ${transcription}
        
        Context: ${JSON.stringify(context)}`;

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

      const messages = [
        {
          role: "system",
          content: `You are a medical AI assistant helping to improve medical notes. 
          
          Your role:
          - Provide helpful suggestions for note improvement
          - Clarify medical terminology and concepts
          - Suggest additions for missing information
          - Ensure HIPAA compliance and accuracy
          
          Current note context: ${JSON.stringify(noteContext)}`,
        },
        ...conversationHistory.map((msg) => ({
          role: msg.sender_type === "user" ? "user" : "assistant",
          content: msg.message_text,
        })),
        { role: "user", content: userMessage },
      ];

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3,
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
