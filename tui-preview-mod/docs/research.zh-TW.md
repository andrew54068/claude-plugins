# 在 Claude Code 終端預覽圖片與影片：實作、SSH與權限

2026-10-03，Claude Code 2.1.288。成果是可載入的 `tui-preview-mod` 原生 Mod：Markdown 分頁、PNG 圖片、真實影片影格、控制按鈕與送出前貼圖列。已實測解碼與互動的一部分，也已讓 SSH 傳回不同 PNG 影格；**尚未取得 Ghostty／Kitty 可見像素或 Air clipboard 傳入遠端的證據**。這份報告分析實作，不將功能存在等同每個終端都已驗收。

## 為什麼採用Mod

要在Claude自己的pane、輸入框上方或Read結果列顯示內容，需要原生UI事件入口。Mods提供這類入口；MCP適合提供工具，skill提供指引，本專案沒有必要再架MCP／網頁server來完成終端預覽。[官方Mods概覽](https://code.claude.com/docs/en/plugins/mods/overview)

實作以`hooks/register.ts`註冊`/preview`與三個render sites：Pane、AbovePrompt、Read ToolResult。native`Markdown`、`Image`、`ui.blit`負責畫面；圖片bytes留在UI管線，不塞入prompt或自建model tool result。[入口](../hooks/register.ts#L264)

原生Image是terminal-only，Markdown單元件上限10,000字元；helper採9000字元分頁。型別契約則直接使用2.1.288 runtime生成檔，避免拿較舊公開copy推測現行API。[官方reference](https://code.claude.com/docs/en/plugins/mods/reference)

## 從檔案到影格

Mod module不使用Node API。它以argv啟動隨plugin附帶的Node stdlib helper，後者檢查root／regular file／inode並呼叫已安裝ffmpeg、ffprobe。runtime的`process.spawn`輸出是UTF-8 `{stream,text}`；PNG原始bytes因此先分割完整frame，再以base64包成NDJSON。共享parser處理跨chunk的record，拒絕截斷、錯誤型別、超大record與控制字元。[helper](../scripts/media.mjs)、[protocol](../hooks/protocol.ts)

影片不是輪播單張縮圖：ffmpeg連續解碼、8 fps、限制640×360，逐幀交給同一keyedImage／blit；blit被拒絕時保存新frame再redraw。Player只管理時間與世代，hoststream的return負責真正取消helper。暫停／跳轉／close讓舊世代失效，避免晚到影格覆寫新pane。[player](../hooks/player.ts)、[consumer](../hooks/register.ts#L89)

pane預覽來源前600秒，跳轉也限制在0–600；即使helper可從某offset再解碼600秒，Mod在抵達來源上限時離開consumer並於finally清理，畫面明說前10分鐘。v1無音訊、codec能力依已安裝ffmpeg，沒有承諾全格式播放器。[播放](../hooks/register.ts#L190)

## 送出前貼圖的內部適配

2.1.288實際`prompt.read`沒有attachmentbytes欄位；composer提供`[Image #N]`。所以本產品每500ms讀目前composer／session／cwd，只查同一session圖片ID的有限快取候選PNG／JPG／GIF／WebP。沒有掃home或歷史session，也不改寫composer。這是實測內部布局的adapter，不是穩定的公開attachmentAPI。原始 API 探針含本機識別資訊，未隨發布包上傳。[cache adapter](../scripts/media.mjs#L122)

最多2張composer縮圖；Readinline與composer共用2個automaticdecoder名額，其餘圖片透過明確button進pane。保留最多16個Read decoded entries，另有128個本次sessionattempt紀錄，使historicalrow重繪不反覆啟動ffmpeg。來源身份與epoch在await前後核對，附件刪除、session變更、關閉或reset後，晚到結果不會復活。[排程](../hooks/register.ts#L66)、[Read](../hooks/register.ts#L369)

## SSH傳的是bytes；剪貼簿是另一條路

解碼在檔案所在主機執行，PNG bytes隨既有terminal／SSHstream回觀看裝置，不要求client讀serverpath。Air→Pro→Air測試取得8張有效PNG，SHA-256也有8種，證明真正不同影格的位元流可返回。[驗證紀錄](verification.md)

但收到PNG不等於終端畫出像素，server的Ctrl-V也不等於clientclipboard已上傳。本次只有Pro本機paste-before-submit與PTY的Imagealt證據；Airclipboard、Ghostty像素仍未驗證。遠端需要執行Claude和此Mod，本產品沒有「只靠SSH、遠端不用Claude」的獨立viewer。

## 信任邊界與實際結果

一般Mods以使用者權限執行，可接觸秘密／程序／網路；Bash sandbox不涵蓋其subprocess。本產品只用本機helper、session／promptread和UI，沒有新增HTTP、模型呼叫、工具核准或promptrewrite，但ffmpeg仍是高權限native程式。需要審閱實際碼，不能把白名單當OSsandbox。[官方權限](https://code.claude.com/docs/en/plugins/mods/overview)、[SECURITY](../SECURITY.md)

防護包含 canonical root、nofollow／nonblock／inode 核對、影片繼承驗證 fd、格式與 protocol 白名單、MOV 外部 track 關閉、輸入／frame／時間上限與取消。ffmpeg 64 MiB 的 `max_alloc` 是單次 allocation 限制，不是整體 RSS 硬上限；同一 inode 仍可能被其他程序修改。原生附件和 Read 結果若正常提交，Claude 仍可能送往設定模型；Mod 沒有增加上傳，並不代表整個 session 離線。

Node/core27項測試與官方Mod19項測試通過。前者有真實decoder與cleanup；後者執行真實Mod／UItree，hostprocess／clock／session由stub回答。livePTY另證明Markdown、Imagealt、實際影片stream控制／取消與送出前貼圖列。把這三層分開，才不會以stub成功冒稱終端像素已驗收。[驗證紀錄](verification.md)、[官方testing](https://code.claude.com/docs/en/plugins/mods/test)

controller亦在修正版本實測播放中 `/clear` 的取消與重新預覽，並以只加入一行註解的隔離副本觸發真正 hot reload：舊 helper 結束、fixture 沒有殘留 open fd。重載出現一次舊環境 invalidate WARN，未留下 decoder。未變動程式的 `/reload-plugins` 只刷新 catalog，不能當作卸載證據。[生命週期驗證](verification.md)

後續最需要的證據是支援圖片協定的終端像素、client clipboard 傳送、live Read 與 resume。當前版本適合先以受控 fixture 在可信環境試用；可用操作與保留限制見 [README](../README.md) 與 [相容性](compatibility.md)。
