# Heaven Discord Bot

**DO NOT RUN ANY INSTALLER — APP_PLATFORM_QUALITY_UNVERIFIED.** The bot now has separately tested source update policies, a transactional H1 update adapter, SHA-512 locked dependencies, applicable lesson/capability source mappings, and a metadata-only feedback producer. However, the actual private-parent App Platform generator/quality gate has not admitted this existing public child. Both current installers and Gateway startup remain release-held; previously shared immutable installer URLs still execute old versions and must not be used. Physical H1 deployment and runtime auto-update are not yet verified. See [Toolbox inheritance acceptance](docs/toolbox-inheritance-acceptance.md).

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

GitHub Actions runs the inherited Toolbox and bot unit tests, source syntax checks, non-Heaven1 installer refusal, and credential-free Docker build.

## One-time physical Heaven1 installation (no Bridge dependency)

The existing Heaven1 Windows computer has Ubuntu WSL2 with a Docker worker fabric. This minimal setup runs **on Heaven1 inside its Ubuntu WSL2 terminal**, using its existing local Docker engine. It does not repair or use the Toolbox Bridge, start a new controller, install new software, or grant remote shell permissions.

```bash
git clone https://github.com/fengie/Heaven-Discord-Bot.git
cd Heaven-Discord-Bot
bash scripts/bootstrap-heaven1.sh
```

The script refuses the wrong physical computer, non-WSL shells, root, remote Docker contexts, noncanonical repository origins, dirty/stale source, and foreign Compose containers. It checks Docker and Git first, then prompts **locally** for the token (hidden), application ID, and optional guild ID. It stores them in an owner-only `chmod 600` local `.env` excluded from Git and Docker build context. Never paste the token into chat or a GitHub issue. GitHub Actions secrets are write-only and cannot be retrieved as plaintext; if you did not retain the token, reset it in the Discord Developer Portal and update the GitHub secret as well.

The script builds and starts the existing Compose service with `restart: unless-stopped`, checks that the container is running, and requires a fresh `discord.ready` log event. On success, **also test the three slash commands in Discord**; source/runtime self-report alone does not prove the command responses. Docker needs to be available whenever the WSL environment starts; the Compose restart policy cannot boot a stopped WSL distro or Docker daemon.

If the script reports `BOT_GATEWAY_READY_NOT_VERIFIED`, inspect `docker compose -p heaven-discord-bot ps` and the bot's own logs privately on Heaven1. No unrelated service is stopped.

To stop just this bot from its checkout directory:

```bash
docker compose -p heaven-discord-bot down
```

Do not remove `.env` unless intentionally revoking locally stored credentials.

## Credentials and slash command registration

The [Register Discord Commands](https://github.com/fengie/Heaven-Discord-Bot/actions/workflows/register-commands.yml) workflow uses repository-scoped GitHub Actions secrets `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` plus optional `DISCORD_GUILD_ID` to register commands on trusted `main`. It does not start the H1 runtime or transfer secrets to H1.

Without `DISCORD_GUILD_ID`, registration is global and Discord may take time to propagate commands. Registration is **not** repeated on every startup.

## Release updating

The bot has distinct source and application update contracts. A product-specific H1 adapter at `scripts/Apply-HeavenBotUpdate.ps1` is intended to be invoked by the **existing private Toolbox repo updater** after that owner's managed-child catalog and host custody are verified. It stages only clean published source, checks the current main and commit signature, uses `npm ci` to reproduce pinned dependencies, verifies staged tests, switches only the owned bot task, and rolls back if Discord Gateway readiness fails. This adapter is **source/CI tested only**, not independently deployed on H1.

Relevant private Toolbox capabilities and lessons are referenced by exact parent revision and mapped to public regression sources under `.heaven/`. Private modules, credentials, policies and full lesson text are not exported here; the metadata-only child feedback packet is emitted for separate parent review.

## Toolbox inheritance and feedback

The existing `AGENTS.md`, `.heaven/agent-entry.json`, and `.heaven/toolbox-subscriptions.json` are the pinned, non-authorizing Toolbox adoption baseline. They grant no credentials or host rights. Keep reusable lessons in the verified feedback workflow; never copy private Toolbox source into this public repository. See [the adoption trial](docs/toolbox-adoption-trial.md).
