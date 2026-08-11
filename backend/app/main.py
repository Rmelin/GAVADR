from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    app_settings, audit_logs, auth, dashboard, health, history, incidents, inquiries, map_corrections, network, planned_shutdowns, public_status,
    suppliers, tasks, users,
)
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")

if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

app.include_router(health.router, prefix="/api")
app.include_router(app_settings.router, prefix="/api")
app.include_router(audit_logs.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(planned_shutdowns.router, prefix="/api")
app.include_router(public_status.router, prefix="/api")
app.include_router(inquiries.router, prefix="/api")
app.include_router(map_corrections.router, prefix="/api")
app.include_router(suppliers.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(network.router, prefix="/api")
