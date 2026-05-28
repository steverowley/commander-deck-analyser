/**
 * PodsPage — pod tracking + game log.
 *
 * Two modes:
 *   - List: every pod the user owns, with a "Create pod" form.
 *   - Detail (when `selectedId` is set): pod header, member CRUD,
 *     game-log entry form, recent-games list, win counts per member.
 *
 * Owner-private — RLS on `pods.owner_id` does the work; this UI never
 * shows other people's pods.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, Trash2, Users, Trophy, Loader2 } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, ACCENT } from '../theme.js';
import { pad } from '../lib/utils.js';
import {
  listPods, createPod, deletePod,
  listPodMembers, addPodMember, removePodMember,
  listGames, logGame, deleteGame, aggregatePodStats,
} from '../lib/pods.js';

export function PodsPage({ onBack, signedIn, decks = [] }) {
  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [newPodName, setNewPodName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    listPods().then((p) => {
      setPods(p);
      setLoading(false);
    });
  }, [signedIn]);

  const refresh = async () => {
    const p = await listPods();
    setPods(p);
  };

  const handleCreate = async (e) => {
    e?.preventDefault();
    if (!newPodName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const pod = await createPod({ name: newPodName.trim() });
      setNewPodName('');
      await refresh();
      setSelectedId(pod.id);
    } catch (err) {
      setError(err.message || 'Failed to create pod.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this pod and all its games?')) return;
    await deletePod(id);
    await refresh();
    if (selectedId === id) setSelectedId(null);
  };

  if (!signedIn) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-12">
        <Header onBack={onBack} title="Pods" />
        <div className="border p-12 text-center font-serif italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          Sign in to track pods and log games. Pods are owner-private — only you see them.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-12">
        <Header onBack={onBack} title="Pods" />
        <div className="border p-12 text-center" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> Loading pods…
        </div>
      </div>
    );
  }

  const selected = pods.find((p) => p.id === selectedId);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-6">
      <Header
        onBack={selected ? () => setSelectedId(null) : onBack}
        title={selected ? selected.name : 'Pods'}
      />

      {selected ? (
        <PodDetail pod={selected} decks={decks} onDelete={handleDelete} />
      ) : (
        <>
          <form onSubmit={handleCreate} className="border p-4 flex flex-col md:flex-row gap-3 md:items-end" style={{ borderColor: CREAM_FAINT }}>
            <div className="flex-1">
              <label className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2 block" style={{ color: CREAM_DIM }}>
                Create a new pod
              </label>
              <input
                value={newPodName}
                onChange={(e) => setNewPodName(e.target.value)}
                placeholder="Friday night EDH"
                disabled={busy}
                maxLength={80}
                className="w-full border px-4 py-2.5 bg-transparent focus:outline-none font-mono text-sm"
                style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !newPodName.trim()}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 shrink-0 disabled:opacity-30 whitespace-nowrap"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
            >
              <Plus className="w-3 h-3 inline -mt-px mr-1.5" />
              {busy ? 'Creating…' : 'Create pod →'}
            </button>
          </form>

          {error && (
            <div className="px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(var(--accent-rgb),0.08)', color: CREAM }}>
              {error}
            </div>
          )}

          {pods.length === 0 ? (
            <div className="border p-12 text-center font-serif italic" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
              No pods yet. Create one above to start logging games.
            </div>
          ) : (
            <ul className="border-t border-l" style={{ borderColor: CREAM_FAINT }}>
              {pods.map((pod) => (
                <li
                  key={pod.id}
                  className="border-r border-b flex items-center justify-between gap-3 p-4 hover:bg-[rgba(var(--ink-rgb),0.04)] cursor-pointer"
                  style={{ borderColor: CREAM_FAINT }}
                  onClick={() => setSelectedId(pod.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold uppercase tracking-tight truncate" style={{ color: CREAM }}>
                      {pod.name}
                    </div>
                    <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: CREAM_DIM }}>
                      created {new Date(pod.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(pod.id); }}
                    className="opacity-60 hover:opacity-100 transition"
                    style={{ color: CREAM_DIM }}
                    title="Delete pod"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Header({ onBack, title }) {
  return (
    <nav className="border-b pb-4 flex items-center gap-3" style={{ borderColor: CREAM_FAINT }}>
      {onBack && (
        <button onClick={onBack} style={{ color: CREAM_DIM }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <h1 className="font-serif text-2xl md:text-3xl font-black uppercase tracking-tight" style={{ color: CREAM }}>
        {title}
      </h1>
    </nav>
  );
}

/**
 * Per-pod detail view — members, log-game form, recent games.
 */
