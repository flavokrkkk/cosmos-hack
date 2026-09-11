FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/alembic.ini .
COPY case/source/case_core.py /workspace/case/source/case_core.py
COPY case/source/data/lots.csv case/source/data/access_modes.csv /workspace/case/source/data/
COPY case/source/config/case_config.json /workspace/case/source/config/case_config.json
COPY config/decision.json /workspace/config/decision.json

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
