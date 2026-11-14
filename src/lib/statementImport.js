import { id, newBudget, VARIABLE_CATEGORIES, FIXED_CATEGORIES } from './budget.js';
import { cleanText, normalize } from './statementFormats.js';

export const IMPORT_ROUTES = {
  income: 'Renda',
  fixed: 'Despesa fixa paga',
  variable: 'Despesa variável',
  grocery: 'Feira do mês',
  match: 'Dar baixa na conta',
};

const FIXED_RULES = [
  [/\b(?:aluguel|condominio|financiamento imobiliario)\b/, 'Moradia'],
  [/\b(?:conta (?:de |da )?energia|energia eletrica|energisa|enel|neoenergia|cemig|copel|equatorial energia|light servicos)\b/, 'Energia'],
  [/\b(?:conta (?:de |da )?agua|cagepa|sabesp|saneamento|copasa|companhia de agua)\b/, 'Água'],
  [/\b(?:internet|banda larga|telefonia|fatura (?:vivo|claro|tim)|(?:vivo|claro|tim) fibra)\b/, 'Internet e telefone'],
  [/\b(?:plano de saude|convenio medico|unimed)\b/, 'Saúde'],
  [/\bmensalidade (?:escolar|da escola|escola|universidade|faculdade|curso)\b/, 'Educação'],
  [/\b(?:assinatura|netflix|spotify|disney plus|amazon prime|prime video)\b/, 'Assinaturas'],
];

const VARIABLE_RULES = [
  [/\b(?:uber|99 ?pop|posto|combustivel|gasolina|estacionamento|pedagio|transporte|onibus|bilhete unico)\b/, 'Transporte'],
  [/\b(?:farmacia|drogaria|drogasil|consulta medica|consulta odontologica|laboratorio|hospital)\b/, 'Saúde'],
  [/\b(?:restaurante|lanchonete|padaria|cafe|delivery|ifood|pizzaria|bar|hamburgueria)\b/, 'Alimentação'],
  [/\b(?:tarifa|iof|anuidade|juros|encargos)\b/, 'Taxas bancárias'],
  [/\b(?:cinema|teatro|ingresso)\b/, 'Lazer'],
  [/\b(?:loja|amazon|shopee|mercado livre)\b/, 'Compras'],
];

const INTERNAL_MOVEMENT = /\b(?:mesma titularidade|conta(?:s)? (?:propria(?:s)?|do (?:mesmo )?titular)|transferencia entre contas|aplicacao(?: financeira| automatica| em| cdb| rdb)?|resgate(?: de| em| cdb| rdb| automatico)?|(?:pagamento|debito)(?: da| de)? fatura|fatura (?:do |de )?cartao|saque|estorno|reembolso|emprestimo(?: contratado)?|credito (?:de|do) emprestimo)\b/;
const IS_SALARY = /\b(?:salario|folha de pagamento|proventos)\b/;
const GENERIC_UTILITY_NAMES = {
  'Energia': /^(?:conta (?:de )?)?energia(?: eletrica)?$/,
  'Água': /^(?:conta (?:de )?)?agua$/,
};

function ruleCategory(rules, title) {
  return rules.find(([pattern]) => pattern.test(title))?.[1];
}

function suggestRoute(row) {
  if (row.signed > 0) return { route: 'income', category: '' };

  const title = normalize(row.title);
  if (/\b(?:super ?mercado|hipermercado|hortifruti|mercadinho|atacadao|atacadista|assai|carrefour|pao de acucar)\b/.test(title) ||
      (/\bmercado\b/.test(title) && !/\bmercado (?:pago|livre|bitcoin|financeiro)\b/.test(title))) {
    return { route: 'grocery', category: '' };
  }
  const fixed = ruleCategory(FIXED_RULES, title);
  const variable = ruleCategory(VARIABLE_RULES, title);
  return {
    route: fixed ? 'fixed' : 'variable',
    category: fixed ?? variable ?? 'Outros',
  };
}

function comparableTitle(title) {
  return normalize(title)
    .replace(/^(?:(?:pagamento(?: de| do| da)?|boleto(?: bancario)?|conta de|pix(?: enviado| recebido)?|transferencia(?: enviada| recebida)?|compra(?: (?:no|em|via) debito)?|debito(?: automatico)?|credito em conta|via|enviado para|recebido de|para) +)+/, '')
    .replace(/(?: +\d{4,})+$/, '').trim();
}

