# SillyTavern 連接 MAGI System

> **未測試聲明**：真實 SillyTavern 客戶端連線**尚未**喺呢個 agent 驗證。以下係設定指引。

## 連接設定（Connection Profile）

| 欄位 | 建議值 |
|------|--------|
| API | Chat Completion / OpenAI Compatible |
| Endpoint | `http://<NAS_LAN_IP>:<PORT>/v1` |
| API Key | 與伺服器 `MAGI_API_KEY` 相同 |
| Model | `magi-verdict` |
| Streaming | **關閉（Off）** |

注意：

- `stream=true` 會回 **400**（`stream_not_supported`）。
- 一次請求 = 一次三機審議；延遲會高於一般單一 LLM。
- 唔支援 image / tool messages。

## Character card / 角色卡指引

- 保留你現有嘅 **Mika**（或其他）角色卡人格、開場白、範例對話——**唔好為咗接 MAGI 而改壞角色本人**。
- 建議喺「系統提示／作者備註」說明：後端 `magi-verdict` 會輸出結構化裁決（Final Verdict、三機票、分歧、缺失資訊、下一步），角色應依裁決結果演繹，而唔係再自行重投一次。
- 對話歷史會被 truncation strategy 壓縮；請將「要審議嘅議題」放喺**最新一則 user 訊息**。

## PowerShell 測試範例

見 `scripts/test-api.ps1`，或：

```powershell
$base = "http://192.168.1.10:3000"
$key  = "your-magi-api-key"

Invoke-RestMethod -Uri "$base/healthz" -Method Get

Invoke-RestMethod -Uri "$base/v1/models" -Headers @{ Authorization = "Bearer $key" }

$body = @{
  model = "magi-verdict"
  stream = $false
  messages = @(
    @{ role = "user"; content = "Should we approve the evacuation plan?" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$base/v1/chat/completions" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $key"; "Content-Type" = "application/json" } `
  -Body $body
```

## 常見問題

- **401**：檢查 Bearer 是否等於 `MAGI_API_KEY`。
- **連唔到**：確認 `MAGI_HOST_BIND`、防火牆、以及 NAS IP（唔好用 container 內 `localhost` 當客戶端位址）。
- **回 INCOMPLETE**：某一機 API 失敗；檢查該人格嘅 provider／金鑰；錯誤**唔會**偽裝成 ABSTAIN。

## Encoding note (UTF-8)

API JSON responses are served as `application/json; charset=utf-8`. Assistant deliberation text uses ASCII hyphens (` - `) instead of Unicode em dashes to avoid mojibake in PowerShell and other clients that mis-decode UTF-8. Always decode responses as UTF-8.
