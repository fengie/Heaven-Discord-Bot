import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMAND_DEFINITIONS, formatUptime, replyForCommand } from '../src/commands.mjs';

test('slash command definitions are unique and Discord-compatible', () => {
  const names = COMMAND_DEFINITIONS.map(command => command.name);
  assert.deepEqual(names, ['ping', 'help', 'status']);
  assert.equal(new Set(names).size, names.length);
  for (const command of COMMAND_DEFINITIONS) {
    assert.match(command.name, /^[a-z][a-z0-9_-]{0,31}$/);
    assert.ok(command.description.length > 0 && command.description.length <= 100);
  }
});

test('/ping replies immediately', () => {
  assert.equal(replyForCommand('ping'), 'Pong!');
});

test('/help lists every published command', () => {
  const help = replyForCommand('help');
  for (const command of COMMAND_DEFINITIONS) {
    assert.ok(help.includes('/' + command.name));
  }
});

test('/status reports uptime and gateway latency', () => {
  assert.equal(
    replyForCommand('status', { uptimeSeconds: 3661, gatewayPingMs: 42 }),
    'Online | Uptime: 1h 1m 1s | Gateway latency: 42 ms',
  );
});

test('/status safely handles unavailable gateway ping', () => {
  assert.match(replyForCommand('status', { uptimeSeconds: 0, gatewayPingMs: -1 }), /latency: unavailable/);
});

test('invalid uptime is never displayed as NaN or negative time', () => {
  assert.equal(formatUptime(-1), 'unknown');
  assert.equal(formatUptime(Number.NaN), 'unknown');
});

test('unknown commands are not falsely accepted', () => {
  assert.equal(replyForCommand('not-registered'), null);
});
