# 0.1.3 點選回覆中的路徑

2026-10-05。安裝 ID 仍是 `tui-preview-mod@andrew54068`。

## 新功能

- 全螢幕介面下，Claude 回覆裡的圖片或影片路徑畫成連結；單擊開啟預覽 pane，與 `/preview <path>` 走同一段程式。
- 只重畫提到媒體路徑的回覆，版面照原生的回覆列（項目符號、縮排、上方空行）；其餘回覆不經過 Mod 繪製。
- 新設定 `clickablePaths`（預設 true）可關閉這項重畫。

## 邊界

- Cmd+click 由終端處理，Mod 收不到；Ctrl／Alt+click 維持 Claude Code 原本的開啟方式。
- 點選前不讀檔。點選後一樣經過 `media.mjs` 的 root、檔案類型、大小檢查；Mod 端的 root 比對只決定要不要畫成連結。
- 已儲存的訊息、模型輸入與 Read 結果都不變；沒有新增模型請求或上傳。
- 每則回覆最多 256 個連結、10000 字元；超過時照原生繪製。程式碼區塊、網址、圖片語法與 `~/` 路徑不轉換。

## 文件

- README 新增「點選回覆中的路徑」與「自訂 API 與 herdr」：自訂 API 時 Mods 開關沿用磁碟快取、herdr 的終端名稱與超連結偵測，以及三個環境變數的代價。
- 相容性表新增 herdr 0.8.x、mosh、自訂 API 與點選的列。

## 驗證

38／38 core tests、26／26 native kit tests、2.1.289 原生 TypeScript 與 strict validation 通過。herdr 0.9.3 內的 live 測試：單擊路徑開啟 pane 並畫出圖片像素、Esc 關閉無 helper 殘留、沒有模型請求。細節見[驗證紀錄](verification.md)。

## 仍未驗證

mosh 的像素（需要另外的中繼，未實作）、連續影片的可見像素、Air 剪貼簿傳入遠端，以及其他平台。見[相容性](compatibility.md)。
