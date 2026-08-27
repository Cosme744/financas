// telas.js — renderização. Cada função devolve HTML; os eventos são ligados depois.

import { calcular, porCategoria, doMes, doDia, porDia, projecao, faixas, liquido,
         chaveMes, gastoDoDia, gastoPorQuis, CATEGORIA_QUIS } from './engine.js';
import * as store from './store.js';

/*
 * Sete, e cada uma com uma regra que decide sozinha.
 *
 * Eram dez, e as dez brigavam entre si: "Mercado" e "Comida" disputavam a
 * mesma compra, "Carro" e "Transporte" o mesmo abastecimento, "Lazer" e
 * "Compras" o mesmo impulso. Categoria ambígua custa caro justamente onde o
 * app precisa ser rápido — parado no caixa, decidindo.
 *
 *   Mercado ....... comida que você leva para casa
 *   Comer fora .... comida que você não leva (restaurante, lanche, delivery)
 *   Transporte .... combustível, passagem, app, estacionamento
 *   Casa .......... manutenção, limpeza, conta avulsa
 *   Saúde ......... farmácia, consulta, exame
 *   Por que eu quis  o que não precisava
 *   Outros ........ o que sobrou
 *
 * Sumiram "Assinaturas" e "Carro" porque não eram categorias de lançamento:
 * o que se repete todo mês é COMPROMISSO, e é lá que streaming e prestação do
 * carro pertencem — cadastrados uma vez, contados sozinhos daí em diante.
 *
 * Lançamento antigo continua com o nome antigo; nada é reescrito para trás.
 */
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
  const agora = new Date();
  const hojeDia = agora.getDate();

  // "Quanto já torrei hoje" é a segunda pergunta do dia, logo depois de
  // "quanto posso". Ela some quando o mês exibido não é o corrente: gasto de
  // hoje não diz nada sobre março.
  const ehMesCorrente = chaveMes(ref) === chaveMes(agora);
  const gastoHoje = ehMesCorrente ? gastoDoDia(transacoes, agora) : 0;
  const lancHoje = ehMesCorrente ? doDia(transacoes, agora).filter((t) => t.valor < 0) : [];
  const quis = gastoPorQuis(transacoes, ref);

  const recentes = ehMesCorrente && lancHoje.length
    ? lancHoje
    : doMes(transacoes, ref).slice(0, 6);

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

  ${ehMesCorrente ? `
  <section class="duplo">
    <div class="cartao mini">
      <div class="rotulo">Gastei hoje</div>
      <div class="mini-valor ${gastoHoje ? 'neg' : ''}">${dinheiro(gastoHoje)}</div>
      <div class="mini-sub">${lancHoje.length
        ? `${lancHoje.length} ${lancHoje.length === 1 ? 'lançamento' : 'lançamentos'}`
        : 'nada ainda'}</div>
    </div>
    <div class="cartao mini">
      <div class="rotulo">Porque eu quis</div>
      <div class="mini-valor ${quis ? 'atencao-txt' : ''}">${dinheiro(quis)}</div>
      <div class="mini-sub">no mês</div>
    </div>
  </section>` : ''}

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
  <h2 class="titulo">A pagar &middot; ${c.aPagar.length} &middot; ${dinheiro(c.pendentes)}</h2>
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
  <h2 class="titulo">${ehMesCorrente && lancHoje.length ? 'O que gastei hoje' : 'Últimos lançamentos'}</h2>
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

let rascunho = { centavos: 0, categoria: 'Mercado', tipo: 'saida', metodo: 'pix', qr: null };

/**
 * Recebe o que o scanner entendeu e adianta o que dá para adiantar.
 *
 * O QR nunca lança sozinho: ele preenche o visor e passa a bola. A tela de
 * lançar continua a mesma — teclado, método e categoria seguem editáveis,
 * porque o cupom fiscal não sabe dizer se você pagou no crédito ou no débito.
 */
export function aplicarQR(r) {
  rascunho.qr = r;
  rascunho.tipo = 'saida';
  if (r.valor) rascunho.centavos = Math.round(r.valor * 100);
  if (r.metodo) rascunho.metodo = r.metodo;
}

export function limparQR() {
  rascunho.qr = null;
}

/** Quem consulta o CNPJ em segundo plano usa isto para saber se a tela mudou. */
export const qrAtual = () => rascunho.qr;

