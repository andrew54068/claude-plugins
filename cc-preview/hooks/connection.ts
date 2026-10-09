// Pictures are drawn with the kitty graphics protocol only where it is known to reach the
// screen; anywhere else in characters, which every terminal draws. The terminal can't be asked
// (its answer would land in Claude Code's own input), so the path to it is read instead.

/** How the person reaches this session, and the terminal app at the end when it runs here. */
export type Path = { via: 'mosh' | 'ssh' | 'local'; terminal: string | null }

/** What Claude Code was told about the terminal, which decides whether it sends graphics at all. */
export type TerminalEnv = { force: string | undefined; termProgram: string | undefined; term: string | undefined }

export type Process = { pid: number; ppid: number; tty: string; name: string }

// Servers that outlive the connection that started them: the person may since have attached
// from somewhere else
const MULTIPLEXERS = new Set(['herdr', 'tmux', 'zellij', 'screen'])

// Terminals that draw kitty graphics, by app, TERM_PROGRAM or TERM
const KITTY = /ghostty|kitty|wezterm/i

const hasTerminal = (process: Process) => process.tty !== '??' && process.tty !== '?' && process.tty !== ''

/** `ps -axo pid=,ppid=,tty=,comm=` as rows, each named by its command's file name up to a space or colon (`tmux: server` is tmux). */
export function parseProcesses(stdout: string): Process[] {
  const rows: Process[] = []
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line)
    if (match === null) continue
    const command = (match[4] ?? '').replace(/^.*\//, '')
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), tty: match[3] ?? '', name: command.split(/[\s:]/)[0] ?? command })
  }
  return rows
}

/** The terminals of every multiplexer client: the ones whose last input decides which client is the person's. */
export const clientTerminals = (processes: readonly Process[]) => [
  ...new Set(processes.filter(process => MULTIPLEXERS.has(process.name) && hasTerminal(process)).map(process => process.tty)),
]

/** `stat` lines of `<seconds> /dev/<tty>` as last input by terminal. */
export function parseInputTimes(stdout: string): Map<string, number> {
  const times = new Map<string, number>()
  for (const match of stdout.matchAll(/^(\d+)\s+\/dev\/(\S+)\s*$/gm)) times.set(match[2] ?? '', Number(match[1]))
  return times
}

/**
 * The path from `start` to the person: the first mosh-server or sshd above it, else the app at
 * the top (the local terminal). At a multiplexer's server the walk goes on from the client whose
 * terminal had input last, the one the person types in now, rather than whichever started it.
 */
export function pathOf(processes: readonly Process[], start: number, lastInput: ReadonlyMap<string, number>): Path {
  const byPid = new Map(processes.map(process => [process.pid, process]))
  const walked = new Set<number>()
  let at = byPid.get(start)
  let top: Process | undefined
  while (at !== undefined && at.pid > 1 && !walked.has(at.pid)) {
    walked.add(at.pid)
    top = at
    if (at.name === 'mosh-server') return { via: 'mosh', terminal: null }
    if (at.name.startsWith('sshd')) return { via: 'ssh', terminal: null }
    if (MULTIPLEXERS.has(at.name) && !hasTerminal(at)) {
      const name = at.name
      let newest: Process | undefined
      for (const client of processes) {
        if (client.name !== name || !hasTerminal(client) || walked.has(client.pid)) continue
        if (newest === undefined || (lastInput.get(client.tty) ?? 0) > (lastInput.get(newest.tty) ?? 0)) newest = client
      }
      if (newest !== undefined) {
        at = newest
        continue
      }
    }
    at = byPid.get(at.ppid)
  }
  return { via: 'local', terminal: top?.name ?? null }
}

/**
 * Whether kitty graphics reach the screen: Claude Code sends them (forced, or told its terminal
 * draws them), no mosh stands between, and a local terminal is one that draws them. Across ssh
 * the far terminal can't be named from here, so what Claude Code was told stands.
 */
export function drawsGraphics(path: Path, env: TerminalEnv): boolean {
  const isForced = env.force !== undefined && env.force !== '' && env.force !== '0' && env.force.toLowerCase() !== 'false'
  const isSent = isForced || KITTY.test(env.termProgram ?? '') || KITTY.test(env.term ?? '')
  if (!isSent || path.via === 'mosh') return false
  if (path.via === 'local' && path.terminal !== null) return KITTY.test(path.terminal)
  return true
}

/** The path in a word, for the pane's mode button: `mosh`, `ssh`, or the local terminal. */
export const pathLabel = (path: Path) => (path.via === 'local' ? (path.terminal ?? 'local') : path.via)
