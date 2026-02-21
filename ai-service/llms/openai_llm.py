"""
OpenAI LLM Implementation
GPT-3.5, GPT-4, and other OpenAI models
"""
from .base_llm import BaseLLM
from typing import List, Dict, Optional

class OpenAILLM(BaseLLM):
    """
    OpenAI LLM implementation
    Supports GPT-3.5-turbo, GPT-4, GPT-4-turbo, etc.
    """
    
    def __init__(
        self,
        client,
        model: str = "gpt-3.5-turbo",
        **kwargs
    ):
        """
        Initialize OpenAI LLM
        
        Args:
            client: OpenAI client instance
            model: Model name
        """
        super().__init__(model=model, **kwargs)
        self.client = client
        self.model = model

    def _should_use_responses_api(self) -> bool:
        return self.model.startswith("gpt-5")

    def _resolve_model_for_call(self) -> str:
        if self._should_use_responses_api() and not hasattr(self.client, "responses"):
            print(
                "⚠️ OpenAI SDK without responses API detected; "
                "falling back from GPT-5 to gpt-4.1-mini"
            )
            return "gpt-4.1-mini"
        return self.model

    def _extract_response_text(self, response) -> str:
        output_text = getattr(response, "output_text", None)
        if output_text:
            return output_text

        for item in getattr(response, "output", []) or []:
            for content_item in getattr(item, "content", []) or []:
                text = getattr(content_item, "text", None)
                if text:
                    return text
        raise Exception("No text content returned by OpenAI response")
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """Generate text completion"""
        try:
            messages = []

            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            messages.append({"role": "user", "content": prompt})

            model_for_call = self._resolve_model_for_call()
            use_responses_api = model_for_call.startswith("gpt-5")

            if use_responses_api:
                if not hasattr(self.client, "responses"):
                    raise Exception("OpenAI responses API not available")

                response = self.client.responses.create(
                    model=model_for_call,
                    input=messages,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    **kwargs
                )
                return self._extract_response_text(response)

            response = self.client.chat.completions.create(
                model=model_for_call,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )

            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"OpenAI generation failed: {str(e)}")
    
    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> str:
        """Generate chat completion"""
        try:
            self.validate_messages(messages)

            model_for_call = self._resolve_model_for_call()
            use_responses_api = model_for_call.startswith("gpt-5")

            if use_responses_api:
                if not hasattr(self.client, "responses"):
                    raise Exception("OpenAI responses API not available")
                response = self.client.responses.create(
                    model=model_for_call,
                    input=messages,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    **kwargs
                )
                return self._extract_response_text(response)

            response = self.client.chat.completions.create(
                model=model_for_call,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )

            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"OpenAI chat generation failed: {str(e)}")
    
    def get_name(self) -> str:
        """Get LLM name"""
        return f"openai_{self.model.replace('-', '_').replace('.', '_')}"
    
    def get_description(self) -> str:
        """Get LLM description"""
        return f"OpenAI {self.model}"
    
    def get_model(self) -> str:
        """Get model identifier"""
        return self.model
