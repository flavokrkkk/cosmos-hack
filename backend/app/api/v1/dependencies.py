from fastapi import Request

from app.core.services.ollama_service import OllamaService


async def get_ollama_service(request: Request) -> OllamaService:
    return request.app.state.ollama_service
