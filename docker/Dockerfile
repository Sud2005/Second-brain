# ─────────────────────────────────────────────────────────────────────────────
# docker/Dockerfile
# Used by both the API and Celery worker (same image, different CMD)
# ─────────────────────────────────────────────────────────────────────────────

# Use the slim Python image — smaller than full, still has pip
FROM python:3.12-slim

# System dependencies
# tesseract-ocr: needed for pytesseract (OCR on screenshots)
# ffmpeg:        needed for video frame extraction (Phase 2)
# curl:          used in Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cached layer — only rebuilds if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create storage directories
RUN mkdir -p storage/uploads storage/items watched_inbox

# Non-root user for security
RUN useradd -m brainuser && chown -R brainuser /app
USER brainuser

# Default command (overridden in docker-compose.yml per service)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
