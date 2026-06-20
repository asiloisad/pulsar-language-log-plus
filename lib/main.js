const { CompositeDisposable } = require('atom');

let LogView = null;

const LanguageLog = {
  activate(state) {
    this.disposables = new CompositeDisposable();
    this.grammarDisposable = new CompositeDisposable();

    // Live per-editor state (keeps the full state, including the filter query,
    // while switching between editors within a session).
    this.states = new WeakMap();
    // Persisted button states keyed by file path, restored across sessions.
    this.persistedStates = (state != null ? state.persistedStates : null) || {};

    this.store = {
      get: (editor) => {
        const live = this.states.get(editor);
        if (live != null) {
          return live;
        }
        const filePath = editor.getPath != null ? editor.getPath() : null;
        return filePath ? this.persistedStates[filePath] : null;
      },
      set: (editor, value) => {
        this.states.set(editor, value);
        const filePath = editor.getPath != null ? editor.getPath() : null;
        if (filePath) {
          this.persistedStates[filePath] = {
            filterText: value.filterText,
            tailEnabled: value.tailEnabled,
            caseInsensitive: value.caseInsensitive,
            regexEnabled: value.regexEnabled,
            hiddenLevels: value.hiddenLevels
          };
        }
      }
    };

    this.disposables.add(
      atom.workspace.observeActivePaneItem((item) => {
        this.itemUpdate(item);
      }),
      atom.commands.add('atom-workspace', 'language-log-plus:toggle-log-panel', () => {
        this.toggleLogPanel();
      }),
      atom.commands.add('atom-workspace', 'language-log-plus:toggle-focus', () => {
        this.toggleFocus();
      }),
      atom.config.onDidChange('language-log-plus.showFilterBar', () => {
        this.itemUpdate(atom.workspace.getActiveTextEditor());
      })
    );
  },

  deactivate() {
    this.disposables.dispose();
    if (this.logView != null) {
      this.logView.destroy();
    }
    this.removeLogPanel();
  },

  serialize() {
    return { persistedStates: this.persistedStates };
  },

  itemUpdate(item) {
    this.grammarDisposable.dispose();
    if (!(item != null ? item.observeGrammar : undefined)) {
      return this.removeLogPanel();
    }

    return this.grammarDisposable.add(item.observeGrammar((grammar) => {
      this.removeLogPanel();
      if (this.isLogGrammar(grammar) && atom.config.get('language-log-plus.showFilterBar')) {
        return this.addLogPanel(item);
      }
    }));
  },

  isLogGrammar(grammar) {
    return grammar && grammar.scopeName === 'source.log';
  },

  addLogPanel(textEditor) {
    // Create new log view if opened log differs from previous.
    if (!((this.logView != null ? this.logView.textEditor : undefined) === textEditor)) {
      if (LogView == null) {
        LogView = require('./log-view');
      }
      if (this.logView != null) {
        this.logView.destroy();
      }
      this.logView = new LogView(textEditor, this.store);
    }

    this.logPanel = atom.workspace.addBottomPanel({
      item: this.logView.getElement(),
      className: 'language-log-plus-panel'
    });
    return this.logPanel;
  },

  removeLogPanel() {
    if (this.logPanel != null) {
      this.logPanel.destroy();
    }
    this.logPanel = null;
    return this.logPanel;
  },

  toggleLogPanel() {
    if ((this.logPanel != null) && !this.logPanel.destroyed) {
      return this.removeLogPanel();
    }

    const textEditor = atom.workspace.getActiveTextEditor();
    if (!textEditor || !this.isLogGrammar(textEditor.getGrammar())) {
      return;
    }

    return this.addLogPanel(textEditor);
  },

  toggleFocus() {
    if ((this.logPanel == null) || this.logPanel.destroyed) {
      const textEditor = atom.workspace.getActiveTextEditor();
      if (!textEditor || !this.isLogGrammar(textEditor.getGrammar())) {
        return;
      }
      this.addLogPanel(textEditor);
    }

    if (this.logView != null) {
      return this.logView.toggleFocus();
    }
  }
};

module.exports = LanguageLog;
