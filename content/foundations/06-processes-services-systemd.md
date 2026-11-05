# Processes, Services and systemd

A running Linux system is a moving collection of processes. Some are short commands you start in a terminal. Others are long-lived services that start at boot and wait for work. Understanding both is essential for troubleshooting and for reading a system accurately.

## The process model

Every process has:

- A process ID, or PID.
- A parent process ID, or PPID.
- A user and group identity.
- A state, such as running, sleeping or stopped.
- Memory, open files and environment variables.
- A current working directory.

The first process started by the kernel is usually PID 1. On most modern distributions, PID 1 is `systemd`. It starts and supervises other services. A process tree shows how everything descends from PID 1.

```bash
ps -ef
ps aux
ps -o pid,ppid,user,stat,cmd -p $$
pstree -p
```

`$$` is the PID of the current shell. The `STAT` column shows the process state. Common values include `R` for running, `S` for sleeping, `D` for uninterruptible sleep, `T` for stopped and `Z` for zombie.

## Inspect resource use

```bash
top
htop
uptime
free -h
vmstat 1
```

`top` and `htop` show CPU, memory and process activity. `uptime` shows load averages for the last one, five and fifteen minutes. Load is not the same as CPU percentage: it counts runnable and uninterruptible tasks. A high load with low CPU use can mean storage or I/O is stalled.

`free -h` shows memory and swap. Linux uses free memory for cache, so "free" being low is not automatically a problem. Look at available memory and swap activity.

Inside `top`, press `k` to send a signal, `r` to renice a process and `q` to quit. `htop` exposes the same actions through function keys and a menu.

## Jobs in an interactive shell

A job is a command started from your shell. You can move it between the foreground and background.

```bash
sleep 300
```

Press `Ctrl+Z` to suspend it. Then:

```bash
jobs
bg %1
fg %1
```

`bg` continues the job in the background. `fg` brings it back to the foreground. A command started with `&` goes directly to the background:

```bash
sleep 300 &
jobs
```

Background jobs still belong to the shell. If the shell exits, they may receive a hangup signal. Use `nohup` or a service manager for work that must survive logout.

## Signals

A signal is an asynchronous notification. The `kill` command sends signals, despite its name.

```bash
kill -l
kill -TERM 1234
kill -INT 1234
kill -KILL 1234
```

| Signal | Common meaning |
| --- | --- |
| `SIGTERM` | Request termination; the process can clean up |
| `SIGINT` | Interrupt, usually from `Ctrl+C` |
| `SIGHUP` | Hangup or reload, depending on the program |
| `SIGKILL` | Force termination; cannot be caught |
| `SIGSTOP` | Stop the process; cannot be caught |
| `SIGCONT` | Continue a stopped process |

Start with `SIGTERM`. Give the process time to exit. Use `SIGKILL` only when a process is stuck and you understand the consequences. A killed database or editor can lose data.

Find and signal processes by name:

```bash
pgrep -a ssh
pkill -TERM -f 'python3 worker.py'
```

`pkill -f` matches the full command line. Check the matches with `pgrep -af` first so you do not kill the wrong process.

## Process control quick reference

Use this table when you know the task but not the command.

| Task | Command |
| --- | --- |
| List every process | `ps -ef` or `ps aux` |
| Show one user's processes | `ps -u alice` |
| Show a process by name | `ps -C nginx -o pid,cmd` |
| Find a process by name | `pgrep -a nginx` or `pidof nginx` |
| Show the process tree | `pstree -p` |
| Watch live resource use | `top` or `htop` |
| Send a signal | `kill -TERM PID` |
| Signal by name | `pkill -TERM nginx` or `killall nginx` |
| Stop and resume | `kill -STOP PID`, then `kill -CONT PID` |
| Wait for a child | `wait PID` |
| Run in the background | `command &` |
| Keep running after logout | `nohup command > log 2>&1 &` |
| Remove a job from the shell table | `disown %1` |
| Limit runtime | `timeout 30s command` |
| Repeat a command | `watch -n 2 command` |
| Change priority | `nice -n 10 command`, `renice 10 -p PID` |

Examples:

```bash
pgrep -af 'python.*worker'
kill -TERM "$(pgrep -f 'python.*worker')"
timeout 10s ping -c 1 example.com
watch -n 2 'ss -tulpn'
nohup ./backup.sh > backup.log 2>&1 &
disown
```

`killall` matches process names and is not available on every system. `pkill -f` matches the full command line, so verify the matches with `pgrep -af` first. `wait` only works for children of the current shell. `disown` removes a job from the shell's job table so the shell does not send it a hangup signal when it exits. It does not make a badly behaved program into a service. Use systemd for anything that must survive reboots and be monitored.

## The /proc filesystem

`/proc` exposes process and kernel information as a virtual filesystem.

```bash
ls /proc/$$
cat /proc/$$/status
cat /proc/$$/cmdline | tr '\0' ' '
ls -l /proc/$$/cwd
ls -l /proc/$$/fd
```

The `fd` directory lists open file descriptors. The `cwd` link points to the current working directory. These views are generated by the kernel and change as the process changes.

## systemd services

