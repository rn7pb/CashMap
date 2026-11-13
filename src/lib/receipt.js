const PRODUCTS = [
  { name: 'Arroz', category: 'Mercearia', quantity: 1, unit: 2490 },
  { name: 'Feijão', category: 'Mercearia', quantity: 2, unit: 789 },
  { name: 'Banana', category: 'Hortifrúti', quantity: 1, unit: 695 },
  { name: 'Tomate', category: 'Hortifrúti', quantity: 1, unit: 854 },
  { name: 'Frango', category: 'Carnes', quantity: 1, unit: 2370 },
  { name: 'Leite', category: 'Laticínios', quantity: 2, unit: 568 },
  { name: 'Detergente', category: 'Limpeza', quantity: 1, unit: 389 },
  { name: 'Sabonete', category: 'Higiene', quantity: 2, unit: 295 },
];

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível abrir o arquivo de imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(reader.result);
      image.onerror = () => reject(new Error('O navegador não reconheceu a imagem. Tente um arquivo JPG, PNG ou WebP.'));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function simulateReceipt(file) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Escolha uma imagem com até 10 MB.');

  const image = await readImage(file);

  // A imagem seleciona um conjunto reproduzível de dados fictícios para o formulário.
  let seed = file.size;
  const stride = Math.max(1, Math.floor(image.length / 160));
  for (let index = 0; index < image.length; index += stride) {
    seed = (Math.imul(seed, 31) + image.charCodeAt(index)) >>> 0;
  }
  const start = seed % PRODUCTS.length;
  const count = 3 + (seed >>> 8) % 3;
  const items = Array.from({ length: count }, (_, index) => ({
    ...PRODUCTS[(start + index) % PRODUCTS.length],
  }));

  return { image, items };
}
