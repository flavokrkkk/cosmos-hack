from taskiq_redis import RedisStreamBroker

from app.infrastructure.config.config import settings


broker = RedisStreamBroker(settings.redis.url)


@broker.task
async def worker_ping() -> str:
    return "pong"


from app.tasks import portfolio_explanation as _portfolio_explanation  # noqa: E402, F401
