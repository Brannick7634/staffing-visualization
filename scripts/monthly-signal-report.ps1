# Monthly Staffing Signal report (PROPOSED task "SignalReportMonthly" - NOT registered).
# Proposed trigger: first Monday of each month, 07:00 (after SignalSnapshotWeekly at 06:00,
# which needs the Sunday pipeline). Steps:
#   1. archive last month   -> api/_lib/signal/data/monthly/YYYY-MM.json (skips if present)
#   2. build the report     -> api/_lib/signal/data/report/YYYY-MM.json
#   3. on master: commit ONLY those two files and push (Vercel redeploys /report)
#   4. email the [DRAFT] to Andy only.
# Subscribers are NEVER emailed here: that stays manual after Andy says "send"
# (monthly_report_email.mjs --approve M, then --send --approved M).
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\andyb\dev\staffing-visualization'
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("signal-report-{0:yyyy-MM-dd}.log" -f (Get-Date))
function Log($m) { "{0:s} {1}" -f (Get-Date), $m | Add-Content -Encoding utf8 $log }

try {
  Set-Location $repo
  $month = (Get-Date).AddMonths(-1).ToString('yyyy-MM')
  Log "monthly archive $month"
  & python scripts\export_signal_monthly.py --month $month --skip-existing 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "monthly archive failed (exit $LASTEXITCODE)" }

  & node scripts\build_monthly_report.mjs --month $month 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "report build failed (exit $LASTEXITCODE)" }

  $files = @("api/_lib/signal/data/monthly/$month.json", "api/_lib/signal/data/report/$month.json")
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'master') {
    Log "on branch '$branch', not master: report built locally, not pushed"
  } else {
    $staged = git diff --cached --name-only
    if ($staged) { throw "other staged changes present, refusing to commit: $staged" }
    git add -- $files
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      git commit -m "Monthly Staffing Signal report $month" -- $files | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'commit failed' }
      git push origin master 2>&1 | ForEach-Object { Log $_ }
      if ($LASTEXITCODE -ne 0) { throw 'push failed' }
      Log 'pushed'
    } else { Log 'report unchanged, nothing to push' }
  }

  & node scripts\monthly_report_email.mjs --draft --month $month --state TX --city Houston 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { throw "draft email failed (exit $LASTEXITCODE)" }
  exit 0
} catch {
  Log "ERROR: $_"
  exit 2
}
