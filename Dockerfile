# syntax=docker/dockerfile:1.7
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

# Run the app as a non-root user. Default to uid/gid 1000 (standard Linux first-user
# convention) so the image works out-of-the-box on hosts where the human user is uid
# 1000. Hosts that use a different uid (e.g. this box, where `jaime` is uid 1003)
# can override at build time:
#     docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) ...
# and in docker-compose.yml:
#     user: "${HOST_UID:-1000}:${HOST_GID:-1000}"
ARG UID=1000
ARG GID=1000

COPY app ./app
COPY static ./static
RUN mkdir -p output \
 && addgroup --gid ${GID} app \
 && adduser --disabled-password --uid ${UID} --ingroup app --home /app --gecos "" app \
 && chown -R app:app /app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

USER app
