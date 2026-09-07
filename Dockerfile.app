FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY static ./static
# 9101 — the previous 9000 is blocked by an iptables anti-miner rule on this host.
EXPOSE 9101
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9101"]