A service is a long-running program managed by an init system. systemd uses unit files to describe services, sockets, timers, mounts and targets.

```bash
systemctl status ssh
systemctl is-enabled ssh
systemctl is-active ssh
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service
```

Common actions:

```bash
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
sudo systemctl disable nginx
```

`start` changes the current state. `enable` changes whether the service starts at boot. They are separate decisions. `reload` asks the service to reread its configuration without a full restart, but not every service supports it.

## Read service logs

systemd captures service output in the journal.

```bash
journalctl -u ssh --no-pager
journalctl -u ssh -n 50 --no-pager
journalctl -u ssh --since '1 hour ago'
journalctl -u ssh -f
```

`-u` selects a unit. `-n` limits the number of lines. `--since` filters by time. `-f` follows new entries. If the journal is not persistent across reboots, check `/etc/systemd/journald.conf`.

## Unit files

System and package unit files usually live in `/usr/lib/systemd/system`. Local administrator overrides belong in `/etc/systemd/system`. Do not edit package-owned files directly if you can use an override.

```bash
systemctl cat ssh
systemctl show ssh -p FragmentPath,ExecStart,User
```

A minimal service unit looks like this:

```ini
[Unit]
Description=Example worker
After=network.target

[Service]
Type=simple
User=worker
WorkingDirectory=/opt/example
ExecStart=/opt/example/worker
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

After creating or changing a unit:

```bash
sudo systemctl daemon-reload
sudo systemctl restart example
systemctl status example
```

`daemon-reload` rereads unit files. It does not restart services by itself.

## Process lifecycle and exit status

A process starts when another process creates it. On Linux, the usual sequence is:

1. The parent calls `fork` or `clone` to create a child.
2. The child calls `execve` to replace its memory image with a new program.
3. The program runs and eventually calls `exit` with a status.
4. The parent calls `wait` or `waitpid` to collect the status.

A process that has exited but whose parent has not collected its status is a zombie. It uses a process table slot but no CPU or memory. A zombie is not a sign of a runaway process. It is a sign that the parent is not reaping children. If a service leaves many zombies, investigate the service, not the zombies.

An orphan is a process whose parent exited first. It is adopted by PID 1 or by a subreaper, which is responsible for reaping it.

Inspect process states and parentage:

```bash
ps -eo pid,ppid,stat,user,comm --sort=ppid
ps -eo stat,comm | awk '$1 ~ /^Z/ {print}'
pstree -ap
```

The `STAT` field uses codes such as `R` for running, `S` for interruptible sleep, `D` for uninterruptible sleep, `T` for stopped, `Z` for zombie and `I` for idle kernel thread. A process in `D` state is usually waiting on I/O and cannot be killed until the I/O completes.

Exit status is a small integer from 0 to 255. Zero means success. The meaning of non-zero values is defined by the program. Shells expose the last status through `$?`.

```bash
ls /etc/passwd
printf 'status=%s\n' "$?"
ls /does-not-exist
printf 'status=%s\n' "$?"
```

A pipeline reports the status of its last command unless `pipefail` is enabled. That detail matters in scripts.

## Resource limits and cgroups

Traditional Unix limits are set per process with `ulimit` or `prlimit`.

```bash
ulimit -a
ulimit -n
ulimit -u
prlimit --pid $$
prlimit --pid $$ --nofile=4096
```

`ulimit -n` is the open file descriptor limit. `ulimit -u` is the process limit. A shell can lower limits for its children, but raising a hard limit usually requires privilege. Systemd services can set limits in their unit files.

Control groups, or cgroups, organize processes and account for or limit resources. systemd uses cgroups to track services, slices and user sessions.

```bash
systemd-cgls
systemd-cgtop
cat /proc/$$/cgroup
```

`systemd-cgls` shows the cgroup tree. `systemd-cgtop` shows resource use by cgroup. On a modern system, the cgroup version is usually v2, mounted at `/sys/fs/cgroup`.

A systemd unit can set resource controls:

```ini
[Service]
MemoryMax=512M
CPUQuota=50%
TasksMax=100
```

These limits apply to the service's cgroup. They are more reliable than a shell `ulimit` for long-running services.

## Process inspection tools

`ps` and `top` are the starting point. The following tools answer more specific questions.

| Tool | Question |
| --- | --- |
| `pgrep` | Which PIDs match a name or pattern? |
| `pstree` | How are processes related? |
| `lsof` | Which files, sockets and devices does a process have open? |
| `fuser` | Which process is using this file, mount or port? |
| `strace` | Which system calls is a process making? |
| `ltrace` | Which library calls is a process making? |
| `pidstat` | How much CPU, memory and I/O is each process using over time? |
| `iostat` | How busy are the block devices? |
| `iotop` | Which processes are doing disk I/O? |

Examples:

```bash
pgrep -a ssh
lsof -p $$
lsof -i :22
fuser -v /var/log/syslog
strace -p 1234 -f -e trace=file
strace -c ls /
```

`strace` can slow a process significantly and may be blocked by security policy. Use it for short diagnostic sessions. `lsof -i :22` shows processes with a socket on port 22. `fuser` is useful before unmounting a filesystem.

The `/proc` filesystem exposes per-process state:

```bash
cat /proc/$$/status
cat /proc/$$/limits
cat /proc/$$/environ | tr '\0' '\n'
ls -l /proc/$$/fd
readlink /proc/$$/exe
```

These files are generated by the kernel. Reading another user's process information may be restricted by `hidepid` mount options or security modules.

## Nice values and scheduling

The scheduler decides which runnable process gets CPU time. Nice values influence that decision. The range is usually -20 to 19. Lower values mean higher priority. Only root can set negative values.

```bash
nice -n 10 command
renice 10 -p 1234
ionice -c 2 -n 7 -p 1234
```

`ionice` adjusts I/O priority on supported schedulers. It is not a guarantee. A process can still wait on a slow disk.

Do not use `renice` to fix a design problem. If a service is consistently starving others, investigate its workload, limits and concurrency.

## Timers and targets

systemd timers schedule work without cron. A timer unit activates a service unit.

```bash
systemctl list-timers --all
systemctl status apt-daily.timer
systemctl cat apt-daily.timer
```

A simple pair looks like this:

```ini
# /etc/systemd/system/lab-report.timer
[Unit]
Description=Run the lab report daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/lab-report.service
[Unit]
Description=Build the lab report

