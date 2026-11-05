# Files, Directories and the Filesystem

The Linux filesystem is a single tree. Disks, partitions and network shares are attached to that tree at mount points. Once you understand paths, file types and links, most navigation and file management becomes predictable.

## Absolute and relative paths

An absolute path starts at `/` and does not depend on your current directory:

```text
/etc/ssh/sshd_config
```

A relative path starts from your current directory:

```text
ssh/sshd_config
```

The special path components are:

| Symbol | Meaning |
| --- | --- |
| `.` | Current directory |
| `..` | Parent directory |
| `~` | Your home directory |
| `~user` | Another user's home directory |
| `/` | Filesystem root |

```bash
pwd
cd /var/log
pwd
cd ..
pwd
cd ~
pwd
```

`cd -` returns to the previous directory. That is useful when you are moving between two locations.

## List and inspect files

```bash
ls
ls -l
ls -la
ls -lh
ls -R
```

`-l` gives a long listing, `-a` includes hidden entries, `-h` makes sizes human readable, and `-R` recurses into directories. On a long listing, the first character tells you the file type:

| Character | Type |
| --- | --- |
| `-` | Regular file |
| `d` | Directory |
| `l` | Symbolic link |
| `c` | Character device |
| `b` | Block device |
| `s` | Socket |
| `p` | Named pipe |

`file` identifies content by inspecting its header, and `stat` shows metadata such as inode, size, permissions and timestamps:

```bash
file /etc/passwd
file /bin/ls
stat /etc/passwd
```

The inode is the filesystem's internal record for a file. A filename is a directory entry that points to an inode. This distinction matters when you study hard links.

## Create, copy, move and remove

```bash
mkdir -p ~/linux-foundations/lab02/notes
cd ~/linux-foundations/lab02
touch notes/empty.txt
printf 'first line\n' > notes/first.txt
cp notes/first.txt notes/copy.txt
mv notes/copy.txt notes/renamed.txt
ls -la notes
rm notes/renamed.txt
rmdir notes/empty-dir
```

Use `mkdir -p` to create a path and any missing parents. Use `cp -r` for directories, `cp -a` to preserve attributes, and `mv` to rename or move. `rm` deletes files. There is no recycle bin on the command line, so check the path before pressing Enter.

A safe pattern is to list the target before deleting it:

```bash
ls -la /tmp/example
rm -r /tmp/example
```

For interactive confirmation, use `rm -i`. For directories, `rm -r` removes contents recursively. `rmdir` only removes empty directories.

## Globbing

The shell expands wildcard patterns before the command runs:

| Pattern | Matches |
| --- | --- |
| `*` | Any number of characters |
| `?` | Exactly one character |
| `[abc]` | One character from the set |
| `[a-z]` | One character in the range |
| `[!abc]` | One character not in the set |

```bash
ls /etc/*.conf
ls /etc/[a-c]*.conf
printf '%s\n' /etc/*.d
```

Quote a glob when you want the command to receive the literal pattern:

```bash
printf '%s\n' '*.conf'
```

Globs are expanded by the shell, not by `ls` or `grep`. That is why an unmatched pattern can pass through unchanged.

## Hard links and symbolic links

A hard link is another directory entry for the same inode. Both names refer to the same file data. Deleting one name does not delete the data until the last hard link is gone.

A symbolic link, or symlink, is a small file that contains a path to another file. If the target is removed, the symlink remains but becomes broken.

```bash
printf 'shared data\n' > original.txt
ln original.txt hardlink.txt
ln -s original.txt symlink.txt
ls -li
stat original.txt hardlink.txt symlink.txt
```

Hard links cannot cross filesystems and usually cannot point to directories. Symlinks can cross filesystems and can point to directories, but they depend on the target path.

## Find files

`find` walks a directory tree and evaluates expressions. It is more precise than a recursive `ls`.

```bash
find /etc -maxdepth 1 -type f -name '*.conf'
find /var/log -type f -size +1M
find ~/linux-foundations -type d -name 'notes'
find /tmp -type f -mtime -1
find . -name '*.txt' -print
```

Common tests:

| Test | Meaning |
| --- | --- |
| `-type f` | Regular file |
| `-type d` | Directory |
| `-type l` | Symbolic link |
| `-name` | Match the filename |
| `-iname` | Case-insensitive name match |
| `-size` | Match size, such as `+1M` |
| `-mtime` | Match modification time in days |
| `-user` | Match owner |
| `-perm` | Match permission bits |

You can act on results with `-exec`:

```bash
find /tmp -maxdepth 1 -type f -name '*.log' -exec ls -lh {} \;
```

