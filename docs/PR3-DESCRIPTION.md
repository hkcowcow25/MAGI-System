# PR #3 — full description（history + summarizer diagnostics／pre-merge fixes）

## 依賴

**Depends on PR #2**（及間接 **PR #1**）。請先合併 #1 → #2，或將本 PR 視為 stack 之上游。

本 PR **新增審議歷史（history）**，並含 **Council summarizer 診斷／金鑰修復** 與 **pre-merge Settings／History 修正**（見下方）。唔會重新羅列 PR #1／#2 全部 diff。

**Verified pin（真實模型／Council，PR #2）：** `5fd5e8a`  
**本分支起點：** `4b97be627bf2dc2082c36f2a8c00689b01530eb2`（`feature/magi-web-council` tip）  
**Head tip：** `0a177835a50037502e32402d138f1069234ec9ca`（`feature/magi-history`）  
**Base：** `feature/magi-web-council`（stack；**請勿**直接對 master 直至 #1+#2 合併）

## 本 PR 新增內容（history）

1. **SQLite 審議紀錄**（`sql.js` ASM／純 JS）：路徑 `$MAGI_DATA_DIR/magi-history.sqlite`（預設 `/data`，可用 `MAGI_HISTORY_DB_PATH` 覆寫）；同 Settings 共用 `MAGI_DATA_VOLUME`。
2. **持久化欄位**：題目／topic、mode（verdict｜council）、timestamp、source（web｜api）、各單位實際 provider+model、三單位結果、最終裁決或議會綜合、errors、duration_ms、mock 標記。失敗／incomplete 都會寫入；summarizer 失敗仍保留三意見 + `synthesis_error`。
3. **`/history` 頁**：搜尋、詳情、JSON 匯出、刪除；同 Settings 一樣要 `MAGI_ACCESS_CODE` session；EVA 風格、zh-HK 文案。
4. **Web + `/v1` 各錄一次**（共用 `runMagiEngine`；唔會 double-write）；sanitize：**永不**存 API keys／access codes／session secrets；concurrent writes 經 write queue 序列化。
5. **Docker**：`serverExternalPackages: ["sql.js"]`；runner 複製 `node_modules/sql.js`。
6. **文件**：`docs/DEPLOY-SYNOLOGY.md`、`.env.local.example` 補 history DB 路徑同 volume 重建驗證步驟。

### Schema（`deliberations`）

| 欄位 | 說明 |
|------|------|
| `id` | TEXT PK |
| `created_at` | ISO timestamp |
| `topic` | 題目 |
| `mode` | verdict｜council |
| `source` | web｜api |
| `mock` | 0／1 |
| `status` | complete｜incomplete｜error |
| `duration_ms` | 耗時 |
| `models_json` | 三單位 provider+model |
| `units_json` | 三單位結果 |
| `outcome_json` | verdict 或 council synthesis（含 `synthesis_error`） |
| `errors_json` | 錯誤列表 |
| `search_blob` | 搜尋索引 |

---

## Notebook 驗收（用戶回報）

| 項目 | 狀態 |
|------|------|
| Council 完成 | **通過（用戶）** — `synthesis_mode=llm`，`errors=null` |
| History 顯示 | **通過（用戶）** — 可見 topic／opinions／summary；SQLite 路徑 `/data/magi-history.sqlite` |
| 重啟後持久化 | **未宣稱通過** — 用戶要求「重啟後持久化只在有實測證據時標示通過」；本輪**未**提供重啟／recreate 實測證據 → 標示 **pending／路徑 OK（user-reported path）**，唔當 verified |
| Docker／真實 API E2E（agent） | **NOT RUN** |

---

## Summarizer：用戶確認嘅 Google 錯誤 vs 程式缺陷

### 用戶確認嘅真實錯誤（Google）

用戶確認 Gemini／Google 實錯為：

```text
400 Bad Request: User location is not supported for the API use.
```

即：**喺唔支援嘅地區用 Google API** 會 400。用戶**已有** dedicated summarizer key；**MELCHIOR key fallback 並非佢哋今次 Google 失敗嘅已確認根因**。

### 仍然修復嘅程式缺陷（但唔係今次確認根因）

