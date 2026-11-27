import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Exercise the actual entrypoint and signal callbacks, using only synthetic
// admission, login and transport. Never emit an actual process signal.
async function withGateway(name, run, { destroyThrows = false } = {}) {
  const entry = new URL('../src/index.mjs?lifecycle=' + name, import.meta.url).href;
  const key = '__heavenGatewayLifecycle_' + name;
  const fixture = {
    admission: deferred(), login: deferred(), tokenReads: 0, loginCalls: 0,
    destroys: 0, destroyThrows, handlers: new Map(), logs: [],
  };
  const access = 'globalThis[' + JSON.stringify(key) + ']';
  const stub = source => 'data:text/javascript,' + encodeURIComponent(source);
  const hooks = new Map([
    ['discord.js', stub(`
      const f = ${access};
      export const Events = { ClientReady: 'ready', InteractionCreate: 'interactionCreate', Error: 'error' };
      export const GatewayIntentBits = { Guilds: 1 };
      export const MessageFlags = { Ephemeral: 64 };
      export class Client {
        constructor() { this.ws = { ping: 42 }; }
        on(event, fn) { f.handlers.set(event, fn); }
        once(event, fn) { f.handlers.set(event, fn); }
        login() { f.loginCalls++; return f.login.promise; }
        destroy() { f.destroys++; if (f.destroyThrows) throw Error('DO_NOT_LOG'); }
      }
    `)],
    ['./config.mjs', stub(`export function getBotToken() { ${access}.tokenReads++; return 'synthetic-fixture'; }`)],
    ['./release-inheritance.mjs', stub(`export function inspectReleaseInheritance() { return ${access}.admission.promise; }`)],
  ]);
  const originalSignals = new Map(['SIGINT','SIGTERM'].map(signal => [signal, process.listeners(signal)]));
  const originalExit = process.exitCode, oldInfo = console.info, oldError = console.error;
  globalThis[key] = fixture;
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === entry && hooks.has(specifier))
        return { url: hooks.get(specifier), shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
  try {
    console.info = (...args) => fixture.logs.push(args);
    console.error = (...args) => fixture.logs.push(args);
    await import(entry);
    const added = signal => process.listeners(signal).filter(listener => !originalSignals.get(signal).includes(listener));
    assert.equal(added('SIGTERM').length, 1);
    assert.equal(added('SIGINT').length, 1);
    const stop = () => added('SIGTERM')[0]();
    const stopAgain = () => added('SIGINT')[0]();
    await run(fixture, stop, stopAgain);
  } finally {
    // Resolve any synthetic pending promises even when an assertion fails.
    fixture.admission.resolve({ ready: false });
    fixture.login.resolve('synthetic-fixture');
    await tick();
    hook.deregister();
    for (const [signal, previous] of originalSignals)
      for (const listener of process.listeners(signal))
        if (!previous.includes(listener)) process.removeListener(signal, listener);
    console.info = oldInfo;
    console.error = oldError;
    process.exitCode = originalExit;
    delete globalThis[key];
  }
}

test('shutdown during admission prevents token access and Gateway login', async () => {
  await withGateway('admission', async (f, stop, stopAgain) => {
    stop();
    stopAgain();
    await tick();
    f.admission.resolve({ ready: true });
    await tick();
    assert.equal(f.tokenReads, 0);
    assert.equal(f.loginCalls, 0);
    assert.equal(f.destroys, 1);
  });
});

test('shutdown during login closes again after a late login completion and never reports readiness', async () => {
  await withGateway('login', async (f, stop, stopAgain) => {
    f.admission.resolve({ ready: true });
    await tick();
    assert.equal(f.loginCalls, 1);
    stop();
    stopAgain();
    await tick();
    assert.equal(f.destroys, 1);
    f.handlers.get('ready')({ user: { id: 'synthetic' } });
    const calls = [];
    await f.handlers.get('interactionCreate')({
      isChatInputCommand: () => true, commandName: 'ping',
      replied: false, deferred: false, async reply(value) { calls.push(value); },
    });
    f.login.resolve('synthetic-fixture');
    await tick();
    assert.equal(f.destroys, 2, 'late completion receives final serialized cleanup');
    assert.deepEqual(calls, []);
    assert.doesNotMatch(JSON.stringify(f.logs), /discord\.ready/);
  });
});

test('synchronous destroy failure is contained and never logs provider details', async () => {
  await withGateway('destroy', async (f, stop) => {
    assert.doesNotThrow(stop);
    await tick();
    assert.equal(process.exitCode, 1);
    assert.doesNotMatch(JSON.stringify(f.logs), /DO_NOT_LOG/);
    assert.equal(f.destroys, 1);
  }, { destroyThrows: true });
});
