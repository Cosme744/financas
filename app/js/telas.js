// telas.js — renderização. Cada função devolve HTML; os eventos são ligados depois.

import { calcular, porCategoria, doMes, projecao, liquido, chaveMes } from './engine.js';
import * as store from './store.js';

export const CATEGORIAS = [
  'Mercado', 'Comida', 'Transporte', 'Casa', 'Saúde',
  'Lazer', 'Compras', 'Assinaturas', 'Carro', 'Outros',
];

export const METODOS = [
  { id: 'pix', nome: 'Pix' },
  { id: 'credito', nome: 'Crédito' },
  { id: 'debito', nome: 'Débito' },
  { id: 'dinheiro', nome: 'Dinheiro' },
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const dinheiro = (v) => brl.format(v || 0);

/** Destaca os reais e apaga os centavos — é o número que se lê de relance. */
function grande(v) {
  const [reais, cents] = brl.format(Math.abs(v)).split(',');
  return `${v < 0 ? '-' : ''}${reais}<span class="centavos">,${cents}</span>`;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const diaBR = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

const NOME_METODO = { pix: 'Pix', credito: 'Crédito', debito: 'Débito',
                      dinheiro: 'Dinheiro', cartao: 'Cartão' };

/** "parcela 3 de 5 · faltam R$ 495,00" — o que a planilha não sabia dizer. */
function selo(c) {
  const p = c.parcela;
  if (!p || !p.total) return 'todo mês';
  const restante = p.faltaPagar ? ` · faltam ${dinheiro(p.faltaPagar)}` : '';
  return `parcela ${p.n} de ${p.total}${restante}${p.ultima ? ' · <b>última</b>' : ''}`;
}

/* ===================== HOJE ===================== */

export function home(ref) {
  const { config, transacoes } = store.estado();
  const c = calcular(transacoes, config, ref);

  if (!config.renda && !transacoes.length) {
    return `<div class="vazio">
      <p>Para dizer se você pode gastar, eu preciso saber quanto entra por mês.</p>
      <button class="principal" data-ir="ajustes">Configurar</button>
    </div>`;
  }

  const orcamento = c.receita - c.meta;
  const usado = orcamento > 0 ? Math.min(100, (c.gastoTotal / orcamento) * 100) : 100;
  const hojeDia = new Date().getDate();
  const recentes = doMes(transacoes, ref).slice(0, 6);

  return `
  <section class="cartao destaque ${c.status}">
    <div class="rotulo">${c.sobra < 0 ? 'Você passou do limite' : 'Pode gastar hoje'}</div>
    <div class="valor">${grande(c.porDia)}</div>
    <div class="sub">${c.sobra < 0
      ? `${dinheiro(Math.abs(c.sobra))} no vermelho neste mês`
      : `${dinheiro(c.sobra)} até o fim do mês · ${c.dias} ${c.dias === 1 ? 'dia' : 'dias'}`}</div>
    <div class="barra"><i style="width:${usado}%"></i></div>
    <div class="sub">${dinheiro(c.gastoTotal)} gastos de ${dinheiro(orcamento)}</div>
  </section>

  <section class="cartao linhas">
    <div class="linha"><span class="nome">Entrou</span>
      <span class="num pos">${dinheiro(c.receita)}</span></div>
    ${c.reembolsado ? `<div class="linha"><span class="nome">Reembolsos
      <small>dinheiro de passagem, não é seu</small></span>
      <span class="num">${dinheiro(c.reembolsado)}</span></div>` : ''}
    <div class="linha"><span class="nome">Compromissos
      <small>${dinheiro(c.pagos - c.reembolsado)} pagos · ${dinheiro(c.pendentes)} a vencer</small></span>
      <span class="num neg">${dinheiro(c.comprometido)}</span></div>
    <div class="linha"><span class="nome">Gastos do dia a dia</span>
      <span class="num neg">${dinheiro(c.variaveis)}</span></div>
    ${c.meta ? `<div class="linha"><span class="nome">Guardar<small>meta do mês</small></span>
      <span class="num">${dinheiro(c.meta)}</span></div>` : ''}
  </section>

  ${c.aPagar.length ? `
  <h2 class="titulo">A pagar &middot; ${c.aPagar.length}</h2>
  <section class="cartao linhas">
    ${c.aPagar.map((x) => `
      <div class="linha">
        <span class="nome">${escapar(x.nome)}
          <small>${x.diaEfetivo < hojeDia ? '⚠ venceu dia ' + x.diaEfetivo : 'dia ' + x.diaEfetivo} · ${selo(x)}</small>
          ${x.reembolso ? `<small>sai do seu bolso: ${dinheiro(liquido(x))}</small>` : ''}
        </span>
        <button class="chip" data-pagar="${x.id}">${dinheiro(x.valor)} · pagar</button>
      </div>`).join('')}
  </section>` : ''}

  ${recentes.length ? `
  <h2 class="titulo">Últimos lançamentos</h2>
  <section class="cartao linhas">${recentes.map(lancamentoHTML).join('')}</section>` : ''}`;
}

const lancamentoHTML = (t) => `
  <div class="linha">
    <span class="nome">${escapar(t.categoria || 'Sem categoria')}
      <small>${diaBR(t.data)}${t.metodo ? ' · ' + (NOME_METODO[t.metodo] || escapar(t.metodo)) : ''}${
        t.nota ? ' · ' + escapar(t.nota) : ''}${t.auto ? ' · auto' : ''}</small>
    </span>
    <span class="num ${t.valor < 0 ? 'neg' : 'pos'}">${dinheiro(t.valor)}</span>
  </div>`;

/* ===================== LANÇAR ===================== */

let rascunho = { centavos: 0, categoria: 'Mercado', tipo: 'saida', metodo: 'pix' };

export function lancar() {
  const v = rascunho.centavos / 100;
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'];
  return `
  <section class="cartao">
    <div class="tipo">
      <button data-tipo="saida" class="${rascunho.tipo === 'saida' ? 'on' : ''}">Gasto</button>
      <button data-tipo="entrada" class="${rascunho.tipo === 'entrada' ? 'on' : ''}">Entrada</button>
    </div>
    <div class="visor"><small>R$</small>${v.toFixed(2).replace('.', ',')}</div>
    <div class="rotulo-campo">Como pagou</div>
    <div class="chips">
      ${METODOS.map((m) =>
        `<button class="chip ${rascunho.metodo === m.id ? 'on' : ''}" data-metodo="${m.id}">${m.nome}</button>`).join('')}
    </div>
    <div class="rotulo-campo">Categoria</div>
    <div class="chips">
      ${CATEGORIAS.map((cat) =>
        `<button class="chip ${rascunho.categoria === cat ? 'on' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
    </div>
    <div class="teclado">
      ${teclas.map((k) => `<button data-tecla="${k}">${k}</button>`).join('')}
    </div>
    <button class="principal" id="salvar" ${rascunho.centavos ? '' : 'disabled'}>
      Lançar ${rascunho.centavos ? dinheiro(v) : ''}
    </button>
  </section>`;
}

export function ligarLancar(raiz, rerender, onSalvo) {
  raiz.querySelectorAll('[data-tecla]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.tecla;
      if (k === 'C') rascunho.centavos = 0;
      else if (k === '⌫') rascunho.centavos = Math.floor(rascunho.centavos / 10);
      else if (rascunho.centavos < 1e9) rascunho.centavos = rascunho.centavos * 10 + Number(k);
      rerender();
    };
  });
  raiz.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => { rascunho.categoria = b.dataset.cat; rerender(); };
  });
  raiz.querySelectorAll('[data-metodo]').forEach((b) => {
    b.onclick = () => { rascunho.metodo = b.dataset.metodo; rerender(); };
  });
  raiz.querySelectorAll('[data-tipo]').forEach((b) => {
    b.onclick = () => { rascunho.tipo = b.dataset.tipo; rerender(); };
  });

  const salvar = raiz.querySelector('#salvar');
  if (salvar) {
    salvar.onclick = () => {
      const bruto = rascunho.centavos / 100;
      const t = store.lancar({
        valor: rascunho.tipo === 'saida' ? -bruto : bruto,
        categoria: rascunho.tipo === 'entrada' ? 'Entrada' : rascunho.categoria,
        metodo: rascunho.metodo,
      });
      // Mantém categoria e método: quem lança mercado no crédito
      // costuma lançar de novo do mesmo jeito.
      rascunho = { centavos: 0, categoria: rascunho.categoria, tipo: 'saida', metodo: rascunho.metodo };
      onSalvo(t);
    };
  }
}

/* ===================== MÊS ===================== */

export function mes(ref) {
  const { transacoes } = store.estado();
  const lista = doMes(transacoes, ref);
  if (!lista.length) return '<div class="vazio">Nenhum lançamento neste mês.</div>';

  const cats = porCategoria(transacoes, ref);
  const maior = cats[0]?.total || 1;
  const soma = cats.reduce((s, x) => s + x.total, 0) || 1;

  return `
  <h2 class="titulo">Por categoria</h2>
  <section class="cartao linhas">
    ${cats.map((c) => `
      <div class="linha">
        <span class="nome">${escapar(c.categoria)}
          <small>${Math.round((c.total / soma) * 100)}% do mês</small></span>
        <span class="num neg">${dinheiro(c.total)}</span>
      </div>
      <div class="barra" style="margin:0 0 8px">
        <i style="width:${(c.total / maior) * 100}%;background:var(--acento)"></i>
      </div>`).join('')}
  </section>

  <h2 class="titulo">Todos os lançamentos (${lista.length})</h2>
  <section class="cartao linhas">${lista.map(lancamentoHTML).join('')}</section>`;
}

/* ===================== FUTURO ===================== */

export function futuro() {
  const { config, transacoes } = store.estado();
  if (!(config.compromissos || []).length) {
    return `<div class="vazio">
      <p>Cadastre seus compromissos para ver quando cada parcelamento acaba
         e quanto isso libera por mês.</p>
      <button class="principal" data-ir="ajustes">Cadastrar</button>
    </div>`;
  }

  const linhas = projecao(config, transacoes, 6);
  const maior = Math.max(...linhas.map((l) => l.comprometido)) || 1;
  const alivioTotal = linhas[0].comprometido - linhas[linhas.length - 1].comprometido;

  return `
  ${alivioTotal > 0 ? `
  <section class="cartao destaque ok">
    <div class="rotulo">Em 6 meses você libera</div>
    <div class="valor">${grande(alivioTotal)}</div>
    <div class="sub">por mês, conforme os parcelamentos terminam</div>
  </section>` : ''}

  <h2 class="titulo">Próximos meses</h2>
  <section class="cartao">
    ${linhas.map((l, i) => `
      <div class="linha">
        <span class="nome">${l.rotulo}
          <small>${l.quantidade} ${l.quantidade === 1 ? 'compromisso' : 'compromissos'}${
            l.alivio > 0 ? ' · <b style="color:var(--ok)">−' + dinheiro(l.alivio) + '</b>' : ''}</small>
        </span>
        <span class="num ${l.sobra < 0 ? 'neg' : 'pos'}">${dinheiro(l.sobra)}</span>
      </div>
      <div class="barra" style="margin:0 0 10px">
        <i style="width:${(l.comprometido / maior) * 100}%;background:${i === 0 ? 'var(--acento)' : 'var(--texto-fraco)'}"></i>
      </div>
      ${l.terminando.length ? `<div style="font-size:13px;color:var(--ok);margin:-4px 0 12px 2px">
        ✓ termina: ${l.terminando.map((t) => escapar(t.nome)).join(', ')}</div>` : ''}
    `).join('')}
    <p style="color:var(--texto-fraco);font-size:12.5px;margin:6px 0 0">
      Sobra estimada = renda − meta − compromissos − ${dinheiro(linhas[0].variavelEstimado)}
      de gasto variável (sua média).
    </p>
  </section>`;
}

/* ===================== AJUSTES ===================== */

export function ajustes() {
  const { config, fila, ultimaSync } = store.estado();
  const hoje = chaveMes(new Date());
  const comps = config.compromissos || [];

  return `
  <h2 class="titulo">Seu mês</h2>
  <section class="cartao">
    <label class="campo"><span>Quanto entra por mês (R$)</span>
      <input type="number" inputmode="decimal" id="renda" value="${config.renda || ''}" placeholder="0,00"></label>
    <label class="campo"><span>Quanto quero guardar (R$)</span>
      <input type="number" inputmode="decimal" id="meta" value="${config.meta || ''}" placeholder="0,00"></label>
  </section>

  <h2 class="titulo">Compromissos (${comps.length})</h2>
  <section class="cartao linhas">
    ${comps.length ? comps.map((c) => `
      <div class="linha">
        <span class="nome">${escapar(c.nome)}
          <small>dia ${c.dia} · ${c.parcelas ? c.parcelas + 'x desde ' + c.inicio : 'todo mês'}${
            c.reembolso ? ' · reembolso ' + dinheiro(c.reembolso) : ''}</small></span>
        <span><span class="num neg">${dinheiro(c.valor)}</span>
          <button class="chip" data-remover="${c.id}" aria-label="Remover">✕</button></span>
      </div>`).join('')
      : '<div style="color:var(--texto-fraco);font-size:14px">Nada cadastrado ainda.</div>'}
  </section>

  <section class="cartao">
    <label class="campo"><span>Nome</span>
      <input id="cNome" placeholder="Aluguel, financiamento, mensalidade..."></label>
    <div style="display:flex;gap:8px">
      <label class="campo" style="flex:2"><span>Valor da parcela</span>
        <input type="number" inputmode="decimal" id="cValor" placeholder="0,00"></label>
      <label class="campo" style="flex:1"><span>Dia</span>
        <input type="number" min="1" max="31" id="cDia" placeholder="10"></label>
    </div>
    <div style="display:flex;gap:8px">
      <label class="campo" style="flex:1"><span>Nº de parcelas</span>
        <input type="number" min="1" id="cParcelas" placeholder="vazio = todo mês"></label>
      <label class="campo" style="flex:1"><span>1ª parcela</span>
        <input type="month" id="cInicio" value="${hoje}"></label>
    </div>
    <label class="campo"><span>Alguém te devolve parte? (R$)</span>
      <input type="number" inputmode="decimal" id="cReembolso" placeholder="0,00 — ex: o que sua mãe paga"></label>
    <button class="secundario" id="addComp">Adicionar compromisso</button>
  </section>

  <h2 class="titulo">Planilha</h2>
  <section class="cartao">
    <label class="campo"><span>URL do Web App (Apps Script)</span>
      <input id="apiUrl" value="${escapar(config.apiUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec"></label>
    <label class="campo"><span>Token</span>
      <input id="token" type="password" value="${escapar(config.token || '')}" placeholder="o mesmo segredo do Code.gs"></label>
    <button class="secundario" id="sincronizar">Sincronizar agora</button>
    <p style="color:var(--texto-fraco);font-size:13px;margin:10px 0 0">
      ${fila.length ? `⚠ ${fila.length} lançamento(s) aguardando envio.` : '✓ Tudo sincronizado.'}
      ${ultimaSync ? `<br>Última: ${new Date(ultimaSync).toLocaleString('pt-BR')}.` : ''}
    </p>
  </section>

  <section class="cartao">
    <button class="secundario" id="exportar">Exportar backup (JSON)</button>
  </section>`;
}
