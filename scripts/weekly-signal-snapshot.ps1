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

try {
  Set-Location $repo
  Log 'export start'
  $out = & python scripts\export_signal_snapshot.py 2>&1
  $out | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "export failed (exit $LASTEXITCODE)" }

  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'master') { Log "on branch '$branch', not master: snapshot rebuilt locally, not pushed"; exit 0 }

  git diff --quiet -- $snap
  if ($LASTEXITCODE -eq 0) { Log 'snapshot unchanged, nothing to push'; exit 0 }
  $staged = git diff --cached --name-only
  if ($staged) { throw "other staged changes present, refusing to commit: $staged" }

  git add -- $snap
  git commit -m ("Weekly pay snapshot {0:yyyy-MM-dd}" -f (Get-Date)) -- $snap | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'commit failed' }
  git push origin master 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw 'push failed' }
  Log 'pushed'
  exit 0
} catch {
  Log "ERROR: $_"
  exit 2
}
