# Logs, Troubleshooting and a Secure Baseline

A Linux system tells you what it is doing through logs, process state, exit codes and resource counters. Troubleshooting is the skill of asking a precise question, collecting the right evidence and changing one thing at a time. Security is the habit of reducing unnecessary access before something goes wrong.

## Where logs live

Modern systems centralize service logs in the systemd journal. Traditional text logs still exist under `/var/log`.

```bash
journalctl --no-pager | tail -n 50
journalctl -b --no-pager
journalctl -p err --no-pager
journalctl --since '1 hour ago' --no-pager
journalctl -u ssh --no-pager
```

| Location | Contents |
| --- | --- |
| `journalctl` | systemd journal, service output and kernel messages |
| `/var/log/syslog` | General system log on Debian and Ubuntu |
| `/var/log/auth.log` | Authentication events on Debian and Ubuntu |
| `/var/log/kern.log` | Kernel messages |
| `/var/log/dpkg.log` | Package installation history |
| `/var/log/apt/` | APT history and term logs |
| `/var/log/nginx/` | Web server logs, when installed |

Log locations vary by distribution. If a file is missing, check the service configuration and the distribution documentation.

`dmesg` shows the kernel ring buffer. It is useful for hardware, driver and boot messages:

```bash
dmesg | tail -n 50
dmesg --level=err,warn
```

## A troubleshooting method

Use the same loop every time:

1. **Define the symptom.** "The service is down" is too broad. "Requests to port 443 time out from this host" is testable.
2. **Check the simple things.** Is the host up? Is the cable or route present? Is the disk full? Is the clock correct?
3. **Reproduce the problem.** Find the smallest command that shows the failure.
4. **Collect evidence.** Read logs, inspect process state, check sockets and measure resources.
5. **Form one hypothesis.** Change one variable at a time.
6. **Verify the fix.** Repeat the original test and check the logs for new errors.
7. **Record what happened.** Future you will forget the details.

Avoid changing several things at once. If the problem disappears, you will not know which change fixed it.

## Common problems and first checks

| Symptom | First checks |
| --- | --- |
| Command not found | `PATH`, package installed, typo, shell function |
| Permission denied | `ls -l`, `id`, directory execute bit, ACL, mount options |
| Disk full | `df -h`, `df -i`, `du -sh`, deleted open files |
| Service will not start | `systemctl status`, `journalctl -u`, config syntax |
| Port already in use | `ss -tulpn`, process owner, service conflict |
| DNS fails | `/etc/resolv.conf`, `resolvectl`, `getent hosts`, `/etc/hosts` |
| SSH login fails | key permissions, `authorized_keys`, sshd config, auth log |
| Slow system | `uptime`, `top`, `free -h`, `vmstat`, disk latency |
| Boot fails | GRUB, initramfs, fstab, root UUID, recovery shell |

## Investigate a full disk

```bash
df -h
df -i
du -sh /var/* | sort -h
find /var/log -type f -size +100M -ls
lsof +L1
```

`df` reports filesystem usage. `du` reports directory usage. `lsof +L1` finds deleted files that are still open, which can hold space until the process is restarted.

Do not delete logs blindly. Check the service owner, retention policy and whether the file is currently open. Prefer log rotation or a controlled truncate over removing an active file.

## Investigate a service

```bash
systemctl status example --no-pager
journalctl -u example -n 50 --no-pager
systemctl cat example
systemctl show example -p ExecStart,User,WorkingDirectory
```

Read the unit, the service user, the working directory and the last error. A service can fail because a path is missing, a permission is wrong, a port is taken or a dependency is not ready.

If you change a unit file:

```bash
sudo systemctl daemon-reload
sudo systemctl restart example
systemctl status example --no-pager
```

## Investigate a network problem

```bash
ip -brief addr
ip route
getent hosts example.com
ss -tulpn
curl -v --max-time 5 https://example.com
```

Work from the bottom up: interface, address, route, name resolution, socket, application. If `curl` reaches an IP address but not a hostname, focus on DNS. If a local service listens on loopback only, a remote client cannot reach it.

## A practical security baseline

You do not need a perfect hardening guide to improve a system. Start with these controls:

