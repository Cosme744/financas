// telas.js — renderização. Cada função devolve HTML; os eventos são ligados depois.

import { calcular, porCategoria, doMes, doDia, porDia, projecao, faixas, liquido, porTipo,
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
  if (!p || !p.total) return 'todo mês, sem fim previsto';
  if (p.ultima) return `<b style="color:var(--ok)">última parcela (${p.n} de ${p.total})</b>`;
  const restante = p.faltaPagar ? `, ainda faltam ${dinheiro(p.faltaPagar)}` : '';
  return `parcela ${p.n} de ${p.total}${restante}`;
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

  ${(c.aPagar.length || c.pagas.length) ? `
  <h2 class="titulo">Contas do mês</h2>
  <section class="cartao">
    <div class="resumo-pagar">
      <span>${c.pagas.length} de ${c.ativos.length} ${c.ativos.length === 1 ? 'paga' : 'pagas'}</span>
      ${c.pendentes > 0
        ? `<b class="num neg">faltam ${dinheiro(c.pendentes)}</b>`
        : '<b class="num pos">tudo pago ✓</b>'}
    </div>

    ${c.aPagar.map((x) => contaHTML(x, hojeDia, false)).join('')}
    ${c.pagas.map((x) => contaHTML(x, hojeDia, true)).join('')}
  </section>` : ''}

  ${recentes.length ? `
  <h2 class="titulo">${ehMesCorrente && lancHoje.length ? 'O que gastei hoje' : 'Últimos lançamentos'}</h2>
  <section class="cartao linhas">${recentes.map(lancamentoHTML).join('')}</section>` : ''}`;
}

/* A linha inteira é o alvo do toque: alvo grande, e nada de ícone de lápis
   competindo por espaço num extrato que já é denso. */
const lancamentoHTML = (t) => `
  <div class="linha editavel" data-editar="${t.id}" role="button" tabindex="0">
    <span class="nome">${escapar(t.categoria || 'Sem categoria')}
      <small>${diaBR(t.data)}${t.metodo ? ' · ' + (NOME_METODO[t.metodo] || escapar(t.metodo)) : ''}${
        t.nota ? ' · ' + escapar(t.nota) : ''}${t.auto ? ' · auto' : ''}</small>
    </span>
    <span class="num ${t.valor < 0 ? 'neg' : 'pos'}">${dinheiro(t.valor)}</span>
  </div>`;

/* ===================== EDITAR LANÇAMENTO ===================== */

/**
 * Painel de edição, aberto por cima da tela atual.
 *
 * Só existe porque lançar rápido e lançar certo são coisas diferentes: o
 * teclado da aba Lançar é feito para ser rápido, e erra. Sem poder corrigir,
 * a saída seria abrir a planilha no computador — exatamente o que o app
 * existe para evitar.
 */
export function painelEditar(t) {
  const v = Math.abs(t.valor).toFixed(2).replace('.', ',');
  const cats = [...new Set([...CATEGORIAS, t.categoria].filter(Boolean))];
  return `
  <div class="folha-fundo" id="fecharEdicao"></div>
  <div class="folha">
    <div class="folha-topo">
      <b>Editar lançamento</b>
      <button class="chip" id="fecharEdicaoX" aria-label="Fechar">✕</button>
    </div>

    <div class="tipo">
      <button data-etipo="saida" class="${t.valor < 0 ? 'on' : ''}">Gasto</button>
      <button data-etipo="entrada" class="${t.valor >= 0 ? 'on' : ''}">Entrada</button>
    </div>

    <label class="campo"><span>Valor (R$)</span>
      <input type="text" inputmode="decimal" id="eValor" value="${v}"></label>

    <label class="campo"><span>Data</span>
      <input type="date" id="eData" value="${escapar(String(t.data).slice(0, 10))}"></label>

    <div class="rotulo-campo">Como pagou</div>
    <div class="chips">
      ${METODOS.map((m) =>
        `<button class="chip ${t.metodo === m.id ? 'on' : ''}" data-emetodo="${m.id}">${m.nome}</button>`).join('')}
    </div>

    <div class="rotulo-campo">Categoria</div>
    <div class="chips">
      ${cats.map((cat) =>
        `<button class="chip ${t.categoria === cat ? 'on' : ''}" data-ecat="${escapar(cat)}">${escapar(cat)}</button>`).join('')}
    </div>

    <label class="campo" style="margin-top:16px"><span>Descrição</span>
      <input id="eNota" value="${escapar(t.nota || '')}" placeholder="opcional"></label>

    ${t.compromissoId ? `<p class="aviso-edicao">Este lançamento pagou um compromisso.
      Apagá-lo faz a conta voltar a aparecer como a vencer.</p>` : ''}

    <button class="principal" id="eSalvar">Salvar</button>
    <button class="secundario perigo" id="eApagar">Apagar lançamento</button>
  </div>`;
}

/**
 * Uma conta do mês, paga ou não.
 *
 * Paga fica na lista, apagada e riscada, em vez de desaparecer: sumir é
 * indistinguível de "eu nunca cadastrei isso", e aí a pergunta que a tela
 * existe para responder — já paguei a luz? — volta sem resposta.
 */
function contaHTML(x, hojeDia, paga) {
  const atrasada = !paga && x.diaEfetivo < hojeDia;
  const doBolso = x.liquidoMes !== x.valorMes;
  return `
  <div class="conta ${paga ? 'paga' : ''} ${atrasada ? 'atrasada' : ''}">
    <div class="conta-topo">
      <span class="conta-nome">${paga ? '✓ ' : ''}${escapar(x.nome)}</span>
      <span class="num ${paga ? '' : 'neg'}">${dinheiro(x.valorMes)}</span>
    </div>
    <div class="conta-info">
      ${paga ? '<span class="tag pago">PAGA</span>'
        : (atrasada ? `<span class="tag vencida">venceu dia ${x.diaEfetivo}</span>`
                    : `<span class="tag">vence dia ${x.diaEfetivo}</span>`)}
      <span>${selo(x)}</span>
    </div>
    ${doBolso ? `<div class="conta-info">
      <span class="tag passagem">${x.liquidoMes === 0
        ? 'devolvem tudo — não sai do seu bolso'
        : `do seu bolso: ${dinheiro(x.liquidoMes)}`}</span>
    </div>` : ''}
    ${paga ? '' : `<button class="secundario pagar" data-pagar="${x.id}">Marcar como paga</button>`}
  </div>`;
}

/* ===================== LANÇAR ===================== */

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let rascunho = { centavos: 0, categoria: 'Mercado', tipo: 'saida', metodo: 'pix',
                 qr: null, data: hojeISO() };

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

    <!-- A data é de hoje sozinha; o campo existe para os casos em que você
         só lembra de lançar no dia seguinte. -->
    <div class="linha-data">
      <label for="lData">${rascunho.data === hojeISO() ? 'Hoje' : 'Em'}</label>
      <input type="date" id="lData" value="${rascunho.data}" max="${hojeISO()}">
    </div>
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
        // A nota fiscal entra com a data e o id dela; o resto do app não
        // precisa saber que veio de um QR além do rótulo "auto" na lista.
        data: q ? q.data : rascunho.data,
        nota: q ? q.quem : '',
        id: q ? q.id : null,
        origem: q ? q.tipo : 'app',
      });
      // Mantém categoria e método: quem lança mercado no crédito
      // costuma lançar de novo do mesmo jeito.
      // A data volta para hoje: lançar ontem é exceção, não o novo padrão.
      rascunho = { centavos: 0, categoria: rascunho.categoria, tipo: 'saida',
                   metodo: rascunho.metodo, qr: null, data: hojeISO() };
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

/*
 * Uma pergunta só: quando isso melhora, e quanto?
 *
 * A versão anterior tentava responder três — quanto custa, como fica cada
 * mês, e quanto sobra — e a de "quanto sobra" dependia de uma média estimada
 * que ninguém sabia de onde vinha. Três respostas mornas numa tela só é o
 * que a fazia parecer confusa. O quanto sobra já está na Hoje, com números
 * reais; aqui fica só o que a Hoje não sabe dizer: o calendário do alívio.
 */
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
  const hoje = linhas[0];

  // Um evento por mês em que a conta encolhe. Quem termina em outubro só
  // alivia em novembro, então o alívio é lido do mês seguinte.
  const eventos = [];
  linhas.forEach((l, i) => {
    if (i === 0 || l.alivio <= 0.005) return;
    eventos.push({
      // Duas datas, e confundir as duas é o que fazia a tela mentir: a última
      // parcela é paga num mês, e o dinheiro só sobra no seguinte.
      pagaAte: linhas[i - 1].rotulo,
      aliviaEm: l.rotulo,
      terminou: linhas[i - 1].terminando,
      alivio: l.alivio,
      passaA: l.comprometido,
    });
  });

  const totalAlivio = hoje.comprometido - linhas[linhas.length - 1].comprometido;
  const ultimo = linhas[linhas.length - 1].rotulo;

  const listar = (cs) => cs.map((c) => escapar(c.nome)).join(' e ');

  const t = porTipo(config);

  const linhaComp = (x, mostrarParcela) => `
    <div class="linha">
      <span class="nome">${escapar(x.nome)}
        ${mostrarParcela
          ? `<small>parcela ${x.parcela.n} de ${x.parcela.total}${
              x.liquidoMes === 0 ? ' · devolvido, R$ 0,00 seu'
                                 : ` · ainda faltam ${dinheiro(x.parcela.faltaPagar)}`}</small>`
          : '<small>todo mês, sem fim previsto</small>'}
      </span>
      <span class="num neg">${dinheiro(x.valorMes)}</span>
    </div>`;

  return `
  <section class="cartao destaque">
    <div class="rotulo">Você paga por mês</div>
    <div class="valor">${grande(t.total)}</div>
    <div class="sub">é a soma das duas listas abaixo</div>
  </section>

  ${t.fixas.length ? `
  <h2 class="titulo">Contas fixas &middot; ${dinheiro(t.totalFixas)} por mês</h2>
  <section class="cartao linhas">
    ${t.fixas.map((x) => linhaComp(x, false)).join('')}
  </section>
  <p class="ajuda">Não têm fim previsto — vão continuar todo mês enquanto
  existirem. Só saem daqui se você apagar em Ajustes.</p>` : ''}

  ${t.parceladas.length ? `
  <h2 class="titulo">Parcelamentos &middot; ${dinheiro(t.totalParceladas)} por mês</h2>
  <section class="cartao linhas">
    ${t.parceladas.map((x) => linhaComp(x, true)).join('')}
    <div class="linha total">
      <span class="nome"><b>Falta pagar no total</b>
        <small>somando todas as parcelas que ainda vêm</small></span>
      <span class="num neg"><b>${dinheiro(t.faltaTotal)}</b></span>
    </div>
  </section>
  <p class="ajuda">Estes têm data para acabar. É a parte do que você paga hoje
  que é <b>temporária</b> — e é ela que aparece no calendário abaixo.</p>` : ''}

  <h2 class="titulo">Quando isso diminui</h2>
  <section class="cartao">
    ${eventos.length ? eventos.map((e) => `
      <div class="evento">
        <div class="evento-quando">${escapar(e.pagaAte)}</div>
        <div class="evento-corpo">
          <div class="evento-fim">✓ última parcela ${e.terminou.length === 1 ? 'do' : 'de'}
            ${listar(e.terminou)}</div>
          <div class="evento-numeros">
            <b class="pos">${dinheiro(e.alivio)} a menos por mês</b>
            <span>de ${escapar(e.aliviaEm)} em diante você paga ${dinheiro(e.passaA)}</span>
          </div>
        </div>
      </div>`).join('')
    : `<p class="ajuda" style="margin:0">Nenhum dos seus compromissos termina nos
       próximos 6 meses. Os que têm parcela contada vão aparecer aqui conforme
       a última se aproximar.</p>`}
  </section>

  ${totalAlivio > 0 ? `
  <section class="cartao fecho">
    Somando tudo, em <b>${escapar(ultimo)}</b> você estará pagando
    <b class="pos">${dinheiro(totalAlivio)} a menos</b> por mês do que hoje.
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
      <div class="linha editavel" data-comp="${c.id}" role="button" tabindex="0">
        <span class="nome">${escapar(c.nome)}
          <small>dia ${c.dia} · ${c.parcelas ? c.parcelas + 'x desde ' + escapar(c.inicio || '?') : 'todo mês'}</small>
          ${c.extraPrimeira ? `<small>1ª parcela ${dinheiro(c.valor + c.extraPrimeira)} — inclui ${dinheiro(c.extraPrimeira)} cobrados uma vez</small>` : ''}
          ${c.reembolsoTotal
            ? '<small class="passagem">devolvem o valor cheio · R$ 0,00 do seu bolso</small>'
            : (c.reembolso ? `<small class="passagem">devolvem ${dinheiro(c.reembolso)} · ${dinheiro(c.valor - c.reembolso)} do seu bolso</small>` : '')}
        </span>
        <span class="num neg">${dinheiro(c.valor)}</span>
      </div>`).join('')
      : '<div style="color:var(--texto-fraco);font-size:14px">Nada cadastrado ainda.</div>'}
  </section>

  <section class="cartao" id="formComp">
    <div class="folha-topo"><b id="cTitulo">Novo compromisso</b>
      <button class="chip" id="cCancelar" hidden aria-label="Cancelar">✕</button></div>
    <input type="hidden" id="cId" value="">

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

    <label class="campo"><span>Cobrança extra só na 1ª parcela (R$)</span>
      <input type="number" inputmode="decimal" id="cExtra" placeholder="0,00">
      <small class="ajuda">Seguro de consignado, taxa de adesão, entrada — o que
      é cobrado uma vez só e faz a primeira parcela vir maior que as outras.</small></label>

    <div class="rotulo-campo">Alguém te devolve esse dinheiro?</div>
    <div class="chips" style="margin-bottom:10px">
      <button class="chip" data-reemb="nao">Não, é meu gasto</button>
      <button class="chip" data-reemb="total">Sim, o valor cheio</button>
      <button class="chip" data-reemb="parte">Sim, uma parte</button>
    </div>
    <label class="campo" id="campoReembolso" hidden><span>Quanto te devolvem por mês (R$)</span>
      <input type="number" inputmode="decimal" id="cReembolso" placeholder="0,00"></label>
    <p class="ajuda" id="ajudaReembolso">Empréstimo que você pegou para outra pessoa
    entra aqui: sai da sua conta, mas não é seu gasto. Marcado assim, o app
    desconta do "posso gastar" só o que sobra para você.</p>

    <button class="secundario" id="addComp">Adicionar compromisso</button>
    <button class="secundario perigo" id="delComp" hidden>Apagar compromisso</button>
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
    <p class="ajuda" style="margin-top:0">Na aba <b>Lançar</b>, o botão
    <b>Escanear QR</b> lê o QR do <b>cupom fiscal</b> e o de <b>cobrança Pix</b>.
    Ele preenche o que conseguir e você confirma — nada é lançado sozinho.</p>

    <label class="troca">
      <input type="checkbox" id="buscarCNPJ" ${config.buscarCNPJ === false ? '' : 'checked'}>
      <span>Trocar o CNPJ pelo nome da loja
        <small>O cupom fiscal traz o CNPJ de quem vendeu, não o nome. Ligado, o
        app pergunta o nome na BrasilAPI e o lançamento fica "Supermercado X"
        em vez de "CNPJ 12.345.678/0001-95".</small>
        <small>Sai do celular só esse CNPJ, que é informação pública de
        empresa. O valor e o que você comprou nunca saem.</small></span>
    </label>

    <button class="secundario" id="testarQR" style="margin-top:14px">Testar a leitura</button>
    <small class="ajuda">Abre uma página que lê um QR e mostra o que ele
    entendeu, <b>sem lançar nada</b>. Serve para testar um cupom seu antes de
    confiar no scanner.</small>
  </section>

  <section class="cartao">
    <button class="secundario" id="exportar">Exportar backup (JSON)</button>
  </section>`;
}
