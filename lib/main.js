const { CompositeDisposable } = require('atom');

let LogView = null;

const LanguageLog = {
  config: {
    showFilterBar: {
      type: 'boolean',
      default: true
    },
    tail: {
      type: 'boolean',
      default: false
    },
    foldPosition: {
      type: 'string',
      default: 'end-of-line',
      description: 'Determine if the fold appears at the end of a filtered line or between two filtered lines.',
      enum: [
        { value: 'end-of-line', description: 'Fold block at the end of filtered lines.' },
        { value: 'between-lines', description: 'Fold block between two filtered lines.' }
      ]
    },
    useMultiLinesLogEntrySupport: {
      type: 'boolean',
      title: 'Use multi-lines log entry support (experimental)',
      default: false,
      description: 'Displays the whole log entry after filter instead of only the line even if the log entry has several lines.'
    },
    caseInsensitive: {
      type: 'boolean',
      default: true
    },
    adjacentLines: {
      type: 'integer',
      title: 'Number of lines displayed above and below filter result:',
      default: 0,
      minimum: 0
    }
  },

  activate(state) {
    this.disposables = new CompositeDisposable();
    this.grammarDisposable = new CompositeDisposable();

    this.disposables.add(atom.workspace.observeActivePaneItem((item) => {
      this.itemUpdate(item);
    }));

    atom.commands.add('atom-workspace', 'log:toggle-log-panel', () => {
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
      if (grammar.name === 'Log' && atom.config.get('language-log.showFilterBar')) {
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
