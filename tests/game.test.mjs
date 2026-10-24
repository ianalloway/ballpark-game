import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual inline game without an MQTT connection or browser install.
async function game() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/\nrender\(\);\s*$/, '');
  const nodes = new Map();
  const document = { activeElement: null, querySelector: selector => nodes.get(selector) ?? null };
  const node = (id, attributes = '') => ({
    id, value: '', textContent: '', disabled: false,
    dataset: { round: attributes.match(/data-round="([^"]*)"/)?.[1] },
    selectionStart: 0, selectionEnd: 0,
    classList: { toggle() {} },
    focus() { document.activeElement = this; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  });
  const app = node('app');
  Object.defineProperty(app, 'innerHTML', {
    set(markup) {
      nodes.clear();
      nodes.set('#app', app);
      for (const match of markup.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        nodes.set('#' + match[1], node(match[1], match[0]));
      }
    },
  });
  nodes.set('#app', app);
  const storage = { getItem() { return null; }, setItem() {} };
  const context = vm.createContext({
    document, crypto: webcrypto, TextEncoder, URLSearchParams, btoa, atob,
    sessionStorage: storage, localStorage: storage,
    location: { hash: '', search: '?local', origin: 'http://localhost', pathname: '/' },
    history: { replaceState() {} }, addEventListener() {},
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  });
  vm.runInContext(source + '\n;globalThis.api={Host,identity,onState,getId:()=>ME,setRoom:code=>view.joinCode=code};', context);
  await context.api.identity;
  return { ...context.api, nodes, document };
}

test('another player submitting preserves an unfinished guess and its caret', async () => {
  const g = await game();
  g.setRoom('ABCD');
  const player = { id: g.getId(), name: 'Ian', score: 0, online: true, guessed: false, last: 0 };
  const other = { ...player, id: 'b'.repeat(32), name: 'Guest' };
  const state = { code: 'ABCD', host: other.id, phase: 'question', players: [player, other],
    round: 1, total: 8, q: 'How many?', msLeft: 30000, reveal: null, v: 1 };
  g.onState(state);
  const input = g.nodes.get('#guess');
  input.value = '12,345';
  input.focus();
  input.setSelectionRange(2, 4);
  g.onState({ ...state, v: 2, players: [player, { ...other, guessed: true }] });
  const replacement = g.nodes.get('#guess');
  assert.equal(replacement.value, '12,345');
  assert.equal(g.document.activeElement, replacement);
  assert.equal(replacement.selectionStart, 2);
  assert.equal(replacement.selectionEnd, 4);

  g.onState({ ...state, round: 2, v: 3 });
  assert.equal(g.nodes.get('#guess').value, '', 'a new round must start with an empty guess');
});

test('the host rejects guesses after the deadline even if its timer was delayed', async () => {
  const { Host, getId } = await game();
  Host.s = { phase: 'question', players: [{ id: getId(), guessed: false }] };
  Host.deadline = Date.now() - 1;
  Host.guesses = {};
  let revealed = false;
  Host.doReveal = () => { revealed = true; };
  Host.guess(getId(), 42);
  assert.equal(revealed, true);
  assert.equal(Object.keys(Host.guesses).length, 0);
});

test('an on-time guess is accepted once', async () => {
  const { Host, getId } = await game();
  Host.s = { phase: 'question', players: [{ id: getId(), guessed: false }] };
  Host.deadline = Date.now() + 30000;
  Host.guesses = {};
  Host.push = () => {};
  Host.maybeReveal = () => {};
  Host.guess(getId(), 42);
  Host.guess(getId(), 99);
  assert.equal(Host.guesses[getId()], 42);
  assert.equal(Host.s.players[0].guessed, true);
});
