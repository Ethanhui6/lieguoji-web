Add-Type -AssemblyName System.IO.Compression.FileSystem
$tracePath = '.autopilot/country-ownership/browser/desktop-final/artifacts/country-world--country-wor-f6539-lict-and-independent-reload-desktop-chromium/trace.zip'
$traceArchive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $tracePath))
$traceRecords = @()
$traceHosts = [System.Collections.Generic.HashSet[string]]::new()
$traceSensitive = @()
try {
 foreach ($traceEntry in $traceArchive.Entries) {
  if ($traceEntry.Length -gt 30000000 -or $traceEntry.FullName.Contains('..')) { throw 'Unexpected trace entry' }
  $traceRecords += @{ path = $traceEntry.FullName; bytes = $traceEntry.Length }
  if ($traceEntry.FullName -match '\.(trace|network|stacks|json|txt)$') {
   $traceReader = [System.IO.StreamReader]::new($traceEntry.Open())
   try { $traceText = $traceReader.ReadToEnd() } finally { $traceReader.Dispose() }
   if ($traceText -match '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b') { $traceSensitive += $traceEntry.FullName }
   if ($traceEntry.FullName.EndsWith('.network')) {
    foreach ($traceLine in ($traceText -split "`n")) {
     if ($traceLine.Trim()) { $traceRow = $traceLine | ConvertFrom-Json; if ($traceRow.snapshot.request.url) { [void]$traceHosts.Add(([uri]$traceRow.snapshot.request.url).Authority) }; if ($traceRow.snapshot.request.headers | Where-Object { $_.name -match '^(Authorization|Cookie)$' }) { $traceSensitive += $traceEntry.FullName + ':auth-header' } }
    }
   }
  }
 }
} finally { $traceArchive.Dispose() }
$traceReview = @{ at=[DateTime]::UtcNow.ToString('o'); path=$tracePath; sha256=(Get-FileHash -LiteralPath $tracePath -Algorithm SHA256).Hash.ToLower(); entries=$traceRecords; requestHosts=@($traceHosts); sensitiveMatches=$traceSensitive; originalPlayerData=$false; scope='Isolated Playwright generated fixture; visible failure was a closed nation panel, not incorrect persisted state'; passed=($traceSensitive.Count -eq 0 -and @($traceHosts | Where-Object {$_ -ne '127.0.0.1:4173'}).Count -eq 0) }
$traceReview | ConvertTo-Json -Depth 6 | Set-Content .autopilot/country-ownership/trace-review.json
$traceReview | Select-Object path,requestHosts,sensitiveMatches,passed | ConvertTo-Json
