# Linux Mental Model

Linux is not a single program. It is a family of operating systems built around the same kernel, the same core utilities and a shared way of thinking about files, users and processes. Before you memorize commands, build a model of how the pieces fit together. Every later chapter, from permissions to containers, depends on this model.

## The four layers

Think of a Linux system as four layers:

1. **Hardware.** CPU, memory, disks, network cards and peripherals.
2. **Kernel.** The privileged core that schedules processes, manages memory, talks to hardware and enforces access control.
3. **User space.** Programs, libraries, services and the filesystem tree.
4. **Shell.** A command interpreter that lets you launch programs, connect them together and automate work.

The kernel is the only layer that runs with full hardware privilege. User programs ask the kernel for services through system calls. When you run `ls`, the shell finds the program, the kernel starts it, and the program asks the kernel to read a directory and write the result to your terminal.

## The component stack in more detail

The four layers are easier to remember when you place the supporting pieces between the shell and the kernel:

```text
+------------------------------------------------------+
| User applications: editors, browsers, servers, tools |
+------------------------------------------------------+
| Shell: Bash, Zsh, Fish, Dash                         |
+------------------------------------------------------+
| System utilities: ls, grep, systemctl, ip             |
+------------------------------------------------------+
| System libraries: glibc, OpenSSL, libcurl             |
+------------------------------------------------------+
| Linux kernel: processes, memory, files, network       |
+------------------------------------------------------+
| Hardware: CPU, RAM, disks, network, peripherals       |
+------------------------------------------------------+
```

System utilities and libraries are part of user space, but they sit between your commands and the kernel. A program such as `curl` may use `libcurl`, the C library and several system calls. The shell is also an ordinary user-space program. It does not run inside the kernel, even though it feels like part of the operating system.

Device drivers are the kernel's hardware-facing code. Some are built into the kernel image, and others are loaded as modules. A driver bug can affect the whole machine because the driver runs with kernel privilege. That is one reason kernel updates and hardware compatibility matter.

## Linux and Windows: a practical comparison

Linux and Windows solve similar problems with different defaults. The useful question is not which one is universally better. It is which one fits the workload, the software, the support model and the skills of the people who will operate it.

| Area | Linux | Windows |
| --- | --- | --- |
| Licensing | Mostly open source, with commercial support available | Commercial licenses, with some free editions |
| Filesystem | One tree with mount points, usually case-sensitive | Drive letters, backslash paths, usually case-insensitive |
| Shell | Bash, Zsh, Fish and other shells with text pipelines | PowerShell and Command Prompt |
| Software | Distribution repositories, packages and source builds | Installers, Microsoft Store and `winget` |
| Updates | Per-package updates; kernel updates may require a reboot | Cumulative updates; reboots are common |
| Permissions | Owner, group, mode bits, root and capabilities | ACLs, Administrator accounts and UAC |
| Desktop | Many distributions and desktop environments | Broad commercial hardware and application support |
| Servers | Common for web, cloud and container platforms | Common in Microsoft-centric environments |
| Containers | Native namespaces and cgroups | Containers through WSL2 or a virtual machine |
| Automation | Shell scripts, systemd, Ansible and other tools | PowerShell, Task Scheduler and Group Policy |

Linux is not automatically more secure. It has malware, vulnerable services, supply chain attacks and misconfiguration. A hardened Linux server and a hardened Windows server have more in common than either has with an ignored default install. Linux is also not free in total cost: staff time, training, support contracts and migration work are real expenses.

The practical advantages of Linux are often about control and composition. You can inspect the system, replace components, automate small pieces and run the same software on a laptop, a server and a container. The practical advantages of Windows are often about commercial software, hardware support and a managed desktop experience. Learn the model behind the commands, and you can move between them without treating either system as magic.

## Distributions are packaging choices

A distribution combines the Linux kernel with a package manager, init system, libraries, installer and default tools. Common families include:

