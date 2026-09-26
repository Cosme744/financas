// sync.js — conversa com o Google Apps Script publicado como Web App.
//
// Detalhe que economiza horas de depuração: o POST usa Content-Type
// text/plain de propósito. Isso o mantém como "simple request", então o
// navegador não dispara o preflight OPTIONS — que o Apps Script não
// responde. O corpo continua sendo JSON; quem faz o parse é o backend.

import { estado, substituirTransacoes, marcarEnviados, pendentes, salvarConfig, configEnviada } from './store.js';

class ErroSync extends Error {}

function url() {
  const { apiUrl } = estado().config;
  if (!apiUrl) throw new ErroSync('Configure a URL da planilha em Ajustes.');
  return apiUrl;
}

async function chamar(acao, payload = {}) {
  const { token } = estado().config;
  const resp = await fetch(url(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao, token, ...payload }),
    redirect: 'follow',
  });
  if (!resp.ok) throw new ErroSync(`Planilha respondeu ${resp.status}`);
  const json = await resp.json();
  if (!json.ok) throw new ErroSync(json.erro || 'Falha desconhecida na planilha');
  return json;
}

/**
 * Espelho nos dois sentidos, com a planilha como fonte da verdade.
 *
 *   1. Se você mudou renda, meta ou compromissos NO CELULAR, isso sobe.
 *   2. Sobe a fila de lançamentos.
 *   3. Baixa TUDO da planilha: configuração e histórico completo.
 *
 * Assim, editar direto no Sheets aparece no app na próxima sincronização,
 * e editar no app aparece no Sheets na mesma hora.
 */
export async function sincronizar() {
  const st = estado();

  if (st.configSuja) {
    const { renda, meta, compromissos, inicio } = st.config;
    await chamar('gravarConfig', { config: { renda, meta, compromissos, inicio } });
    configEnviada();
  }

  // As três operações vão em chamadas separadas, e cada uma confirma o que
  // gravou. Só o que a planilha confirmou sai da fila — se a rede cair no
  // meio, o que faltou tenta de novo na próxima, sem duplicar nem perder.
  const fila = pendentes();

  if (fila.inserir.length) {
    const { salvos } = await chamar('inserir', { transacoes: fila.inserir });
    marcarEnviados(salvos);
  }
  if (fila.atualizar.length) {
    const { salvos } = await chamar('atualizar', { transacoes: fila.atualizar });
    marcarEnviados(salvos);
  }
  if (fila.apagar.length) {
    const { salvos } = await chamar('apagar', { ids: fila.apagar });
    marcarEnviados(salvos);
  }

  // Só aceita a configuração da planilha se nada mudou no celular enquanto
  // a sync rodava — senão a edição feita agora seria sobrescrita.
  const { config } = await chamar('config');
  if (!estado().configSuja) salvarConfig(config, false);

  // Histórico inteiro, não só o mês: a contagem de parcelas pagas depende
  // de todos os pagamentos, inclusive os de meses atrás.
  const { transacoes } = await chamar('listar', {});
  substituirTransacoes(transacoes);

  return { enviados: fila.total, recebidos: transacoes.length };
}

export { ErroSync };
