// Limit diagnostics to Discord's public numeric response codes; never echo errors,
// request URLs, headers, bodies, or raw exception messages (which can hold tokens).
export function describeRegistrationError(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status : null;
  const code = Number.isInteger(error?.code) && error.code >= 0 && error.code <= 999999
    ? error.code : null;
  let reason = 'network_or_unclassified_error';

  if (code === 10002) reason = 'unknown_application';
  else if (code === 10004) reason = 'unknown_or_inaccessible_guild';
  else if (code === 50001) reason = 'missing_guild_access';
  else if (code === 50013 || code === 50026) reason = 'missing_permission_or_scope';
  else if (code === 50035) reason = 'invalid_command_payload';
  else if (code === 10012 || code === 50014 || status === 401) reason = 'invalid_bot_token';
  else if (status === 403) reason = 'missing_guild_access';
  else if (status === 404) reason = 'unknown_application_or_guild';
  else if (status === 429) reason = 'rate_limited';
  else if (status !== null && status >= 500) reason = 'discord_service_unavailable';
  else if (status !== null) reason = 'discord_api_rejected_request';

  return `discord.registration_failed reason=${reason} http_status=${status ?? 'unknown'} discord_code=${code ?? 'unknown'}`;
}