| Family | Examples | Package tools | Typical init |
| --- | --- | --- | --- |
| Debian | Debian, Ubuntu, Kali | `apt`, `dpkg` | systemd |
| Red Hat | Fedora, RHEL, Rocky | `dnf`, `rpm` | systemd |
| Arch | Arch, EndeavourOS | `pacman` | systemd |
| SUSE | openSUSE | `zypper`, `rpm` | systemd |
| Alpine | Alpine | `apk` | OpenRC |

The commands in this guide focus on Debian and Ubuntu because they are common in labs, but the concepts transfer. When a command differs, check your distribution's documentation.

## Everything is a file, until it is not

Linux exposes many resources through the filesystem. Regular files, directories, devices, sockets and pipes all appear as file types. This is why tools such as `cat`, `ls` and `stat` are so useful.

Some things are not ordinary files:

- Processes appear under `/proc` as a view generated by the kernel.
- Kernel settings appear under `/sys`.
- Network connections are not files you can simply edit.
- Mounted filesystems attach one tree to another at a mount point.

The phrase "everything is a file" is a useful simplification, not a law. Treat it as a hint about where to look, not a guarantee that every resource behaves like a text file.

## The filesystem hierarchy

Linux distributions follow the Filesystem Hierarchy Standard closely enough that you can move between systems with confidence.

| Path | Purpose |
| --- | --- |
| `/` | Root of the entire tree |
| `/bin`, `/usr/bin` | Essential and general user commands |
| `/sbin`, `/usr/sbin` | System administration commands |
| `/etc` | Host-specific configuration |
| `/home` | User home directories |
| `/root` | Home directory for the root account |
| `/var` | Variable data such as logs, caches and spools |
| `/tmp` | Temporary files, often cleared at boot |
| `/opt` | Optional third-party software |
| `/usr` | Programs, libraries and read-only data |
| `/dev` | Device files |
| `/proc` | Process and kernel information |
| `/sys` | Kernel and hardware interfaces |
| `/boot` | Kernel, initramfs and bootloader files |
| `/srv` | Data served by system services |
| `/run` | Runtime state created since boot |
| `/usr/local` | Locally installed software and libraries |
| `/lost+found` | Recovered files after repair on ext filesystems |
| `/mnt`, `/media` | Temporary and removable mount points |

On modern systems, `/bin`, `/sbin` and `/lib` are often symbolic links into `/usr`. That is normal. The important idea is that the tree is a single namespace: disks and partitions are attached somewhere inside it.

Some paths are conventions rather than universal rules. Ubuntu may add `/snap`, containers often have no `/boot`, and `/data` is a common mount point but not part of the standard hierarchy. When you are unsure, read the manual page for the hierarchy on systems that provide it:

```bash
man hier
ls -ld /boot /srv /run /usr/local
```

## Users, groups and ownership

Every process runs as a user and belongs to one or more groups. Every file has an owner, a group and a permission mode. The kernel checks those identities when a process tries to read, write or execute something.

The root account, UID 0, bypasses most permission checks. That is why `sudo` is powerful and why it deserves care. A normal user should do normal work. Elevate only for the specific command that needs it.

You can inspect your identity with:

```bash
id
whoami
groups
```

You will return to these details in the permissions chapter. For now, remember that access is always a relationship between a process identity and a resource.

## How a command runs

When you type a command, several things happen:

1. The shell parses the line into words, quotes, redirections and pipes.
2. It checks whether the first word is a shell builtin, a function or an external program.
3. For an external program, it searches the directories listed in `PATH`.
4. The kernel creates a new process and loads the program.
5. The program runs, writes output and returns an exit status.
6. The shell uses that status to decide what to do next.

You can see the search path and the shell you are using:

```bash
echo "$SHELL"
echo "$PATH"
type ls
command -v ls
```

`type` and `command -v` are often more informative than `which`, because they know about aliases, functions and builtins.

## Processes are the unit of execution

