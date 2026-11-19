// Auto mode trusts the terminal environment. It never scans processes or probes terminal input.

/** What Claude Code was told about terminal graphics support. */
export type TerminalEnv = { force: string | undefined; termProgram: string | undefined; term: string | undefined }

const KITTY = /ghostty|kitty|wezterm/i

/** Whether Claude Code is configured to send kitty graphics; mosh needs explicit blocks mode. */
export function drawsGraphics(env: TerminalEnv): boolean {
  const forced = env.force !== undefined && env.force !== '' && env.force !== '0' && env.force.toLowerCase() !== 'false'
  return forced || KITTY.test(env.termProgram ?? '') || KITTY.test(env.term ?? '')
}
