// Never print tokens or pass credential objects to general-purpose loggers.
const SNOWFLAKE = /^\d{17,20}$/;

export function getBotToken(env = process.env) {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token) throw new Error('Missing DISCORD_TOKEN.');
  return token;
}

export function getRegistrationConfig(env = process.env) {
  const token = getBotToken(env);
  const clientId = env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Missing DISCORD_CLIENT_ID.');
  if (!SNOWFLAKE.test(clientId)) throw new Error('Invalid DISCORD_CLIENT_ID.');

  const guildId = env.DISCORD_GUILD_ID?.trim() || undefined;
  if (guildId && !SNOWFLAKE.test(guildId)) {
    throw new Error('Invalid DISCORD_GUILD_ID.');
  }
  return { token, clientId, guildId };
}
