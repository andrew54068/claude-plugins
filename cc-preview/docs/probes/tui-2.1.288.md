# Claude Code 2.1.288 TUI API 探針

2026-10-03。探針目錄：`.superpowers/probes/tui-api/`。沒有模型提示、模型 completion、套件安裝或產品檔案修改；互動測試只執行原生本機 slash command 與 Ctrl-V。兩次測試前都將完整目前剪貼簿項目／型別保存在 Swift 程序記憶體中，測試後恢復；兩次輸出皆為 `CLIPBOARD_RESTORED`。本次原剪貼簿為空。

證據根目錄：`<worktree>`。下列相對路徑皆以此根目錄解析：

- 原始互動記錄：`.superpowers/probes/tui-api/host-debug.log`。本文所有「debug 第 N 行」皆指此檔；2026-10-03 文件修訂時已唯讀核對 347、372、384、387、415、418、639 行。原始記錄留在本機且被 git ignore，沒有納入此文件提交。
- 目前測試：`.superpowers/probes/tui-api/tests/api.test.ts`。
- Runner stdout/stderr 沒有另存獨立 log。成功摘要與最後 gate 拒絕輸出保留於本報告「Runner 輸出位置與摘錄」段；它們是先前工具回傳的摘錄，文件修訂沒有重跑或重新聲稱測試通過。

## 結論

Markdown 與 PNG Image 元件、逐格 Image blit、文字格式 subprocess 串流均有目前版本契約。**原生圖片貼上後、提交前的圖片 bytes 不在 `prompt.read`；但已實測，原生 Ctrl-V 立即建立目前工作階段的 temp `images/ID.png`，且 `prompt.read().text` 含 `[Image #ID]`。** 因此可用限定工作階段的 cache adapter 讀取相符圖片。這是版本限定的內部快取契約，不是官方穩定附件 API。

影片必須將實際影片連續解碼為多張 PNG，以 base64 文字框架回傳，再更新同一 keyed Image；直接將二進位 PNG/RGBA stdout 交給 `process.spawn` 不成立，因為它先解碼 UTF-8。真正終端像素播放與 SSH 端到端畫面仍未驗證；CUA 拒絕 Ghostty 存取，未嘗試繞過。

## 本機型別（實際版本）

本機首次 `claude plugin test` 被已保存的 rollout 開關拒絕。接受此工作樹 trust 並啟動零提示互動 Claude 後，測試工具已啟用。`--plugin-dir` 載入時產生：

`.superpowers/probes/tui-api/.claude-plugin/types/claude-code/index.d.ts`

第一行為 `Written by Claude Code 2.1.288`。`validate --strict` 成功，但單獨 validate 不會寫 types。本檔以下行號是此探針產生的目前版本：

| 介面 | 行號 | 契約 |
| --- | --- | --- |
| `prompt.read` | 2746–2756、7766–7779 | `Promise<PromptBox>`，只含 `text`、UTF-16 `cursor`。無圖片 source／attachment。 |
| `prompt.edit` | 7999–8051 | `origin`、可選 key、編輯前 text/cursor、start/end、inputText。無圖片 bytes。 |
| `prompt.submit` | 8406–8440 | 提交後才有可選 attachments；每項僅 type/mediaType/filename，明確不提供 bytes。不要把 `prompt.attachment` 當圖片貼上事件；那是模型提醒文字事件。 |
| `Markdown` | 5385–5420 | `{text}`，最多 10,000 字元。terminal/desktop 支援；不是 HTML/video tag。 |
| `Image` | 5003–5128 | `{key?,source,columns,rows,alt}`；尺寸 1–255 格。source 支援 `{png:base64}`、`{rgba:base64,width,height}`，也有 file/shm。bytes source **最多 2 MiB decoded**；RGBA 維度各最多 2048，仍須符合 byte cap。 |
| `ui.blit` | 2180–2200、4966–4988、12820–12842 | `{requestId,key,source}` 更新同一 keyed Image；mounted size 固定；回傳 `{}` 或 `{deny}`。每秒最多取 120 次、約 60 次顯示，畫面間更新合併。 |
| `process.spawn` | 3303–3345、7597–7669 | request `{argv,cwd?,env?,input?}`；yield `{stream:'stdout'|'stderr',text:string}`，UTF-8 text，不是 bytes；generator 最終 return `{code:number|null,signal:string|null}`。未讀到 1,048,576 字元時 backpressure 阻塞子程序。 |
| spawn 生命週期（僅型別文件契約） | 3310–3314 | 離開迴圈、generator.return、`next.signal` abort、module unload 會殺子程序；單純 hook return 不會殺仍在執行的背景串流。本探針未實測取消。 |
| `process.run` | 3289–3302、7558–7593 | 一次性 `{exitCode,stdout,stderr,isStdoutTruncated,isStderrTruncated}`；每個 pipe 各截至前 4 MiB **bytes**。沒有 binary/base64 encoding 選項；helper 必須自己輸出 base64 字串。 |
| `audio.play` | 2457–2480 | macOS asset 由主機 `afplay`；Linux/Windows terminal 可能跳過。無保證 SSH 音訊送到 client。影片 silent playback 可行；client 同步音訊仍屬額外驗證。 |
| 測試工具 | 13900 起 | `claude-code/testing` 的 test/expect/mock、ui.mount。此測試 host 不提供真正 fs/network/process，需要 stub；generator stub 的 return 是 `{value:{code,signal}}`，yield 仍直接 `{stream,text}`。 |

