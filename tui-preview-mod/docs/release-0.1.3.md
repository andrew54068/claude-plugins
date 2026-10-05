# 0.1.3 點選回覆中的路徑

2026-10-05。安裝 ID 仍是 `tui-preview-mod@andrew54068`。

## 新功能

- 全螢幕介面下，Claude 回覆裡的圖片或影片路徑畫成連結；單擊開啟預覽 pane，與 `/preview <path>` 走同一段程式。
- 只重畫提到媒體路徑的回覆，列的結構比照原生（項目符號、縮排、上方空行）；其餘回覆不經過 Mod 繪製。
- `@2x` 這類檔名（`icon@2x.png`）整段畫成同一個連結。
- 新設定 `clickablePaths`（預設 true）可關閉這項重畫。

## 邊界

- Cmd+click 由終端處理，Mod 收不到；Ctrl／Alt+click 維持 Claude Code 原本的開啟方式。
- 點選前不讀檔。點選後一樣經過 `media.mjs` 的 root、檔案類型、大小檢查；Mod 端的 root 比對只決定要不要畫成連結。
- 已儲存的訊息、模型輸入與 Read 結果都不變；沒有新增模型請求或上傳。
- 只在全螢幕介面、且 Claude Code 會畫可點選連結的終端重畫（Ghostty、iTerm2、WezTerm、kitty 等，判斷比照 2.1.289）。主畫面、Terminal.app 與未設 `FORCE_HYPERLINK=1` 的 herdr 照原生繪製。工作階段開始時讀 10 個終端識別環境變數，清單見 [SECURITY](../SECURITY.md)。
- 回覆若含重畫後無法點選的連結（`vscode://`、`mailto:`、Email、非 ASCII 開頭的相對連結），整則照原生繪製。
- 超過 10000 字元照原生繪製；超過 256 個不同路徑時，其餘路徑維持純文字。
- 程式碼區塊（含清單與引用中的）、網址（含 `www.`）、圖片語法、跳脫的括號與 `~/` 路徑不轉換。參考式連結的定義只改目的地；段落中形似定義的行照一般文字處理。
- 與原生的差異：不套用 `maxProseWidth`；說話者標籤下方多一列空行；滑鼠選取可能包含項目符號；macOS 以外的項目符號與原生不同。

## 效能

- 自動預覽每 500ms 讀一次輸入框，只在貼圖預覽列有變化時重畫；重畫會讓每則回覆重跑一次。
- 沒有媒體副檔名的回覆，在任何引擎呼叫前就交回原生繪製。

## 文件

- README 新增「點選回覆中的路徑」與「自訂 API 與 herdr」：自訂 API 時 Mods 開關沿用磁碟快取、herdr 的終端名稱與超連結偵測、三個環境變數的代價，以及免 `--settings` 的設定方式。
- 相容性表新增 herdr 0.8.x、mosh、Terminal.app、自訂 API 與點選的列。

## 驗證

46／46 core tests、31／31 native kit tests、2.1.289 原生 TypeScript 與 strict validation 通過。herdr 0.9.3 內的 live 測試：單擊路徑開啟 pane 並畫出圖片像素、Esc 關閉無 helper 殘留、沒有模型請求。細節見[驗證紀錄](verification.md)。

## 仍未驗證

mosh 的像素（需要另外的中繼，未實作）、連續影片的可見像素、Air 剪貼簿傳入遠端，以及其他平台。見[相容性](compatibility.md)。
