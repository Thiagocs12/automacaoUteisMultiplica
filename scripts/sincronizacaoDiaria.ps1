# Roda a sincronizacao PROD -> HML de todos os dominios, na ordem correta de dependencia,
# e mantem os outros dominios rodando mesmo se um deles falhar. Uso temporario, enquanto
# a sincronizacao ainda nao esta na pipeline de CI.
#
# Ordem: Produtos e Esteiras nao dependem um do outro, mas Vinculos depende dos dois
# (arquivoDependencia em mapeamentoVinculos.js aponta para JSONs de Produtos/ e Esteiras/).
# Grupos e Permissoes (Keycloak) e um pipeline proprio e independente dos demais.

$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$logDir = Join-Path $ProjectRoot "cypress\output\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Logs ciclicos: mantem so os ultimos 7 dias de todos os artefatos desta rotina
# (log da execucao, relatorio de diagnostico e saida bruta do Claude Code).
$diasRetencaoLogs = 7
Get-ChildItem -Path $logDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(sincronizacao_.*\.log|diagnostico_.*\.md|claude_.*\.json)$' } |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$diasRetencaoLogs) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "sincronizacao_$timestamp.log"

function Escrever-Log([string]$mensagem) {
  $linha = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $mensagem"
  Write-Host $linha
  Add-Content -Path $logFile -Value $linha -Encoding utf8
}

function Enviar-Notificacao([string]$titulo, [string]$mensagem) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null

    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $textNodes = $template.GetElementsByTagName("text")
    $textNodes.Item(0).AppendChild($template.CreateTextNode($titulo)) > $null
    $textNodes.Item(1).AppendChild($template.CreateTextNode($mensagem)) > $null

    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PowerShell")
    $notifier.Show($toast)
  } catch {
    Escrever-Log "Aviso: falha ao disparar notificacao toast: $($_.Exception.Message)"
  }
}

function Acionar-DiagnosticoClaude([array]$dominiosComFalha, [string]$logFile) {
  $timestampClaude = Get-Date -Format "yyyyMMdd_HHmmss"
  $relatorio = Join-Path $logDir "diagnostico_$timestampClaude.md"
  $saidaClaudeJson = Join-Path $logDir "claude_$timestampClaude.json"

  $nomesFalha = ($dominiosComFalha -join ", ")

  # So diagnostico, sem correcao: esta tarefa roda a partir do clone principal, que precisa
  # ficar limpo na branch padrao (a proxima execucao agendada usaria um codigo nao revisado).
  # A correcao segue o fluxo normal (branch agentic_*, worktree, PR), feita por um humano ou
  # por um agente interativo. Por isso o Claude nao recebe nenhuma ferramenta de escrita e o
  # relatorio e gravado por este script, a partir da resposta final dele.
  $prompt = @"
Uma execucao agendada e nao-interativa (Windows Task Scheduler) da ferramenta de
sincronizacao PROD -> HML deste projeto falhou nos seguintes dominios: $nomesFalha.

O log completo desta execucao esta em: $logFile

Leia o log e o codigo, e identifique a causa raiz da falha. Regras obrigatorias:
- NAO altere nenhum arquivo: esta e uma investigacao somente leitura. A correcao
  sera feita depois, fora desta execucao.
- NUNCA leia .env, .env.*, cypress/temp/tokens.json ou qualquer arquivo de credenciais.
- Respeite a regra de que producao (prod/keycloakProd) e somente leitura.

Sua resposta final sera gravada como relatorio em markdown. Responda somente com o
relatorio, curto, com as secoes: Diagnostico (causa raiz, com o trecho do log que a
comprova), Alcance (dominios afetados e por que os demais passaram), Correcao proposta
(arquivos e mudanca sugerida, sem aplicar) e Como validar.
"@

  Escrever-Log "Acionando Claude Code para diagnostico automatico, somente leitura (dominios: $nomesFalha)..."

  $claudeArgs = @(
    "-p", $prompt,
    "--permission-prompts", "none",
    "--allowedTools", "Read,Grep,Glob,Bash(git status),Bash(git diff *),Bash(git log *)",
    "--disallowedTools", "Edit,Write,NotebookEdit,Bash(git commit *),Bash(git push *),Bash(git reset *),Bash(git checkout *),Bash(git clean *),Bash(git branch -D *)",
    "--output-format", "json",
    "--max-budget-usd", "2"
  )

  try {
    $resultadoBruto = & claude @claudeArgs 2>&1
    $resultadoBruto | Out-File -FilePath $saidaClaudeJson -Encoding utf8
    Escrever-Log "Saida do Claude Code salva em: $saidaClaudeJson"
    try {
      $resultadoJson = ($resultadoBruto | Where-Object { $_ -is [string] }) -join "`n" | ConvertFrom-Json
      if ([string]::IsNullOrWhiteSpace($resultadoJson.result)) { throw "campo 'result' vazio" }
      $resultadoJson.result | Out-File -FilePath $relatorio -Encoding utf8
      Escrever-Log "Relatorio de diagnostico gerado em: $relatorio"
    } catch {
      Escrever-Log "Aviso: nao consegui extrair o relatorio da saida do Claude Code ($($_.Exception.Message)). Veja $saidaClaudeJson"
    }
  } catch {
    Escrever-Log "Erro ao acionar Claude Code para diagnostico: $($_.Exception.Message)"
  }
}

