import { REST, Routes } from 'discord.js';
import { COMMAND_DEFINITIONS } from '../src/commands.mjs';
import { getRegistrationConfig } from '../src/config.mjs';

// Intentionally separate from bot startup: no registration on reconnect.
async function register() {
  const { token, clientId, guildId } = getRegistrationConfig();
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await new REST({ version: '10' }).setToken(token).put(route, {
    body: COMMAND_DEFINITIONS,
  });
  console.info(`Registered ${COMMAND_DEFINITIONS.length} ${guildId ? 'guild' : 'global'} slash commands.`);
}

register().catch(error => {
  // Keep Discord's token and potentially sensitive HTTP details out of logs.
  if (error instanceof Error && /^(Missing|Invalid) DISCORD_/.test(error.message)) {
    console.error(error.message);
  } else {
    console.error('discord.registration_failed (verify application ID, token, permissions, and network)');
  }
  process.exitCode = 1;
});
