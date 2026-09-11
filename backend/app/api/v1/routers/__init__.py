from fastapi import APIRouter

from app.api.v1.routers.admin import api_v1_routers as admin_routers
from app.api.v1.routers.portfolio import router as portfolio_router


api_v1_routers = APIRouter()
api_v1_routers.include_router(admin_routers)
api_v1_routers.include_router(portfolio_router)
