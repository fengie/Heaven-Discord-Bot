// Public slash-command definitions are shared by registration and dispatch.
export const COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({ name: 'ping', description: 'Check whether the bot responds' }),
  Object.freeze({ name: 'help', description: 'List available bot commands' }),
  Object.freeze({ name: 'status', description: 'Show bot uptime and gateway latency' }),
]);

export function formatUptime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return 'unknown';
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return `${hours}h ${minutes}m ${remainder}s`;
}

export function replyForCommand(name, { uptimeSeconds = 0, gatewayPingMs = -1 } = {}) {
  switch (name) {
    case 'ping':
      return 'Pong!';
    case 'help':
      return 'Available commands:\n' +
        COMMAND_DEFINITIONS.map(command => `/${command.name} — ${command.description}`).join('\n');
    case 'status': {
      const latency = typeof gatewayPingMs === 'number' &&
        Number.isFinite(gatewayPingMs) && gatewayPingMs >= 0
        ? `${Math.round(gatewayPingMs)} ms`
        : 'unavailable';
      return `Online | Uptime: ${formatUptime(uptimeSeconds)} | Gateway latency: ${latency}`;
    }
    default:
      return null;
  }
}
