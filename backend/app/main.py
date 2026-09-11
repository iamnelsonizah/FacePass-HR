"""FacePass — FastAPI Backend Application.

Contactless facial attendance & intelligent geo-fenced timeclock.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
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

    Runs on startup and shutdown. Initializes the face recognition
    model on startup so it's ready for the first request.
    """
    # Startup
    logger.info("Starting FacePass backend...")

    # Initialize face recognition model (imported as singleton)
    from app.services.face_recognition import face_service

    if face_service.is_available:
        logger.info("Face recognition model loaded and ready")
    else:
        logger.warning(
            "Face recognition model NOT available. "
            "Enrollment and check-in will not work until the model is installed."
        )

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
