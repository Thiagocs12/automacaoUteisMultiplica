[README.md](https://github.com/user-attachments/files/30964042/README.md)
# Sincronização de Dados — Cypress + Cucumber

Projeto de automação desenvolvido com **Cypress**, **Cucumber/BDD**, **Node.js**, **SQL Server** e APIs REST para sincronizar dados de **Produção (PROD)** para **Homologação (HML)**.

O projeto foi criado para automatizar a preparação de dados de homologação, identificando dependências entre entidades, localizando os respectivos registros em HML e realizando a criação ou atualização dos dados necessários.

> **Atenção:** este projeto manipula dados de ambientes de Produção e Homologação. Utilize credenciais apropriadas e execute os cenários de sincronização somente com autorização para alterar o ambiente de destino.

---

## 📌 Objetivo

O principal objetivo é evitar a cópia manual de grandes conjuntos de dados entre ambientes.

A automação executa, de forma ordenada:

1. Consulta os dados atuais em Produção.
2. Salva os registros localizados em arquivos JSON.
3. Identifica as dependências de cada entidade.
4. Preserva os IDs originais de Produção.
5. Localiza os correspondentes em Homologação.
6. Substitui referências de IDs de Produção pelos IDs de HML.
7. Cria registros que não existem em HML.
8. Atualiza registros já existentes.
9. Mantém um estoque de correspondência entre IDs de Produção e Homologação.
10. Processa as entidades respeitando níveis de dependência.
11. Gera logs para determinadas categorias de sincronização.

A arquitetura permite que entidades sejam configuradas por arquivos de mapeamento, evitando que a regra de cada API ou tabela fique espalhada pelo código.

---

## 🏗️ Arquitetura

```text
Produção
   │
   ├── API REST
   │      └── Produtos
   │      └── Esteiras
   │      └── Demais entidades
   │
   └── SQL Server
          └── Vínculos MOP
          └── Vínculos POC
          └── Parâmetros
          │
          ▼
     Cypress / Cucumber
          │
          ├── Consulta
          ├── Persistência JSON
          ├── Descoberta de dependências
          ├── Mapeamento PROD → HML
          ├── Substituição de IDs
          ├── Criação
          └── Atualização
          │
          ▼
     Homologação
```

---

# 🧰 Tecnologias

| Tecnologia | Utilização |
|---|---|
| [Cypress](https://www.cypress.io/) | Motor de automação |
| [Cucumber](https://cucumber.io/) | BDD e definição dos cenários |
| `@badeball/cypress-cucumber-preprocessor` | Integração Cucumber + Cypress |
| `esbuild` | Preprocessamento dos arquivos |
| Node.js | Runtime do projeto |
| `mssql` | Conexão com SQL Server |
| `dotenv` | Carregamento das variáveis de ambiente |
| JavaScript | Linguagem principal |
| JSON | Armazenamento intermediário dos dados |

Versão do Cypress identificada no projeto:

```text
15.14.2
```

---

# 📁 Estrutura do projeto

```text
.
├── cypress/
│   ├── e2e/
│   │   └── features/
│   │       ├── gerenciamentoDeEsteiras.feature
│   │       ├── gerenciamentoDeProdutos.feature
│   │       └── gerenciamentoDosVinculos.feature
│   │
│   ├── fixtures/
│   │
│   ├── hooks/
│   │
│   ├── logs/
│   │
│   ├── objects/
│   │
│   ├── output/
│   │   ├── Esteiras/
│   │   ├── Produtos/
│   │   ├── Vinculos/
│   │   └── estoqueIds.json
│   │
│   ├── refs/
│   │
│   ├── support/
│   │   ├── step_definitions/
│   │   │   ├── gerenciamentoDeEsteiras.js
│   │   │   ├── gerenciamentoDeProdutos.js
│   │   │   └── gerenciamentoDosVinculos.js
│   │   │
│   │   ├── db/
│   │   │   └── dbClient.js
│   │   │
│   │   ├── tasks/
│   │   │   └── dbTasks.js
│   │   │
│   │   ├── apiCommands.js
│   │   ├── commands.js
│   │   ├── e2e.js
│   │   └── utils.js
│   │
│   ├── temp/
│   │
│   └── utils/
│       ├── mapeamentoEsteiras.js
│       ├── mapeamentoProdutos.js
│       └── mapeamentoVinculos.js
│
├── .env.example
├── .gitignore
├── cypress.config.js
└── package.json
```

---

# 🔄 Fluxo geral de sincronização

A sincronização é baseada em **mapeamentos de entidades**.

Cada entidade possui informações como:

- endpoint;
- endpoint de pesquisa;
- endpoint de pesquisa por ID;
- endpoint de listagem;
- arquivo JSON de origem;
- nível de dependência;
- campo utilizado para localizar o registro;
- dependências;
- método HTTP de atualização;
- campos que devem ser ignorados;
- campos que precisam ser tratados como listas;
- regras de criação e atualização.

Exemplo conceitual:

```javascript
PRODUTO: {
  url: 'mc-cadastro-ms/api/v1/produto',
  urlBusca: 'mc-cadastro-ms/api/v1/produto/search/0?descricao=',
  urlBuscaId: 'mc-cadastro-ms/api/v1/produto/',
  urlListAll: 'mc-cadastro-ms/api/v1/produto/listAll',
  nomeArquivo: 'Produtos/1 - Produtos.json',
  nivelDependencia: 3,
  dependencia: [...]
}
```

Essa abordagem permite adicionar ou alterar entidades principalmente através do arquivo de mapeamento, mantendo a lógica de processamento centralizada.

---

# 🧩 Domínios sincronizados

## 1. Produtos

O arquivo:

```text
cypress/utils/mapeamentoProdutos.js
```

concentra o mapeamento das entidades relacionadas ao cadastro de produtos.

Entre as entidades configuradas estão:

- Produto
- Classificação de Produto
- Grupo de Produto
- Subproduto
- Foco de Negócio
- Tipo de Produto
- Produto Indexador
- Tipo de Recebimento
- Segmento Tarifador
- Grupo de Produto/Risco
- Produto Kit
- Produto Garantia
- Produto Tarifa
- Categoria de Garantia
- Tipo de Garantia
- Nível de Garantia
- Classificação de Garantia
- Grupo de Garantia
- Tarifas
- Eventos
- Tipos de Evento
- Situações
- Tipo de Situação
- Kits de Documentos
- além de entidades auxiliares utilizadas pelo fluxo.

Os dados são armazenados em:

```text
cypress/output/Produtos/
```

---

## 2. Esteiras

O arquivo:

```text
cypress/utils/mapeamentoEsteiras.js
```

concentra as entidades relacionadas ao gerenciamento de esteiras.

As principais categorias configuradas são:

- Esteiras
- Esteiras vinculadas
- Tipos de esteira
- Etapas
- Subetapas
- Ações
- Motivos de retorno
- Operadores
- Observadores
- Gestores
- Validador de esteira

Os dados são armazenados em:

```text
cypress/output/Esteiras/
```

### Níveis de dependência

As esteiras possuem uma cadeia de dependências e o cenário executa os níveis de forma explícita:

```text
Nível 1
   ↓
Nível 2
   ↓
Nível 3
   ↓
Nível 4
   ↓
Nível 5
```

Isso evita tentar criar uma entidade antes que os registros dos quais ela depende já tenham sido sincronizados.

---

## 3. Vínculos

O arquivo:

```text
cypress/utils/mapeamentoVinculos.js
```

concentra entidades que são obtidas diretamente do banco de dados.

São configurados:

- MOP
- POC
- Tipo de Prospect
- Tipo de Proposta
- Parâmetros de Etapas
- Parâmetros de Esteiras
- Parâmetros de Tipo de Esteiras

Os dados são armazenados em:

```text
cypress/output/Vinculos/
```

### Principais tabelas utilizadas

```text
MC_MOP_VINCULO_ESTEIRA
MC_CAD_VINCULO_ESTEIRA
MC_CAD_TIPO_PROSPECT
MC_CAD_TIPO_PROPOSTA
MC_CAD_PARAMETRO
```

---

# 🗃️ Estoque de IDs

Um dos componentes mais importantes da automação é o arquivo:

```text
cypress/output/estoqueIds.json
```

Ele mantém a relação entre IDs de Produção e IDs de Homologação.

Conceitualmente:

```text
PROD
  ID 123
    ↓
HML
  ID 456
```

Essa relação é necessária porque os IDs normalmente não são iguais entre os ambientes.

O estoque permite que, ao processar uma entidade dependente, uma referência como:

```json
{
  "produto": {
    "id": 123
  }
}
```

possa ser convertida para:

```json
{
  "produto": {
    "id": 456
  }
}
```

antes do envio para HML.

---

# 🔗 Tratamento de dependências

As dependências são declaradas no próprio mapeamento.

Exemplo:

```javascript
dependencia: [
  {
    idSubstituido: 'subProduto.id',
    arquivoDependencia: 'Produtos/33 - SubProdutos.json'
  },
  {
    idSubstituido: 'classificacaoProduto.id',
    arquivoDependencia: 'Produtos/2 - Classificacoes.json'
  },
  {
    idSubstituido: 'grupoProduto.id',
    arquivoDependencia: 'Produtos/3 - GrupoProdutos.json'
  }
]
```

O sistema utiliza essas informações para:

1. encontrar os IDs de Produção;
2. localizar os registros correspondentes;
3. consultar o estoque PROD → HML;
4. substituir as referências;
5. processar a entidade no nível correto.

A implementação também suporta caminhos aninhados e estruturas com arrays, por exemplo:

```text
modeloEtapas.modeloEtapa.id
modeloEtapas.modeloEtapa.condicoes.irIdEtapa
grupoProduto.id
```

---

# 🧹 Tratamento de payloads

O projeto possui utilitários para tratar os objetos antes da sincronização.

Entre os tratamentos existentes:

### Remoção de campos ignorados

Permite remover campos que não devem ser enviados para o ambiente destino.

Exemplo:

```text
modeloEtapas.modeloEtapa.usuario
modeloEtapas.modeloEtapa.status
modeloEtapas.modeloEtapa.excluido
```

### Tratamento de campos `.old`

O projeto possui funções para:

- remover campos terminados em `.old`;
- restaurar valores originais;
- tratar objetos recursivamente.

### Listas e arrays

O processamento suporta caminhos contendo arrays em qualquer nível.

Exemplo:

```text
modeloEtapas.modeloEtapa.id
```

---

# 🌐 Integração com APIs

As requisições HTTP são centralizadas em:

```text
cypress/support/apiCommands.js
```

Os comandos principais são:

```text
executarRequest
executarRequest2
```

O comando de ambiente permite trabalhar com:

```text
prod
hml
keycloak
bhml
```

As informações de cada ambiente são carregadas através do `.env`.

---

# 🔐 Autenticação

A autenticação utiliza o fluxo do **Keycloak**.

O projeto possui mecanismos para:

1. verificar se o token atual ainda é válido;
2. executar uma requisição de teste;
3. realizar login pela interface quando necessário;
4. interceptar a requisição de token;
5. armazenar o `access_token`;
6. reutilizar o token nas chamadas seguintes.

Os tokens temporários são armazenados em:

```text
cypress/temp/tokens.json
```

Esse diretório está incluído no `.gitignore`.

### Ambientes de autenticação

São suportados:

```text
PROD
HML
KEYCLOAK
BHML
```

---

# 🗄️ Banco de dados

A conexão com SQL Server é realizada utilizando:

```text
mssql
```

A implementação está em:

```text
cypress/support/db/dbClient.js
```

São mantidos pools independentes para:

```text
prod
hml
```

A conexão possui:

- pool máximo de 5 conexões;
- mínimo de 0;
- timeout de conexão ociosa de 30 segundos;
- `trustServerCertificate: true`;
- criptografia TLS desativada conforme configuração atual do projeto.

> Revise essas opções antes de utilizar o projeto em ambientes com requisitos de segurança diferentes.

As tasks de banco estão em:

```text
cypress/support/tasks/dbTasks.js
```

Comandos disponíveis:

```text
queryProd
queryHml
closeDbConnections
```

No encerramento da execução, os pools são fechados automaticamente.

---

# 🧪 Cenários BDD

Os cenários estão em:

```text
cypress/e2e/features/
```

## Sincronização de Produtos

Arquivo:

```text
gerenciamentoDeProdutos.feature
```

Tag:

```text
@produto
```

Fluxo:

```text
Consultar Produtos PROD
        ↓
Validar dados
        ↓
Pesquisar dependências
        ↓
Processar nível 1
        ↓
Processar nível 2
        ↓
Processar nível 3
        ↓
Processar nível 4
        ↓
Processar nível 5
        ↓
Atualizar estoque de IDs
```

---

## Sincronização de Esteiras

Arquivo:

```text
gerenciamentoDeEsteiras.feature
```

Tag:

```text
@esteira
```

Fluxo:

```text
Consultar Esteiras PROD
        ↓
Consultar Validador
        ↓
Validar dados
        ↓
Pesquisar dependências
        ↓
Processar níveis 1 → 5
        ↓
Atualizar estoque de IDs
```

---

## Sincronização de Vínculos

Arquivo:

```text
gerenciamentoDosVinculos.feature
```

Tag:

```text
@vinculos
```

Fluxo:

```text
Consultar banco PROD
        ↓
MOP
POC
Parâmetros
        ↓
Pesquisar dependências
        ↓
Processar níveis 1 → 3
        ↓
Atualizar estoque de IDs
```

---

# ⚙️ Configuração

## 1. Instalar dependências

Com Node.js instalado:

```bash
npm install
```

O projeto utiliza scripts:

```bash
npm run cypress:open
npm run cypress:run
```

---

## 2. Configurar variáveis de ambiente

Copie:

```text
.env.example
```

para:

```text
.env
```

Preencha as credenciais e URLs necessárias.

Estrutura esperada:

```env
# API PRODUÇÃO
PROD_API_USERNAME=
PROD_API_PASSWORD=
PROD_API_BASE_URL=
PROD_API_LOGIN_URL=

# API HOMOLOGAÇÃO
HML_API_USERNAME=
HML_API_PASSWORD=
HML_API_BASE_URL=
HML_API_LOGIN_URL=

# KEYCLOAK
HML_KEYCLOAK_BASE_URL=
HML_KEYCLOAK_LOGIN_URL=
HML_KEYCLOAK_USERNAME=
HML_KEYCLOAK_PASSWORD=

# BANKING HML
BHML_API_BASE_URL=
BHML_API_LOGIN_URL=
BHML_API_USERNAME=
BHML_API_PASSWORD=

# BANCO HOMOLOGAÇÃO
HOMOLOG_DB_HOST=
HOMOLOG_DB_USER=
HOMOLOG_DB_PASS=
HOMOLOG_DB_NAME=
HOMOLOG_DB_PORT=

# BANCO PRODUÇÃO
PROD_DB_HOST=
PROD_DB_USER=
PROD_DB_PASS=
PROD_DB_NAME=
PROD_DB_PORT=
```

### Segurança

Nunca versionar:

```text
.env
cypress/temp/tokens.json
```

Credenciais não devem ser inseridas diretamente nos arquivos JavaScript.

---

# ▶️ Execução

## Abrir o Cypress

```bash
npm run cypress:open
```

Na interface do Cypress, selecione o cenário `.feature` desejado.

---

## Executar todos os testes

```bash
npm run cypress:run
```

Como o `cypress.config.js` utiliza:

```javascript
specPattern: "**/*.feature"
```

os arquivos `.feature` são tratados como especificações executáveis.

---

## Executar por tag

Para executar somente uma categoria, utilize o suporte de tags do preprocessor/configuração do ambiente de execução.

Tags disponíveis no projeto:

```text
@produto
@esteira
@vinculos
```

Exemplo conceitual:

```text
@produto
```

executa o fluxo de sincronização de produtos.

---

# 🧱 Comandos Cypress customizados

Os principais comandos implementados em `cypress/support/commands.js` são:

### Ambiente e arquivos

```text
definirAmbiente
lerJsonDeOutput
```

### Dependências

```text
pesquisarDependenciasLigacao
atualizarIdsDeDependencias
pesquisarItensPorNivel
```

### Criação e atualização

```text
criarItensInexistentesPorNivel
atualizarItensExistentesPorNivel
processarEntidadesPorNivel
```

### IDs

```text
voltarIdsOriginais
atualizarEstoqueIds
preencherIdsHmlPeloEstoque
```

### Banco

```text
executarQuery
pesquisarDependenciasBanco
pesquisarVinculoEsteiraHml
```

### Vínculos

```text
processarVinculosPorNivel
atualizarItensHml
inserirItensHml
```

### API

```text
executarRequest
executarRequest2
```

### Autenticação

```text
verificarTokens
loginUi
```

---

# 📦 Arquivos de saída

A execução utiliza arquivos JSON como armazenamento intermediário.

## Esteiras

```text
cypress/output/Esteiras/
├── 1 - esteiras.json
├── 2 - esteirasVinculadas.json
├── 3 - tipoEsteiras.json
├── 4 - etapas.json
├── 5 - subetapas.json
├── 6 - acoes.json
├── 7 - motivosRetorno.json
├── 8 - gruposKeycloak.json
└── 9 - esteiraValidador.json
```

## Produtos

```text
cypress/output/Produtos/
├── 1 - Produtos.json
├── 2 - Classificacoes.json
├── 3 - GrupoProdutos.json
├── 4 - FocosNegocio.json
├── 5 - TiposProduto.json
├── 6 - ProdutosIndexadores.json
├── 7 - TiposRecebimento.json
├── 8 - SegmentosTarifadores.json
├── 9 - GruposProdutoRisco.json
├── 10 - ProdutosKit.json
├── 11 - ProdutosGarantia.json
├── 12 - ProdutosTarifa.json
├── 13 - GarantiasCategorias.json
├── 14 - TiposGarantia.json
├── 15 - NiveisGarantia.json
├── 16 - ClassificacoesGarantia.json
├── 17 - GruposGarantia.json
├── 18 - Tarifas.json
├── 19 - Eventos.json
├── 20 - TiposEvento.json
├── 21 - Situacoes.json
├── 22 - TipoSituacao.json
├── 23 - KitsDocumentos.json
└── 33 - SubProdutos.json
```

## Vínculos

```text
cypress/output/Vinculos/
├── 1 - mop.json
├── 2 - poc.json
├── 3 - tipoProspect.json
├── 4 - tipoProposta.json
├── 5 - parametroEtapas.json
├── 6 - parametroEsteiras.json
└── 7 - parametroTipoEsteiras.json
```

Além desses arquivos:

```text
cypress/output/estoqueIds.json
```

mantém o relacionamento entre os ambientes.

---

# 🧠 Estratégia de sincronização

A sincronização pode ser resumida pelo seguinte algoritmo:

```text
┌──────────────────────────┐
│ 1. Ler configuração      │
│    da entidade           │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 2. Buscar dados em PROD  │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 3. Salvar JSON de origem │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 4. Identificar           │
│    dependências          │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 5. Localizar dependências│
│    em HML                │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 6. Obter ID HML          │
│    pelo estoque          │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ 7. Substituir referências│
│    PROD → HML             │
└────────────┬─────────────┘
             ↓
       ┌─────┴─────┐
       ↓           ↓
   Existe?       Não existe
       ↓           ↓
    UPDATE       INSERT
       └─────┬─────┘
             ↓
┌──────────────────────────┐
│ 8. Registrar ID PROD/HML │
│    no estoque             │
└──────────────────────────┘
```

---

# 🔁 Atualização x Inserção

Para cada entidade processada, o projeto pode identificar se o registro já existe no ambiente de destino.

### Registro existente

É realizado o fluxo de atualização configurado para a entidade.

Exemplo:

```text
PROD → registro encontrado
       ↓
HML → registro correspondente encontrado
       ↓
UPDATE / PATCH
```

### Registro inexistente

O projeto utiliza o fluxo de criação:

```text
PROD → registro encontrado
       ↓
HML → registro não encontrado
       ↓
POST / INSERT
       ↓
Novo ID HML
       ↓
Atualiza estoque PROD → HML
```

---

# 🛠️ Adicionando uma nova entidade

A estratégia recomendada é adicionar a entidade ao respectivo arquivo de mapeamento.

Exemplo:

```javascript
NOVA_ENTIDADE: {
  url: 'api/nova-entidade',
  urlBusca: 'api/nova-entidade/search?descricao=',
  urlBuscaId: 'api/nova-entidade/',
  urlListAll: 'api/nova-entidade/listAll',
  nomeArquivo: 'Produtos/XX - NovaEntidade.json',
  nivelDependencia: 2,
  campoDescricao: 'descricao',
  nomeArquivoReferencia: 'Produtos/1 - Produtos.json',
  campoBusca: 'novaEntidade.id',
  dependencia: [
    {
      idSubstituido: 'outraEntidade.id',
      arquivoDependencia: 'Produtos/YY - OutraEntidade.json'
    }
  ]
}
```

A configuração deve refletir o contrato real da API.

Antes de adicionar uma entidade, valide:

- endpoint de listagem;
- endpoint de pesquisa;
- endpoint de busca por ID;
- método de criação;
- método de atualização;
- chave utilizada para identificar o registro;
- campos obrigatórios;
- relacionamentos;
- dependências;
- campos que não podem ser enviados;
- tratamento de arrays;
- necessidade de persistir o novo ID no estoque.

---

# 🧪 Boas práticas

## Nunca executar diretamente em Produção sem validação

Embora a origem dos dados seja Produção, o objetivo do fluxo é copiar:

```text
PROD → HML
```

e não modificar Produção.

Ainda assim, todas as consultas e operações devem ser revisadas antes de execução.

---

## Validar dependências antes de criar entidades

Se uma entidade depende de outra:

```text
A → B → C
```

a ordem de sincronização deve respeitar:

```text
C → B → A
```

quando C for a dependência necessária para B e A.

Os níveis existentes nos mapeamentos são justamente utilizados para garantir essa ordem.

---

## Não alterar manualmente o estoque sem necessidade

O arquivo:

```text
cypress/output/estoqueIds.json
```

é parte da lógica de sincronização.

Alterações manuais podem fazer com que referências sejam direcionadas para IDs incorretos.

---

# 🐛 Tratamento de erros

O `e2e.js` possui uma lista de erros de aplicação/rede que são tratados como exceções conhecidas do ambiente:

```text
Network Error
HTTP 40x/50x específicos
ResizeObserver
alguns erros relacionados a content undefined
```

Esses erros são filtrados pelo listener:

```javascript
Cypress.on('uncaught:exception', ...)
```

Isso evita que falhas conhecidas e não relacionadas diretamente ao objetivo da automação interrompam determinados cenários.

> Recomenda-se revisar periodicamente essa lista para evitar mascarar regressões reais.

---

# 📊 Logs

Determinadas entidades possuem:

```javascript
geraLog: true
```

e:

```javascript
chaveLog
```

Isso é utilizado principalmente nos fluxos de vínculos para permitir rastreabilidade da sincronização.

Exemplos:

```text
MOP
POC
PARAMETRO_ETAPAS
PARAMETRO_ESTEIRAS
PARAMETRO_TIPO_ESTEIRAS
```

---

# 🔒 Segurança

O projeto trabalha com:

- credenciais de API;
- credenciais de banco;
- credenciais do Keycloak;
- tokens de autenticação;
- acesso a dados de Produção.

Por isso:

### Nunca versionar

```text
.env
tokens.json
senhas
access tokens
credenciais de banco
arquivos contendo dados sensíveis
```

O `.gitignore` atual já contempla:

```text
node_modules/
cypress/temp/
.env
package-lock.json
```

Antes de publicar o projeto, também é recomendável revisar se os arquivos em `cypress/output/`, `cypress/logs/` e demais diretórios não contêm informações sensíveis.

---

# 🚨 Pontos de atenção

## `package-lock.json`

O projeto atualmente ignora:

```text
package-lock.json
```

Isso significa que a instalação pode resolver versões diferentes das dependências ao longo do tempo.

Para maior reprodutibilidade em CI/CD, recomenda-se versionar o lockfile e utilizar:

```bash
npm ci
```

quando o processo de build estiver estabilizado.

---

## Dependências com `latest`

O `package.json` utiliza `latest` para algumas dependências:

```text
@badeball/cypress-cucumber-preprocessor
@bahmutov/cypress-esbuild-preprocessor
```

Para pipelines de CI/CD mais previsíveis, é recomendável fixar versões.

---

# 🔍 Diagnóstico de problemas

## Token expirado

Sintoma:

```text
401 Unauthorized
```

Solução:

1. Verifique as credenciais no `.env`.
2. Execute novamente o fluxo de autenticação.
3. Verifique `cypress/temp/tokens.json`.
4. Caso necessário, remova o arquivo temporário e execute novamente.

---

## Registro não encontrado em HML

Verifique:

1. campo usado como identificador;
2. `campoBusca`;
3. `campoDescricao`;
4. dependências;
5. estoque `estoqueIds.json`;
6. se o registro realmente existe no ambiente destino.

---

## ID de dependência incorreto

Verifique:

```text
dependencia
arquivoDependencia
idSubstituido
```

e confirme se o registro correspondente já foi processado em HML.

---

## Erro de banco

Verifique:

```text
HOMOLOG_DB_HOST
HOMOLOG_DB_USER
HOMOLOG_DB_PASS
HOMOLOG_DB_NAME
HOMOLOG_DB_PORT

PROD_DB_HOST
PROD_DB_USER
PROD_DB_PASS
PROD_DB_NAME
PROD_DB_PORT
```

Também confirme conectividade com o SQL Server.

---

# 🧭 Fluxo recomendado para manutenção

Ao modificar uma entidade:

```text
1. Identificar a entidade
        ↓
2. Localizar seu mapeamento
        ↓
3. Identificar dependências
        ↓
4. Validar endpoint/tabela
        ↓
5. Validar chave de identificação
        ↓
6. Validar criação
        ↓
7. Validar atualização
        ↓
8. Executar em HML
        ↓
9. Conferir estoque PROD → HML
        ↓
10. Executar cenário BDD
        ↓
11. Validar resultado
```

---

# 📋 Checklist de execução

Antes da execução:

- [ ] `.env` configurado
- [ ] Credenciais válidas
- [ ] Acesso à API de Produção
- [ ] Acesso à API de Homologação
- [ ] Acesso ao banco de Produção
- [ ] Acesso ao banco de Homologação
- [ ] Keycloak acessível
- [ ] Dados de origem validados
- [ ] Dependências revisadas
- [ ] Backup/segurança do ambiente de destino validado

Após a execução:

- [ ] Cenário finalizado sem erro
- [ ] Dados criados/atualizados em HML
- [ ] IDs PROD → HML armazenados
- [ ] Dependências resolvidas
- [ ] Logs revisados
- [ ] Dados sensíveis não foram expostos

---

# 📚 Referência rápida

| Necessidade | Arquivo |
|---|---|
| Cenários BDD | `cypress/e2e/features/` |
| Steps de produtos | `cypress/support/step_definitions/gerenciamentoDeProdutos.js` |
| Steps de esteiras | `cypress/support/step_definitions/gerenciamentoDeEsteiras.js` |
| Steps de vínculos | `cypress/support/step_definitions/gerenciamentoDosVinculos.js` |
| Commands principais | `cypress/support/commands.js` |
| Requests HTTP | `cypress/support/apiCommands.js` |
| Autenticação | `cypress/support/utils.js` |
| Cliente SQL Server | `cypress/support/db/dbClient.js` |
| Tasks de banco | `cypress/support/tasks/dbTasks.js` |
| Mapeamento de produtos | `cypress/utils/mapeamentoProdutos.js` |
| Mapeamento de esteiras | `cypress/utils/mapeamentoEsteiras.js` |
| Mapeamento de vínculos | `cypress/utils/mapeamentoVinculos.js` |
| Configuração Cypress | `cypress.config.js` |
| Variáveis de ambiente | `.env` / `.env.example` |
| Dados intermediários | `cypress/output/` |
| Estoque PROD → HML | `cypress/output/estoqueIds.json` |
| Tokens temporários | `cypress/temp/tokens.json` |

---

# 👥 Manutenção

Ao evoluir o projeto, priorize:

- configuração por mapeamento;
- reutilização dos comandos existentes;
- processamento por nível de dependência;
- separação entre API, banco e regras de sincronização;
- não duplicação de lógica;
- tratamento explícito de IDs;
- logs para operações críticas;
- proteção de credenciais.

A estrutura atual permite expandir o número de entidades sem precisar criar um fluxo completamente novo para cada uma.

---

# 📄 Licença

O `package.json` atualmente declara:

```text
ISC
```

Consulte a política do repositório antes de alterar a licença ou distribuir o projeto.
