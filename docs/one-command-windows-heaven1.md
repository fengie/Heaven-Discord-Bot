# Single-command native Windows setup on Heaven1

This is the no-Docker/no-WSL/no-GUI setup path. The reviewed script is `scripts/Install-HeavenBot.ps1`.

On **physical Heaven1**, open regular Windows PowerShell. Download the script from a reviewed **immutable commit SHA** (see the command in the deployment response), then execute it. It downloads the canonical bot `main` source and a portable official Node.js v24.17.0 ZIP, verifies the Node SHA-256, and installs npm dependencies locally under the current Windows user's LocalAppData. It does not use a machine-level installer or mutate unrelated apps/services.

It asks once, privately, only for the Discord bot token. The application/server IDs were already used when the commands were registered and are not needed to run the Gateway bot. The token is encrypted with the current user's Windows DPAPI (not committed, printed, or passed as a process argument) and the credential file receives a restricted NTFS ACL. **GitHub Actions secrets cannot be retrieved in plaintext.** If the token was lost, reset it in the Discord Developer Portal and update the registration secret in GitHub.

The script registers a current-user, non-elevated Windows Scheduled Task, `Heaven Discord Bot`, with restart-on-error. Its logon trigger requires that Windows user to be logged in; it does not run before login after a reboot. Completion reports `HEAVEN_BOT_READY` only after the task is running and a Discord Gateway ready log is observed. Test `/ping` in the server for independent acceptance.

Local service stop: `Stop-ScheduledTask -TaskName 'Heaven Discord Bot'`. To inspect without exposing token values, use `Get-ScheduledTask -TaskName 'Heaven Discord Bot'`. The script refuses a foreign pre-existing task, stale existing app version, unexpected host, and a mismatched Node release ZIP. It does **not** fix the separate Toolbox Bridge problem.
