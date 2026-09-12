class OllamaError(RuntimeError):
    """Base error for communication with Ollama."""


class OllamaDisabledError(OllamaError):
    """Text generation was explicitly disabled in runtime configuration."""


class OllamaUnavailableError(OllamaError):
    """Ollama could not be reached or returned an HTTP error."""


class OllamaResponseError(OllamaError):
    """Ollama returned a response with an unexpected shape."""
