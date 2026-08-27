/**
 * Code.gs — backend do "Meu Dinheiro", rodando dentro da sua própria planilha.
 *
 *   1. API JSON para o app do celular
 *   2. Lê e-mails de compra no Gmail e lança sozinho
 *   3. Recebe notificações do celular (MacroDroid) e lança sozinho
 *   4. Avisa no celular sobre conta a vencer e quanto ainda dá para gastar
 *   5. Importa a sua planilha antiga para o novo formato
 *
 * Nada sai da sua conta Google: o script roda como você, na sua planilha.
 */

// ============================================================
// CONFIGURAÇÃO — nas Propriedades do Script, não neste arquivo
// ============================================================
//
// Este arquivo é público no GitHub, então nada pessoal pode morar nele.
// Os seus valores ficam em Configurações do projeto › Propriedades do script,
// que é área privada da sua conta Google e não sai daqui.
//
// Isso resolve dois problemas de uma vez:
//
//   1. O token deixa de correr o risco de ir parar num commit.
//   2. Colar uma versão nova deste arquivo por cima da antiga não apaga mais
//      as suas configurações — antes, cada atualização exigia redigitar tudo.
//
// Rode `diagnostico()` no editor para ver o que está preenchido.

const PADRAO = {
  TOKEN: '',

  TELEGRAM_BOT_TOKEN: '',   // recomendado: privado de verdade
  TELEGRAM_CHAT_ID: '',
  NTFY_TOPICO: '',          // alternativa sem cadastro; use nome longo e aleatório

  // Os domínios dos SEUS bancos. Para descobrir o certo, procure no Gmail
  // por uma compra recente e veja de quem veio a mensagem.
  GMAIL_BUSCA: '(from:seubanco.com.br) (subject:compra OR subject:aprovada OR subject:transação)',

  AVISAR_DIAS_ANTES: '2',

  // Aba de origem do importador. Aceita nome parcial; se casar com mais de
  // uma aba, o script reclama e pede o nome completo em vez de escolher.
  ABA_ANTIGA: 'Financeiro',
  ABA_ANTIGA_2: '',         // segunda planilha de origem, se você tiver duas
};

let _cfg = null;

/**
 * Lê as propriedades uma vez por execução.
 *
 * Preguiçoso de propósito: se isto rodasse no topo do arquivo, uma conta
 * ainda não autorizada quebraria TODAS as funções, inclusive a `instalar`
 * que existe justamente para autorizar.
 */
function cfg() {
  if (_cfg) return _cfg;
  let salvas = {};
  try { salvas = PropertiesService.getScriptProperties().getProperties(); } catch (e) {}

  _cfg = Object.assign({}, PADRAO);
  Object.keys(salvas).forEach(function (k) {
    if (String(salvas[k]).trim() !== '') _cfg[k] = salvas[k];
  });
  _cfg.AVISAR_DIAS_ANTES = Number(_cfg.AVISAR_DIAS_ANTES) || 2;
  return _cfg;
}

/** Mostra o que está configurado sem revelar segredo nenhum. */
function diagnostico() {
  const c = cfg();
  const esconde = function (v) { return v ? 'definido (' + String(v).length + ' caracteres)' : '— VAZIO —'; };
  const linhas = [
    'TOKEN................: ' + esconde(c.TOKEN),
    'TELEGRAM_BOT_TOKEN...: ' + esconde(c.TELEGRAM_BOT_TOKEN),
    'TELEGRAM_CHAT_ID.....: ' + esconde(c.TELEGRAM_CHAT_ID),
    'NTFY_TOPICO..........: ' + esconde(c.NTFY_TOPICO),
    'GMAIL_BUSCA..........: ' + c.GMAIL_BUSCA,
    'AVISAR_DIAS_ANTES....: ' + c.AVISAR_DIAS_ANTES,
    'ABA_ANTIGA...........: ' + c.ABA_ANTIGA,
  ];
  if (!c.TOKEN) {
    linhas.push('');
    linhas.push('⚠ Sem TOKEN o app do celular não consegue falar com a planilha.');
    linhas.push('  Configurações do projeto › Propriedades do script › Adicionar.');
  }
  const texto = linhas.join('\n');
  Logger.log(texto);
  return texto;
}

const ABAS = { LANC: 'Lancamentos', COMP: 'Compromissos', CFG: 'Config', LOG: 'Auto' };

