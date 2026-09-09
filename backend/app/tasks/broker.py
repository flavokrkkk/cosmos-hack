from taskiq_redis import RedisStreamBroker

from app.infrastructure.config.config import settings


broker = RedisStreamBroker(settings.redis_url)


@broker.task
async def worker_ping() -> str:
    return "pong"
