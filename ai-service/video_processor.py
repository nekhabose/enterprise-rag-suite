"""
Video Processor Module for YouTube Ingestion
Handles downloading, audio extraction, transcription
"""
import os
import yt_dlp
import whisper
from typing import Dict, Optional, List
from pathlib import Path
import json

class VideoProcessor:
    """Complete YouTube video processing pipeline"""
    
    def __init__(self, download_dir: str = "temp_videos"):
        """
        Initialize video processor
        
        Args:
            download_dir: Directory for temporary video downloads
        """
        self.download_dir = download_dir
        Path(download_dir).mkdir(exist_ok=True)
        
        # Load Whisper model for transcription
        print("Loading Whisper model...")
        self.whisper_model = whisper.load_model("base")
        print("✅ Whisper model loaded")
    
    def get_video_info(self, url: str) -> Dict:
        """
        Get video metadata without downloading
        
        Args:
            url: YouTube video URL
            
        Returns:
            Dict with video metadata
        """
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                return {
                    'title': info.get('title', 'Unknown'),
                    'duration': info.get('duration', 0),
                    'uploader': info.get('uploader', 'Unknown'),
                    'description': info.get('description', ''),
                    'view_count': info.get('view_count', 0),
                    'upload_date': info.get('upload_date', ''),
                    'thumbnail': info.get('thumbnail', ''),
                    'video_id': info.get('id', ''),
                }
        except Exception as e:
            raise Exception(f"Failed to get video info: {str(e)}")
    
    def download_audio(self, url: str, video_id: int) -> str:
        """
        Download YouTube video as audio file
        
        Args:
            url: YouTube video URL
            video_id: Database video ID
            
        Returns:
            Path to downloaded audio file
        """
        output_template = os.path.join(self.download_dir, f'video_{video_id}.%(ext)s')
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': output_template,
            'quiet': False,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            
            # Return the audio file path
            audio_path = os.path.join(self.download_dir, f'video_{video_id}.mp3')
            
            if not os.path.exists(audio_path):
                raise Exception(f"Audio file not created at {audio_path}")
            
            return audio_path
            
        except Exception as e:
            raise Exception(f"Failed to download audio: {str(e)}")
    
    def transcribe_audio(self, audio_path: str) -> Dict:
        """
        Transcribe audio using Whisper
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Dict with transcript and segments
        """
        try:
            print(f"Transcribing audio: {audio_path}")
            
            # Transcribe with Whisper
            result = self.whisper_model.transcribe(
                audio_path,
                verbose=False,
                language='en'
            )
            
            # Extract full text
            transcript_text = result['text']
            
            # Extract segments with timestamps
            segments = []
            for segment in result.get('segments', []):
                segments.append({
                    'start': segment['start'],
                    'end': segment['end'],
                    'text': segment['text'].strip()
                })
            
            return {
                'text': transcript_text,
                'segments': segments,
                'language': result.get('language', 'en')
            }
            
        except Exception as e:
            raise Exception(f"Transcription failed: {str(e)}")
    
    def process_video(self, url: str, video_id: int) -> Dict:
        """
        Complete video processing pipeline
        
        Args:
            url: YouTube video URL
            video_id: Database video ID
            
        Returns:
            Dict with metadata and transcript
        """
        try:
            # Step 1: Get video info
            print(f"Getting video info for: {url}")
            metadata = self.get_video_info(url)
            
            # Step 2: Download audio
            print(f"Downloading audio...")
            audio_path = self.download_audio(url, video_id)
            
            # Step 3: Transcribe
            print(f"Transcribing audio...")
            transcript_data = self.transcribe_audio(audio_path)
            
            # Step 4: Cleanup
            if os.path.exists(audio_path):
                os.remove(audio_path)
                print(f"Cleaned up: {audio_path}")
            
            return {
                'metadata': metadata,
                'transcript': transcript_data['text'],
                'segments': transcript_data['segments'],
                'language': transcript_data['language']
            }
            
        except Exception as e:
            # Cleanup on error
            audio_path = os.path.join(self.download_dir, f'video_{video_id}.mp3')
            if os.path.exists(audio_path):
                os.remove(audio_path)
            
            raise Exception(f"Video processing failed: {str(e)}")
    
    def chunk_transcript_by_time(
        self, 
        segments: List[Dict], 
        chunk_duration: int = 300
    ) -> List[Dict]:
        """
        Chunk transcript segments by time duration
        
        Args:
            segments: List of transcript segments with timestamps
            chunk_duration: Duration of each chunk in seconds (default 5 minutes)
            
        Returns:
            List of chunked segments
        """
        chunks = []
        current_chunk = []
        current_start = 0
        current_duration = 0
        
        for segment in segments:
            segment_duration = segment['end'] - segment['start']
            
            if current_duration + segment_duration > chunk_duration and current_chunk:
                # Save current chunk
                chunks.append({
                    'start': current_start,
                    'end': segment['start'],
                    'text': ' '.join([s['text'] for s in current_chunk]),
                    'segment_count': len(current_chunk)
                })
                
                # Start new chunk
                current_chunk = [segment]
                current_start = segment['start']
                current_duration = segment_duration
            else:
                if not current_chunk:
                    current_start = segment['start']
                
                current_chunk.append(segment)
                current_duration += segment_duration
        
        # Add final chunk
        if current_chunk:
            chunks.append({
                'start': current_start,
                'end': current_chunk[-1]['end'],
                'text': ' '.join([s['text'] for s in current_chunk]),
                'segment_count': len(current_chunk)
            })
        
        return chunks
    
    def cleanup(self):
        """Clean up temporary files"""
        try:
            import shutil
            if os.path.exists(self.download_dir):
                shutil.rmtree(self.download_dir)
                print(f"✅ Cleaned up {self.download_dir}")
        except Exception as e:
            print(f"⚠️  Cleanup warning: {e}")


# Global instance
video_processor = VideoProcessor()
