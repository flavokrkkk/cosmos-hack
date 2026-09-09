from collections.abc import Sequence

from app.core.clients.ollama_client import OllamaClient
from app.core.dto.ollama import OllamaChatResult, OllamaMessage


class OllamaService:
    """Application-facing LLM service independent of Ollama's wire format."""

    def __init__(self, client: OllamaClient, default_model: str) -> None:
        self._client = client
        self._default_model = default_model

    async def chat(
        self,
        messages: Sequence[OllamaMessage],
        *,
        model: str | None = None,
        temperature: float = 0.2,
    ) -> OllamaChatResult:
        return await self._client.chat(
            model=model or self._default_model,
            messages=messages,
            temperature=temperature,
        )

    async def answer(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        context: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
    ) -> OllamaChatResult:
        messages: list[OllamaMessage] = []
        if system_prompt:
            messages.append(OllamaMessage(role="system", content=system_prompt))

        user_content = prompt
        if context:
            user_content = f"Context:\n{context}\n\nRequest:\n{prompt}"
        messages.append(OllamaMessage(role="user", content=user_content))

        return await self.chat(
            messages,
            model=model,
            temperature=temperature,
        )
