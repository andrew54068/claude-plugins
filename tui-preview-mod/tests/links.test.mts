import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_LINKS, fileHref, linkifyMediaPaths, pathFromHref } from '../hooks/links.js';

const ROOT = '/work';
const linked = (text: string, roots: string[] = []) => linkifyMediaPaths(text, ROOT, roots);

test('a bare relative image path becomes a file link under the session root', () => {
  const reply = linked('Saved to content/day1/01.png for you.');
  assert.equal(reply?.text, 'Saved to [content/day1/01.png](file:///work/content/day1/01.png) for you.');
  assert.deepEqual([...reply!.links], [['file:///work/content/day1/01.png', '/work/content/day1/01.png']]);
});

test('a backticked path keeps its code span inside the link', () => {
  assert.equal(linked('Loaded: `docs/images/banner.jpg`')?.text, 'Loaded: [`docs/images/banner.jpg`](file:///work/docs/images/banner.jpg)');
  assert.equal(linked('Open `cover.webp` next.')?.text, 'Open [`cover.webp`](file:///work/cover.webp) next.');
});

test('markdown link targets to media are rewritten; web links and image embeds stay', () => {
  const reply = linked('[the cover](slides/01.png), [site](https://x.dev/a.png), ![alt](b.png), [old](file:///work/c.gif)');
  assert.equal(reply?.text, '[the cover](file:///work/slides/01.png), [site](https://x.dev/a.png), ![alt](b.png), [old](file:///work/c.gif)');
  assert.deepEqual([...reply!.links.values()], ['/work/slides/01.png', '/work/c.gif']);
});

test('fenced code, URLs, bare filenames and non-media files stay as written', () => {
  assert.equal(linked('```sh\nopen out/a.png\n```\nsee https://cdn.example.com/a/b.png or <out/c.png>, banner.png, notes.md, src/main.ts'), undefined);
  assert.equal(linked('~~~\nshots/a.png\n~~~'), undefined);
});

test('trailing punctuation and CJK neighbours stay outside the link', () => {
  const reply = linked('存到content/x.png了。Also out/y.JPG. Then (img/z.webp), clip/w.mp4: done, a/b.gif，keep a/c.png.bak');
  assert.deepEqual([...reply!.links.values()], ['/work/content/x.png', '/work/out/y.JPG', '/work/img/z.webp', '/work/clip/w.mp4', '/work/a/b.gif']);
  assert.match(reply!.text, /^存到\[content\/x\.png\]\(file:\/\/\/work\/content\/x\.png\)了。/);
  assert.match(reply!.text, /keep a\/c\.png\.bak$/);
});

test('absolute paths need an allowed root and ../ escapes are refused', () => {
  assert.equal(linked('see /etc/a.png, /work/../etc/b.png, ../c.png and /workshop/d.png'), undefined);
  assert.deepEqual([...linked('see /data/shots/a.png', ['/data/shots'])!.links.values()], ['/data/shots/a.png']);
  assert.deepEqual([...linked('see /work/./x/../y.png')!.links.values()], ['/work/y.png']);
});

test('backticked CJK filenames and spaced absolute paths link; commands do not', () => {
  const reply = linked('`content/day1/圖片.png`, `/work/Screen Shot 1.png` and `ls docs/a.png`');
  assert.deepEqual([...reply!.links.values()], ['/work/content/day1/圖片.png', '/work/Screen Shot 1.png']);
  assert.match(reply!.text, /`ls docs\/a\.png`$/);
});

test('special characters round-trip through the href', () => {
  for (const path of ['/work/a b.png', '/work/#1?.png', '/work/(x)%20.png', '/work/圖片/封面.png']) {
    const href = fileHref(path);
    assert.ok(href.startsWith('file:///work/'), href);
    assert.doesNotMatch(href.slice(7), /[\s()#?]/);
    assert.equal(pathFromHref(href), path);
  }
  assert.equal(pathFromHref('https://x.dev/a.png'), undefined);
  assert.equal(pathFromHref('file://relative.png'), undefined);
  assert.equal(pathFromHref('file:///work/%E0%A4%A.png'), undefined);
  assert.equal(pathFromHref('file:///work/a%0A.png'), undefined);
});

test('one href per path, at most MAX_LINKS, and text over 10000 characters falls back', () => {
  const twice = linked('a/x.png then a/x.png');
  assert.equal(twice?.links.size, 1);
  assert.equal(twice?.text, '[a/x.png](file:///work/a/x.png) then [a/x.png](file:///work/a/x.png)');
  const many = linked(Array.from({ length: MAX_LINKS + 5 }, (_, i) => `i/${i}.png`).join(' '));
  assert.equal(many?.links.size, MAX_LINKS);
  assert.match(many!.text, / i\/260\.png$/);
  assert.equal(linked(`${'x'.repeat(9_990)} img/a.png`), undefined);
});

test('long unbroken tokens are scanned in linear time', () => {
  for (const text of ['a.'.repeat(4_900), 'a'.repeat(9_900), `${'ab/'.repeat(3_200)}x.png`]) {
    const start = performance.now();
    linked(text);
    assert.ok(performance.now() - start < 100, `${text.slice(0, 6)}… took ${(performance.now() - start).toFixed(0)}ms`);
  }
});

test('a reference definition keeps its shape and points the reference at the file', () => {
  const reply = linked('See [the shot][1] and [web][2].\n\n[1]: docs/a.png "Cover"\n[2]: https://x.dev/b.png');
  assert.equal(reply?.text, 'See [the shot][1] and [web][2].\n\n[1]: file:///work/docs/a.png "Cover"\n[2]: https://x.dev/b.png');
  assert.deepEqual([...reply!.links.values()], ['/work/docs/a.png']);
  assert.equal(linked('[1]: notes/readme.md'), undefined);
});
