// engine.js — o cálculo do "posso gastar" e a projeção dos próximos meses.
// Funções puras: sem DOM, sem storage, sem rede.

/*
 * COMPROMISSO — o conceito central. Cobre com uma estrutura só tudo que se
 * repete todo mês, tenha fim ou não:
 *
 *   { id, nome, valor, dia, categoria, conta,
 *     inicio:  'YYYY-MM'          mês da primeira parcela
 *     parcelas: null | 48          null = indefinido (aluguel, luz, internet)
 *     reembolso: 0 | 950.40        quanto desse valor alguém te devolve }
 *
 * O que importa para o seu bolso é o LÍQUIDO: valor − reembolso. O empréstimo
 * da sua mãe entra cheio na planilha (porque é o que sai da conta), mas só o
 * líquido pesa no "posso gastar hoje".
 */

export const liquido = (c) => (c.valor || 0) - (c.reembolso || 0);

/* ---------- datas ---------- */

export const diasNoMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const diasRestantes = (d) => diasNoMes(d) - d.getDate() + 1;
export const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Quantos meses cheios separam 'YYYY-MM' da data de referência. */
export function mesesDesde(inicioYM, ref) {
  if (!inicioYM) return 0;
  const [a, m] = String(inicioYM).split('-').map(Number);
  return (ref.getFullYear() - a) * 12 + (ref.getMonth() - (m - 1));
}

export const doMes = (transacoes, ref) => {
  const mes = chaveMes(ref);
  return transacoes.filter((t) => String(t.data).slice(0, 7) === mes);
};

export const chaveDia = (d) => `${chaveMes(d)}-${String(d.getDate()).padStart(2, '0')}`;

export const doDia = (transacoes, ref) => {
  const dia = chaveDia(ref);
  return transacoes.filter((t) => String(t.data).slice(0, 10) === dia);
};

/** Quanto saiu do bolso num dia. Compromisso pago não conta: já estava previsto. */
export const gastoDoDia = (transacoes, ref) =>
  doDia(transacoes, ref)
    .filter((t) => t.valor < 0 && !t.compromissoId)
    .reduce((s, t) => s + Math.abs(t.valor), 0);

/**
 * A categoria do que não precisava. Fica isolada no motor porque é a única
 * que responde a uma pergunta diferente das outras: não "onde foi o dinheiro"
 * e sim "quanto disso eu escolhi gastar".
 */
export const CATEGORIA_QUIS = 'Por que eu quis';

export const gastoPorQuis = (transacoes, ref) =>
  doMes(transacoes, ref)
    .filter((t) => t.valor < 0 && t.categoria === CATEGORIA_QUIS)
    .reduce((s, t) => s + Math.abs(t.valor), 0);

/** Agrupa os lançamentos por dia, do mais recente para o mais antigo. */
export function porDia(transacoes, ref) {
  const mapa = new Map();
  for (const t of doMes(transacoes, ref)) {
    const d = String(t.data).slice(0, 10);
    if (!mapa.has(d)) mapa.set(d, []);
    mapa.get(d).push(t);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, itens]) => ({
      data,
      itens,
      total: itens.filter((t) => t.valor < 0).reduce((s, t) => s + Math.abs(t.valor), 0),
    }));
}

/* ---------- parcelas ---------- */

/**
 * Em que parcela este compromisso está no mês de referência.
 * Devolve null quando ainda não começou ou quando já terminou —
 * é assim que um parcelamento some sozinho da conta depois da última.
 */
export function parcelaNoMes(c, ref) {
  const n = mesesDesde(c.inicio, ref) + 1;
  if (c.inicio && n < 1) return null;
  if (c.parcelas && n > c.parcelas) return null;
  return {
    n: c.inicio ? n : null,
    total: c.parcelas || null,
    restam: c.parcelas ? c.parcelas - n : null,
    ultima: !!(c.parcelas && n === c.parcelas),
    faltaPagar: c.parcelas ? liquido(c) * (c.parcelas - n + 1) : null,
  };
}

/**
 * Dia em que a conta realmente vence no mês de referência.
 *
 * Muita cobrança vence "no último dia do mês", que em julho é 31 e em
 * setembro é 30. Guardar 31 e comparar cru faria setembro nunca marcar como
 * vencido. Grampear no tamanho do mês resolve os dois casos com um número só.
 */
export const diaNoMes = (dia, ref) => Math.min(dia || 1, diasNoMes(ref));

/** Compromissos vivos no mês, já com parcela e dia efetivo anexados. */
export function ativosNoMes(compromissos, ref) {
  return (compromissos || [])
    .map((c) => ({ ...c, parcela: parcelaNoMes(c, ref), diaEfetivo: diaNoMes(c.dia, ref) }))
    .filter((c) => c.parcela !== null)
    .sort((a, b) => a.diaEfetivo - b.diaEfetivo);
}

/* ---------- o cálculo principal ---------- */