function similarTitle(candidate, existing) {
  const left = comparableTitle(candidate);
  const right = comparableTitle(existing);
  if (!left || !right || (left === right && /^(?:pix|boleto|pagamento|transferencia|compra|credito|debito)$/.test(left))) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  if (shorter.length < 4 || /^(?:conta|mercado|loja|internet|agua|energia|mensalidade|assinatura|pagamento|transferencia|outros)$/.test(shorter)) return false;
  return (' ' + longer + ' ').includes(' ' + shorter + ' ');
}

function addToIndex(index, key, value) {
  const group = index.get(key);
  if (group) group.push(value);
  else index.set(key, [value]);
}

function indexBudget(budget) {
  const keys = new Set();
  const signatures = new Set();
  const movements = new Map();
  const pending = new Map();

  for (const [list, sign] of [[budget.income, 1], [budget.bills, -1], [budget.groceries, -1]]) {
    for (const record of list) {
      if (record.bankImport) {
        keys.add(record.bankImport.key);
        signatures.add(record.bankImport.signature);
      }
      if (record.status === 'pending' && !record.variable) {
        addToIndex(pending, record.date.slice(0, 7) + ':' + record.amount, record);
      } else {
        addToIndex(movements, (record.paymentDate ?? record.date) + ':' + record.amount * sign, record);
      }
    }
  }
  return { keys, signatures, movements, pending, salaries: budget.salaries };
}

function possibleDuplicate(row, index) {
  return index.signatures.has(row.signature) ||
    (row.signed > 0 && index.salaries[row.date.slice(0, 7)] === row.signed && IS_SALARY.test(normalize(row.title))) ||
    (index.movements.get(row.date + ':' + row.signed) ?? []).some((record) =>
      similarTitle(row.title, record.title) || (record.paymentDate && relatesToBill(row.title, record)));
}

function relatesToBill(title, bill) {
  if (similarTitle(title, bill.title)) return true;
  const category = ruleCategory(FIXED_RULES, normalize(title));
  return Boolean(bill.category === category && GENERIC_UTILITY_NAMES[category]?.test(normalize(bill.title)));
}

function pendingMatches(row, index) {
  return (index.pending.get(row.date.slice(0, 7) + ':' + -row.signed) ?? [])
    .filter((bill) => !bill.bankImport && relatesToBill(row.title, bill));
}

async function importKey({ date, signed, title, reference }, { format, fingerprint }, index, counts) {
  const signature = JSON.stringify([date, signed, normalize(title)]);
  if (reference && crypto.subtle) {
    // O hash preserva a referência sem gravar números de conta ou identificadores brutos.
    const stable = format === 'csv' ? JSON.stringify([reference, signature]) : reference;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
    const key = format + ':' + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { key, signature };
  }
  if (fingerprint) return { key: format + ':' + fingerprint + ':' + index, signature };

  // Fallback para ambientes sem SubtleCrypto, por exemplo HTTP fora de localhost.
  const copyNumber = (counts.get(signature) ?? 0) + 1;
  counts.set(signature, copyNumber);
  return { key: format + ':' + signature + ':' + copyNumber, signature };
}

export async function identifyStatement(result) {
  const counts = new Map();
  return Promise.all(result.rows.map(async (row, index) => ({
    date: row.date,
    signed: row.signed,
    type: row.type,
    sourceTitle: cleanText(row.title).slice(0, 150),
    title: cleanText(row.title).slice(0, 150),
    ...await importKey(row, result, index, counts),
    reviewId: index + 1,
  })));
}

