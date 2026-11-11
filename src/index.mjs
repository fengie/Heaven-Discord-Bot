import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { getBotToken } from './config.mjs';
import { inspectReleaseInheritance } from './release-inheritance.mjs';
import { replyForCommand } from './commands.mjs';

// Slash commands need only Guilds: no privileged message-content or member intent.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, ready => {
  console.info(JSON.stringify({ event: 'discord.ready', userId: ready.user.id, sourceSha: process.env.HEAVEN_BOT_SOURCE_SHA ?? null, pid: process.pid, observedAt: new Date().toISOString() }));
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const content = replyForCommand(interaction.commandName, {
      uptimeSeconds: process.uptime(),
      gatewayPingMs: client.ws.ping,
    });
    await interaction.reply({
      content: content ?? 'Unknown command. Use /help.',
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    // Do not log the interaction object, REST headers, or credentials.
    console.error(JSON.stringify({ event: 'discord.command_failed', command: interaction.commandName }));
    try {
      const response = { content: 'Command failed. Try again later.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    } catch {
      console.error('discord.error_response_failed');
    }
  }
});

client.on(Events.Error, () => {
  console.error('discord.client_error');
});

function shutdown() {
  console.info('discord.shutdown');
  void Promise.resolve(client.destroy()).catch(() => {
    process.exitCode = 1;
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function start() {
  const admission = await inspectReleaseInheritance();
  if (!admission.ready) {
    console.error('TOOLBOX_INHERITANCE_NOT_VERIFIED');
    process.exitCode = 1;
    return;
  }
  let token;
  try {
    token = getBotToken();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  try {
    await client.login(token);
  } catch {
    console.error('discord.login_failed (verify token and network access)');
    process.exitCode = 1;
    await client.destroy();
  }
}

void start();
