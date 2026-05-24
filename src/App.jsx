import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, BG } from './theme.js';
import { loadDecks, saveDeck, deleteDeck } from './lib/storage.js';
import { loadCardCache } from './lib/scryfall.js';
import { DeckListView } from './components/DeckList.jsx';
import { DeckEditor } from './components/DeckEditor.jsx';

export default function App() {
  const [decks, setDecks] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDecks().then((d) => {
      setDecks(d);
      setLoading(false);
    });
    loadCardCache();
  }, []);

  const activeDeck = decks.find((d) => d.id === activeId);

  const handleCreate = async (name) => {
    const deck = {
      id: 'deck_' + Date.now(),
      name,
      cards: [],
      commander: null,
      created: Date.now(),
      updated: Date.now(),
    };
    await saveDeck(deck);
    setDecks([deck, ...decks]);
    setActiveId(deck.id);
  };

  const handleUpdate = async (updated) => {
    await saveDeck(updated);
    setDecks(decks.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleDelete = async (id) => {
    await deleteDeck(id);
    setDecks(decks.filter((d) => d.id !== id));
    if (activeId === id) setActiveId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4" style={{ color: CREAM_DIM }} />
          <div className="font-serif text-[10px] tracking-[0.4em] uppercase" style={{ color: CREAM_DIM }}>
            Loading Vault
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: BG, color: CREAM }}>
      {activeDeck ? (
        <DeckEditor deck={activeDeck} onUpdate={handleUpdate} onBack={() => setActiveId(null)} />
      ) : (
        <DeckListView decks={decks} onSelect={setActiveId} onCreate={handleCreate} onDelete={handleDelete} />
      )}
    </div>
  );
}
