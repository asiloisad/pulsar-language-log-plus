const { CompositeDisposable, Disposable } = require('atom');

const LogFilter = require('./log-filter');
const { formatTimestamp } = require('./util');

function deprecatedTextEditor(params) {
  if (atom.workspace.buildTextEditor != null) {
    return atom.workspace.buildTextEditor(params);
  }

  const TextEditor = require('atom').TextEditor;
  return new TextEditor(params);
}

function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.tabIndex != null) {
    element.tabIndex = options.tabIndex;
  }
  if (options.text != null) {
    element.textContent = options.text;
  }
  for (const child of children) {
    element.appendChild(child);
  }
  return element;
}

function addListener(element, eventName, listener) {
  element.addEventListener(eventName, listener);
  return new Disposable(() => element.removeEventListener(eventName, listener));
}

function setElementVisible(element, visible) {
  element.style.display = visible ? '' : 'none';
}

class LogView {
  constructor(textEditor, store) {
    this.textEditor = textEditor;
    this.store = store;
    this.disposables = new CompositeDisposable();

    const state = (store != null ? store.get(textEditor) : null) || {};

    this.buildElement();
    setElementVisible(this.timestamps, false);

    this.logFilter = new LogFilter(this.textEditor);
    this.tailEnabled = state.tailEnabled || false;
    this.caseInsensitive = state.caseInsensitive != null ? state.caseInsensitive : true;
    this.hiddenLevels = Object.assign({
      verbose: false,
      info: false,
      debug: false,
      warning: false,
      error: false
    }, state.hiddenLevels);
    this.logFilter.setCaseInsensitive(this.caseInsensitive);

    if (state.filterText) {
      this.filterBuffer.setText(state.filterText);
    }

    this.handleEvents();
    this.handleConfigChanges();
    this.updateButtons();
    this.updateDescription();
    this.addTooltips();
    this.restoreFilters();
  }

  saveState() {
    if ((this.store == null) || (this.textEditor == null)) {
      return;
    }
    this.store.set(this.textEditor, {
      filterText: this.filterBuffer.getText(),
      tailEnabled: this.tailEnabled,
      caseInsensitive: this.caseInsensitive,
      hiddenLevels: Object.assign({}, this.hiddenLevels)
    });
  }

  restoreFilters() {
    const scopes = this.getFilterScopes();
    if (scopes.length) {
      this.logFilter.performLevelFilter(scopes);
    }
    if (this.filterBuffer.getText().length) {
      this.logFilter.performTextFilter(this.filterBuffer.getText());
    }
  }

  buildElement() {
    this.filterEditor = deprecatedTextEditor({
      mini: true,
      tabLength: 2,
      softTabs: true,
      softWrapped: false,
      placeholderText: 'Filter in current buffer'
    });
    this.filterBuffer = this.filterEditor.getBuffer();
    this.filterEditorElement = atom.views.getView(this.filterEditor);

    this.timestampStart = createElement('code');
    this.timestampEnd = createElement('code');
    this.timestamps = createElement('section', {}, [
      createElement('div', { className: 'input-block log-timestamps' }, [
        this.timestampStart,
        createElement('div', { className: 'input-block-item input-block-item--flex' }, [
          createElement('i', { className: 'icon icon-chevron-left' }),
          createElement('div', { className: 'log-timestamps-line' }),
          createElement('i', { className: 'icon icon-chevron-right' })
        ]),
        this.timestampEnd
      ])
    ]);

    this.closeButton = createElement('span', { className: 'header-item close-button pull-right' }, [
      createElement('i', { className: 'icon icon-x' })
    ]);
    this.descriptionLabel = createElement('span', { className: 'header-item description' });
    this.descriptionWarningLabel = createElement('span', { className: 'header-item description warning' });

    this.filterButton = createElement('button', { className: 'btn btn-next', text: 'Filter' });
    this.tailButton = createElement('button', { className: 'btn icon icon-arrow-down' });
    this.caseSensitiveButton = createElement('button', { className: 'btn', text: 'Aa' });
    this.levelVerboseButton = createElement('button', { className: 'btn icon icon-eye syntax--log-verbose' });
    this.levelInfoButton = createElement('button', { className: 'btn icon icon-info syntax--log-info' });
    this.levelDebugButton = createElement('button', { className: 'btn icon icon-bug syntax--log-debug' });
    this.levelWarningButton = createElement('button', { className: 'btn icon icon-alert syntax--log-warning' });
    this.levelErrorButton = createElement('button', { className: 'btn icon icon-stop syntax--log-error' });
    this.optionsButtonGroup = createElement('span', { className: 'btn-group btn-toggle btn-group-options' }, [
      this.tailButton,
      this.caseSensitiveButton,
      this.levelVerboseButton,
      this.levelInfoButton,
      this.levelDebugButton,
      this.levelWarningButton,
      this.levelErrorButton
    ]);
    this.optionsLabel = createElement('span', { className: 'header-item options-label pull-right' }, [
      createElement('span', { text: 'Options: ' }),
      this.optionsButtonGroup
    ]);

    this.element = createElement('div', { className: 'language-log-plus-view', tabIndex: -1 }, [
      this.timestamps,
      createElement('header', { className: 'header' }, [
        createElement('span', { className: 'header-item title', text: 'Log Filter' }),
        this.closeButton,
        this.optionsLabel,
        this.descriptionLabel,
        this.descriptionWarningLabel
      ]),
      createElement('section', { className: 'input-block filter-container' }, [
        createElement('div', { className: 'input-block-item input-block-item--flex editor-container' }, [
          this.filterEditorElement
        ]),
        createElement('div', { className: 'input-block-item' }, [
          this.filterButton
        ])
      ])
    ]);
  }

