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

/*
 * Três perguntas diferentes, que a maioria das planilhas mistura numa só:
 *
 *   valorNoMes      quanto a conta cobra NESTE mês
 *   reembolsoNoMes  quanto disso volta para você
 *   liquidoNoMes    quanto de fato sai do seu bolso
 *
 * O consignado que você pegou para emprestar a alguém é o caso que obriga a
 * separar as três. A primeira parcela vem inflada pelo seguro, cobrado uma
 * única vez; as outras 47 são lisas. E como quem pegou o dinheiro devolve o
 * valor cheio, o líquido é zero o tempo todo — ele passa pela sua conta sem
 * nunca ser seu. Uma planilha que só guarda "valor" não sabe dizer nada
 * disso, e é por isso que parcelado fica difícil de entender nela.
 */

/** Quanto esta conta cobra no mês de referência, seguro da 1ª parcela incluso. */
export function valorNoMes(c, ref) {
  const p = parcelaNoMes(c, ref);
  if (!p) return 0;
  // p.n só é preenchido quando o compromisso tem mês de início — sem ele não
  // há "primeira parcela" para o seguro se agarrar, e o extra é ignorado.
  return (c.valor || 0) + (p.n === 1 ? (c.extraPrimeira || 0) : 0);
}

/** Quanto te devolvem naquele mês. */
export function reembolsoNoMes(c, ref) {
  return c.reembolsoTotal ? valorNoMes(c, ref) : (c.reembolso || 0);
}

export const liquidoNoMes = (c, ref) => valorNoMes(c, ref) - reembolsoNoMes(c, ref);

/** Versão sem mês de referência, para quem só precisa do caso comum. */
export const liquido = (c) => (c.valor || 0) - (c.reembolsoTotal ? (c.valor || 0) : (c.reembolso || 0));

/**
 * Quanto ainda falta pagar do próprio bolso até a última parcela.
 *
 * `desde` é o número da primeira parcela em aberto. Sem ele, a conta começa
 * na parcela que o CALENDÁRIO cobra — o que erra para quem adiantou (já pagou
 * mais do que o mês pede) e para quem atrasou. É este número que você compara
 * com o "valor a pagar" do site da cobrança, então ele tem que refletir o que
 * foi pago, não o mês em que estamos.
 */
export function faltaPagar(c, ref, desde) {
  const p = parcelaNoMes(c, ref);
  if (!p || !p.total) return null;

  const inicio = Math.min(desde || p.n, p.total + 1);
  let soma = 0;
  for (let i = inicio; i <= p.total; i++) {
    const m = new Date(ref.getFullYear(), ref.getMonth() + (i - p.n), 1);
    soma += liquidoNoMes(c, m);
  }
  return soma;
}

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

/**
 * Onde este compromisso está, comparando o que o calendário cobra com o que
 * já foi pago.
 *
 * Para parcelamento vale a CONTAGEM de parcelas quitadas, não o mês em que
 * cada uma saiu. Quem adianta a parcela de outubro em setembro fica com dois
 * pagamentos em setembro e nenhum em outubro — perguntando "paguei neste
 * mês?", outubro voltaria a cobrar uma parcela já quitada. Contando, "paguei
 * 4 de 6" continua verdade em qualquer mês.
 *
 * Conta indefinida (luz, internet) não tem contagem que acabe, então para ela
 * a pergunta certa continua sendo a do mês.
 */
export function situacao(c, transacoes, ref) {
  const pagamentos = (transacoes || [])
    .filter((t) => t.compromissoId === c.id && t.valor < 0);

  if (!c.parcelas) {
    const mes = chaveMes(ref);
    const pagoNoMes = pagamentos.some((t) => String(t.data).slice(0, 7) === mes);
    return { pendente: !pagoNoMes, pagas: pagamentos.length, adiantadas: 0, quitado: false };
  }

  const pagas = pagamentos.length;
  const cobradas = c.inicio ? mesesDesde(c.inicio, ref) + 1 : 1;
  const quitado = pagas >= c.parcelas;

  return {
    pagas,
    quitado,
    pendente: !quitado && pagas < cobradas,
    adiantadas: Math.max(0, Math.min(pagas, c.parcelas) - cobradas),
    faltam: Math.max(0, c.parcelas - pagas),
    proxima: Math.min(pagas + 1, c.parcelas),
  };
}

