# Synology / NAS 部署指南（MAGI System）

> **未測試聲明**：本文件喺開發環境撰寫；**真實 Synology NAS、ARM64、Container Manager 實機部署尚未喺呢個 agent 驗證**。請自行驗證後再投入正式使用。

## 概覽

MAGI System 係 Next.js standalone 映像，透過 Docker Compose 執行。預設只綁定 `127.0.0.1`，適合本機或經反向代理對外。

公開路徑（SillyTavern／健康檢查）：

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/chat/completions`

（內部實作喺 `/api/...`，已用 Next.js rewrite 對應；兩邊都可用。）

## Compose 變數 vs Container 環境變數（好重要）

| 類型 | 例子 | 喺邊度設 | 作用 |
|------|------|----------|------|
| **Compose 插值變數** | `MAGI_HOST_BIND`、`MAGI_PORT`、`MAGI_ENV_FILE`、`MAGI_DATA_VOLUME` | Synology **Project → 環境**／`.env`（同 `docker-compose.yml` 同一層），或匯出再 `docker compose` | 只影響 compose **解析** ports／volumes／`env_file` 路徑；**唔會**自動變成 container 入面嘅 `process.env`（除非你再寫入 `environment:`） |
| **Container 應用環境變數** | `MAGI_API_KEY`、`MAGI_MOCK_MODE`、`MELCHIOR_*`、`BALTHASAR_*`、`CASPER_*`、legacy `OPENAI_API_KEY` 等 | `env_file`（預設 `.env.local`）或 Container Manager **容器環境**／compose `environment:` | Next.js 進程讀取；控制 API 閘、mock、各人格 provider |
| **Compose 已寫死嘅 container env** | `PORT=3000`、`HOSTNAME=0.0.0.0` | `docker-compose.yml` → `environment:` | 確保 app 喺 container 內聽所有介面；對外暴露仍由 **ports 左邊** `MAGI_HOST_BIND` 控制 |

**唔好混淆：**

- `MAGI_HOST_BIND=127.0.0.1` = 主機只允許本機連到已發布 port（安全預設）。
- `HOSTNAME=0.0.0.0`（container 內）= Node 喺 container network namespace 聽全部介面；呢個 **唔等於** 對 LAN 開放。
- 要區網直連：Compose 設 `MAGI_HOST_BIND=0.0.0.0`，同時保留強 `MAGI_API_KEY`，最好再加反向代理。

## Container Manager「專案」（Project）步驟

1. 將 `feature/magi-st-mvp`（或 merge 後嘅程式）放到 NAS **已有共享資料夾**，例如 `<EXISTING_VOLUME>/docker/magi`（路徑按你機實際 volume／共享名；唔好假設一定係 `/volume1`）。
2. 喺該目錄建立 `.env.local`（由 `.env.local.example` 複製）：
   - 必填：`MAGI_API_KEY`
   - 第一輪驗證：`MAGI_MOCK_MODE=true`（唔使真實 LLM keys）
   - 正式：`MAGI_MOCK_MODE=false`／唔設，並填各 `*_API_KEY` 或 LM Studio `*_BASE_URL`
3. （可選）同一目錄放 compose `.env` 只放插值變數，例如：
   ```env
   MAGI_HOST_BIND=127.0.0.1
   MAGI_PORT=3000
   MAGI_ENV_FILE=.env.local
   MAGI_DATA_VOLUME=magi-data
   ```
4. DSM → **Container Manager** → **專案** → **新增** → **從 docker-compose.yml 建立**：
   - 路徑選你放咗 `docker-compose.yml` 嘅資料夾
   - 專案名稱例如 `magi`
   - 喺專案「環境」檢查 `MAGI_HOST_BIND`／`MAGI_PORT`／`MAGI_ENV_FILE`／`MAGI_DATA_VOLUME`（Compose 插值）
   - **唔好**指望喺呢度只填 `MAGI_API_KEY` 就能代替 `.env.local`——除非你改 compose 把該 key 加進 `environment:`；目前設計係靠 `env_file: .env.local`
5. 建立／啟動專案（會 `build` image）。
6. 驗證（喺 NAS 或能到達 bind address 嘅機器）：
   ```bash
   curl http://127.0.0.1:3000/healthz
   curl -H "Authorization: Bearer <MAGI_API_KEY>" http://127.0.0.1:3000/v1/models
   ```
7. SillyTavern base URL：`http://<NAS-LAN-IP>:<MAGI_PORT>/v1`（唔加 `/chat/completions`）；Streaming 關閉。見 `docs/SILLYTAVERN.md`。

## 快速 SSH 步驟（替代 UI）

