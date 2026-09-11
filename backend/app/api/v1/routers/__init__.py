from fastapi import APIRouter

from app.api.v1.routers.portfolio import router as portfolio_router


api_v1_routers = APIRouter()
api_v1_routers.include_router(portfolio_router)
