# 列国纪在线计算服务器 v13（LGB1 <1KB 二进制差量 + UDP 8767 零队头阻塞 + 4C4G 3Mbps 精准防拥塞整形 + 逐包 TCP_QUICKACK）
FROM swift:5.10-jammy AS builder
WORKDIR /src
COPY ios-native/Core ./ios-native/Core
RUN swift build -c release --product LieguojiServer --package-path ios-native/Core

FROM swift:5.10-jammy-slim
WORKDIR /app
COPY --from=builder /src/ios-native/Core/.build/release/LieguojiServer /app/LieguojiServer
COPY ios-native/Resources/HistoricalAtlas /app/HistoricalAtlas
COPY ios-native/Resources/Catalog /app/Catalog
COPY ios-native/Resources/World/cultures.json /app/World/cultures.json
RUN mkdir -p /data/saves
ENV LGJ_PORT=8765 \
    LGJ_EXTRA_PORTS=443,8443 \
    LGJ_UDP_PORT=8767 \
    LGJ_MAX_KBPS=2480 \
    LGJ_ATLAS_DIR=/app/HistoricalAtlas \
    LGJ_CATALOG_DIR=/app \
    LGJ_DATA_DIR=/data/saves \
    LGJ_DISABLE_RELAY=1 \
    LGJ_NO_STARTUP=1
EXPOSE 8765/tcp 443/tcp 8443/tcp 8767/udp
VOLUME ["/data/saves"]
ENTRYPOINT ["/app/LieguojiServer"]
