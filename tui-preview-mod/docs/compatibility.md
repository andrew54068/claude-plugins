# 相容性與限制

紀錄日期：2026-10-05。0.1.3 以 Claude Code **2.1.289** 的 runtime types 與真實終端驗證；0.1.2 以前依 2.1.288。不保證所有較新版本相容。產品名稱 `claude-code-preview-mod`，實際 plugin ID 名稱 `tui-preview-mod`。

| 環境／能力 | 本專案證據 | 判讀 |
| --- | --- | --- |
| 2.1.288 互動式終端 | 真實 PTY 載入、Markdown、Image alt、影片控制、送出前 PNG 貼圖列 | 已實測上述行為；不是圖片像素證據 |
| 2.1.289 全螢幕介面：點選回覆路徑 | herdr 內真實 PTY：單擊路徑開啟 pane、視窗截圖有像素、Esc 關閉、無 helper 殘留、無模型請求 | 已實測；Cmd+click 由終端處理，Mod 收不到 |
| Ghostty 圖片像素 | 直接執行與 herdr 0.9.3 內的視窗截圖 | 圖片已實測；影片像素未單獨截圖 |
| Air → SSH → Pro herdr | 使用者在 Air 的 Ghostty 截圖看到圖片；另有 8 張有效 PNG 的 byte transport 紀錄 | 已實測圖片像素 |
| Air → mosh → Pro herdr | mosh 只同步文字畫面，丟棄 Kitty 圖片協定 | 看不到像素；pane 與點選仍可用；中繼方案未實作 |
| herdr 0.8.x | 設定 `kitty_graphics = true` 並重啟後，直接送出的 Kitty 圖片仍空白 | 需升級到 0.9.3 以上 |
| Terminal.app、未設 `FORCE_HYPERLINK` 的 herdr | Claude Code 把連結畫成「文字 (網址)」，單擊送不到 Mod | 回覆照原生繪製（依終端環境變數判斷）；kit 測試 |
| settings 自訂 `ANTHROPIC_BASE_URL`／`ANTHROPIC_AUTH_TOKEN` | Mods 開關沿用 `~/.claude.json` 快取的舊值；舊值為關閉時 Mod 整個不載入 | 以 `DISABLE_TELEMETRY=1` 啟動，代價見 README |
| Air clipboard → 遠端 composer | 只有 Pro 本機原生 Ctrl-V 實測 | 未驗證 client clipboard 傳送 |
| 原生 Read inline | 官方 kit 測試保留原生結果、由 base64 解碼 | 自動測試；未做 live Read 工具 smoke |
| 暫停／跳轉／Esc 關閉 | live host stream 取消，無 helper 殘留；官方測試 | 已實測原版本；後續競態分支由回歸測試驗證 |
| clear／resume | live播放中clear停止helper，clear後重新預覽成功；官方kit回歸 | clear已實測；resume未做live smoke |
| 播放中程式變動的hot reload／舊module卸載 | 隔離副本只加註解觸發重載，helper停止、fixture無open fd | 已實測；舊環境invalidate有一次WARN；其他卸載情境未單獨測試 |
| 其他 Claude 版本、Linux／Windows | 沒有完整版本／平台實測；快取 adapter 使用 Unix uid／路徑 | 未驗證；Windows cache adapter 不支援 |
| Claude Desktop | 本 Mod 的繪圖 hook 明確限定 terminal | 不提供 Desktop 預覽；不是宣稱 Desktop 不支援任何 Mod |
| VS Code chat panel、`claude -p`、手機／Remote Control UI | 本產品要求互動式 terminal | 不承諾這些介面的預覽；請在主機終端操作 |
| tmux／screen | Claude Code 在其中預設停用圖片；未測強制開啟與穿透 | 未驗證 |
| 不執行遠端 Claude 的 SSH 檔案 viewer | 沒有該 client／服務 | 未實作 |

官方 reference 列出 `Image` 為 terminal-only，而 Markdown 有10,000字元的單元素上限；本 helper 分頁至9000。其他 app 是否能畫一般 Mod，與這個產品是否實作該 surface，是不同問題。[官方 reference](https://code.claude.com/docs/en/plugins/mods/reference)

對未變動的程式執行 `/reload-plugins` 可能只刷新 catalog 而不卸載 module；這次先觀察到影片持續播放，才另用隔離副本的單一註解變動驗證真正 hot reload。[生命週期證據](verification.md)

## 來源與資源

| 項目 | 本產品範圍 |
| --- | --- |
| Markdown | `.md/.markdown`、UTF-8、2 MiB；控制字元移除，分頁不拆 surrogate pair |
| 靜態圖片 | `.png/.jpg/.jpeg/.webp/.gif`、32 MiB；GIF 第一幀 |
| 影片容器 | `.mp4/.mov/.webm/.mkv`、2 GiB；codec 由 ffmpeg 決定，無聲音 |
| 輸出 | 最大640×360 PNG、每幀2 MiB、影片8 fps |
| pane 影片時間 | 來源前600秒；seek上限同為600秒，並非從任意 offset 再播放600秒 |
| 自動圖片解碼 | Read／composer共用2個名額；pane是獨立前景操作 |
| Read cache | 16張 decoded entries；至多128個本次 session 自動 attempt，舊 row 改用按鈕 |
| 貼圖 | 當前 session/root、數字圖片 ID，固定PNG/JPG/GIF/WebP候選；最多200 IDs、2張縮圖 |
| 回覆路徑連結 | 圖片／影片副檔名；超過10000字元或沒有媒體路徑時照原生繪製；超過256個不同路徑時，其餘路徑維持純文字；點選前不讀檔 |

貼圖不是公開 attachment-byte API：`prompt.read` 只有 `[Image #N]` 標記，adapter 使用同一 session 的內部快取規則。版本變更、快取建立晚於第一次檢查、不同 cwd/session 或缺少圖片時可能無法顯示；不會擴大掃描範圍。圖片按鈕可明確重試；`/preview pasted` 只採已完成快照。[helper](../scripts/media.mjs#L122)、[composer](../hooks/register.ts#L249)

設定限制與原生 decoder 權限見 [SECURITY](../SECURITY.md)。SSH 加密傳輸不會提升終端的畫圖能力，也不會自動傳送 client clipboard。
