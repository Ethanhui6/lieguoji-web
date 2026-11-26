FROM python:3.12-slim
WORKDIR /app
COPY server.py /app/server.py
COPY hotpack-v6-manifest.json /app/hotpack-v6-manifest.json
RUN mkdir -p /data/saves /data/downloads
ENV LGJ_PLATFORM_PORT=8080 \
    LGJ_PLATFORM_DATA=/data \
    PYTHONUNBUFFERED=1
EXPOSE 8080/tcp
VOLUME ["/data"]
ENTRYPOINT ["python3", "/app/server.py"]