/** Compromissos vivos no mês, já com parcela, dia efetivo e situação. */
export function ativosNoMes(compromissos, ref, transacoes) {
  return (compromissos || [])
    .map((c) => ({ ...c, parcela: parcelaNoMes(c, ref), diaEfetivo: diaNoMes(c.dia, ref) }))
    .filter((c) => c.parcela !== null)
    .map((c) => {
      const s = situacao(c, transacoes, ref);
      return {
        ...c,
        valorMes: valorNoMes(c, ref),
        reembolsoMes: reembolsoNoMes(c, ref),
        liquidoMes: liquidoNoMes(c, ref),
        // O que falta conta a partir da primeira parcela em aberto.
        parcela: { ...c.parcela, faltaPagar: faltaPagar(c, ref, (s.pagas || 0) + 1) },
        situacao: s,
      };
    })
    .sort((a, b) => a.diaEfetivo - b.diaEfetivo);
}

/* ---------- o cálculo principal ---------- */

export function calcular(transacoes, config, hoje = new Date()) {
  const mes = doMes(transacoes, hoje);
  const ativos = ativosNoMes(config.compromissos, hoje, transacoes);

  // Reembolso recebido não é renda sua — é dinheiro de passagem.
  const entradas = mes.filter((t) => t.valor > 0 && !t.reembolso)
    .reduce((s, t) => s + t.valor, 0);
  const reembolsado = mes.filter((t) => t.valor > 0 && t.reembolso)
    .reduce((s, t) => s + t.valor, 0);

  const despesas = mes.filter((t) => t.valor < 0);

  const pagos = despesas.filter((t) => t.compromissoId)
    .reduce((s, t) => s + Math.abs(t.valor), 0);
  const variaveis = despesas.filter((t) => !t.compromissoId)
    .reduce((s, t) => s + Math.abs(t.valor), 0);

  // O que ainda vai cair antes do fim do mês. Dinheiro que já tem dono.
  // Quem está adiantado não entra: já pagou, e o gasto ficou registrado no
  // mês em que de fato saiu do bolso.
  const pendentes = ativos.filter((c) => c.situacao.pendente)
    .reduce((s, c) => s + c.liquidoMes, 0);

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
    aPagar: ativos.filter((c) => c.situacao.pendente),
    // Conta paga não some da tela. Sumir é indistinguível de "eu esqueci de
    // cadastrar", e a pergunta "já paguei a luz?" fica sem resposta.
    pagas: ativos.filter((c) => !c.situacao.pendente),
  };
}

/**
 * Divide os compromissos do mês em contas fixas e parcelamentos.
 *
 * São dois tipos de dívida com futuros opostos: a fixa continua para sempre
 * e a parcelada tem data para acabar. Somar as duas num número só esconde
 * exatamente a informação que interessa — quanto do que você paga hoje é
 * temporário.
 */
export function porTipo(config, ref = new Date(), transacoes = []) {
  const ativos = ativosNoMes(config.compromissos, ref, transacoes);
  const fixas = ativos.filter((c) => !c.parcela.total);
  const parceladas = ativos.filter((c) => c.parcela.total);
  const soma = (lista) => lista.reduce((s, c) => s + c.liquidoMes, 0);

  return {
    fixas,
    parceladas,
    totalFixas: soma(fixas),
    totalParceladas: soma(parceladas),
    total: soma(ativos),
    // O que ainda falta pagar até a última parcela de tudo — o equivalente
    // ao "faturas futuras" de um cartão.
    faltaTotal: parceladas.reduce((s, c) => s + (c.parcela.faltaPagar || 0), 0),
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
    // Parcelamento já quitado não pesa mais nos meses à frente, mesmo que o
    // calendário ainda o mostrasse — foi exatamente isso que adiantar comprou.
    const ativos = ativosNoMes(config.compromissos, ref, transacoes)
      .filter((c) => !c.situacao.quitado);
    const comprometido = ativos.reduce((s, c) => s + c.liquidoMes, 0);
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
