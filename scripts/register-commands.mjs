import { REST, Routes } from 'discord.js';
import { COMMAND_DEFINITIONS } from '../src/commands.mjs';
import { getRegistrationConfig } from '../src/config.mjs';
import { describeRegistrationError } from './registration-error.mjs';

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
  // Keep Discord's token, REST headers, URLs, and raw errors out of logs.
  if (error instanceof Error && /^(Missing|Invalid) DISCORD_/.test(error.message)) {
    console.error(error.message);
  } else {
    console.error(describeRegistrationError(error));
  }
  process.exitCode = 1;
});