const COLUNAS = ['id', 'data', 'valor', 'categoria', 'conta', 'nota', 'metodo',
                 'compromissoId', 'reembolso', 'origem', 'criadoEm'];

const COLUNAS_COMP = ['id', 'nome', 'valor', 'dia', 'categoria', 'conta',
                      'inicio', 'parcelas', 'reembolso'];

// ============================================================
// API
// ============================================================

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);

    // Token vazio recusa TUDO. Sem esta primeira linha, um script recém-colado
    // e ainda não configurado aceitaria qualquer chamada que mandasse
    // "token": "" — e o Web App está publicado para quem tiver a URL.
    const esperado = cfg().TOKEN;
    if (!esperado) return json({ ok: false, erro: 'Backend sem TOKEN configurado' });
    if (req.token !== esperado) return json({ ok: false, erro: 'Token inválido' });

    switch (req.acao) {
      case 'inserir': return json({ ok: true, salvos: inserir(req.transacoes || []).ids });
      case 'listar':  return json({ ok: true, transacoes: listar(req.desde) });
      case 'config':  return json({ ok: true, config: lerConfig() });
      case 'gravarConfig': return json({ ok: true, compromissos: gravarConfig(req.config || {}) });
      case 'notificacao': return json({ ok: true, lancado: lancarDeTexto(req.texto, req.app || 'push') });
      default: return json({ ok: false, erro: 'Ação desconhecida: ' + req.acao });
    }
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  }
}

function doGet() {
  return json({ ok: true, vivo: true, hora: new Date().toISOString() });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Persistência
// ============================================================

function aba(nome, cabecalho) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(nome);
  if (!s) {
    s = ss.insertSheet(nome);
    if (cabecalho) s.appendRow(cabecalho);
  }
  return s;
}

/**
 * Insere ignorando ids que já existem — reenvio do app nunca duplica.
 *
 * Uma leitura da coluna de ids e uma escrita, não importa quantas transações
 * cheguem. Chamar isto dentro de um laço é o caminho curto para estourar a
 * cota de gatilhos, então prefira juntar o lote e chamar uma vez só.
 */
function inserir(transacoes) {
  if (!transacoes.length) return { ids: [], novos: 0 };
  const s = aba(ABAS.LANC, COLUNAS);
  const existentes = new Set(idsExistentes(s));

  const novas = [];
  transacoes.forEach((t) => {
    if (existentes.has(t.id)) return;
    existentes.add(t.id);   // pega também duplicata dentro do próprio lote
    novas.push(t);
  });

  if (novas.length) {
    const linhas = novas.map((t) =>
      COLUNAS.map((c) => (t[c] !== undefined && t[c] !== null ? t[c] : '')));
    s.getRange(s.getLastRow() + 1, 1, linhas.length, COLUNAS.length).setValues(linhas);
  }
  return { ids: transacoes.map((t) => t.id), novos: novas.length };
}

function idsExistentes(s) {
  const n = s.getLastRow() - 1;
  if (n < 1) return [];
  return s.getRange(2, 1, n, 1).getValues().map((r) => String(r[0]));
}

function listar(desde) {
  const s = aba(ABAS.LANC, COLUNAS);
  const n = s.getLastRow() - 1;
  if (n < 1) return [];

  const dados = s.getRange(2, 1, n, COLUNAS.length).getValues();
  const corte = desde || '0000-01-01';

  return dados.map((linha) => {
    const t = {};
    COLUNAS.forEach((c, i) => { t[c] = linha[i]; });
    t.data = comoISO(t.data);
    t.valor = Number(t.valor) || 0;
    t.reembolso = t.reembolso === true || String(t.reembolso).toUpperCase() === 'TRUE';
    t.auto = !!t.origem && t.origem !== 'app';
    return t;
  }).filter((t) => t.data >= corte);
}