SSH 必须使用 PNG bytes：`Image({source:{png:base64}, ...})`。`{file:'/remote/path'}`／shm 由終端所在機器自己開啟，跨 SSH 不可讀（types 5030–5040）。PNG 需在 helper/server 驗證及縮小至 2 MiB decoded 以內。`fs.read(path,{as:'bytes'})` 可回傳 bytes/base64（generated types 3028 起）；一般遠端檔案也可由本機已安裝 `/usr/bin/base64 -i path` 或 Node helper 產生 base64 stdout，拒絕任何截斷輸出。

## 實際提交前圖片貼上證據（不是 mock）

互動 session id 透過已註冊 `/probe-info` 的 `$.session.id()` 實測：

`<session id>`

工作階段從 implementation 啟動，Ctrl-V 前沒有任何 image submission。Swift 僅使用 AppKit NSPasteboard 操作受控 1×1 PNG fixture，不控制 Ghostty。Ctrl-V 後 TUI composer 立即顯示 `[Image #1]`。當時尚未按 Enter，debug log 第 347 行已記錄：

`Stored image 1 to /private/tmp/claude-<uid>/<worktree slug>/<session id>/images/1.png`

只檢查上述精確路徑，`file` 證實 1×1 RGBA PNG，size 70、mode 0600。沒有掃描 home、其它 session 的圖片、完整歷史或 transcript。

原生 image paste 本身沒有觸發本 mod 的 prompt.edit。其後鍵入受控 `y`（仍未提交）才觸發 hook；debug 第 372 行：

```json
{"probe":"draft-observation","keys":["cursor","text"],"placeholder":true,"length":13,"inputLength":1}
```

這是實際 `$.prompt.read()` 的 key 集合與文字中 `[Image #1]` 存在性。只記錄 metadata，沒有剪貼簿內容。程式：`.superpowers/probes/tui-api/hooks/register.ts:13`；剪貼簿保存／恢復：`.superpowers/probes/tui-api/helpers/fixture-clipboard.swift:1`。

接著清除 composer（不提交 fixture），執行原生 `/cd .superpowers/probes/tui-api`。相同 session 再 Ctrl-V，立即顯示 `[Image #2]`；尚未提交，debug 第 639 行：

`Stored image 2 to /private/tmp/claude-<uid>/<worktree slug>--superpowers-probes-tui-api/<session id>/images/2.png`

所以只記錄 startup 根目錄會在 `/cd` 後失效。cache root 追隨 engine 的 current `originalCwd`，不是隨 shell 子程序 `cd`。`$.session.root()` 型別文件說明它追隨 `/cd`（2572–2579）；實際 binary 的 `qoe()` 明確回傳 `root:Ee()`（byte offset 188039175），而 cache 的 `Fk()` 同樣用 `Ee()`。因此 **`$.session.root()` 就是此公式需要的 currentOriginalCwd**；不要用 `$.session.cwd()` 替代。此輪 `/cd` 後相對 `--plugin-dir` 無法再載入新增 `/probe-info`，所以沒有重新取得 root 實值；實際移動的 cache 路徑與 binary 的 API-to-root 對應都有直接證據。正式 adapter 應以絕對 plugin path 啟動，並在每輪刷新 session.root()。

