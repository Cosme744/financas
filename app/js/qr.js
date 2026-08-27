// qr.js — lê o QR code da maquininha e devolve um lançamento pronto para conferir.
//
// Dois formatos importam, e eles são bem diferentes:
//
//   Pix (BR Code)  texto EMV, decodificado aqui mesmo, offline. Quando o
//                  cobrador embutiu o valor, ele vem junto.
//   NFC-e          a URL impressa no cupom fiscal. Sempre traz a chave de
//                  acesso de 44 dígitos; o valor só vem em parte dos casos
//                  (ver lerNFCe).
//
// Nada é lançado direto: o app sempre mostra o que entendeu e espera você
// confirmar. Um lançamento errado custa mais caro do que um toque a mais.

/* ==================== utilidades ==================== */

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF) — o que o BR Code usa. */
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Decodifica a tira TLV do EMV: 2 dígitos de tag, 2 de tamanho, o valor.
 * Para no primeiro campo malformado em vez de adivinhar — meio QR lido é
 * indistinguível de um QR de outro formato, e adivinhar aqui vira lançamento
 * errado depois.
 */
function tlv(s) {
  const out = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) break;
    const val = s.slice(i + 4, i + 4 + len);
    if (val.length < len) break;
    out[tag] = val;
    i += 4 + len;
  }
  return out;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

/* ==================== Pix ==================== */

/**
 * BR Code do Pix. Devolve null se não for um.
 *
 * QR estático (o adesivo no balcão) costuma vir sem valor: o mesmo código
 * serve para qualquer quantia. QR dinâmico ("01" = "12") guarda o valor num
 * endereço do banco, não no próprio código — nos dois casos o valor fica
 * null e quem digita é você.
 */
export function lerPix(texto) {
  const s = String(texto || '').trim();
  if (!/^000201/.test(s)) return null;

  const raiz = tlv(s);
  if (raiz['00'] !== '01') return null;

  const avisos = [];

  // O CRC fecha os 4 últimos dígitos sobre todo o resto do payload.
  const temCrc = s.length > 8 && s.slice(-8, -4) === '6304';
  if (!temCrc) avisos.push('QR sem dígito verificador — confira o valor.');
  else if (crc16(s.slice(0, -4)) !== s.slice(-4).toUpperCase()) {
    avisos.push('Dígito verificador não bate — a leitura pode ter saído torta.');
  }

  // A conta do recebedor mora em alguma tag de 26 a 51; a do Pix se
  // identifica pelo GUI br.gov.bcb.pix.
  let chavePix = '';
  let urlDinamica = '';
  for (let t = 26; t <= 51; t++) {
    const tag = String(t).padStart(2, '0');
    if (!raiz[tag]) continue;
    const sub = tlv(raiz[tag]);
    if (String(sub['00'] || '').toLowerCase() !== 'br.gov.bcb.pix') continue;
    chavePix = sub['01'] || '';
    urlDinamica = sub['25'] || '';
    break;
  }
  if (!chavePix && !urlDinamica) return null;

  const valor = raiz['54'] ? Number(raiz['54']) : null;
  const dinamico = raiz['01'] === '12';
  if (!valor) {
    avisos.push(dinamico
      ? 'QR dinâmico: o valor está no banco, não no código. Digite abaixo.'
      : 'Este QR não carrega valor. Digite abaixo.');
  }

  const nome = (raiz['59'] || '').trim();
  const cidade = (raiz['60'] || '').trim();
  const txid = (tlv(raiz['62'] || '')['05'] || '').trim();

  return {
    tipo: 'pix',
    rotulo: 'Pix',
    valor: Number.isFinite(valor) && valor > 0 ? valor : null,
    quem: nome || chavePix || 'Pix',
    data: hojeISO(),
    metodo: 'pix',
    // Sem id fixo de propósito: um QR estático é reutilizável, então duas
    // leituras do mesmo adesivo são quase sempre duas compras de verdade.
    id: null,
    detalhe: [cidade, txid && `txid ${txid}`].filter(Boolean).join(' · '),
    avisos,
  };
}

/* ==================== NFC-e ==================== */

const UF = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL',
  28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR',
  42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};