function comoISO(v) {
  if (v instanceof Date) return Utilities.formatDate(v, fuso(), 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

const fuso = () =>
  SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'America/Sao_Paulo';

const hojeISO = () => Utilities.formatDate(new Date(), fuso(), 'yyyy-MM-dd');

/** Config e compromissos vivem em abas próprias para você poder editar na mão. */
function lerConfig() {
  const c = aba(ABAS.CFG, ['chave', 'valor']);
  const pares = {};
  const n = c.getLastRow() - 1;
  if (n > 0) {
    c.getRange(2, 1, n, 2).getValues()
      .forEach((r) => { pares[String(r[0]).trim()] = r[1]; });
  }

  const f = aba(ABAS.COMP, COLUNAS_COMP);
  const m = f.getLastRow() - 1;
  const compromissos = m > 0
    ? f.getRange(2, 1, m, COLUNAS_COMP.length).getValues()
        .filter((r) => r[1])
        .map((r) => ({
          id: String(r[0]),
          nome: String(r[1]),
          valor: Number(r[2]) || 0,
          dia: Number(r[3]) || 1,
          categoria: String(r[4] || r[1]),
          conta: String(r[5] || ''),
          inicio: r[6] ? String(r[6] instanceof Date
            ? Utilities.formatDate(r[6], fuso(), 'yyyy-MM') : r[6]).slice(0, 7) : null,
          parcelas: Number(r[7]) || null,
          reembolso: Number(r[8]) || 0,
        }))
    : [];

  return { renda: Number(pares.renda) || 0, meta: Number(pares.meta) || 0, compromissos: compromissos };
}

/**
 * Grava renda, meta e compromissos vindos do app.
 *
 * As abas são reescritas por inteiro, não mescladas: o app é o editor e a
 * planilha é o espelho. Mesclar exigiria resolver conflito entre dois lados
 * editáveis, complexidade que um app de uma pessoa só não precisa carregar.
 */
function gravarConfig(cfg) {
  const c = aba(ABAS.CFG, ['chave', 'valor']);
  const n = c.getLastRow() - 1;
  if (n > 0) c.getRange(2, 1, n, 2).clearContent();
  c.getRange(2, 1, 2, 2).setValues([
    ['renda', Number(cfg.renda) || 0],
    ['meta', Number(cfg.meta) || 0],
  ]);

  const f = aba(ABAS.COMP, COLUNAS_COMP);
  const m = f.getLastRow() - 1;
  if (m > 0) f.getRange(2, 1, m, COLUNAS_COMP.length).clearContent();

  const lista = cfg.compromissos || [];
  if (lista.length) {
    f.getRange(2, 1, lista.length, COLUNAS_COMP.length).setValues(lista.map((x) => [
      x.id, x.nome, Number(x.valor) || 0, Number(x.dia) || 1,
      x.categoria || x.nome, x.conta || '',
      x.inicio || '', x.parcelas || '', Number(x.reembolso) || 0,
    ]));
  }
  return lista.length;
}

// ============================================================
// Parcelas — mesma regra do app
// ============================================================

const liquido = (c) => (c.valor || 0) - (c.reembolso || 0);

function parcelaNoMes(c, ref) {
  if (!c.inicio) return { n: null, total: null, ultima: false };
  const partes = String(c.inicio).split('-');
  const n = (ref.getFullYear() - Number(partes[0])) * 12
          + (ref.getMonth() - (Number(partes[1]) - 1)) + 1;
  if (n < 1) return null;
  if (c.parcelas && n > c.parcelas) return null;
  return { n: n, total: c.parcelas || null, ultima: !!(c.parcelas && n === c.parcelas) };
}

/** Mesma regra do app: "dia 31" vira 30 num mês de 30 dias. */
function diaNoMes(dia, ref) {
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return Math.min(dia || 1, ultimo);
}

function ativosNoMes(compromissos, ref) {
  return compromissos
    .map((c) => {
      const p = parcelaNoMes(c, ref);
      return p ? Object.assign({}, c, { parcela: p, diaEfetivo: diaNoMes(c.dia, ref) }) : null;
    })
    .filter((c) => c !== null);
}

// ============================================================
// Lançamento automático a partir de texto
// ============================================================

/**
 * Lê um texto de compra e devolve a transação — sem tocar na planilha.
 * É pura de propósito: assim dá para rodar sobre 30 e-mails de uma vez
 * e gravar tudo numa escrita só.
 */
function interpretar(texto, origem, chaveUnica) {
  if (!texto) return null;
  const limpo = String(texto).replace(/\s+/g, ' ').trim();

  if (/estorn|cancelad|recusad|negad|não autorizada|fatura fechou|boleto gerado/i.test(limpo)) return null;

  const valor = extrairValor(limpo);
  if (!valor) return null;

  const local = extrairLocal(limpo);

  return {
    id: 'auto-' + hash(chaveUnica || limpo),
    data: hojeISO(),
    valor: -valor,
    categoria: categorizar(local),
    conta: '',
    nota: local,
    metodo: detectarMetodo(limpo),
    compromissoId: '',
    reembolso: false,
    origem: origem,
    criadoEm: new Date().toISOString(),
  };
}

/** Interpreta e grava um texto só. Usado pelo webhook do celular. */
function lancarDeTexto(texto, origem, chaveUnica) {
  const t = interpretar(texto, origem, chaveUnica);
  if (!t) return null;
  return inserir([t]).novos ? t : null;   // já existia => não é lançamento novo
}

/** Pega "R$ 1.234,56" e devolve número. Escolhe o maior valor do texto. */
function extrairValor(texto) {
  const achados = texto.match(/R\$\s*([\d.]+,\d{2}|\d+[.,]\d{2})/gi) || [];
  const nums = achados.map((a) => {
    const s = a.replace(/R\$\s*/i, '');
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    return Number(s.indexOf(',') !== -1 ? s.replace(/\./g, '').replace(',', '.') : s);
  }).filter((n) => n > 0);
  return nums.length ? Math.max.apply(null, nums) : null;
}

/** Palavras que denunciam que o trecho capturado não é o nome de um lugar. */
const RUIDO = /^(?:valor|cart[ãa]o|conta|dia|d[ée]bito|cr[ée]dito|sua|seu|nome|favorecido|fatura)\b/i;

/**
 * Acha o nome do estabelecimento.
 *
 * Duas armadilhas que só apareceram no teste: em "Compra no cartao final 1234
 * em UBER" o "no" do cartão vencia o "em" do lugar, e Pix usa "para" em vez de
 * "em". Daí limpar o ruído antes de procurar e ficar com o ÚLTIMO candidato,
 * que é onde o estabelecimento costuma estar.
 */
function extrairLocal(texto) {
  const limpo = texto
    .replace(/\bcart[ãa]o\s+(?:de\s+)?(?:cr[ée]dito|d[ée]bito)?\s*(?:final\s*\d+)?/gi, ' ')
    .replace(/\bno valor de\b/gi, ' ')
    .replace(/R\$\s*[\d.]*\d,\d{2}/g, ' ')
    .replace(/\s+/g, ' ');

  const achados = [];
  const re = /\b(?:em|no|na|para)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .&'*-]{2,40})/gi;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    let cand = m[1].replace(/\s+(no dia|às|as)\b.*$/i, '').trim();
    // Tirar o ruído deixa preposições órfãs ("aprovada no em UBER"), e a
    // primeira delas engole a segunda na captura. Descasca até sobrar o nome.
    while (/^(?:em|n[oa]|para|d[eoa])\s+/i.test(cand)) {
      cand = cand.replace(/^(?:em|n[oa]|para|d[eoa])\s+/i, '');
    }
    if (cand.length >= 3 && !RUIDO.test(cand)) achados.push(cand);
  }
  return achados.length ? achados[achados.length - 1] : 'Compra';
}

/** Não chuta: sem pista no texto, o método fica em branco. */
function detectarMetodo(texto) {
  if (/\bpix\b/i.test(texto)) return 'pix';
  if (/cr[ée]dito/i.test(texto)) return 'credito';
  if (/d[ée]bito/i.test(texto)) return 'debito';
  if (/cart[ãa]o/i.test(texto)) return 'cartao';
  return '';
}

const REGRAS = [
  [/mercado|supermerc|atacad|carrefour|assa[ií]|pão de a[çc]|hortifrut/i, 'Mercado'],
  [/ifood|rappi|restaurant|lanchonete|padaria|burger|pizza|caf[ée]|bar\b/i, 'Comida'],
  [/uber|99|posto|combust|gasolin|estacion|pedagio|ped[áa]gio/i, 'Transporte'],
  [/farm[áa]c|drogar|hospital|cl[íi]nic|laborat/i, 'Saúde'],
  [/netflix|spotify|disney|prime|hbo|max|youtube|google|apple|microsoft|gpt|openai/i, 'Assinaturas'],
  [/cinema|ingress|steam|playstation|xbox|show/i, 'Lazer'],
  [/shopping|magalu|americanas|mercado livre|shopee|amazon|renner|riachuelo/i, 'Compras'],
  [/energia|energisa|luz|[áa]gua|internet|vivo|claro|tim|oi\b|aluguel|condom[íi]nio/i, 'Casa'],
  [/seguro|ipva|licenciam|oficina|mec[âa]nic|pneu/i, 'Carro'],
];

function categorizar(local) {
  for (let i = 0; i < REGRAS.length; i++) {
    if (REGRAS[i][0].test(local)) return REGRAS[i][1];
  }
  return 'Outros';
}

function hash(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s))
    .map((b) => ((b & 0xff) + 0x100).toString(16).slice(1)).join('').slice(0, 16);
}

