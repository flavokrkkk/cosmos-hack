from fastapi import APIRouter

from app.api.v1.routers.admin.auth import router as auth_router


api_v1_routers = APIRouter(prefix="/admin")
api_v1_routers.include_router(auth_router, prefix="/auth", tags=["admin-auth"])
