import { useEffect, useRef, useState } from 'react';
import {
  amountInput, defaultDate, FIXED_CATEGORIES, GROCERY_CATEGORIES, id, itemTotal, lastDay, money, monthLabel, parseAmount, parseQuantity, purchaseTotal, requiredDate, requiredText,
} from '../lib/budget';
import { simulateReceipt } from '../lib/receipt';
import { AmountField, Icon, IconButton, Modal, TextField } from './UI';

const FORMS = {
  salary: ['Cadastrar salário', 'Editar salário'],
  income: ['Nova renda extra', 'Editar renda extra'],
  bill: ['Nova despesa fixa', 'Editar despesa fixa'],
  grocery: ['Nova compra', 'Editar compra'],
  goal: ['Nova meta', 'Editar meta'],
  deposit: ['Registrar aporte', 'Editar aporte'],
};

function itemFields(item) {
  return { ...item, quantity: String(item.quantity).replace('.', ','), unit: amountInput(item.unit) };
}

function initialValues(record, kind, period) {
  return {
    title: record?.title ?? record?.name ?? '',
    amount: amountInput(kind === 'goal' ? record?.target : record?.amount),
    initial: amountInput(record?.initial),
    date: record?.date ?? defaultDate(period),
    category: record?.category ?? FIXED_CATEGORIES[0],
    status: record?.status ?? 'pending',
    items: record?.items?.map(itemFields) ?? [],
  };
}

function getItem(item) {
  return {
    id: item.id,
    name: requiredText(item.name, 'nome do item'),
    category: item.category,
    quantity: parseQuantity(item.quantity),
    unit: parseAmount(item.unit, 'valor unitário'),
  };
}

function estimateItems(items) {
  try {
    return purchaseTotal(items.map((item) => ({
      quantity: parseQuantity(item.quantity),
      unit: parseAmount(item.unit, 'valor unitário'),
    })));
  } catch {
    return null;
  }
}

function Select({ id, label, options, value, onChange }) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <select className="form-select" id={id} value={value} onChange={onChange}>
        {options.map((entry) => {
          const [option, text] = Array.isArray(entry) ? entry : [entry, entry];
          return <option key={option} value={option}>{text}</option>;
        })}
      </select>
    </div>
  );
}

function PurchaseItems({ items, setItems }) {
  function patchItem(itemId, field, value) {
    setItems((previous) => previous.map((item) => item.id === itemId ? { ...item, [field]: value } : item));
  }

  return (
    <div className="item-editor">
      <div className="item-editor-title">
        <div><h3>Itens da compra</h3><p>Ao detalhar a compra, o total é calculado pelos itens.</p></div>
        <button type="button" className="btn btn-outline-cash" onClick={() => setItems((previous) => [...previous, {
          id: id(), name: '', category: GROCERY_CATEGORIES[0], quantity: '1', unit: '',
        }])}><Icon name="plus-lg" />Adicionar item</button>
      </div>
      {items.map((item, index) => (
        <div key={item.id} className="item-editor-row">
          <TextField label={'Item ' + (index + 1)} id={'item-' + item.id} value={item.name} required maxLength={85}
            onChange={(event) => patchItem(item.id, 'name', event.target.value)} />
          <Select label="Categoria" id={'category-' + item.id} value={item.category} options={GROCERY_CATEGORIES}
            onChange={(event) => patchItem(item.id, 'category', event.target.value)} />
          <TextField label="Qtd." id={'quantity-' + item.id} value={item.quantity} inputMode="decimal" maxLength={9} required
            onChange={(event) => patchItem(item.id, 'quantity', event.target.value)} />
          <AmountField label="Unitário" id={'unit-' + item.id} value={item.unit} required
            onChange={(event) => patchItem(item.id, 'unit', event.target.value)} />
          <IconButton icon="trash3" label={'Remover item ' + (index + 1)} danger
            onClick={() => setItems((previous) => previous.filter((entry) => entry.id !== item.id))} />
        </div>
      ))}
    </div>
  );
}

function ReceiptInput({ apply, onBusy }) {
  const upload = useRef(null);
  const camera = useRef(null);
  const attempt = useRef(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => () => { attempt.current += 1; }, []);

  async function scan(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;

    const scanId = ++attempt.current;
    setLoading(true);
    onBusy(true);
    setError('');
    try {
      const { image, items } = await simulateReceipt(file);
      if (scanId !== attempt.current) return;
      setResult({ image, name: file.name });
      apply(items.map((item) => itemFields({ ...item, id: id() })));
    } catch (scanError) {
      if (scanId === attempt.current) setError(scanError.message);
    } finally {
      if (scanId === attempt.current) {
        setLoading(false);
        onBusy(false);
      }
    }
  }

  return (
    <section className="scan-box">
      <div className="scan-heading"><span className="metric-icon metric-icon-grocery"><Icon name="upc-scan" /></span>
        <div><h3>Scanner de nota · Simulação</h3><p>Escolha uma imagem para preencher itens fictícios. Confira e edite os valores antes de salvar.</p></div>
      </div>
      <input type="file" accept="image/*" hidden ref={upload} onChange={scan} />
      <input type="file" accept="image/*" capture="environment" hidden ref={camera} onChange={scan} />
      <div className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline-cash" disabled={loading} onClick={() => upload.current.click()}>
          <Icon name="upload" />Enviar imagem
        </button>
        <button type="button" className="btn btn-outline-cash" disabled={loading} onClick={() => camera.current.click()}>
          <Icon name="camera" />Usar câmera
        </button>
      </div>
      {loading && <p className="scan-feedback" role="status">Lendo imagem…</p>}
      {error && <p className="scan-feedback text-danger" role="alert">{error}</p>}
      {result && <div className="scan-result">
        <img src={result.image} alt="Prévia da nota selecionada" />
        <p role="status"><strong>{result.name}</strong><span>Itens simulados inseridos no formulário.</span></p>
      </div>}
    </section>
  );
}