// ============================================================
// Gatilho: varrer o Gmail (a cada 15 min)
// ============================================================

function varrerGmail() {
  const props = PropertiesService.getScriptProperties();
  const inicio = Date.now();
  const desde = Number(props.getProperty('gmail.ultimo')) || (inicio - 2 * 864e5);

  // Retoma de onde parou em vez de reprocessar os mesmos dois dias a cada
  // 15 minutos. O 'after:' do Gmail já corta na origem, então na maioria das
  // rodadas a busca volta vazia e o gatilho custa quase nada.
  const busca = cfg().GMAIL_BUSCA + ' after:' + Math.floor(desde / 1000);

  const lote = [];
  GmailApp.search(busca, 0, 50).forEach((th) => {
    th.getMessages().forEach((msg) => {
      if (msg.getDate().getTime() < desde) return;   // resto da thread, já visto
      // O id da mensagem é a chave: cada e-mail lança no máximo uma vez.
      const t = interpretar(msg.getSubject() + ' — ' + msg.getPlainBody().slice(0, 1200),
                            'gmail', msg.getId());
      if (t) lote.push(t);
    });
  });

  const r = inserir(lote);   // uma leitura, uma escrita

  // Marca o início da rodada, não o fim: e-mail que chegou durante o
  // processamento é pego na próxima em vez de se perder.
  props.setProperty('gmail.ultimo', String(inicio));

  if (r.novos) registrar('gmail', r.novos + ' lançamento(s) automático(s)');
  return r.novos;
}