The `{}` placeholder is replaced by each path. The escaped semicolon ends the command. Use `-delete` only after testing the same expression with `-print`.

## Work with spaces and odd names

Filenames can contain spaces, quotes and leading hyphens. Quote paths and use `--` to end option parsing:

```bash
mkdir -p "$HOME/linux-foundations/odd names"
cd "$HOME/linux-foundations/odd names"
touch -- '-leading-dash.txt'
ls -la
rm -- '-leading-dash.txt'
```

For scripts that process arbitrary filenames, use null-delimited tools:

```bash
find . -maxdepth 1 -type f -print0 | while IFS= read -r -d '' file; do
    printf 'file: %s\n' "$file"
done
```

This avoids breaking on spaces and newlines.

## Filesystems and mount points

A directory tree can contain several filesystems. Each filesystem has its own rules, features and free space. The root directory `/` is not special in the way Windows drive letters are. It is simply the top of one mounted filesystem, and other filesystems are attached below it.

Common Linux filesystems include:

| Filesystem | Strengths | Notes |
| --- | --- | --- |
| ext4 | Mature, fast, widely supported | Good default for general use |
| XFS | Large files and parallel I/O | Common on Red Hat family systems |
| Btrfs | Snapshots, subvolumes, checksums | More complex to operate |
| ZFS | Snapshots, checksums, pooling | Usually installed separately |
| tmpfs | Memory backed, fast, temporary | Lost at reboot |
| NFS | Shared over the network | Depends on network and server |
| FAT32, exFAT | Interoperability with other systems | Limited permissions and metadata |

Inspect what is mounted and how much space is free:

```bash
findmnt
df -h
df -i
lsblk -f
```

`df -h` reports filesystem usage in human-readable units. `df -i` reports inode usage. A filesystem can have free space and still be unable to create files if it has run out of inodes.

`lsblk -f` shows block devices, their filesystems, labels and mount points. It is a quick way to see which disk backs which directory.

## Measure directory usage

`du` reports how much space a directory tree consumes.

```bash
du -sh /var/log
du -h --max-depth=1 /var | sort -h
du -ah ~/linux-foundations | sort -h | tail -n 20
```

`-s` summarizes instead of listing every file. `-h` makes sizes readable. `--max-depth=1` limits the walk. Sorting by size turns the output into a useful report.

`du` and `df` can disagree. `du` walks visible files. `df` asks the filesystem. A deleted file that is still open continues to consume space until the last process closes it. Find those files with:

```bash
lsof +L1
```

## Archives and compression

An archive combines many files into one. Compression reduces size. Linux treats them as separate steps, although many tools combine them.

```bash
tar -cvf archive.tar notes/
tar -tf archive.tar
tar -xvf archive.tar
tar -czvf archive.tar.gz notes/
tar -xzvf archive.tar.gz
tar -cJvf archive.tar.xz notes/
tar -xJvf archive.tar.xz
```

The common flags are:

| Flag | Meaning |
| --- | --- |
| `-c` | Create an archive |
| `-x` | Extract an archive |
| `-t` | List contents |
| `-v` | Verbose output |
| `-f` | Use the next argument as the archive file |
| `-z` | Compress with gzip |
| `-j` | Compress with bzip2 |
| `-J` | Compress with xz |

Always list an archive before extracting it, especially if it came from someone else. `tar -tf` does not write files. Extraction can overwrite existing files, so extract into an empty directory first when you are unsure.

Single-file compression tools are also common:

```bash
gzip file.txt
gunzip file.txt.gz
xz file.txt
unxz file.txt.xz
zip archive.zip file.txt
unzip -l archive.zip
unzip archive.zip
```

`gzip` and `xz` replace the original file by default. Use `-k` to keep it. `zip` and `unzip` are common for interoperability, but they store Unix permissions and ownership differently from `tar`.

## Copy trees and make backups

`cp -a` preserves permissions, timestamps and links. `rsync` is better for repeated copies because it transfers only changes.

```bash
cp -a notes notes-backup
rsync -av --delete notes/ notes-backup/
rsync -av --dry-run notes/ remote:/backup/notes/
rsync -av notes/ remote:/backup/notes/
```

The trailing slash matters. `notes/` means the contents of the directory. `notes` means the directory itself. A dry run shows what would change without writing anything. Review it before using `--delete`.

`rsync` is not a backup by itself. A backup needs a separate copy, a retention plan and a tested restore. A mirror that deletes files when the source deletes them is a synchronization tool, not a historical archive.

## Metadata, attributes and extended attributes

`stat` shows more than `ls -l`:

