const STORAGE_KEY = 'flashcards-data-v1';
const DEFAULT_DECK_NAME = 'Default deck';
const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let state = {
  decks: [],
  selectedDeckId: null,
};
let currentIndex = 0;
let showingBack = false;
let serverAvailable = false;

function generateId() {
  return `deck-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidCard(item) {
  return item && typeof item.term === 'string' && typeof item.definition === 'string';
}

function createDeck(name) {
  return {
    id: generateId(),
    name: name.trim() || DEFAULT_DECK_NAME,
    cards: [],
  };
}

function normalizeState(raw) {
  if (Array.isArray(raw)) {
    return {
      decks: [
        {
          id: generateId(),
          name: DEFAULT_DECK_NAME,
          cards: raw
            .filter(isValidCard)
            .map((item) => ({ term: item.term.trim(), definition: item.definition.trim() })),
        },
      ],
      selectedDeckId: null,
    };
  }

  if (raw && Array.isArray(raw.decks)) {
    const decks = raw.decks.map((deck) => ({
      id: deck.id || generateId(),
      name: typeof deck.name === 'string' && deck.name.trim() ? deck.name.trim() : DEFAULT_DECK_NAME,
      cards: Array.isArray(deck.cards)
        ? deck.cards
            .filter(isValidCard)
            .map((item) => ({ term: item.term.trim(), definition: item.definition.trim() }))
        : [],
    }));

    return {
      decks: decks.length ? decks : [createDeck(DEFAULT_DECK_NAME)],
      selectedDeckId: decks.some((deck) => deck.id === raw.selectedDeckId)
        ? raw.selectedDeckId
        : decks[0].id,
    };
  }

  if (raw && Array.isArray(raw.cards)) {
    return {
      decks: [
        {
          id: generateId(),
          name: DEFAULT_DECK_NAME,
          cards: raw
            .filter(isValidCard)
            .map((item) => ({ term: item.term.trim(), definition: item.definition.trim() })),
        },
      ],
      selectedDeckId: null,
    };
  }

  return {
    decks: [createDeck(DEFAULT_DECK_NAME)],
    selectedDeckId: null,
  };
}

async function checkServerAvailability() {
  try {
    const response = await fetch(`${API_URL}/api/health`, { method: 'GET' });
    serverAvailable = response.ok;
  } catch (error) {
    serverAvailable = false;
  }
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? normalizeState(JSON.parse(raw)) : normalizeState(null);
  } catch (error) {
    console.error('Failed to load local state', error);
    state = normalizeState(null);
  }

  if (!state.decks || !state.decks.length) {
    state = normalizeState(null);
  }

  if (!state.selectedDeckId || !state.decks.some((deck) => deck.id === state.selectedDeckId)) {
    state.selectedDeckId = state.decks[0].id;
  }
}

async function loadServerState() {
  if (!serverAvailable) return;
  try {
    const response = await fetch(`${API_URL}/api/decks`);
    if (response.ok) {
      const decks = await response.json();
      state.decks = decks;
      if (!state.selectedDeckId || !state.decks.some((d) => d.id === state.selectedDeckId)) {
        state.selectedDeckId = state.decks[0]?.id || null;
      }
    }
  } catch (error) {
    console.error('Failed to load server state', error);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function saveToServer() {
  if (!serverAvailable) return;
  try {
    for (const deck of state.decks) {
      await fetch(`${API_URL}/api/decks/${deck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deck.name, cards: deck.cards }),
      });
    }
  } catch (error) {
    console.error('Failed to sync to server', error);
  }
}

function saveState() {
  saveLocalState();
  saveToServer();
}

function getCurrentDeck() {
  let deck = state.decks.find((item) => item.id === state.selectedDeckId);
  if (!deck) {
    deck = state.decks[0];
    if (deck) {
      state.selectedDeckId = deck.id;
    }
  }
  return deck;
}

function getCurrentCards() {
  return getCurrentDeck()?.cards || [];
}