function registrar(origem, msg) {
  // O Apps Script não mostra valor de retorno no Registro de execução, só o
  // que passa por console.log. Sem isto você executa a função no editor e não
  // faz ideia do que aconteceu.
  console.log('[' + origem + '] ' + msg);
  aba(ABAS.LOG, ['quando', 'origem', 'detalhe']).appendRow([new Date(), origem, msg]);
}

// ============================================================
// Gatilho: aviso diário no celular
// ============================================================

function avisarDoDia() {
  const cfg = lerConfig();
  const agora = new Date();
  const dia = Number(Utilities.formatDate(agora, fuso(), 'd'));
  const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const mes = Utilities.formatDate(agora, fuso(), 'yyyy-MM');

  const doMes = listar(mes + '-01').filter((t) => String(t.data).slice(0, 7) === mes);
  const pagos = {};
  doMes.forEach((t) => { if (t.compromissoId) pagos[t.compromissoId] = true; });

  const ativos = ativosNoMes(cfg.compromissos, agora);
  const avisos = [];

  ativos.forEach((c) => {
    if (pagos[c.id]) return;
    const qual = c.parcela.total ? ' (' + c.parcela.n + '/' + c.parcela.total + ')' : '';
    if (c.diaEfetivo < dia) avisos.push('⚠ ' + c.nome + qual + ' venceu dia ' + c.diaEfetivo + ' — ' + reais(c.valor));
    else if (c.diaEfetivo - dia <= cfg().AVISAR_DIAS_ANTES) {
      avisos.push('📅 ' + c.nome + qual + ' vence dia ' + c.diaEfetivo + ' — ' + reais(c.valor));
    }
  });

  // Mesmo cálculo do app.
  const entradas = doMes.reduce((s, t) => (t.valor > 0 && !t.reembolso ? s + t.valor : s), 0);
  const reembolsado = doMes.reduce((s, t) => (t.valor > 0 && t.reembolso ? s + t.valor : s), 0);
  const receita = Math.max(cfg.renda, entradas);
  const gastos = doMes.reduce((s, t) => (t.valor < 0 ? s + Math.abs(t.valor) : s), 0);
  const pendentes = ativos.reduce((s, c) => (pagos[c.id] ? s : s + liquido(c)), 0);
  const sobra = receita - cfg.meta - (gastos - reembolsado) - pendentes;

  avisos.unshift(sobra < 0
    ? '🔴 Você está ' + reais(Math.abs(sobra)) + ' no vermelho neste mês.'
    : '🟢 Pode gastar ' + reais(sobra / (ultimoDia - dia + 1)) + ' hoje. Sobram ' + reais(sobra) + ' no mês.');

  // Boa notícia também merece push.
  ativos.filter((c) => c.parcela.ultima)
    .forEach((c) => avisos.push('🎉 ' + c.nome + ' é a ÚLTIMA parcela. Mês que vem sobram ' + reais(liquido(c)) + ' a mais.'));

  notificar('Meu Dinheiro', avisos.join('\n'));
  return avisos;
}

