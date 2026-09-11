from collections.abc import Mapping, Sequence
from typing import Any

import aiohttp

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
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        self._session = aiohttp.ClientSession(
            base_url=base_url.rstrip("/"),
            timeout=aiohttp.ClientTimeout(total=timeout_seconds),
            auth=(
                aiohttp.BasicAuth(username, password)
                if username and password
                else None
            ),
        )

    async def close(self) -> None:
        await self._session.close()

    async def chat(
        self,
        *,
        model: str,
        messages: Sequence[OllamaMessage],
        temperature: float = 0.2,
        format_schema: Mapping[str, Any] | None = None,
        think: bool = False,
        num_predict: int = 600,
        num_ctx: int | None = None,
        timeout_seconds: float | None = None,
    ) -> OllamaChatResult:
        body: dict[str, Any] = {
            "model": model,
            "messages": [message.model_dump() for message in messages],
            "stream": False,
            "think": think,
            "options": {"temperature": temperature, "num_predict": num_predict},
        }
        if format_schema is not None:
            body["format"] = dict(format_schema)
        if num_ctx is not None:
            body["options"]["num_ctx"] = num_ctx
        try:
            async with self._session.post(
                "/api/chat",
                json=body,
                **({"timeout": aiohttp.ClientTimeout(total=timeout_seconds)} if timeout_seconds is not None else {}),
            ) as response:
                response.raise_for_status()
                payload = await response.json()
        except (aiohttp.ClientError, TimeoutError, ValueError) as error:
            raise OllamaUnavailableError(f"Ollama request failed: {error}") from error

        if not isinstance(payload, dict):
            raise OllamaResponseError("Ollama returned a non-object response")
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
