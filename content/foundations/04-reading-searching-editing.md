# Reading, Searching and Editing Files

Most Linux work is text work. Configuration lives in text files, logs are text streams, command output is text and scripts are text. Learn to read, filter and edit text efficiently and the rest of the system becomes easier to inspect.

## Read a file without flooding the terminal

```bash
cat /etc/hostname
less /etc/services
head -n 20 /var/log/syslog
tail -n 20 /var/log/syslog
```

`cat` prints the whole file. It is fine for short files and terrible for long ones. `less` opens a pager with search and scrolling. Use `/pattern` to search, `n` for the next match, `g` for the top, `G` for the bottom and `q` to quit.

`head` and `tail` show the beginning and end of a file. `tail -f` follows a file as it grows, which is useful for live logs:

```bash
tail -f /var/log/auth.log
```

Press `Ctrl+C` to stop following.

## Count and number lines

```bash
wc -l /etc/passwd
wc -w /etc/passwd
wc -c /etc/passwd
nl -ba /etc/hostname
```

`wc -l` counts newline characters, not logical lines. A file without a final newline can report one fewer line than you expect. `nl` numbers lines, which is useful when discussing a specific part of a file.

## Search with grep

`grep` prints lines that match a pattern.

```bash
grep root /etc/passwd
grep -i error /var/log/syslog
grep -n 'Failed password' /var/log/auth.log
grep -r 'PermitRootLogin' /etc/ssh
grep -v '^#' /etc/ssh/sshd_config
```

Common options:

| Option | Meaning |
| --- | --- |
| `-i` | Ignore case |
| `-n` | Show line numbers |
| `-r` | Recurse into directories |
| `-v` | Invert the match |
| `-w` | Match whole words |
| `-F` | Treat the pattern as fixed text |
| `-E` | Use extended regular expressions |
| `-l` | Print only matching filenames |
| `-c` | Print a match count |

Basic regular expressions include `.` for any character, `*` for zero or more of the previous character, `^` for the start of a line, `$` for the end of a line and `[abc]` for a character class.

```bash
grep -nE '^(root|daemon):' /etc/passwd
grep -nE 'Failed|Invalid' /var/log/auth.log
```

`rg` from ripgrep is a faster recursive search tool when it is installed. It respects `.gitignore` by default, which is helpful in code directories but can hide files when you are investigating a system.

## Pipes turn small tools into one workflow

A pipe sends the output of one command into the input of another. This is the core of the Unix style: small programs, connected well.

```bash
ps -ef | grep ssh
grep -v '^#' /etc/services | head
cat /var/log/syslog | wc -l
```

The third example is a useless use of `cat`. `wc -l /var/log/syslog` does the same work with one process. Use `cat` when you need to concatenate files or when a command only reads from standard input, not as a reflex.

A more useful pipeline:

```bash
grep 'Failed password' /var/log/auth.log \
  | awk '{print $(NF-3)}' \
  | sort \
  | uniq -c \
  | sort -nr \
  | head
```

This counts failed login attempts by source address. Read it from left to right: find lines, extract a field, sort, count duplicates, sort by count and show the top results. Do not worry about the exact field position yet. The point is that each stage does one job.

## Redirection and tee

```bash
command > output.txt
command >> output.txt
command 2> errors.txt
command > output.txt 2>&1
command | tee output.txt
command | tee -a output.txt
```

`>` replaces a file. `>>` appends. `2>` redirects standard error. `2>&1` sends error to the same destination as normal output. `tee` writes to both the terminal and a file, which is useful when you want to watch a process and keep a record.

```bash
ping -c 4 127.0.0.1 | tee ping.txt
```

## Text processing basics

You will not become an awk expert in one page, but you should recognize the common tools.

```bash
cut -d: -f1 /etc/passwd
sort /etc/passwd
sort -u /etc/passwd
uniq -c sorted.txt
tr '[:lower:]' '[:upper:]' < /etc/hostname
sed -n '1,10p' /etc/passwd
sed 's/old/new/g' file.txt
awk -F: '{print $1, $3}' /etc/passwd
```