const reais = (v) => 'R$ ' + Utilities.formatString('%.2f', v || 0).replace('.', ',');

// ============================================================
// Notificação
// ============================================================

function notificar(titulo, corpo) {
  if (cfg().TELEGRAM_BOT_TOKEN && cfg().TELEGRAM_CHAT_ID) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg().TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      payload: { chat_id: cfg().TELEGRAM_CHAT_ID, text: titulo + '\n\n' + corpo },
      muteHttpExceptions: true,
    });
    return;
  }
  if (cfg().NTFY_TOPICO) {
    UrlFetchApp.fetch('https://ntfy.sh/' + cfg().NTFY_TOPICO, {
      method: 'post',
      contentType: 'text/plain; charset=utf-8',
      headers: { Title: titulo },
      payload: corpo,
      muteHttpExceptions: true,
    });
    return;
  }
  // Sem canal configurado, o e-mail é o último recurso — nunca falha em silêncio.
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), titulo, corpo);
}

// ============================================================
// Importar a planilha antiga
// ============================================================

/**
 * Lê a aba antiga (Data de vencimento | Tipo | Grupo | Categoria | Conta |
 * Descricao | Valor | Pago?) e preenche Compromissos e Lancamentos.
 *
 * Nada é apagado: escreve nas abas novas para você conferir antes de confiar.
 * Linhas com "x5" na coluna ao lado viram parcelamento de 5 vezes.
 */
/**
 * Acha a aba tolerando diferença de maiúsculas e nome parcial.
 * "Financeiro" encontra "Gastos - Financeiro" sem você ter que acertar o
 * nome exato, que é o tipo de detalhe que faz a função falhar à toa.
 */
function acharAba(nome) {
  const abas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  const alvo = String(nome).trim().toLowerCase();

  let s = abas.find((x) => x.getName().toLowerCase() === alvo);
  if (s) return s;

  const parciais = abas.filter((x) => x.getName().toLowerCase().indexOf(alvo) !== -1);
  if (parciais.length === 1) return parciais[0];
  if (parciais.length > 1) {
    throw new Error('"' + nome + '" casa com mais de uma aba: '
      + parciais.map((x) => x.getName()).join(', ') + '. Use o nome completo.');
  }
  throw new Error('Aba "' + nome + '" não encontrada. Abas existentes: '
    + abas.map((x) => x.getName()).join(', '));
}