## 完整 cache 路徑公式與版本界線

目前安裝 native binary 可直接讀到 bundled JavaScript；不是從較舊 GitHub 型別推測：

`/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-darwin-arm64/claude`

以下為二進位 UTF-8 source anchor 起始 byte offset，足以重新唯讀定位：

| offset | 原始碼證據 |
| --- | --- |
| 179442269 | `XS()` 取非空 `CLAUDE_CODE_TMPDIR`，否則 `/tmp`。 |
| 179443840 | `R()` 產生 `claude-${process.getuid?.()??0}`； `_l()` 組 temp base，驗證 owner、0700。diskless session 拒絕。 |
| 182952887 | `xp()` 對上述 per-uid root 做 `realpathSync`，memoize。 |
| 182953269 | `Fk(){return q2t(Ee())}`；`q2t(e)` = `join(xp(),uP(e))`。 |
| 179033807 | `Ee()` = active session `originalCwd`。 |
| 188039175 | `qoe()` 提供 `$.session.root()` 的 value，明確為 `root:Ee()`，與 image store 同源。 |
| 180894717 | `uP()`：每個非 ASCII alnum 字元換成 `-`；最多 200 chars；長路徑加 hash 後綴。 |
| 179164327 | hash：UTF-16 charCodeAt 累積 `(hash<<5)-hash+code | 0`。 |
| 194889144 | image store = `join(Fk(),q(),hEr)`；diskless 或另一禁用條件回 null；文件 ID 非負 safe integer，以 content magic 決定副檔名。 |
| 194843761 | `hEr="images"`。 |

```ts
function projectKey(originalCwd: string) {
  const slug = originalCwd.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length <= 200) return slug;
  let hash = 0;
  for (let i = 0; i < originalCwd.length; i++)
    hash = ((hash << 5) - hash + originalCwd.charCodeAt(i)) | 0;
  return `${slug.slice(0, 200)}-${Math.abs(hash).toString(36)}`;
}
// host-side only; TMPDIR (generic OS var) is NOT this engine's default.
const uidRoot = realpathSync(join(process.env.CLAUDE_CODE_TMPDIR || '/tmp', `claude-${process.getuid?.() ?? 0}`));
const images = join(uidRoot, projectKey(currentOriginalCwd), sessionId, 'images');
const ids = [...draft.text.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1]));
```

短路徑與 `/cd` 路徑如上已实測。長路徑 hash、configured `CLAUDE_CODE_TMPDIR` 來自實際 binary source，沒有另外啟動長路徑或 override-temp session。這個公式沒有官方穩定版保證；升級需版本檢查與 native fixture regression。只開啟目前 session/根目錄、目前 composer 列出的 ID 和限定格式 png/jpeg/webp/gif；檢查 realpath containment、regular file、ownership、magic bytes、大小，失敗明確提示。純文字偽造 `[Image #N]` 不能繞過 session 範圍。

未提交原生貼上不觸發 prompt.edit，所以要用有生命週期的 250–500ms bounded clock poll 讀取 prompt.read 和 pending IDs；cache 寫入可能稍晚，應 bounded retry，停止／reload／session.end 時取消。不要掃描所有圖片以補救。上述是可行替代的必要條件，不是完整產品設計。

SSH 的 clipboard 屬 client MacBook Air；遠端原生 Ctrl-V 可能讀的是 server clipboard，不能以 Pro 本機實測聲稱 Air clipboard 已被傳送。client 必須真的把圖片傳到遠端 composer，或另有明確 client helper／私有傳输。圖片一旦進入此工作階段 cache，inline rendering 以 PNG bytes 送回終端，不使用 server 檔案路径。

## subprocess 與 render 測試證據

`.superpowers/probes/tui-api/helpers/two-frames.mjs:4` 只啟動已安裝 ffmpeg（不安裝、不下載），解碼 lavfi testsrc 成兩張 16×16 PNG；Node standard-library helper 按 PNG chunk boundary 分割，每張輸出 base64 + newline。`.superpowers/probes/tui-api/hooks/register.ts:26` 用 ACTUAL `$.process.spawn` 讀取此 helper。

互動 `/probe-host-stream` 實際結果：

```json
{"count":2,"distinct":2,"pngHeaders":["iVBORw0KGgoA","iVBORw0KGgoA"],"trailing":0,"result":{"code":0,"signal":null}}
```

