# EZNotes.pro MVP

A single-page web application that allows healthcare professionals to upload patient visit transcripts and receive AI-generated SOAP notes and patient summaries.

## 🎯 Overview

EZNotes.pro is designed to streamline clinical documentation by:

- Accepting .txt file uploads (transcripts of patient visits)
- Generating professional SOAP notes using AI
- Creating patient-friendly summaries in plain language
- Providing instant copy/download functionality

## 🚀 Features

- **Clean, Modern UI**: Built with React and Tailwind CSS
- **Drag & Drop Upload**: Easy file upload with visual feedback
- **Real-time Processing**: Simulated AI processing with loading states
- **Dual Output**: SOAP notes and patient summaries
- **Copy & Download**: Multiple ways to access generated content
- **Responsive Design**: Works on desktop and mobile devices

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Backend Integration**: Ready for Make.com webhook integration

## 📦 Installation

1. **Clone the repository** (if applicable)
2. **Install dependencies**:

   ```bash
   cd clearlyai
   npm install
   ```

3. **Start development server**:

   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to `http://localhost:5173`

## 🔧 Configuration

### Make.com Integration

The application is now integrated with your Make.com webhook at:
`https://hook.us2.make.com/xw5ld4jn0by5jn7hg1bups02srki06f8`

The webhook expects:

- File upload via FormData
- Returns JSON with `soap_note_text` and `patient_summary_text` fields

Ensure your Make.com scenario handles:

- File upload validation
- OpenAI Whisper transcription (for audio files)
- OpenAI GPT-4o for SOAP note generation
- OpenAI GPT-4o for patient summary generation

### Environment Variables

Create a `.env` file for production:

```env
VITE_MAKE_WEBHOOK_URL=your_make_webhook_url_here
VITE_MAKE_API_KEY=your_make_api_key_here
```

## 🏗 Project Structure

```
clearlyai/
├── src/
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles with Tailwind
├── public/              # Static assets
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
├── tailwind.config.js   # Tailwind configuration
└── vite.config.ts       # Vite configuration
```

## 🚀 Deployment

### Vercel (Recommended)

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel --prod`

### Netlify

1. Build: `npm run build`
2. Deploy the `dist` folder

### Framer

1. Connect your GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`

## 🔒 Security & Privacy

- All file uploads are processed temporarily and not stored
- Privacy notice displayed in footer
- Ready for HIPAA compliance considerations

## 📋 MVP Checklist

- [x] Responsive MVP landing page
- [x] Working file upload (text first, audio optional)
- [x] Integration with Make.com webhook
- [ ] Integration with OpenAI GPT-4o and Whisper
- [x] Output formatted and presented to user
- [ ] Publishing to live domain

## 🎨 Customization

### Colors

Update `tailwind.config.js` to modify the brand colors:

```js
colors: {
  'clearly-blue': '#1e40af',
  'clearly-light-blue': '#3b82f6',
}
```

### Content

Edit the mock responses in `src/App.tsx` to customize the AI-generated content format.

## 📞 Support

For questions about the MVP implementation, refer to the original build brief or contact the development team.

---

**Note**: This is an MVP implementation. For production use, ensure proper security measures, error handling, and HIPAA compliance are implemented.
