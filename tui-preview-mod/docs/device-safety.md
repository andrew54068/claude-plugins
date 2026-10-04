# 裝置安全檢查

日期：2026-10-04。範圍是發布快照的執行程式、測試、manifest、開發設定與說明文件；原始開發工作樹的私人證據和 Git 歷史不在此 repository。

## 判定

**RUN WITH CAUTION**。沒有發現惡意程式、憑證外傳、隱藏執行內容或安裝時執行腳本。最重要的限制是：Node 與原生媒體解碼器使用使用者權限，並非作業系統沙箱。

## 執行後會做什麼

- 網路：Mod 沒有 HTTP、socket、telemetry 或模型呼叫；GitHub 安裝／更新會透過 git 連線 GitHub。Claude 自身的一般網路行為不包含在此判定。
- 檔案：讀取目前 session root、明確設定的額外 roots，以及當前 session 的有限貼圖快取候選檔名；不掃描 home、SSH key 或歷史 session。
- 安裝時執行：root package 沒有 preinstall／postinstall／prepare；外掛執行不需要安裝 Yarn 套件。
- 持久化：Mod 不修改 shell 設定、launch service 或 cron；正常 plugin 安裝由 Claude 寫入自己的設定與 cache。
- 混淆：base64／hex 是圖片傳輸與格式 signature，沒有轉成可執行內容。
- 提示注入：掃描範圍內未找到要求 AI 隱藏問題、跳過檢查或改判定的指示。

## 注意事項

1. **原生解碼與本機工具信任** — `scripts/media.mjs:176`、`hooks/register.ts:94`：Node、ffmpeg、ffprobe 以使用者權限執行並繼承環境。未找到環境變數外傳，但惡意工具或 codec 漏洞仍可能接觸環境中的秘密。使用可信、已更新的工具；只預覽可信媒體。自動預覽可在 plugin 設定將 `autoPreview` 設為 false。
2. **內部貼圖快取** — `scripts/media.mjs:124-141`：只查當前 cwd／session／image ID，拒絕 session 子目錄與 leaf symlink；但未檢查快取 ownership／mode，且 `CLAUDE_CODE_TMPDIR` 的 base 會 canonicalize。使用可信、非共用可寫的暫存目錄，不把本機快取當成不可竄改的資料庫。

## 選擇執行時的檢查

- 確認執行主機上的 Node、ffmpeg、ffprobe 來源可信；不需要額外下載 runtime 套件。
- `roots` 只加入真正要預覽的目錄；加入 home 或 `/` 會擴大可讀範圍，不會新增 OS 權限隔離。
- 初次試用使用無敏感內容的 fixture；正常提交附件或 Read 結果，仍可能由 Claude 傳送給設定的模型。
- 開發依賴已有精確版本與 lockfile；若需安裝，使用 CONTRIBUTING 中的 frozen-lockfile／ignore-scripts 流程。下載後的 dependency payload 未包含在本次靜態審查。

## 覆蓋與限制

六項唯讀掃描涵蓋23個原始產品文字檔：網路外傳、憑證、程序執行、檔案／環境、供應鏈、混淆與提示注入。供應鏈 pass 包含 yarn.lock。排除 node_modules、generated types、binary assets、私人開發紀錄與舊 Git 歷史。已鎖定三個開發依賴，未找到已知惡意 package／IOC；沒有 GitHub Actions、隱藏 executable 或 Python .pth。

威脅情報快取於2026-10-04以固定搜尋與官方公告重新檢視，本次有界查詢沒有確認新增事件；不代表涵蓋所有攻擊。參考[CSA 供應鏈公告](https://www.csa.gov.sg/alerts-and-advisories/advisories/ad-2026-009/)及[GitHub 安全公告](https://github.blog/security/supply-chain-security/disrupting-supply-chain-attacks-on-npm-and-github-actions/)。

這是 pattern-based 靜態檢查與人工判讀，不是完整漏洞鑑定。Claude、已安裝的 Node／ffmpeg／ffprobe 及下載後的開發依賴未被完整審查；也不能以此證明終端已畫出圖片像素。

## ⚠️ RUN WITH CAUTION

**沒有發現惡意執行或外傳，但原生解碼器和本機快取仍需信任。**

🚨 0 blockers · ⚠️ 2 cautions · 🔧 0 maintainer issues · 🕒 intel cache fresh

👉 **下一步：使用可信工具與無敏感媒體，從 GitHub marketplace 安裝試用。**