function importarPlanilhaAntiga(nomeAba) {
  const origem = acharAba(nomeAba || cfg().ABA_ANTIGA);
  const grade = origem.getDataRange().getValues();

  // Acha a linha de cabeçalho pelo texto, em vez de fixar o número da linha.
  let hdr = -1;
  for (let i = 0; i < grade.length; i++) {
    if (String(grade[i][0]).toLowerCase().indexOf('data de vencimento') !== -1) { hdr = i; break; }
  }
  if (hdr === -1) throw new Error('Não achei a linha "Data de vencimento".');

  const compromissos = [];
  const lancamentos = [];
  const mesAtual = Utilities.formatDate(new Date(), fuso(), 'yyyy-MM');

  for (let i = hdr + 1; i < grade.length; i++) {
    const L = grade[i];
    const tipo = String(L[1]).trim();
    const grupo = String(L[2]).trim();
    const categoria = String(L[3]).trim();
    const conta = String(L[4]).trim();
    const desc = String(L[5]).trim();
    const valor = Number(L[6]) || 0;
    const pago = String(L[7]).trim().toUpperCase() === 'SIM';
    if (!valor || !tipo) continue;

    // "x5" em qualquer coluna à direita = número de parcelas.
    let parcelas = null;
    for (let j = 8; j < L.length; j++) {
      const m = String(L[j]).match(/^x\s*(\d+)$/i);
      if (m) { parcelas = Number(m[1]); break; }
    }

    const dia = L[0] instanceof Date ? L[0].getDate() : (Number(String(L[0]).slice(0, 2)) || 10);

    if (tipo.toLowerCase() === 'despesa' && grupo.toLowerCase() === 'fixo') {
      compromissos.push([
        'imp-' + hash(desc + valor), desc || categoria, valor, dia,
        categoria, conta, mesAtual, parcelas || '', 0,
      ]);
    } else {
      lancamentos.push({
        id: 'imp-' + hash(desc + valor + i),
        data: hojeISO(),
        valor: tipo.toLowerCase() === 'receita' ? valor : -valor,
        categoria: categoria,
        conta: conta,
        nota: desc,
        metodo: '',
        compromissoId: '',
        reembolso: false,
        origem: 'import',
        criadoEm: new Date().toISOString(),
      });
    }

    if (!pago) registrar('import', 'Não pago: ' + desc);
  }

  // Os ids são derivados de descrição + valor, então rodar o import de novo
  // reconhece o que já entrou em vez de duplicar tudo.
  const sc = aba(ABAS.COMP, COLUNAS_COMP);
  const jaTem = new Set(idsExistentes(sc));
  const novosComp = compromissos.filter((linha) => !jaTem.has(String(linha[0])));

  if (novosComp.length) {
    sc.getRange(sc.getLastRow() + 1, 1, novosComp.length, COLUNAS_COMP.length)
      .setValues(novosComp);
  }
  const r = inserir(lancamentos);

  const repetidos = compromissos.length - novosComp.length;
  const msg = novosComp.length + ' compromisso(s) e ' + r.novos + ' lançamento(s) importados de "'
    + origem.getName() + '"' + (repetidos ? ' (' + repetidos + ' já existiam)' : '') + '.';
  registrar('import', msg);

  // A planilha antiga não diz QUANDO cada parcelamento começou, então o
  // importador chuta o mês atual. Para um "x5" que já está na 3ª parcela isso
  // erra a data de término — que é justamente o que a aba Futuro calcula.
  // Melhor gritar do que deixar o erro passar despercebido.
  const conferir = novosComp.filter((linha) => linha[7]).map((linha) => linha[1]);
  let aviso = '';
  if (conferir.length) {
    aviso = ' ATENÇÃO: corrija a coluna "inicio" na aba Compromissos para '
      + conferir.join(', ') + ' — entrou como ' + mesAtual + ', que é só um chute.';
    registrar('import', 'Conferir mês da 1ª parcela: ' + conferir.join(', '));
  }

  const final = msg + ' Confira as abas Compromissos e Lancamentos —'
    + ' nada da aba de origem foi alterado.' + aviso;
  console.log(final);
  return final;
}

/*
 * O botão Executar do editor não passa argumento, então cada aba de origem
 * precisa de um atalho próprio na lista de funções. Os nomes das abas ficam
 * nas propriedades, não aqui — é o que mantém este arquivo genérico e faz a
 * atualização ser só colar por cima.
 */
function importar1() { return importarPlanilhaAntiga(cfg().ABA_ANTIGA); }
function importar2() { return importarPlanilhaAntiga(cfg().ABA_ANTIGA_2); }

// ============================================================
// Instalação — rode UMA vez pelo editor
// ============================================================

function instalar() {
  aba(ABAS.LANC, COLUNAS);
  aba(ABAS.COMP, COLUNAS_COMP);
  const c = aba(ABAS.CFG, ['chave', 'valor']);
  if (c.getLastRow() < 2) { c.appendRow(['renda', 0]); c.appendRow(['meta', 0]); }
  aba(ABAS.LOG, ['quando', 'origem', 'detalhe']);

  // Remove gatilhos antigos para não duplicar em reinstalações.
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('varrerGmail').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('avisarDoDia').timeBased().atHour(8).everyDays(1).create();

  const msg = 'Abas e gatilhos criados. Agora publique como Web App.';
  console.log(msg);
  return msg;
}
