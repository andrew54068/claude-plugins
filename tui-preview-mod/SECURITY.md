# 權限與安全邊界

## 一般 Mods 權限，不等於這個 Mod 的 footprint

Claude Code Mods 以使用者權限執行，可具有檔案、程序、網路、session、提示改寫、模型呼叫及工具核准能力；Claude 的 Bash sandbox 不約束 Mod 啟動的 subprocess。因此，載入前必須信任與審閱程式碼，不能因為它是預覽介面就視為沙箱。[官方權限說明](https://code.claude.com/docs/en/plugins/mods/overview)

本專案實際使用 `$.process.spawn`、`$.clock.every`、`$.prompt.read`、`$.session.root/id`、命令註冊與原生 UI 方法。它沒有使用 `$.http`、`$.model`、`$.mcp`、tool approval、prompt.fill／submit／rewrite 或 session history。在 `tui-preview-mod/` 執行 `claude plugin validate --strict .claude-plugin/plugin.json` 可列出 Mod 的 hooks／calls；repository 的 marketplace 用 `claude plugin validate ../.claude-plugin/marketplace.json` 另查。只驗證 repository 根目錄會選 marketplace，漏掉 Mod。footprint 清單也不會證明 Node helper 或 ffmpeg 沒有問題，仍需閱讀 [register.ts](hooks/register.ts) 與 [media.mjs](scripts/media.mjs)。

## 資料流

| 輸入 | 讀取／處理邊界 | 顯示邊界 |
| --- | --- | --- |
| `/preview <path>` | 目前 session root，或明確設定的額外 roots；Node 開啟驗證後的一般檔案 | Markdown 或 PNG bytes 交給 Claude 終端 UI |
| 目前 composer 貼圖 | 當前 prompt 中的圖片 ID；同一 root/session 的有限快取候選檔名 | 送出前預覽列／使用者開啟的 pane |
| 原生 Read 圖片 | 既有成功工具結果中的 base64，透過 stdin 解碼；不重新讀來源路徑 | 保留原生工具結果並增加 inline 預覽 |
| SSH | 解碼在 server；PNG bytes 沿既有 SSH stream 回 client | 圖像能否畫出取決於 client 終端與協定 |

此 Mod 不新增圖片上傳、模型請求或 HTTP listener。**這不代表整個 Claude session 離線或圖片永不送出：一般提交的附件與 Read 結果仍可能由 Claude 傳給其設定的模型。** 預覽不改變這項原生行為。helper／ffmpeg 繼承程序環境並以使用者權限執行；未建立 OS 沙箱或隔離秘密的執行環境。

## 路徑與解碼防護

來源需 canonicalize 後位於允許 root；拒絕 URL、network-style 路徑、裝置、FIFO、目錄、leaf symlink 與越界路徑。以 `O_NOFOLLOW | O_NONBLOCK` 開啟，再確認 regular file 和原始 dev/inode。靜態讀取持續計算 byte 數；影片／ffprobe 使用繼承的驗證 fd，避免路徑被替換後改讀另一檔案。這是 inode 身分防護，不是不可修改的 snapshot：其他程序仍可能改動同一 inode 的影片內容。[來源檢查](scripts/media.mjs#L21)

貼圖 adapter 不掃描 home、歷史 session 或剪貼簿歷史。僅嘗試當前 session／圖片 ID 的 `.png/.jpg/.gif/.webp`，快取目錄不可為 symlink；canonical root 在開啟時再次核對。這是 2.1.288 的內部快取適配，升版後可能失效。[快取檢查](scripts/media.mjs#L122)

subprocess 使用 argv、無 shell。ffmpeg／ffprobe protocol 白名單為 `file,pipe`；影像依 magic 限定 PNG/JPEG/WebP/GIF demuxer；影片只允許 mov/matroska，不接受 playlist／concat／image2。MOV 外部 track 與 absolute alias 明確關閉。解碼後 PNG bytes 不寫入持久圖片檔，不使用 model tool result 傳輸圖片。[解碼器設定](scripts/media.mjs#L212)

Markdown 2 MiB、靜態圖 32 MiB、影片 2 GiB；frame 2 MiB、640×360、影片8 fps。pane 限制在來源前600秒；helper 每次至多600秒／4800幀。ffprobe／靜態／影片 timeout 分別為15／20／615秒。ffmpeg `-max_alloc 64 MiB` 只限制單次 allocation，**不是整個程序的記憶體硬上限**。限額與白名單不取代原生 codec 的安全更新。

Read inline 與 composer 共用兩個自動解碼名額，另外可有一個前景 pane；Read decoded cache 至多16項，session內至多128個自動 Read attempt，超過後改由明確按鈕載入。這些是資源限制，並非總記憶體或 OS 權限沙箱。[自動排程](hooks/register.ts#L66)

暫停、跳轉、關閉、session.end 與錯誤會停止舊 stream；世代與 pane identity 防止舊結果復活。helper 在 SIGTERM／輸出關閉後清理 ffmpeg，必要時500ms後 SIGKILL。live pause／seek／close、播放中 `/clear` 後重新預覽，以及程式變動觸發的 hot reload／舊 module 卸載都有清理證據。hot reload 出現一次舊環境 `ui.invalidate` 被丟棄的 WARN，未留下 decoder；resume 與其他卸載情境未單獨實測。[生命週期](hooks/register.ts#L40)、[驗證紀錄](docs/verification.md)

## 回報問題

請勿在公開 issue 貼 token、SSH key、私人檔案、prompt、原始 clipboard、session cache 或完整 debug log。使用無敏感內容的最小 fixture，提供 Claude／Node／ffmpeg 版本、重現命令與預期／實際行為。一般問題可在[repository](https://github.com/andrew54068/claude-plugins/issues)回報；安全問題若已有作者的私下聯絡管道，先私下回報，目前沒有專用安全信箱。

需要停用時，先關閉預覽並結束該 session，或從 `/plugin` 停用／移除此 plugin。限制與相容性見 [compatibility](docs/compatibility.md)。