A process is a running program with its own memory, file descriptors and identity. Processes have a PID, a parent PID and a state. They can be running, sleeping, stopped or waiting for input.

The kernel schedules processes, enforces limits and delivers signals. A signal is a small notification that asks a process to do something, such as terminate, reload or continue. You will use signals when you manage jobs and services.

Inspect the process tree with:

```bash
ps -ef
ps aux
top
```

The first command shows a portable full listing. The second shows BSD-style resource usage. `top` updates live. Use `q` to quit.

## The shell is a programming environment

The shell is not just a place to type commands. It has variables, conditionals, loops, functions, redirection and pipelines. It can run a sequence of commands, react to failures and transform text.

That power is why shell scripting is part of this guide. It is also why quoting matters. The shell expands variables, globs and command substitutions before the program runs. If you do not control that expansion, spaces and special characters can change the meaning of a command.

A safe habit is to quote variable expansions:

```bash
name="Linux Foundations"
printf '%s\n' "$name"
```

The quotes keep the value as one argument even when it contains spaces.

## Kernel space, user space and system calls

The CPU does not treat every instruction equally. Most modern processors have at least two privilege levels. Linux uses them to separate kernel space from user space.

- **Kernel space** runs with full hardware access. It can touch memory, devices and privileged CPU instructions.
- **User space** runs ordinary programs with restricted access. A program cannot write to a disk or open a network socket by itself.

When a user-space program needs a privileged operation, it makes a system call. The CPU switches into the kernel, performs the operation, and returns a result. Common system calls include `open`, `read`, `write`, `close`, `fork`, `execve`, `socket` and `mmap`.

You can see system calls without reading kernel source:

```bash
strace -c ls /
strace -e openat ls /etc/hostname
man 2 open
```

`strace -c` summarizes the calls a program made and the time spent in each. `strace -e openat` shows file opens. `man 2 open` opens section 2 of the manual, which documents system calls rather than shell commands.

This distinction explains a lot of Linux behavior. A permission error is usually the kernel refusing a system call. A crash in a device driver can affect the whole machine because the driver runs in kernel space. A container feels isolated but still shares the host kernel, which is why kernel vulnerabilities matter.

## Shells, terminals and sessions

People often use the words terminal, console, shell and command line as if they were the same thing. They are separate layers:

| Layer | Job |
| --- | --- |
| Terminal emulator | Draws a text window and sends keystrokes, such as GNOME Terminal, Konsole, Alacritty or Windows Terminal |
| TTY | The kernel's text device or pseudo-terminal that connects a session to a program |
| Shell | Parses commands and launches programs, such as Bash, Zsh, Fish or Dash |
| Command line | The text you type and the output you receive |

A login shell is started when you log in. A non-login shell is started by a program or a terminal window. An interactive shell reads commands from a person. A non-interactive shell runs a script. Bash reads different startup files depending on those modes, which is why an alias can work in your terminal but fail in a cron job.

Inspect the current shell and session:

```bash
echo "$0"
echo "$SHELL"
ps -p $$ -o pid,ppid,tty,cmd
shopt login_shell
```

`$0` is the name used to start the current shell. `$SHELL` is your configured login shell, not necessarily the shell running this command. `$$` is the current shell's PID. `ps` shows its parent and controlling terminal. `shopt login_shell` is a Bash-specific check.

A terminal multiplexer keeps a session alive when the terminal window closes. `tmux` and `screen` are common choices. They are useful on remote servers because a dropped connection does not kill your work.

```bash
tmux new -s study
tmux attach -t study
tmux ls
```

Inside tmux, `Ctrl+B` then `D` detaches. Reattach with `tmux attach -t study`. The session continues running on the server.

## Mounts, namespaces and containers

Linux has one directory tree, but that tree can be assembled from many filesystems. A mount attaches a filesystem at a directory called a mount point.

```bash
findmnt
findmnt /
cat /proc/mounts
```

