/* LICITA · Pipeline CRM de oportunidades
 * Gestión por estado de los procesos que el usuario está siguiendo.
 * Persistido por usuario en localStorage.
 */
window.LICITA = window.LICITA || {};

LICITA.pipeline = (function () {
  "use strict";

  const STATES = [
    { id: "interesado",  label: "Interesado",  emoji: "👀", tone: "slate"    },
    { id: "analizando",  label: "Analizando",  emoji: "🔍", tone: "sky"      },
    { id: "ofertando",   label: "Ofertando",   emoji: "✍️", tone: "amber"    },
    { id: "adjudicado",  label: "Adjudicado",  emoji: "🏆", tone: "emerald"  },
    { id: "perdido",     label: "No ganado",   emoji: "📁", tone: "rose"     },
  ];

  function stateById(id) { return STATES.find((s) => s.id === id) || STATES[0]; }
  function keyFor(u) { return u ? "licita.pipeline." + u.username : null; }

  function list(currentUser) {
    if (!currentUser) return [];
    try {
      const raw = localStorage.getItem(keyFor(currentUser));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function persist(currentUser, items) {
    if (!currentUser) return;
    try { localStorage.setItem(keyFor(currentUser), JSON.stringify(items)); } catch (e) {}
  }

  function add(currentUser, proceso) {
    if (!currentUser || !proceso) return null;
    const items = list(currentUser);
    if (items.find((x) => x.id === proceso.id)) return null;
    const item = {
      id: proceso.id,
      addedAt: new Date().toISOString(),
      state: "interesado",
      notes: "",
      proceso,
    };
    items.unshift(item);
    persist(currentUser, items);
    return item;
  }

  function move(currentUser, id, newState) {
    const items = list(currentUser);
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.state = newState;
    it.movedAt = new Date().toISOString();
    persist(currentUser, items);
  }

  function remove(currentUser, id) {
    persist(currentUser, list(currentUser).filter((x) => x.id !== id));
  }

  function updateNotes(currentUser, id, notes) {
    const items = list(currentUser);
    const it = items.find((x) => x.id === id);
    if (!it) return;
    it.notes = notes;
    persist(currentUser, items);
  }

  function summary(currentUser) {
    const items = list(currentUser);
    const counts = {};
    let pipelineValue = 0, wonValue = 0, lostValue = 0;
    STATES.forEach((s) => (counts[s.id] = 0));
    items.forEach((it) => {
      counts[it.state] = (counts[it.state] || 0) + 1;
      const v = Number(it.proceso && it.proceso.valor) || 0;
      if (it.state === "adjudicado") wonValue += v;
      else if (it.state === "perdido") lostValue += v;
      else pipelineValue += v;
    });
    const closed = counts.adjudicado + counts.perdido;
    const winRate = closed > 0 ? Math.round((counts.adjudicado / closed) * 100) : null;
    return { items, counts, pipelineValue, wonValue, lostValue, winRate, total: items.length };
  }

  return { STATES, stateById, list, add, move, remove, updateNotes, summary };
})();
