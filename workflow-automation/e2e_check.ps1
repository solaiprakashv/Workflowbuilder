$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api'
$rand = [guid]::NewGuid().ToString().Substring(0,8)
$email = "e2e_$rand@example.com"
$pwd = 'Pass1234!'

function Poll-Execution($id, $token, $max = 30) {
  for ($i=0; $i -lt $max; $i++) {
    $ex = Invoke-RestMethod -Method Get -Uri "$base/executions/$id" -Headers @{ Authorization = "Bearer $token" }
    $status = $ex.data.status
    if ($status -in @('completed','failed','canceled')) { return $ex.data }
    Start-Sleep -Milliseconds 500
  }
  throw "Execution polling timed out for $id"
}

$results = [ordered]@{}

$null = Invoke-RestMethod -Method Post -Uri "$base/auth/register" -ContentType 'application/json' -Body (@{ name='E2E User'; email=$email; password=$pwd } | ConvertTo-Json)
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email=$email; password=$pwd } | ConvertTo-Json)
$token = $login.data.token
$headers = @{ Authorization = "Bearer $token" }
$results.auth = 'pass'

$wf1Body = @{
  name = "Expense Approval $rand"
  is_active = $true
  max_iterations = 10
  input_schema = @{
    amount = @{ type='number'; required=$true }
    country = @{ type='string'; required=$true }
    department = @{ type='string'; required=$false }
    priority = @{ type='string'; required=$true; allowed_values=@('High','Medium','Low') }
  }
} | ConvertTo-Json -Depth 8
$wf1 = Invoke-RestMethod -Method Post -Uri "$base/workflows" -Headers $headers -ContentType 'application/json' -Body $wf1Body
$wf1Id = $wf1.data.id

$s1 = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf1Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Manager Approval'; step_type='approval'; order=1; metadata=@{ assignee_email='manager@example.com' } } | ConvertTo-Json -Depth 6)).data
$s2 = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf1Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Finance Notification'; step_type='notification'; order=2; metadata=@{ recipients=@('finance@example.com') } } | ConvertTo-Json -Depth 6)).data
$s3 = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf1Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Task Rejection'; step_type='task'; order=3 } | ConvertTo-Json -Depth 6)).data

$null = Invoke-RestMethod -Method Put -Uri "$base/workflows/$wf1Id" -Headers $headers -ContentType 'application/json' -Body (@{ start_step_id=$s1.id } | ConvertTo-Json)

$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s1.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="startsWith(country, 'U') && priority == 'High'"; next_step_id=$s2.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s1.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="contains(department, 'Fin')"; next_step_id=$s2.id; priority=2 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s1.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$s3.id; priority=3 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s2.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$null; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s3.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$null; priority=1 } | ConvertTo-Json)

$exec1 = Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf1Id/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=@{ amount=250; country='US'; department='Finance'; priority='High' } } | ConvertTo-Json -Depth 6)
$exec1Final = Poll-Execution $exec1.data.id $token

$logCheck = $false
if ($exec1Final.logs.Count -gt 0) {
  $firstLog = $exec1Final.logs[0]
  $logCheck = ($firstLog.PSObject.Properties.Name -contains 'evaluated_rules') -and ($firstLog.PSObject.Properties.Name -contains 'selected_next_step') -and ($firstLog.PSObject.Properties.Name -contains 'started_at') -and ($firstLog.PSObject.Properties.Name -contains 'ended_at')
}
$results.execution_main = @{ status=$exec1Final.status; detailed_log_fields=$logCheck }

$syntaxValidation = 'fail'
try {
  $null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s1.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='amount >'; next_step_id=$s2.id; priority=99 } | ConvertTo-Json)
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 400) { $syntaxValidation = 'pass' }
}
$results.rule_syntax_validation = $syntaxValidation

$wf2 = Invoke-RestMethod -Method Post -Uri "$base/workflows" -Headers $headers -ContentType 'application/json' -Body (@{ name="No Default $rand"; is_active=$true; input_schema=@{ amount=@{type='number'; required=$true} } } | ConvertTo-Json -Depth 8)
$wf2Id = $wf2.data.id
$s2a = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf2Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Only Step'; step_type='task'; order=1 } | ConvertTo-Json)).data
$null = Invoke-RestMethod -Method Put -Uri "$base/workflows/$wf2Id" -Headers $headers -ContentType 'application/json' -Body (@{ start_step_id=$s2a.id } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($s2a.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='amount > 100'; next_step_id=$null; priority=1 } | ConvertTo-Json)
$defaultEnforce = 'fail'
try {
  $null = Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf2Id/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=@{ amount=50 } } | ConvertTo-Json)
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 400) { $defaultEnforce = 'pass' }
}
$results.default_rule_enforcement = $defaultEnforce

$wf3 = Invoke-RestMethod -Method Post -Uri "$base/workflows" -Headers $headers -ContentType 'application/json' -Body (@{ name="Loop Check $rand"; is_active=$true; max_iterations=2; input_schema=@{} } | ConvertTo-Json -Depth 6)
$wf3Id = $wf3.data.id
$a = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf3Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='A'; step_type='task'; order=1 } | ConvertTo-Json)).data
$b = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf3Id/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='B'; step_type='task'; order=2 } | ConvertTo-Json)).data
$null = Invoke-RestMethod -Method Put -Uri "$base/workflows/$wf3Id" -Headers $headers -ContentType 'application/json' -Body (@{ start_step_id=$a.id } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($a.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$b.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($b.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$a.id; priority=1 } | ConvertTo-Json)

$execLoop = Invoke-RestMethod -Method Post -Uri "$base/workflows/$wf3Id/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=@{} } | ConvertTo-Json)
$loopFinal = Poll-Execution $execLoop.data.id $token
$null = Invoke-RestMethod -Method Post -Uri "$base/executions/$($execLoop.data.id)/retry" -Headers $headers
$loopAfterRetry = Poll-Execution $execLoop.data.id $token
$results.loop_guard = @{ first_status=$loopFinal.status; after_retry_status=$loopAfterRetry.status; retries=$loopAfterRetry.retries }

$listActive = Invoke-RestMethod -Method Get -Uri "$base/workflows?is_active=true&page=1&limit=5" -Headers $headers
$results.workflow_filter = @{ returned = @($listActive.data).Count; query='is_active=true' }

$results | ConvertTo-Json -Depth 8