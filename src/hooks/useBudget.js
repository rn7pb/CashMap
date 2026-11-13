import { useEffect, useState } from 'react';
import { newBudget } from '../lib/budget';
import { exampleBudget } from '../lib/example';

const STORAGE_KEY = 'cashmap:budget:v1';

function readBudget() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const saved = JSON.parse(raw);

  if (saved?.version !== 1 || !saved.salaries || !Array.isArray(saved.income) ||
      !Array.isArray(saved.bills) || !Array.isArray(saved.groceries) || !Array.isArray(saved.goals)) {
    throw new Error('Dados do CashMap em formato desconhecido.');
  }

  return saved;
}

function loadBudget() {
  try {
    const budget = readBudget();
    return budget
      ? { budget, isExample: false, storageError: '' }
      : { budget: exampleBudget(), isExample: true, storageError: '' };
  } catch {
    return { budget: newBudget(), isExample: false, storageError: 'Não foi possível abrir os dados salvos neste navegador.' };
  }
}

export function useBudget() {
  const [state, setState] = useState(loadBudget);

  useEffect(() => {
    function sync(event) {
      if (event.key === STORAGE_KEY || event.key === null) setState(loadBudget());
    }

    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  async function update(change) {
    function persist() {
      let latest;
      try {
        latest = readBudget();
      } catch {
        const message = 'Não foi possível ler o armazenamento do navegador. Nenhum dado foi sobrescrito.';
        setState((current) => ({ ...current, storageError: message }));
        throw new Error(message);
      }

      const next = change(latest ?? newBudget());
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        const message = 'O navegador não conseguiu salvar a alteração. Verifique o espaço e a permissão de armazenamento.';
        setState((current) => ({ ...current, storageError: message }));
        throw new Error(message);
      }

      setState({ budget: next, isExample: false, storageError: '' });
    }

    // HTTPS e localhost permitem serializar gravações feitas em abas diferentes.
    if (navigator.locks) await navigator.locks.request(STORAGE_KEY, persist);
    else persist();
  }

  return { ...state, update };
}