function updateDeckOptions() {
  const deckSelect = getById('deckSelect');
  if (!deckSelect) return;
  const currentDeck = getCurrentDeck();
  deckSelect.innerHTML = '';

  state.decks.forEach((deck) => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = deck.name;
    deckSelect.appendChild(option);
  });

  deckSelect.value = currentDeck.id;
  const deleteDeckBtn = getById('deleteDeckBtn');
  if (deleteDeckBtn) {
    deleteDeckBtn.disabled = state.decks.length === 1;
  }
}

function sanitize(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function showElement(element, visible) {
  if (!element) return;
  element.classList.toggle('hidden', !visible);
}

function setText(element, text) {
  if (!element) return;
  element.textContent = text;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getById(id) {
  return document.getElementById(id);
}

async function pageSetup() {
  await checkServerAvailability();
  loadLocalState();
  if (serverAvailable) {
    await loadServerState();
  }
  updateDeckOptions();

  if (document.body.dataset.page === 'entry') {
    setupEntryPage();
  }

  if (document.body.dataset.page === 'review') {
    setupReviewPage();
  }
}

function setupEntryPage() {
  const termInput = getById('termInput');
  const definitionInput = getById('definitionInput');
  const cardForm = getById('cardForm');
  const clearFormBtn = getById('clearFormBtn');
  const cardList = getById('cardList');
  const cardCount = getById('cardCount');
  const exportBtn = getById('exportBtn');
  const importBtn = getById('importBtn');
  const importFileInput = getById('importFileInput');
  const clearAllBtn = getById('clearAllBtn');
  const addDeckBtn = getById('addDeckBtn');
  const deleteDeckBtn = getById('deleteDeckBtn');
  const deckSelect = getById('deckSelect');

  function updateEntryCardCount() {
    if (!cardCount) return;
    const deck = getCurrentDeck();
    const count = deck.cards.length;
    cardCount.textContent = `${count} card${count === 1 ? '' : 's'} saved in "${deck.name}"`;
  }

  function renderCardList() {
    if (!cardList) return;
    const cards = getCurrentCards();
    cardList.innerHTML = '';

    if (!cards.length) {
      cardList.innerHTML = '<p class="empty-state">No cards yet. Add one above.</p>';
      return;
    }

    cards.forEach((card, index) => {
      const item = document.createElement('article');
      item.className = 'flashcard';
      item.innerHTML = `
        <h3>${sanitize(card.term)}</h3>
        <p>${sanitize(card.definition)}</p>
        <small>Card ${index + 1}</small>
      `;
      cardList.appendChild(item);
    });
  }

  if (cardForm) {
    cardForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const term = termInput.value.trim();
      const definition = definitionInput.value.trim();
      if (!term || !definition) return;

      const deck = getCurrentDeck();
      deck.cards.unshift({ term, definition });
      saveState();
      renderCardList();
      updateEntryCardCount();
      cardForm.reset();
      termInput.focus();
    });
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => {
      if (!cardForm) return;
      cardForm.reset();
      termInput.focus();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const deck = getCurrentDeck();
      if (!deck.cards.length) {
        alert(`No cards to export for "${deck.name}".`);
        return;
      }
      const blob = new Blob([JSON.stringify({ decks: [deck], selectedDeckId: deck.id }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${deck.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'deck'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  if (importBtn && importFileInput) {
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) {
        importCardsFromFile(file, () => {
          updateDeckOptions();
          renderCardList();
          updateEntryCardCount();
        });
      }
      importFileInput.value = '';
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const deck = getCurrentDeck();
      if (!deck.cards.length) return;
      if (!confirm(`Clear all cards from "${deck.name}"?`)) return;
      deck.cards = [];
      saveState();
      renderCardList();
      updateEntryCardCount();
    });
  }

  if (deckSelect) {
    deckSelect.addEventListener('change', () => {
      state.selectedDeckId = deckSelect.value;
      currentIndex = 0;
      saveState();
      updateEntryCardCount();
      renderCardList();
    });
  }

  if (addDeckBtn) {
    addDeckBtn.addEventListener('click', () => {
      const name = prompt('Deck name', `Deck ${state.decks.length + 1}`);
      if (!name) return;
      const deck = createDeck(name);
      state.decks.push(deck);
      state.selectedDeckId = deck.id;
      currentIndex = 0;
      saveState();
      updateDeckOptions();
      updateEntryCardCount();
      renderCardList();
    });
  }

  if (deleteDeckBtn) {
    deleteDeckBtn.addEventListener('click', () => {
      if (state.decks.length === 1) return;
      const deck = getCurrentDeck();
      if (!confirm(`Delete deck "${deck.name}" and all ${deck.cards.length} cards?`)) return;
      state.decks = state.decks.filter((item) => item.id !== deck.id);
      state.selectedDeckId = state.decks[0].id;
      currentIndex = 0;
      saveState();
      updateDeckOptions();
      updateEntryCardCount();
      renderCardList();
    });
  }

  updateEntryCardCount();
  renderCardList();
}

function setupReviewPage() {
  const reviewTerm = getById('reviewTerm');
  const reviewDefinition = getById('reviewDefinition');
  const reviewCard = getById('reviewCard');
  const flipBtn = getById('flipBtn');
  const nextBtn = getById('nextBtn');
  const prevBtn = getById('prevBtn');
  const shuffleBtn = getById('shuffleBtn');
  const reviewInfo = getById('reviewInfo');
  const reviewDeckTitle = getById('reviewDeckTitle');
  const modeSelect = getById('modeSelect');
  const answerInput = getById('answerInput');
  const checkAnswerBtn = getById('checkAnswerBtn');
  const answerResult = getById('answerResult');
  const blastStartBtn = getById('blastStartBtn');
  const learnKnowBtn = getById('learnKnowBtn');
  const learnAgainBtn = getById('learnAgainBtn');
  const matchTerms = getById('matchTerms');
  const matchDefinitions = getById('matchDefinitions');
  const matchStatus = getById('matchStatus');
  const blocksBoard = getById('blocksBoard');
  const blocksSubmitBtn = getById('blocksSubmitBtn');
  const blocksClearBtn = getById('blocksClearBtn');
  const blocksResult = getById('blocksResult');
  const deckSelect = getById('deckSelect');

  const modeSettings = {
    flashcards: {
      label: 'Flashcards',
      instruction: 'Tap the card or press Flip to reveal the answer.',
    },
    test: {
      label: 'Test',
      instruction: 'Type the definition and press Check answer.',
    },
    blast: {
      label: 'Blast',
      instruction: 'Run through cards quickly with an automatic flip timer.',
    },
    learn: {
      label: 'Learn',
      instruction: 'Mark cards as known or repeat them until you learn them.',
    },
    match: {
      label: 'Match',
      instruction: 'Match the term to the correct definition.',
    },
    blocks: {
      label: 'Blocks',
      instruction: 'Build the answer from blocks of words or letters.',
    },
  };

  let currentMode = 'flashcards';
  let blastInterval = null;
  let blastFlipTimeout = null;
  let learnQueue = [];
  let matchState = null;
  let blocksState = null;

  function normalizeText(value) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getCurrentCard() {
    const cards = getCurrentCards();
    return cards[currentIndex] || null;
  }

  function renderCurrentCard() {
    const card = getCurrentCard();
    if (!card) {
      setText(reviewTerm, 'No cards available');
      setText(reviewDefinition, 'Add cards first on the Add Cards page.');
      return;
    }

    setText(reviewTerm, card.term);
    setText(reviewDefinition, card.definition);
    if (reviewDefinition) {
      reviewDefinition.classList.toggle('hidden', !showingBack);
    }
  }

  function renderModeView() {
    if (!reviewDeckTitle || !reviewInfo) return;

    const deck = getCurrentDeck();
    const cards = getCurrentCards();
    const modeConfig = modeSettings[currentMode];

    setText(reviewDeckTitle, `${modeConfig.label} — ${deck.name}`);
    setText(reviewInfo, `${modeConfig.instruction} (${cards.length} card${cards.length === 1 ? '' : 's'})`);

    showElement(reviewCard, currentMode !== 'match' && currentMode !== 'blocks');
    showElement(flipBtn, currentMode === 'flashcards');
    showElement(shuffleBtn, currentMode === 'flashcards' || currentMode === 'learn');
    showElement(getById('testPanel'), currentMode === 'test');
    showElement(getById('blastPanel'), currentMode === 'blast');
    showElement(getById('learnPanel'), currentMode === 'learn');
    showElement(getById('matchPanel'), currentMode === 'match');
    showElement(getById('blocksPanel'), currentMode === 'blocks');

    setText(answerResult, '');
    if (answerInput) answerInput.value = '';

    if (currentMode === 'match') {
      initializeMatchMode();
    }

    if (currentMode === 'blocks') {
      initializeBlocksMode();
    }

    if (currentMode === 'learn') {
      initializeLearnMode();
    }

    renderCurrentCard();
  }

  function changeCard(delta) {
    const cards = getCurrentCards();
    if (!cards.length) return;
    currentIndex = (currentIndex + delta + cards.length) % cards.length;
    showingBack = false;
    renderCurrentCard();
  }

  function startBlast() {
    if (blastInterval) {
      stopBlast();
      return;
    }

    if (getCurrentCards().length === 0) {
      alert('Add cards before using Blast mode.');
      return;
    }

    setText(getById('blastTip'), 'Blast is running. Sit back and review quickly.');
    blastStartBtn.textContent = 'Stop Blast';

    blastInterval = setInterval(() => {
      showingBack = false;
      renderCurrentCard();
      blastFlipTimeout = setTimeout(() => {
        showingBack = true;
        renderCurrentCard();
      }, 1200);
      setTimeout(() => changeCard(1), 2500);
    }, 3000);
  }

  function stopBlast() {
    if (blastInterval) {
      clearInterval(blastInterval);
      blastInterval = null;
    }
    if (blastFlipTimeout) {
      clearTimeout(blastFlipTimeout);
      blastFlipTimeout = null;
    }
    setText(getById('blastTip'), 'Timed auto-review with quick flips.');
    blastStartBtn.textContent = 'Start Blast';
  }

  function initializeLearnMode() {
    const cards = getCurrentCards();
    if (!learnQueue.length) {
      learnQueue = cards.map((_, index) => index);
      currentIndex = learnQueue[0] || 0;
    }
    showElement(getById('learnTip'), true);
  }

  function markKnown() {
    if (!learnQueue.length) return;
    learnQueue.shift();
    if (learnQueue.length === 0) {
      setText(getById('learnTip'), 'All cards reviewed — great job!');
      return;
    }
    currentIndex = learnQueue[0];
    showingBack = false;
    renderCurrentCard();
  }

  function reviewAgain() {
    if (!learnQueue.length) return;
    learnQueue.push(learnQueue.shift());
    currentIndex = learnQueue[0];
    showingBack = false;
    renderCurrentCard();
  }

  function initializeMatchMode() {
    const cards = getCurrentCards();
    const pairs = cards.map((card, index) => ({ index, term: card.term, definition: card.definition }));
    const termOrder = shuffle(pairs);
    const definitionOrder = shuffle(pairs);
    matchState = {
      pairs,
      termOrder,
      definitionOrder,
      selectedTerm: null,
      selectedDefinition: null,
      matches: [],
    };
    renderMatchBoard();
  }

  function renderMatchBoard() {
    if (!matchTerms || !matchDefinitions || !matchStatus) return;
    matchTerms.innerHTML = '';
    matchDefinitions.innerHTML = '';

    matchState.termOrder.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'match-item';
      button.textContent = item.term;
      button.dataset.index = String(item.index);
      button.disabled = matchState.matches.includes(item.index);
      button.addEventListener('click', () => selectMatchTerm(item.index, button));
      matchTerms.appendChild(button);
    });

    matchState.definitionOrder.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'match-item';
      button.textContent = item.definition;
      button.dataset.index = String(item.index);
      button.disabled = matchState.matches.includes(item.index);
      button.addEventListener('click', () => selectMatchDefinition(item.index, button));
      matchDefinitions.appendChild(button);
    });

    updateMatchStatus();
  }

  function selectMatchTerm(index, button) {
    if (matchState.matches.includes(index)) return;
    matchState.selectedTerm = index;
    highlightSelected(matchTerms, index);
    if (matchState.selectedDefinition !== null) {
      checkMatchPair();
    }
  }

  function selectMatchDefinition(index, button) {
    if (matchState.matches.includes(index)) return;
    matchState.selectedDefinition = index;
    highlightSelected(matchDefinitions, index);
    if (matchState.selectedTerm !== null) {
      checkMatchPair();
    }
  }

  function highlightSelected(container, selectedIndex) {
    Array.from(container.children).forEach((item) => {
      item.classList.toggle('selected', item.dataset.index === String(selectedIndex));
    });
  }

  function checkMatchPair() {
    if (matchState.selectedTerm === null || matchState.selectedDefinition === null) return;
    if (matchState.selectedTerm === matchState.selectedDefinition) {
      matchState.matches.push(matchState.selectedTerm);
      setText(matchStatus, 'Correct match! Keep going.');
    } else {
      setText(matchStatus, 'Not a match. Try again.');
    }
    matchState.selectedTerm = null;
    matchState.selectedDefinition = null;
    renderMatchBoard();
  }

  function updateMatchStatus() {
    if (!matchStatus) return;
    const remaining = getCurrentCards().length - matchState.matches.length;
    setText(matchStatus, `${remaining} card${remaining === 1 ? '' : 's'} left.`);
  }

  function initializeBlocksMode() {
    const card = getCurrentCard();
    const text = card ? card.definition : '';
    const fragments = text.split(/\s+/).filter(Boolean);
    blocksState = {
      answer: text.trim(),
      fragments: shuffle(fragments),
      selection: [],
    };
    renderBlocksBoard();
    setText(blocksResult, '');
  }

  function renderBlocksBoard() {
    if (!blocksBoard) return;
    blocksBoard.innerHTML = '';
    const current = blocksState.selection.join(' ');
    const selectionNode = document.createElement('div');
    selectionNode.className = 'blocks-selection';
    selectionNode.textContent = current || 'Build the answer here.';
    blocksBoard.appendChild(selectionNode);

    const grid = document.createElement('div');
    grid.className = 'blocks-fragments';
    blocksState.fragments.forEach((fragment, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-fragment';
      button.textContent = fragment;
      button.disabled = blocksState.selection.includes(fragment) && blocksState.fragments.filter((x) => x === fragment).length <= blocksState.selection.filter((x) => x === fragment).length;
      button.addEventListener('click', () => {
        blocksState.selection.push(fragment);
        renderBlocksBoard();
      });
      grid.appendChild(button);
    });
    blocksBoard.appendChild(grid);
  }

  function submitBlocksAnswer() {
    const guess = normalizeText(blocksState.selection.join(' '));
    if (guess === normalizeText(blocksState.answer)) {
      setText(blocksResult, 'Correct! Great work.');
    } else {
      setText(blocksResult, 'Not quite. Try rearranging the blocks.');
    }
  }

  function clearBlocksSelection() {
    blocksState.selection = [];
    renderBlocksBoard();
    setText(blocksResult, '');
  }

  function setReviewMode(mode) {
    currentMode = mode;
    showingBack = false;
    stopBlast();
    if (mode === 'learn') {
      learnQueue = [];
      initializeLearnMode();
    }
    renderModeView();
  }

  if (deckSelect) {
    deckSelect.addEventListener('change', () => {
      state.selectedDeckId = deckSelect.value;
      currentIndex = 0;
      saveState();
      renderModeView();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      setReviewMode(modeSelect.value);
    });
  }

  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      showingBack = !showingBack;
      renderCurrentCard();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      changeCard(1);
      if (currentMode === 'learn') {
        initializeLearnMode();
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      changeCard(-1);
      if (currentMode === 'learn') {
        initializeLearnMode();
      }
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      if (currentMode === 'learn') {
        learnQueue = shuffle(learnQueue);
      } else {
        const cards = getCurrentCards();
        if (!cards.length) return;
        state.decks = state.decks.map((deck) =>
          deck.id === state.selectedDeckId
            ? { ...deck, cards: shuffle(deck.cards) }
            : deck
        );
        saveState();
      }
      renderModeView();
    });
  }

  if (checkAnswerBtn) {
    checkAnswerBtn.addEventListener('click', () => {
      const card = getCurrentCard();
      if (!card || !answerInput) return;
      const guess = normalizeText(answerInput.value);
      const expected = normalizeText(card.definition);
      if (guess === expected) {
        setText(answerResult, 'Correct!');
      } else {
        setText(answerResult, `Not quite. The answer is: ${card.definition}`);
      }
    });
  }

  if (blastStartBtn) {
    blastStartBtn.addEventListener('click', () => {
      if (blastInterval) {
        stopBlast();
      } else {
        startBlast();
      }
    });
  }

  if (learnKnowBtn) {
    learnKnowBtn.addEventListener('click', markKnown);
  }

  if (learnAgainBtn) {
    learnAgainBtn.addEventListener('click', reviewAgain);
  }

  if (blocksSubmitBtn) {
    blocksSubmitBtn.addEventListener('click', submitBlocksAnswer);
  }

  if (blocksClearBtn) {
    blocksClearBtn.addEventListener('click', clearBlocksSelection);
  }

  const cards = getCurrentCards();
  if (!cards.length) {
    setText(reviewTerm, 'No cards available');
    setText(reviewDefinition, 'Add cards first on the Add Cards page.');
  }

  setReviewMode('flashcards');
}