[Service]
Type=oneshot
ExecStart=/usr/local/bin/lab-report.sh
```

Enable and start the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lab-report.timer
systemctl list-timers lab-report.timer
journalctl -u lab-report.service --no-pager
```

`Persistent=true` runs a missed job after the machine boots. `OnCalendar=daily` is a simple schedule. Use `systemd-analyze calendar` to test expressions.

Targets group units into states. The default target is roughly the old runlevel.

```bash
systemctl get-default
systemctl list-units --type=target
systemctl isolate multi-user.target
systemctl isolate graphical.target
```

Do not isolate targets on a remote system unless you understand which services will stop.

## Service hardening

systemd can restrict a service even if the application has no sandbox of its own.

```ini
[Service]
User=app
Group=app
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/app
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
```

These options are not universal. Some applications need access to `/home`, raw sockets or kernel interfaces. Add restrictions one at a time, restart the service and test. A service that starts is not necessarily a service that works.

Inspect the effective sandbox:

```bash
systemctl show app -p User -p Group -p NoNewPrivileges -p ProtectSystem
systemd-analyze security app
```

`systemd-analyze security` gives a rough exposure score and explains which directives are missing. Use it as a prompt for review, not as a compliance certificate.

## Kernel modules and sysctl

The kernel can load code at runtime as modules. Drivers, filesystems and networking features are often modules.

```bash
lsmod
modinfo ext4
modinfo -p e1000e
sudo modprobe dummy
lsmod | grep dummy
sudo modprobe -r dummy
```

`lsmod` shows loaded modules and their reference counts. `modinfo` shows metadata and parameters. `modprobe` loads a module and its dependencies. `modprobe -r` removes it if nothing is using it.

Persistent module configuration belongs in `/etc/modules-load.d/` and `/etc/modprobe.d/`.

```bash
cat /etc/modules-load.d/*.conf
ls /etc/modprobe.d
```

A file in `modules-load.d` lists modules to load at boot. A file in `modprobe.d` sets options or blacklists a module. Do not unload a storage or network module on a live system. The device may stop working immediately.

Kernel tunables are exposed through `sysctl`.

```bash
sysctl -a
sysctl net.ipv4.ip_forward
sysctl vm.swappiness
sudo sysctl -w net.ipv4.ip_forward=1
```

`sysctl -a` lists every tunable and can be very long. Query one key at a time. A change with `-w` lasts until reboot.

Persistent settings belong in `/etc/sysctl.d/`.

```ini
# /etc/sysctl.d/99-lab.conf
net.ipv4.ip_forward = 1
vm.swappiness = 10
```

Apply and verify:

```bash
sudo sysctl --system
sysctl net.ipv4.ip_forward
```

A tunable can improve one workload and harm another. Change one value, measure, and document why. Kernel hardening guides often set many values at once; understand each one before copying a list.

## Lab: observe a service

```bash
systemctl status ssh --no-pager
journalctl -u ssh -n 20 --no-pager
ps -o pid,ppid,user,stat,cmd -C sshd
```

Then answer:

1. Is the SSH service active and enabled?
2. Which user owns the SSH daemon processes?
3. What is the parent PID of the daemon?
4. Which log entries appeared most recently?
5. What happens to the service state if you run `sudo systemctl stop ssh` in a disposable lab?

Do not stop SSH on a remote machine unless you have another way to regain access.

## Common mistakes

- Using `kill -9` as a first response.
- Confusing `start` with `enable`.
- Editing a package unit file instead of creating an override.
- Forgetting `daemon-reload` after changing a unit.
- Assuming a process is healthy because it is running.

## Checkpoint

You should now be able to:

- Read a process tree and process states.
- Inspect CPU, memory and load.
- Manage foreground and background jobs.
- Send the right signal for the situation.
- Inspect, start, enable and troubleshoot a systemd service.

Next you will manage software, storage and the boot process.
