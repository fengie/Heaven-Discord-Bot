import assert from 'node:assert/strict';
import test from 'node:test';
import { getBotToken, getRegistrationConfig } from '../src/config.mjs';

const valid = {
  DISCORD_TOKEN: 'secret-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_GUILD_ID: '123456789012345679',
};

test('startup requires a bot token and never logs its value in an error', () => {
  assert.throws(() => getBotToken({}), /Missing DISCORD_TOKEN/);
  assert.equal(getBotToken({ DISCORD_TOKEN: ' secret-token ' }), 'secret-token');
});

test('registration uses a specific guild when configured', () => {
  assert.deepEqual(getRegistrationConfig(valid), {
    token: 'secret-token',
    clientId: '123456789012345678',
    guildId: '123456789012345679',
  });
});

test('registration defaults to global scope without a guild id', () => {
  const { guildId } = getRegistrationConfig({ DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: valid.DISCORD_CLIENT_ID });
  assert.equal(guildId, undefined);
});

test('registration rejects missing or invalid application ids', () => {
  assert.throws(() => getRegistrationConfig({ DISCORD_TOKEN: 'token' }), /Missing DISCORD_CLIENT_ID/);
  assert.throws(() => getRegistrationConfig({ ...valid, DISCORD_CLIENT_ID: 'bad-id' }), /Invalid DISCORD_CLIENT_ID/);
});

test('registration rejects invalid optional guild ids', () => {
  assert.throws(() => getRegistrationConfig({ ...valid, DISCORD_GUILD_ID: 'bogus' }), /Invalid DISCORD_GUILD_ID/);
});

test('configuration errors do not expose the token', () => {
  assert.throws(() => getRegistrationConfig({ DISCORD_TOKEN: 'SENSITIVE', DISCORD_CLIENT_ID: 'wrong' }), error => {
    assert.ok(!error.message.includes('SENSITIVE'));
    return /Invalid DISCORD_CLIENT_ID/.test(error.message);
  });
});
