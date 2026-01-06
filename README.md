# 🌍 Transly - Real-Time Voice Translator

A powerful, real-time voice translation application that converts speech from one language to another using AI-powered speech recognition, translation, and text-to-speech technologies.

## ✨ Features

- 🎤 **Real-Time Speech Recognition** - Powered by OpenAI Whisper models
- 🌐 **Multi-Language Support** - Translate between 13+ languages
- 🔄 **Auto Language Detection** - Automatically detect the source language
- 🔊 **Text-to-Speech Output** - Hear the translated text spoken aloud
- 🌓 **Dark Mode** - Beautiful dark/light theme toggle
- ⚡ **Optimized Performance** - Fast translation pipeline (~11-16 seconds)
- 📝 **Live Transcription** - See your spoken words transcribed in real-time
- 🔁 **Audio Replay** - Replay translated audio anytime

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Hugging Face API token ([Get one here](https://huggingface.co/settings/tokens))

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd "Voice Translator"
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

4. **Configure environment variables**

Create a `.env` file in the `backend` directory:
```env
HUGGING_FACE_TOKEN=your_huggingface_token_here
PORT=5000
```

### Running the Application

1. **Start the backend server**
```bash
cd backend
node server.js
```
The server will start on `http://localhost:5000`

2. **Start the frontend** (in a new terminal)
```bash
cd frontend
npm start
```
The app will open at `http://localhost:3000`

## 🎯 How to Use

1. **Select Languages**
   - Choose source language (or "Auto-Detect")
   - Choose target language for translation

2. **Record Audio**
   - Click the microphone icon in the source text area
   - Speak clearly into your microphone
   - The recording will automatically process

3. **View Results**
   - Original transcription appears in the left panel
   - Translated text appears in the right panel
   - Translated audio plays automatically

4. **Replay Translation**
   - Click the speaker icon (🔊) to replay the translated audio

## 🛠️ Tech Stack

### Frontend
- **React** - UI framework
- **Socket.io Client** - Real-time communication
- **Tailwind CSS** - Styling
- **Material Symbols** - Icons

### Backend
- **Node.js** - Runtime environment
- **Express** - Web server framework
- **Socket.io** - WebSocket communication
- **Axios** - HTTP client for API requests
- **Google TTS** - Text-to-speech fallback

### AI Services
- **Hugging Face Inference API** - Speech recognition, translation, and TTS
- **OpenAI Whisper** - Speech-to-text models
- **Helsinki-NLP** - Translation models
- **Facebook MMS-TTS** - Text-to-speech models

## 📋 Supported Languages

- English
- Spanish
- French
- German
- Italian
- Portuguese
- Russian
- Japanese
- Chinese (Mandarin)
- Hindi
- Arabic
- Korean
- Urdu

## ⚙️ Configuration

### API Timeouts
Optimized for fast response times:
- STT: 15 seconds
- Language Detection: 10 seconds
- Translation: 30 seconds
- TTS: 20 seconds

### Models Used
- **STT**: `openai/whisper-base` (primary), `openai/whisper-large-v3` (fallback)
- **Translation**: `Helsinki-NLP/opus-mt-*` series with English pivot
- **TTS**: `facebook/mms-tts-*` (language-specific) + Google TTS fallback

## 🔧 Development

### Project Structure
```
Voice Translator/
├── backend/
│   ├── server.js          # Main server file
│   ├── .env              # Environment variables
│   └── package.json      # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.jsx   # Main app component
│   │   │   └── VoiceTranslator.jsx
│   │   └── App.css       # Styles
│   └── package.json      # Frontend dependencies
└── README.md
```

### Key Features Implementation

**Dark Mode**: Automatic theme switching with CSS custom properties

**Real-time Updates**: Socket.io events for immediate feedback
- `transcription-update` - Shows transcribed text
- `translated-audio` - Delivers final translation
- `status-update` - Pipeline progress
- `error` - Error handling

**Performance Optimization**:
- Fast STT models
- Reduced API timeouts
- Progressive rendering

## 🐛 Troubleshooting

### No audio detected
- Check microphone permissions in browser
- Ensure microphone is not muted
- Try a different browser (Chrome/Edge recommended)

### Translation fails
- Verify Hugging Face API token is valid
- Check internet connection
- Try selecting source language manually instead of "Auto"

### 404 Errors from Hugging Face
- Ensure you're using the router endpoint: `router.huggingface.co/hf-inference`
- Check that your API token has Inference permissions

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- OpenAI Whisper for speech recognition
- Hugging Face for AI model hosting
- Helsinki-NLP for translation models
- Create React App for frontend boilerplate

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

---

Made with ❤️ using AI-powered technologies
