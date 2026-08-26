// sync.js — conversa com o Google Apps Script publicado como Web App.
//
// Detalhe que economiza horas de depuração: o POST usa Content-Type
// text/plain de propósito. Isso o mantém como "simple request", então o
// navegador não dispara o preflight OPTIONS — que o Apps Script não
// responde. O corpo continua sendo JSON; quem faz o parse é o backend.

import { estado, substituirTransacoes, marcarEnviados, pendentes, salvarConfig } from './store.js';

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
 * Sobe o que está na fila e traz o mês corrente de volta.
 *
 * A configuração tem uma regra própria: na PRIMEIRA sincronização quem manda é
 * a planilha, e daí em diante quem manda é o app. Sem isso, um celular recém
 * instalado subiria sua lista vazia de compromissos e apagaria tudo o que o
 * importador tinha acabado de trazer.
 */
export async function sincronizar() {
  const st = estado();
  let baixouConfig = false;

  if (!st.ultimaSync) {
    const { config } = await chamar('config');
    salvarConfig(config);
    baixouConfig = true;
  } else {
    const { renda, meta, compromissos } = st.config;
    await chamar('gravarConfig', { config: { renda, meta, compromissos } });
  }

  const fila = pendentes();
  if (fila.length) {
    const { salvos } = await chamar('inserir', { transacoes: fila });
    marcarEnviados(salvos);
  }

  const { transacoes } = await chamar('listar', { desde: inicioDoMesPassado() });
  substituirTransacoes(transacoes);

  return { enviados: fila.length, recebidos: transacoes.length, baixouConfig };
}

function inicioDoMesPassado() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1, 1);
  return d.toISOString().slice(0, 10);
}

export { ErroSync };
