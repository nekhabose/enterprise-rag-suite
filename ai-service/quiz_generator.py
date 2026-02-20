"""
Quiz Generator Module
Generates quizzes from documents and videos with AI
"""
import json
from typing import List, Dict, Any, Optional
from enum import Enum

class QuestionType(Enum):
    """Types of questions that can be generated"""
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    FILL_BLANK = "fill_blank"
    ESSAY = "essay"

class DifficultyLevel(Enum):
    """Difficulty levels for questions"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"

class QuizGenerator:
    """Generate quizzes from content using LLMs"""
    
    def __init__(self, openai_client=None, groq_client=None):
        """
        Initialize quiz generator
        
        Args:
            openai_client: OpenAI client instance
            groq_client: Groq client instance
        """
        self.openai_client = openai_client
        self.groq_client = groq_client
    
    def generate_quiz(
        self,
        content: str,
        question_count: int = 5,
        difficulty: str = "medium",
        question_types: Optional[List[str]] = None,
        provider: str = "groq"
    ) -> Dict[str, Any]:
        """
        Generate a complete quiz from content
        
        Args:
            content: Source material for quiz
            question_count: Number of questions to generate
            difficulty: Difficulty level (easy/medium/hard)
            question_types: List of question types to include
            provider: LLM provider to use
            
        Returns:
            Dict with quiz data
        """
        if question_types is None:
            question_types = ["multiple_choice", "true_false", "short_answer"]
        
        # Build prompt
        prompt = self._build_quiz_prompt(
            content, 
            question_count, 
            difficulty, 
            question_types
        )
        
        # Generate quiz using LLM
        if provider == "openai" and self.openai_client:
            response = self._generate_with_openai(prompt)
        elif provider == "groq" and self.groq_client:
            response = self._generate_with_groq(prompt)
        else:
            raise ValueError(f"Provider {provider} not available")
        
        # Parse and validate response
        quiz_data = self._parse_quiz_response(response)
        
        return quiz_data
    
    def generate_mcq(
        self,
        content: str,
        count: int = 5,
        difficulty: str = "medium",
        provider: str = "groq"
    ) -> List[Dict]:
        """
        Generate multiple choice questions
        
        Args:
            content: Source material
            count: Number of questions
            difficulty: Difficulty level
            provider: LLM provider
            
        Returns:
            List of MCQ questions
        """
        prompt = f"""Based on the following content, generate {count} multiple choice questions at {difficulty} difficulty level.

Content:
{content[:3000]}

Generate questions in this EXACT JSON format:
{{
  "questions": [
    {{
      "question": "Question text here?",
      "options": [
        "A) First option",
        "B) Second option", 
        "C) Third option",
        "D) Fourth option"
      ],
      "correct_answer": "A) First option",
      "explanation": "Why this answer is correct",
      "difficulty": "{difficulty}"
    }}
  ]
}}

Requirements:
- Questions must be clear and unambiguous
- All 4 options should be plausible
- Only one correct answer
- Explanation should teach the concept
- Questions should test understanding, not just memorization

Return ONLY valid JSON, no other text."""

        if provider == "openai" and self.openai_client:
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2000
            )
            result = response.choices[0].message.content
        elif provider == "groq" and self.groq_client:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2000
            )
            result = response.choices[0].message.content
        else:
            raise ValueError(f"Provider {provider} not available")
        
        # Parse JSON response
        try:
            result_clean = result.strip()
            if result_clean.startswith("```json"):
                result_clean = result_clean[7:]
            if result_clean.endswith("```"):
                result_clean = result_clean[:-3]
            result_clean = result_clean.strip()
            
            data = json.loads(result_clean)
            return data.get("questions", [])
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Raw response: {result[:500]}")
            return []
    
    def generate_true_false(
        self,
        content: str,
        count: int = 5,
        difficulty: str = "medium",
        provider: str = "groq"
    ) -> List[Dict]:
        """Generate true/false questions"""
        
        prompt = f"""Based on the following content, generate {count} true/false questions at {difficulty} difficulty.

Content:
{content[:3000]}

Generate in this EXACT JSON format:
{{
  "questions": [
    {{
      "statement": "Clear factual statement",
      "correct_answer": true,
      "explanation": "Why this is true/false"
    }}
  ]
}}

Requirements:
- Statements should be clear and specific
- Mix of true and false statements
- Avoid trick questions
- Explanations should clarify the concept

Return ONLY valid JSON."""

        if provider == "openai" and self.openai_client:
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            result = response.choices[0].message.content
        elif provider == "groq" and self.groq_client:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            result = response.choices[0].message.content
        else:
            raise ValueError(f"Provider {provider} not available")
        
        try:
            result_clean = result.strip()
            if result_clean.startswith("```json"):
                result_clean = result_clean[7:]
            if result_clean.endswith("```"):
                result_clean = result_clean[:-3]
            result_clean = result_clean.strip()
            
            data = json.loads(result_clean)
            return data.get("questions", [])
        except json.JSONDecodeError:
            return []
    
    def generate_short_answer(
        self,
        content: str,
        count: int = 3,
        difficulty: str = "medium",
        provider: str = "groq"
    ) -> List[Dict]:
        """Generate short answer questions"""
        
        prompt = f"""Based on the following content, generate {count} short answer questions at {difficulty} difficulty.

Content:
{content[:3000]}

