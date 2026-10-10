# Claude Code Remote Preview Mod — 跨裝置對話內圖片預覽設計

- 日期：2026-10-03
- 狀態：已於 2026-10-03 核准
- 專案位置：`<project root>`
- 預定授權：MIT

## 1. 目標

當 Agent 與圖片檔案位於遠端裝置（例如 MacBook Pro），使用者從另一台裝置
（例如 MacBook Air）透過 SSH 或其他遠端工作階段操作時，應能直接在支援的
對話介面看見圖片，而不是先手動下載檔案或開啟遠端 Finder。

產品以 Claude Code Mod 為主要入口；MCP 與 MCP Apps 是跨裝置 transport／相容層，
讓其他相容 Agent host 也能要求遠端裝置準備預覽。

## 2. 必須誠實面對的限制

「任何 Agent 都能在對話中 inline 顯示圖片」不是 MCP server 單方面能保證的。
最後如何顯示由 Agent client／host 決定。產品提供三條明確分離的路徑：

1. **MCP Apps（預設、建議）**：相容 host 在對話中建立 sandboxed UI，圖片只送給
   人看的 View，不把完整圖片 bytes 放進模型內容。
2. **Claude Code terminal adapter**：Claude Code Mod 透過 terminal `Image` element
   顯示 PNG；在 SSH 工作階段中傳送圖片 bytes，而不是遠端檔案路徑。
3. **標準 MCP image result（明確 opt-in）**：供沒有 MCP Apps、但能渲染 MCP image
   block 的 client 使用。圖片可能進入模型上下文並送往模型供應商，因此預設關閉。

沒有 MCP Apps、沒有 MCP image rendering、也沒有專用 adapter 的 client，v1 無法在
其對話內 inline 顯示圖片。工具必須回報此限制，不能假裝成功。

## 3. 非目標

- 不提供通用檔案同步或 SSH 檔案瀏覽器。
- 不公開 HTTP server、public tunnel 或網際網路分享連結。
- 不編輯、刪除或覆寫來源圖片。
- 不預覽 PDF、影片、音訊、SVG 或任意二進位檔。
- 不承諾 tmux、screen 或所有 terminal emulator 都能顯示圖片。
- 不以 hook 攔截或改寫所有 Agent 回覆文字來猜測檔案路徑。
- 不把模型看見圖片與人類看見預覽混為同一件事。

## 4. 使用情境

### 4.1 MacBook Air 透過 SSH 操作 MacBook Pro

```text
MacBook Air 上的對話 client
        │
        │ SSH／遠端 Agent session
        ▼
MacBook Pro 上的 Agent host
        │ stdio MCP
        ▼
claude-code-remote-preview-mod server
        │ 只讀取 Pro 上允許 root 內的圖片
        ▼
MCP App / client adapter
        │ 圖片 bytes 隨既有 session transport 回傳
        ▼
MacBook Air 對話內顯示
```

MCP server 與圖片在同一台遠端裝置上，因此核心不需要管理 SSH key，也不需要自行
建立第二條 SSH 連線。SSH 是 Agent session 的 transport，不是 server 的檔案 API。

### 4.2 圖形化 MCP Apps host

Agent 呼叫 `prepare_image_preview`。模型只收到短文字與安全的 metadata；host 在對話
中載入 `ui://claude-code-remote-preview-mod/view.html`。View 再呼叫 app-only tool 取得圖片 bytes。

### 4.3 Claude Code CLI

Claude Code Mod 辨認 `prepare_image_preview` 的結果，使用 `previewId` 向同一 MCP server
取得 PNG bytes，再以 terminal `Image` element 畫在工具結果下方。若 terminal 不支援
圖片協定，顯示檔名、尺寸與明確 fallback 訊息。

## 5. 架構

保持單一 TypeScript 專案，不建立多套重複實作。

```text
claude-code-remote-preview-mod/
├── src/
│   ├── cli.ts                 # flags、build output 與 stdio startup
│   ├── errors.ts              # 穩定 error codes 與安全公開訊息
│   ├── server.ts              # stdio MCP server 與 tool/resource registration
│   ├── tools.ts               # MCP tool handlers 與 model/UI content boundary
│   ├── path-policy.ts         # allowed roots、realpath、symlink containment
│   ├── image-inspector.ts     # magic bytes、MIME、dimensions、size limits
│   ├── preview-store.ts       # 記憶體內 previewId -> verified path，短 TTL
│   ├── safe-read.ts           # O_NOFOLLOW open、fingerprint 與讀前讀後檢查
│   └── config.ts              # CLI args 與安全預設
├── ui/
│   ├── app.ts                 # MCP App：取得並顯示圖片
│   └── index.html             # sandboxed conversation UI
├── claude-plugin/
│   ├── .claude-plugin/plugin.json
│   ├── hooks/hooks.json
│   └── hooks/register.ts      # Claude Code terminal adapter
├── tests/
├── docs/
│   ├── research.zh-TW.md
│   └── superpowers/specs/
├── package.json
├── yarn.lock
├── README.md
├── SECURITY.md
└── LICENSE
```

