import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { before, after } from 'node:test';

// Exercise the actual registered production callback with a fake transport.
// No login, token, network request or live Discord interaction is permitted.
const entry = new URL('../src/index.mjs', import.meta.url).href;
const key = '__heavenDiscordCommandFixture';
const fixture = { client: null, handlers: new Map(), tokenReads: 0, loginCalls: 0 };
const stub = source => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = new Map([
  ['discord.js', stub(`
    const fixture = globalThis.${key};
    export const Events = { ClientReady: 'ready', InteractionCreate: 'interactionCreate', Error: 'error' };
    export const GatewayIntentBits = { Guilds: 1 };
    export const MessageFlags = { Ephemeral: 64 };
    export class Client {
      constructor() { fixture.client = this; this.ws = { ping: 42 }; }
      on(event, fn) { fixture.handlers.set(event, fn); }
      once(event, fn) { fixture.handlers.set(event, fn); }
      async login() { fixture.loginCalls++; throw Error('unexpected login'); }
      destroy() {}
    }
  `)],
  ['./config.mjs', stub(`export function getBotToken() { globalThis.${key}.tokenReads++; throw Error('unexpected token read'); }`)],
  ['./release-inheritance.mjs', stub('export async function inspectReleaseInheritance() { return { ready: false }; }')],
]);
const previousExitCode = process.exitCode;
const signalListeners = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, process.listeners(signal)]));
let handler;

before(async () => {
  globalThis[key] = fixture;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === entry && hooks.has(specifier)) {
        return { url: hooks.get(specifier), shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  const originalError = console.error;
  const startup = [];
  try {
    console.error = (...args) => startup.push(args);
    await import(entry);
    await new Promise(resolve => setImmediate(resolve));
    handler = fixture.handlers.get('interactionCreate');
    assert.equal(typeof handler, 'function');
    assert.equal(fixture.tokenReads, 0);
    assert.equal(fixture.loginCalls, 0);
    assert.ok(startup.some(args => args[0] === 'TOOLBOX_INHERITANCE_NOT_VERIFIED'));
  } finally {
    hook.deregister();
    console.error = originalError;
    process.exitCode = previousExitCode;
  }
});

after(() => {
  delete globalThis[key];
  for (const [signal, original] of signalListeners) {
    for (const listener of process.listeners(signal)) {
      if (!original.includes(listener)) process.removeListener(signal, listener);
    }
  }
  process.exitCode = previousExitCode;
});

function interaction({ name = 'ping', chatInput = true, replied = false, deferred = false, error } = {}) {
  const calls = [];
  const value = {
    commandName: name,
    isChatInputCommand: () => chatInput,
    replied, deferred,
    async reply(payload) {
      calls.push({ method: 'reply', payload });
      if (error) throw error;
      this.replied = true;
    },
    async followUp(payload) { calls.push({ method: 'followUp', payload }); },
    async editReply(payload) { calls.push({ method: 'editReply', payload }); },
  };
  return { value, calls };
}

test('actual command handler sends exactly one private response for each command and unknown input', async () => {
  for (const [name, expected] of [
    ['ping', /^Pong!$/],
    ['help', /\/ping/],
    ['status', /Online.*Gateway latency: 42 ms/],
    ['not-registered', /^Unknown command\. Use \/help\.$/],
  ]) {
    const { value, calls } = interaction({ name });
    await handler(value);
    assert.equal(calls.length, 1, name);
    assert.equal(calls[0].method, 'reply');
    assert.equal(calls[0].payload.flags, 64);
    assert.match(calls[0].payload.content, expected);
  }
  const ignored = interaction({ chatInput: false });
  await handler(ignored.value);
  assert.deepEqual(ignored.calls, []);
});

test('an expired, already acknowledged or uncertain initial response never causes another application callback', async () => {
  for (const error of [
    Object.assign(Error('DO_NOT_LOG expired token'), { code: 10062 }),
    Object.assign(Error('DO_NOT_LOG acknowledged token'), { code: 40060 }),
    Object.assign(Error('DO_NOT_LOG response lost'), { code: 'ECONNRESET' }),
  ]) {
    const { value, calls } = interaction({ error });
    const original = console.error;
    const output = [];
    try {
      console.error = (...args) => output.push(args);
      await handler(value);
    } finally { console.error = original; }
    assert.deepEqual(calls.map(call => call.method), ['reply'], String(error.code));
    assert.ok(output.length > 0);
    assert.doesNotMatch(JSON.stringify(output), /DO_NOT_LOG/);
  }
});

test('a callback already acknowledged or deferred elsewhere is not answered again', async () => {
  for (const state of [{ replied: true }, { deferred: true }]) {
    const { value, calls } = interaction(state);
    await handler(value);
    assert.deepEqual(calls, []);
  }
});

test('command computation failure still makes one private error response', async () => {
  const original = Object.getOwnPropertyDescriptor(fixture.client.ws, 'ping');
  Object.defineProperty(fixture.client.ws, 'ping', { configurable: true, get() { throw Error('DO_NOT_LOG'); } });
  const originalError = console.error;
  const output = [];
  const { value, calls } = interaction();
  try {
    console.error = (...args) => output.push(args);
    await handler(value);
  } finally {
    Object.defineProperty(fixture.client.ws, 'ping', original);
    console.error = originalError;
  }
  assert.deepEqual(calls, [{ method: 'reply', payload: { content: 'Command failed. Try again later.', flags: 64 } }]);
  assert.ok(output.length > 0);
  assert.doesNotMatch(JSON.stringify(output), /DO_NOT_LOG/);
});