debug 384、387 行：host Node subprocess 啟動、94ms 後 exit0、2 chunks。這證明兩張不同 PNG 經 host stream 到 mod，**尚未證明它們真的在 Ghostty blit 成影片**。

互動 `/probe-host-run` 實際結果：exitCode0、stdout 兩張 PNG base64、stderr 空、兩個 truncation flags false；debug 415、418 行：65ms、586 chars。這是實際 subprocess，不是 stub。stderr status 不得拼進 frame parser；chunk 不等於 line；stdout 每幀必須明確 framing，限額及 backpressure。

驗證成功記錄：

```text
claude plugin validate --strict .superpowers/probes/tui-api  -> PASS
claude plugin test .superpowers/probes/tui-api              -> 4 pass, 0 fail
./node_modules/.bin/tsc -p .superpowers/probes/tui-api --noEmit -> PASS
```

退出互動 session 後的最後一次重跑：strict validate 與 typecheck 仍 PASS；`plugin test` 又回報 persisted rollout switch off，未執行測試。前兩次已觀察到 4 pass/0 fail，不能把目前這次拒絕說成再次通過。此帳號／環境的 Mod rollout gate 有漂移，獨立於探針型別與原生貼上結果；正式使用前必須重新確認 live enablement，不能只靠本次通過記錄。

`.superpowers/probes/tui-api/tests/api.test.ts:4` 僅證明 mock prompt shape；不能充作原生貼上支援。`:11` 驗證 host stream API 的 split-chunk/base64 parser shape（process stub）。`:29` 驗證實際 render hook 在測試 host 畫出 Markdown/Image 元件 tree；ui.blit 由 stub 回應，所以不能充作畫面播放、kitty 協定、SSH、scroll 或效能驗證。所有互動 Claude session 已退出，fixture clipboard helper 已退出，沒有啟動待存活 server。原探針 worker 沒有提交探針程式；controller 後來以 `b8259c8` 提交了公開證據報告，這不是「尚未有任何 commit」的目前狀態。

本探針 **沒有執行 `process.spawn` 的實際取消、generator.return、signal abort 或 module unload 子程序清除測試**。已實測的子程序都自然結束為 exit0。表中的取消／生命週期語義僅取自 2.1.288 型別文件，不是探針驗證結果。正式 Task 2／Task 3 必須測試播放中取消、session.end、module reload/unload 後子程序與 timer 確實結束，並分別記錄實際 host 證據；目前 4 個 stub/tree 測試無法取代此要求。

## Runner 輸出位置與摘錄

原先 runner 的輸出位置是此探針工作階段的工具回傳，未建立專用 runner-output 檔。本節是可供 reviewer 查閱的文件摘錄，不是新一輪執行 log。執行 cwd 皆為上述 implementation 根目錄；目前測試原始碼位置為 `.superpowers/probes/tui-api/tests/api.test.ts`。成功摘要取自先前 `functions.exec` 回傳的 execution chunk `312dfd`；最後拒絕訊息取自 chunk `1d3c90`。

```text
$ claude plugin test .superpowers/probes/tui-api
4 pass
0 fail
Ran 4 tests across 1 file. [0.14s]
```

此摘要來自修改第一個測試的顯示名稱之前；目前四個測試名稱以 api.test.ts 為準。後續唯一相關改動是第一個測試的 mock 標籤／stub 調整；最後重跑沒有執行測試，不能把這個歷史摘要寫成目前檔案的最新通過結果。

```text
$ claude plugin test .superpowers/probes/tui-api
claude plugin test: hooks modules are turned off in this process: the rollout switch was saved off by an earlier session and is not refreshed yet. Start `claude` once with network access, then run the tests again; if this message returns, installed mods are turned off remotely
```

`validate --strict` 最後一次工具回傳（同一 chunk `1d3c90`）為 `✔ Validation passed`；typecheck 指令 `./node_modules/.bin/tsc -p .superpowers/probes/tui-api --noEmit` 在該回傳及後續 chunk `4e5f93` 皆沒有 diagnostic，exit0。完整逐項測試 console output 未另存為檔；不把 host-debug.log 說成測試 runner log。

官方路由參考：[Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)、[Create a mod](https://code.claude.com/docs/en/plugins/mods/create)、[Test a mod](https://code.claude.com/docs/en/plugins/mods/test)。API 細節以上述 2.1.288 runtime-generated declarations 與本機實測為準。
