import Papa from 'papaparse';
import { parseAmount, requiredDate } from './budget.js';

export const STATEMENT_LIMIT = 2000;
export const MIN_STATEMENT_DATE = '1900-01-01';
export const MAX_STATEMENT_DATE = '2100-12-31';

export const normalize = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const cleanText = (text) => String(text ?? '').replace(/[\s\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim();
export const isStatementTotal = (title) => /^(?:saldos?(?: |$)|totais(?: |$)|totais? (?:de |das? |d[eo]s? )?(?:[a-z]+ )?(?:entradas?|saidas?|creditos?|debitos?|periodo|movimentacoes)|subtotal(?: |$))/
  .test(normalize(title));
export const isPendingMovement = (title) => /^(?:(?:lancamentos?|movimentacoes) futur[oa]s?|transac(?:ao|oes) agendad[ao]s?|agendamento(?: de)?|pagamento agendado|pix agendado)(?: |$)/
  .test(normalize(title));

export function statementDate(value) {
  const text = cleanText(value);
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T ])/.exec(text);
  const br = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:$|[ T])/.exec(text);
  const ofx = /^(\d{4})(\d{2})(\d{2})(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.exec(text);
  if (!iso && !br && !ofx) throw new Error('Data não reconhecida no extrato.');
  const [, year, month, day] = iso ?? ofx ?? [null, br[3].length === 2 ? '20' + br[3] : br[3], br[2], br[1]];
  const date = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
  if (date < MIN_STATEMENT_DATE || date > MAX_STATEMENT_DATE || !/^\d{4}-(0[1-9]|1[0-2])-/.test(date)) {
    throw new Error('Data fora do intervalo do orçamento.');
  }
  return requiredDate(date, date.slice(0, 7));
}

const DEBIT = /^(?:(?:d|dr|deb|s|out|payment)$|(?:debito|debit|saida|retirada|despesa|pagamento)(?: |$))/;
const CREDIT = /^(?:(?:c|cr|cred|e|in)$|(?:credito|credit|entrada|deposito|deposit|receita|recebimento)(?: |$))/;

export function movementDirection(value) {
  const text = normalize(value);
  if (/\b(?:enviado|enviada)\b/.test(text) || DEBIT.test(text)) return -1;
  if (/\b(?:recebido|recebida)\b/.test(text) || CREDIT.test(text)) return 1;
  return 0;
}

export function statementAmount(value, fallbackDirection = 0) {
  let text = cleanText(value).replace(/[−–]/g, '-').replace(/(?:R\$|BRL)/gi, '').trim();
  let explicit = 0;
  const marker = /(?:^|\s|(?<=\d))(C|D|CR|DR)$/i.exec(text);
  if (marker) {
    explicit = movementDirection(marker[1]);
    text = text.slice(0, marker.index).trim();
  }
  const parenthesized = text.startsWith('(') && text.endsWith(')');
  if (parenthesized) text = text.slice(1, -1).trim();
  const sign = /^(?:[+-])|[+-]$/.exec(text);
  const signDirection = parenthesized || sign?.[0] === '-' ? -1 : sign ? 1 : 0;
  if (sign) text = text.slice(0, sign.index) + text.slice(sign.index + 1);
  if (signDirection && explicit && signDirection !== explicit) throw new Error('Sinais divergentes no valor.');

  text = text.trim().replace(/(?<=\d) (?=\d{3}(?:[ .,]|$))/g, '');
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) text = text.replaceAll(',', '');
  const amount = parseAmount(text, 'valor do extrato', true);
  const direction = signDirection || explicit;
  if (amount && direction && fallbackDirection && direction !== fallbackDirection) {
    throw new Error('O sinal do valor diverge do tipo do lançamento.');
  }

  return { amount, direction: direction || fallbackDirection };
}