function PodDetail({ pod, decks }) {
  const [members, setMembers] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMemberName, setNewMemberName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [m, g] = await Promise.all([listPodMembers(pod.id), listGames(pod.id)]);
    setMembers(m);
    setGames(g);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [pod.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddMember = async (e) => {
    e?.preventDefault();
    if (!newMemberName.trim()) return;
    setBusy(true);
    try {
      await addPodMember({ podId: pod.id, displayName: newMemberName.trim() });
      setNewMemberName('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (id) => {
    if (!confirm('Remove this member? Their game history stays in the log.')) return;
    await removePodMember(id);
    await refresh();
  };

  const handleDeleteGame = async (id) => {
    if (!confirm('Delete this game?')) return;
    await deleteGame(id);
    await refresh();
  };

  const allSeats = useMemo(() => games.flatMap((g) => g.seats), [games]);
  const stats = useMemo(
    () => aggregatePodStats({
      games: games.map((g) => g.game),
      allSeats,
      members,
    }),
    [games, allSeats, members]
  );

  if (loading) {
    return (
      <div className="border p-12 text-center" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> Loading pod…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <section className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
          <Users className="w-3.5 h-3.5" /> Members · {pad(members.length)}
        </div>
        <div className="p-4 space-y-3">
          <form onSubmit={handleAddMember} className="flex flex-col md:flex-row gap-3 md:items-center">
            <input
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Display name (e.g. Alex)"
              disabled={busy}
              maxLength={60}
              className="flex-1 border px-4 py-2 bg-transparent focus:outline-none font-mono text-sm"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
            />
            <button
              type="submit"
              disabled={busy || !newMemberName.trim()}
              className="font-serif text-[10px] tracking-[0.3em] uppercase border px-3 py-2 shrink-0 disabled:opacity-30 whitespace-nowrap"
              style={{ borderColor: CREAM_FAINT, color: CREAM }}
            >
              <Plus className="w-3 h-3 inline -mt-px mr-1.5" /> Add member
            </button>
          </form>

          {members.length === 0 ? (
            <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
              Add the players in this pod. Display names only — they don't need a Vault account.
            </p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {members.map((m) => {
                const summary = stats.memberSummary.find((s) => s.id === m.id);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 border px-3 py-2" style={{ borderColor: CREAM_FAINT }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-serif font-bold truncate" style={{ color: CREAM }}>
                        {m.display_name}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: CREAM_DIM }}>
                        {summary ? `${summary.wins} win${summary.wins === 1 ? '' : 's'}` : '0 wins'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      style={{ color: CREAM_DIM }}
                      title="Remove member"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Game log form */}
      {members.length >= 2 && (
        <LogGameForm pod={pod} members={members} decks={decks} onLogged={refresh} />
      )}

      {/* Recent games */}
      <section className="border" style={{ borderColor: CREAM_FAINT }}>
        <div className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center justify-between" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
          <span className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5" /> Game log · {pad(games.length)}
          </span>
          {stats.recent30Days > 0 && (
            <span className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>
              {stats.recent30Days} in the last 30 days
            </span>
          )}
        </div>
        <div className="p-4">
          {games.length === 0 ? (
            <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
              No games logged yet. Add members above and log your first game below.
            </p>
          ) : (
            <ul className="space-y-3">
              {games.map(({ game, seats }) => {
                const winner = members.find((m) => m.id === game.winner_member_id);
                return (
                  <li key={game.id} className="border px-3 py-2.5" style={{ borderColor: CREAM_FAINT }}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>
                        {new Date(game.played_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2">
                        {winner && (
                          <span className="font-serif text-xs uppercase tracking-wider" style={{ color: ACCENT }}>
                            <Trophy className="w-3 h-3 inline -mt-px mr-1" />
                            {winner.display_name} won
                          </span>
                        )}
                        <button onClick={() => handleDeleteGame(game.id)} style={{ color: CREAM_DIM }} title="Delete game">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <ul className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1 font-serif text-sm" style={{ color: CREAM }}>
                      {seats.map((s) => {
                        const m = members.find((x) => x.id === s.member_id);
                        return (
                          <li key={s.id} className="flex items-baseline gap-2">
                            <span style={{ color: CREAM_DIM }}>·</span>
                            <span className="font-bold">{m?.display_name || '—'}</span>
                            {s.commander_name && (
                              <span className="italic" style={{ color: CREAM_DIM }}>· {s.commander_name}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {game.notes && (
                      <p className="font-serif text-xs italic mt-1" style={{ color: CREAM_DIM }}>
                        {game.notes}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Inline game-log entry form. Mobile-first: every player is one row
 * with a member picker, commander name, and an optional "from my decks"
 * shortcut that fills the commander from a saved deck.
 */
function LogGameForm({ pod, members, decks, onLogged }) {
  const initialSeats = () =>
    members.slice(0, 4).map((m) => ({
      memberId: m.id,
      commanderName: '',
      deckId: '',
    }));

  const [seats, setSeats] = useState(initialSeats);
  const [winnerId, setWinnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSeats(initialSeats());
    setWinnerId('');
    setError(null);
  }, [pod.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSeat = (idx, patch) =>
    setSeats((s) => s.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  const addSeat = () => setSeats((s) => [...s, { memberId: '', commanderName: '', deckId: '' }]);
  const removeSeat = (idx) => setSeats((s) => s.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError(null);
    const filled = seats.filter((s) => s.memberId);
    if (filled.length < 2) {
      setError('At least two seats with a chosen member are required.');
      return;
    }
    setBusy(true);
    try {
      await logGame({
        podId: pod.id,
        players: filled.map((s) => ({
          memberId: s.memberId,
          deckId: s.deckId || null,
          commanderName: s.commanderName,
        })),
        winnerMemberId: winnerId || null,
        notes,
      });
      setSeats(initialSeats());
      setWinnerId('');
      setNotes('');
      onLogged?.();
    } catch (err) {
      setError(err.message || 'Failed to log game.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border" style={{ borderColor: CREAM_FAINT }}>
      <div className="px-5 py-3 border-b font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ borderColor: CREAM_FAINT, color: CREAM }}>
        Log a new game
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="space-y-2">
          {seats.map((s, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-2 md:items-center">
              <select
                value={s.memberId}
                onChange={(e) => updateSeat(idx, { memberId: e.target.value })}
                disabled={busy}
                className="border px-3 py-2 bg-transparent font-mono text-sm md:w-48"
                style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
              >
                <option value="">— pick member —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
              <select
                value={s.deckId}
                onChange={(e) => {
                  const d = decks.find((x) => x.id === e.target.value);
                  updateSeat(idx, {
                    deckId: e.target.value,
                    commanderName: d?.commander?.name || s.commanderName,
                  });
                }}
                disabled={busy || decks.length === 0}
                title={decks.length === 0 ? 'No decks yet' : 'Optional: tie this seat to one of your saved decks'}
                className="border px-3 py-2 bg-transparent font-mono text-sm md:w-48"
                style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
              >
                <option value="">— my deck (optional) —</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <input
                value={s.commanderName}
                onChange={(e) => updateSeat(idx, { commanderName: e.target.value })}
                placeholder="Commander played"
                disabled={busy}
                maxLength={200}
                className="flex-1 border px-3 py-2 bg-transparent focus:outline-none font-mono text-sm"
                style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
              />
              {seats.length > 2 && (
                <button type="button" onClick={() => removeSeat(idx)} style={{ color: CREAM_DIM }} title="Remove seat">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSeat}
          disabled={busy}
          className="font-serif text-[10px] tracking-[0.3em] uppercase opacity-70 hover:opacity-100"
          style={{ color: CREAM_DIM }}
        >
          <Plus className="w-3 h-3 inline -mt-px mr-1" /> Add seat
        </button>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1 block" style={{ color: CREAM_DIM }}>
              Winner
            </label>
            <select
              value={winnerId}
              onChange={(e) => setWinnerId(e.target.value)}
              disabled={busy}
              className="w-full border px-3 py-2 bg-transparent font-mono text-sm"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
            >
              <option value="">— no winner recorded —</option>
              {seats.filter((s) => s.memberId).map((s) => {
                const m = members.find((mem) => mem.id === s.memberId);
                return m ? <option key={s.memberId} value={s.memberId}>{m.display_name}</option> : null;
              })}
            </select>
          </div>
          <div className="flex-1">
            <label className="font-serif text-[10px] tracking-[0.3em] uppercase mb-1 block" style={{ color: CREAM_DIM }}>
              Notes (optional)
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. won on turn 7 with combo"
              disabled={busy}
              maxLength={2000}
              className="w-full border px-3 py-2 bg-transparent focus:outline-none font-mono text-sm"
              style={{ borderColor: CREAM_FAINT, color: CREAM, background: 'rgba(var(--ink-rgb),0.02)' }}
            />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 border" style={{ borderColor: ACCENT, background: 'rgba(var(--accent-rgb),0.08)', color: CREAM }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
          style={{ borderColor: CREAM_FAINT, color: CREAM }}
        >
          {busy ? 'Logging…' : 'Log game →'}
        </button>
      </form>
    </section>
  );
}
