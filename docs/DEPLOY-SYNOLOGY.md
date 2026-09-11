# Synology / NAS 部署指南（MAGI System）

> **未測試聲明**：本文件喺開發環境撰寫；**真實 Synology NAS、ARM64、Container Manager 實機部署尚未喺呢個 agent 驗證**。請自行驗證後再投入正式使用。

## 概覽

MAGI System 係 Next.js standalone 映像，透過 Docker Compose 執行。預設只綁定 `127.0.0.1`，適合本機或經反向代理對外。

## 前置條件

- Synology DSM + **Container Manager**（或 Docker）
- 已複製本倉庫並準備好 `.env.local`（參考根目錄 `.env.local.example`）
- 設定 `MAGI_API_KEY`（`/v1/*` 必填）
- 各人格 LLM 金鑰，或明確開啟 `MAGI_MOCK_MODE=true`（僅開發）

## 快速步驟

1. 將專案放到 NAS 共享資料夾（例如 `docker/magi`）。
2. `cp .env.local.example .env.local` 並填入金鑰。
3. 喺 Container Manager 用「專案」匯入 `docker-compose.yml`，或 SSH：

```bash
cd /volume1/docker/magi   # 路徑只係例子；唔好硬編碼進 compose
export MAGI_HOST_BIND=127.0.0.1
export MAGI_PORT=3000
# 可選：自訂資料 volume 名稱／路徑
# export MAGI_DATA_VOLUME=/volume1/docker/magi-data
docker compose up -d --build
```

4. 健康檢查：`curl http://127.0.0.1:3000/healthz`

## LAN vs localhost

| 場景 | `MAGI_HOST_BIND` | 說明 |
|------|------------------|------|
| 只本機 / 反向代理同機 | `127.0.0.1`（預設） | 最安全 |
| 區網其他裝置直連 | `0.0.0.0` | **必須**配防火牆 + `MAGI_API_KEY`；建議再加反向代理 Basic Auth / SSO |

Web UI（server actions）唔經 `/v1`，但仍會消耗 LLM token。唔好將未設金鑰嘅實例直接暴露到公網。

## 反向代理備註

- 用 DSM 應用程式入口或 Nginx Proxy Manager 將 HTTPS 轉到 `127.0.0.1:3000`。
- 保留 `Authorization` header（SillyTavern / API 客戶端需要 Bearer）。
- WebSocket 非必要（API 唔支援 stream）。

## 工作站 LM Studio（由 NAS 呼叫）

LM Studio 預設喺工作站 `localhost:1234`。由 NAS container 連過去時，請用**工作站區網 IP**：

```env
MELCHIOR_PROVIDER=openai-compatible
MELCHIOR_BASE_URL=http://192.168.x.x:1234/v1
MELCHIOR_MODEL=your-local-model
MELCHIOR_API_KEY=lm-studio
```

BALTHASAR / CASPER 可同樣指向 LM Studio 或雲端 provider。

## 架構注意

- **ARM64（部分 DS 機型）**：映像基於 `node:22-alpine`，理論上 multi-arch，但**未喺本 agent 實測**。
- healthcheck 使用 container 內 `fetch('/healthz')`，唔依賴 curl。
- `MAGI_DATA_VOLUME` 可指向命名 volume 或主機路徑；compose **唔會**硬編碼 `/volume1`。

## 驗收清單（請自行打勾）

- [ ] `docker compose build` 喺目標 NAS 成功
- [ ] `/healthz` 回 200
- [ ] 帶 `MAGI_API_KEY` 呼叫 `/v1/models` 成功
- [ ] 真實 LLM keys 或 LM Studio 完成一次審議
- [ ] SillyTavern 連線（見 `docs/SILLYTAVERN.md`）
