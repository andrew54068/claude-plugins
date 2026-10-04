# 驗證紀錄與未完成項目

日期：2026-10-03；公開包裝日期：2026-10-04。以下是原始開發版的分層驗證摘要。`0.1.2` 保留相同的執行程式與測試，只調整版本、市集位置與安裝文件。此子目錄以乾淨產品快照加入既有 `claude-plugins` repository，沒有帶入原開發工作樹的 Git 歷史、API 探針、原始 debug log、圖片、主機資料或 session ID。歷史紀錄中的短 commit ID 只用來辨識本機開發版本，不是此 repository 的可查 revision。

## 分層證據

| 層級 | 結果 | 證明與範圍 |
| --- | --- | --- |
| Node/helper tests＋core TypeScript | 27 pass、0 fail、0 skip | 真實ffmpeg fixture、不同影格、路徑／限額／格式、SIGTERM／stdout close、協定與Player |
| 官方 native Mod kit | 19 pass、0 fail | 真實register/render tree/control/race；process／clock／session由stub回答，含最後3項回歸 |
| 原生 Mod TypeScript | exit0 | 2.1.288在root產生的型別；不是較舊公開copy |
| Plugin strict validation | passed | manifest/module footprint與語法；不等於native decoder安全鑑定 |
| Live PTY | 部分通過 | Markdown、Image alt、真實影片stream／控制／取消、送出前PNG貼圖列 |
| SSH helper transport | 通過 | Air→Pro解碼→Air收到8張不同有效PNG；非遠端Claude整個UI的像素E2E |
| live clear／程式變動hot reload | 通過，含一項WARN | clear取消後可重新預覽；真正重載取消舊helper並關閉fixture fd |
| Ghostty／Kitty pixels | 未驗證 | 沒有像素截圖或可見影片證據 |
| Air clipboard、live Read、resume | 未驗證 | 不以本機paste或官方kit替代這些結果 |

先前 `b02339f` 產品 gate 摘要（保留歷史命令）：

```text
$ yarn run check
$ yarn typecheck && yarn test
$ tsc -p tsconfig.json --noEmit
$ node --import tsx --test tests/*.test.mjs tests/player.test.mts
tests 27; pass 27; fail 0; cancelled 0; skipped 0

$ claude plugin validate --strict .
✔ Validation passed
$ claude plugin test .
16 pass
0 fail
Ran 16 tests across 1 file.
$ ./node_modules/.bin/tsc -p tsconfig.mod.json --noEmit
# exit 0, no diagnostics
$ git diff --check
# exit 0
```

這些官方測試沒有真實模型呼叫。`claude plugin test` 使用 stub answers；它的 UI tree 檢查不證明終端如何畫出元件。[官方 test 說明](https://code.claude.com/docs/en/plugins/mods/test)

歷史摘要中的目錄驗證不能替代兩層檢查。現在先進入 `tui-preview-mod/`，分開執行：

```sh
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate ../.claude-plugin/marketplace.json
```

最後修正本輪新增3項真正先失敗的 native 行為回歸：延遲停止中的 seek→replay 保留最新 offset 且只留1個 decoder；seek→pause 不重新開始解碼；`/preview off` 下成功 blit 仍更新時間標籤。同一 Job 共用停止 Promise，play 在 await 前建立意圖世代、之後核對最新操作；暫停也取消待開始的 play。成功 blit 的時間文字每個顯示整秒最多請求1次重繪，不依賴 composer poll。官方 kit 由16項增為19項、19 pass／0 fail；這些新分支仍是 kit／stub 證據，不新增像素或 live Read 主張。

```text
$ claude plugin test .
19 pass
0 fail
Ran 19 tests across 1 file. [11.33s]
$ ./node_modules/.bin/tsc -p tsconfig.mod.json --noEmit
# exit 0, no diagnostics
$ claude plugin validate --strict .claude-plugin/plugin.json
# hooks／calls 列出；Validation passed
$ claude plugin validate --strict .claude-plugin/marketplace.json
✔ Validation passed
```

## 真實互動與SSH

live PTY 的 Markdown pane 畫出標題／粗體／code／list。圖片 pane只觀察到Image alt。MP4影片時間持續前進；取得pane焦點後，p暫停、p再播、l跳轉、Esc關閉均有真實host取消紀錄，檢查無helper殘留。沒有圖片像素證據，不把時間標籤當成可見像素影片。

本機原生Ctrl-V測試先保存並在結束後恢復剪貼簿。composer尚未送出時，出現`[Image #1]`和「送出前貼圖預覽」列／Image alt；slash command清空輸入後，最近完成的snapshot仍可開啟pane。沒有為此測試提交模型提示。native Read與部分競態是官方kit證據；resume仍需另做live驗證。

controller另在`b02339f`以隔離CLI實測生命週期：播放中`/clear`讓host取消Node helper，session.end為12.2ms，pgrep無殘留；clear後重新`/preview`可啟動新helper與時間前進。對不變的程式執行`/reload-plugins`只刷新catalog，舊影片繼續，因此不算hot unload證據。

真正hot reload另用`git archive b02339f`的隔離副本：影片播放中只加入一行無行為作用的註解，watcher觸發重載。host取消舊helper、pane回到沒有預覽，pgrep無helper、lsof無fixture的open fd，測試CLI最後正常exit0。舊環境留下單次`ui.invalidate dropped: environment is unloaded` WARN，不能宣稱零警告。正式產品碼未因這項測試改動；這證明此重載造成的舊module卸載清理，未泛化到其他卸載流程。

SSH測試沿既有可信連線從Air啟動Pro的helper，由Air解析NDJSON與PNG signature／SHA-256。摘要已移除主機名稱、路徑與session ID：

```json
{"code":0,"frames":8,"distinctFrames":8,"validPng":true,"ended":true,"trailing":0}
```

沒有上傳圖片到模型、沒有持久化影片副本、沒有改SSH key／host trust、沒有開Mod port。這證明位元流可傳回client；未操作Airclipboard，也未驗證AirGhostty像素。遠端執行Claude的Mod整個UI仍需要獨立terminal smoke。

## 修正後已覆蓋的風險

目前回歸測試涵蓋Read／composer共用2個automatic名額、歷史Read row淘汰後不重複解碼、session.end讓等待中的pane open／nativebaseline失效，以及near-600秒seek抵達上限後停止decoder。這些新增分支在`b02339f`由官方kit驗證；live PTY紀錄是在修正前取得，不能把它當成新版所有分支都已實測。[register](../hooks/register.ts)、[official tests](../tests/register.test.ts)

## 文件／包裝本輪檢查

公開版使用既有 `andrew54068` 市集，plugin entry `tui-preview-mod`、source `./tui-preview-mod`。來源是同一 Git clone 的子目錄，不依賴私人 repo 或原作者本機路徑。原市集已有3項 metadata warnings，保留不動；新外掛本身須通過 strict validation。正式版本的驗證與 GitHub 安裝結果見[發布紀錄](release-0.1.2.md)；測試使用隔離設定目錄，不覆寫使用者既有設定。

## 尚需實測

1. 支援圖片協定的真實終端畫出PNG與連續影片像素，包含close後清理。
2. client圖片確實進入遠端composer，並在送出前顯示；與SSH bytes分開驗證。
3. live Read、resume及其他reload／停用／移除流程的helper／timer清理。
4. 其他Claude、Node、ffmpeg／codec／作業系統版本，以及tmux／screen。

以上缺口不影響已有測試紀錄的真實性，但限制README與相容性表可聲稱的範圍。
