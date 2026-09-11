# MAGI 系統

一個以《新世紀福音戰士》中的 MAGI 超級電腦為靈感製作的粉絲向 Web 應用程式。輸入一個是非題，三台 AI 電腦將同時進行審議，以多數決得出最終裁決。

**[English](README.md) | [日本語](README.ja.md)**

![Demo](demo.gif)

---

## 三台電腦

| 電腦          | AI 模型          | 視角                   |
| ------------- | ---------------- | ---------------------- |
| MELCHIOR • 1  | OpenAI GPT         | 科學家——邏輯、理性分析 |
| BALTHASAR • 2 | Anthropic Claude | 母親——保護、關懷導向   |
| CASPER • 3    | Google Gemini    | 女性——直覺、情感洞察   |

## 裁決結果

| 結果     | 說明         |
| -------- | ------------ |
| **承認** | 多數贊成     |
| **否決** | 多數反對     |
| **棄権** | 兩台以上棄権 |
| **膠着** | 無多數決定   |

> **重大議題（Critical Matter）**：若兩台以上判定議題屬於不可逆且可能造成重大危害的事項（如自爆、殺傷等），系統將自動切換為全票制——三台必須一致同意才能執行，任何一台反對或棄権均視為否決。點擊各台電腦可查看其是否判定為重大議題。

## 開始使用

### 前置需求

您需要以下服務的 API 金鑰：

- [OpenAI](https://platform.openai.com/api-keys) — 供 MELCHIOR-1 使用
- [Anthropic](https://console.anthropic.com/settings/keys) — 供 BALTHASAR-2 使用
- [Google AI Studio](https://aistudio.google.com/apikey) — 供 CASPER-3 使用

### 本地開發

```bash
# 1. 複製倉庫
git clone https://github.com/hirakujira/MAGI.git
cd MAGI

# 2. 設定環境變數
cp .env.local.example .env.local
# 編輯 .env.local 並填入您的 API 金鑰

# 3. 安裝相依套件
npm install

# 4. 啟動開發伺服器
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

### Docker

```bash
# 先複製並設定環境變數
cp .env.local.example .env.local

docker compose up
```

## 環境變數

完整 per-persona 設定見 `.env.local.example`（`MELCHIOR_*` / `BALTHASAR_*` / `CASPER_*`、`MAGI_API_KEY`、`MAGI_MOCK_MODE`）。

### 常見／舊版變數

| 變數名稱            | 說明                              | 預設值             |
| ------------------- | --------------------------------- | ------------------ |
| `OPENAI_API_KEY`    | OpenAI API 金鑰（MELCHIOR-1）     | —                  |
| `OPENAI_MODEL`      | GPT 模型名稱                     | `gpt-5.6-luna`      |
| `OPENAI_REASONING_EFFORT` | GPT 推理程度（`low`、`medium` 或 `high`） | `low` |
| `ANTHROPIC_API_KEY` | Anthropic API 金鑰（BALTHASAR-2） | —                  |
| `ANTHROPIC_MODEL`   | Anthropic 模型名稱                | `claude-haiku-4-5` |
| `GOOGLE_API_KEY`    | Google AI API 金鑰（CASPER-3）    | —                  |
| `GOOGLE_MODEL`      | Google 模型名稱                   | `gemini-3.5-flash-lite` |

## 使用方式

1. 在輸入欄輸入是非題形式的議題，按下 **Enter** 送出
2. 三台電腦同時開始獨立審議
3. 率先完成的電腦立即停止閃爍並顯示結果
4. 三台全部完成後，以多數決顯示最終裁決
5. 點擊任一電腦可查看詳細推理說明

## Fork MVP（OpenAI 相容 API）

本 fork 新增共用 MAGI 決策引擎、各人格獨立 Provider 設定，以及畀 SillyTavern 等客戶端使用嘅 OpenAI 相容 HTTP API。

| 端點 | 認證 | 說明 |
| ---- | ---- | ---- |
| `GET /healthz` | 無 | 存活探測 |
| `GET /v1/models` | Bearer `MAGI_API_KEY` | 只列出 `magi-verdict` |
| `POST /v1/chat/completions` | Bearer `MAGI_API_KEY` | 只支援 `stream=false`；一次請求 = 三機審議 |

- 技術失敗會標成 `unitStatus: "error"`，整體結果為 **不完（INCOMPLETE）**——**唔會**假裝成棄権（ABSTAIN）。
- 開發可用 `MAGI_MOCK_MODE=true`；正式環境缺 key 時必須明確失敗，唔會默默 mock。
- 詳見 `.env.local.example`、`docs/DEPLOY-SYNOLOGY.md`、`docs/SILLYTAVERN.md`、`scripts/test-api.ps1`。

### 測試

```bash
npm test
```

### 致謝／來源

上游專案：**[hirakujira/MAGI-System](https://github.com/hirakujira/MAGI-System)**。本 fork 保留對原作者嘅致謝。

## 版權聲明

本專案為粉絲向作品，向庵野秀明 / GAINAX / khara 所創作的《新世紀福音戰士》致敬。所有福音戰士相關名稱與概念均屬各著作權人所有。

## 致謝

### 贊助者

特別感謝以下人士贊助 API Token 費用：

- 天上天下唯我翻車大皮粉


## Part 2（Web Council／設定）

- 模型：`magi-verdict`（可否決）同 `magi-council`（開放式議會，保留少數意見）
- Web UI：模式切換；受保護嘅 `/settings`（非機密覆寫寫入 `/data/magi-settings.json`；API 金鑰只經環境變數）
- Docker volume：`MAGI_DATA_VOLUME` → `/data`
- 優先順序（非機密）：預設 ＜ 環境變數 ＜ 設定檔
- 通行：`MAGI_ACCESS_CODE`（Web／Settings）；`MAGI_API_KEY`（`/v1`）

**本交付只做模擬驗證**；真實 LLM／Synology／SillyTavern 未喺 agent 實測。關閉 mock 後請用設定頁「測試連線」同 Notebook 步驟自行接 LM Studio／雲端金鑰。
