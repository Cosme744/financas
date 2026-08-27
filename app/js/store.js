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
    buscarCNPJ: true,   // trocar o CNPJ da nota pelo nome da loja (BrasilAPI)
  },
  transacoes: [],
  // Operações ainda não enviadas para a planilha: { op, id }.
  // op é 'inserir', 'atualizar' ou 'apagar'.
  fila: [],
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
      // A fila já foi uma lista de ids soltos. Bases antigas continuam
      // funcionando: id solto vira uma inserção pendente.
      fila: (salvo.fila || []).map((f) => (typeof f === 'string' ? { op: 'inserir', id: f } : f)),
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

/**
 * Adiciona um lançamento e o enfileira para sincronizar.
 *
 * `id` só é passado por quem tem um identificador natural — a chave de acesso
 * de uma nota fiscal, por exemplo. Repetir o mesmo id faz a planilha
 * reconhecer o registro e não duplicar, que é o ponto de ler o QR duas vezes
 * sem medo.
 */
export function lancar({ valor, categoria, nota = '', metodo = 'pix', data,
                         compromissoId = null, reembolso = false, parcela = null,
                         id = null, origem = 'app' }) {
  const t = {
    id: id || novoId(),
    origem,
    data: data || new Date().toISOString().slice(0, 10),
    valor,
    categoria,
    nota,
    metodo,
    compromissoId,
    parcela,
    reembolso,
    criadoEm: new Date().toISOString(),
  };
  dados.transacoes.unshift(t);
  enfileirar('inserir', t.id);
  persistir();
  return t;
}

/**
 * Põe uma operação na fila sem duplicar e sem contradizer o que já está lá.
 *
 * A ordem importa: um lançamento criado e editado antes de subir continua
 * sendo uma inserção — mandar "atualizar" algo que a planilha nunca viu daria
 * erro. E apagar o que ainda não subiu simplesmente cancela a inserção, em
 * vez de mandar a planilha apagar uma linha inexistente.
 */
function enfileirar(op, id) {
  const i = dados.fila.findIndex((f) => f.id === id);
  if (i === -1) { dados.fila.push({ op, id }); return; }

  const atual = dados.fila[i].op;
  if (op === 'apagar' && atual === 'inserir') dados.fila.splice(i, 1);
  else if (op === 'apagar') dados.fila[i] = { op, id };
  else if (atual === 'inserir') { /* segue inserção */ }
  else dados.fila[i] = { op, id };
}

/** Edita um lançamento existente. */
export function atualizar(id, patch) {
  const t = dados.transacoes.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, patch);
  dados.transacoes.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  enfileirar('atualizar', id);
  persistir();
  return t;
}

/** Apaga um lançamento aqui e, na próxima sincronização, na planilha. */
export function apagar(id) {
  dados.transacoes = dados.transacoes.filter((t) => t.id !== id);
  enfileirar('apagar', id);
  persistir();
}

/** A nota já foi lançada? Evita o susto de ver a mesma compra duas vezes. */
export function existe(id) {
  return dados.transacoes.some((t) => t.id === id);
}

export function buscar(id) {
  return dados.transacoes.find((t) => t.id === id) || null;
}

export function salvarConfig(patch) {
  dados.config = { ...dados.config, ...patch };
  persistir();
}

/** Substitui o histórico pelo que veio da planilha, preservando o que ainda não subiu. */
export function substituirTransacoes(lista) {
  const idsFila = new Set(dados.fila.map((f) => f.id));
  const pendentes = dados.transacoes.filter((t) => idsFila.has(t.id));
  const idsPendentes = new Set(pendentes.map((t) => t.id));
  const remotas = lista.filter((t) => !idsPendentes.has(t.id));
  dados.transacoes = [...pendentes, ...remotas].sort((a, b) => b.data.localeCompare(a.data));
  dados.ultimaSync = new Date().toISOString();
  persistir();
}

export function marcarEnviados(ids) {
  const enviados = new Set(ids);
  dados.fila = dados.fila.filter((f) => !enviados.has(f.id));
  dados.ultimaSync = new Date().toISOString();
  persistir();
}

/** O que precisa subir, já separado por operação. */
export function pendentes() {
  const por = (op) => dados.fila.filter((f) => f.op === op).map((f) => f.id);
  const cheias = (ids) => ids.map((id) => buscar(id)).filter(Boolean);
  return {
    inserir: cheias(por('inserir')),
    atualizar: cheias(por('atualizar')),
    apagar: por('apagar'),          // já não existem aqui; só o id importa
    total: dados.fila.length,
  };
}
