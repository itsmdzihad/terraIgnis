"""API router registration point for feature routers."""

from fastapi import APIRouter

from app.api.anomaly import router as anomalies_router
from app.api.calendar import router as calendar_router
from app.api.fires import router as fires_router
from app.api.stats import router as stats_router

api_router = APIRouter()
api_router.include_router(anomalies_router)
api_router.include_router(fires_router)
api_router.include_router(calendar_router)
api_router.include_router(stats_router)
