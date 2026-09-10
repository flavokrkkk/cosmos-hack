import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.infrastructure.config.config import settings
from app.infrastructure.logging.logger import get_logger


logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            process_time = time.perf_counter() - started_at
            logger.exception(
                "request_error",
                method=request.method,
                path=request.url.path,
                query_params=str(request.query_params) if request.query_params else None,
                process_time=round(process_time, 3),
            )
            raise

        process_time = time.perf_counter() - started_at
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(round(process_time, 6))
        is_slow = process_time > settings.app.slow_request_threshold
        log = logger.warning if is_slow else logger.info
        log(
            "slow_request" if is_slow else "request_completed",
            method=request.method,
            path=request.url.path,
            query_params=str(request.query_params) if request.query_params else None,
            status_code=response.status_code,
            process_time=round(process_time, 3),
        )
        return response
