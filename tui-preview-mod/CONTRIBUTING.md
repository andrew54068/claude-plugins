# 開發與驗證

先讀 [SECURITY](SECURITY.md) 與 [verification](docs/verification.md)。介面以實際 Claude Code 2.1.288 產生的型別為準；不要把較舊公開型別、render tree 或 Image alt 當成畫面驗證。[官方型別優先順序](https://code.claude.com/docs/en/plugins/mods/reference)

## 工具與套件

確認 Node、Yarn Classic、Claude、ffmpeg／ffprobe 已存在；不要因測試自動安裝系統工具。Node runtime 使用 stdlib，Yarn 套件僅供開發：typescript、tsx、@types/node。

```sh
node --version
yarn --version
claude --version
ffmpeg -version
ffprobe -version
yarn install --frozen-lockfile --ignore-scripts --non-interactive
```

`--ignore-scripts` 不執行套件 install scripts；tsx／TypeScript 所需的已鎖定平台 binary 仍需可用，請實際跑下一項檢查，而非以安裝成功取代驗證。

## 分開的驗證層

clone `andrew54068/claude-plugins` 後，先進入 `tui-preview-mod/`，在此外掛目錄執行：

```sh
yarn run check
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate ../.claude-plugin/marketplace.json
claude plugin test .
```

`yarn run check` 執行 core typecheck 與 Node tests（`tests/*.test.mjs`、`tests/player.test.mts`），**不包含 `hooks/register.ts` 的原生 Mod typecheck**。Yarn Classic 的裸 `yarn check` 是另一個內建命令，請保留 `run`。

兩個 manifest 都需明確驗證：repository 根目錄驗證只選 marketplace，不會列出原生 Mod footprint。不能以它取代 `plugin.json` 的 strict 檢查。原市集既有的 description／其他外掛版本 warnings 保留；新外掛不可新增 warnings。

`claude plugin test .` 收集 `.test.ts/.test.tsx`，本專案用 `tests/register.test.ts` 測試真正 Mod、UI tree、controls、race 與 cleanup；process／clock／session answers 由官方 kit stub，因此不證明實際像素。[官方 test runner](https://code.claude.com/docs/en/plugins/mods/test)

原生型別需先由該版本的 Claude runtime 產生。在可信且允許 Mods 的環境，先載入：

```sh
claude --plugin-dir /absolute/path/to/claude-plugins/tui-preview-mod
```

等到 `.claude-plugin/types/tsconfig.json` 出現，退出這個 session，再執行：

```sh
./node_modules/.bin/tsc -p tsconfig.mod.json --noEmit
git diff --check
```

生成型別已列入 ignore，不能提交；缺少生成檔時 Mod typecheck 並不成立。rollout 或管理政策拒絕時記錄為未執行／阻擋，不把它視為 test pass，也不要設 gate override。型別、validator、官方 runner、Node tests 都通過後，仍需在真實終端檢查像素與互動。

## 修改準則

- 功能與 bug fix 先寫會失敗的可觀察行為回歸，再做最小修正；測試應驗證輸出、子程序、取消或 UI 行為，避免 grep source-text。
- 重用 `scripts/media.mjs`、`hooks/protocol.ts`、`hooks/player.ts`；不要在 UI 層重寫路徑、PNG 邊界或 cache 適配。
- 無敏感 fixture；Node tests 在暫存目錄生成影片，結束後清除。不要提交實際 prompt、clipboard、session cache、debug log、使用者主機名稱或 SSH 資料。
- 保留工作樹的其他修改。commit 僅包含本次範圍；不用測試重跑取代讀完整輸出。
- 更新功能與相容性主張時，同步標明「真實執行」、「官方 kit／stub」與「未驗證」。新增完整版本支援或 clipboard 傳送需新的 live 證據。

## 人工 smoke

使用自己建立的 Markdown、圖片與短片，執行 `/preview`；檢查分頁、連續時間、暫停／跳轉／重播／關閉與程序清理。原生 Ctrl-V 後先檢查預覽列，測試前後妥善保存／恢復剪貼簿，不必為測試送出模型提示。

SSH smoke 要分開檢查 server 解碼、client bytes、client 真正像素、client clipboard 進入遠端 composer。若只有替代文字，記錄 fallback；不要宣稱影片像素已播放。clear／resume／播放中 reload／unload 也需另記 live 結果。
