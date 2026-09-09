from fastapi import APIRouter

from app.api.v1.routers.admin import api_v1_routers as admin_routers


api_v1_routers = APIRouter()
api_v1_routers.include_router(admin_routers)
