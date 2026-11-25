# 列国纪在线计算服务器 v6（多阶段极简镜像，适配国内腾讯云 / 阿里云 / 华为云 Linux 轻量应用服务器）
FROM swift:5.10-jammy AS builder
WORKDIR /src
COPY ios-native/Core ./ios-native/Core
RUN swift build -c release --product LieguojiServer --package-path ios-native/Core

FROM swift:5.10-jammy-slim
WORKDIR /app
COPY --from=builder /src/ios-native/Core/.build/release/LieguojiServer /app/LieguojiServer
RUN mkdir -p /data/saves
ENV LGJ_PORT=8765 \
    LGJ_DATA_DIR=/data/saves \
    LGJ_DISABLE_RELAY=1 \
    LGJ_NO_STARTUP=1
EXPOSE 8765/tcp
VOLUME ["/data/saves"]
ENTRYPOINT ["/app/LieguojiServer"]
