# Bash Scripting Foundations

A shell script is a text file that the shell reads and executes. It is the fastest way to automate a sequence of commands, and it is already installed on almost every Linux system. This part teaches the subset you need for reliable, readable scripts.

## Start with a safe template

```bash
#!/usr/bin/env bash
set -euo pipefail

main() {
    printf 'Starting %s\n' "$0"
}

main "$@"
```

The first line is the shebang. It tells the kernel which interpreter to use. `set -euo pipefail` makes the script fail on unhandled errors, unset variables and failed pipeline stages. It is not a complete safety system, but it catches many mistakes early.

Make the script executable and run it:

```bash
chmod +x script.sh
./script.sh
```

Use `shellcheck script.sh` when available. It catches quoting bugs, unused variables and many portability problems.

## Variables and quoting

```bash
name="Linux Foundations"
count=10
printf 'name=%s count=%d\n' "$name" "$count"
```

Assign without spaces around `=`. Read with `$name` or `${name}`. Use braces when the variable is followed by text:

```bash
file="report"
printf '%s\n' "${file}.txt"
```

Quote expansions in most cases:

```bash
printf '%s\n' "$name"
```

Unquoted values undergo word splitting and glob expansion. That can turn one argument into several or expand `*` into filenames. Use arrays when you need a list:

```bash
files=("one.txt" "two words.txt")
for file in "${files[@]}"; do
    printf 'file: %s\n' "$file"
done
```

## Command substitution

```bash
today=$(date +%F)
kernel=$(uname -r)
printf 'date=%s kernel=%s\n' "$today" "$kernel"
```

Capture output only when you need it. If you just want to run a command and show output, run it directly. Avoid backticks; `$(...)` nests cleanly and is easier to read.

## Arguments

| Variable | Meaning |
| --- | --- |
| `$0` | Script name |
| `$1`, `$2` | Positional arguments |
| `$#` | Number of arguments |
| `$@` | All arguments as separate words |
| `$*` | All arguments as one word in some contexts |
| `$?` | Exit status of the last command |

```bash
if [ "$#" -lt 1 ]; then
    printf 'usage: %s <path>\n' "$0" >&2
    exit 2
fi

target=$1
printf 'target=%s\n' "$target"
```

Use `"$@"` when forwarding arguments. It preserves each argument as a separate word.

## Tests and conditionals

```bash
if [ -f /etc/passwd ]; then
    printf 'file exists\n'
fi

if [ ! -d /tmp/lab ]; then
    mkdir -p /tmp/lab
fi

if [ "$USER" = "root" ]; then
    printf 'running as root\n'
else
    printf 'running as %s\n' "$USER"
fi
```

Common tests:

| Test | True when |
| --- | --- |
| `-e path` | Path exists |
| `-f path` | Regular file |
| `-d path` | Directory |
| `-r path` | Readable |
| `-w path` | Writable |
| `-x path` | Executable |
| `-z string` | String is empty |
| `-n string` | String is not empty |
| `a = b` | Strings are equal |
| `a != b` | Strings differ |
| `n -eq m` | Integers are equal |
| `n -lt m` | Integer is less than |

Bash also supports `[[ ... ]]`, which handles pattern matching and avoids some word-splitting problems:

```bash
if [[ "$file" == *.log ]]; then
    printf 'log file\n'
fi
```

Use `(( ... ))` for arithmetic:

```bash
count=0
((count++))
printf 'count=%d\n' "$count"
```

## Loops

```bash
for file in /etc/*.conf; do
    printf '%s\n' "$file"
done

count=1
while [ "$count" -le 3 ]; do
    printf 'count=%d\n' "$count"
    ((count++))
done

while IFS= read -r line; do
    printf 'line: %s\n' "$line"
done < /etc/hostname
```

`IFS= read -r` preserves whitespace and backslashes. Use it for line-oriented input. For arbitrary filenames, use null-delimited input as shown in the files chapter.

## Functions

```bash
usage() {
    printf 'usage: %s <directory>\n' "$0" >&2
}

check_dir() {
    local dir=$1
    if [ ! -d "$dir" ]; then
        printf 'not a directory: %s\n' "$dir" >&2
        return 1
    fi
}

check_dir /tmp || exit 1
```

Use `local` for function variables. Return a status with `return 0` for success or a non-zero value for failure. Do not use `exit` inside a function unless you really want to end the whole script.

## Error handling

`set -e` is useful but subtle. A command in an `if`, `while` or `&&` chain is allowed to fail without exiting. If you need to clean up, use `trap`:

```bash
#!/usr/bin/env bash
set -euo pipefail

tmpdir=$(mktemp -d)
cleanup() {
    rm -rf "$tmpdir"
}
trap cleanup EXIT

printf 'working in %s\n' "$tmpdir"
```

The trap runs when the script exits, including on an error. Keep cleanup idempotent so it is safe to run more than once.

