# Claude Code Preview Mod

在 Claude Code 終端內預覽 Markdown、圖片、影片，以及尚未送出的貼圖。Plugin 名稱是 **`tui-preview-mod`**；`claude-code-preview-mod` 是專案名稱。

本專案以 **Claude Code 2.1.288** 開發與測試。已實測 Markdown 排版、圖片替代文字、連續影片影格、播放控制、送出前貼圖預覽列，以及 SSH 傳回 PNG bytes。**尚未驗證 Ghostty／Kitty 的可見圖片像素、Air 剪貼簿傳到遠端，或其他 Claude Code 版本。** 詳見 [相容性](docs/compatibility.md) 與 [驗證紀錄](docs/verification.md)。

## 執行需求與試用

需要可使用 Mods 的 Claude Code、互動式終端，以及執行 Claude 的主機上已安裝的 Node.js 20+、ffmpeg、ffprobe。Node 必須在 Claude 程序的 PATH；媒體工具在 `/opt/homebrew/bin`、`/usr/local/bin` 或 `/usr/bin` 查找。測試環境為 Node 26.8.1、ffmpeg／ffprobe 9.0.2，並未驗證所有 Node／codec 版本。

執行不需要 Yarn、`node_modules`、MCP server、瀏覽器或 HTTP port。先閱讀 [權限與資料邊界](SECURITY.md)，再從你已取得並信任的專案目錄載入：

### 從 GitHub 安裝（建議）

