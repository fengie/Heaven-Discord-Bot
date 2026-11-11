# Registering commands with GitHub Actions

Discord application commands are registered by the scoped [Register Discord Commands](https://github.com/fengie/Heaven-Discord-Bot/actions/workflows/register-commands.yml) workflow.

- Triggered when command definitions, the registration script, the package manifest, or this workflow changes on trusted `main`. Also supports manual `workflow_dispatch` on `main`.
- GitHub **Actions repository secrets**: `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are required; `DISCORD_GUILD_ID` is optional (recommended for initial guild-scoped registration).
- Secrets are provided only to the registration step, **not** to dependency installation, pull-request CI, Docker image construction, or build artifacts.
- Registration uses the existing `scripts/register-commands.mjs` and logs only command count/scope or a generic error. If it fails, inspect the workflow conclusion, verify secret names and Discord application/guild permissions, and rerun only after fixing the cause.

**Registration is not hosting.** This workflow doesn't provision an H1 host, move credentials to H1, launch a container, or verify Gateway readiness. Continue using the authenticated Heaven Toolbox/Bridge deployment route for actual H1 installation and confirm `discord.ready` plus a live Discord command response before saying the bot is online. Avoid exposing tokens in workflow logs, GitHub issues, public branches, or chat.
