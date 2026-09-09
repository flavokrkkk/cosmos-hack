from collections.abc import Sequence
from typing import Any

import httpx

from app.core.dto.ollama import OllamaChatResult, OllamaMessage
from app.infrastructure.errors.ollama_errors import (
    OllamaResponseError,
    OllamaUnavailableError,
)


class OllamaClient:
    """Low-level async client for Ollama's HTTP API."""

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._owns_client = http_client is None
        self._http = http_client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(timeout_seconds),
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def list_models(self) -> list[str]:
        payload = await self._request("GET", "/api/tags")
        models = payload.get("models")
        if not isinstance(models, list):
            raise OllamaResponseError("Ollama response does not contain models")
        return [
            str(model["name"])
            for model in models
            if isinstance(model, dict) and model.get("name")
        ]

    async def chat(
        self,
        *,
        model: str,
        messages: Sequence[OllamaMessage],
        temperature: float = 0.2,
    ) -> OllamaChatResult:
        payload = await self._request(
            "POST",
            "/api/chat",
            json={
                "model": model,
                "messages": [message.model_dump() for message in messages],
                "stream": False,
                "options": {"temperature": temperature},
            },
        )
        message = payload.get("message")
        if not isinstance(message, dict) or not isinstance(message.get("content"), str):
            raise OllamaResponseError("Ollama response does not contain message.content")

        return OllamaChatResult(
            model=str(payload.get("model", model)),
            content=message["content"],
            done_reason=payload.get("done_reason"),
            total_duration=payload.get("total_duration"),
            prompt_eval_count=payload.get("prompt_eval_count"),
            eval_count=payload.get("eval_count"),
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = await self._http.request(method, path, **kwargs)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise OllamaUnavailableError(f"Ollama request failed: {error}") from error

        if not isinstance(payload, dict):
            raise OllamaResponseError("Ollama returned a non-object response")
        return payload
