# Claude Code Preview Mod

日期：2026-10-03。此文件依使用者最新指示取代 remote-first 設計。
專案：`<project root>`
開發 worktree：`<worktree>`
執行方式：Subagent-driven，實作者與獨立 reviewer 逐項審查。

## 成果

Claude Code TUI 內可預覽 Markdown、圖片與真正播放影片；輸入框中已貼上的圖片在送出前即可看見。SSH 是同一個 Mod 的使用方式：Mod 在檔案所在主機執行，圖像 bytes 隨 terminal stream 傳回觀看裝置。

## 操作

- `/preview <path>` 在可捲動 pane 顯示 Markdown／圖片／影片。
- `/preview` 顯示使用方式與目前預覽；`/preview close` 關閉並停止解碼。
- Markdown 以 native Markdown 元件分页，避免單一元件字串超過上限。
- PNG、JPEG、WebP、GIF 轉成受限尺寸 PNG／RGBA；GIF 第一幀為靜態圖片，影片入口提供動態播放。
- MP4、MOV、WebM、MKV 在 pane 逐幀播放，提供播放／暫停、前後跳轉、重播與關閉。
- 影片 v1 無聲音；播放真實連續影格，不能把單張縮圖叫做影片支援。
- composer 已貼上的圖片自動出現在 AbovePrompt 預覽列；可選擇圖片在 pane 放大。
- 顯示原生 Read 工具已讀取圖片的 inline 預覽；不改動其傳給模型的內容。
- `/preview pasted` 開啟目前 composer attachments，無法取得時清楚指出限制。
- `/preview on|off` 控制自動 inline／composer 圖片預覽；使用者可於 /config 設定。

## 原生 Mod 為主

根目錄就是可載入 plugin，含 `.claude-plugin/plugin.json`、`hooks/hooks.json`、TypeScript hooks 與 tests。
不需要 MCP server、瀏覽器 app 或 HTTP port 才能使用主功能。舊 MCP 工具鏈是 setup 草稿，須移除不必要依賴。

hooks module 無 Node API：讀檔／解碼交给隨 plugin 附帶的 Node stdlib helper，由 `$.process.run`／`$.process.spawn` 以 argv 啟動。
native `Markdown`、`Image` 與 `ui.blit` 負責 TUI 顯示。使用 installed ffmpeg／ffprobe；缺少時回報安裝需求，不能自動安裝。
圖片／影片 PNG 或 RGBA bytes 放在 Mod memory／UI，不能透過 model tool result 或 prompt 注入造成額外模型上傳。

## 資料與權限

- 來源 root 預設 Claude `session.root()`，且 helper canonicalize 後限制在 root。
- 額外目錄需使用者設定明確 roots；不能預設整個 home directory。
- 來源 regular file，拒絕 network URL／device／named pipe／symlink 越界；解析 realpath 後以 open handle 比對 identity。
- 本機 ffmpeg 是必要的高權限 subprocess；不使用 shell，限制 protocol 為 file／pipe，限制輸出解析度、fps、time、記憶體、process cleanup。
- pasted images 使用 Claude 目前 session 已貼圖附件；先以 prompt.read 取得 [Image #N]，再讀取同一 session 暫存目錄的對應檔案。不掃描剪貼簿歷史／session history／全 home cache。
- 使用 stdin 傳 pasted base64，禁止把大圖 bytes 放在 argv；轉檔使用 pipe，不寫 persistent screenshot。
- 播放 default 8 fps、最長單次 10 分鐘、frame 最大 640×360，避免 SSH 大量傳輸。
- 靜態來源上限 32 MiB，Markdown 2 MiB，影片 2 GiB，frame／最終 Image decoded 上限 2 MiB。
- close／pause／seek／session.end／hot reload／decoder error 都須中止舊 decoder，不能留下 ffmpeg 子程序。
- 不讀 token／SSH key，不使用 `$.http`、`$.model`、tool approval hook 或 prompt rewrite。
- Mods 以使用者權限執行，普通 Bash sandbox 不約束其 subprocess，文件必須如實告知。
- v1 不保證音訊、全格式 codec、tmux／screen、Claude Desktop pane、手機／Remote Control UI 可畫圖片。

## Feasibility 與證據

以 Claude Code 2.1.288 實際產生的 types 為契約，驗證：
1. composer before-submit attachments 可讀取的具體欄位；
2. `process.spawn` 的 stdout bytes／chunks／AbortSignal；
3. Image／ui.blit 頁面重繪與 cleanup；
4. installed ffmpeg 連續真實影格經 native terminal 元件繪製。

2.1.288 live probe 證實：原生 Ctrl+V 在送出前寫入 current-session images/N.png，prompt.read 文字保留 [Image #N]，原生貼图本身不觸發 prompt.edit。以互動工作階段內低頻 poll 觀察該列表，並清理 session.end timers。
協定／runtime 部署開關可造成 Mod 暫不可載入；先盡力更新 feature flags，在證據檔標明。

## 驗收

- Markdown 大檔分页；native rendered image，真正連續影片＋播放控制。
- 至少一個 before-submit composer attachment 可見且不改變送出內容。
- 所有 root containment、URL拒絕、input驗證、frame分割、停止/跳轉/錯誤 regression tests 通過。
- `claude plugin validate --strict .`、`claude plugin test .`、Node helper tests、TypeScript check 通過。
- Ghostty／Kitty real rendering 至少一次，SSH 至少一次或清楚標明未驗證。
- MIT License、README、SECURITY、CONTRIBUTING、marketplace 與繁中研究報告，無 public publish 或 GitHub push。
- 所有產品碼保留在 tools project；其他專案不寫入。

## 交付

README 主張與 compatibility table 依據 live evidence。
`docs/research.zh-TW.md` 提供可用於分享的研究內容：Mods用途、預覽差異、SSH、權限、效能限制與實際結果。