共享的路徑驗證、MIME 判斷與限制只存在於 `src/`。Claude adapter 不重新實作安全邏輯，
只使用 MCP server 已核准的 `previewId`。

## 6. MCP 介面

### 6.1 `prepare_image_preview`

模型可見、read-only、無副作用。

輸入：

```ts
{
  path: string
}
```

行為：

1. 以 configured root 為基準解析相對路徑。
2. `realpath` 解析來源檔與所有 symlink。
3. 驗證結果仍位於 allowed root。
4. 驗證 regular file、magic bytes、檔案大小與像素尺寸。
5. 建立隨機、短效、記憶體內的 `previewId`。

回傳給模型的 `content` 只包含：basename、MIME、尺寸、大小與成功／失敗原因。
不包含圖片 base64。

供 View 使用的 `structuredContent` 包含：

```ts
{
  previewId: string,
  name: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
  width: number,
  height: number,
  size: number
}
```

工具宣告 `_meta.ui.resourceUri = "ui://claude-code-remote-preview-mod/view.html"`。

### 6.2 `read_preview_image`

僅對 MCP App 可見，`visibility: ["app"]`。模型不能自行發現或呼叫。

輸入：

```ts
{
  previewId: string
}
```

server 重新檢查檔案 identity、mtime、size 與 containment，再回傳原始 image content。
`previewId` 預設五分鐘失效，且 server 重啟後全部失效。

### 6.3 `preview_image_for_model`

預設不註冊。只有啟動 server 時明確加上 `--enable-model-image-output` 才提供。

它直接回傳 MCP `image` content block，適用於不支援 MCP Apps 但能渲染 image result 的
client。README 與工具說明必須警告：圖片可能進入模型上下文並離開裝置。

## 7. MCP App

- 單一自包含 HTML/JavaScript resource，不載入外部 CDN、字型或 analytics。
- CSP 不允許外部 network connection。
- View 從 tool result 取得 `previewId`，再呼叫 app-only `read_preview_image`。
- View 將 bytes 建成 Blob URL；teardown 時 revoke URL。
- 提供 fit、actual-size、背景切換與基本 metadata；不提供編輯功能。
- host 不支援 MCP Apps 時，仍收到有意義的純文字結果。

這條路徑把圖片傳給人類 UI，但不把完整 bytes 放進模型 `content`。任何 host 若違反
MCP Apps 的 capability／visibility contract，屬 host 限制，文件需記錄而不能掩蓋。

## 8. Claude Code terminal adapter

- 最低版本：Claude Code 2.1.287。
- 只處理本專案 MCP tool 的結果，不觀察所有 tool call 或所有 prompt。
- 首先以 spike 驗證 Claude Mod 的 `$.mcp.call` 能否呼叫 `visibility: ["app"]` 的
  `read_preview_image`。官方文件沒有保證這個 Mod-to-app-only-tool 組合。
- 若 spike 成功，Mod 不呼叫 `$.fs`、`$.process`、`$.http`、`$.model`、`$.prompt` 或
  `$.session.send`。高權限呼叫只有指向本專案 server 的 `$.mcp.call`，另使用
  `$.ui.resolve` 與 `$.ui` rendering methods。
- 若 spike 失敗，不靜默改成廣泛的 filesystem access。可行替代是由 Mod 使用
  `$.fs.stat(..., { resolve: true })` 與 `$.fs.read`，重新做 session-root containment；
  但這會讓 Mod 靜態 footprint 取得任意檔案讀取能力，必須先回到設計審查，不能直接實作。
- Claude Code `Image` element v1 只畫 PNG。JPEG、WebP、GIF 顯示 metadata 與
  「此 terminal adapter 僅支援 PNG」訊息；MCP App 仍可顯示原格式。
- 透過 SSH 時必須傳 PNG bytes。不得將 `{ file: remotePath }` 交給 Air 上的 terminal，
  因為 Air 無法讀取 Pro 的 filesystem。
- 不支援圖片協定的 terminal 顯示 alt text，不造成 session crash。

## 9. 路徑與權限模型

### 9.1 Allowed roots

- server 啟動時至少需要一個 `--root <absolute-path>`。
- 可重複 `--root`，但不接受隱含的整個 home directory。
- root 在啟動時 canonicalize；不存在或不是 directory 則啟動失敗。
- 相對輸入路徑以第一個 root 為基準。
- 不展開 `~`，避免看似相對、實際跨出 root 的行為。