$dominios = @(
  @{ Nome = "Produtos"; Spec = "cypress/e2e/features/gerenciamentoDeProdutos.feature" },
  @{ Nome = "Esteiras"; Spec = "cypress/e2e/features/gerenciamentoDeEsteiras.feature" },
  @{ Nome = "Vinculos"; Spec = "cypress/e2e/features/gerenciamentoDosVinculos.feature" },
  @{ Nome = "GruposPermissoes"; Spec = "cypress/e2e/features/gerenciamentoDeGruposPermissoes.feature" }
)

Escrever-Log "===== Inicio da sincronizacao diaria ====="

# O binario do Cypress vive fora do repositorio (%LOCALAPPDATA%\Cypress\Cache\<versao>) e ja
# sumiu/ficou incompleto antes, derrubando todos os dominios com "Cypress executable not found".
# Confere antes e tenta reinstalar a versao fixada no package.json; se ainda assim nao rodar, e
# problema de ambiente (nao de codigo), entao nem aciona o diagnostico automatico do Claude.
& npx cypress verify 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding utf8 }
if ($LASTEXITCODE -ne 0) {
  Escrever-Log "Binario do Cypress ausente ou invalido; tentando 'npx cypress install --force'..."
  & npx cypress install --force 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding utf8 }
  & npx cypress verify 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding utf8 }
  if ($LASTEXITCODE -ne 0) {
    Escrever-Log "ERRO: binario do Cypress continua invalido apos reinstalar. Problema de ambiente da maquina, nao de codigo."
    Escrever-Log "Reinstale manualmente (npx cypress install) com o mesmo usuario da tarefa agendada."
    Enviar-Notificacao "Sincronizacao PROD -> HML nao rodou" "Binario do Cypress invalido nesta maquina. Veja $logFile"
    Escrever-Log "===== Fim da sincronizacao diaria ====="
    exit 1
  }
  Escrever-Log "Binario do Cypress reinstalado e verificado."
}

$resultados = @()

foreach ($dominio in $dominios) {
  Escrever-Log "--- Iniciando $($dominio.Nome) ---"

  $saida = & npx cypress run --spec $dominio.Spec 2>&1
  $codigoSaida = $LASTEXITCODE
  $saida | ForEach-Object { Add-Content -Path $logFile -Value $_ -Encoding utf8 }

  if ($codigoSaida -eq 0) {
    Escrever-Log "--- $($dominio.Nome) OK ---"
    $resultados += [pscustomobject]@{ Dominio = $dominio.Nome; Status = "OK" }
  } else {
    Escrever-Log "--- $($dominio.Nome) FALHOU (codigo $codigoSaida) ---"
    $resultados += [pscustomobject]@{ Dominio = $dominio.Nome; Status = "FALHOU" }
  }
}

Escrever-Log "===== Resumo ====="
foreach ($r in $resultados) {
  Escrever-Log ("{0}: {1}" -f $r.Dominio, $r.Status)
}

$falhas = $resultados | Where-Object { $_.Status -eq "FALHOU" }

if ($falhas.Count -gt 0) {
  $nomesFalha = ($falhas | ForEach-Object { $_.Dominio }) -join ", "

  Enviar-Notificacao "Sincronizacao PROD -> HML falhou" "Dominio(s) com erro: $nomesFalha. Acionando diagnostico automatico..."

  Acionar-DiagnosticoClaude -dominiosComFalha ($falhas | ForEach-Object { $_.Dominio }) -logFile $logFile

  Enviar-Notificacao "Diagnostico automatico concluido" "Revise o log e o relatorio em cypress\output\logs quando puder."
}

Escrever-Log "===== Fim da sincronizacao diaria ====="
Escrever-Log "Log completo em: $logFile"

if ($falhas.Count -gt 0) {
  exit 1
} else {
  exit 0
}