```bash
cd /volumeX/docker/magi   # 例子；改成你嘅實際路徑
cp .env.local.example .env.local
# 編輯 .env.local：MAGI_API_KEY + MAGI_MOCK_MODE=true（首輪）
export MAGI_HOST_BIND=127.0.0.1
export MAGI_PORT=3000
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

## LAN vs localhost

| 場景 | `MAGI_HOST_BIND` | 說明 |
|------|------------------|------|
| 只本機 / 反向代理同機 | `127.0.0.1`（預設） | 最安全 |
| 區網其他裝置直連 | `0.0.0.0` | **必須**配防火牆 + `MAGI_API_KEY`；建議再加反向代理 Basic Auth / SSO |

Web UI（server actions）唔經 `/v1`，但仍會消耗 LLM token。唔好將未設金鑰嘅實例直接暴露到公網。`MAGI_MOCK_MODE` 唔應喺 production 開啟。

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
- healthcheck 使用 container 內 `fetch('http://127.0.0.1:3000/healthz')`，唔依賴 curl。
- `MAGI_DATA_VOLUME` 可指向命名 volume 或主機路徑；compose **唔會**硬編碼 `/volume1`。

## 驗收清單（請自行打勾）

- [ ] `docker compose build` 喺目標 NAS 成功
- [ ] `/healthz` 回 200
- [ ] 帶 `MAGI_API_KEY` 呼叫 `/v1/models` 成功
- [ ] mock 或真實 LLM 完成一次 `/v1/chat/completions`
- [ ] SillyTavern 連線（見 `docs/SILLYTAVERN.md`）
- [ ] `/history` 有紀錄，且 container recreate 後（保留 MAGI_DATA_VOLUME）仍然存在


## 資料卷同設定檔（Part 2）

Compose 已掛載：

```yaml
volumes:
  - ${MAGI_DATA_VOLUME:-magi-data}:/data
```

| 變數 | 作用 |
|------|------|
| `MAGI_DATA_VOLUME` | Compose 插值：命名 volume 或主機路徑，掛到 container `/data` |
| `MAGI_DATA_DIR` | Container 內資料目錄（預設 `/data`） |
| `MAGI_SETTINGS_PATH` | 非機密設定 JSON 完整路徑（預設 `$MAGI_DATA_DIR/magi-settings.json`） |
| `MAGI_HISTORY_DB_PATH` | 審議紀錄 SQLite（預設 `$MAGI_DATA_DIR/magi-history.sqlite`） |

**寫入內容（`/data/magi-settings.json`）**：各人格 provider／model／baseURL／system prompt／timeout／max tokens／temperature、可選 summarizer、預設模式。**唔會**寫入 API 金鑰。

**審議紀錄（`/data/magi-history.sqlite`）**：每次 Web／`/v1` 審議（含 incomplete／error）都會寫入題目、模式、來源、實際 model、三單位結果、最終裁決或議會綜合、錯誤、耗時、mock 標記。用 **sql.js（ASM）**，唔使 alpine 編譯 native module。**唔會**寫入 API 金鑰、通行碼、session secret。

**優先順序（非機密）**：程式預設值 ＜ 環境變數 ＜ 設定檔。  
**API 金鑰**：只來自環境變數（`MELCHIOR_API_KEY` 等）；設定頁只顯示「由環境設定／已設定」或「未設定」。

確保 volume 對 container 使用者（uid 1001）可寫。映像已建立 `/data` 並 `chown nextjs`。

Web UI `/settings` 同審議一樣需要 `MAGI_ACCESS_CODE` 解鎖工作階段。

## 審議紀錄同 volume 重建驗證（Notebook／NAS）

Web UI：`/history`（同 Settings 一樣要 `MAGI_ACCESS_CODE` 工作階段）。

**Agent 未喺真實 Synology 驗證**；請用以下步驟自行確認 container recreate 後 `/data` 仍然保留紀錄：

1. 確保 compose 有掛載 `${MAGI_DATA_VOLUME:-magi-data}:/data`（唔好用匿名／臨時 volume）。
2. 用 mock 或真實模式完成至少一次審議（Web 或 `POST /v1/chat/completions`）。
3. 開啟 `/history`，確認出現該筆記錄；記下題目同時間。
4. 重建容器（**唔刪** named volume／主機路徑）：
   ```bash
   docker compose up -d --build --force-recreate
   # 或者 Container Manager → 停止 → 清除容器（保留 volume）→ 再啟動專案
   ```
5. 再開 `/history`：舊紀錄仍在；可用搜尋驗證。亦可喺 volume 內見到 `magi-history.sqlite` 同 `magi-settings.json`。
6. 反向驗證（可選）：若刻意 `docker volume rm`／刪主機資料夾，重建後紀錄會消失——證明資料係喺 volume 而非 image layer。

合併建議：等 PR #1 + #2 入 master 後，將本 PR base 改為 `master`。
