const STORAGE_KEY = 'flashcards-data-v1';
const DEFAULT_DECK_NAME = 'Default deck';

// Replace these with your credentials from https://www.back4app.com (Dashboard → App Settings → Security & Keys)
const PARSE_APP_ID = 'Kvds5AgivKf3ddglbGdKasIosJQXdv0jqGX6EPaV';
const PARSE_JS_KEY = 'kEF8693hhSC0F9M8H0dpUhWpOVYDrJoPuCVadDcw';


const PARSE_SERVER_URL = 'https://parseapi.back4app.com';

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
    parseId: null,
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
          parseId: null,
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
      parseId: deck.parseId || null,
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
          parseId: null,
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
  if (typeof Parse === 'undefined') { serverAvailable = false; return; }
  try {
    Parse.initialize(PARSE_APP_ID, PARSE_JS_KEY);
    Parse.serverURL = PARSE_SERVER_URL;
    serverAvailable = true;
  } catch (error) {
    console.warn('Back4App init failed:', error.message);
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
  if (!serverAvailable || !Parse.User.current()) return;
  try {
    const query = new Parse.Query('Deck');
    query.limit(1000);
    const results = await query.find();
    const decks = results.map((obj) => ({
      id: obj.id,
      parseId: obj.id,
      name: obj.get('name') || DEFAULT_DECK_NAME,
      cards: obj.get('cards') || [],
    }));
    state.decks = decks.length ? decks : [];
    state.selectedDeckId = state.decks[0]?.id || null;
  } catch (error) {
    console.error('Failed to load from Parse', error);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function saveToServer() {
  if (!serverAvailable || !Parse.User.current()) return;
  try {
    for (const deck of state.decks) {
      if (!deck.parseId && !deck.cards.length) continue; // don't upload empty new decks
      const ParseDeck = Parse.Object.extend('Deck');
      const parseObj = new ParseDeck();
      if (deck.parseId) {
        parseObj.id = deck.parseId;
      } else {
        parseObj.setACL(new Parse.ACL(Parse.User.current()));
      }
      parseObj.set('name', deck.name);
      parseObj.set('cards', deck.cards);
      const saved = await parseObj.save();
      if (!deck.parseId) {
        deck.id = saved.id;
        deck.parseId = saved.id;
        saveLocalState();
      }
    }
  } catch (error) {
    console.error('Failed to sync to Parse', error);
  }
}

async function deleteFromParse(parseId) {
  if (!serverAvailable || !Parse.User.current() || !parseId) return;
  try {
    const ParseDeck = Parse.Object.extend('Deck');
    const parseObj = new ParseDeck();
    parseObj.id = parseId;
    await parseObj.destroy();
  } catch (error) {
    console.error('Failed to delete from Parse', error);
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
  deckSelect.innerHTML = '';

  state.decks.forEach((deck) => {
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = deck.name;
    deckSelect.appendChild(option);
  });

  const currentDeck = getCurrentDeck();
  if (currentDeck) deckSelect.value = currentDeck.id;

  const deleteDeckBtn = getById('deleteDeckBtn');
  if (deleteDeckBtn) {
    deleteDeckBtn.disabled = state.decks.length <= 1;
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

async function afterLogin() {
  await saveToServer();
  await loadServerState();
  updateDeckOptions();
  updateUserUI();
  if (document.body.dataset.page === 'entry') setupEntryPage();
  else if (document.body.dataset.page === 'review') setupReviewPage();
}

async function signIn() {
  const username = getById('loginUsername')?.value.trim();
  const password = getById('loginPassword')?.value;
  const errorEl = getById('loginError');
  if (!username || !password) return;
  showElement(errorEl, false);
  const btn = getById('loginSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    await Parse.User.logIn(username, password);
    await afterLogin();
  } catch (err) {
    if (errorEl) { setText(errorEl, err.message || 'Sign in failed.'); showElement(errorEl, true); }
  } finally {
    if (btn) btn.disabled = false;
  }
}


async function logOut() {
  try {
    await Parse.User.logOut();
  } catch (e) { console.warn('Parse logout error', e); }
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function updateUserUI() {
  const userInfo = getById('userInfo');
  const userName = getById('userName');
  const loginScreen = getById('loginScreen');
  const mainContent = document.querySelector('main');
  const user = typeof Parse !== 'undefined' ? Parse.User.current() : null;

  if (user) {
    showElement(userInfo, true);
    if (userName) setText(userName, user.get('username') || 'Signed in');
    showElement(loginScreen, false);
    showElement(mainContent, true);
  } else {
    showElement(userInfo, false);
    showElement(loginScreen, true);
    showElement(mainContent, false);
  }
}

async function pageSetup() {
  await checkServerAvailability();
  if (Parse.User.current()) {
    await loadServerState();
    updateDeckOptions();
  }
  updateUserUI();

  const logoutBtn = getById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logOut);

  // Login form
  const loginSubmitBtn = getById('loginSubmitBtn');
  const loginPassword = getById('loginPassword');
  if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', signIn);
  if (loginPassword) loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });


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
  const newDeckRow = getById('newDeckRow');
  const newDeckName = getById('newDeckName');
  const confirmNewDeckBtn = getById('confirmNewDeckBtn');
  const cancelNewDeckBtn = getById('cancelNewDeckBtn');
  const renameDeckBtn = getById('renameDeckBtn');

  let newDeckMode = 'add'; // 'add' | 'rename'
  const submitBtn = cardForm?.querySelector('button[type="submit"]');

  let editingIndex = null;

  function setEditMode(index) {
    const card = getCurrentCards()[index];
    if (!card) return;
    editingIndex = index;
    termInput.value = card.term;
    definitionInput.value = card.definition;
    if (submitBtn) submitBtn.textContent = 'Update card';
    getById('cardFormPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    termInput.focus();
  }

  function clearEditMode() {
    editingIndex = null;
    if (cardForm) cardForm.reset();
    if (submitBtn) submitBtn.textContent = 'Save card';
  }

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
      item.className = `flashcard${editingIndex === index ? ' flashcard--editing' : ''}`;
      item.innerHTML = `
        <div class="flashcard-body">
          <h3>${sanitize(card.term)}</h3>
          <p>${sanitize(card.definition)}</p>
        </div>
        <div class="flashcard-actions">
          <button type="button" class="secondary edit-card-btn">Edit</button>
          <button type="button" class="danger delete-card-btn">Delete</button>
        </div>
      `;
      item.querySelector('.edit-card-btn').addEventListener('click', () => setEditMode(index));
      item.querySelector('.delete-card-btn').addEventListener('click', () => {
        if (!confirm(`Delete "${card.term}"?`)) return;
        const deck = getCurrentDeck();
        deck.cards.splice(index, 1);
        if (editingIndex === index) clearEditMode();
        else if (editingIndex !== null && editingIndex > index) editingIndex--;
        saveState();
        renderCardList();
        updateEntryCardCount();
      });
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
      if (editingIndex !== null) {
        deck.cards[editingIndex] = { term, definition };
        clearEditMode();
      } else {
        deck.cards.unshift({ term, definition });
        cardForm.reset();
        termInput.focus();
      }
      saveState();
      renderCardList();
      updateEntryCardCount();
    });
  }

  if (clearFormBtn) {
    clearFormBtn.addEventListener('click', () => {
      clearEditMode();
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

  function openNewDeckRow(mode = 'add') {
    newDeckMode = mode;
    if (confirmNewDeckBtn) confirmNewDeckBtn.textContent = mode === 'rename' ? 'Rename' : 'Add';
    if (newDeckName) {
      newDeckName.placeholder = mode === 'rename' ? 'New deck name' : 'Deck name';
      newDeckName.value = mode === 'rename' ? (getCurrentDeck()?.name || '') : '';
      newDeckName.select();
    }
    showElement(newDeckRow, true);
    newDeckName?.focus();
  }

  function closeNewDeckRow() {
    showElement(newDeckRow, false);
    if (newDeckName) newDeckName.value = '';
    if (confirmNewDeckBtn) confirmNewDeckBtn.textContent = 'Add';
  }

  function commitNewDeck() {
    const name = newDeckName?.value.trim();
    if (!name) { newDeckName?.focus(); return; }
    if (newDeckMode === 'rename') {
      const deck = getCurrentDeck();
      if (deck) {
        deck.name = name;
        saveState();
        updateDeckOptions();
        updateEntryCardCount();
      }
    } else {
      const deck = createDeck(name);
      state.decks.push(deck);
      state.selectedDeckId = deck.id;
      currentIndex = 0;
      saveState();
      updateDeckOptions();
      updateEntryCardCount();
      renderCardList();
    }
    closeNewDeckRow();
  }

  if (addDeckBtn) addDeckBtn.addEventListener('click', () => openNewDeckRow('add'));
  if (renameDeckBtn) renameDeckBtn.addEventListener('click', () => openNewDeckRow('rename'));
  if (confirmNewDeckBtn) confirmNewDeckBtn.addEventListener('click', commitNewDeck);
  if (cancelNewDeckBtn) cancelNewDeckBtn.addEventListener('click', closeNewDeckRow);
  if (newDeckName) {
    newDeckName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitNewDeck(); }
      if (e.key === 'Escape') closeNewDeckRow();
    });
  }

  if (deleteDeckBtn) {
    deleteDeckBtn.addEventListener('click', () => {
      if (state.decks.length === 1) return;
      const deck = getCurrentDeck();
      if (!confirm(`Delete deck "${deck.name}" and all ${deck.cards.length} cards?`)) return;
      const { parseId } = deck;
      state.decks = state.decks.filter((item) => item.id !== deck.id);
      state.selectedDeckId = state.decks[0].id;
      currentIndex = 0;
      saveState();
      deleteFromParse(parseId);
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
  const matchTerms = getById('matchTerms');
  const matchDefinitions = getById('matchDefinitions');
  const matchStatus = getById('matchStatus');
  const blocksBoard = getById('blocksBoard');
  const blocksSubmitBtn = getById('blocksSubmitBtn');
  const blocksClearBtn = getById('blocksClearBtn');
  const blocksResult = getById('blocksResult');
  const deckSelect = getById('deckSelect');

  const modeSettings = {
    flashcards: { label: 'Flashcards', instruction: 'Tap the card or press Flip to reveal the answer.' },
    learn:      { label: 'Learn',      instruction: 'Answer questions adaptively to master every card.' },
    write:      { label: 'Write',      instruction: 'Type the definition from memory.' },
    test:       { label: 'Test',       instruction: 'Answer a mix of question types, then submit for your score.' },
    match:      { label: 'Match',      instruction: 'Match each term to its definition as fast as you can.' },
    gravity:    { label: 'Gravity',    instruction: 'Type the definition before the term hits the ground.' },
    blast:      { label: 'Blast',      instruction: 'Run through cards quickly with an automatic flip timer.' },
    blocks:     { label: 'Blocks',     instruction: 'Build the answer from blocks of words or letters.' },
  };

  let currentMode = 'flashcards';
  let blastInterval = null;
  let blastFlipTimeout = null;
  let matchState = null;
  let matchTimerInterval = null;
  let matchTimerStart = null;
  let learnState = null;
  let testQuestions = [];
  let testAnswers = {};
  let blocksState = null;
  let gravityState = null;
  let gravityFallTimeout = null;

  function normalizeText(value) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getCurrentCard() {
    return getCurrentCards()[currentIndex] || null;
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
    if (reviewDefinition) reviewDefinition.classList.toggle('hidden', !showingBack);
  }

  function renderModeView() {
    if (!reviewDeckTitle || !reviewInfo) return;
    const deck = getCurrentDeck();
    const cards = getCurrentCards();
    const cfg = modeSettings[currentMode];

    setText(reviewDeckTitle, `${cfg.label} — ${deck.name}`);
    setText(reviewInfo, `${cfg.instruction} (${cards.length} card${cards.length === 1 ? '' : 's'})`);

    const showCard = currentMode === 'flashcards' || currentMode === 'write' || currentMode === 'blast';
    showElement(reviewCard, showCard);
    showElement(flipBtn, currentMode === 'flashcards');
    showElement(shuffleBtn, currentMode === 'flashcards');
    showElement(prevBtn, showCard);
    showElement(nextBtn, showCard);

    showElement(getById('writePanel'),     currentMode === 'write');
    showElement(getById('blastPanel'),     currentMode === 'blast');
    showElement(getById('learnPanel'),     currentMode === 'learn');
    showElement(getById('testModePanel'),  currentMode === 'test');
    showElement(getById('matchPanel'),     currentMode === 'match');
    showElement(getById('gravityPanel'),   currentMode === 'gravity');
    showElement(getById('blocksPanel'),    currentMode === 'blocks');

    if (answerResult) setText(answerResult, '');
    if (answerInput) answerInput.value = '';

    if (currentMode === 'match')   initializeMatchMode();
    if (currentMode === 'blocks')  initializeBlocksMode();
    if (currentMode === 'learn')   initializeLearnMode();
    if (currentMode === 'test')    initializeTestMode();
    if (currentMode === 'gravity') resetGravity();
    if (showCard) renderCurrentCard();
  }

  function changeCard(delta) {
    const cards = getCurrentCards();
    if (!cards.length) return;
    currentIndex = (currentIndex + delta + cards.length) % cards.length;
    showingBack = false;
    renderCurrentCard();
  }

  // ── Blast ─────────────────────────────────────────────────────────────────

  function startBlast() {
    if (blastInterval) { stopBlast(); return; }
    if (!getCurrentCards().length) { alert('Add cards before using Blast mode.'); return; }
    setText(getById('blastTip'), 'Blast is running. Sit back and review quickly.');
    if (blastStartBtn) blastStartBtn.textContent = 'Stop Blast';
    blastInterval = setInterval(() => {
      showingBack = false;
      renderCurrentCard();
      blastFlipTimeout = setTimeout(() => { showingBack = true; renderCurrentCard(); }, 1200);
      setTimeout(() => changeCard(1), 2500);
    }, 3000);
  }

  function stopBlast() {
    if (blastInterval) { clearInterval(blastInterval); blastInterval = null; }
    if (blastFlipTimeout) { clearTimeout(blastFlipTimeout); blastFlipTimeout = null; }
    setText(getById('blastTip'), 'Timed auto-review with quick flips.');
    if (blastStartBtn) blastStartBtn.textContent = 'Start Blast';
  }

  // ── Learn (adaptive MC → written) ─────────────────────────────────────────

  function initializeLearnMode() {
    const cards = getCurrentCards();
    learnState = {
      mcQueue: shuffle(cards.map((_, i) => i)),
      writtenQueue: [],
      doneSet: new Set(),
      total: cards.length,
    };
    showElement(getById('learnMCSection'), true);
    showElement(getById('learnWrittenSection'), false);
    advanceLearning();
  }

  function updateLearnProgress() {
    const done = learnState.doneSet.size;
    const fill = getById('learnProgressFill');
    const text = getById('learnProgressText');
    if (fill) fill.style.width = `${learnState.total ? (done / learnState.total) * 100 : 0}%`;
    if (text) setText(text, `${done} of ${learnState.total} learned`);
  }

  function advanceLearning() {
    updateLearnProgress();
    if (!learnState.mcQueue.length && !learnState.writtenQueue.length) {
      showElement(getById('learnMCSection'), false);
      showElement(getById('learnWrittenSection'), false);
      const fb = getById('learnMCFeedback');
      if (fb) { fb.textContent = 'All cards learned — great work!'; fb.classList.remove('hidden'); }
      return;
    }
    if (learnState.mcQueue.length) {
      showElement(getById('learnMCSection'), true);
      showElement(getById('learnWrittenSection'), false);
      const fb = getById('learnMCFeedback');
      if (fb) fb.classList.add('hidden');
      renderLearnMCCard();
    } else {
      showElement(getById('learnMCSection'), false);
      showElement(getById('learnWrittenSection'), true);
      const fb = getById('learnWrittenFeedback');
      if (fb) fb.classList.add('hidden');
      renderLearnWrittenCard();
    }
  }

  function renderLearnMCCard() {
    const cards = getCurrentCards();
    const idx = learnState.mcQueue[0];
    const card = cards[idx];
    if (!card) return;
    setText(getById('learnMCPrompt'), card.term);
    const others = cards.filter((_, i) => i !== idx);
    const options = shuffle([card.definition, ...shuffle(others).slice(0, 3).map((c) => c.definition)]);
    const container = getById('learnMCOptions');
    if (!container) return;
    container.innerHTML = '';
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mc-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleLearnMCAnswer(opt, card.definition, btn, container));
      container.appendChild(btn);
    });
  }

  function handleLearnMCAnswer(selected, correct, clickedBtn, container) {
    Array.from(container.children).forEach((b) => {
      b.disabled = true;
      if (b.textContent === correct) b.classList.add('correct');
    });
    const fb = getById('learnMCFeedback');
    if (selected === correct) {
      clickedBtn.classList.add('correct');
      learnState.writtenQueue.push(learnState.mcQueue.shift());
      if (fb) { fb.textContent = 'Correct!'; fb.classList.remove('hidden'); }
      setTimeout(advanceLearning, 700);
    } else {
      clickedBtn.classList.add('incorrect');
      if (fb) { fb.textContent = `Not quite — "${correct}" is the definition.`; fb.classList.remove('hidden'); }
      learnState.mcQueue.push(learnState.mcQueue.shift());
      setTimeout(advanceLearning, 1600);
    }
  }

  function renderLearnWrittenCard() {
    const card = getCurrentCards()[learnState.writtenQueue[0]];
    if (!card) return;
    setText(getById('learnWrittenPrompt'), card.term);
    const input = getById('learnWrittenInput');
    if (input) { input.value = ''; input.focus(); }
    const fb = getById('learnWrittenFeedback');
    if (fb) fb.classList.add('hidden');
  }

  function checkLearnWritten() {
    const idx = learnState.writtenQueue[0];
    if (idx === undefined) return;
    const card = getCurrentCards()[idx];
    const input = getById('learnWrittenInput');
    const fb = getById('learnWrittenFeedback');
    if (normalizeText(input?.value || '') === normalizeText(card.definition)) {
      learnState.doneSet.add(learnState.writtenQueue.shift());
      if (fb) { fb.textContent = 'Correct!'; fb.classList.remove('hidden'); }
      setTimeout(advanceLearning, 600);
    } else {
      if (fb) { fb.textContent = `Not quite — the answer is: ${card.definition}`; fb.classList.remove('hidden'); }
      learnState.mcQueue.push(learnState.writtenQueue.shift());
      setTimeout(advanceLearning, 1600);
    }
  }

  // ── Test (mixed question types) ───────────────────────────────────────────

  function initializeTestMode() {
    testQuestions = buildTestQuestions(getCurrentCards());
    testAnswers = {};
    showElement(getById('testQuestionsWrapper'), true);
    showElement(getById('testResults'), false);
    renderTestQuestions();
  }

  function buildTestQuestions(cards) {
    if (!cards.length) return [];
    const pool = shuffle(cards.map((c, i) => ({ ...c, i })));
    const n = Math.min(20, pool.length);
    return pool.slice(0, n).map((card) => {
      const others = pool.filter((c) => c.i !== card.i);
      const r = Math.random();
      if (others.length < 3 || r > 0.65) {
        return { type: 'written', term: card.term, answer: card.definition };
      }
      if (r > 0.35) {
        const opts = shuffle([card.definition, ...shuffle(others).slice(0, 3).map((c) => c.definition)]);
        return { type: 'mc', term: card.term, answer: card.definition, options: opts };
      }
      const useCorrect = Math.random() > 0.5;
      const shownDef = useCorrect ? card.definition : (shuffle(others)[0]?.definition || card.definition);
      return { type: 'tf', term: card.term, answer: card.definition, shownDef, isTrue: shownDef === card.definition };
    });
  }

  function renderTestQuestions() {
    const container = getById('testQuestions');
    if (!container) return;
    container.innerHTML = '';
    testQuestions.forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'test-question';
      if (q.type === 'written') {
        div.innerHTML = `<p class="test-question-type">Written</p>
          <p class="test-question-prompt">${sanitize(q.term)}</p>
          <input type="text" class="test-written-input" data-qi="${i}" placeholder="Type the definition" autocomplete="off" />`;
      } else if (q.type === 'mc') {
        const optsHtml = q.options.map((opt) =>
          `<button type="button" class="test-mc-option" data-qi="${i}" data-val="${sanitize(opt)}">${sanitize(opt)}</button>`
        ).join('');
        div.innerHTML = `<p class="test-question-type">Multiple Choice</p>
          <p class="test-question-prompt">${sanitize(q.term)}</p>
          <div class="test-mc-options">${optsHtml}</div>`;
      } else {
        div.innerHTML = `<p class="test-question-type">True / False</p>
          <p class="test-question-prompt">"${sanitize(q.shownDef)}" is the definition of <strong>${sanitize(q.term)}</strong></p>
          <div class="test-tf-options">
            <button type="button" class="test-tf-btn" data-qi="${i}" data-val="true">True</button>
            <button type="button" class="test-tf-btn" data-qi="${i}" data-val="false">False</button>
          </div>`;
      }
      container.appendChild(div);
    });

    container.querySelectorAll('.test-written-input').forEach((inp) => {
      inp.addEventListener('input', () => { testAnswers[inp.dataset.qi] = inp.value; });
    });
    container.querySelectorAll('.test-mc-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll(`.test-mc-option[data-qi="${btn.dataset.qi}"]`).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        testAnswers[btn.dataset.qi] = btn.dataset.val;
      });
    });
    container.querySelectorAll('.test-tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll(`.test-tf-btn[data-qi="${btn.dataset.qi}"]`).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        testAnswers[btn.dataset.qi] = btn.dataset.val === 'true';
      });
    });
  }

  function submitTest() {
    let correct = 0;
    const graded = testQuestions.map((q, i) => {
      const ans = testAnswers[i];
      const isCorrect = q.type === 'written'
        ? normalizeText(String(ans || '')) === normalizeText(q.answer)
        : q.type === 'mc'
          ? ans === q.answer
          : ans === q.isTrue;
      if (isCorrect) correct++;
      return { ...q, isCorrect, userAnswer: ans };
    });

    showElement(getById('testQuestionsWrapper'), false);
    showElement(getById('testResults'), true);
    setText(getById('testScoreText'), `${correct} / ${graded.length} correct — ${Math.round((correct / graded.length) * 100)}%`);

    const list = getById('testResultsList');
    list.innerHTML = '';
    graded.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'test-question';
      let feedback = `<p class="test-result-feedback correct">✓ Correct</p>`;
      if (!r.isCorrect) {
        const ua = r.type === 'tf'
          ? (r.userAnswer === true ? 'True' : r.userAnswer === false ? 'False' : 'No answer')
          : sanitize(String(r.userAnswer || '(no answer)'));
        feedback = `<p class="test-result-feedback incorrect">✗ Your answer: ${ua}</p>
                    <p class="test-result-feedback correct">Correct: ${sanitize(r.answer)}</p>`;
      }
      div.innerHTML = `<p class="test-question-prompt">${sanitize(r.term)}</p>${feedback}`;
      list.appendChild(div);
    });
  }

  // ── Match (timed) ─────────────────────────────────────────────────────────

  function initializeMatchMode() {
    stopMatchTimer();
    const cards = getCurrentCards();
    const pairs = cards.map((card, index) => ({ index, term: card.term, definition: card.definition }));
    matchState = { pairs, termOrder: shuffle(pairs), definitionOrder: shuffle(pairs), selectedTerm: null, selectedDefinition: null, matches: [], started: false };
    setText(getById('matchTimer'), '0.0s');
    const bestKey = `match-best-${state.selectedDeckId}`;
    const best = localStorage.getItem(bestKey);
    setText(getById('matchBestTime'), best ? `Best: ${best}s` : '');
    renderMatchBoard();
  }

  function startMatchTimer() {
    if (matchState.started) return;
    matchState.started = true;
    matchTimerStart = Date.now();
    matchTimerInterval = setInterval(() => {
      setText(getById('matchTimer'), `${((Date.now() - matchTimerStart) / 1000).toFixed(1)}s`);
    }, 100);
  }

  function stopMatchTimer() {
    if (matchTimerInterval) { clearInterval(matchTimerInterval); matchTimerInterval = null; }
  }

  function renderMatchBoard() {
    if (!matchTerms || !matchDefinitions || !matchStatus) return;
    matchTerms.innerHTML = '';
    matchDefinitions.innerHTML = '';
    matchState.termOrder.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'match-item';
      btn.textContent = item.term;
      btn.dataset.index = String(item.index);
      btn.disabled = matchState.matches.includes(item.index);
      btn.addEventListener('click', () => { startMatchTimer(); selectMatchTerm(item.index); });
      matchTerms.appendChild(btn);
    });
    matchState.definitionOrder.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'match-item';
      btn.textContent = item.definition;
      btn.dataset.index = String(item.index);
      btn.disabled = matchState.matches.includes(item.index);
      btn.addEventListener('click', () => { startMatchTimer(); selectMatchDefinition(item.index); });
      matchDefinitions.appendChild(btn);
    });
    updateMatchStatus();
  }

  function selectMatchTerm(index) {
    if (matchState.matches.includes(index)) return;
    matchState.selectedTerm = index;
    highlightSelected(matchTerms, index);
    if (matchState.selectedDefinition !== null) checkMatchPair();
  }

  function selectMatchDefinition(index) {
    if (matchState.matches.includes(index)) return;
    matchState.selectedDefinition = index;
    highlightSelected(matchDefinitions, index);
    if (matchState.selectedTerm !== null) checkMatchPair();
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
      if (matchState.matches.length === matchState.pairs.length) {
        stopMatchTimer();
        const elapsed = ((Date.now() - matchTimerStart) / 1000).toFixed(1);
        const bestKey = `match-best-${state.selectedDeckId}`;
        const prev = parseFloat(localStorage.getItem(bestKey) || 'Infinity');
        if (parseFloat(elapsed) < prev) {
          localStorage.setItem(bestKey, elapsed);
          setText(getById('matchBestTime'), `New best: ${elapsed}s!`);
        } else {
          setText(getById('matchBestTime'), `Best: ${prev}s`);
        }
        setText(matchStatus, `Done in ${elapsed}s — all matched!`);
        return;
      }
      setText(matchStatus, 'Correct!');
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
    setText(matchStatus, `${remaining} pair${remaining === 1 ? '' : 's'} left.`);
  }

  // ── Gravity ───────────────────────────────────────────────────────────────

  function resetGravity() {
    stopGravity();
    gravityState = null;
    const termEl = getById('gravityTerm');
    if (termEl) { termEl.textContent = ''; termEl.className = 'gravity-term'; }
    setText(getById('gravityScore'), '0');
    setText(getById('gravityLives'), '♥♥♥');
    const fb = getById('gravityFeedback');
    if (fb) fb.classList.add('hidden');
    const input = getById('gravityInput');
    if (input) { input.value = ''; input.disabled = true; }
    const startBtn = getById('gravityStartBtn');
    if (startBtn) startBtn.textContent = 'Start Gravity';
    showElement(getById('gravityStartScreen'), true);
  }

  function startGravity() {
    const cards = getCurrentCards();
    if (!cards.length) { alert('Add cards before playing Gravity.'); return; }
    showElement(getById('gravityStartScreen'), false);
    const fb = getById('gravityFeedback');
    if (fb) fb.classList.add('hidden');
    gravityState = { deck: shuffle([...cards]), pos: 0, score: 0, lives: 3, duration: 8000, active: true, current: null };
    const input = getById('gravityInput');
    if (input) { input.disabled = false; input.value = ''; input.focus(); }
    dropTerm();
  }

  function stopGravity() {
    if (gravityFallTimeout) { clearTimeout(gravityFallTimeout); gravityFallTimeout = null; }
  }

  function dropTerm() {
    if (!gravityState?.active) return;
    if (gravityState.pos >= gravityState.deck.length) {
      gravityState.deck = shuffle([...getCurrentCards()]);
      gravityState.pos = 0;
    }
    gravityState.current = gravityState.deck[gravityState.pos++];
    const termEl = getById('gravityTerm');
    if (termEl) {
      termEl.textContent = gravityState.current.term;
      termEl.className = 'gravity-term';
      termEl.offsetHeight;
      termEl.style.animationDuration = `${gravityState.duration}ms`;
      termEl.classList.add('falling');
    }
    const input = getById('gravityInput');
    if (input) input.value = '';
    const fb = getById('gravityFeedback');
    if (fb) fb.classList.add('hidden');
    gravityFallTimeout = setTimeout(termMissed, gravityState.duration);
  }

  function checkGravityInput() {
    if (!gravityState?.active || !gravityState.current) return;
    const input = getById('gravityInput');
    if (normalizeText(input?.value || '') !== normalizeText(gravityState.current.definition)) return;
    stopGravity();
    gravityState.score++;
    gravityState.duration = Math.max(3000, gravityState.duration - 300);
    setText(getById('gravityScore'), String(gravityState.score));
    const termEl = getById('gravityTerm');
    if (termEl) { termEl.className = 'gravity-term cleared'; }
    setTimeout(dropTerm, 400);
  }

  function termMissed() {
    if (!gravityState?.active) return;
    gravityState.lives--;
    const termEl = getById('gravityTerm');
    if (termEl) termEl.classList.add('hit');
    const fb = getById('gravityFeedback');
    if (fb) { fb.textContent = `Missed! Answer: ${gravityState.current?.definition || ''}`; fb.classList.remove('hidden'); }
    setText(getById('gravityLives'), '♥'.repeat(gravityState.lives) + '♡'.repeat(3 - gravityState.lives));
    if (gravityState.lives <= 0) {
      gravityState.active = false;
      if (fb) fb.textContent = `Game over! Final score: ${gravityState.score}`;
      const input = getById('gravityInput');
      if (input) input.disabled = true;
      const startBtn = getById('gravityStartBtn');
      if (startBtn) startBtn.textContent = 'Play again';
      showElement(getById('gravityStartScreen'), true);
    } else {
      setTimeout(dropTerm, 1200);
    }
  }

  // ── Blocks ────────────────────────────────────────────────────────────────

  function initializeBlocksMode() {
    const cards = getCurrentCards();
    const card = getCurrentCard();
    const text = card ? card.definition : '';
    const fragments = text.split(/\s+/).filter(Boolean);
    const completed = blocksState?.completed || 0;
    blocksState = { answer: text.trim(), fragments: shuffle(fragments), selection: [], completed, total: cards.length };
    renderBlocksBoard();
    setText(blocksResult, '');
  }

  function renderBlocksBoard() {
    if (!blocksBoard) return;
    blocksBoard.innerHTML = '';
    const card = getCurrentCard();
    if (card) {
      const prompt = document.createElement('p');
      prompt.className = 'blocks-prompt';
      prompt.textContent = card.term;
      blocksBoard.appendChild(prompt);
    }
    const progress = document.createElement('p');
    progress.className = 'blocks-progress';
    progress.textContent = `Card ${blocksState.completed + 1} of ${blocksState.total}`;
    blocksBoard.appendChild(progress);
    const selectionNode = document.createElement('div');
    selectionNode.className = 'blocks-selection';
    selectionNode.textContent = blocksState.selection.join(' ') || 'Build the answer here…';
    blocksBoard.appendChild(selectionNode);
    const grid = document.createElement('div');
    grid.className = 'blocks-fragments';
    blocksState.fragments.forEach((fragment) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-fragment';
      btn.textContent = fragment;
      btn.disabled = blocksState.selection.filter((x) => x === fragment).length >= blocksState.fragments.filter((x) => x === fragment).length;
      btn.addEventListener('click', () => { blocksState.selection.push(fragment); renderBlocksBoard(); });
      grid.appendChild(btn);
    });
    blocksBoard.appendChild(grid);
  }

  // ── Mode switching ────────────────────────────────────────────────────────

  function setReviewMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    showingBack = false;
    stopBlast();
    stopGravity();
    stopMatchTimer();
    renderModeView();
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  if (deckSelect) {
    deckSelect.addEventListener('change', () => {
      state.selectedDeckId = deckSelect.value;
      currentIndex = 0;
      saveState();
      renderModeView();
    });
  }
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setReviewMode(btn.dataset.mode));
  });

  if (reviewCard) {
    reviewCard.addEventListener('click', () => { if (currentMode === 'flashcards') { showingBack = !showingBack; renderCurrentCard(); } });
    reviewCard.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && currentMode === 'flashcards') { e.preventDefault(); showingBack = !showingBack; renderCurrentCard(); }
    });
  }
  if (flipBtn) flipBtn.addEventListener('click', () => { showingBack = !showingBack; renderCurrentCard(); });
  if (prevBtn) prevBtn.addEventListener('click', () => changeCard(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => changeCard(1));

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      const cards = getCurrentCards();
      if (!cards.length) return;
      state.decks = state.decks.map((d) => d.id === state.selectedDeckId ? { ...d, cards: shuffle(d.cards) } : d);
      saveState();
      renderModeView();
    });
  }

  if (checkAnswerBtn) {
    checkAnswerBtn.addEventListener('click', () => {
      const card = getCurrentCard();
      if (!card || !answerInput) return;
      const correct = normalizeText(answerInput.value) === normalizeText(card.definition);
      setText(answerResult, correct ? 'Correct!' : `Not quite. The answer is: ${card.definition}`);
    });
  }
  if (answerInput) answerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkAnswerBtn?.click(); });

  if (blastStartBtn) blastStartBtn.addEventListener('click', () => (blastInterval ? stopBlast() : startBlast()));

  const learnSubmitBtn = getById('learnSubmitBtn');
  if (learnSubmitBtn) learnSubmitBtn.addEventListener('click', checkLearnWritten);
  const learnWrittenInput = getById('learnWrittenInput');
  if (learnWrittenInput) learnWrittenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkLearnWritten(); });

  const testSubmitBtn = getById('testSubmitBtn');
  if (testSubmitBtn) testSubmitBtn.addEventListener('click', submitTest);
  const testRetryBtn = getById('testRetryBtn');
  if (testRetryBtn) testRetryBtn.addEventListener('click', initializeTestMode);

  const gravityStartBtn = getById('gravityStartBtn');
  if (gravityStartBtn) gravityStartBtn.addEventListener('click', startGravity);
  const gravityInput = getById('gravityInput');
  if (gravityInput) gravityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkGravityInput(); });

  if (blocksSubmitBtn) {
    blocksSubmitBtn.addEventListener('click', () => {
      const guess = normalizeText(blocksState.selection.join(' '));
      if (guess === normalizeText(blocksState.answer)) {
        blocksState.completed++;
        if (blocksState.completed >= blocksState.total) {
          setText(blocksResult, `All ${blocksState.total} cards complete — great work!`);
        } else {
          setText(blocksResult, 'Correct!');
          setTimeout(() => { changeCard(1); initializeBlocksMode(); }, 700);
        }
      } else {
        setText(blocksResult, 'Not quite. Try rearranging the blocks.');
      }
    });
  }
  if (blocksClearBtn) {
    blocksClearBtn.addEventListener('click', () => { blocksState.selection = []; renderBlocksBoard(); setText(blocksResult, ''); });
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
          parseId: null,
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
