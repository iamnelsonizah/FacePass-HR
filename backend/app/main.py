"""FacePass — FastAPI Backend Application.

Contactless facial attendance & intelligent geo-fenced timeclock.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, employees, attendance, admin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler.

    Starts FacePass backend immediately so health checks succeed instantly.
    Loads InsightFace model in a background thread.
    """
    import os
    import threading
    from app.services.face_recognition import face_service

    logger.info("Starting FacePass backend...")

    if os.getenv("LOAD_FACE_MODEL_ON_STARTUP", "false").lower() in ("true", "1", "yes"):
        thread = threading.Thread(target=face_service.load_model, daemon=True)
        thread.start()
    else:
        logger.info("Startup face model loading disabled (keeps memory footprint under 50MB for cloud).")

    yield

    # Shutdown
    logger.info("Shutting down FacePass backend...")


# Create FastAPI app
app = FastAPI(
    title="FacePass API",
    description="Contactless facial attendance & intelligent geo-fenced timeclock",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
is_wildcard = "*" in settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=not is_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    response = JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Mount routers
app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(admin.router)


@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    from app.services.face_recognition import face_service

    return {
        "status": "healthy",
        "service": "FacePass API",
        "version": "0.1.0",
        "face_recognition_available": face_service.is_available,
    }