`findmnt` prints the mount tree in a readable form. `/proc/mounts` is the kernel's current view. You will see the root filesystem, pseudo filesystems such as `proc`, `sysfs` and `tmpfs`, and possibly separate mounts for `/boot`, `/home` or `/var`.

A bind mount exposes an existing directory at a second location:

```bash
sudo mkdir -p /mnt/etc-copy
sudo mount --bind /etc /mnt/etc-copy
findmnt /mnt/etc-copy
sudo umount /mnt/etc-copy
```

Bind mounts are useful for chroots, containers and recovery work. They do not copy data. Both paths point at the same underlying files.

Namespaces take isolation further. A mount namespace gives a process its own view of the mount tree. PID, network, user, IPC, UTS and cgroup namespaces isolate other resources. Containers are built from namespaces plus cgroups and a layered filesystem image. They are not tiny virtual machines. They share the host kernel.

Inspect namespaces on a running system:

```bash
lsns
ls -l /proc/$$/ns
```

`lsns` lists namespaces and their processes. `/proc/$$/ns` shows the namespaces of your shell. Comparing namespace identifiers tells you whether two processes share the same view.

## The Unix philosophy

Linux inherits a design culture from Unix. The short version is:

- Write programs that do one thing well.
- Write programs that work together.
- Use text streams as a common interface.
- Prefer composition over a single huge program.
- Make behavior predictable and scriptable.

This is why `grep`, `cut`, `sort`, `uniq`, `wc` and `sed` are small and why pipes matter. A pipeline is not a workaround. It is the intended way to solve many problems.

A graphical tool can be friendlier for a one-off task, but a command-line pipeline is easier to repeat, review and automate. Learn both. Use the graphical tool when it saves time, then learn the command that does the same job.

The philosophy has limits. Not every resource is text. Binary protocols, databases and performance data often need specialized tools. The point is to look for composable pieces before reaching for a giant monolith.

## A study method that works

Linux rewards deliberate practice. Reading commands is not enough. You need to run them, break things and recover.

A practical loop:

1. **Predict.** Before running a command, say what you expect it to do.
2. **Run.** Execute it in a lab, not on a system you cannot rebuild.
3. **Observe.** Read the output, the exit status and the logs.
4. **Explain.** Write one sentence describing what happened.
5. **Change one variable.** Try a different option or path.
6. **Break it.** Cause a safe failure and read the error.
7. **Recover.** Undo the change and confirm the system is healthy.
8. **Record.** Keep a short note with the command, the result and the lesson.

Take a virtual machine snapshot before risky work. Keep a lab notes file:

```bash
mkdir -p ~/linux-foundations/notes
printf '%s\n' '# Linux notes' >> ~/linux-foundations/notes/commands.md
```

When you learn a new command, record the manual section and one real example. Future you will thank present you.

Avoid copying long commands you do not understand. Break them into pieces. Run the pieces separately. Read the manual for every option that changes state. That habit prevents most accidents.

## Lab: read your own system

Run these commands in a lab machine or a safe Linux environment. Write down what each one tells you.

```bash
uname -a
cat /etc/os-release
echo "$SHELL"
echo "$PATH"
id
pwd
ls -la /
df -h
ps -ef | head
```

Then answer:

- Which distribution and kernel version are you running?
- Which shell starts when you open a terminal?
- Which directories are on your `PATH`?
- Which filesystem is mounted at `/`?
- Which process is the parent of your shell?

## Common mistakes

- Assuming every Linux system uses the same package manager.
- Editing files in `/etc` without a backup or a plan.
- Running ordinary tasks as root because it is convenient.
- Treating `PATH` as a fixed list instead of a search order.
- Forgetting that a process identity determines what a command can access.

## Checkpoint

You are ready to continue when you can explain:

- The difference between the kernel, the shell and a distribution.
- Why `/proc` and `/sys` are special.
- What the filesystem hierarchy is for.
- How the shell finds and starts a command.
- Why users, groups and permissions are connected.

The next part sets up a safe lab and teaches the command line itself.
