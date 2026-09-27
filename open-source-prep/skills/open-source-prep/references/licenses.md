# License selection & texts

A public repo with **no** license is under exclusive copyright by default — nobody may legally use,
copy, modify, or distribute it. Adding a `LICENSE` file at the repo root is what makes the project
actually open source. Pick one, write the file, done.

## Choosing (fast)

Ask what the user wants to protect, not which license they've heard of:

- **"I just want people to use it, minimal strings."** → **MIT**. Short, permissive; only requires
  keeping the copyright + license notice. Others may make closed-source versions. Used by React-era
  Babel, Rails, .NET.
- **"Like MIT, but I'm worried about patents / it's corporate code."** → **Apache-2.0**. Permissive
  like MIT but adds an **express patent grant** from contributors and a patent-retaliation clause.
  The right default for company-backed projects.
- **"Improvements must stay open source."** → **GPLv3** (copyleft). Anyone distributing a modified
  version must release their source under GPL too. Prevents closed-source forks. Used by Ansible,
  uBlock Origin.
- **"Copyleft, and it also runs as a network service / SaaS."** → **AGPLv3**. Like GPLv3 but closes
  the "SaaS loophole" — running a modified version over a network counts as distribution, so the
  operator must share source.

Permissive (MIT/Apache) maximizes adoption; copyleft (GPL/AGPL) maximizes staying-open. There is no
universally "correct" choice — surface the tradeoff and let the user decide. `choosealicense.com`
is the canonical selection aid to link them to.

> **Dependency constraint:** if the project *depends on* strong-copyleft code (GPL/AGPL), a
> permissive outbound license may not be legally available — see `right-to-release.md`.

## Writing the file

Create `LICENSE` (no extension) at the repo root. Fill in `<YEAR>` (current year) and
`<COPYRIGHT HOLDER>` (the user's name or org).

### MIT (full text — inline it directly)

```
MIT License

Copyright (c) <YEAR> <COPYRIGHT HOLDER>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache-2.0 / GPLv3 / AGPLv3 (too long to inline — fetch canonical text)

These run to hundreds of lines and must be reproduced verbatim, so don't hand-type them. Get the
exact text from a canonical source:

- **Best, if online:** the SPDX or choosealicense raw text, e.g.
  `https://www.apache.org/licenses/LICENSE-2.0.txt`,
  `https://www.gnu.org/licenses/gpl-3.0.txt`,
  `https://www.gnu.org/licenses/agpl-3.0.txt`.
  Fetch with WebFetch and write verbatim to `LICENSE`.
- **Offline / already on GitHub:** GitHub's "Add file → Choose a license template" picker inserts
  the correct full text and fills the year/name for you.
- Apache-2.0 also expects a short header block in source files and a `NOTICE` file if you attribute;
  mention this but it's optional for a first release.

Set the repo's license metadata too if the ecosystem has a field for it (e.g. a `license` key in the
package manifest) using the SPDX identifier: `MIT`, `Apache-2.0`, `GPL-3.0-or-later`,
`AGPL-3.0-or-later`.