Generate in this EXACT JSON format:
{{
  "questions": [
    {{
      "question": "Question requiring 2-3 sentence answer?",
      "key_points": [
        "Point 1 that should be mentioned",
        "Point 2 that should be mentioned"
      ],
      "sample_answer": "Example of good answer"
    }}
  ]
}}

Requirements:
- Questions should require understanding, not just recall
- Key points help with grading
- Sample answer shows expected depth

Return ONLY valid JSON."""

        if provider == "openai" and self.openai_client:
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            result = response.choices[0].message.content
        elif provider == "groq" and self.groq_client:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            result = response.choices[0].message.content
        else:
            raise ValueError(f"Provider {provider} not available")
        
        try:
            result_clean = result.strip()
            if result_clean.startswith("```json"):
                result_clean = result_clean[7:]
            if result_clean.endswith("```"):
                result_clean = result_clean[:-3]
            result_clean = result_clean.strip()
            
            data = json.loads(result_clean)
            return data.get("questions", [])
        except json.JSONDecodeError:
            return []
    
    def grade_answer(
        self,
        question: str,
        correct_answer: str,
        student_answer: str,
        question_type: str = "short_answer",
        provider: str = "groq"
    ) -> Dict[str, Any]:
        """
        Grade a student's answer using AI
        
        Args:
            question: The question asked
            correct_answer: Expected/correct answer
            student_answer: Student's submitted answer
            question_type: Type of question
            provider: LLM provider
            
        Returns:
            Dict with score and feedback
        """
        
        if question_type == "multiple_choice" or question_type == "true_false":
            # Exact match for MCQ and T/F
            is_correct = student_answer.strip().lower() == correct_answer.strip().lower()
            return {
                "score": 100 if is_correct else 0,
                "feedback": "Correct!" if is_correct else f"Incorrect. The correct answer is: {correct_answer}",
                "strengths": ["Answered the question"] if is_correct else [],
                "improvements": [] if is_correct else ["Review this topic"]
            }
        
        # AI grading for open-ended questions
        prompt = f"""Grade this student answer on a scale of 0-100.

Question: {question}

Expected Answer/Key Points: {correct_answer}

Student's Answer: {student_answer}

Provide grading in this EXACT JSON format:
{{
  "score": 85,
  "feedback": "Detailed feedback on the answer",
  "strengths": [
    "What the student did well",
    "Another strength"
  ],
  "improvements": [
    "What could be improved",
    "Another improvement"
  ],
  "missing_points": [
    "Key point not mentioned"
  ]
}}

Grading criteria:
- Accuracy of information (40%)
- Completeness of answer (30%)
- Understanding demonstrated (20%)
- Clarity of explanation (10%)

Be fair but constructive. Return ONLY valid JSON."""

        if provider == "openai" and self.openai_client:
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3  # Lower temperature for consistent grading
            )
            result = response.choices[0].message.content
        elif provider == "groq" and self.groq_client:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3
            )
            result = response.choices[0].message.content
        else:
            raise ValueError(f"Provider {provider} not available")
        
        try:
            result_clean = result.strip()
            if result_clean.startswith("```json"):
                result_clean = result_clean[7:]
            if result_clean.endswith("```"):
                result_clean = result_clean[:-3]
            result_clean = result_clean.strip()
            
            grading = json.loads(result_clean)
            
            # Ensure score is within range
            score = max(0, min(100, grading.get("score", 0)))
            grading["score"] = score
            
            return grading
        except json.JSONDecodeError:
            return {
                "score": 50,
                "feedback": "Unable to process grading automatically. Please review manually.",
                "strengths": [],
                "improvements": []
            }
    
    def _build_quiz_prompt(
        self,
        content: str,
        question_count: int,
        difficulty: str,
        question_types: List[str]
    ) -> str:
        """Build comprehensive quiz generation prompt"""
        
        types_desc = ", ".join(question_types)
        
        prompt = f"""Create a {difficulty} difficulty quiz with {question_count} questions from this content.

Content:
{content[:4000]}

Question types to include: {types_desc}

Generate in this EXACT JSON format:
{{
  "quiz_title": "Brief descriptive title",
  "difficulty": "{difficulty}",
  "total_questions": {question_count},
  "questions": [
    {{
      "type": "multiple_choice",
      "question": "Question text?",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A) ...",
      "explanation": "Why this is correct",
      "points": 1
    }}
  ]
}}

Requirements:
- Mix question types appropriately
- Questions should test understanding
- Provide clear explanations
- Ensure variety in topics covered

Return ONLY valid JSON."""
        
        return prompt
    
    def _generate_with_openai(self, prompt: str) -> str:
        """Generate using OpenAI"""
        response = self.openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=3000
        )
        return response.choices[0].message.content
    
    def _generate_with_groq(self, prompt: str) -> str:
        """Generate using Groq"""
        response = self.groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=3000
        )
        return response.choices[0].message.content
    
    def _parse_quiz_response(self, response: str) -> Dict:
        """Parse and validate quiz JSON response"""
        try:
            # Clean response
            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()
            
            quiz_data = json.loads(response_clean)
            
            # Validate structure
            if "questions" not in quiz_data:
                raise ValueError("No questions in response")
            
            return quiz_data
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON response: {e}")


# Global instance
quiz_generator = None

def initialize_quiz_generator(openai_client=None, groq_client=None):
    """Initialize global quiz generator"""
    global quiz_generator
    quiz_generator = QuizGenerator(openai_client, groq_client)
