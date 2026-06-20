const { CompositeDisposable } = require('atom');

let LogView = null;

const LanguageLog = {
  activate(state) {
    this.disposables = new CompositeDisposable();
    this.grammarDisposable = new CompositeDisposable();

    this.disposables.add(atom.workspace.observeActivePaneItem((item) => {
      this.itemUpdate(item);
    }));

    atom.commands.add('atom-workspace', 'language-log-plus:toggle-log-panel', () => {
      this.toggleLogPanel();
    });
  },

  deactivate() {
    this.disposables.dispose();
    if (this.logView != null) {
      this.logView.destroy();
    }
    this.removeLogPanel();
  },

  itemUpdate(item) {
    this.grammarDisposable.dispose();
    if (!(item != null ? item.observeGrammar : undefined)) {
      return this.removeLogPanel();
    }

    return this.grammarDisposable.add(item.observeGrammar((grammar) => {
      this.removeLogPanel();
      if (grammar.name === 'Log' && atom.config.get('language-log-plus.showFilterBar')) {
        return this.addLogPanel(item);
      }
    }));
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
      this.logView = new LogView(textEditor);
    }

    this.logPanel = atom.workspace.addBottomPanel({ item: this.logView.getElement(), className: 'log-panel' });
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

    return this.addLogPanel(atom.workspace.getActiveTextEditor());
  }
};

module.exports = LanguageLog;
