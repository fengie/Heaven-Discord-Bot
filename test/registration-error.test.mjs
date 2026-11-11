import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRegistrationError } from '../scripts/registration-error.mjs';

test('401 maps to credential failure without leaking API detail', () => {
  const result = describeRegistrationError({
    status: 401, code: 0, message: 'SECRET_TOKEN_SHOULD_NEVER_APPEAR',
    request: { headers: { Authorization: 'Bot SECRET_TOKEN_SHOULD_NEVER_APPEAR' } },
  });
  assert.equal(result, 'discord.registration_failed reason=invalid_bot_token http_status=401 discord_code=0');
  assert.ok(!result.includes('SECRET_TOKEN_SHOULD_NEVER_APPEAR'));
});

test('404 unknown application distinguishes wrong application id', () => {
  assert.equal(
    describeRegistrationError({status:404,code:10002}),
    'discord.registration_failed reason=unknown_application http_status=404 discord_code=10002',
  );
});

test('404 unknown guild distinguishes unavailable test server', () => {
  assert.equal(
    describeRegistrationError({status:404,code:10004}),
    'discord.registration_failed reason=unknown_or_inaccessible_guild http_status=404 discord_code=10004',
  );
});

test('403 missing access distinguishes failed bot installation or authorization', () => {
  assert.equal(
    describeRegistrationError({status:403,code:50001}),
    'discord.registration_failed reason=missing_guild_access http_status=403 discord_code=50001',
  );
});

test('50035 invalid command payload remains a bounded diagnostic', () => {
  assert.equal(
    describeRegistrationError({status:400,code:50035}),
    'discord.registration_failed reason=invalid_command_payload http_status=400 discord_code=50035',
  );
});

test('rate limits and transient Discord failures are distinct', () => {
  assert.equal(
    describeRegistrationError({status:429}),
    'discord.registration_failed reason=rate_limited http_status=429 discord_code=unknown',
  );
  assert.equal(
    describeRegistrationError({status:503}),
    'discord.registration_failed reason=discord_service_unavailable http_status=503 discord_code=unknown',
  );
});

test('unknown errors never interpolate untrusted text or arbitrary numeric values', () => {
  const result = describeRegistrationError({
    status: 200, code: 99999999, message: 'VERY_PRIVATE_CREDENTIAL',
    url: 'https://discord.com/api/v10/applications/VERY_PRIVATE_CREDENTIAL',
  });
  assert.equal(result, 'discord.registration_failed reason=network_or_unclassified_error http_status=unknown discord_code=unknown');
  assert.ok(!result.includes('VERY_PRIVATE_CREDENTIAL'));
});