舊 `resolveSummarizer` 曾有 **跨 provider 偷 Melchior key**（`MAGI_SUMMARIZER_API_KEY` → **MELCHIOR_API_KEY** → …）——呢個係缺陷，本 PR **仍然修好**（google 只用 `MAGI_SUMMARIZER_API_KEY ?? GOOGLE_API_KEY`），但要明確：**唔係用戶今次 location-unsupported 400 嘅確認根因**。

其他修復：

- **Silent catch：** `llmSynthesis` 唔再吞錯誤；`synthesis_error` stages：`config|api|parse|empty`（含 HTTP status／finish_reason）；失敗仍 extractive fallback，UI 區分「摘要 LLM 失敗」vs「未設定」
- **Per-provider keys**（見上）
- **Standalone「測試摘要」**：先要求／確保已儲存表單，再用**已儲存** provider／model 測試（唔好測未儲存表單／舊 provider）；回傳 ok／stage／message／provider／model／preview（無 secrets）

### Pre-merge Settings 修正（本輪）

1. **啟用掣：** 只反映已儲存 `enabled` boolean（預設 false）；唔再用 `configured || enabled`；`enabled=false` 儲存後 reload 仍未勾選；儲存其他設定唔會暗中 re-enable。
2. **優先順序統一（runtime + Settings UI + 說明）：** 非機密 = 預設值 < 環境變數 < settings JSON；API 金鑰 = 只環境。UI 顯示值同 runtime 共用 resolve helpers。
3. **Base URL 可清除：** `baseUrl: ""`／`null` 表示清除覆寫並持久化；LM Studio → Google 唔會殘留 LM Studio URL；provider=google 顯示「Google 唔使用自訂 Base URL」。
4. **History：** 單次錄製、寫入序列化、auth、redact、`synthesis_error` 保留（見上）。

### Notebook／Summarizer 再測建議

**Google（支援地區）：** 設 `MAGI_SUMMARIZER_API_KEY` 或 `GOOGLE_API_KEY` → 儲存 →「測試摘要」→ Council 睇 `synthesis_mode: llm` 或可見 `synthesis_error`（若地區唔支援，預期見到 location 400）。

**LM Studio：** summarizer provider=`openai-compatible` + **base URL** + model → 儲存 →「測試摘要」。

---

## Agent 測試 vs 用戶測試

| 項目 | 狀態 |
|------|------|
| `npm test` | **綠**（agent；含 enabled／precedence／baseUrl clear／history redact／synthesis_error／single-record） |
| lint／tsc／build | **綠**（agent） |
| 真實 Synology volume recreate／重啟持久化 | **未測／唔宣稱通過**（需用戶實測證據） |
| 真實 Google／LM Studio summarizer E2E | **NOT RUN**（用「測試摘要」＋用戶 Notebook） |

## Notebook／NAS：history 跨容器重建驗證（用戶）

1. 確保 compose 掛載 named volume `magi-data` to `/data`（唔好用匿名 volume）。
2. 完成至少一次審議（Web 或 `POST /v1/chat/completions`）。
3. 開 `/history`，確認紀錄出現；記下題目同時間。
4. `docker compose up -d --build --force-recreate`（**保留** named volume 同 `.env.local`）。
5. 再開 `/history`：舊紀錄仍在；volume 內應有 `magi-history.sqlite` 同 `magi-settings.json`。
6. （可選）刻意刪 volume 後重建 → 紀錄消失，證明資料喺 volume 而非 image。

## PowerShell 更新步驟（保留 `.env.local` 同 `/data`）

```powershell
# 喺專案目錄（保留 .env.local；唔好刪 named volume／主機 /data）
git fetch origin
git checkout feature/magi-history
git pull origin feature/magi-history
docker compose up -d --build --force-recreate
# 確認 magi-data volume 仍在；唔好 docker volume rm
```

## 合併建議

1. 先手動 merge **PR #1** → `master`，再 merge **PR #2**（或將 #2 base 改 `master` 後合併）。
2. 之後將**本 PR base 改為 `master`**，確認 diff／衝突，再手動 merge。
3. **請勿由 agent merge。**（本回合只 push `feature/magi-history`，**未 merge**。）

## 請勿 merge（直至你完成上述順序）