```bash
stat notes/first.txt
stat -c '%n %s bytes %U:%G %a %y' notes/first.txt
```

The format string is useful in scripts. `%n` is the name, `%s` the size, `%U` the owner, `%G` the group, `%a` the octal mode and `%y` the modification time.

Some filesystems support extended attributes:

```bash
setfattr -n user.comment -v 'lab notes' notes/first.txt
getfattr -d notes/first.txt
```

Extended attributes store small pieces of metadata. They are used by ACLs, SELinux labels and some backup tools. Not every filesystem or mount option supports them.

File attributes are a separate mechanism:

```bash
lsattr notes/first.txt
sudo chattr +i notes/first.txt
sudo chattr -i notes/first.txt
```

The immutable attribute, `+i`, prevents modification, deletion and renaming even for root until the attribute is removed. Use it deliberately. It can protect a critical file, and it can also confuse you when a normal edit fails.

## Locate files quickly

`find` is precise but walks the tree every time. `locate` uses a prebuilt database and is much faster, but the database may be stale.

```bash
sudo updatedb
locate sshd_config
locate -i readme
```

`tree` prints a directory as a tree when it is installed:

```bash
tree -L 2 ~/linux-foundations
tree -a -L 1 /etc
```

If `tree` is missing, `find` can approximate it:

```bash
find ~/linux-foundations -maxdepth 3 -print
```

## Safe deletion and recovery

The command line has no recycle bin. Before a recursive delete, print the target and confirm the path:

```bash
target=~/linux-foundations/lab02/archive
printf 'target: %s\n' "$target"
find "$target" -maxdepth 2 -print
rm -r -- "$target"
```

Use `--` before a path that might begin with a hyphen. Never build a destructive command from an unvalidated variable. A empty variable in `rm -rf "$dir"/*` is safer than in `rm -rf $dir/*`, but both deserve a check.

If you delete a file by accident, stop writing to that filesystem. Recovery chances drop as new data overwrites the blocks. Restore from a backup or snapshot when possible. Tools such as `testdisk` and `photorec` can help, but they are not a substitute for backups.

## Batch commands with xargs

Some commands do not accept a long list of files on the command line. `xargs` reads items from standard input and runs a command with them.

```bash
printf '%s\n' a.txt b.txt c.txt | xargs -n 1 printf 'file: %s\n'
find /var/log -maxdepth 1 -type f -name '*.log' -print0 | xargs -0 -n 1 ls -lh
find /tmp -maxdepth 1 -type f -name '*.tmp' -print0 | xargs -0 -r rm --
```

`-n 1` passes one item per command. `-0` expects null-separated input, which is the safe form for arbitrary filenames. `-r` avoids running the command when the input is empty. The `--` before `rm` ends option parsing.

Without `-0`, filenames with spaces or quotes can be split incorrectly. A filename could even be interpreted as an option. Use `find -print0 | xargs -0` or a `while read` loop.

`xargs -P` runs commands in parallel:

```bash
find ~/linux-foundations -type f -name '*.txt' -print0 \
  | xargs -0 -n 1 -P 4 gzip
```

Parallel jobs are faster on large batches but harder to read and debug. Start with one job, confirm the command is correct, then increase parallelism.

## Lab: map a small tree

```bash
mkdir -p ~/linux-foundations/lab02/{docs,logs,archive}
cd ~/linux-foundations/lab02
printf 'alpha\n' > docs/a.txt
printf 'beta\n' > docs/b.txt
printf 'gamma\n' > logs/c.log
ln -s ../docs/a.txt logs/a-link.txt
find . -maxdepth 3 -printf '%y %p -> %l\n'
```

Then:

1. Copy `docs/a.txt` to `archive/a-copy.txt`.
2. Rename `docs/b.txt` to `docs/b-renamed.txt`.
3. Create a hard link to `archive/a-copy.txt`.
4. Use `stat` to compare the inode numbers.
5. Remove the original `docs/a.txt` and check whether the hard link still works.
6. Check whether the symlink in `logs` is now broken.

## Common mistakes

- Using `rm -rf` with a path you have not listed first.
- Forgetting that `cp` on a directory needs `-r`.
- Assuming a symlink is a copy. It is a pointer.
- Running `find /` without narrowing the search.
- Forgetting to quote paths that contain spaces.

## Checkpoint

You should now be able to:

- Explain absolute and relative paths.
- Read a long listing and identify file types.
- Create, copy, move, link and remove files safely.
- Use globs and `find` to locate files.
- Explain the difference between hard links and symbolic links.

Next you will read, search and edit file contents.