export default function Editor({ config, onClose, onSave }) {
  const { kind, record, period, scan, goal } = config;
  const [values, setValues] = useState(() => initialValues(record, kind, period));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const busy = useRef(false);
  const isPurchase = kind === 'grocery';
  const hasItems = isPurchase && values.items.length > 0;
  const hasDate = !['salary', 'goal'].includes(kind);
  const hasTitle = !['salary', 'deposit'].includes(kind);

  function patch(key, value) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function setItems(change) {
    setValues((previous) => ({ ...previous, items: change(previous.items) }));
  }

  function useScannedItems(items) {
    setValues((previous) => ({ ...previous, title: previous.title || 'Compra com nota', items }));
  }

  function payload() {
    const date = hasDate ? requiredDate(values.date, period) : undefined;
    const title = hasTitle ? requiredText(values.title, kind === 'goal' ? 'nome' : 'descrição') : undefined;
    const items = hasItems ? values.items.map(getItem) : [];
    const amount = hasItems ? purchaseTotal(items) : parseAmount(values.amount, 'valor', kind === 'salary');

    if (kind === 'salary') return { amount };
    if (kind === 'goal') return { name: title, target: amount, initial: parseAmount(values.initial || '0', 'valor já guardado', true) };
    if (kind === 'deposit') return { amount, date };
    if (kind === 'bill') return { title, amount, date, category: values.category, status: values.status };
    if (isPurchase) return { title, amount, date, items };
    return { title, amount, date };
  }

  async function submit(event) {
    event.preventDefault();
    if (busy.current || scanning) return;
    setError('');
    busy.current = true;
    setSaving(true);
    try {
      await onSave(payload());
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const description = goal ? goal.name + ' · ' + monthLabel(period) : kind === 'goal' ? undefined : monthLabel(period);
  const calculated = hasItems ? estimateItems(values.items) : null;

  return (
    <Modal title={scan ? 'Escanear nota fiscal' : FORMS[kind][record ? 1 : 0]} description={description}
      onClose={onClose} locked={saving} wide={isPurchase}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {scan && <ReceiptInput apply={useScannedItems} onBusy={setScanning} />}
          <div className="editor-fields">
            {hasTitle && <div className="editor-full">
              <TextField id="record-title" label={kind === 'goal' ? 'Nome da meta' : 'Descrição'} value={values.title}
                required maxLength={85} autoFocus={!scan} placeholder={kind === 'goal' ? 'Reserva de emergência' : undefined}
                onChange={(event) => patch('title', event.target.value)} />
            </div>}
            {hasItems ? <div className="calculated-amount"><span>Total calculado</span><strong>{calculated === null ? '—' : money(calculated)}</strong></div> : (
              <AmountField id="record-amount" label={kind === 'goal' ? 'Valor da meta' : isPurchase ? 'Total da compra' : 'Valor'}
                value={values.amount} required={!isPurchase} autoFocus={!hasTitle}
                onChange={(event) => patch('amount', event.target.value)} />
            )}
            {hasDate && <TextField type="date" id="record-date" label={kind === 'bill' ? 'Vencimento' : 'Data'}
              value={values.date} required min={period + '-01'} max={lastDay(period)}
              onChange={(event) => patch('date', event.target.value)} />}
            {kind === 'bill' && <>
              <Select id="record-category" label="Categoria" options={FIXED_CATEGORIES} value={values.category}
                onChange={(event) => patch('category', event.target.value)} />
              <Select id="record-status" label="Status" options={[[ 'pending', 'Pendente' ], [ 'paid', 'Pago' ]]} value={values.status}
                onChange={(event) => patch('status', event.target.value)} />
            </>}
            {kind === 'goal' && <AmountField id="record-initial" label="Valor já guardado" value={values.initial}
              onChange={(event) => patch('initial', event.target.value)} />}
          </div>
          {kind === 'goal' && <p className="form-text">Use “Valor já guardado” para dinheiro separado antes desta meta.</p>}
          {isPurchase && <PurchaseItems items={values.items} setItems={setItems} />}
          {error && <p className="alert alert-danger modal-alert" role="alert">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline-cash" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-cash" disabled={saving || scanning}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