1. **Patch regularly.** Apply security updates and reboot when the kernel or core libraries require it.
2. **Use least privilege.** Do not run services as root without a specific reason. Give users only the sudo rules they need.
3. **Protect SSH.** Prefer keys over passwords, disable direct root login where appropriate, and restrict access by user or network.
4. **Enable a firewall.** Allow only the services that should be reachable. Test from another host.
5. **Remove unused software.** Every installed service is another surface to maintain.
6. **Keep logs.** Make sure the journal or remote log destination survives a reboot if you need evidence.
7. **Back up important data.** Test a restore, not just a backup.
8. **Keep secrets out of shell history and world-readable files.** Use a secret manager or restricted file permissions.
9. **Monitor changes.** Track new services, new listening ports, new users and unexpected SUID files.
10. **Document the baseline.** A control you cannot verify is only an intention.

## Quick audit commands

```bash
who
last -n 10
sudo -l
ss -tulpn
systemctl --failed
find / -perm -4000 -type f 2>/dev/null
find / -perm -0002 -type f 2>/dev/null
df -h
free -h
```

Run these only on systems you own or are authorized to inspect. Interpret results in context. A SUID binary is not automatically malicious, and a world-writable file is not automatically a vulnerability.

## Backups and recovery

A backup plan should answer:

- What data must survive?
- How often can it change?
- How long can the system be down?
- Where is the backup stored?
- Who can restore it?
- When was the last successful restore test?

A copy on the same disk is not a backup. Keep at least one copy on a different device or location, and protect it from the same credentials that protect the live system.

## Logging architecture

Linux logging is a set of layers, not one file. The kernel, systemd, services and applications all produce records. Those records may go to the journal, to syslog, to application-specific files or to a remote collector.

| Layer | What it does |
| --- | --- |
| Kernel ring buffer | Hardware, driver, filesystem and boot messages |
| systemd journal | Collects service output, kernel messages and metadata |
| rsyslog or syslog-ng | Routes traditional syslog messages to files or remote hosts |
| Application logs | Service-specific files under `/var/log` or another configured path |
| Log rotation | Limits file size and retention |
| Remote logging | Sends copies to another host so local damage does not erase the record |

Check whether the journal is persistent:

```bash
cat /etc/systemd/journald.conf
ls -ld /var/log/journal
journalctl --disk-usage
```

If `/var/log/journal` does not exist and `Storage=auto` is set, the journal may be volatile and disappear at reboot. For a lab, volatile logs are fine. For a system you need to investigate, configure persistent storage or remote logging.

Limit journal size and retention in `/etc/systemd/journald.conf`:

```ini
[Journal]
Storage=persistent
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=30day
```

After changing the configuration:

```bash
sudo systemctl restart systemd-journald
journalctl --vacuum-time=7d
journalctl --vacuum-size=500M
```

`journalctl --vacuum-*` deletes old entries. Confirm retention requirements before running it.

Traditional logs are rotated by `logrotate`:

```bash
cat /etc/logrotate.conf
ls /etc/logrotate.d
sudo logrotate -d /etc/logrotate.conf
sudo logrotate -f /etc/logrotate.conf
```

`-d` is a debug dry run. `-f` forces rotation. A misconfigured rule can fill the disk or delete logs you need. Test with `-d` first.

## Auditing and file integrity

The audit subsystem records security-relevant events. It can log system calls, file access, user changes and command execution.

```bash
sudo systemctl status auditd
sudo auditctl -l
sudo ausearch -m USER_LOGIN -ts today
sudo aureport --summary
sudo aureport -au
```

`auditctl -l` lists active rules. `ausearch` queries the audit log. `aureport` summarizes events. Rules live in `/etc/audit/rules.d/` on many distributions. A broad rule set can generate a large volume of data, so start with a focused policy.

File integrity tools compare current files against a known baseline.

```bash
sudo aide --init
sudo aide --check
debsums -c
rpm -Va
```

AIDE builds a database of hashes and metadata. `debsums -c` checks Debian package files against their recorded checksums. `rpm -Va` verifies RPM package files. These tools detect changes to packaged files, not changes to data or configuration outside the package database.

A changed file is not automatically malicious. An administrator may have edited it, or a package update may have replaced it. Correlate with package history and logs.

Inspect login history:

```bash
who
w
last -n 20
lastlog
journalctl -u ssh --since today --no-pager
```

