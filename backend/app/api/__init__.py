"""API router registration point for feature routers."""

from fastapi import APIRouter

from app.api.fires import router as fires_router

api_router = APIRouter()
api_router.include_router(fires_router)
