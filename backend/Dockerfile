FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["sh", "-c", "mkdir -p /app/data/processed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
