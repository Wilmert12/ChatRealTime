# Arranca el Hub (7001) y el Cliente (7002) y abre el navegador.
# Uso (desde la raíz de la solución):  .\run-all.ps1
$root = $PSScriptRoot
dotnet dev-certs https --trust | Out-Null
dotnet build "$root\SignalRArchitecture.slnx"
if ($LASTEXITCODE -ne 0) { Write-Host "La compilación falló." -ForegroundColor Red; exit 1 }

Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root'; dotnet run --project SignalR.Hub --urls https://localhost:7001"
Start-Sleep -Seconds 4
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root'; dotnet run --project SignalR.Client --urls https://localhost:7002"
Start-Sleep -Seconds 5
Start-Process "https://localhost:7002"
