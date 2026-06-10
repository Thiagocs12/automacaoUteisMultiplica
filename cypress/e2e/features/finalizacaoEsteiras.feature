# language: pt

@atual
Funcionalidade: Finalizar as esteiras de poc da larca

  Como um engenheiro de automação
  Desejo avançar as etapas de uma esteira até o final
  Para que possa fazer isso em lote quando necessário

  Contexto: Sincronização de Produtos
    Dado que possuo acesso aos ambientes necessarios

  Esquema do Cenário: Avançar esteira até o fim
    Dado que possuo uma lista de ids de esteiras que preciso finalizar de esteira de "<tipoEsteira>"
    Quando realizo o avanco da etapa "<etapa>"
    Então realizo as seguintes "<validacoes>"

    Exemplos:
      | tipoEsteira | etapa              | validacoes         |
      #| poc         | Distribuição       | Distribuição       |
      #| poc         | Analise de Crédito | Analise de Crédito |
      | poc         | Comitê de Crédito  | Comitê de Crédito  |

  Esquema do Cenário: Verificar se as esteiras foram finalizadas
    Dado que possuo uma lista de ids de esteiras que preciso finalizar de esteira de "<tipoEsteira>"
    Quando consulto o status das esteiras
    Então Todas devem estar finalizadas
    
    Exemplos:
      | tipoEsteira |
      | poc         |
