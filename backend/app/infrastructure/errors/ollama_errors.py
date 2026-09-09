class OllamaError(RuntimeError):
    """Base error for communication with Ollama."""


class OllamaUnavailableError(OllamaError):
    """Ollama could not be reached or returned an HTTP error."""


class OllamaResponseError(OllamaError):
    """Ollama returned a response with an unexpected shape."""
