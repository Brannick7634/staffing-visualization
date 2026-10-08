# Weekly Staffing Signal pay snapshot (Task Scheduler: SignalSnapshotWeekly, Mondays 06:00).
# Rebuilds api/_lib/signal/data/signal-snapshot.json from the Sunday pipeline and,
# when the checkout is on master, commits ONLY that file and pushes (Vercel redeploys).
# Never commits anything else; stops if other staged changes exist.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\andyb\dev\staffing-visualization'
$snap = 'api/_lib/signal/data/signal-snapshot.json'
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("signal-snapshot-{0:yyyy-MM-dd}.log" -f (Get-Date))
function Log($m) { "{0:s} {1}" -f (Get-Date), $m | Add-Content -Encoding utf8 $log }

# Runs a native command (python, git), logs its stdout and stderr, returns its exit code.
# Windows PowerShell 5.1 turns redirected native stderr into error records and 'Stop' makes
# the first one terminating; git push writes its normal "To https://..." line to stderr, so
# a successful push was logged as ERROR (2026-10-05). Judge success by exit code only.
# The exit code is reset first so a command that never starts counts as a failure.
# Stderr lines arrive as error records; log their message (a blank line would otherwise
# print as "System.Management.Automation.RemoteException").
function Invoke-Logged([scriptblock]$cmd) {
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = -1
  & $cmd 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { Log $_.Exception.Message } else { Log $_ }
  }
  $LASTEXITCODE
}

try {
  Set-Location $repo
  Log 'export start'
  $rc = Invoke-Logged { python scripts\export_signal_snapshot.py }
  if ($rc -ne 0) { throw "export failed (exit $rc)" }

  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'master') { Log "on branch '$branch', not master: snapshot rebuilt locally, not pushed"; exit 0 }

  git diff --quiet -- $snap
  if ($LASTEXITCODE -eq 0) { Log 'snapshot unchanged, nothing to push'; exit 0 }
  $staged = git diff --cached --name-only
  if ($staged) { throw "other staged changes present, refusing to commit: $staged" }

  $null = Invoke-Logged { git add -- $snap }
  $rc = Invoke-Logged { git commit -m ("Weekly pay snapshot {0:yyyy-MM-dd}" -f (Get-Date)) -- $snap }
  if ($rc -ne 0) { throw 'commit failed' }
  $rc = Invoke-Logged { git push origin master }
  if ($rc -ne 0) { throw "push failed (exit $rc)" }
  Log 'pushed'
  exit 0
} catch {
  Log "ERROR: $_"
  exit 2
}