export function lancar() {
  const v = rascunho.centavos / 100;
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'];
  const q = rascunho.qr;
  return `
  ${q ? `
  <section class="cartao qr-lido">
    <div class="linha">
      <span class="nome"><b>${escapar(q.rotulo)}</b>
        <small>${escapar(q.quem)}${q.detalhe ? ' · ' + escapar(q.detalhe) : ''}</small>
        <small>${diaBR(q.data)}${q.valor ? ' · valor veio do QR' : ''}</small>
      </span>
      <button class="chip" id="qrLimpar" aria-label="Descartar leitura">✕</button>
    </div>
    ${(q.avisos || []).map((a) => `<p class="qr-aviso">${escapar(a)}</p>`).join('')}
  </section>` : `
  <button class="secundario qr-abrir" id="qrAbrir">⛶ Escanear QR do cupom ou Pix</button>`}

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
        // A nota fiscal entra com a data e o id dela; o resto do app não
        // precisa saber que veio de um QR além do rótulo "auto" na lista.
        data: q ? q.data : undefined,
        nota: q ? q.quem : '',
        id: q ? q.id : null,
        origem: q ? q.tipo : 'app',
      });
      // Mantém categoria e método: quem lança mercado no crédito
      // costuma lançar de novo do mesmo jeito.
      rascunho = { centavos: 0, categoria: rascunho.categoria, tipo: 'saida',
                   metodo: rascunho.metodo, qr: null };
      onSalvo(t);
    };
  }
}

/* ===================== MÊS ===================== */

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "qui, 27/08" — o dia da semana é o que faz a data virar lembrança. */
function cabecalhoDia(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const igual = (x, y) => x.toDateString() === y.toDateString();
  if (igual(dt, hoje)) return 'hoje';
  if (igual(dt, ontem)) return 'ontem';
  return `${DIA_SEMANA[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function mes(ref) {
  const { config, transacoes } = store.estado();
  const lista = doMes(transacoes, ref);
  if (!lista.length) return '<div class="vazio">Nenhum lançamento neste mês.</div>';

  const c = calcular(transacoes, config, ref);
  const quis = gastoPorQuis(transacoes, ref);

  // Só o dia a dia entra na disputa por categoria. Compromisso pago junto
  // faria a fatura do cartão esmagar a lista inteira e esconder justamente o
  // gasto sobre o qual você ainda pode decidir alguma coisa.
  const cats = porCategoria(transacoes, ref, true);
  const maior = cats[0]?.total || 1;
  const soma = cats.reduce((s, x) => s + x.total, 0) || 1;

  const dias = porDia(transacoes, ref);

  return `
  <h2 class="titulo">Para onde o mês foi</h2>
  <section class="cartao linhas">
    <div class="linha"><span class="nome">Entrou</span>
      <span class="num pos">${dinheiro(c.receita)}</span></div>
    <div class="linha"><span class="nome">Compromissos pagos
      <small>${dinheiro(c.pendentes)} ainda a vencer</small></span>
      <span class="num neg">${dinheiro(c.pagos - c.reembolsado)}</span></div>
    <div class="linha"><span class="nome">Dia a dia
      ${quis ? `<small>destes, ${dinheiro(quis)} porque eu quis</small>` : ''}</span>
      <span class="num neg">${dinheiro(c.variaveis)}</span></div>
    ${c.meta ? `<div class="linha"><span class="nome">Guardar<small>meta do mês</small></span>
      <span class="num">${dinheiro(c.meta)}</span></div>` : ''}
  </section>

  ${cats.length ? `
  <h2 class="titulo">Dia a dia por categoria</h2>
  <section class="cartao">
    ${cats.map((x) => `
      <div class="linha">
        <span class="nome">${escapar(x.categoria)}
          <small>${Math.round((x.total / soma) * 100)}% do dia a dia</small></span>
        <span class="num neg">${dinheiro(x.total)}</span>
      </div>
      <div class="barra" style="margin:0 0 8px">
        <i style="width:${(x.total / maior) * 100}%;background:${
          x.categoria === CATEGORIA_QUIS ? 'var(--atencao)' : 'var(--acento)'}"></i>
      </div>`).join('')}
  </section>` : ''}

  <h2 class="titulo">Lançamentos &middot; ${lista.length}</h2>
  <section class="cartao">
    ${dias.map((d) => `
      <div class="dia-cab">
        <span>${cabecalhoDia(d.data)}</span>
        <span class="num neg">${dinheiro(d.total)}</span>
      </div>
      ${d.itens.map(lancamentoHTML).join('')}`).join('')}
  </section>`;
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
  const grupos = faixas(linhas);
  const maior = Math.max(...grupos.map((g) => g.comprometido)) || 1;
  const alivioTotal = linhas[0].comprometido - linhas[linhas.length - 1].comprometido;

  const agora = linhas[0];
  const sobra = agora.sobra;

  return `
  ${alivioTotal > 0 ? `
  <section class="cartao destaque ok">
    <div class="rotulo">Em 6 meses você libera</div>
    <div class="valor">${grande(alivioTotal)}</div>
    <div class="sub">por mês, conforme os parcelamentos terminam</div>
  </section>` : ''}

  <h2 class="titulo">Quanto os compromissos custam</h2>
  <section class="cartao">
    ${grupos.map((g, i) => `
      <div class="linha">
        <span class="nome">${g.rotulo}
          <small>${g.quantidade} ${g.quantidade === 1 ? 'conta' : 'contas'}${
            g.alivio > 0 ? ` · <b style="color:var(--ok)">${dinheiro(g.alivio)} a menos</b>` : ''}</small>
        </span>
        <span class="num neg">${dinheiro(g.comprometido)}</span>
      </div>
      <div class="barra" style="margin:0 0 10px">
        <i style="width:${(g.comprometido / maior) * 100}%;background:${
          i === 0 ? 'var(--acento)' : 'var(--texto-fraco)'}"></i>
      </div>
      ${g.terminando.length ? `<div class="termina">
        ✓ termina ${escapar(g.fim.rotulo)}: ${g.terminando.map((t) => escapar(t.nome)).join(', ')}</div>` : ''}
    `).join('')}
  </section>

  <h2 class="titulo">De onde sai a sobra</h2>
  <section class="cartao linhas">
    <div class="linha"><span class="nome">Renda do mês</span>
      <span class="num pos">${dinheiro(config.renda || 0)}</span></div>
    ${config.meta ? `<div class="linha"><span class="nome">Guardar<small>sua meta</small></span>
      <span class="num neg">−${dinheiro(config.meta)}</span></div>` : ''}
    <div class="linha"><span class="nome">Compromissos
      <small>${agora.quantidade} contas, já sem o que te devolvem</small></span>
      <span class="num neg">−${dinheiro(agora.comprometido)}</span></div>
    <div class="linha"><span class="nome">Dia a dia
      <small>sua média dos últimos meses</small></span>
      <span class="num neg">−${dinheiro(agora.variavelEstimado)}</span></div>
    <div class="linha total"><span class="nome"><b>Sobra estimada</b></span>
      <span class="num ${sobra < 0 ? 'neg' : 'pos'}"><b>${dinheiro(sobra)}</b></span></div>
  </section>

  ${sobra < 0 ? `
  <section class="cartao alerta">
    <b>As contas não fecham neste ritmo.</b>
    <p>Renda menos meta não cobre compromissos mais gasto médio — falta
    ${dinheiro(Math.abs(sobra))} por mês. Ou a meta de guardar cede, ou o dia a
    dia encolhe, ou algum compromisso sai.</p>
    ${alivioTotal > 0 ? `<p>A conta melhora sozinha ${dinheiro(alivioTotal)} até
    ${escapar(linhas[linhas.length - 1].rotulo)}, quando os parcelamentos terminarem.</p>` : ''}
  </section>` : ''}`;
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

  <h2 class="titulo">Leitura de QR</h2>
  <section class="cartao">
    <label class="troca">
      <input type="checkbox" id="buscarCNPJ" ${config.buscarCNPJ === false ? '' : 'checked'}>
      <span>Buscar o nome da loja pelo CNPJ
        <small>Consulta a BrasilAPI. Sai do celular só o CNPJ de quem te vendeu —
        nunca o valor nem o que você comprou. Desligado, o lançamento fica
        com o CNPJ mesmo.</small></span>
    </label>
  </section>

  <section class="cartao">
    <button class="secundario" id="exportar">Exportar backup (JSON)</button>
  </section>`;
}