`who` shows current logins. `w` adds what each user is doing. `last` reads the login history. `lastlog` shows the most recent login for each account. These records can be incomplete or altered on a compromised host, so preserve them before cleanup.

## Performance troubleshooting

A slow system is not always short on CPU. Check the four main resources: CPU, memory, disk and network.

```bash
uptime
top
free -h
vmstat 1 5
iostat -xz 1 5
pidstat 1 5
sar -u 1 5
```

`uptime` shows load averages. Load counts runnable and uninterruptible tasks. A high load with low CPU usage often points to blocked I/O.

`free -h` shows memory, buffers, cache and swap. Linux uses spare memory for cache, so a low "free" value is normal. Look at available memory and swap activity.

`vmstat` shows runnable processes, blocked processes, swap in and out, I/O and CPU. A persistent `r` queue or high `wa` time deserves attention.

`iostat -xz` shows per-device utilization, queue size and latency. `pidstat` shows per-process CPU, memory and I/O. `sar` reads historical performance data when sysstat is installed and collection is enabled.

Pressure stall information is available on newer kernels:

```bash
cat /proc/pressure/cpu
cat /proc/pressure/memory
cat /proc/pressure/io
```

The `some` and `full` lines report the percentage of time tasks were stalled. Rising `full` values for memory or I/O often explain latency better than average utilization.

Investigate in this order:

1. Define the symptom and the time window.
2. Check load, CPU, memory, disk and network.
3. Identify the busiest process or device.
4. Correlate with logs and recent changes.
5. Change one thing and measure again.

Do not restart services at random. A restart hides evidence and may make the problem return later.

## A stronger security baseline

The earlier baseline is a starting point. A reproducible baseline adds verification.

1. **Inventory the system.** Know the OS, kernel, packages, services, users and listening ports.
2. **Patch on a schedule.** Track security updates and reboot when required.
3. **Remove unused software and services.** Every service is an attack surface.
4. **Use least privilege.** Limit sudo, service accounts, capabilities and file permissions.
5. **Harden SSH.** Keys only where possible, no direct root login, restrict users and source networks.
6. **Enable a default deny firewall.** Allow only required inbound traffic.
7. **Enable auditing and persistent logging.** Know what changed and keep the record.
8. **Protect secrets.** Use a secret manager or restricted files, not shell history or world-readable configuration.
9. **Back up and test restores.** A backup that has never been restored is a hope.
10. **Monitor drift.** Alert on new users, new listening ports, new services, unexpected SUID files and package changes.
11. **Document exceptions.** A control that is disabled needs an owner, a reason and an expiry date.
12. **Review regularly.** A baseline is a process, not a one-time checklist.

Useful verification commands:

```bash
getent passwd | awk -F: '$3 >= 1000 {print $1, $3, $7}'
ss -tulpn
systemctl list-unit-files --type=service --state=enabled
sudo find / -xdev -perm -4000 -type f -print 2>/dev/null
sudo find / -xdev -perm -0002 -type f -print 2>/dev/null
sudo apt list --upgradable
```

`-xdev` keeps `find` on one filesystem. That avoids crawling network mounts and pseudo filesystems. Review the results in context. A SUID binary or a world-writable file may be intentional.

## Incident response basics

An incident is not only a technical problem. It is a sequence of decisions under uncertainty. A small team needs a simple process.

1. **Prepare.** Keep contacts, backups, logging and an isolated analysis machine ready.
2. **Identify.** Confirm that an event is real and decide its scope.
3. **Contain.** Stop the spread without destroying evidence. Isolate the host at the network layer when possible.
4. **Preserve.** Capture memory, disk images, logs and relevant configuration before cleanup.
5. **Eradicate.** Remove the cause, not only the symptom.
6. **Recover.** Restore from a trusted baseline and monitor closely.
7. **Learn.** Record what happened, what worked and what failed.

Preservation commands depend on the environment. At minimum, record the time, the host, the current user, network connections, running processes and recent logs.

```bash
date -u
hostname
who
ss -tulpn
ps -eo pid,ppid,user,stat,cmd
journalctl --since '2 hours ago' --no-pager > incident-journal.txt
```

