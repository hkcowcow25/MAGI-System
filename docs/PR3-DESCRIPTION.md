# PR #3 — full description (history + summarizer diagnostics)

## 依賴

**Depends on PR #2**（及間接 **PR #1**）。請先合併 #1 → #2，或將本 PR 視為 stack 之上游。

本 PR **新增審議歷史（history）**，並含 **Council summarizer 診斷／金鑰修復**（見下方）。唔會重新羅列 PR #1／#2 全部 diff。

**Verified pin（真實模型／Council，PR #2）：** `5fd5e8a`  
**本分支起點：** `4b97be627bf2dc2082c36f2a8c00689b01530eb2`（`feature/magi-web-council` tip）  
**Head tip：** `1885989`（summarizer diagnostics + history）  
**Base：** `feature/magi-web-council`（stack；**請勿**直接對 master 直至 #1+#2 合併）

## 本 PR 新增內容（history）

1. **SQLite 審議紀錄**（`sql.js` ASM／純 JS）：路徑 `$MAGI_DATA_DIR/magi-history.sqlite`（預設 `/data`，可用 `MAGI_HISTORY_DB_PATH` 覆寫）；同 Settings 共用 `MAGI_DATA_VOLUME`。
2. **持久化欄位**：題目／topic、mode（verdict｜council）、timestamp、source（web｜api）、各單位實際 provider+model、三單位結果、最終裁決或議會綜合、errors、duration_ms、mock 標記。失敗／incomplete 都會寫入。
3. **`/history` 頁**：搜尋、詳情、JSON 匯出、刪除；同 Settings 一樣要 `MAGI_ACCESS_CODE` session；EVA 風格、zh-HK 文案。
4. **Web + `/v1` 共用錄製路徑**；sanitize：**永不**存 API keys／access codes／session secrets。
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
| `outcome_json` | verdict 或 council synthesis |
| `errors_json` | 錯誤列表 |
| `search_blob` | 搜尋索引 |

---

## Summarizer 診斷與修復（本分支追加）

### 根因診斷

1. **Google 400／錯誤金鑰 fallback：** 舊 `resolveSummarizer` 順序為 `MAGI_SUMMARIZER_API_KEY` → **`MELCHIOR_API_KEY`** → OPENAI → ANTHROPIC → `GOOGLE_API_KEY`。Melchior 用 LM Studio（key 常為 `lm-studio`）時，Google summarizer 未設 `MAGI_SUMMARIZER_API_KEY` 會用 Melchior 的 key → Dashboard 見 request + **400 BadRequest**、無 output tokens。**「Dashboard 見到 request」≠ 成功。**
2. **Silent catch：** `llmSynthesis` `catch { return null }` 隱藏 API／parse 失敗，UI 只顯示 extractive「無 summarizer LLM」，睇唔出失敗。
3. **LM Studio／openai-compatible：** 需要明確 **baseUrl**、回傳 **finish_reason**、空內容 → `empty` stage；debug log 標 `mode: 'summarizer'`，唔好同 Melchior council 混淆。

### 修復摘要

- **Per-provider API key：**
  - google → `MAGI_SUMMARIZER_API_KEY ?? GOOGLE_API_KEY` only（唔再用 Melchior key）；無 key → **config** error，唔打 API
  - anthropic／openai → summarizer key ?? provider key
  - openai-compatible → summarizer key；僅當 provider+baseUrl 同 Melchior 先可借 Melchior key；否則預設 `lm-studio`；缺 baseUrl → config error
- **`synthesis_error`：** `{ stage: config|api|parse|empty, message, provider?, model?, finish_reason?, httpStatus? }`；失敗仍 extractive fallback，但 UI 顯示「摘要 LLM 失敗」vs「未設定 summarizer」
- **Google adapter：** 改善 400 body 錯誤提取；`debugLlmLog` summarizer mode（無 key、無完整 topic）
- **Standalone `testSummarizer`：** Settings「測試摘要」；fixture opinions；唔跑三人稱；回傳 ok/stage/message/provider/model/preview（無 secrets）
- **HistoryPageClient：** history actions 由 `@/lib/history/web-actions` 引入（避免 `"use server"` 再 export 破壞 Next 16 build）

### Notebook／Summarizer 再測

**Google：** 設 `MAGI_SUMMARIZER_API_KEY`（或 `GOOGLE_API_KEY`）；**唔好**依賴 Melchior／LM Studio key。Settings →「測試摘要」→ 確認 ok；Council 睇 `synthesis_mode: llm` 或可見 `synthesis_error`。

**LM Studio：** summarizer provider=`openai-compatible`，設 **base URL** + model；可選 `MAGI_SUMMARIZER_API_KEY`（缺則 `lm-studio`）。同樣用「測試摘要」。

---

## Agent 測試 vs 未測

| 項目 | 狀態 |
|------|------|
| `npm test` | **86 passed / 16 files**（含 summarizer-key、summarizer-diagnostics、history、council） |
| lint／tsc／build | **綠**（agent box） |
| 真實 Synology volume recreate | **未測**（見下方 Notebook 步驟） |
| 真實 Google／LM Studio summarizer E2E | **未測**（用「測試摘要」＋上方 Notebook） |

## Notebook／NAS：history 跨容器重建驗證

1. 確保 compose 掛載 named volume `magi-data` to `/data`（唔好用匿名 volume）。
2. 完成至少一次審議（Web 或 `POST /v1/chat/completions`）。
3. 開 `/history`，確認紀錄出現；記下題目同時間。
4. `docker compose up -d --build --force-recreate`（**保留** named volume）。
5. 再開 `/history`：舊紀錄仍在；volume 內應有 `magi-history.sqlite` 同 `magi-settings.json`。
6. （可選）刻意刪 volume 後重建 → 紀錄消失，證明資料喺 volume 而非 image。

## 合併建議

1. 先手動 merge **PR #1** → `master`，再 merge **PR #2**（或將 #2 base 改 `master` 後合併）。
2. 之後將**本 PR base 改為 `master`**，確認 diff／衝突，再手動 merge。
3. **請勿由 agent merge。**（本回合只 push `feature/magi-history`，**未 merge**。）

## 請勿 merge（直至你完成上述順序）