程式碼公開放在 `andrew54068/claude-plugins` 的 `tui-preview-mod/`，使用既有 `andrew54068` 市集，不需要私人 repo 存取權。**安裝與 Node／ffmpeg／ffprobe 必須在執行 Claude 的主機完成**；Air 透過 SSH 使用 Pro 的 Claude 時，是 Pro 需要這些工具。[官方 marketplace 說明](https://code.claude.com/docs/en/plugins/host-marketplace)

在 Claude 裡依序執行：

```text
/plugin marketplace add andrew54068/claude-plugins
/plugin install tui-preview-mod@andrew54068
/reload-plugins
/preview README.md
```

如果 `andrew54068` 已註冊，不必重複加入來源；先在 shell 執行 `claude plugin marketplace update andrew54068` 再安裝即可。

若先前安裝過 `tui-preview-mod@preview-mods`，先在 `/plugin` 的 Installed → 舊外掛 → Configure 記下已儲存的 `roots` 與 `autoPreview`。再卸載舊外掛，避免同名 Mod 同時載入；卸載會移除舊外掛保存的 options，不影響其他外掛或市集：

```text
/plugin uninstall tui-preview-mod@preview-mods
```

再安裝 `tui-preview-mod@andrew54068`，並從 Configure 重新套用先前記下的設定；尤其是曾設為 false 的 `autoPreview`，否則會恢復預設 true。`andrew54068` 是 marketplace 名稱；`tui-preview-mod` 是 plugin 名稱；本版為 `0.1.2`。舊 `preview-mods` 來源可保留；切換來源不是用來繞過 Mod 開關。

GitHub 安裝只改變取得外掛的方式，**不能保證 `/preview` 一定可用**。若仍缺少指令，執行 `/plugin` 檢查 `mods active`，並在 shell 執行 `claude plugin test` 查看載入限制；組織政策或 Anthropic 的 Mod 開關仍可拒絕它。[官方診斷](https://code.claude.com/docs/en/plugins/mods/troubleshoot)

### 不安裝的本機開發試用

```sh
claude --version
node --version
ffmpeg -version
ffprobe -version
claude plugin validate --strict /absolute/path/to/claude-plugins/tui-preview-mod/.claude-plugin/plugin.json
claude plugin validate /absolute/path/to/claude-plugins/.claude-plugin/marketplace.json
claude --plugin-dir /absolute/path/to/claude-plugins/tui-preview-mod
```

這種載入只作用於該次 Claude session，沒有安裝到全域。進入後用 `/plugin` 檢查 `tui-preview-mod` 是否載入。組織政策或 rollout 狀態仍可能阻擋 Mods；看到拒絕訊息時不能把它當成成功，也不要繞過政策。[官方 Mods 說明](https://code.claude.com/docs/en/plugins/mods/overview)

plugin manifest 在 `tui-preview-mod/.claude-plugin/`；marketplace manifest 在 repository 根目錄的 `.claude-plugin/`。請分別指定檔案；只驗證 repository 目錄會選到 marketplace，漏掉 Mod 的 hooks／calls。原市集有既有 metadata warnings，不能把它們與新外掛的 strict validation 混為一談。

## 使用方式

| 命令 | 效果 |
| --- | --- |
| `/preview notes.md` | 以原生 Markdown 分頁 |
| `/preview images/photo with spaces.jpg` | 顯示圖片；路徑中的空白保留 |
| `/preview "videos/demo clip.mp4"` | 以真實連續影格播放影片，無聲音 |
| `/preview pasted` | 開啟目前 session 最近已完成的貼圖預覽 |
| `/preview close` | 關閉 pane 並停止其解碼程序 |
| `/preview on`、`/preview off` | 切換本次載入的自動貼圖／Read 圖片預覽 |
| `/preview` | 顯示操作說明 |

路徑預設限制在目前 `session.root()`。額外目錄需在 `/plugin` 的 `tui-preview-mod` 設定中明確加入 `roots` 絕對路徑；最多採用 32 個。`autoPreview` 設定控制重新載入時的預設，`on/off` 不會儲存這項設定。`off` 不妨礙明確的路徑預覽。

影片按 `p` 播放／暫停、`h` 往前 5 秒、`l` 往後 5 秒、`r` 重播、`x` 或 Esc 關閉。Markdown 用 `h/l` 或按鈕換頁。先讓 pane 取得鍵盤焦點；原生 `Ctrl-X Tab` 可切換焦點。

原生貼圖進入目前 composer 後，約每 500ms 更新預覽列；最多兩張縮圖，其餘透過圖片按鈕明確載入。Read inline 與 composer 共用兩個自動解碼名額，前景 pane 是另外一個明確操作。Mod 不改寫輸入、不提交 prompt、不改變 Read 傳給模型的內容。貼圖若尚未完成、讀取失敗或自動預覽關閉，`/preview pasted` 可能沒有可用快照；可透過圖片按鈕重試。[實作](hooks/register.ts)

## 格式與上限

| 項目 | 上限／行為 |
| --- | --- |
| Markdown：`.md`、`.markdown` | UTF-8，2 MiB；每頁最多 9000 字元單位，移除終端控制字元 |
| 圖片：PNG、JPEG、WebP、GIF | 來源 32 MiB；GIF 只取第一幀 |
| 影片：MP4、MOV、WebM、MKV | 來源 2 GiB；是否可解碼仍取決於已安裝 ffmpeg |
| 所有圖片／影片輸出 | PNG，最大 640×360，每幀最多 2 MiB |
| 影片播放 | 8 fps、無聲音，只預覽來源前 600 秒，跳轉也受此範圍限制 |

不支援 URL、裝置、FIFO、越界檔案或檔案 symlink。PNG bytes 交給原生 `Image`／`ui.blit`；終端無法畫像素時可顯示原生替代文字。這不是獨立播放器，亦不提供無遠端 Claude 的 SSH 檔案瀏覽器。[helper](scripts/media.mjs)

## SSH

在檔案所在的遠端主機執行 **Claude Code + 此 Mod + Node／ffmpeg／ffprobe**，再由 client 終端觀看。使用現有可信 SSH 連線即可，不需為 Mod 開 port：

```sh
ssh your-trusted-host
claude --plugin-dir /absolute/path/on/remote/claude-plugins/tui-preview-mod
```

Air → SSH → Pro 解碼 → SSH PNG bytes → Air 的測試收到 8 張不同有效影格；未證明 Air 終端已畫出像素。client 剪貼簿不會因 SSH 自動變成 server 的剪貼簿：先讓圖片真正進入遠端 Claude composer，才有可預覽的附件。

## 更新與移除

在 shell 更新 GitHub catalog 與外掛，然後重新啟動 Claude 套用更新：

```sh
claude plugin marketplace update andrew54068
claude plugin update tui-preview-mod@andrew54068
```

互動式 `/plugin` 沒有 `update` 子命令；也可從 Installed 頁面的 Update now 更新，不要使用 `/plugin update`。

只移除外掛，保留 marketplace：`/plugin uninstall tui-preview-mod@andrew54068`。**不要為了移除此 Mod 而刪除整個 `andrew54068` 市集，那會影響其餘外掛。** shell 的等效命令去掉前面的 `/`，並在 `plugin` 前加 `claude`；若以非預設 scope 安裝，移除時指定相同 `--scope`。

只用 `--plugin-dir` 試用者，下次不帶該參數即可。[官方 marketplace 說明](https://code.claude.com/docs/en/plugin-marketplaces)

## 開發與文件

開發用 Yarn Classic；`yarn run check` 只驗證 Node/helper core。原生 Mod 另需 `claude plugin test .` 與 runtime 產生型別後的 Mod typecheck，完整命令見 [CONTRIBUTING](CONTRIBUTING.md)。

- [繁中研究報告](docs/research.zh-TW.md)：為什麼採用 Mod、SSH 與權限取捨。
- [SECURITY](SECURITY.md)：一般 Mods 權限、本專案 footprint 與解碼限制。
- [裝置安全檢查](docs/device-safety.md)：發布前的六項唯讀檢查與兩項剩餘風險。
- [相容性](docs/compatibility.md)、[驗證紀錄](docs/verification.md)：實測／自動測試／未驗證分界。

MIT License，見 [LICENSE](LICENSE)。
