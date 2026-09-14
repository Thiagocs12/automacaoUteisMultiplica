// arquivo: mapeamentoUsuarios.js
//
// Mapeamento do domínio "Usuários" (clonagem de usuário do Keycloak, PROD -> HML).
// Diferente de Grupos e Permissões (sincronização em lote, contínua), este domínio é
// uma ação pontual sob demanda: clona UM usuário de produção para homologação, com
// novo username/senha, mantendo o resto (roles, grupos, atributos) igual. Não
// participa do estoque de ids nem do pipeline genérico de sincronizacaoNivel.js — a
// lógica específica vive em commands/usuariosKeycloak.js.

const REALM = 'multiplicacapital';

const MAPEAMENTO_USUARIOS = {
  USUARIOS: {
    urlUsuarios: `auth/admin/realms/${REALM}/users`,
  },
};

export default MAPEAMENTO_USUARIOS;
