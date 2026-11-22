// A page in another language: its words swapped by a dictionary (translateHtml), and its stories (translateStory).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateHtml, translateStory } from '../src/vite-plugin.ts';

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>My book</title>
  <meta name="description" content="A book of mine." />
</head>
<body>
  <a class="brand" href="#top">your<b>story</b></a>
  <nav aria-label="Sections"><a href="#forest">Forest</a></nav>
  <nav class="langs"><a data-pf-lang="bg" lang="bg">БГ</a></nav>
  <section class="stage" id="forest">
    <div class="card">
      <h2>Into the
        woods.</h2>
      <p>What happens <em>first</em>.</p>
      <img src="a.png" alt="A tall pine" />
      <a href="mailto:hello@example.com">hello@example.com</a>
      <p>Not translated yet.</p>
    </div>
  </section>
  <script>const words = "Forest";</script>
</body>
</html>`;

const BG = {
  'My book': 'Моята книжка',
  'A book of mine.': 'Моя книжка.',
  'your<b>story</b>': 'твоята<b>история</b>',
  Sections: 'Раздели',
  Forest: 'Гора',
  'Into the woods.': 'Навътре в гората.',
  'What happens <em>first</em>.': 'Какво става <em>най-напред</em>.',
  'A tall pine': 'Висок бор',
};

test('a page is translated where the dictionary has its words, and keeps its layout and markup', () => {
  const { html, missing } = translateHtml(PAGE, BG, 'bg');
  assert.match(html, /<html lang="bg">/);
  assert.match(html, /<title>Моята книжка<\/title>/);
  assert.match(html, /content="Моя книжка\."/);
  // a sentence with markup in it is one entry; text broken over lines matches with its spaces folded
  assert.match(html, /<a class="brand" href="#top">твоята<b>история<\/b><\/a>/);
  assert.match(html, /<h2>Навътре в гората\.<\/h2>/);
  assert.match(html, /<p>Какво става <em>най-напред<\/em>\.<\/p>/);
  assert.match(html, /aria-label="Раздели"/);
  assert.match(html, /alt="Висок бор"/);
  assert.match(html, /<a href="#forest">Гора<\/a>/);
  // what is not words to translate stays: scripts, addresses, words marked as in a language of their own
  assert.match(html, /const words = "Forest";/);
  assert.match(html, />hello@example\.com</);
  assert.match(html, /<a data-pf-lang="bg" lang="bg">БГ<\/a>/);
  // and the words still to translate are listed (only those in the body)
  assert.deepEqual(missing, ['Not translated yet.']);
});

test('a page with no lang gets one, and one without a dictionary entry is left as it was', () => {
  assert.match(translateHtml('<html><body><p>Hi</p></body></html>', {}, 'bg').html, /<html lang="bg">/);
  assert.equal(translateHtml(PAGE, {}).html, PAGE);
});

test('a story is translated field by field, and keeps what has no translation', () => {
  const s = translateStory({ title: 'Where it starts', text: 'Some  words\n here.', tags: ['Beginning', 'Other'], kicker: "Why it's here", links: [{ label: 'Read more', href: '#a' }] },
    { 'Where it starts': 'Откъде започва', 'Some words here.': 'Няколко думи.', Beginning: 'Начало', "Why it's here": 'Защо е тук' });
  assert.equal(s.title, 'Откъде започва');
  assert.equal(s.text, 'Няколко думи.');
  assert.deepEqual(s.tags, ['Начало', 'Other']);
  assert.equal(s.kicker, 'Защо е тук');
  assert.deepEqual(s.links, [{ label: 'Read more', href: '#a' }]);
});