  getElement() {
    return this.element;
  }

  addTooltips() {
    this.disposables.add(
      atom.tooltips.add(this.filterButton, {
        title: 'Filter Log Lines'
      }),
      atom.tooltips.add(this.tailButton, {
        title: 'Tail On File Changes'
      }),
      atom.tooltips.add(this.caseSensitiveButton, {
        title: 'Toggle case sensitivity'
      }),
      atom.tooltips.add(this.levelVerboseButton, {
        title: 'Hide Verbose Level'
      }),
      atom.tooltips.add(this.levelInfoButton, {
        title: 'Hide Info Level'
      }),
      atom.tooltips.add(this.levelDebugButton, {
        title: 'Hide Debug Level'
      }),
      atom.tooltips.add(this.levelWarningButton, {
        title: 'Hide Warning Level'
      }),
      atom.tooltips.add(this.levelErrorButton, {
        title: 'Hide Error Level'
      }),
      atom.tooltips.add(this.closeButton, {
        title: 'Close Panel <span class="keystroke">Esc</span>',
        html: true
      })
    );
  }

  handleEvents() {
    this.disposables.add(
      atom.commands.add(this.filterEditorElement, {
        'core:confirm': () => this.confirm()
      }),
      atom.commands.add(this.element, {
        'core:cancel': () => this.destroyPanel(),
        'core:close': () => this.destroyPanel()
      }),
      this.logFilter.onDidFinishFilter(() => {
        this.updateDescription();
      }),
      addListener(this.filterButton, 'click', () => this.confirm()),
      addListener(this.tailButton, 'click', () => this.toggleTail()),
      addListener(this.caseSensitiveButton, 'click', () => this.toggleCaseSensitivity()),
      addListener(this.levelVerboseButton, 'click', () => this.toggleButton('verbose')),
      addListener(this.levelInfoButton, 'click', () => this.toggleButton('info')),
      addListener(this.levelDebugButton, 'click', () => this.toggleButton('debug')),
      addListener(this.levelWarningButton, 'click', () => this.toggleButton('warning')),
      addListener(this.levelErrorButton, 'click', () => this.toggleButton('error')),
      addListener(this.closeButton, 'click', () => this.destroyPanel()),
      this.filterEditor.onDidStopChanging(() => {
        this.saveState();
        this.liveFilter();
      }),
      this.textEditor.onDidStopChanging(() => {
        this.tail();
        this.updateDescription();
      }),
      addListener(this.element, 'focus', () => this.filterEditorElement.focus())
    );

    if ((this.textEditor.tokenizedBuffer != null) && this.textEditor.tokenizedBuffer.fullyTokenized) {
      this.updateTimestamps();
    } else {
      this.disposables.add(this.textEditor.onDidTokenize(() => {
        this.updateTimestamps();
      }));
    }

  }

  handleConfigChanges() {
    this.disposables.add(
      atom.config.onDidChange('language-log-plus.adjacentLines', () => {
        this.refreshTextFilter();
      }),
      atom.config.onDidChange('language-log-plus.foldPosition', () => {
        this.refreshFilteredFolds();
      })
    );
  }