Do not run a full forensic collection from memory on a production host. Use a documented procedure, write-blockers for disk images and a chain of custody. The goal of this section is to teach the first hour, not to replace a forensic analyst.

## Backups, snapshots and recovery

A backup plan answers five questions:

- What data must survive?
- How much data can be lost?
- How long can recovery take?
- Where are the copies stored?
- Who has tested a restore?

The 3-2-1 rule is a useful default: at least three copies, on two different media, with one off-site. It is not a law. A small lab may use a local snapshot plus an encrypted remote copy.

Snapshots are not backups if they live on the same failing disk or in the same compromised account. They are useful for quick rollback, not for disaster recovery.

Test restoration:

```bash
rsync -av --dry-run backup/ restore/
sha256sum important.tar.gz
tar -tzf important.tar.gz | head
```

A dry run checks paths and permissions. A checksum verifies the copy. Listing an archive verifies that it can be read. None of these replaces a real restore into a clean directory.

## Monitoring without a platform

You do not need a full observability stack to notice problems.

- Check disk space and inode use daily.
- Check failed systemd units after boot.
- Check the journal for repeated errors.
- Check listening ports after package changes.
- Check certificate expiry for public services.
- Check backup completion and restore tests.
- Check login failures and new accounts.
- Check time synchronization.

A simple daily report script can cover the basics:

```bash
#!/usr/bin/env bash
set -euo pipefail

printf 'host: %s\n' "$(hostname)"
printf 'uptime: %s\n' "$(uptime -p)"
printf 'disk:\n'
df -h /
printf 'failed units:\n'
systemctl --failed --no-legend || true
printf 'listening:\n'
ss -tulpn
```

Run it from cron or a systemd timer and send the output to a location you actually read. A report nobody reads is not monitoring.

## Time, locale and certificates

Correct time is a security control. TLS certificates, Kerberos tickets, logs and scheduled jobs all depend on it.

```bash
timedatectl
timedatectl status
timedatectl list-timezones
sudo timedatectl set-timezone Europe/London
```

`timedatectl` shows the local time, universal time, time zone and synchronization state. A system with the wrong time may fail certificate validation or produce misleading logs.

Check the time synchronization service:

```bash
systemctl status systemd-timesyncd
chronyc tracking
chronyc sources
```

`systemd-timesyncd` is a simple client. `chrony` is common on servers and can act as a client or a server. Only one time daemon should manage the clock at a time.

Locale settings affect character encoding, collation and message language.

```bash
locale
localectl status
localectl list-locales
```

A UTF-8 locale is the normal choice:

```bash
sudo localectl set-locale LANG=en_US.UTF-8
```

Locale changes affect new sessions and services. They can change sort order, date formats and how programs handle non-ASCII text. Test scripts and reports after changing the locale.

Inspect TLS certificate expiry:

```bash
openssl x509 -in cert.pem -noout -subject -issuer -dates
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

The first command reads a local certificate. The second opens a TLS connection and reads the server certificate. Check the subject, issuer and expiration date. A certificate can be valid but issued for the wrong name, so also verify the hostname and chain.

For a quick expiry check in a script:

```bash
end=$(openssl x509 -in cert.pem -noout -enddate | cut -d= -f2)
date -d "$end" +%s
```

Convert the result to a date and compare it with the current time. Alert before expiry, not after.

## Lab: diagnose a controlled failure

In a disposable lab:

1. Stop a non-essential service.
2. Confirm the failure with `systemctl status`.
3. Read the last 30 journal lines for that unit.
4. Identify the first error, not the last symptom.
5. Fix the cause.
6. Restart the service and verify it is active.
7. Write a three-line incident note: symptom, cause, fix.

Then run the quick audit commands and explain which results are expected for your lab.

## Common mistakes

- Restarting a service before reading its logs.
- Deleting files to free space without finding the owner.
- Changing firewall rules without a second access path.
- Treating every warning as an emergency.
- Hardening a system without testing the result.

## Checkpoint

You should now be able to:

- Find system and service logs.
- Follow a repeatable troubleshooting method.
- Diagnose disk, service, network and permission failures.
- Apply a practical security baseline.
- Verify a fix instead of assuming it worked.

You now have the foundation to read the Linux for Hackers chapters with context. Start with Chapter 01, keep a lab snapshot and test every technique only on systems you own or have written permission to assess.
