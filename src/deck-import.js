export function catalogCodeToDeckCode(variantNumber) {
  const value = String(variantNumber || '');
  const dash = value.indexOf('-');
  if (dash < 1) return value.toUpperCase();

  const set = value.slice(0, dash).toUpperCase();
  const identifier = value.slice(dash + 1);

  let match = identifier.match(/^(\d+[ab]?)-\d+$/i);
  if (match) return `${set}-${match[1].toLowerCase()}`;

  match = identifier.match(/^(\d+)-star-\d+$/i);
  if (match) return `${set}-${match[1]}s`;

  match = identifier.match(/^r(\d+)$/i);
  if (match) return `${set}-R${match[1]}`;

  match = identifier.match(/^sp(\d+)-\d+$/i);
  if (match) return `${set}-SP${Number(match[1])}`;

  return `${set}-${identifier}`;
}

export function buildCatalogDeckCodeMap(cards) {
  return new Map(cards.map(card => [catalogCodeToDeckCode(card.variantNumber), card.variantNumber]));
}

export function parseImportText(input, getDeckFromCode) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Paste a deck code or card list first.');

  if (/^[A-Z2-7]+$/.test(value) && value.length >= 10) {
    const decoded = getDeckFromCode(value);
    const counts = new Map();
    for (const card of [...decoded.mainDeck, ...decoded.sideboard]) {
      counts.set(card.cardCode, (counts.get(card.cardCode) || 0) + card.count);
    }
    return [...counts].map(([cardCode, count]) => ({ cardCode, count }));
  }

  return value
    .split(/\s+/)
    .map(token => token.split('-').slice(0, 2).join('-'))
    .filter(cardCode => cardCode.includes('-'))
    .map(cardCode => ({ cardCode, count: 1 }));
}