### 9.2 Containment

- 對來源檔執行 `realpath`，以 `path.relative(root, realPath)` 判斷 containment。
- `..`、絕對路徑與 symlink 本身不是自動拒絕條件；最終 real path 在 root 外才拒絕。
- 讀取前後比較 device/inode（平台可用時）、mtime 與 size，降低 TOCTOU 置換。
- 實際讀取以 `O_NOFOLLOW` 開啟，並以 open file handle 在讀前與讀後重驗 fingerprint；
  不以先 `stat`、後 `readFile(path)` 的分離操作讀取內容。
- 只接受 regular file。

### 9.3 格式與資源限制

- 支援：PNG、JPEG、WebP、GIF。
- 以 magic bytes 判斷格式，副檔名只作顯示用途。
- 拒絕 SVG，即使副檔名看似圖片，因為它可包含主動內容與外部資源。
- 預設最大檔案 8 MiB；硬上限 32 MiB。
- 預設最大寬／高各 8192 px，最大總像素 40 megapixels。
- 超限時拒絕，不在 v1 自動縮圖或執行外部 decoder。

### 9.4 Preview ID

- 使用 cryptographically random token，不包含路徑或檔名。
- 僅存在記憶體，不寫磁碟。
- TTL 五分鐘；讀取成功不延長 TTL。
- 錯誤與一般 log 不輸出絕對路徑；debug mode 才輸出，且清楚警告。

## 10. 錯誤處理

所有錯誤回傳穩定 code 與可讀訊息：

- `ROOT_REQUIRED`
- `ROOT_NOT_FOUND`
- `FILE_NOT_FOUND`
- `NOT_A_REGULAR_FILE`
- `OUTSIDE_ALLOWED_ROOT`
- `UNSUPPORTED_MEDIA_TYPE`
- `IMAGE_TOO_LARGE`
- `IMAGE_DIMENSIONS_TOO_LARGE`
- `PREVIEW_EXPIRED`
- `FILE_CHANGED`
- `CLIENT_UI_UNSUPPORTED`
- `TERMINAL_IMAGE_UNSUPPORTED`

錯誤不洩漏 allowed root 以外的檔案存在與否。對外訊息使用 basename；完整錯誤只在
使用者明確開啟 debug mode 時寫到 stderr。

## 11. Client 支援矩陣

| Client 類型 | v1 行為 | 圖片是否可能進模型 |
| --- | --- | --- |
| 支援 MCP Apps 的圖形化 host | 對話內 sandboxed View | 預設否，模型只收 metadata |
| Claude Code CLI + Mod + 相容 terminal | PNG inline；其他格式 metadata fallback | 否 |
| 只支援 MCP image result 的 host | 使用者明確開啟 opt-in tool 後 inline／attachment | 是，視 host 而定 |
| 不支援 MCP Apps/image/adapter | 純文字 metadata，不宣稱已預覽 | 否 |
| tmux／screen 中的 Claude Code | best effort；需 terminal multiplexer passthrough | 否 |

每個實測過的 client 版本、OS、連線方式與結果都記入 README compatibility table；未測試
項目標記 `unverified`，不以推測填 `supported`。

## 12. 測試策略

### 12.1 Unit tests

- root canonicalization 與多 root。
- `../`、absolute path、symlink escape、case alias。
- missing/non-regular file。
- PNG/JPEG/WebP/GIF magic bytes 與 dimensions。
- 偽副檔名、SVG、oversize、pixel bomb headers。
- previewId randomness、TTL、file replacement、restart invalidation。

### 12.2 MCP integration tests

- stdio 啟動與 `tools/list`。
- `prepare_image_preview` 不回傳 image bytes 給模型 content。
- UI resource 與 `_meta.ui.resourceUri` 一致。
- `read_preview_image` 僅 app-visible，回傳正確 MIME 與 bytes。
- opt-in tool 未啟用時不存在；啟用時才回傳 image block。

### 12.3 MCP App tests

- tool result 到 View。
- app-only image fetch。
- Blob URL 建立與 teardown revoke。
- CSP 無外部連線。
- expired/error/fallback states。

### 12.4 Claude Mod tests

- `claude plugin validate --strict`。
- `claude plugin test` 驗證 PNG Image element、非 PNG fallback、unsupported terminal fallback。
- footprint 必須沒有 `fs.*`、`process.*`、`http.*`、`model.*`、`prompt.*`。
- 實際 Ghostty／kitty terminal 測試。

### 12.5 跨裝置 E2E

最低驗證案例：

