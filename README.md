# Heaven Discord Bot

Minimal Discord slash-command bot owned by `fengie`. Product-specific bot code lives here; shared engineering infrastructure remains in the private [Heaven Toolbox](https://github.com/fengie/heaven-toolbox) repository.

## Initial command set

- `/ping` — replies `Pong!`
- `/help` — lists the available commands
- `/status` — reports bot uptime and Discord gateway latency

Replies are private (ephemeral). Only the non-privileged `Guilds` gateway intent is requested. The bot does **not** read message content, manage members, or execute host commands.

## Source validation (no credentials needed)

Requires Node.js 24.17.0 or newer. See [discord.js requirements](https://discord.js.org/docs/packages/discord.js/14).

```sh
npm install
npm test
npm run check
```

The suite includes the existing inherited Toolbox bootstrap contract plus command/configuration tests. GitHub Actions runs the same checks and a credential-free Docker build on pushes and pull requests.

## Credentials and registration (later)

1. Create a bot application at [Discord Developer Portal](https://discord.com/developers/applications). Keep the bot token out of GitHub.
2. Copy `.env.example` to `.env` **on the trusted runtime host**. Supply `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. For initial development, supply `DISCORD_GUILD_ID` to register commands only in that server.
3. Invite the bot with `bot` and `applications.commands` scopes. No Administrator, Message Content, or Server Members permissions are required.
4. Register commands explicitly when their definitions change, then start the bot:

```sh
node --env-file=.env scripts/register-commands.mjs
node --env-file=.env src/index.mjs
```

Without `DISCORD_GUILD_ID`, registration is global and Discord may take time to propagate commands. Registration is **not** repeated on every startup.

## Heaven1 runtime definition (prepared, not deployed)

`Dockerfile` and `compose.yaml` are a lightweight, restart-on-failure deployment definition for an **authorized, persistent Heaven1 Docker host**. They do not start a listener on Heaven2 or use the Toolbox CI worker fleet as a service host.

After credentials and host access are available:

```sh
docker compose build
docker compose run --rm bot node scripts/register-commands.mjs
docker compose up -d
docker compose ps
docker compose logs --tail=50 bot
```

Provision `.env` on the host with restricted file permissions and keep it outside version control. Confirm a `discord.ready` log and test `/ping`, `/help`, and `/status` in Discord before claiming a live deployment. `docker compose down` is the rollback for this bot's own service; do not change or stop other Heaven1 workloads.

**Current state:** source/CI only. No bot credentials, Discord command registration, H1 installation, or live availability have been verified.

## Toolbox inheritance and feedback

This repository's existing `AGENTS.md`, `.heaven/agent-entry.json`, and `.heaven/toolbox-subscriptions.json` are the pinned, non-authorizing Toolbox adoption baseline. They grant no credentials or host rights. Keep reusable lessons in the verified feedback workflow; never copy private Toolbox source into this public repository. See [the adoption trial](docs/toolbox-adoption-trial.md).
