// telas.js — Renderização completa e enxuta.

import { calcular, porCategoria, doMes, doDia, porDia, projecao, porTipo,
         chaveMes, gastoPorQuis, CATEGORIA_QUIS } from './engine.js';
import * as store from './store.js';

export const CATEGORIAS = [
  'Mercado', 'Comer fora', 'Transporte', 'Casa', 'Saúde',
  CATEGORIA_QUIS, 'Outros',
];

export const METODOS = [
  { id: 'pix', nome: 'Pix' },
  { id: 'credito', nome: 'Crédito' },
  { id: 'debito', nome: 'Débito' },
  { id: 'dinheiro', nome: 'Dinheiro' },
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const dinheiro = (v) => brl.format(v || 0);

function grande(v) {
  const [reais, cents] = brl.format(Math.abs(v)).split(',');
  return `${v < 0 ? '-' : ''}${reais}<span class="centavos">,${cents}</span>`;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const diaBR = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`;

/* ===================== HOJE ===================== */

export function home(ref) {
  const { config, transacoes } = store.estado();
  const c = calcular(transacoes, config, ref);

  if (!config.renda && !transacoes.length) {
    return `<div class="vazio">
      <p>Cadastre sua renda em Ajustes para ver quanto pode gastar hoje.</p>
      <button class="principal" data-ir="ajustes">Configurar Renda</button>
    </div>`;
  }

  const agora = new Date();
  const hojeDia = agora.getDate();
  const ehMesCorrente = chaveMes(ref) === chaveMes(agora);
  const quis = gastoPorQuis(transacoes, ref);
  const lancHoje = ehMesCorrente ? doDia(transacoes, agora).filter((t) => t.valor < 0) : [];

  const vencidasPendente = (c.aPagar || []).filter(x => x.diaEfetivo < hojeDia);
  const htmlAlertaVencidas = vencidasPendente.length ? `
  <section class="cartao alerta-vencido" style="border-left: 4px solid #ff4d4d; background: rgba(255, 77, 77, 0.1); margin-bottom: 12px; padding: 12px;">
    <div style="font-weight: bold; color: #ff4d4d; margin-bottom: 6px;">⚠️ Contas Vencidas Pendentes</div>
    ${vencidasPendente.map(x => `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
        <span><b>${escapar(x.nome)}</b> (dia ${x.diaEfetivo}) — ${dinheiro(x.valorMes)}</span>
        <button class="secundario pagar" data-pagar="${x.id}" style="padding: 4px 8px; font-size: 12px;">Pagar</button>
      </div>
    `).join('')}
  </section>` : '';

  return `
  ${htmlAlertaVencidas}

  <section class="cartao destaque ${c.status}">
    <div class="rotulo">${c.sobra < 0 ? 'Você passou do limite' : 'Pode gastar hoje'}</div>
    <div class="valor">${grande(c.porDia)}</div>
    <div class="sub">${c.sobra < 0
      ? `${dinheiro(Math.abs(c.sobra))} no vermelho este mês`
      : `${dinheiro(c.sobra)} livres até o fim do mês · ${c.dias} dias`}</div>
  </section>

  ${quis > 0 ? `
  <section class="cartao mini" style="margin-bottom: 12px;">
    <div class="rotulo">Por que eu quis</div>
    <div class="mini-valor atencao-txt">${dinheiro(quis)}</div>
    <div class="mini-sub">gastos extras no mês</div>
  </section>` : ''}

  <section class="cartao linhas">
    <div class="linha"><span class="nome">Entradas do mês</span><span class="num pos">${dinheiro(c.receita)}</span></div>
    <div class="linha"><span class="nome">Compromissos do mês</span><span class="num neg">${dinheiro(c.comprometido)}</span></div>
    <div class="linha"><span class="nome">Gastos do dia a dia</span><span class="num neg">${dinheiro(c.variaveis)}</span></div>
  </section>

  ${(c.aPagar.length || c.pagas.length) ? `
  <h2 class="titulo">Contas do Mês</h2>
  <section class="cartao">
    <div class="resumo-pagar" style="margin-bottom: 10px;">
      <span>${c.pagas.length} de ${c.ativos.length} contas pagas</span>
      ${c.pendentes > 0 ? `<b class="num neg">faltam ${dinheiro(c.pendentes)}</b>` : '<b class="num pos">tudo pago ✓</b>'}
    </div>
    ${c.aPagar.map((x) => contaHTML(x, hojeDia, false)).join('')}
    ${c.pagas.map((x) => contaHTML(x, hojeDia, true)).join('')}
  </section>` : ''}

  ${lancHoje.length ? `
  <h2 class="titulo">O que você gastou hoje</h2>
  <section class="cartao linhas">${lancHoje.map(lancamentoHTML).join('')}</section>` : ''}`;
}

const lancamentoHTML = (t) => `
  <div class="linha editavel" data-editar="${t.id}" role="button" tabindex="0">
    <span class="nome">${escapar(t.categoria || 'Gasto')}
      <small>${diaBR(t.data)}${t.nota ? ' · ' + escapar(t.nota) : ''}</small>
    </span>
    <span class="num ${t.valor < 0 ? 'neg' : 'pos'}">${dinheiro(t.valor)}</span>
  </div>`;

function contaHTML(x, hojeDia, paga) {
  const atrasada = !paga && x.diaEfetivo < hojeDia;
  return `
  <div class="conta ${paga ? 'paga' : ''} ${atrasada ? 'atrasada' : ''}" style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
    <div class="conta-topo" style="display:flex; justify-content:space-between;">
      <span class="conta-nome">${paga ? '✓ ' : ''}${escapar(x.nome)}</span>
      <span class="num ${paga ? '' : 'neg'}">${dinheiro(x.valorMes)}</span>
    </div>
    <div class="conta-info" style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      <small style="color:var(--texto-fraco);">${paga ? 'Paga' : (atrasada ? 'Venceu dia ' + x.diaEfetivo : 'Vence dia ' + x.diaEfetivo)}</small>
      ${!paga ? `<button class="secundario pagar" data-pagar="${x.id}" style="padding: 2px 8px; font-size:11px;">Marcar como paga</button>` : ''}
    </div>
  </div>`;
}

/* ===================== LANÇAR ===================== */

const hojeISO = () => new Date().toISOString().slice(0, 10);
let rascunho = { centavos: 0, categoria: 'Mercado', tipo: 'saida', metodo: 'pix', qr: null, data: hojeISO() };

export function aplicarQR(r) {
  rascunho.qr = r;
  rascunho.tipo = 'saida';
  if (r.valor) rascunho.centavos = Math.round(r.valor * 100);
  if (r.metodo) rascunho.metodo = r.metodo;
}

export function limparQR() { rascunho.qr = null; }
export const qrAtual = () => rascunho.qr;

export function lancar() {
  const v = rascunho.centavos / 100;
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'];
  const q = rascunho.qr;

  return `
  ${q ? `
  <section class="cartao qr-lido">
    <div class="linha">
      <span class="nome"><b>${escapar(q.rotulo)}</b><small>${escapar(q.quem)}</small></span>
      <button class="chip" id="qrLimpar">✕</button>
    </div>
  </section>` : `
  <button class="secundario qr-abrir" id="qrAbrir" style="margin-bottom:12px;">⛶ Escanear QR Code / Nota Fiscal</button>`}

  <section class="cartao">
    <div class="tipo" style="display:flex; gap:8px; margin-bottom:12px;">
      <button data-tipo="saida" class="${rascunho.tipo === 'saida' ? 'on' : ''}" style="flex:1;">Saída (Gasto)</button>
      <button data-tipo="entrada" class="${rascunho.tipo === 'entrada' ? 'on' : ''}" style="flex:1;">Entrada (Receita)</button>
    </div>

    <div class="visor" style="font-size:28px; font-weight:bold; text-align:center; margin:12px 0;"><small>R$</small> ${v.toFixed(2).replace('.', ',')}</div>

    <div class="linha-data" style="margin-bottom:12px;">
      <label for="lData">Data: </label>
      <input type="date" id="lData" value="${rascunho.data}" max="${hojeISO()}">
    </div>

    <div class="rotulo-campo">Forma de Pagamento</div>
    <div class="chips" style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
      ${METODOS.map((m) =>
        `<button class="chip ${rascunho.metodo === m.id ? 'on' : ''}" data-metodo="${m.id}">${m.nome}</button>`).join('')}
    </div>

    <div class="rotulo-campo">Categoria</div>
    <div class="chips" style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
      ${CATEGORIAS.map((cat) =>
        `<button class="chip ${rascunho.categoria === cat ? 'on' : ''}" data-cat="${cat}">${cat}</button>`).join('')}
    </div>

    <div class="teclado" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:16px;">
      ${teclas.map((k) => `<button data-tecla="${k}" style="padding:12px; font-size:18px;">${k}</button>`).join('')}
    </div>

    <button class="principal" id="salvar" ${rascunho.centavos ? '' : 'disabled'}>
      Confirmar Lançamento de ${rascunho.centavos ? dinheiro(v) : 'R$ 0,00'}
    </button>
  </section>`;
}

export function ligarLancar(raiz, rerender, onSalvo, abrirScanner) {
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

  const $data = raiz.querySelector('#lData');
  if ($data) $data.onchange = () => { rascunho.data = $data.value || hojeISO(); rerender(); };

  const abrir = raiz.querySelector('#qrAbrir');
  if (abrir) abrir.onclick = abrirScanner;

  const limpar = raiz.querySelector('#qrLimpar');
  if (limpar) limpar.onclick = () => { limparQR(); rerender(); };

  const salvar = raiz.querySelector('#salvar');
  if (salvar) {
    salvar.onclick = () => {
      const bruto = rascunho.centavos / 100;
      const q = rascunho.qr;
      const t = store.lancar({
        valor: rascunho.tipo === 'saida' ? -bruto : bruto,
        categoria: rascunho.tipo === 'entrada' ? 'Entrada' : rascunho.categoria,
        metodo: rascunho.metodo,
        data: q ? q.data : rascunho.data,
        nota: q ? q.quem : '',
        id: q ? q.id : null,
        origem: q ? q.tipo : 'app',
      });
      rascunho = { centavos: 0, categoria: rascunho.categoria, tipo: 'saida',
                   metodo: rascunho.metodo, qr: null, data: hojeISO() };
      onSalvo(t);
    };
  }
}

/* ===================== EDITAR LANÇAMENTO ===================== */

export function painelEditar(t) {
  const v = Math.abs(t.valor).toFixed(2).replace('.', ',');
  const cats = [...new Set([...CATEGORIAS, t.categoria].filter(Boolean))];
  return `
  <div class="folha-fundo" id="fecharEdicao"></div>
  <div class="folha">
    <div class="folha-topo">
      <b>Editar Lançamento</b>
      <button class="chip" id="fecharEdicaoX">✕</button>
    </div>

    <label class="campo"><span>Valor (R$)</span>
      <input type="text" inputmode="decimal" id="eValor" value="${v}"></label>

    <label class="campo"><span>Data</span>
      <input type="date" id="eData" value="${escapar(String(t.data).slice(0, 10))}"></label>

    <div class="rotulo-campo">Categoria</div>
    <div class="chips">
      ${cats.map((cat) =>
        `<button class="chip ${t.categoria === cat ? 'on' : ''}" data-ecat="${escapar(cat)}">${escapar(cat)}</button>`).join('')}
    </div>

    <label class="campo" style="margin-top:16px"><span>Descrição / Observação</span>
      <input id="eNota" value="${escapar(t.nota || '')}"></label>

    <button class="principal" id="eSalvar" style="margin-top:12px;">Salvar Alterações</button>
    <button class="secundario perigo" id="eApagar">Apagar Lançamento</button>
  </div>`;
}

/* ===================== MÊS (EXTRATO) ===================== */

export function mes(ref) {
  const { config, transacoes } = store.estado();
  const lista = doMes(transacoes, ref);
  if (!lista.length) return '<div class="vazio">Nenhum lançamento neste mês.</div>';

  const c = calcular(transacoes, config, ref);
  const cats = porCategoria(transacoes, ref, true);
  const dias = porDia(transacoes, ref);

  return `
  <h2 class="titulo">Resumo Financeiro do Mês</h2>
  <section class="cartao linhas">
    <div class="linha"><span class="nome">Total Entradas</span><span class="num pos">${dinheiro(c.receita)}</span></div>
    <div class="linha"><span class="nome">Compromissos Pagos</span><span class="num neg">${dinheiro(c.pagos)}</span></div>
    <div class="linha"><span class="nome">Gastos do Dia a Dia</span><span class="num neg">${dinheiro(c.variaveis)}</span></div>
  </section>

  ${cats.length ? `
  <h2 class="titulo">Gastos por Categoria</h2>
  <section class="cartao">
    ${cats.map((x) => `
      <div class="linha">
        <span class="nome">${escapar(x.categoria)}</span>
        <span class="num neg">${dinheiro(x.total)}</span>
      </div>`).join('')}
  </section>` : ''}

  <h2 class="titulo">Lançamentos do Mês (${lista.length})</h2>
  <section class="cartao">
    ${dias.map((d) => `
      <div class="dia-cab" style="font-weight:bold; margin-top:8px;"><span>${diaBR(d.data)}</span></div>
      ${d.itens.map(lancamentoHTML).join('')}`).join('')}
  </section>`;
}

/* ===================== FUTURO & PARCELAS ===================== */

export function futuro() {
  const { config, transacoes } = store.estado();
  if (!(config.compromissos || []).length) {
    return `<div class="vazio"><p>Nenhum compromisso cadastrado.</p></div>`;
  }

  const t = porTipo(config, new Date(), transacoes);

  return `
  <section class="cartao destaque">
    <div class="rotulo">Compromissos Mensais Ativos</div>
    <div class="valor">${grande(t.total)}</div>
  </section>

  ${t.parceladas.length ? `
  <h2 class="titulo">Seus Parcelamentos</h2>
  <section class="cartao linhas">
    ${t.parceladas.map((x) => `
      <div class="linha" style="align-items: flex-start; padding: 8px 0;">
        <span class="nome">${escapar(x.nome)}
          <small style="display:block;">${x.situacao?.pagas ?? 0} de ${x.parcela.total} parcelas pagas</small>
        </span>
        <div style="text-align: right;">
          <span class="num neg">${dinheiro(x.valorMes)}/mês</span>
          ${x.parcela.faltaPagar ? `<small style="color:var(--texto-fraco); font-size:11px; display:block;">Resta: ${dinheiro(x.parcela.faltaPagar)}</small>` : ''}
        </div>
      </div>
    `).join('')}
  </section>` : ''}`;
}

/* ===================== AJUSTES ===================== */

export function ajustes() {
  const { config, fila, ultimaSync } = store.estado();
  const hoje = chaveMes(new Date());
  const comps = config.compromissos || [];

  return `
  <h2 class="titulo">Configurações Gerais</h2>
  <section class="cartao">
    <label class="campo"><span>Renda Mensal (R$)</span>
      <input type="number" inputmode="decimal" id="renda" value="${config.renda || ''}"></label>
    <label class="campo"><span>Meta de Guardar por Mês (R$)</span>
      <input type="number" inputmode="decimal" id="meta" value="${config.meta || ''}"></label>
  </section>

  <h2 class="titulo">Seus Compromissos (${comps.length})</h2>
  <section class="cartao linhas">
    ${comps.length ? comps.map((c) => `
      <div class="linha editavel" data-comp="${c.id}" role="button" tabindex="0">
        <span class="nome">${escapar(c.nome)}
          <small>dia ${c.dia} · ${c.parcelas ? c.parcelas + 'x desde ' + escapar(c.inicio || '?') : 'todo mês'}</small>
        </span>
        <span class="num neg">${dinheiro(c.valor)}</span>
      </div>`).join('')
      : '<div style="color:var(--texto-fraco);font-size:14px">Nenhum compromisso cadastrado ainda.</div>'}
  </section>

  <section class="cartao" id="formComp">
    <div class="folha-topo"><b id="cTitulo">Novo compromisso</b>
      <button class="chip" id="cCancelar" hidden aria-label="Cancelar">✕</button></div>
    <input type="hidden" id="cId" value="">

    <label class="campo"><span>Nome</span>
      <input id="cNome" placeholder="Ex: Impressora, CREA, Aluguel..."></label>
    <div style="display:flex;gap:8px">
      <label class="campo" style="flex:2"><span>Valor da parcela (R$)</span>
        <input type="number" inputmode="decimal" id="cValor" placeholder="0,00"></label>
      <label class="campo" style="flex:1"><span>Dia Venc.</span>
        <input type="number" min="1" max="31" id="cDia" placeholder="10"></label>
    </div>
    <div style="display:flex;gap:8px">
      <label class="campo" style="flex:1"><span>Nº de parcelas</span>
        <input type="number" min="1" id="cParcelas" placeholder="vazio = todo mês"></label>
      <label class="campo" style="flex:1"><span>1ª parcela</span>
        <input type="month" id="cInicio" value="${hoje}"></label>
    </div>

    <label class="campo"><span>Cobrança extra só na 1ª parcela (R$)</span>
      <input type="number" inputmode="decimal" id="cExtra" placeholder="0,00"></label>

    <div class="rotulo-campo">Alguém te devolve esse dinheiro?</div>
    <div class="chips" style="margin-bottom:10px">
      <button class="chip" data-reemb="nao">Não, é meu gasto</button>
      <button class="chip" data-reemb="total">Sim, valor cheio</button>
      <button class="chip" data-reemb="parte">Sim, uma parte</button>
    </div>
    <label class="campo" id="campoReembolso" hidden><span>Quanto devolvem (R$)</span>
      <input type="number" inputmode="decimal" id="cReembolso" placeholder="0,00"></label>

    <button class="principal" id="addComp" style="margin-top:8px;">Adicionar compromisso</button>
    <button class="secundario perigo" id="delComp" hidden style="margin-top:8px;">Apagar compromisso</button>
  </section>

  <h2 class="titulo">Conexão com a Planilha</h2>
  <section class="cartao">
    <label class="campo"><span>URL Web App (Apps Script)</span>
      <input id="apiUrl" value="${escapar(config.apiUrl || '')}"></label>
    <label class="campo"><span>Token de Segurança</span>
      <input id="token" type="password" value="${escapar(config.token || '')}"></label>
    <button class="secundario" id="sincronizar" style="margin-top:8px;">Sincronizar Agora</button>
  </section>

  <section class="cartao" style="margin-top:12px;">
    <button class="secundario" id="exportar">Exportar backup (JSON)</button>
  </section>`;
}