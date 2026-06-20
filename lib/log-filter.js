const { CompositeDisposable, Point } = require('atom');
const { Emitter } = require('atom');

const moment = require('moment');
moment.createFromInputFallback = function(config) {
  config._d = new Date(config._i);
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class LogFilter {
  constructor(textEditor) {
    this.textEditor = textEditor;
    this.disposables = new CompositeDisposable();
    this.emitter = new Emitter();

    this.results = {
      text: [],
      levels: []
    };
    this.caseInsensitive = true;
    this.regexEnabled = false;
  }

  onDidFinishFilter(cb) {
    return this.emitter.on('did-finish-filter', cb);
  }

  setCaseInsensitive(caseInsensitive) {
    this.caseInsensitive = caseInsensitive;
  }

  setRegexEnabled(regexEnabled) {
    this.regexEnabled = regexEnabled;
  }

  destroy() {
    this.disposables.dispose();
    this.removeFilter();
    return this.detach();
  }

  getFilteredLines(type) {
    let res;
    if ((res = this.results[type])) {
      return res;
    }

    res = [...this.results.text, ...this.results.levels];
    const output = {};
    for (let key = 0; key < res.length; key++) {
      output[res[key]] = res[key];
    }

    const values = [];
    for (const key in output) {
      values.push(output[key]);
    }
    return values;
  }

  getFilteredCount() {
    return this.results.text.length + this.results.levels.length;
  }

  performTextFilter(text) {
    let regex;
    if (!(regex = this.getRegexFromText(text))) {
      return;
    }

    const buffer = this.textEditor.getBuffer();
    if (!buffer) {
      return;
    }

    if (!regex) {
      return;
    }

    this.results.text = [];
    const lines = buffer.getLines();
    for (let i = 0; i < lines.length; i++) {
      if (!regex.test(lines[i])) {
        this.results.text.push(i);
      }
    }

    this.results.text = this.addAdjacentLines(this.results.text);
    return this.filterLines();
  }

  addAdjacentLines(textResults) {
    let adjLines;
    if ((adjLines = atom.config.get('language-log-plus.adjacentLines'))) {
      const total = this.textEditor.getLineCount();
      let temp = [];

      for (let lineIndex = 0; lineIndex < textResults.length; lineIndex++) {
        const lineNumber = textResults[lineIndex];
        if ((lineIndex + adjLines < textResults.length && lineNumber + adjLines >= textResults[lineIndex + adjLines]) ||
           (lineIndex + adjLines >= textResults.length && (textResults.length - lineIndex) - (total - lineNumber) === 0)) {
          temp.push(lineNumber);
        }
      }

      textResults = temp.reverse();
      temp = [];

      for (let lineIndex = 0; lineIndex < textResults.length; lineIndex++) {
        const lineNumber = textResults[lineIndex];
        if ((lineIndex + adjLines < textResults.length && lineNumber - adjLines <= textResults[lineIndex + adjLines]) ||
           (lineIndex + adjLines >= textResults.length && 0 === (textResults.length - lineIndex) - (lineNumber + 1))) {
          temp.push(lineNumber);
        }
      }

      return temp.reverse();
    }
    return textResults;
  }

  performLevelFilter(scopes) {
    const buffer = this.textEditor.getBuffer();
    if (!buffer) {
      return;
    }

    if (!scopes) {
      return;
    }
    const grammar = this.textEditor.getGrammar();

    this.results.levels = [];
    const lines = buffer.getLines();
    for (let i = 0; i < lines.length; i++) {
      const tokens = grammar.tokenizeLine(lines[i]);
      if (this.shouldFilterScopes(tokens, scopes)) {
        this.results.levels.push(i);
      }
    }
    return this.filterLines();
  }

  filterLines() {
    const lines = this.getFilteredLines();

    this.removeFilter();

    let start;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (lines[i + 1] !== line + 1) {
        this.foldLineRange(start || lines[0], line);
        start = lines[i + 1];
      }
    }

    return this.emitter.emit('did-finish-filter');
  }

  foldLineRange(start, end) {
    if (!(start != null && end != null)) {
      return;
    }

    // By default, keep the safest fallback: fold from the first character of the first line.
    let actualStartLine = start;
    let actualStartColumn = 0;
    const foldPositionConfig = atom.config.get('language-log-plus.foldPosition');
    if ('end-of-line' === foldPositionConfig) {
      actualStartLine = start - 1;
      actualStartColumn = 0;
      if (actualStartLine <= 0) {
        actualStartLine = 0;
        actualStartColumn = 0;
      } else {
        actualStartColumn = this.textEditor.getBuffer().lineLengthForRow(actualStartLine);
      }
    } else if ('between-lines' === foldPositionConfig) {
      actualStartLine = start;
      actualStartColumn = 0;
    }

    const rangeStart = [actualStartLine, actualStartColumn];
    const rangeEnd = [end, this.textEditor.getBuffer().lineLengthForRow(end)];
    this.textEditor.setSelectedBufferRange([rangeStart, rangeEnd]);
    return this.textEditor.getSelections()[0].fold();
  }

  shouldFilterScopes(tokens, filterScopes) {
    for (const tag of tokens.tags) {
      const scope = tokens.registry.scopeForId(tag);
      if (scope) {
        if (filterScopes.indexOf(scope) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  getRegexFromText(text) {
    try {
      let regexpPattern = this.regexEnabled ? text : escapeRegExp(text);
      let regexpFlags = '';
      if (this.caseInsensitive) {
        regexpFlags += 'i';
      }

      if (regexpFlags) {
        return new RegExp(regexpPattern, regexpFlags);
      } else {
        return new RegExp(regexpPattern);
      }
    } catch (error) {
      atom.notifications.addWarning('Log Language', { detail: 'Invalid filter regex' });
      return false;
    }
  }

  removeFilter() {
    return this.textEditor.unfoldAll();
  }

  getFirstTimestamp() {
    return this.getLineTimestamp(0);
  }

  getLastTimestamp() {
    for (let n = 1; n <= 3; n++) {
      const pos = this.textEditor.getLineCount() - n;
      if (!(pos > 0)) {
        return;
      }

      const timestamp = this.getLineTimestamp(pos);
      if (timestamp) {
        return timestamp;
      }
    }
  }

  getLineTimestamp(lineNumber) {
    for (let pos = 0; pos <= 30; pos += 10) {
      const point = new Point(lineNumber, pos);
      const range = this.textEditor.bufferRangeForScopeAtPosition('timestamp', point);

      let timestamp;
      if (range && (timestamp = this.textEditor.getTextInRange(range))) {
        return this.parseTimestamp(timestamp);
      }
    }
  }

  parseTimestamp(timestamp) {
    const regexes = [
      /^\d{6}[-\s]/,
      /[0-9]{4}:[0-9]{2}/,
      /[0-9]T[0-9]/
    ];

    timestamp = timestamp.replace(/[\[\]]?/g, '');
    timestamp = timestamp.replace(/,/g, '.');
    timestamp = timestamp.replace(/([A-Za-z]*|[-+][0-9]{4}|[-+][0-9]{2}:[0-9]{2})$/, '');

    let part;
    const match = timestamp.match(regexes[0]);
    if ((part = match != null ? match[0] : undefined)) {
      part = `20${part.substr(0, 2)}-${part.substr(2, 2)}-${part.substr(4, 2)} `;
      timestamp = timestamp.replace(regexes[0], part);
    }
    if (timestamp.match(regexes[1])) {
      timestamp = timestamp.replace(':', ' ');
    }

    if (timestamp.match(regexes[2])) {
      timestamp = timestamp.replace(/([0-9])T([0-9])/, '$1 $2');
    }

    if (timestamp.length < 8) {
      return false;
    }

    const time = moment(timestamp);
    if (!time.isValid()) {
      return false;
    }
    if (time.year() === 2001) {
      time.year(moment().year());
    }
    return time;
  }
}

module.exports = LogFilter;
