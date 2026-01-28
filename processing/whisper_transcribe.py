"""
Whisper Transcription Service
Flask API for transcribing audio files using OpenAI Whisper
"""

import os
import whisper
from flask import Flask, request, jsonify
import traceback

app = Flask(__name__)

# Configuration
WHISPER_MODEL = os.environ.get('WHISPER_MODEL', 'medium')
MODEL_DIR = os.environ.get('MODEL_DIR', '/app/models')

# Load model on startup
print(f"Loading Whisper model: {WHISPER_MODEL}")
model = None

def get_model():
    global model
    if model is None:
        model = whisper.load_model(WHISPER_MODEL, download_root=MODEL_DIR)
        print(f"Whisper model '{WHISPER_MODEL}' loaded successfully")
    return model

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model': WHISPER_MODEL,
        'model_loaded': model is not None
    })

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe an audio file
    
    Request JSON:
    {
        "audio_path": "/path/to/audio.wav"
    }
    
    Response JSON:
    {
        "segments": [
            {
                "start": 0.0,
                "end": 3.5,
                "text": "Hello world",
                "confidence": 0.95
            }
        ],
        "language": "en",
        "duration": 1800.5
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'audio_path' not in data:
            return jsonify({'error': 'audio_path is required'}), 400
        
        audio_path = data['audio_path']
        
        if not os.path.exists(audio_path):
            return jsonify({'error': f'Audio file not found: {audio_path}'}), 404
        
        print(f"Transcribing: {audio_path}")
        
        # Get model
        whisper_model = get_model()
        
        # Transcribe with word-level timestamps
        result = whisper_model.transcribe(
            audio_path,
            language=data.get('language', None),  # Auto-detect if not specified
            verbose=False,
            word_timestamps=True
        )
        
        # Format segments
        segments = []
        for seg in result['segments']:
            segment_data = {
                'start': round(seg['start'], 2),
                'end': round(seg['end'], 2),
                'text': seg['text'].strip(),
                'confidence': round(seg.get('avg_logprob', 0) * -1, 3) if 'avg_logprob' in seg else None
            }
            segments.append(segment_data)
        
        print(f"Transcription complete: {len(segments)} segments")
        
        return jsonify({
            'segments': segments,
            'language': result.get('language', 'unknown'),
            'duration': segments[-1]['end'] if segments else 0
        })
        
    except Exception as e:
        print(f"Transcription error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/models', methods=['GET'])
def list_models():
    """List available Whisper models"""
    return jsonify({
        'available': ['tiny', 'base', 'small', 'medium', 'large'],
        'current': WHISPER_MODEL,
        'description': {
            'tiny': '39M parameters, fastest, least accurate',
            'base': '74M parameters, fast, good for quick transcription',
            'small': '244M parameters, balanced',
            'medium': '769M parameters, good accuracy (recommended)',
            'large': '1550M parameters, best accuracy, slowest'
        }
    })

if __name__ == '__main__':
    # Pre-load model
    print("Pre-loading Whisper model...")
    get_model()
    
    # Start Flask server
    port = int(os.environ.get('WHISPER_PORT', 5000))
    print(f"Starting Whisper service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
