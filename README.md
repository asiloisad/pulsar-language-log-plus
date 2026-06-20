# language-log-plus

Log syntax highlighting with an inline filter panel.

Fork of [language-log](https://github.com/robertrossmann/language-log).

## Features

- **Log grammar**: Highlights common log formats including generic logs, syslog, Apache, Android, iOS, Python, npm, JBoss, CBS, and other application logs.
- **Inline filter panel**: Adds a bottom filter panel for log files using the `source.log` grammar.
- **Text filtering**: Filters visible log lines by the typed query, matched literally by default.
- **Regex filtering**: Toggle the regex button to match the query as a regular expression instead of literal text.
- **Case sensitivity**: Toggle case sensitive matching for the text filter with the case button.
- **Log level filters**: Hide verbose, info, debug, warning, or error lines with joined toolbar buttons.
- **Tail mode**: Keep the editor scrolled to the bottom when the log buffer changes.
- **Context lines**: Keep adjacent lines visible around text filter matches.
- **Persistent state**: Each editor remembers its filter query, regex and case sensitivity toggles, tail mode, and hidden log levels when you switch between log files.

## Installation

To install `language-log-plus` search for [language-log-plus](https://web.pulsar-edit.dev/packages/language-log-plus) in the Install pane of the Pulsar settings or run `ppm install language-log-plus`. Alternatively, you can run `ppm install asiloisad/pulsar-language-log-plus` to install a package directly from the GitHub repository.

## Commands

Commands available in `atom-workspace`:

- `language-log-plus:toggle-log-panel`: toggle log filter panel.
- `language-log-plus:toggle-focus`: move focus between the filter input and the editor.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new log formats? Just drop your thoughts on GitHub. Any feedback is welcome!