/** Módulo 11 sobre os 43 primeiros dígitos — pega leitura torta na hora. */
function dvChaveOk(chave) {
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

const hexParaTexto = (h) =>
  /^[0-9a-fA-F]+$/.test(h) && h.length % 2 === 0
    ? h.match(/../g).map((p) => String.fromCharCode(parseInt(p, 16))).join('')
    : '';

/**
 * URL do QR do cupom fiscal. Devolve null se não for um.
 *
 * O valor nem sempre está lá, e isso não é falha de implementação:
 *
 *   QR versão 1      traz vNF na própria query. Valor garantido.
 *   QR versão 2      normal, `p=chNFe|nVersao|tpAmb|cIdToken|cHash` — cinco
 *                    campos, nenhum deles o valor. É o formato mais comum
 *                    hoje, então o normal é você digitar a quantia.
 *   QR versão 2      em contingência, nove campos, com dhEmi e vNF no meio.
 *
 * O que sempre vem é a chave de acesso, e ela basta para o que mais importa:
 * identificar a nota sem repetir e saber CNPJ e mês do emitente.
 */
export function lerNFCe(texto) {
  const s = String(texto || '').trim();
  if (!/^https?:\/\//i.test(s)) return null;

  let q;
  try { q = new URL(s).searchParams; } catch { return null; }

  let chave = (q.get('chNFe') || '').replace(/\D/g, '');
  let vNF = q.get('vNF');
  let dhEmi = q.get('dhEmi') || '';

  const p = q.get('p');
  if (p) {
    const campos = p.split('|');
    if (!chave) chave = (campos[0] || '').replace(/\D/g, '');
    if (campos.length >= 9) {          // contingência: dhEmi e vNF vêm juntos
      if (!dhEmi) dhEmi = hexParaTexto(campos[3]) || campos[3];
      if (!vNF) vNF = campos[4];
    }
  }

  // Última tentativa: alguns emissores montam a URL fora do padrão.
  if (chave.length !== 44) chave = (s.match(/\d{44}/) || [''])[0];
  if (chave.length !== 44) return null;

  const avisos = [];
  if (!dvChaveOk(chave)) {
    avisos.push('A chave da nota não passou no dígito verificador — releia o QR.');
  }

  const ano = 2000 + Number(chave.slice(2, 4));
  const mes = chave.slice(4, 6);
  const cnpj = chave.slice(6, 20);
  const modelo = chave.slice(20, 22);
  const numero = String(Number(chave.slice(25, 34)));

  // dhEmi dá o dia exato. Sem ele, a chave só entrega ano e mês: usar hoje
  // acerta na varredura do dia da compra e erra em nota antiga — por isso o
  // aviso quando o mês da nota não é o mês corrente.
  let data = hojeISO();
  const iso = String(dhEmi).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    data = iso[0];
  } else if (`${ano}-${mes}` !== hojeISO().slice(0, 7)) {
    avisos.push(`Nota emitida em ${mes}/${ano}. Confira a data antes de lançar.`);
  }

  const valor = vNF ? Number(String(vNF).replace(',', '.')) : null;
  if (!Number.isFinite(valor) || valor <= 0) {
    avisos.push('Este QR não carrega o valor total. Digite abaixo.');
  }

  return {
    tipo: 'nfce',
    rotulo: modelo === '65' ? 'Cupom fiscal' : 'Nota fiscal',
    valor: Number.isFinite(valor) && valor > 0 ? valor : null,
    quem: `CNPJ ${formatarCNPJ(cnpj)}`,
    cnpj,
    data,
    metodo: null,                        // o cupom não diz como você pagou
    // A chave é única por nota: derivar o id dela faz a mesma nota lida duas
    // vezes cair no mesmo registro, aqui e na planilha.
    id: `nfce-${chave}`,
    detalhe: `nº ${numero} · ${UF[Number(chave.slice(0, 2))] || '??'}`,
    avisos,
  };
}

export const formatarCNPJ = (c) =>
  String(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/* ==================== porta de entrada ==================== */

/**
 * Descobre o que é o texto lido. Devolve null quando não reconhece — e
 * "não reconheço" é resposta melhor do que um palpite: o comprovante da
 * maquininha (a via do cartão) não carrega dado estruturado nenhum, então
 * quem tem de ser lido é o QR do cupom fiscal, não o do comprovante.
 */
export function interpretar(texto) {
  return lerPix(texto) || lerNFCe(texto) || null;
}

/* ==================== nome do estabelecimento ==================== */

const CACHE_CNPJ = 'cf.cnpj.v1';

/**
 * Troca o CNPJ da nota pelo nome da loja, consultando a BrasilAPI.
 *
 * É a única chamada do app para fora da sua planilha, e sai do celular só o
 * CNPJ de quem te vendeu — dado de registro público, nunca o valor nem o que
 * você comprou. Desligável em Ajustes, e o resultado fica em cache para não
 * repetir consulta. Falhou ou está offline: segue com o CNPJ mesmo.
 */
export async function nomeDoCNPJ(cnpj) {
  if (!/^\d{14}$/.test(cnpj)) return null;

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_CNPJ) || '{}'); } catch {}
  if (cache[cnpj]) return cache[cnpj];

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;

    const d = await r.json();
    const nome = (d.nome_fantasia || d.razao_social || '').trim();
    if (!nome) return null;

    cache[cnpj] = nome;
    try { localStorage.setItem(CACHE_CNPJ, JSON.stringify(cache)); } catch {}
    return nome;
  } catch {
    return null;
  }
}