function importCardsFromFile(file, callback) {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      let importedDecks = [];
      let importedCards = [];

      if (Array.isArray(imported)) {
        importedCards = imported.filter(isValidCard).map((item) => ({ term: item.term.trim(), definition: item.definition.trim() }));
      } else if (imported && Array.isArray(imported.decks)) {
        importedDecks = imported.decks.map((deck) => ({
          id: generateId(),
          name: typeof deck.name === 'string' && deck.name.trim() ? deck.name.trim() : DEFAULT_DECK_NAME,
          cards: Array.isArray(deck.cards)
            ? deck.cards.filter(isValidCard).map((item) => ({ term: item.term.trim(), definition: item.definition.trim() }))
            : [],
        }));
      } else if (imported && Array.isArray(imported.cards)) {
        importedCards = imported.cards.filter(isValidCard).map((item) => ({ term: item.term.trim(), definition: item.definition.trim() }));
      } else {
        throw new Error('Invalid file format');
      }

      if (importedDecks.length) {
        state.decks = [...state.decks, ...importedDecks];
        saveState();
        if (callback) callback();
        alert(`Imported ${importedDecks.length} deck${importedDecks.length === 1 ? '' : 's'}.`);
        return;
      }

      if (!importedCards.length) {
        alert('No valid cards were found in the file.');
        return;
      }

      const currentDeck = getCurrentDeck();
      currentDeck.cards = [...importedCards, ...currentDeck.cards];
      saveState();
      if (callback) callback();
      alert(`${importedCards.length} cards imported into "${currentDeck.name}".`);
    } catch (error) {
      alert('Could not import cards from that file.');
      console.error(error);
    }
  };

  reader.readAsText(file);
}

pageSetup();