const CSV_HEADERS = {
  date: /^(?:data(?: (?:do|da|de))?(?: lancamento| transacao| movimento| movimentacao| operacao| efetivacao| contabilizacao| pagamento| credito| compra| valor)?|date|posted date|dt lancamento)$/,
  title: /^(?:descricao(?: (?:do |da )?(?:lancamento|transacao|operacao|movimentacao))?|historico(?: do lancamento)?|lancamentos?|movimentacao|detalhes?|memo|description|narrative|transaction description)$/,
  amount: /^(?:(?:valor(?: (?:do |da )?(?:lancamento|transacao|movimento|movimentacao|liquido))?|amount|montante|valor r|vl lancamento)(?: (?:em )?(?:r|brl))?)$/,
  debit: /^(?:debito(?:s)?|saidas?|valor (?:do |de )?debito|debit(?: amount)?)(?: (?:r|brl))?$/,
  credit: /^(?:credito(?:s)?|entradas?|valor (?:do |de )?credito|credit(?: amount)?)(?: (?:r|brl))?$/,
  type: /^(?:tipo(?: (?:de |do |da )?(?:lancamento|transacao|operacao|movimento|movimentacao))?|natureza|type|debit credit|c d|d c)$/,
  ref: /^(?:identificador|id|id (?:da )?transacao|transaction id|fitid)$/,
  currency: /^(?:moeda|currency)$/,
  status: /^(?:status(?: (?:do|da) (?:lancamento|transacao))?|situacao|estado)$/,
};

export function parseStatementCsv(content) {
  let parsed;
  let header;
  let columns;
  // A detecção automática do separador pode se confundir com vírgulas nos valores ou com um preâmbulo do banco.
  for (const delimiter of [';', ',', '\t', '|']) {
    const candidate = Papa.parse(content, { delimiter, skipEmptyLines: 'greedy', preview: 30 });
    for (const [index, row] of candidate.data.entries()) {
      const names = row.map(normalize);
      const fields = Object.fromEntries(Object.entries(CSV_HEADERS)
        .map(([name, pattern]) => [name, names.findIndex((value) => pattern.test(value))]));
      if (fields.date < 0 || fields.title < 0 || [fields.amount, fields.debit, fields.credit].every((field) => field < 0)) continue;
      parsed = Papa.parse(content, { delimiter, skipEmptyLines: 'greedy' });
      header = index;
      columns = fields;
      break;
    }
    if (parsed) break;
  }
  if (!parsed) throw new Error('Não encontrei o cabeçalho do CSV. Use colunas de data, descrição e valor, ou colunas de crédito e débito.');

  const rows = [];
  let ignored = 0;
  if (parsed.errors.some((error) => error.type === 'Quotes')) {
    throw new Error('O CSV tem campos entre aspas com formatação inválida. Exporte novamente o arquivo pelo banco.');
  }
  const fieldCount = parsed.data[header].length;
  for (let index = header + 1; index < parsed.data.length; index += 1) {
    const row = parsed.data[index];
    const title = cleanText(row[columns.title]);
    if (isStatementTotal(title) || isPendingMovement(title)) continue;
    if (/^(?:pendente|pending|agendad[ao]|scheduled|futur[oa]|cancelad[ao]|canceled|cancelled|recusad[ao]|declined)$/
      .test(normalize(row[columns.status]))) continue;
    const currency = normalize(row[columns.currency]);
    if (currency && !['brl', 'r', 'real', 'reais'].includes(currency)) {
      ignored += 1;
      continue;
    }

    try {
      if (row.length !== fieldCount) {
        throw new Error('Número de campos diferente do cabeçalho.');
      }
      const date = statementDate(row[columns.date]);
      const credit = cleanText(row[columns.credit]);
      const debit = cleanText(row[columns.debit]);
      const separateCredits = credit && !/^[-–]$/.test(credit) ? statementAmount(credit, 1).amount : 0;
      const separateDebits = debit && !/^[-–]$/.test(debit) ? statementAmount(debit, -1).amount : 0;
      if (separateCredits && separateDebits) throw new Error('Crédito e débito preenchidos na mesma linha.');
      let signed = separateCredits - separateDebits;
      if (!signed && columns.amount >= 0) {
        const { amount, direction } = statementAmount(row[columns.amount], movementDirection(row[columns.type]));
        signed = amount * (direction || 1);
      }
      if (!signed) continue;
      if (!title) throw new Error('Descrição em branco.');

      const reference = cleanText(row[columns.ref]);
      rows.push({ title, date, signed, reference: reference && reference !== '0' ? 'csv:' + reference : '' });
    } catch {
      ignored += 1;
    }
  }
  return { rows, ignored };
}

const XML_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function ofxField(record, field) {
  // O OFX 1.x (SGML) normalmente omite a tag de fechamento dos campos de texto.
  const value = new RegExp('<' + field + '\\s*>([^<]*)', 'i').exec(record)?.[1] ?? '';
  return cleanText(value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (entity[0] !== '#') return XML_ENTITIES[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : ' ';
  }));
}

