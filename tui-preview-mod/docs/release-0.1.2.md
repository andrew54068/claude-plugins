# 0.1.2 公開發布

2026-10-04。程式碼直接加入既有公開 repository `andrew54068/claude-plugins` 的 `tui-preview-mod/`，使用既有市集 `andrew54068`；安裝 ID 是 `tui-preview-mod@andrew54068`。

## 範圍

- 複用已審查的乾淨產品檔案，五個執行檔及三個既有測試檔不變。
- 版本改為 `0.1.2`，更新公開來源 metadata、市集子目錄與安裝／遷移／開發說明。
- 不建立新市集、不依賴私人 repo、不改其他六個市集項目。
- 原始開發歷史、API 探針、debug log、使用者圖片、generated types、node_modules 都不發布。
- 舊私人 repository 與使用者本機設定保留；遷移指令由使用者自行選擇執行。

## 既有市集基線

新增前已執行原市集驗證，通過但有3項 warnings：缺少 marketplace description；browser-mcp-selector 與 security-scan 的市集版本是0.1.0，而 plugin manifest是1.0.0。這些是既有問題，沒有為此次發布改動；新外掛應獨立通過 strict validation，且不可增加市集 warnings。

## 驗證方式

在 `tui-preview-mod/` 執行 core TypeScript／27項 Node tests、官方 Mod kit／19項 tests、原生 Mod TypeScript，以及 plugin strict validation。原生宣告必須由相同 Claude Code2.1.288 runtime產生；不隨套件發布。

本次結果：27／27 core tests、19／19 native kit tests 通過，core／原生 TypeScript 通過，plugin strict validation 通過。原生型別重用同一2.1.288 runtime已產生的宣告。原市集驗證仍只有原先3項 warnings，沒有新增警告；其他六項 entry 已逐值比對未變動。公開套件共24個追蹤文字檔，八個執行／測試檔與0.1.1逐 byte 相同，沒有私人／生成檔案或失效的文件連結。

市集安裝另以獨立 `CLAUDE_CONFIG_DIR` 從 GitHub clone `andrew54068/claude-plugins`，安裝 `tui-preview-mod@andrew54068`，比對實際版本、Git revision、cache檔案與五個執行檔。不可用本機目錄安裝取代這項證據，也不覆寫使用者現有來源。

## 仍未驗證

安裝成功不保證遠端 Mod 開關允許載入 `/preview`。Ghostty／Kitty 的可見圖片像素、Air clipboard 傳入遠端、live Read／resume 及其他平台仍是既有缺口，見[相容性](compatibility.md)與[驗證紀錄](verification.md)。沒有因移動市集就擴大功能主張。