export function calcular(transacoes, config, hoje = new Date()) {
  const mes = doMes(transacoes, hoje);
  const ativos = ativosNoMes(config.compromissos, hoje);

  // Reembolso recebido não é renda sua — é dinheiro de passagem.
  const entradas = mes.filter((t) => t.valor > 0 && !t.reembolso)
    .reduce((s, t) => s + t.valor, 0);
  const reembolsado = mes.filter((t) => t.valor > 0 && t.reembolso)
    .reduce((s, t) => s + t.valor, 0);

  const despesas = mes.filter((t) => t.valor < 0);
  const idsPagos = new Set(despesas.map((t) => t.compromissoId).filter(Boolean));

  const pagos = despesas.filter((t) => t.compromissoId)
    .reduce((s, t) => s + Math.abs(t.valor), 0);
  const variaveis = despesas.filter((t) => !t.compromissoId)
    .reduce((s, t) => s + Math.abs(t.valor), 0);

  // O que ainda vai cair antes do fim do mês. Dinheiro que já tem dono.
  const pendentes = ativos.filter((c) => !idsPagos.has(c.id))
    .reduce((s, c) => s + liquido(c), 0);

  const receita = Math.max(config.renda || 0, entradas);
  const meta = config.meta || 0;

  // Saiu do bolso de verdade: o que paguei menos o que me devolveram.
  const comprometidoPago = pagos - reembolsado;
  const sobra = receita - meta - comprometidoPago - variaveis - pendentes;

  const dias = diasRestantes(hoje);
  const orcamentoVariavel = receita - meta - comprometidoPago - pendentes;
  const ritmo = orcamentoVariavel / diasNoMes(hoje);
  const porDia = sobra / dias;

  let status = 'ok';
  if (sobra < 0) status = 'estourado';
  else if (porDia < ritmo * 0.5) status = 'atencao';

  return {
    receita, meta, reembolsado,
    pagos, pendentes, variaveis,
    comprometido: comprometidoPago + pendentes,
    sobra, dias, ritmo,
    porDia: Math.max(0, porDia),
    status,
    gastoTotal: comprometidoPago + variaveis,
    ativos,
    aPagar: ativos.filter((c) => !idsPagos.has(c.id)),
  };
}

/* ---------- projeção ---------- */

/** Média dos gastos variáveis dos últimos `n` meses fechados. */
export function mediaVariavel(transacoes, hoje = new Date(), n = 3) {
  const somas = [];
  for (let i = 1; i <= n; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const total = doMes(transacoes, ref)
      .filter((t) => t.valor < 0 && !t.compromissoId)
      .reduce((s, t) => s + Math.abs(t.valor), 0);
    if (total > 0) somas.push(total);
  }
  if (!somas.length) {
    // Sem histórico ainda: usa o ritmo do mês corrente extrapolado.
    const atual = doMes(transacoes, hoje)
      .filter((t) => t.valor < 0 && !t.compromissoId)
      .reduce((s, t) => s + Math.abs(t.valor), 0);
    return atual ? (atual / hoje.getDate()) * diasNoMes(hoje) : 0;
  }
  return somas.reduce((a, b) => a + b, 0) / somas.length;
}

/**
 * Como ficam os próximos meses. É o que responde "isso é só esse mês?" —
 * cada parcelamento que termina aparece como dinheiro que volta pro bolso.
 */
export function projecao(config, transacoes, meses = 6, hoje = new Date()) {
  const media = mediaVariavel(transacoes, hoje);
  const linhas = [];

  for (let i = 0; i <= meses; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ativos = ativosNoMes(config.compromissos, ref);
    const comprometido = ativos.reduce((s, c) => s + liquido(c), 0);
    const sobra = (config.renda || 0) - (config.meta || 0) - comprometido - media;

    linhas.push({
      ref,
      mes: chaveMes(ref),
      rotulo: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
        + '/' + String(ref.getFullYear()).slice(2),
      comprometido,
      sobra,
      variavelEstimado: media,
      terminando: ativos.filter((c) => c.parcela.ultima),
      quantidade: ativos.length,
    });
  }

  // Quanto cada mês libera em relação ao mês anterior.
  linhas.forEach((l, i) => {
    l.alivio = i === 0 ? 0 : linhas[i - 1].comprometido - l.comprometido;
  });

  return linhas;
}

/**
 * Junta meses seguidos que custam a mesma coisa numa faixa só.
 *
 * Sete linhas repetindo três valores é o que fazia a tela de futuro parecer
 * bagunçada: o olho procura a diferença e não acha, porque quase não há.
 * Uma faixa por patamar deixa visível o que de fato importa — quando a conta
 * muda, e quanto ela cai.
 */
export function faixas(linhas) {
  const grupos = [];
  for (const l of linhas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo.comprometido - l.comprometido) < 0.005) {
      ultimo.fim = l;
      ultimo.meses.push(l);
      // Quem termina no último mês da faixa é quem faz a faixa acabar.
      if (l.terminando.length) ultimo.terminando = l.terminando;
    } else {
      grupos.push({
        inicio: l, fim: l, meses: [l],
        comprometido: l.comprometido,
        sobra: l.sobra,
        quantidade: l.quantidade,
        variavelEstimado: l.variavelEstimado,
        terminando: l.terminando,
        alivio: l.alivio,
      });
    }
  }

  return grupos.map((g) => ({
    ...g,
    rotulo: g.inicio === g.fim ? g.inicio.rotulo : `${g.inicio.rotulo} – ${g.fim.rotulo}`,
  }));
}

/**
 * Total gasto por categoria no mês, do maior para o menor.
 *
 * `soVariaveis` existe porque misturar os dois tipos de gasto numa lista só
 * torna a lista inútil: a fatura do cartão sozinha esmaga todo o resto, e a
 * barra do almoço de R$ 22 vira um fio invisível ao lado dela. Compromisso
 * você já sabe que tem; o que a lista precisa responder é para onde foi o
 * dinheiro que você escolheu gastar.
 */
export function porCategoria(transacoes, ref = new Date(), soVariaveis = false) {
  const acc = new Map();
  for (const t of doMes(transacoes, ref)) {
    if (t.valor >= 0) continue;
    if (soVariaveis && t.compromissoId) continue;
    const k = t.categoria || 'Sem categoria';
    acc.set(k, (acc.get(k) || 0) + Math.abs(t.valor));
  }
  return [...acc.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}
