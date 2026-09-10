import logging
from typing import Any

import structlog

from app.infrastructure.config.config import settings


def configure_logging() -> None:
    # Access requests are emitted by LoggingMiddleware with a request id and timing.
    logging.getLogger("uvicorn.access").disabled = True

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer()
            if settings.app.debug
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(
        level=logging.DEBUG if settings.app.debug else logging.INFO,
        format="%(message)s",
    )


def get_logger(name: str = __name__) -> Any:
    return structlog.get_logger(name)
