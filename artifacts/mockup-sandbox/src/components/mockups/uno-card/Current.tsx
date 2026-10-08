import './_group.css';

type CardColor = 'red' | 'yellow' | 'green' | 'blue' | null;
type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
type PreviewCard = {
  color: CardColor;
  kind: CardKind;
  label: string;
  value?: number | null;
};

const previewCard: PreviewCard = { color: 'red', kind: 'number', value: 7, label: '7' };

function cardFace(card: PreviewCard) {
  return card.kind === 'number'
    ? String(card.value ?? card.label)
    : ({ skip: '⊘', reverse: '↻', draw2: '+2', wild: 'W', wild4: '+4' }[card.kind] || card.label);
}

function colorName(color: CardColor) {
  return color ? color[0].toUpperCase() + color.slice(1) : 'Wild';
}

function CardFace({ card }: { card: PreviewCard }) {
  const colorClass = card.color ? `card-${card.color}` : 'card-wild';
  return (
    <div className={`playing-card ${colorClass}`} role="img" aria-label={`${colorName(card.color)} ${card.label}`}>
      <span className="card-corner" aria-hidden="true">{card.label}</span>
      <span className="card-symbol" aria-hidden="true">{cardFace(card)}</span>
    </div>
  );
}

export function Current() {
  return (
    <main className="card-preview">
      <div className="preview-note">UNO Arena · Current card</div>
      <div className="card-frame"><CardFace card={previewCard} /></div>
      <div className="preview-caption">Layered card stock · lacquered print · raised ink</div>
    </main>
  );
}
