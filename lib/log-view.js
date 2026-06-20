const { CompositeDisposable, Disposable, TextBuffer } = require('atom');

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
  constructor(textEditor) {
    this.textEditor = textEditor;
    this.filterBuffer = new TextBuffer();
    this.disposables = new CompositeDisposable();

    this.buildElement();
    setElementVisible(this.timestamps, false);

    this.logFilter = new LogFilter(this.textEditor);
    this.tailing = false;
    this.settings = {
      verbose: true,
      info: true,
      debug: true,
      warning: true,
      error: true
    };

    this.handleEvents();
    this.handleConfigChanges();
    this.updateButtons();
    this.updateDescription();
    this.addTooltips();
  }

  buildElement() {
    this.filterEditor = deprecatedTextEditor({
      mini: true,
      tabLength: 2,
      softTabs: true,
      softWrapped: false,
      buffer: this.filterBuffer,
      placeholderText: 'Filter in current buffer'
    });
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

    this.closeButton = createElement('span', { className: 'pull-right close-button' }, [
      createElement('i', { className: 'icon icon-x' })
    ]);
    this.descriptionLabel = createElement('span', { className: 'description' });
    this.descriptionWarningLabel = createElement('span', { className: 'description warning' });

    this.filterButton = createElement('button', { className: 'btn', text: 'Filter' });
    this.tailButton = createElement('button', { className: 'btn btn-icon icon-arrow-down' });
    this.caseSensistiveButton = createElement('button', { className: 'btn', text: 'Aa' });
    this.levelVerboseButton = createElement('button', { className: 'btn syntax--log-verbose', text: 'V' });
    this.levelInfoButton = createElement('button', { className: 'btn syntax--log-info', text: 'I' });
    this.levelDebugButton = createElement('button', { className: 'btn syntax--log-debug', text: 'D' });
    this.levelWarningButton = createElement('button', { className: 'btn syntax--log-warning', text: 'W' });
    this.levelErrorButton = createElement('button', { className: 'btn syntax--log-error', text: 'E' });

    this.element = createElement('div', { className: 'log-view', tabIndex: -1 }, [
      this.timestamps,
      createElement('header', { className: 'header' }, [
        createElement('span', { text: 'Log Filter' }),
        this.closeButton,
        createElement('span', { className: 'pull-right', text: 'Level Filters' }),
        this.descriptionLabel,
        this.descriptionWarningLabel
      ]),
      createElement('section', { className: 'input-block' }, [
        createElement('div', { className: 'input-block-item input-block-item--flex editor-container' }, [
          this.filterEditorElement
        ]),
        createElement('div', { className: 'input-block-item' }, [
          createElement('div', { className: 'btn-group' }, [this.filterButton]),
          createElement('div', { className: 'btn-group' }, [this.tailButton]),
          createElement('div', { className: 'btn-group' }, [this.caseSensistiveButton]),
          createElement('div', { className: 'btn-group btn-group-level' }, [
            this.levelVerboseButton,
            this.levelInfoButton,
            this.levelDebugButton,
            this.levelWarningButton,
            this.levelErrorButton
          ])
        ])
      ])
    ]);
  }

  getElement() {
    return this.element;
  }

  addTooltips() {
    this.disposables.add(atom.tooltips.add(this.filterButton, {
      title: 'Filter Log Lines'
    }));
    this.disposables.add(atom.tooltips.add(this.tailButton, {
      title: 'Tail On File Changes'
    }));
    this.disposables.add(atom.tooltips.add(this.caseSensistiveButton, {
      title: 'Toggle case sensitivity'
    }));
    this.disposables.add(atom.tooltips.add(this.levelVerboseButton, {
      title: 'Toggle Verbose Level'
    }));
    this.disposables.add(atom.tooltips.add(this.levelInfoButton, {
      title: 'Toggle Info Level'
    }));
    this.disposables.add(atom.tooltips.add(this.levelDebugButton, {
      title: 'Toggle Debug Level'
    }));
    this.disposables.add(atom.tooltips.add(this.levelWarningButton, {
      title: 'Toggle Warning Level'
    }));
    this.disposables.add(atom.tooltips.add(this.levelErrorButton, {
      title: 'Toggle Error Level'
    }));
    this.disposables.add(atom.tooltips.add(this.closeButton, {
      title: 'Close Panel <span class="keystroke">Esc</span>',
      html: true
    }));
  }

  handleEvents() {
    if (atom.textEditors && atom.textEditors.add) {
      this.disposables.add(atom.textEditors.add(this.filterEditor));
    }

    this.disposables.add(atom.commands.add(this.filterEditorElement, {
      'core:confirm': () => this.confirm()
    }));

    this.disposables.add(atom.commands.add(this.element, {
      'core:cancel': () => this.destroyPanel(),
      'core:close': () => this.destroyPanel()
    }));

    this.disposables.add(this.logFilter.onDidFinishFilter(() => {
      this.updateDescription();
    }));

    this.disposables.add(addListener(this.filterButton, 'click', () => this.confirm()));
    this.disposables.add(addListener(this.tailButton, 'click', () => this.toggleTail()));
    this.disposables.add(addListener(this.caseSensistiveButton, 'click', () => this.toggleCaseSensitivity()));
    this.disposables.add(addListener(this.levelVerboseButton, 'click', () => this.toggleButton('verbose')));
    this.disposables.add(addListener(this.levelInfoButton, 'click', () => this.toggleButton('info')));
    this.disposables.add(addListener(this.levelDebugButton, 'click', () => this.toggleButton('debug')));
    this.disposables.add(addListener(this.levelWarningButton, 'click', () => this.toggleButton('warning')));
    this.disposables.add(addListener(this.levelErrorButton, 'click', () => this.toggleButton('error')));
    this.disposables.add(addListener(this.closeButton, 'click', () => this.destroyPanel()));

    this.disposables.add(this.filterEditor.onDidStopChanging(() => {
      this.liveFilter();
    }));

    this.disposables.add(this.textEditor.onDidStopChanging(() => {
      this.tail();
      this.updateDescription();
    }));

    if ((this.textEditor.tokenizedBuffer != null) && this.textEditor.tokenizedBuffer.fullyTokenized) {
      this.updateTimestamps();
    } else {
      this.disposables.add(this.textEditor.onDidTokenize(() => {
        this.updateTimestamps();
      }));
    }

    this.disposables.add(addListener(this.element, 'focus', () => this.filterEditorElement.focus()));
  }

  handleConfigChanges() {
    this.disposables.add(atom.config.onDidChange('language-log.adjacentLines', () => {
      this.confirm();
    }));
  }

  destroy() {
    this.disposables.dispose();
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
    atom.config.set('language-log.tail', !atom.config.get('language-log.tail'));
    this.updateButtons();
    return this.tail();
  }

  toggleCaseSensitivity() {
    atom.config.set('language-log.caseInsensitive', !atom.config.get('language-log.caseInsensitive'));
    this.updateButtons();
    return this.confirm();
  }

  toggleButton(level) {
    this.settings[level] = this.settings[level] ? false : true;
    this.updateButtons();
    return this.logFilter.performLevelFilter(this.getFilterScopes());
  }

  updateButtons() {
    this.tailButton.classList.toggle('selected', atom.config.get('language-log.tail'));
    this.caseSensistiveButton.classList.toggle('selected', !atom.config.get('language-log.caseInsensitive'));
    this.levelVerboseButton.classList.toggle('selected', this.settings.verbose);
    this.levelInfoButton.classList.toggle('selected', this.settings.info);
    this.levelDebugButton.classList.toggle('selected', this.settings.debug);
    this.levelWarningButton.classList.toggle('selected', this.settings.warning);
    this.levelErrorButton.classList.toggle('selected', this.settings.error);
  }

  confirm() {
    return this.logFilter.performTextFilter(this.filterBuffer.getText());
  }

  liveFilter() {
    if (this.filterBuffer.getText().length === 0) {
      return this.logFilter.performTextFilter('');
    }
  }

  getFilterScopes() {
    const scopes = [];
    if (!this.settings.verbose) {
      scopes.push('definition.log.log-verbose');
    }
    if (!this.settings.info) {
      scopes.push('definition.log.log-info');
    }
    if (!this.settings.debug) {
      scopes.push('definition.log.log-debug');
    }
    if (!this.settings.warning) {
      scopes.push('definition.log.log-warning');
    }
    if (!this.settings.error) {
      scopes.push('definition.log.log-error');
    }
    return scopes;
  }

  focusTextEditor() {
    const workspaceElement = atom.views.getView(atom.workspace);
    return workspaceElement.focus();
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

    if (!(timestampStart && timestampEnd)) {
      setElementVisible(this.timestamps, false);
      return;
    }

    this.timestampStart.textContent = formatTimestamp(timestampStart);
    this.timestampEnd.textContent = formatTimestamp(timestampEnd);
    setElementVisible(this.timestamps, true);
  }

  tail() {
    if (!(atom.config.get('language-log.tail') && this.textEditor)) {
      return;
    }
    if (this.textEditor.isDestroyed()) {
      return;
    }
    this.textEditor.moveToBottom();
    this.tailing = true;

    this.tailButton.classList.add('icon-scroll');
    clearTimeout(this.tailTimeout);
    this.tailTimeout = setTimeout(() => {
      this.tailButton.classList.remove('icon-scroll');
      this.tailing = false;
    }, 1000);
    return this.tailTimeout;
  }
}

module.exports = LogView;