export function parseStatementOfx(content) {
  const document = content.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<OFX(?:\s[^>]*)?>/i.test(document)) throw new Error('O arquivo não parece ser um extrato OFX.');
  if (/<CCSTMTRS\s*>/i.test(document) && !/<STMTRS\s*>/i.test(document)) {
    throw new Error('Este OFX é de cartão de crédito. Exporte o extrato da conta bancária.');
  }

  const statements = [...document.matchAll(/<STMTRS\s*>([\s\S]*?)(?=<\/STMTRS\s*>|<STMTRS\s*>|$)/gi)];
  const rows = [];
  let ignored = 0;
  let foreign = false;
  const institution = ofxField(document, 'FID');

  for (const [, statement] of statements) {
    const transactions = [...statement.matchAll(/<STMTTRN\s*>([\s\S]*?)(?=<\/STMTTRN\s*>|<STMTTRN\s*>|<\/BANKTRANLIST\s*>|$)/gi)];
    const currency = ofxField(statement, 'CURDEF').toUpperCase();
    if (currency && currency !== 'BRL') {
      ignored += transactions.length;
      foreign = true;
      continue;
    }
    const accountFields = /<BANKACCTFROM\s*>([\s\S]*?)(?=<\/BANKACCTFROM\s*>|<BANKTRANLIST\s*>|$)/i.exec(statement)?.[1] ?? '';
    const scope = [ofxField(accountFields, 'BANKID') || institution,
      ofxField(accountFields, 'BRANCHID'), ofxField(accountFields, 'ACCTID'), ofxField(accountFields, 'ACCTTYPE')];
    for (const [, transaction] of transactions) {
      try {
        const date = statementDate(ofxField(transaction, 'DTPOSTED'));
        const amountText = ofxField(transaction, 'TRNAMT').replace(/^([+-]?\d+\.\d{2})0+$/, '$1');
        if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(amountText)) throw new Error('Valor OFX inválido.');
        const { amount, direction } = statementAmount(amountText);
        if (!amount) continue;

        const name = ofxField(transaction, 'NAME');
        const memo = ofxField(transaction, 'MEMO');
        const type = ofxField(transaction, 'TRNTYPE').toUpperCase();
        // A descrição mais específica costuma estar no campo MEMO.
        const title = memo.length > name.length ? memo : name || memo || 'Movimentação bancária';
        if (isStatementTotal(title) || isPendingMovement(title)) continue;

        const ref = ofxField(transaction, 'FITID');
        const reference = ref && ref !== '0' && scope[2] ? 'ofx:' + JSON.stringify([...scope, ref]) : '';
        rows.push({ title, date, signed: amount * (direction || 1), reference, type });
      } catch {
        ignored += 1;
      }
    }
  }
  if (!rows.length && foreign) throw new Error('O extrato informa uma moeda diferente de reais (BRL).');
  return { rows, ignored };
}

function decodeText(bytes) {
  const header = new TextDecoder('windows-1252').decode(bytes.subarray(0, 1024));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (/(?:charset|encoding)\s*[:=]\s*["']?(?:1252|windows-1252|iso-8859-1|latin1)\b/i.test(header)) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function readBankStatement(file) {
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (!['csv', 'ofx', 'pdf'].includes(extension)) throw new Error('Selecione um arquivo OFX, CSV ou PDF.');
  if (!file.size) throw new Error('O arquivo selecionado está vazio.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Escolha um extrato de até 12 MB.');

  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  // Identifica a mesma cópia para arquivos sem identificador de transação por linha.
  const fingerprint = crypto.subtle
    ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('')
    : '';
  let result;
  if (extension === 'pdf') {
    const { readStatementPdf } = await import('./statementPdf.js');
    result = await readStatementPdf(bytes);
  } else {
    const content = decodeText(bytes);
    result = extension === 'ofx' ? parseStatementOfx(content) : parseStatementCsv(content);
  }

  if (!result.rows.length) {
    throw new Error(extension === 'pdf'
      ? 'Nenhuma movimentação com data, descrição e valor foi reconhecida. Exporte o extrato em OFX ou CSV.'
      : 'Nenhuma movimentação em reais foi reconhecida. Confira o formato ou exporte outro extrato.');
  }
  if (result.rows.length > STATEMENT_LIMIT) {
    throw new Error('Este extrato tem mais de 2.000 movimentações. Exporte um período menor para poder revisar cada lançamento.');
  }
  return { ...result, format: extension, fingerprint };
}
