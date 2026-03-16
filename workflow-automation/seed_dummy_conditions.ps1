$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api'
$rand = [guid]::NewGuid().ToString().Substring(0,8)
$email = "seed_$rand@example.com"
$pwd = 'Pass1234!'

function Poll-Execution($id, $token, $max = 50) {
  for ($i=0; $i -lt $max; $i++) {
    $ex = Invoke-RestMethod -Method Get -Uri "$base/executions/$id" -Headers @{ Authorization = "Bearer $token" }
    if ($ex.data.status -in @('completed','failed','canceled')) { return $ex.data }
    Start-Sleep -Milliseconds 250
  }
  throw "Execution polling timed out for $id"
}

$null = Invoke-RestMethod -Method Post -Uri "$base/auth/register" -ContentType 'application/json' -Body (@{ name='Seed User'; email=$email; password=$pwd } | ConvertTo-Json)
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ email=$email; password=$pwd } | ConvertTo-Json)
$token = $login.data.token
$headers = @{ Authorization = "Bearer $token" }

$wfBody = @{
  name = "Condition Coverage Seed $rand"
  is_active = $true
  max_iterations = 20
  input_schema = @{
    amount = @{ type='number'; required=$true }
    country = @{ type='string'; required=$true }
    department = @{ type='string'; required=$false }
    priority = @{ type='string'; required=$true; allowed_values=@('High','Medium','Low') }
  }
} | ConvertTo-Json -Depth 8
$wf = Invoke-RestMethod -Method Post -Uri "$base/workflows" -Headers $headers -ContentType 'application/json' -Body $wfBody
$wfId = $wf.data.id

$router = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Approval Router'; step_type='task'; order=0 } | ConvertTo-Json)).data
$manager = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Manager Approval'; step_type='approval'; order=1; metadata=@{ assignee_email='manager@example.com'; instructions='Manager should approve' } } | ConvertTo-Json -Depth 6)).data
$finance = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Finance Officer Approval'; step_type='approval'; order=2; metadata=@{ assignee_email='finance@example.com'; instructions='Finance should approve' } } | ConvertTo-Json -Depth 6)).data
$ceo = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='CEO Approval'; step_type='approval'; order=3; metadata=@{ assignee_email='ceo@example.com'; instructions='CEO should approve' } } | ConvertTo-Json -Depth 6)).data
$nonUs = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Non-US Route'; step_type='task'; order=4 } | ConvertTo-Json)).data
$low = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Low Priority Route'; step_type='task'; order=5 } | ConvertTo-Json)).data
$done = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Task Completion'; step_type='task'; order=6 } | ConvertTo-Json)).data

$null = Invoke-RestMethod -Method Put -Uri "$base/workflows/$wfId" -Headers $headers -ContentType 'application/json' -Body (@{ start_step_id=$router.id; is_active=$true } | ConvertTo-Json)

$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($router.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="amount < 100 && country == 'US'"; next_step_id=$manager.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($router.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="amount >= 100 && country == 'US'"; next_step_id=$finance.id; priority=2 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($router.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="contains(country, 'IN')"; next_step_id=$nonUs.id; priority=3 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($router.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition="priority == 'Low'"; next_step_id=$low.id; priority=4 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($router.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$low.id; priority=5 } | ConvertTo-Json)

$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($manager.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$done.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($finance.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$ceo.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($ceo.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$done.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($nonUs.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$done.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($low.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$done.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($done.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$null; priority=1 } | ConvertTo-Json)

$cases = @(
  @{ name='amount_lt_100'; data=@{ amount=50; country='US'; priority='High'; department='Sales' } },
  @{ name='amount_gte_100'; data=@{ amount=250; country='US'; priority='High'; department='Finance' } },
  @{ name='contains_country_IN'; data=@{ amount=70; country='INDIA'; priority='Medium'; department='Ops' } },
  @{ name='priority_low'; data=@{ amount=120; country='DE'; priority='Low'; department='Support' } },
  @{ name='default_fallback'; data=@{ amount=120; country='DE'; priority='Medium'; department='Support' } }
)

$executionResults = @()
foreach ($c in $cases) {
  $start = Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=$c.data } | ConvertTo-Json -Depth 8)
  $final = Poll-Execution $start.data.id $token
  $executionResults += [ordered]@{
    case = $c.name
    execution_id = $start.data.id
    status = $final.status
    first_step = ($final.logs | Select-Object -First 1).step_name
    last_step = ($final.logs | Select-Object -Last 1).step_name
  }
}

$invalidInput = 'not_tested'
try {
  $null = Invoke-RestMethod -Method Post -Uri "$base/workflows/$wfId/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=@{ amount=50; country='US'; priority='Urgent' } } | ConvertTo-Json -Depth 8)
  $invalidInput = 'unexpected_pass'
} catch {
  $invalidInput = "rejected_$([int]$_.Exception.Response.StatusCode)"
}

$loopWf = Invoke-RestMethod -Method Post -Uri "$base/workflows" -Headers $headers -ContentType 'application/json' -Body (@{ name="Loop Fail Seed $rand"; is_active=$true; max_iterations=2; input_schema=@{} } | ConvertTo-Json -Depth 6)
$loopWfId = $loopWf.data.id
$la = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$loopWfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Loop A'; step_type='task'; order=1 } | ConvertTo-Json)).data
$lb = (Invoke-RestMethod -Method Post -Uri "$base/workflows/$loopWfId/steps" -Headers $headers -ContentType 'application/json' -Body (@{ name='Loop B'; step_type='task'; order=2 } | ConvertTo-Json)).data
$null = Invoke-RestMethod -Method Put -Uri "$base/workflows/$loopWfId" -Headers $headers -ContentType 'application/json' -Body (@{ start_step_id=$la.id; is_active=$true } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($la.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$lb.id; priority=1 } | ConvertTo-Json)
$null = Invoke-RestMethod -Method Post -Uri "$base/steps/$($lb.id)/rules" -Headers $headers -ContentType 'application/json' -Body (@{ condition='DEFAULT'; next_step_id=$la.id; priority=1 } | ConvertTo-Json)
$loopExec = Invoke-RestMethod -Method Post -Uri "$base/workflows/$loopWfId/execute" -Headers $headers -ContentType 'application/json' -Body (@{ data=@{} } | ConvertTo-Json)
$loopFinal = Poll-Execution $loopExec.data.id $token

[ordered]@{
  seeded_user = $email
  workflow_id = $wfId
  condition_executions = $executionResults
  invalid_input_check = $invalidInput
  failed_execution = [ordered]@{ execution_id = $loopExec.data.id; status = $loopFinal.status }
} | ConvertTo-Json -Depth 8
