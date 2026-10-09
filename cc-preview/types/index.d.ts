/** Where an artifact's content comes from: a file on this machine, or bytes the conversation holds. */
export type ArtifactSource = { type: 'file'; path: string } | { type: 'blob'; id: string }

/** One image or markdown file the preview pane can show. */
export type Artifact = {
  /** `file:<real path>`, `blob:<digest>` or `draft:<path>`; unique in the list. */
  id: string
  kind: 'image' | 'markdown'
  /** The file's name, or `Image #n` for a paste. */
  label: string
  /** Where it is from: its folder, or `pasted · <the prompt's words>`. */
  detail: string
  source: ArtifactSource
}

/** How pictures are drawn: kitty graphics (kitty, Ghostty, WezTerm), or block characters, which every terminal and mosh carry. */
export type PictureMode = 'graphics' | 'blocks'

/** Where the docked pane's block picture is zoomed and moved to, for the artifact `id`. */
export type ZoomView = { id: string; level: number; x: number; y: number }

/** An image the prompt being typed refers to (`[Image #n]`) and its cached paste; null when none is found. */
export type DraftImage = { n: number; path: string | null }

declare module 'claude-code' {
  interface PluginState {
    'cc-preview': {
      /** What the conversation shows as of the last scan: images, then markdown, each newest first. */
      artifacts: Artifact[]
      /** What the pane shows; null shows the list. */
      selected: Artifact | null
      /** The draft's pasted images, for the band above the prompt. */
      draft: DraftImage[]
      /** How pictures are drawn now: the `pictures` option, or what the path to the screen was found to carry. */
      mode: PictureMode
      /** The path to the screen in a word: `mosh`, `ssh`, or the local terminal app. */
      link: string
      /** The docked pane's zoom: the level, and the window's top left in cells. */
      zoom: ZoomView
    }
  }
}