export function prepareStatementReview(rows, budget) {
  const index = indexBudget(budget ?? newBudget());
  const reserved = new Set();
  const keysInFile = new Set();
  return rows.map((row) => {
    const suggestion = suggestRoute(row);
    const repeated = index.keys.has(row.key) || keysInFile.has(row.key);
    keysInFile.add(row.key);
    const duplicate = !repeated && possibleDuplicate(row, index);
    const title = normalize(row.title);
    const matches = !repeated && row.signed < 0 ? pendingMatches(row, index) : [];
    const unknownTransfer = /\b(?:pix|ted|doc|transferencia)\b/.test(title) &&
      suggestion.route === 'variable' && suggestion.category === 'Outros' && !matches.length;
    const needsReview = INTERNAL_MOVEMENT.test(title) || row.type === 'XFER' || unknownTransfer;
    const suggestedMatch = matches.length === 1 && !reserved.has(matches[0].id) ? matches[0] : null;
    const ambiguous = matches.length > 0 && !suggestedMatch;
    if (suggestedMatch && !duplicate && !needsReview) reserved.add(suggestedMatch.id);

    let note = '';
    if (repeated) note = 'Já importado ou repetido no arquivo.';
    else if (duplicate) note = 'Possível duplicata de um lançamento cadastrado.';
    else if (needsReview) note = 'Confira se esta movimentação deve entrar no orçamento.';
    else if (ambiguous) note = 'Confira qual conta pendente corresponde a este pagamento.';
    else if (suggestedMatch) note = 'Conta pendente encontrada.';

    return {
      ...row, ...suggestion, suggestedCategory: suggestion.category,
      route: matches.length && (!duplicate && !needsReview) ? 'match' : suggestion.route,
      matches, matchId: suggestedMatch?.id ?? '',
      repeated, duplicate, note, selected: !repeated && !duplicate && !needsReview && !ambiguous,
    };
  });
}

export function categoriesForRoute(route) {
  if (route === 'fixed') return FIXED_CATEGORIES;
  if (route === 'variable') return VARIABLE_CATEGORIES;
  return [];
}

export function categoryForRoute(route, category) {
  const categories = categoriesForRoute(route);
  return categories.includes(category) ? category : categories.length ? 'Outros' : '';
}

export function applyStatementImport(budget, selected) {
  const index = indexBudget(budget);
  const next = { ...budget, income: [...budget.income], bills: [...budget.bills], groceries: [...budget.groceries] };
  const billPositions = new Map(budget.bills.map((bill, position) => [bill.id, position]));
  const months = new Set();
  let count = 0;
  let repeated = 0;

  for (const row of selected) {
    if (index.keys.has(row.key)) {
      repeated += 1;
      continue;
    }
    const original = { ...row, title: row.sourceTitle };
    if ((!row.duplicate && possibleDuplicate(original, index)) ||
        (row.signed < 0 && row.route !== 'match' && !row.matches.length && pendingMatches(original, index).length)) {
      throw new Error('Um lançamento parecido apareceu durante a revisão. Selecione o extrato novamente para atualizar as sugestões.');
    }
    const title = cleanText(row.title);
    if (!title || title.length > 150) throw new Error('Preencha as descrições dos lançamentos selecionados.');
    if (!Object.hasOwn(IMPORT_ROUTES, row.route) || (row.signed > 0) !== (row.route === 'income')) {
      throw new Error('O destino de um dos lançamentos é inválido.');
    }

    const record = {
      title,
      date: row.date,
      amount: Math.abs(row.signed),
      bankImport: { key: row.key, signature: row.signature },
    };

    if (row.route === 'match') {
      const position = billPositions.get(row.matchId);
      const bill = next.bills[position];
      if (!bill || bill.status !== 'pending' || bill.bankImport || bill.amount !== record.amount ||
          bill.date.slice(0, 7) !== row.date.slice(0, 7) || !relatesToBill(row.sourceTitle, bill)) {
        throw new Error('Uma das contas sugeridas foi alterada. Selecione o extrato novamente para atualizar a revisão.');
      }
      next.bills[position] = { ...bill, status: 'paid', paymentDate: row.date, bankImport: record.bankImport };
    } else if (row.route === 'income') {
      next.income.push({ ...record, id: id() });
    } else if (row.route === 'grocery') {
      next.groceries.push({ ...record, id: id(), items: [] });
    } else {
      const variable = row.route === 'variable';
      next.bills.push({
        ...record, id: id(), status: 'paid', variable,
        category: categoryForRoute(row.route, row.category),
      });
    }

    index.keys.add(row.key);
    months.add(row.date.slice(0, 7));
    count += 1;
  }

  return { budget: count ? next : budget, count, repeated, months: [...months].sort() };
}