For expected failures, handle them explicitly:

```bash
if ! grep -q '^root:' /etc/passwd; then
    printf 'root entry missing\n' >&2
    exit 1
fi
```

## A practical script

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf 'usage: %s <logfile>\n' "$0" >&2
    exit 2
}

[ "$#" -eq 1 ] || usage
logfile=$1

if [ ! -r "$logfile" ]; then
    printf 'cannot read: %s\n' "$logfile" >&2
    exit 1
fi

printf 'lines: %s\n' "$(wc -l < "$logfile")"
printf 'errors: %s\n' "$(grep -ci 'error' "$logfile" || true)"
printf 'last modified: %s\n' "$(stat -c '%y' "$logfile")"
```

The `|| true` on `grep` keeps a no-match result from failing the script under `set -e`. Use that pattern only when no match is a valid outcome.

## Parameter expansion

Bash can transform a variable while expanding it. These forms avoid extra commands and work well in scripts.

| Form | Result |
| --- | --- |
| `${name:-default}` | Use `default` if `name` is unset or empty |
| `${name:=default}` | Assign `default` if `name` is unset or empty |
| `${name:?message}` | Print `message` and exit if `name` is unset or empty |
| `${name:+alternate}` | Use `alternate` if `name` is set and non-empty |
| `${#name}` | Length of the value |
| `${name#prefix}` | Remove the shortest matching prefix |
| `${name##prefix}` | Remove the longest matching prefix |
| `${name%suffix}` | Remove the shortest matching suffix |
| `${name%%suffix}` | Remove the longest matching suffix |
| `${name/old/new}` | Replace the first match |
| `${name//old/new}` | Replace all matches |

Examples:

```bash
set -u
target=${1:?usage: script.sh <path>}
backup=${BACKUP_DIR:-$HOME/backups}
name='report-2026-01.txt'
printf 'name=%s\n' "$name"
printf 'base=%s\n' "${name%.txt}"
printf 'stem=%s\n' "${name%-*}"
printf 'length=%d\n' "${#name}"
```

`${1:?message}` is a compact way to require an argument. The script exits with an error if the value is missing. `${name%.txt}` removes the suffix. `${name%-*}` removes the shortest match from the end.

Use `set -u` while developing. It turns an unset variable into an error instead of an empty string. That catches typos, but it can also break scripts that intentionally test for an unset value.

## Arrays

An array holds multiple values. Use it when a list has spaces or when you need to preserve each item as one argument.

```bash
files=("one.txt" "two words.txt" "three.txt")
printf 'count=%d\n' "${#files[@]}"
printf '%s\n' "${files[@]}"

for file in "${files[@]}"; do
    printf 'file: %s\n' "$file"
done
```

`${files[@]}` expands to separate words. `"${files[@]}"` preserves each element as one argument. `${#files[@]}` is the number of elements. `${!files[@]}` lists the indexes.

Associative arrays use string keys:

```bash
declare -A sizes
sizes[small]=10
sizes[large]=100
printf 'large=%s\n' "${sizes[large]}"
for key in "${!sizes[@]}"; do
    printf '%s=%s\n' "$key" "${sizes[$key]}"
done
```

Associative arrays require Bash 4 or newer. If a script must run under `/bin/sh`, do not use them.

Read a file into an array safely:

```bash
mapfile -t lines < file.txt
printf '%s\n' "${lines[@]}"
```

`mapfile` preserves lines and avoids word splitting. Use `readarray` as an alias in Bash.

## Case statements and menus

A `case` statement is clearer than a long `if` chain when matching a small set of values.

```bash
action=${1:-status}
case $action in
    start)
        printf 'starting\n'
        ;;
    stop)
        printf 'stopping\n'
        ;;
    status|check)
        printf 'checking\n'
        ;;
    *)
        printf 'usage: %s {start|stop|status}\n' "$0" >&2
        exit 2
        ;;
esac
```

The `|` separates alternatives. The `*` pattern is the default. Quote the variable in the `case` word only when you want to prevent pattern interpretation. In a `case` pattern, unquoted variables are treated as patterns, which is usually not what you want.

A simple menu uses `select`:

```bash
PS3='Choose an action: '
select action in status start stop quit; do
    case $action in
        quit) break ;;
        *) printf 'selected: %s\n' "$action" ;;
    esac
done
```

`select` is interactive and not suitable for unattended scripts. It is useful for small lab tools.

## Here documents and generated configuration

A here document feeds a block of text to a command.

```bash
cat > config.ini <<'EOF'
[server]
host = 127.0.0.1
port = 8080
EOF
```

The quoted delimiter prevents variable expansion. Remove the quotes when you want expansion:

```bash
host=127.0.0.1
port=8080
cat > config.ini <<EOF
[server]
host = $host
port = $port
EOF
```

Be careful when generating configuration from untrusted values. A value containing a newline can inject an extra directive. Validate input or use a tool that escapes values correctly.

A here string passes one line:

```bash
grep -q root <<< 'root:x:0:0:root:/root:/bin/bash'
```

## Process substitution and file descriptors

Process substitution presents a command's output as a file-like path.

```bash
diff -u <(sort a.txt) <(sort b.txt)
while IFS= read -r line; do
    printf 'line: %s\n' "$line"
done < <(grep -v '^#' /etc/services)
```

The second example uses input redirection from a process substitution. It keeps the loop in the current shell. A pipeline would run the loop in a subshell in some shells, so variables set inside would be lost.

File descriptors can be assigned and reused:

```bash
exec 3> output.log
printf 'hello\n' >&3
exec 3>&-
```

`exec 3>` opens descriptor 3 for writing. `>&3` writes to it. `exec 3>&-` closes it. This is advanced shell work. Use it when a script needs several output streams, not as a default pattern.

## Parse options with getopts

`getopts` handles short options in a portable way.

```bash
#!/usr/bin/env bash
set -euo pipefail

verbose=0
output=''

while getopts ':vo:h' opt; do
    case $opt in
        v) verbose=1 ;;
        o) output=$OPTARG ;;
        h)
            printf 'usage: %s [-v] [-o file] path\n' "$0"
            exit 0
            ;;
        :)
            printf 'missing argument for -%s\n' "$OPTARG" >&2
            exit 2
            ;;
        \?)
            printf 'unknown option: -%s\n' "$OPTARG" >&2
            exit 2
            ;;
    esac
done
shift $((OPTIND - 1))

printf 'verbose=%d output=%s remaining=%s\n' "$verbose" "$output" "$*"
```

The leading `:` in `':vo:h'` enables silent error handling so the script can print its own messages. `OPTARG` holds the option argument. `OPTIND` is the index of the first non-option argument. `shift` removes the parsed options.

For long options, Bash has no built-in parser. Use a small manual loop or a portable argument parser. Do not pretend `getopts` handles `--long` options.

## Debugging and testing

Print commands as they run:

```bash
bash -x script.sh
bash -n script.sh
```

`-x` traces expansions and commands. `-n` checks syntax without running the script. Both are fast and should be part of your routine.

Inside a script, enable tracing around a suspect block:

```bash
set -x
dangerous_function
set +x
```

`trap` can report where a script failed:

```bash
trap 'printf "failed at line %s\n" "$LINENO" >&2' ERR
```

Use `shellcheck` for static analysis:

```bash
shellcheck script.sh
```

ShellCheck catches quoting mistakes, unused variables, incorrect tests and many portability problems. Fix warnings rather than suppressing them. If a warning is intentional, add a comment explaining why.

A minimal test harness can run a script in a temporary directory:

```bash
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

cd "$tmpdir"
printf 'alpha\nbeta\n' > input.txt
result=$(grep -c alpha input.txt)
[ "$result" -eq 1 ] || {
    printf 'expected 1 match, got %s\n' "$result" >&2
    exit 1
}
```

This is not a full test framework, but it catches regressions and documents expected behavior.

## Portability and scheduling

Bash is not POSIX shell. Features such as arrays, `[[ ]]`, process substitution and `local` are extensions. If a script starts with `#!/bin/sh`, test it with `dash` or another POSIX shell.

```bash
#!/bin/sh
set -eu
```

For maximum portability, avoid Bash-only syntax, use `[ ]` carefully and quote every expansion. For complex scripts, choose Bash deliberately and document the requirement.

Scripts that must run on a schedule belong in cron or a systemd timer.

```bash
crontab -e
crontab -l
```

A cron entry has five time fields followed by the command:

```text
15 2 * * * /usr/local/bin/nightly-report.sh >> /var/log/nightly-report.log 2>&1
```

Cron uses a minimal environment. Use absolute paths, set `PATH` explicitly and redirect output. Test the exact command as the same user before trusting the schedule.

## Lab: write a system report

Create `report.sh` that prints:

- The hostname.
- The kernel version.
- The current user.
- The root filesystem usage.
- The number of listening TCP sockets.

Requirements:

1. Use `set -euo pipefail`.
2. Put the work in a `main` function.
3. Quote every variable expansion.
4. Exit with status 2 if an unexpected argument is supplied.
5. Run `shellcheck` if it is installed.

## Common mistakes

- Omitting quotes around variables.
- Using `[ $var = value ]` when `$var` can be empty.
- Parsing `ls` output instead of using globs or `find`.
- Ignoring command failures.
- Using `cd` without checking that it succeeded.

## Checkpoint

You should now be able to:

- Write a script with a shebang and strict mode.
- Quote variables and forward arguments safely.
- Use tests, conditionals, loops and functions.
- Handle expected failures and clean up with a trap.
- Read and adapt a small automation script.

Next you will use logs and troubleshooting habits to keep a system healthy.
