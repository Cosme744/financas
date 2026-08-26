// store.js — estado local. O celular é a fonte da verdade imediata;
// a planilha é o destino final. Lançar nunca depende de ter internet.

const CHAVE = 'cf.dados.v1';

const PADRAO = {
  config: {
    renda: 0,
    meta: 0,
    compromissos: [],
    apiUrl: '',   // URL do Web App do Apps Script
    token: '',    // segredo compartilhado com o backend
  },
  transacoes: [],
  fila: [],       // lançamentos ainda não enviados para a planilha
  ultimaSync: null,
};

let dados = carregar();
const ouvintes = new Set();

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return structuredClone(PADRAO);
    // Merge raso com o padrão para que campos novos apareçam em bases antigas.
    const salvo = JSON.parse(bruto);
    return {
      ...structuredClone(PADRAO),
      ...salvo,
      config: { ...PADRAO.config, ...(salvo.config || {}) },
    };
  } catch {
    return structuredClone(PADRAO);
  }
}

function persistir() {
  localStorage.setItem(CHAVE, JSON.stringify(dados));
  for (const fn of ouvintes) fn(dados);
}

export function estado() {
  return dados;
}

export function assinar(fn) {
  ouvintes.add(fn);
  fn(dados);
  return () => ouvintes.delete(fn);
}

export function novoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Adiciona um lançamento e o enfileira para sincronizar. */
export function lancar({ valor, categoria, nota = '', metodo = 'pix', data,
                         compromissoId = null, reembolso = false }) {
  const t = {
    id: novoId(),
    data: data || new Date().toISOString().slice(0, 10),
    valor,
    categoria,
    nota,
    metodo,
    compromissoId,
    reembolso,
    criadoEm: new Date().toISOString(),
  };
  dados.transacoes.unshift(t);
  dados.fila.push(t.id);
  persistir();
  return t;
}

export function remover(id) {
  dados.transacoes = dados.transacoes.filter((t) => t.id !== id);
  dados.fila = dados.fila.filter((f) => f !== id);
  persistir();
}

export function salvarConfig(patch) {
  dados.config = { ...dados.config, ...patch };
  persistir();
}

/** Substitui o histórico pelo que veio da planilha, preservando o que ainda não subiu. */
export function substituirTransacoes(lista) {
  const pendentes = dados.transacoes.filter((t) => dados.fila.includes(t.id));
  const idsPendentes = new Set(pendentes.map((t) => t.id));
  const remotas = lista.filter((t) => !idsPendentes.has(t.id));
  dados.transacoes = [...pendentes, ...remotas].sort((a, b) => b.data.localeCompare(a.data));
  dados.ultimaSync = new Date().toISOString();
  persistir();
}

export function marcarEnviados(ids) {
  const enviados = new Set(ids);
  dados.fila = dados.fila.filter((id) => !enviados.has(id));
  dados.ultimaSync = new Date().toISOString();
  persistir();
}

export function pendentes() {
  const ids = new Set(dados.fila);
  return dados.transacoes.filter((t) => ids.has(t.id));
}
