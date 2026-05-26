import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, BG } from './theme.js';
import { loadDecks, saveDeck, deleteDeck, readLocalDecks, clearLocalDecks } from './lib/storage.js';
import { uploadLocalDecks } from './lib/storage-supabase.js';
import { useAuthState, isCloudEnabled, signOut, consumeOAuthParams } from './lib/supabase.js';
import { loadCardCache, fetchCardsByName } from './lib/scryfall.js';
import { duplicateDeck, addCardsToDeck } from './lib/deckops.js';
import { decodeDeckUrl } from './lib/share.js';
import { loadSettings } from './lib/settings.js';
import { DeckListView } from './components/DeckList.jsx';
import { DeckEditor } from './components/DeckEditor.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { OfflineIndicator } from './components/OfflineIndicator.jsx';
import { AuthModal } from './components/AuthModal.jsx';
import { ProfileModal } from './components/ProfileModal.jsx';
import { BackupModal, SettingsModal } from './components/Modals.jsx';
import { CollectionModal } from './components/CollectionModal.jsx';
import { GlobalDropOverlay } from './components/GlobalDropOverlay.jsx';
import { addToCollection } from './lib/collection.js';
import { loadProfile } from './lib/profile.js';

export default function App() {
  const [decks, setDecks] = useState([]);
  const [activeId, setActiveId] = useState(null);
  // Transient gallery-view deck. Kept separate from `decks` so it
  // never shows up in the archive list — only when it's the active
  // deck (via id match). Cleared when the user navigates back.
  const [viewingDeck, setViewingDeck] = useState(null);
  const [initialTab, setInitialTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingShare, setPendingShare] = useState(null);
  const [importingShare, setImportingShare] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [showBackup, setShowBackup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  // Bumped whenever the user's collection mutates from outside the
  // VaultSection (e.g. via the global drop overlay or the CollectionModal).
  // DeckList watches this as a useEffect dependency to re-fetch.
  const [collectionRev, setCollectionRev] = useState(0);
  // Migration state — when a user signs in for the first time with local
  // decks present, we kick off an auto-upload.
  const [migrating, setMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState(null);
  const [authError, setAuthError] = useState(null);

  const auth = useAuthState();

  const selectDeck = (id, tab) => {
    setActiveId(id);
    setInitialTab(tab || null);
  };

  // Reload decks whenever auth changes (sign-in routes us to cloud,
  // sign-out routes us back to local).
  useEffect(() => {
    if (auth.loading) return;
    setLoading(true);
    loadDecks().then((d) => {
      setDecks(d);
      setLoading(false);
    });
  }, [auth.user?.id, auth.loading]);

  // First-sign-in onboarding: if the signed-in user has no username
  // row yet, open the Profile modal in onboarding mode so they can
  // pick one before doing anything else.
  const [profileMode, setProfileMode] = useState(null); // null | 'onboarding' | 'edit'
  useEffect(() => {
    if (!auth.user?.id) {
      setProfileMode(null);
      return;
    }
    let alive = true;
    loadProfile(auth.user.id).then((p) => {
      if (!alive) return;
      if (!p?.username) setProfileMode('onboarding');
    });
    return () => { alive = false; };
  }, [auth.user?.id]);

  useEffect(() => {
    loadCardCache();

    // OAuth params: shared-deck URL share uses `#d=...`; Supabase magic-link
    // / Google OAuth use `?code=...&state=...` or `?error=...`. Check the
    // deck-share hash FIRST so it isn't swallowed by the cleanup.
    if (typeof window !== 'undefined' && window.location.hash) {
      const decoded = decodeDeckUrl(window.location.hash);
      if (decoded && decoded.cards.length > 0) setPendingShare(decoded);
    }
    // Then surface any OAuth error and queue URL cleanup.
    const err = consumeOAuthParams();
    if (err) {
      // Friendlier text — Supabase's raw "flow_state_already_used" doesn't
      // help non-technical users.
      const friendly = /flow_state_already_used|state.*already/i.test(err)
        ? 'Sign-in link was already used. Try again — opening a fresh tab usually fixes it.'
        : err;
      setAuthError(friendly);
      setTimeout(() => setAuthError(null), 10000);
    }
  }, []);

  // First-sign-in migration: if we have local decks AND the user just
  // signed in AND we haven't migrated this account before, push them.
  useEffect(() => {
    if (!auth.user || auth.loading || migrating) return;
    const migratedKey = `vault:migrated:${auth.user.id}`;
    if (localStorage.getItem(migratedKey)) return;

    const local = readLocalDecks();
    if (local.length === 0) {
      localStorage.setItem(migratedKey, '1');
      return;
    }

    (async () => {
      setMigrating(true);
      setMigrationMessage(`Uploading ${local.length} local deck${local.length === 1 ? '' : 's'}...`);
      try {
        const uploaded = await uploadLocalDecks(local);
        clearLocalDecks();
        localStorage.setItem(migratedKey, '1');
        setMigrationMessage(`✓ Migrated ${uploaded} deck${uploaded === 1 ? '' : 's'} to your account.`);
        // Reload to show the freshly-uploaded cloud copies.
        const reloaded = await loadDecks();
        setDecks(reloaded);
        setTimeout(() => setMigrationMessage(null), 5000);
      } catch (e) {
        setMigrationMessage(`Migration failed: ${e.message}. Your local decks are still safe.`);
        setTimeout(() => setMigrationMessage(null), 8000);
      } finally {
        setMigrating(false);
      }
    })();
  }, [auth.user?.id, auth.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeDeck = decks.find((d) => d.id === activeId)
    || (viewingDeck && viewingDeck.id === activeId ? viewingDeck : null);

  const handleCreate = async (name) => {
    const settings = loadSettings();
    const deck = {
      id: 'deck_' + Date.now(),
      name,
      cards: [],
      commander: null,
      strictIdentity: !!settings.strictIdentityDefault,
      created: Date.now(),
      updated: Date.now(),
    };
    await saveDeck(deck);
    setDecks([deck, ...decks]);
    setActiveId(deck.id);
  };

  const handleUpdate = async (updated) => {
    // Gallery view-mode + freshly-rolled decks live in a transient
    // slot. They never join the archive `decks` array and never get
    // persisted unless the user explicitly hits 'Save to my archive'
    // in the editor (which routes through handleSaveTransient below).
    if (updated.__readonly || updated.__transient ||
        String(updated.id).startsWith('view:') ||
        String(updated.id).startsWith('roll:')) {
      setViewingDeck(updated);
      return;
    }
    await saveDeck(updated);
    setDecks(decks.map((d) => (d.id === updated.id ? updated : d)));
  };

  // Promote a transient (rolled / viewed) deck into the real archive.
  // Mints a new local id, strips the transient flags, persists, and
  // routes the editor to the new permanent deck.
  const handleSaveTransient = async (transientDeck) => {
    const fresh = {
      ...transientDeck,
      id: 'deck_' + Date.now(),
      __readonly: undefined,
      __transient: undefined,
      created: Date.now(),
      updated: Date.now(),
      is_public: false,
    };
    delete fresh.__readonly;
    delete fresh.__transient;
    await saveDeck(fresh);
    setDecks((current) => [fresh, ...current]);
    setViewingDeck(null);
    setActiveId(fresh.id);
    return fresh;
  };

  const handleDelete = async (id) => {
    await deleteDeck(id);
    setDecks(decks.filter((d) => d.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const handleDuplicate = async (deck) => {
    const copy = duplicateDeck(deck);
    await saveDeck(copy);
    setDecks([copy, ...decks]);
    setActiveId(copy.id);
  };

  const handleImport = async ({ name, commander, cards, notes, seedMeta, isPublic }) => {
    const base = {
      id: 'deck_' + Date.now(),
      name,
      commander: commander || null,
      cards: [],
      notes: notes || undefined,
      // seedMeta records how a rolled deck was generated (bracket /
      // budget / archetype / commander identity). The random-rolls
      // gallery filters on its presence.
      seedMeta: seedMeta || undefined,
      is_public: !!isPublic,
      created: Date.now(),
      updated: Date.now(),
    };
    const populated = addCardsToDeck(base, cards);
    await saveDeck(populated);
    setDecks([populated, ...decks]);
    setActiveId(populated.id);
  };

  const acceptShare = async () => {
    if (!pendingShare) return;
    setImportingShare(true);
    try {
      const names = [
        ...(pendingShare.commanderName ? [pendingShare.commanderName] : []),
        ...pendingShare.cards.map((c) => c.name),
      ];
      const uniq = [...new Set(names)];
      const { results } = await fetchCardsByName(uniq, setImportProgress);
      const commander = pendingShare.commanderName
        ? results[pendingShare.commanderName.toLowerCase()] || null
        : null;
      const cards = pendingShare.cards
        .map(({ count, name }) => {
          const c = results[name.toLowerCase()];
          return c ? { name: c.name, count, scryfall: c } : null;
        })
        .filter(Boolean);
      await handleImport({ name: pendingShare.name, commander, cards });
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setPendingShare(null);
      setImportProgress('');
    } finally {
      setImportingShare(false);
    }
  };

  const handleRestore = async (importedDecks, mode) => {
    let next;
    if (mode === 'replace') {
      for (const d of decks) await deleteDeck(d.id);
      next = importedDecks;
    } else {
      const existingIds = new Set(decks.map((d) => d.id));
      const additions = importedDecks.filter((d) => !existingIds.has(d.id));
      next = [...additions, ...decks];
    }
    for (const d of importedDecks) await saveDeck(d);
    setDecks(next.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)));
    setShowBackup(false);
  };

  const dismissShare = () => {
    setPendingShare(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    // Auth state listener triggers a reload of decks (back to local).
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
      {pendingShare && (
        <SharePrompt
          share={pendingShare}
          onAccept={acceptShare}
          onDismiss={dismissShare}
          loading={importingShare}
          progress={importProgress}
        />
      )}
      {migrationMessage && (
        <MigrationBanner message={migrationMessage} busy={migrating} />
      )}
      {authError && (
        <AuthErrorBanner message={authError} onDismiss={() => setAuthError(null)} />
      )}
      <ErrorBoundary label="Vault hit an unexpected error">
        {activeDeck ? (
          <DeckEditor
            deck={activeDeck}
            onUpdate={handleUpdate}
            onBack={() => { setActiveId(null); setInitialTab(null); setViewingDeck(null); }}
            onDuplicate={() => handleDuplicate(activeDeck)}
            onSaveTransient={handleSaveTransient}
            otherDecks={decks.filter((d) => d.id !== activeDeck.id)}
            initialTab={initialTab}
          />
        ) : (
          <DeckListView
            decks={decks}
            onSelect={selectDeck}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onImport={handleImport}
            onBackup={() => setShowBackup(true)}
            onSettings={() => setShowSettings(true)}
            onProfile={() => setProfileMode('edit')}
            onCollection={() => setShowCollection(true)}
            collectionRev={collectionRev}
            user={auth.user}
            cloudEnabled={isCloudEnabled()}
            onSignIn={() => setShowAuth(true)}
            onSignOut={handleSignOut}
            onImportFromGallery={async (deck) => {
              // Copy a public gallery deck into the user's archive.
              const copy = duplicateDeck(deck);
              copy.is_public = false;
              copy.name = `${deck.name} (copy)`;
              await saveDeck(copy);
              const reloaded = await loadDecks();
              setDecks(reloaded);
            }}
            onViewGalleryDeck={(deck) => {
              // Open a gallery deck in a transient session — slot it into
              // `viewingDeck`, NOT into `decks`. The archive list never
              // shows it; navigating back clears it.
              const viewerDeck = {
                ...deck,
                id: `view:${deck.id}`,
                __readonly: true,
              };
              setViewingDeck(viewerDeck);
              selectDeck(viewerDeck.id);
            }}
            onRandomBuild={(payload) => {
              // Rolled decks open in a transient session — they
              // don't clutter the archive unless the user explicitly
              // hits 'Save to my archive' in the editor. Mirrors
              // the gallery-view-deck flow.
              const transientDeck = {
                id: `roll:${Date.now()}`,
                name: payload.name,
                commander: payload.commander || null,
                cards: [],
                notes: payload.notes || undefined,
                seedMeta: payload.seedMeta,
                strictIdentity: false,
                created: Date.now(),
                updated: Date.now(),
                __readonly: false, // editable but transient
                __transient: true,
              };
              const populated = addCardsToDeck(transientDeck, payload.cards || []);
              setViewingDeck(populated);
              selectDeck(populated.id);
            }}
          />
        )}
      </ErrorBoundary>
      {showBackup && (
        <BackupModal
          decks={decks}
          onRestore={handleRestore}
          onClose={() => setShowBackup(false)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showCollection && (
        <CollectionModal
          onClose={() => { setShowCollection(false); setCollectionRev((r) => r + 1); }}
          signedIn={!!auth.user}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {profileMode && auth.user && (
        <ProfileModal
          user={auth.user}
          onClose={() => setProfileMode(null)}
          onboarding={profileMode === 'onboarding'}
        />
      )}
      <OfflineIndicator />
      <GlobalDropOverlay
        activeDeckName={activeDeck?.name}
        onAddToVault={async (card) => {
          await addToCollection(card.name, 1);
          // Bump the rev so DeckList's VaultSection refreshes its
          // collection state and the new thumbnail appears immediately.
          setCollectionRev((r) => r + 1);
        }}
        onAddToDeck={activeDeck ? (card) => {
          const next = addCardsToDeck(activeDeck, [{ name: card.name, count: 1, scryfall: card }]);
          handleUpdate(next);
        } : null}
      />
    </div>
  );
}

function SharePrompt({ share, onAccept, onDismiss, loading, progress }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 border-b"
      style={{ borderColor: 'rgba(243,231,201,0.15)', background: 'rgba(13,22,20,0.95)', backdropFilter: 'blur(6px)' }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
            Shared deck detected
          </div>
          <div className="font-serif text-sm mt-0.5 truncate" style={{ color: CREAM }}>
            <span style={{ color: CREAM_DIM }}>{share.cards.length} cards</span>
            {share.commanderName && (
              <> · <span>{share.commanderName}</span></>
            )}{' '}— <span style={{ color: CREAM_DIM }}>"{share.name}"</span>
          </div>
          {progress && (
            <div className="font-mono text-[10px] mt-1" style={{ color: CREAM_DIM }}>{progress}</div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onDismiss}
            disabled={loading}
            className="font-serif text-[10px] tracking-[0.3em] uppercase disabled:opacity-30"
            style={{ color: CREAM_DIM }}
          >
            Dismiss
          </button>
          <button
            onClick={onAccept}
            disabled={loading}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
            style={{ borderColor: 'rgba(243,231,201,0.3)', color: CREAM }}
          >
            {loading ? 'Importing...' : 'Import →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MigrationBanner({ message, busy }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 border-b"
      style={{ borderColor: 'rgba(243,231,201,0.15)', background: 'rgba(13,22,20,0.95)', backdropFilter: 'blur(6px)' }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
        <div className="font-mono text-xs" style={{ color: CREAM }}>{message}</div>
      </div>
    </div>
  );
}

function AuthErrorBanner({ message, onDismiss }) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 border-b"
      style={{ borderColor: 'rgba(196,74,63,0.6)', background: 'rgba(13,22,20,0.95)', backdropFilter: 'blur(6px)' }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
        <div className="font-serif text-[10px] tracking-[0.3em] uppercase shrink-0" style={{ color: '#c44a3f' }}>
          Sign-in error
        </div>
        <div className="font-mono text-xs flex-1" style={{ color: CREAM }}>{message}</div>
        <button onClick={onDismiss} className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
