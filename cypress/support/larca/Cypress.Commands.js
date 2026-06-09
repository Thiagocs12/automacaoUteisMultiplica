Cypress.Commands.add('pesquisarItensPorNivel', (nivel) => {
  for (const chaveEntidade in MAPEAMENTOS_APIS) {
    if (!Object.prototype.hasOwnProperty.call(MAPEAMENTOS_APIS, chaveEntidade)) continue;

    const entidade = MAPEAMENTOS_APIS[chaveEntidade];
    const nomeArquivo = entidade.nomeArquivo;
    const campoDescricao = entidade.campoDescricao || 'descricao';
    const contentBusca = entidade.contentBusca || 'falseId';

    if (
      chaveEntidade === 'GRUPOS_KEYCLOAK' ||
      entidade.nivelDependencia !== nivel
    ) continue;

    const salvarId = (id, dado) => {
      if (id === null) {
        cy.log(`[LOG] - Registro "${JSON.stringify(dado)}" não encontrado exatamente no ambiente, setando null`);
      }

      cy.setIdHmlPorDescricao(
        id,
        dado,
        nomeArquivo,
        Array.isArray(contentBusca) ? contentBusca : campoDescricao
      );
    };

    if (Array.isArray(contentBusca)) {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => {
        for (const dado of dadosDoArquivo) {
          if (dado.idHml !== null && dado.idHml !== undefined) continue; // ← já possui idHml, ignora

          const valorBusca = obterValor(dado, contentBusca[0]);

          cy.executarRequest('hml', `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`).then((resposta) => {
            const content = Array.isArray(resposta.body)
              ? resposta.body
              : resposta.body?.content || [];

            if (!content.length) {
              salvarId(null, {
                [contentBusca[0]]: obterValor(dado, contentBusca[0]),
                [contentBusca[1]]: obterValor(dado, contentBusca[1]),
              });
              return;
            }

            let encontrou = false;

            cy.wrap(content).each((item) => {
              if (encontrou) return;

              console.log(`urlBuscaId: ${entidade.urlBuscaId}${item.id}`)
              cy.executarRequest('hml', `${entidade.urlBuscaId}${item.id}`).then((resposta2) => {
                if (encontrou) return;

                const itens = Array.isArray(resposta2.body) ? resposta2.body : [resposta2.body];

                console.log(`itens: ${JSON.stringify(itens)}`)
                console.log(`dados: ${JSON.stringify(dado)}`)
                cy.pause()

                const id = itens.find((item2) => {
                  const valorItem1 = obterValor(item2, contentBusca[0]);
                  const valorDado1 = obterValor(dado, contentBusca[0]);
                  const valorItem2 = obterValor(item2, contentBusca[1]);
                  const valorDado2 = obterValor(dado, contentBusca[1]);

                  return (
                    String(valorItem1)?.trim()?.toLowerCase() === String(valorDado1)?.trim()?.toLowerCase() &&
                    String(valorItem2)?.trim()?.toLowerCase() === String(valorDado2)?.trim()?.toLowerCase()
                  );
                })?.id ?? null;

                if (id !== null) {
                  encontrou = true;
                  salvarId(id, {
                    [contentBusca[0]]: obterValor(dado, contentBusca[0]),
                    [contentBusca[1]]: obterValor(dado, contentBusca[1]),
                  });
                }
              });
            }).then(() => {
              if (!encontrou) {
                salvarId(null, {
                  [contentBusca[0]]: obterValor(dado, contentBusca[0]),
                  [contentBusca[1]]: obterValor(dado, contentBusca[1]),
                });
              }
            });
          });
        }
      });
    } else {
      cy.lerJsonDeOutput(nomeArquivo).then((dadosDoArquivo) => { // ← trocado lerColunaDeArquivo → lerJsonDeOutput
        for (const dado of dadosDoArquivo) {
          if (dado.idHml !== null && dado.idHml !== undefined) continue; // ← já possui idHml, ignora

          const valorBusca = dado[campoDescricao];

          cy.executarRequest('hml', `${entidade.urlBusca}${encodeURIComponent(valorBusca)}`).then((resposta) => {
            const itens = resposta.body?.content || [];

            const id = itens.find((item) =>
              String(item?.[campoDescricao])?.trim()?.toLowerCase() ===
              String(valorBusca)?.trim()?.toLowerCase()
            )?.id ?? null;

            salvarId(id, valorBusca);
          });
        }
      });
    }
  }
});