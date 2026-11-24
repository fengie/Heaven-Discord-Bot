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
  // This handler owns one initial private response and never defers. If
  // another handler already acknowledged the event, do not send a duplicate.
  if (interaction.replied || interaction.deferred) return;

  let content;
  try {
    content = replyForCommand(interaction.commandName, {
      uptimeSeconds: process.uptime(),
      gatewayPingMs: client.ws.ping,
    }) ?? 'Unknown command. Use /help.';
  } catch {
    // No response has been attempted: one private fallback remains safe.
    console.error(JSON.stringify({ event: 'discord.command_failed', stage: 'compute' }));
    content = 'Command failed. Try again later.';
  }

  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    // An initial callback may have reached Discord even if the SDK throws.
    // The SDK owns transport retries; never issue another application reply
    // or follow-up merely because its acknowledgement was not observed.
    const outcome = error?.code === 10062 ? 'unknown_interaction'
      : error?.code === 40060 ? 'already_acknowledged'
      : 'response_unconfirmed';
    console.error(JSON.stringify({ event: 'discord.command_failed', stage: 'response', outcome }));
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