1. MacBook Pro 建立測試 PNG。
2. MacBook Air 透過 SSH 進入 Pro。
3. 遠端 Agent 呼叫 `prepare_image_preview`。
4. Air 端對話顯示實際圖片。
5. Air 不產生持久化副本；Pro 不建立暫存檔。
6. 重複測試 PNG、JPEG、WebP、GIF 與越界路徑拒絕。

2026-10-03 從 Pro 對設定的 Air SSH alias 做 read-only 探測時 timeout。因此目前只能
確認 alias 存在，尚未完成 Air ↔ Pro 實機驗證；完成前 compatibility table 必須標成
`unverified`。

## 13. 開源與供應鏈要求

- TypeScript；使用 Yarn。
- 依賴只包含 MCP server／MCP Apps 所需的官方套件與 schema validation；不加入圖片
  decoder、native binary 或 postinstall script。
- lockfile 納入版本控制。
- GitHub Actions 第三方 action 固定完整 commit SHA。
- 發佈前提供 `SECURITY.md`、threat model、expected Mod footprint 與完整移除方式。
- marketplace／plugin 安裝文件明確說明：第三方 plugin／Mod 以使用者權限執行。
- 不自動安裝到使用者全域設定；本機開發先用一次性 `--plugin-dir`／stdio config。

## 14. 分享內容

`docs/research.zh-TW.md` 將以繁體中文整理：

- Claude Mods、MCP image block、MCP Apps 的差異。
- 為何遠端路徑不能直接在 Air 預覽。
- 三條顯示路徑與 privacy boundary。
- 什麼是聰明的設計：server 跟檔案同機、app-only fetch、最小權限、誠實 fallback。
- 限制：host rendering、terminal protocol、tmux、大小、格式與版本漂移。
- 第三方 Mod 的高權限風險與安裝前檢查方式。
- Air ↔ Pro 的實測證據與尚未驗證項目。

文章是研究報告，不直接寫入內容專案；使用者確認後再走內容 pipeline。

## 15. 驗收標準

v1 完成需同時滿足：

1. MCP server 能在 allowed root 內準備四種圖片格式的 preview。
2. 預設路徑不把圖片 bytes 放進模型 content。
3. 支援 MCP Apps 的 host 能在 conversation View 顯示圖片。
4. Claude Code terminal adapter 能透過已驗證的 app-only MCP call 在相容 terminal 顯示
   遠端 PNG；若 Claude Code 不允許該 call，需停止並回報設計 blocker，不能降低權限後
   宣稱同一設計完成。
5. 所有越界、symlink escape、oversize、錯誤格式測試通過。
6. 沒有 HTTP listener、外部網路、外部 converter、暫存圖片或 analytics。
7. `claude plugin validate --strict` 與 `claude plugin test` 通過。
8. 至少完成一次 Air → Pro 的真實 SSH E2E；若環境仍不可用，v1 不得標為完整支援，
   只能標為 implementation complete / remote verification pending。
9. README compatibility table 只列出有證據的支援狀態。
10. SECURITY.md 與繁中研究報告完成。

## 16. 後續而非 v1

- 對非 PNG 圖片做安全、可選的離線轉檔。
- 專用 Codex／其他 terminal agent adapter。
- 圖片比較、zoom、像素取樣與 annotation。
- 經使用者明確要求的 Tailscale 私有 browser fallback。
- 影片首幀、PDF 首頁與大型圖片縮圖。

這些功能只有在 v1 的 client compatibility 與跨裝置驗證有數據後才評估。

### 16.1 實作前 feasibility gates

正式 implementation plan 的第一階段必須是兩個不保留產品碼的 probe：

1. MCP Apps host 是否會讓 View 呼叫 `visibility: ["app"]` 的 image tool，且模型收到的
   `content` 不含圖片 bytes。
2. Claude Code 2.1.287+ 的 Mod 是否能以 `$.mcp.call` 呼叫同一 app-only tool，並從結果
   取得 PNG content block 而不把它加入模型 transcript。

任一 probe 失敗都屬架構 blocker：停止、保留測試證據、回到使用者選擇替代方案。

## 17. 參考契約

- MCP TypeScript SDK image results：
  <https://ts.sdk.modelcontextprotocol.io/server>
- MCP Apps overview 與 model/UI data separation：
  <https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html>
- MCP Apps app-only tool visibility：
  <https://apps.extensions.modelcontextprotocol.io/api/interfaces/app.McpUiToolMeta.html>
- Kitty Graphics Protocol remote-client byte transmission：
  <https://sw.kovidgoyal.net/kitty/graphics-protocol/>
- Claude Code Mods overview 與權限模型：
  <https://code.claude.com/docs/en/plugins/mods/overview>
- Claude Code Mods elements 與 limits：
  <https://code.claude.com/docs/en/plugins/mods/reference>
