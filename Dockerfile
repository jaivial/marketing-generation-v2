FROM python:3.12-slim

# wavespeed (Node CLI) + lightpanda (binary) live on the host; we mount/install at runtime.
# Minimal image, single-purpose.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# Install wavespeed (Node) and download lightpanda binary in one layer.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && npm i -g wavespeed@latest \
 && curl -fsSL -o /usr/local/bin/lightpanda \
      https://github.com/lightpanda-io/browser/releases/latest/download/lightpanda-x86_64-linux \
 && chmod +x /usr/local/bin/lightpanda \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY app ./app
COPY static ./static
RUN mkdir -p output \
 && addgroup --gid 1000 app \
 && adduser --disabled-password --uid 1000 --ingroup app --home /app --gecos "" app \
 && chown -R app:app /app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

USER app
