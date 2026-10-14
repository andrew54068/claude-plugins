// A terminal has no math typesetting, so TeX is shown the way it reads: commands as their
// symbols, scripts raised or lowered where Unicode has the glyphs, fractions and roots inline.
// What isn't known is left as written.

// A wide space (\quad, an alignment `&`), kept two cells where other spaces fold to one
const QUAD = '\u2003'

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙', setminus: '∖', wedge: '∧', land: '∧', vee: '∨',
  lor: '∨', neg: '¬', lnot: '¬', cap: '∩', cup: '∪', sqcap: '⊓', sqcup: '⊔', uplus: '⊎',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', cong: '≅',
  sim: '∼', simeq: '≃', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', preceq: '⪯', succeq: '⪰',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  mid: '∣', parallel: '∥', perp: '⊥', models: '⊨', vdash: '⊢', dashv: '⊣', top: '⊤', bot: '⊥',
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦',
  longrightarrow: '⟶', longleftarrow: '⟵', uparrow: '↑', downarrow: '↓', nearrow: '↗', searrow: '↘',
  hookrightarrow: '↪', rightleftharpoons: '⇌',
  forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅', varnothing: '∅', infty: '∞', partial: '∂',
  nabla: '∇', angle: '∠', triangle: '△', square: '□', therefore: '∴', because: '∵', prime: '′',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘', degree: '°', dagger: '†', ddagger: '‡',
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃',
  bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', bigvee: '⋁', bigwedge: '⋀',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', lvert: '|', rvert: '|',
  vert: '|', Vert: '‖', lVert: '‖', rVert: '‖', backslash: '\\',
  quad: QUAD, qquad: QUAD + QUAD, ',': ' ', ':': ' ', ';': ' ', '>': ' ', '!': '', ' ': ' ',
  '{': '{', '}': '}', '%': '%', $: '$', '#': '#', '&': '&', _: '_', '|': '‖',
  lim: 'lim', sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', arcsin: 'arcsin',
  arccos: 'arccos', arctan: 'arctan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', log: 'log', ln: 'ln',
  lg: 'lg', exp: 'exp', max: 'max', min: 'min', sup: 'sup', inf: 'inf', det: 'det', dim: 'dim',
  ker: 'ker', deg: 'deg', gcd: 'gcd', arg: 'arg', Pr: 'Pr', mod: 'mod', bmod: 'mod',
}

// Commands that only change the look of their argument, or size a delimiter: the argument stays
const STYLES = new Set([
  'text', 'textrm', 'textbf', 'textit', 'texttt', 'textsf', 'mathrm', 'mathbf', 'mathit', 'mathsf',
  'mathtt', 'mathcal', 'mathscr', 'mathfrak', 'boldsymbol', 'bm', 'operatorname', 'mbox', 'hbox',
  'emph', 'displaystyle', 'textstyle', 'scriptstyle', 'overline', 'underline', 'vec', 'hat', 'bar',
  'tilde', 'dot', 'ddot', 'widehat', 'widetilde', 'overrightarrow', 'boxed',
])
const DROPPED = new Set([
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr',
  'Biggl', 'Biggr', 'middle', 'limits', 'nolimits', 'displaystyle', 'textstyle', 'nonumber', 'notag',
])
const DOUBLE_STRUCK: Record<string, string> = { N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', P: 'ℙ', H: 'ℍ' }

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ',
  f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ',
  s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ', '′': '′', '*': '*',
}
const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ',
  k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
}

/** `text` in `table`'s forms, spaces kept; null when a glyph has none. */
function mapped(text: string, table: Record<string, string>): string | null {
  const chars = [...text]
  return chars.every(char => char === ' ' || table[char] !== undefined) ? chars.map(char => (char === ' ' ? ' ' : table[char])).join('') : null
}

/** `text` in Unicode superscript (`<sup>2</sup>`), or null when a glyph has none. */
export const raised = (text: string) => mapped(text, SUPERSCRIPT)

/** `text` in Unicode subscript (`<sub>2</sub>`), or null when a glyph has none. */
export const lowered = (text: string) => mapped(text, SUBSCRIPT)