| Tool | Use |
| --- | --- |
| `cut` | Select fields or characters |
| `sort` | Sort lines |
| `uniq` | Collapse adjacent duplicates |
| `tr` | Translate or delete characters |
| `sed` | Stream editing and substitution |
| `awk` | Field-based processing and reporting |

`uniq` only collapses adjacent duplicates, so sort first if you want a true unique list.

## Edit files with nano

`nano` is a small, friendly editor. It is a good default when you need to make a quick change.

```bash
nano notes.txt
```

The bottom of the screen shows the shortcuts. `Ctrl+O` writes the file, `Enter` confirms the filename, `Ctrl+X` exits, `Ctrl+K` cuts a line and `Ctrl+U` pastes it. `Ctrl+W` searches.

Before editing a system file, make a backup:

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo nano /etc/ssh/sshd_config
```

Then validate the change before restarting a service. A broken configuration file can lock you out of a remote system.

## Edit files with vim

`vim` is everywhere, including minimal systems where nano is not installed. You do not need to master it, but you should be able to open, edit, save and quit.

```bash
vim notes.txt
vimtutor
```

`vimtutor` opens a guided lesson. Run it once and work through the whole file. It is faster than memorizing a wall of shortcuts.

Vim has modes. Normal mode is for navigation and commands. Insert mode is for typing. Visual mode selects text. Command-line mode starts with `:`.

| Mode | How to enter | Use |
| --- | --- | --- |
| Normal | `Esc` | Move, delete, copy and run commands |
| Insert | `i`, `a`, `o` | Type text |
| Visual | `v`, `V`, `Ctrl+v` | Select characters, lines or blocks |
| Command line | `:` | Save, quit, search and replace |

Move around in normal mode:

| Key | Action |
| --- | --- |
| `h`, `j`, `k`, `l` | Left, down, up, right |
| `w`, `b`, `e` | Next word, previous word, end of word |
| `0`, `^`, `$` | Start of line, first non-blank, end of line |
| `gg`, `G` | Start of file, end of file |
| `:42` | Go to line 42 |
| `Ctrl+d`, `Ctrl+u` | Half page down, half page up |
| `Ctrl+f`, `Ctrl+b` | Page down, page up |
| `%` | Jump to the matching bracket |

Edit text:

| Key | Action |
| --- | --- |
| `i`, `I` | Insert before the cursor, at the start of the line |
| `a`, `A` | Append after the cursor, at the end of the line |
| `o`, `O` | Open a new line below, above |
| `x`, `X` | Delete a character, delete the character before the cursor |
| `dw`, `dd`, `D` | Delete a word, a line, to the end of the line |
| `d0`, `d$` | Delete to the start, end of the line |
| `yy`, `yw` | Yank a line, a word |
| `p`, `P` | Paste after, before |
| `u`, `Ctrl+r` | Undo, redo |
| `r`, `cc`, `C` | Replace a character, change a line, change to the end |
| `>>`, `<<` | Indent, outdent |
| `.` | Repeat the last change |

Search, replace and manage files:

| Key | Action |
| --- | --- |
| `/pattern`, `?pattern` | Search forward, backward |
| `n`, `N` | Next match, previous match |
| `*` | Search for the word under the cursor |
| `:%s/old/new/g` | Replace every match in the file |
| `:s/old/new/g` | Replace every match on the current line |
| `:%s/old/new/gc` | Replace with confirmation |
| `:noh` | Clear search highlighting |
| `:w`, `:q`, `:wq`, `:q!` | Save, quit, save and quit, quit without saving |
| `:e file` | Open another file |
| `:split file`, `:vsplit file` | Split horizontally, vertically |
| `Ctrl+w w` | Switch between splits |
| `:ls`, `:bn`, `:bp` | List buffers, next buffer, previous buffer |

Visual mode and macros:

```text
v       select characters
V       select lines
Ctrl+v  select a block
y d > < yank, delete, indent, outdent
qa      start recording a macro into register a
q       stop recording
@a      run macro a
@@      repeat the last macro
```

Useful settings for reading and editing configuration:

```text
:set number
:set relativenumber
:set paste
:set nohlsearch
```

Use `sudoedit` for system files. It runs your editor with your normal environment and writes the result through sudo, which avoids leaving root-owned swap or configuration files behind:

```bash
sudoedit /etc/ssh/sshd_config
```

If you get lost, press `Esc` a few times, then type `:q!` to leave without saving.

## Regular expressions in practice

A regular expression describes a pattern. `grep`, `sed`, `awk`, `find` and many editors use some version of them. The basics are consistent, but the exact syntax depends on the tool.

| Pattern | Matches |
| --- | --- |
| `.` | Any single character except a newline |
| `^` | Start of a line |
| `$` | End of a line |
| `*` | Zero or more of the previous item |
| `+` | One or more of the previous item, in extended mode |
| `?` | Zero or one of the previous item, in extended mode |
| `[abc]` | One character from the set |
| `[^abc]` | One character not in the set |
| `[a-z]` | One character in the range |
| `[[:digit:]]` | One digit, in a POSIX character class |
| `[[:alpha:]]` | One letter |
| `[[:space:]]` | One whitespace character |
| `(...)` | Group, in extended mode |
| `a|b` | Either expression, in extended mode |
| `\b` | Word boundary in many implementations |

Use single quotes around patterns so the shell does not expand them. Use `grep -E` for extended regular expressions, or `grep -P` for Perl-compatible expressions when available.

```bash
grep -nE '^(root|daemon):' /etc/passwd
grep -nE 'Failed|Invalid' /var/log/auth.log
grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' /var/log/auth.log | sort -u
grep -vE '^\s*(#|$)' /etc/ssh/sshd_config
```

The last command removes comment lines and blank lines. `[0-9]{1,3}` repeats a digit class. The escaped dot matches a literal dot rather than any character.

`grep -o` prints only the matching part. That is useful for extracting addresses, usernames or identifiers. `grep -c` counts matching lines, not matches. `grep -l` prints filenames. `grep -L` prints files without a match.

Search a code tree while excluding unrelated directories:

```bash
grep -rn --include='*.conf' --exclude-dir='.git' 'Listen' /etc /opt 2>/dev/null
```

The `2>/dev/null` hides permission errors. Do not hide all errors on a system you are troubleshooting until you have seen them once.

## Stream editing with sed

`sed` reads input, applies commands and writes output. By default it prints every line.

```bash
sed -n '1,10p' /etc/passwd
sed -n '/^root/p' /etc/passwd
sed 's/:/\t/g' /etc/passwd | head
sed -E 's/^(root|daemon):[^:]*/\1:REDACTED/' /etc/passwd
```

`-n` suppresses automatic printing. The `p` command prints selected lines. `s/old/new/` substitutes the first match on each line. Add `g` to replace every match.

Addresses select lines:

```bash
sed -n '5,12p' file.txt
sed -n '/start/,/end/p' file.txt
sed '/^#/d' file.txt
```

`5,12p` selects a line range. `/start/,/end/p` selects from one pattern to another. `d` deletes matching lines from the output.

Edit a file in place, keeping a backup:

```bash
sed -i.bak 's/old-value/new-value/g' config.txt
```

Always inspect the result:

```bash
diff -u config.txt.bak config.txt
```

`sed` is not a full programming language, but it is excellent for predictable line-oriented edits. For complex parsing, use `awk`, Python or a real configuration tool.

## Field processing with awk

`awk` treats each line as a record and each record as fields. It is ideal for reports and quick extraction.

```bash
awk -F: '{print $1, $3}' /etc/passwd
awk -F: '$3 >= 1000 {print $1, $3, $7}' /etc/passwd
awk -F: 'BEGIN {print "user uid"} {print $1, $3} END {print "done"}' /etc/passwd
awk '{print NR, $0}' file.txt
awk '{print NF, $NF}' file.txt
```

| Variable | Meaning |
| --- | --- |
| `$0` | The whole record |
| `$1`, `$2` | Fields |
| `$NF` | The last field |
| `NF` | Number of fields |
| `NR` | Current record number across all input |
| `FNR` | Record number in the current file |
| `FS` | Input field separator |
| `OFS` | Output field separator |

`-F:` sets the field separator to a colon. A pattern before the action filters records. `BEGIN` runs before input. `END` runs after input.

A more realistic report:

```bash
awk -F: '$3 >= 1000 && $3 < 65534 {
    printf "%-18s %6s %s\n", $1, $3, $7
}' /etc/passwd | sort
```

Use `printf` when alignment matters. Use `sort -k` to sort by a specific field:

```bash
awk -F: '{print $1, $3}' /etc/passwd | sort -k2,2n
```

## Compare and combine files

```bash
diff -u old.txt new.txt
diff -r dir1 dir2
patch -p1 < change.patch
comm -12 <(sort a.txt) <(sort b.txt)
join -t: -1 1 -2 1 sorted-a.txt sorted-b.txt
paste -d, a.txt b.txt
column -t -s: /etc/passwd
```

`diff -u` produces a unified diff that `patch` can apply. `comm` compares two sorted files. `join` combines lines with a common key. `paste` places files side by side. `column -t` aligns columns for reading.

The `<(...)` syntax is process substitution. The shell runs the command and provides its output as a temporary file-like object. It is a Bash feature, not portable to every shell.

## Structured text and encodings

JSON and YAML are common in configuration and APIs.

```bash
python3 -m json.tool data.json
jq . data.json
jq -r '.items[] | .name' data.json
yq '.services.web.image' compose.yml
```

`jq` is a full JSON query language. Start with `.` to pretty-print, then select fields. `yq` is similar for YAML. If these tools are missing, Python is a reliable fallback for JSON.

Check a file's type before opening it in a text editor:

```bash
file mystery.dat
file -i mystery.dat
strings -n 6 mystery.dat | head
xxd -l 128 mystery.dat
```

`file` inspects magic bytes. `file -i` reports the MIME type and charset. `strings` extracts printable runs from a binary. `xxd` shows a hex dump.

Convert text encodings with `iconv`:

```bash
iconv -f ISO-8859-1 -t UTF-8 old.txt > new.txt
```

If a file contains invalid bytes, `iconv` stops. Use `-c` to drop invalid characters, but only after you understand what is being lost.

Base64 is an encoding, not encryption:

```bash
base64 file.bin > file.b64
base64 -d file.b64 > file.bin
```

## Lab: build a small report

```bash
mkdir -p ~/linux-foundations/lab04
cd ~/linux-foundations/lab04
cp /etc/passwd users.txt
grep -v '^#' users.txt | cut -d: -f1,3,7 > report.txt
sort report.txt -o report.txt
head -n 5 report.txt
wc -l report.txt
```

Then answer:

1. How many user entries are in the report?
2. Which shells appear in the last field?
3. Which account has UID 0?
4. What happens if you run `grep -v '^#' users.txt > users.txt`? Do not run it on an important file. Explain the risk.

## Common mistakes

- Editing a file in place with a redirection that points to the same file.
- Restarting a service before validating its configuration.
- Using `cat` on a multi-gigabyte log.
- Forgetting that `grep` patterns are regular expressions unless you use `-F`.
- Running `uniq` without sorting first.

## Checkpoint

You should now be able to:

- Read short and long files with the right tool.
- Search logs and configuration with `grep`.
- Build a multi-stage pipeline.
- Redirect output and keep a copy with `tee`.
- Make a safe edit with nano or vim.

Next you will learn how Linux decides who can read, write and execute those files.