/* ==================== câmera ==================== */

export const temCamera = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export const temLeitor = () => 'BarcodeDetector' in window;

/**
 * Abre a câmera em tela cheia e resolve com o texto do primeiro QR lido.
 * Resolve com null se você fechar. Rejeita quando a câmera não abre —
 * permissão negada é o caso comum, e a mensagem precisa dizer isso.
 *
 * Usa o BarcodeDetector do próprio Chrome: sem biblioteca externa, o app
 * continua funcionando offline e o repositório continua sem dependência.
 */
export function escanear() {
  return new Promise((resolve, reject) => {
    if (!temCamera()) {
      reject(new Error('Este navegador não dá acesso à câmera. Use o Chrome.'));
      return;
    }

    const fundo = document.createElement('div');
    fundo.className = 'scanner';
    fundo.innerHTML = `
      <video playsinline muted></video>
      <div class="scanner-mira"></div>
      <div class="scanner-dica" id="qrDica">Aponte para o QR do cupom ou da cobrança Pix</div>
      <div class="scanner-acoes">
        <button class="secundario" id="qrColar">Colar código</button>
        <button class="secundario perigo" id="qrFechar">Fechar</button>
      </div>`;
    document.body.appendChild(fundo);

    const video = fundo.querySelector('video');
    const dica = fundo.querySelector('#qrDica');
    let stream = null;
    let vivo = true;

    function encerrar(valor, erro) {
      if (!vivo) return;
      vivo = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      fundo.remove();
      erro ? reject(erro) : resolve(valor);
    }

    fundo.querySelector('#qrFechar').onclick = () => encerrar(null);

    // Saída de emergência: se o BarcodeDetector não existir, ou o QR estiver
    // riscado, dá para abrir o QR pelo app da câmera e colar o link aqui.
    fundo.querySelector('#qrColar').onclick = () => {
      const t = prompt('Cole o conteúdo do QR (link da nota ou código Pix):');
      if (t && t.trim()) encerrar(t.trim());
    };

    if (!temLeitor()) {
      dica.textContent = 'Este navegador não lê QR sozinho. Use "Colar código".';
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        await video.play().catch(() => {});

        if (!temLeitor()) return;

        const leitor = new window.BarcodeDetector({ formats: ['qr_code'] });
        const procurar = async () => {
          if (!vivo) return;
          try {
            const achados = await leitor.detect(video);
            if (achados.length && achados[0].rawValue) {
              if (navigator.vibrate) navigator.vibrate(40);
              encerrar(achados[0].rawValue);
              return;
            }
          } catch { /* quadro ruim: tenta o próximo */ }
          requestAnimationFrame(procurar);
        };
        requestAnimationFrame(procurar);
      })
      .catch((e) => {
        const negada = e && /NotAllowed|Permission/i.test(e.name + e.message);
        encerrar(null, new Error(negada
          ? 'Permissão de câmera negada. Libere nas configurações do site.'
          : 'Não consegui abrir a câmera.'));
      });
  });
}