/** `text` raised (or lowered) in Unicode when every glyph has a form, else marked as a script. */
function script(text: string, table: Record<string, string>, mark: '^' | '_'): string {
  const chars = [...text.replace(/\s+/g, '')]
  if (chars.length === 0) return ''
  if (chars.every(char => table[char] !== undefined)) return chars.map(char => table[char]).join('')
  return chars.length === 1 ? `${mark}${text}` : `${mark}(${text})`
}

/** `text` with brackets around it when an operator or a space stands outside its own brackets. */
function grouped(text: string): string {
  const trimmed = text.trim()
  let outside = trimmed
  for (let inner = ''; inner !== outside; ) {
    inner = outside
    outside = outside.replace(/\([^()]*\)|\[[^[\]]*\]/g, '')
  }
  return /[\s+\-−=<>×·÷/±∓≤≥≠≈,]/.test(outside) ? `(${trimmed})` : trimmed
}

class Reader {
  at = 0
  constructor(readonly src: string) {}

  /** One argument: a `{group}`, a command, or a character; '' at the end. */
  argument(): string {
    this.skipSpaces()
    const char = this.src[this.at]
    if (char === undefined || char === '}') return ''
    if (char === '{') {
      this.at++
      const body = this.until('}')
      this.at++
      return body
    }
    if (char === '\\') return this.command()
    this.at++
    return char
  }

  /** An optional `[...]` argument. */
  optional(): string | null {
    this.skipSpaces()
    if (this.src[this.at] !== '[') return null
    const end = this.src.indexOf(']', this.at)
    if (end < 0) return null
    const body = convert(this.src.slice(this.at + 1, end))
    this.at = end + 1
    return body
  }

  skipSpaces() {
    while (this.src[this.at] === ' ') this.at++
  }

  command(): string {
    this.at++
    const name = /^[A-Za-z]+/.exec(this.src.slice(this.at))?.[0] ?? this.src[this.at] ?? ''
    this.at += name.length
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
      const top = this.argument()
      const bottom = this.argument()
      return `${grouped(top)}/${grouped(bottom)}`
    }
    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
      const n = this.argument()
      const k = this.argument()
      return `C(${n.trim()}, ${k.trim()})`
    }
    if (name === 'sqrt') {
      const degree = this.optional()
      const body = this.argument()
      return `${degree === null ? '' : script(degree, SUPERSCRIPT, '^')}√${grouped(body)}`
    }
    if (name === 'mathbb' || name === 'Bbb') {
      const body = this.argument()
      return [...body].map(char => DOUBLE_STRUCK[char] ?? char).join('')
    }
    if (name === 'begin' || name === 'end') {
      this.argument()
      // An array's column spec
      if (name === 'begin' && this.src[this.at] === '{') this.argument()
      return ''
    }
    if (name === 'not') return `${this.argument()}̸`
    if (STYLES.has(name)) return this.argument()
    if (DROPPED.has(name)) return ''
    if (name === '\\') return '\n'
    return SYMBOLS[name] ?? `\\${name}`
  }

  /** Everything up to `stop` (or the end) at this depth, converted. */
  until(stop: string | null): string {
    let out = ''
    while (this.at < this.src.length) {
      const char = this.src[this.at] ?? ''
      if (char === stop) break
      if (char === '{') {
        this.at++
        out += this.until('}')
        this.at++
      } else if (char === '}') {
        this.at++
      } else if (char === '\\') {
        out += this.command()
      } else if (char === '^' || char === '_') {
        this.at++
        const body = this.argument()
        out += script(body, char === '^' ? SUPERSCRIPT : SUBSCRIPT, char)
      } else if (char === '&') {
        this.at++
        out += QUAD
      } else if (char === '~') {
        this.at++
        out += ' '
      } else if (char === "'") {
        this.at++
        out += '′'
      } else {
        this.at++
        out += char
      }
    }
    return out
  }
}

function convert(tex: string): string {
  return new Reader(tex).until(null)
}

/** TeX as plain Unicode text, a line per `\\`; spaces folded as TeX folds them. */
export function texToText(tex: string): string {
  // A comment runs to the end of its line; `\%` is a percent sign
  return convert(tex.replace(/(?<!\\)%[^\n]*/g, '').replace(/\s+/g, ' '))
    .split('\n')
    .map(line => line.replace(/ *(\u2003+) */g, '$1').replace(/ +/g, ' ').replace(/\u2003/g, '  ').trim())
    .filter(line => line !== '')
    .join('\n')
}