  destroy() {
    this.disposables.dispose();
    if (this.filterEditor && !this.filterEditor.isDestroyed()) {
      this.filterEditor.destroy();
    }
    this.element.remove();
  }

  destroyPanel() {
    let panel = atom.workspace.panelForItem(this.element);
    if (panel != null) {
      panel.destroy();
    }
    panel = null;
    this.textEditor = null;
    this.destroy();
  }

  toggleTail() {
    this.tailEnabled = !this.tailEnabled;
    this.updateButtons();
    this.saveState();
    return this.tail();
  }

  toggleCaseSensitivity() {
    this.caseInsensitive = !this.caseInsensitive;
    this.logFilter.setCaseInsensitive(this.caseInsensitive);
    this.updateButtons();
    this.saveState();
    return this.refreshTextFilter();
  }

  toggleButton(level) {
    this.hiddenLevels[level] = this.hiddenLevels[level] ? false : true;
    this.updateButtons();
    this.saveState();
    return this.logFilter.performLevelFilter(this.getFilterScopes());
  }

  updateButtons() {
    this.tailButton.classList.toggle('selected', this.tailEnabled);
    this.caseSensitiveButton.classList.toggle('selected', !this.caseInsensitive);
    this.levelVerboseButton.classList.toggle('selected', this.hiddenLevels.verbose);
    this.levelInfoButton.classList.toggle('selected', this.hiddenLevels.info);
    this.levelDebugButton.classList.toggle('selected', this.hiddenLevels.debug);
    this.levelWarningButton.classList.toggle('selected', this.hiddenLevels.warning);
    this.levelErrorButton.classList.toggle('selected', this.hiddenLevels.error);
  }

  confirm() {
    return this.logFilter.performTextFilter(this.filterBuffer.getText());
  }

  refreshTextFilter() {
    if (this.filterBuffer.getText().length > 0 || this.logFilter.getFilteredLines('text').length > 0) {
      return this.confirm();
    }
  }

  refreshFilteredFolds() {
    if (this.logFilter.getFilteredCount() > 0) {
      return this.logFilter.filterLines();
    }
  }

  liveFilter() {
    if (this.filterBuffer.getText().length === 0) {
      return this.logFilter.performTextFilter('');
    }
  }

  getFilterScopes() {
    const scopes = [];
    if (this.hiddenLevels.verbose) {
      scopes.push('definition.log.log-verbose');
    }
    if (this.hiddenLevels.info) {
      scopes.push('definition.log.log-info');
    }
    if (this.hiddenLevels.debug) {
      scopes.push('definition.log.log-debug');
    }
    if (this.hiddenLevels.warning) {
      scopes.push('definition.log.log-warning');
    }
    if (this.hiddenLevels.error) {
      scopes.push('definition.log.log-error');
    }
    return scopes;
  }

  focusTextEditor() {
    const workspaceElement = atom.views.getView(atom.workspace);
    return workspaceElement.focus();
  }

  toggleFocus() {
    if (this.filterEditorElement.contains(document.activeElement)) {
      return this.focusTextEditor();
    }
    return this.filterEditorElement.focus();
  }

  updateDescription() {
    const lines = this.textEditor.getLineCount();
    const filteredLines = this.logFilter.getFilteredCount();

    this.descriptionLabel.textContent = filteredLines
      ? `Showing ${lines - filteredLines} of ${lines} log lines`
      : `Showing ${lines} log lines`;

    this.descriptionWarningLabel.textContent = lines > 10000
      ? '(large file warning)'
      : '';
  }

  updateTimestamps() {
    const timestampStart = this.logFilter.getFirstTimestamp();
    const timestampEnd = this.logFilter.getLastTimestamp();

    if (!(timestampStart && timestampEnd && timestampStart.isValid() && timestampEnd.isValid())) {
      setElementVisible(this.timestamps, false);
      return;
    }

    this.timestampStart.textContent = formatTimestamp(timestampStart);
    this.timestampEnd.textContent = formatTimestamp(timestampEnd);
    setElementVisible(this.timestamps, true);
  }

  tail() {
    if (!(this.tailEnabled && this.textEditor)) {
      return;
    }
    if (this.textEditor.isDestroyed()) {
      return;
    }
    this.textEditor.moveToBottom();

    this.tailButton.classList.add('icon-scroll');
    clearTimeout(this.tailTimeout);
    this.tailTimeout = setTimeout(() => {
      this.tailButton.classList.remove('icon-scroll');
    }, 1000);
    return this.tailTimeout;
  }
}

module.exports = LogView;
