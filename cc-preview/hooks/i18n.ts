// Adapted from cc-image-view (https://github.com/GGGODLIN/cc-mod-image-view), MIT; see NOTICE.
export type Locale = 'en' | 'zh-TW'

export type Strings = {
  noPreview: string
  sentButton: (n: number) => string
  zoom: string
  open: string
  more: (n: number) => string
  paneTitle: string
  listTitle: string
  empty: string
  images: string
  markdown: string
  prev: string
  next: string
  all: string
  copy: string
  refresh: string
  blocks: string
  scroll: string
  zoomHint: string
  zoomPanHint: string
  graphics: string
  imageGone: string
  documentGone: string
  documentTooBig: string
  documentUnreadable: string
  truncated: string
  notPlaced: (reason: string) => string
  notFound: (path: string) => string
  terminalOnly: string
  inPrompt: string
  pasted: string
  toolResult: string
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    noPreview: 'no preview',
    sentButton: n => `img #${n}`,
    zoom: '⤢ Zoom',
    open: '⤢ Open',
    more: n => `+${n} more`,
    paneTitle: 'Preview',
    listTitle: 'Conversation artifacts',
    empty: 'No images or markdown files in this conversation yet.',
    images: 'Images',
    markdown: 'Markdown',
    prev: '‹ Prev',
    next: 'Next ›',
    all: '☰ All',
    copy: 'Copy path',
    refresh: '↻ Refresh',
    blocks: '▦ Blocks',
    scroll: '↑↓ scroll',
    zoomHint: 'i/o zoom',
    zoomPanHint: 'i/o zoom · h j k l move',
    graphics: '▣ Graphics',
    imageGone: "This image can't be shown: it is gone, or no converter could make a PNG of it.",
    documentGone: 'This file is gone.',
    documentTooBig: 'This file is over 4 MiB, too big to show here.',
    documentUnreadable: 'This file could not be read.',
    truncated: '… the rest of this file is not shown.',
    notPlaced: reason => `Preview pane is waiting for room: ${reason}`,
    notFound: path => `Nothing to preview at ${path}: no image or markdown file there.`,
    terminalOnly: 'The preview pane draws in the terminal.',
    inPrompt: 'in the prompt',
    pasted: 'pasted',
    toolResult: 'tool result',
  },
  'zh-TW': {
    noPreview: '無法預覽',
    // CJK, not an emoji: a CJK glyph is two cells on every terminal, so the card offsets add up
    sentButton: n => `圖 #${n}`,
    zoom: '⤢ 放大',
    open: '⤢ 開啟',
    more: n => `另外 ${n} 個`,
    paneTitle: '預覽',
    listTitle: '對話中的檔案',
    empty: '這段對話還沒有圖片或 Markdown 檔案。',
    images: '圖片',
    markdown: 'Markdown',
    prev: '‹ 上一個',
    next: '下一個 ›',
    all: '☰ 全部',
    copy: '複製路徑',
    refresh: '↻ 重新整理',
    blocks: '▦ 色塊',
    scroll: '↑↓ 捲動',
    zoomHint: 'i/o 縮放',
    zoomPanHint: 'i/o 縮放 · h j k l 移動',
    graphics: '▣ 圖形',
    imageGone: '無法顯示這張圖片：檔案已不在，或沒有轉檔工具能轉成 PNG。',
    documentGone: '檔案已不在。',
    documentTooBig: '檔案超過 4 MiB，太大無法在這裡顯示。',
    documentUnreadable: '無法讀取這個檔案。',
    truncated: '…其餘內容未顯示。',
    notPlaced: reason => `預覽窗格等待空間：${reason}`,
    notFound: path => `${path} 沒有可預覽的圖片或 Markdown 檔案。`,
    terminalOnly: '預覽窗格只在終端機中顯示。',
    inPrompt: '輸入框中',
    pasted: '貼上',
    toolResult: '工具結果',
  },
}

export const stringsFor = (locale: Locale): Strings => STRINGS[locale]

const CHINESE = /中文|漢語|汉语|華語|华语|國語|国语|chinese|mandarin|^zh(?:[-_.\s]|$)/i
const ENGLISH = /英文|英語|english|^en(?:[-_.\s]|$)/i

/**
 * The UI language: the mod's own setting when it names one, then Claude Code's free-text
 * `language` setting, then LC_ALL / LANG; English when none of them says. Any Chinese maps to
 * Traditional Chinese, the only Chinese the mod ships.
 */
export function pickLocale(input: { option: unknown; claudeLanguage: unknown; envLang: string | undefined }): Locale {
  if (input.option === 'en' || input.option === 'zh-TW') return input.option
  if (typeof input.claudeLanguage === 'string') {
    const language = input.claudeLanguage.trim()
    if (CHINESE.test(language)) return 'zh-TW'
    if (ENGLISH.test(language)) return 'en'
  }
  return /^zh/i.test(input.envLang ?? '') ? 'zh-TW' : 'en'
}
