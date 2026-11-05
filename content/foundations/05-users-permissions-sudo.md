# Users, Permissions and Sudo

Linux is a multi-user system. Every process has an identity, and every file has an owner, a group and a mode. The kernel uses those facts to decide whether an operation is allowed. This part teaches you to read that decision and change it deliberately.

## Identities

A user account has a username, a numeric user ID, a primary group and usually a home directory and login shell.

```bash
id
whoami
groups
getent passwd "$USER"
```

The account database is `/etc/passwd`. Each line has seven colon-separated fields:

```text
name:password:UID:GID:GECOS:home:shell
```

The password field is usually `x`, which means the hash is stored in `/etc/shadow`. Only privileged processes should read the shadow file.

Groups are defined in `/etc/group`. A user can belong to one primary group and many supplementary groups. Group membership is a convenient way to grant access to several users at once.

```bash
getent group sudo
getent group docker
```

## Permission bits

A long listing shows the mode, owner and group:

```text
-rw-r----- 1 alice analysts 1200 Jan 10 12:00 report.txt
```

The first character is the file type. The next nine characters are three sets of three permissions:

```text
owner  group  other
rw-    r--    ---
```

Each set can contain:

| Symbol | Meaning for a file | Meaning for a directory |
| --- | --- | --- |
| `r` | Read contents | List names |
| `w` | Change contents | Create, delete and rename entries |
| `x` | Execute the file | Enter the directory and access entries |

The execute bit on a directory is easy to miss. Without `x`, you cannot `cd` into it or access files by path, even if you can list its names.

## Octal notation

Each permission set is a number from 0 to 7:

| Value | Permissions |
| --- | --- |
| 0 | `---` |
| 1 | `--x` |
| 2 | `-w-` |
| 3 | `-wx` |
| 4 | `r--` |
| 5 | `r-x` |
| 6 | `rw-` |
| 7 | `rwx` |

So `755` means `rwxr-xr-x`, and `640` means `rw-r-----`.

```bash
chmod 640 report.txt
chmod 750 scripts
chmod u+x backup.sh
chmod g-w report.txt
chmod o-r report.txt
```

`chmod` accepts octal modes and symbolic modes. Symbolic modes use `u` for owner, `g` for group, `o` for other and `a` for all. `+` adds, `-` removes and `=` sets exactly.

## Change ownership

```bash
sudo chown alice report.txt
sudo chown alice:analysts report.txt
sudo chgrp analysts report.txt
```

Only root can give a file to another user. A normal user can change the group of a file only to a group they belong to, and only if the filesystem allows it. `chown -R` recurses, so use it carefully.

## The umask

When a process creates a file, the kernel starts from a default mode and removes the bits in the umask. A common umask is `022`:

- Files start at `666`, so `666` minus `022` gives `644`.
- Directories start at `777`, so `777` minus `022` gives `755`.

```bash
umask
umask 027
```

A umask of `027` gives files `640` and directories `750` by default. Set it in a shell startup file or a service definition when the default is too open.

## Special bits

Three special bits change normal permission behavior:

| Bit | Name | Effect |
| --- | --- | --- |
| `4000` | SUID | Program runs with the file owner's effective UID |
| `2000` | SGID | Program runs with the file group, or a directory inherits its group |
| `1000` | Sticky | Only the file owner, directory owner or root can delete entries |

```bash
find / -perm -4000 -type f 2>/dev/null
find / -perm -2000 -type f 2>/dev/null
ls -ld /tmp
```

SUID binaries are a normal part of many systems, but unexpected SUID files are worth investigating. Do not remove a special bit from a system binary without understanding what depends on it.

## Access control lists

The classic mode has only one owner and one group. Access control lists, or ACLs, allow more specific grants.

```bash
getfacl report.txt
setfacl -m u:bob:r report.txt
setfacl -m g:analysts:rw report.txt
setfacl -x u:bob report.txt
```

The `+` in a long listing indicates that a file has an ACL. Use `getfacl` before changing ACLs so you can see the existing entries.

## Sudo

`sudo` runs a command as another user, usually root, according to a policy in `/etc/sudoers` and `/etc/sudoers.d`.

```bash
sudo -l
sudo -u www-data id
sudo systemctl status ssh
```

`sudo -l` lists what your account is allowed to run. Read it carefully. A rule that allows a broad command can be equivalent to full root access, even if it looks limited.

Edit sudo policy with `visudo`, which checks syntax before saving:

```bash
sudo visudo
```

A simple rule looks like this:

```text
alice ALL=(ALL:ALL) ALL
```

That gives Alice full sudo access. A narrower rule might allow only one command:

```text
alice ALL=(root) /usr/bin/systemctl restart nginx
```

Even narrow rules need review. Some commands can start shells, edit arbitrary files or load configuration that runs as root. Treat sudo policy as security-sensitive code.

## Service accounts

Many services run as dedicated users such as `www-data`, `postgres` or `nginx`. These accounts usually have no login shell and no password. They exist to limit the damage if the service is compromised.

```bash
getent passwd www-data
ps -o user,pid,cmd -C nginx
```

Do not run a network service as root unless the service genuinely needs it and you have reviewed the design.

## Account databases and the login flow

Linux stores account information in a small set of text databases. The most important are:

| File | Contents |
| --- | --- |
| `/etc/passwd` | Username, UID, GID, description, home directory and shell |
| `/etc/shadow` | Password hashes and password aging, readable by root only |
| `/etc/group` | Group names, GIDs and member lists |
| `/etc/gshadow` | Group passwords and administrators, readable by root only |
| `/etc/login.defs` | Defaults for UID ranges, password aging and creation |
| `/etc/skel/` | Template files copied into new home directories |
| `/etc/nsswitch.conf` | Which sources provide users, groups, hosts and other names |

A simplified local login looks like this:

1. `getty` or a display manager presents a login prompt.
2. The login program collects a username and password.
3. PAM, the Pluggable Authentication Modules framework, runs the configured checks.
4. The system verifies the password hash in `/etc/shadow` or delegates to another source.
5. The login program sets the user and group identity, home directory and environment.
6. The user's login shell starts.

SSH logins follow a similar path. `sshd` authenticates the user, then starts the shell or the requested command. PAM policy can apply account restrictions, password quality rules, session limits and audit hooks.

Inspect your own entry and the resolved account data:

```bash
getent passwd "$USER"
getent group "$(id -gn)"
getent shadow "$USER"
lastlog -u "$USER"
```

Only root can read `/etc/shadow`. `getent` asks the name service switch, so it works with local files, LDAP or other sources. Reading `/etc/passwd` directly only shows the local file.

## Manage users and groups

On Debian and Ubuntu, `adduser` is a friendly wrapper around `useradd`. On other distributions, `useradd` is the standard low-level tool.

```bash
sudo adduser alice
sudo useradd -m -s /bin/bash bob
sudo passwd bob
sudo usermod -aG sudo bob
sudo usermod -s /bin/zsh bob
sudo userdel -r bob
```

| Task | Command |
| --- | --- |
| Create a user | `adduser alice` or `useradd -m alice` |
| Set a password | `passwd alice` |
| Add a supplementary group | `usermod -aG group user` |
| Change the login shell | `usermod -s /bin/bash user` |
| Lock an account | `usermod -L user` or `passwd -l user` |
| Unlock an account | `usermod -U user` or `passwd -u user` |
| Delete a user | `userdel -r user` |
| Create a group | `groupadd project` |
| Add a member to a group | `gpasswd -a user project` |
| Remove a member | `gpasswd -d user project` |

Be careful with `usermod -G`. Without `-a`, it replaces the user's supplementary groups instead of adding one. The safe form is `usermod -aG group user`.

Password aging is controlled with `chage`:

```bash
sudo chage -l alice
sudo chage -M 90 -W 14 alice
```

`-M` sets the maximum password age in days. `-W` sets the warning period. Password policy belongs in a documented standard, not only in one account's settings.

## PAM in one page

PAM sits between an application and the authentication mechanism. Applications such as `login`, `sshd`, `su` and `sudo` include PAM support. The rules live in `/etc/pam.d/`.

```bash
ls /etc/pam.d
cat /etc/pam.d/common-auth
cat /etc/pam.d/sshd
```

A PAM line has four fields: type, control, module and arguments.

```text
type    control  module-path              arguments
auth    required pam_unix.so
```

Common types are `auth` for authentication, `account` for account validity, `password` for password changes and `session` for session setup. Common controls are `required`, `requisite`, `sufficient` and `optional`.

PAM is powerful and easy to break. A mistake in `/etc/pam.d/common-auth` can lock every account out, including root. Keep a root shell open, make a backup and test in a disposable lab before changing authentication policy.

## Capabilities

Capabilities split root's power into smaller privileges. Instead of making a program SUID root, you can grant only the capability it needs.

```bash
getcap -r / 2>/dev/null
getpcaps $$
capsh --print
sudo setcap cap_net_bind_service=+ep /usr/local/bin/myserver
sudo getcap /usr/local/bin/myserver
sudo setcap -r /usr/local/bin/myserver
```

`cap_net_bind_service` allows a program to bind to a privileged port below 1024. `cap_net_raw` allows raw sockets. `cap_dac_override` bypasses file read, write and execute permission checks, so it is close to root for many purposes.

Capabilities are stored in extended attributes. They can be lost when a file is copied or replaced by a package upgrade. Treat an unexpected capability as a finding worth investigating.

## Security modules

Mandatory access control adds policy on top of the classic permission bits. The two common Linux implementations are SELinux and AppArmor.

SELinux is common on Red Hat family systems. It labels files and processes and enforces type-based rules.

```bash
getenforce
sestatus
ls -Z /var/www/html
ps -eZ | head
sudo ausearch -m avc -ts recent
```

AppArmor is common on Ubuntu and SUSE. It applies profiles to programs.

```bash
sudo aa-status
sudo aa-enforce /etc/apparmor.d/usr.bin.example
sudo aa-complain /etc/apparmor.d/usr.bin.example
```

Check which system your lab uses before changing policy. Disabling a security module to make one application work is usually the wrong fix. Write or adjust a profile instead.

## SSH key permissions

SSH is strict about private key and configuration permissions. A private key that other users can read is rejected.

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/config
```

The public key can be world-readable. The private key must not be. The `.ssh` directory should not be writable by anyone else. These rules apply to the account that owns the files, not to the client alone.

## Sudo in more detail

`sudo` caches an authentication timestamp for a short period. Use `sudo -k` to clear it and `sudo -v` to refresh it without running a command.

```bash
sudo -k
sudo -v
sudo -l
sudo -u www-data id
sudo -i
```

`sudo -i` starts a login shell as root. `sudo -u` runs a command as another user. `sudo -l` lists allowed commands. On some systems, a user may be allowed to run `sudo -l` but not to read the full policy.

Prefer files in `/etc/sudoers.d/` over editing `/etc/sudoers` directly. Always use `visudo -f` to validate syntax:

```bash
sudo visudo -f /etc/sudoers.d/lab
```

A rule that permits a text editor, a pager, a package manager, a scripting language or a service manager can often be turned into a full shell. Review sudo rules as code, not as a convenience list.

## Password hashes and shadow fields

Password hashes belong in `/etc/shadow`, not in `/etc/passwd`. A shadow line has nine colon-separated fields:

```text
name:hash:lastchange:min:max:warn:inactive:expire:reserved
```

| Field | Meaning |
| --- | --- |
| `name` | Username |
| `hash` | Password hash, `!` or `*` for a locked account, or an empty field for no password |
| `lastchange` | Days since 1970-01-01 when the password last changed |
| `min` | Minimum days before a password can be changed |
| `max` | Maximum days before a password must be changed |
| `warn` | Days before expiry to warn the user |
| `inactive` | Days after expiry before the account is disabled |
| `expire` | Account expiration date in days since 1970-01-01 |
| `reserved` | Reserved for future use |

A modern hash looks like `$6$...` for SHA-512 or `$y$...` for yescrypt. The prefix identifies the algorithm, and the rest includes a salt and the digest. Hashes are one-way functions, but weak passwords can still be guessed offline. That is why password length, uniqueness and rate limiting matter.

Check password status without revealing the hash:

```bash
sudo passwd -S alice
sudo chage -l alice
```

`passwd -S` shows whether the password is set, locked or empty, and the last change date. `chage -l` shows the aging policy.

Generate a hash for a lab account only when you have a reason:

```bash
openssl passwd -6
mkpasswd -m yescrypt
```

Do not paste real password hashes into tickets, chat or notes. Treat the shadow file as sensitive. Restrict backups that contain it and encrypt them.

## Lab: inspect and adjust a sandbox

```bash
mkdir -p ~/linux-foundations/lab05
cd ~/linux-foundations/lab05
printf 'sensitive lab data\n' > secret.txt
chmod 600 secret.txt
ls -l secret.txt
stat secret.txt
umask
```

Then:

1. Create a group called `labteam` if you have sudo access.
2. Add your user to the group.
3. Change the file group to `labteam`.
4. Set the mode to `640`.
5. Use `getfacl` to inspect it.
6. Explain why another normal user still cannot read it.

## Common mistakes

- Using `chmod 777` to solve an access problem.
- Forgetting that directory execute permission is required to access files inside.
- Running `chown -R` on the wrong path.
- Editing `/etc/sudoers` directly instead of using `visudo`.
- Assuming a service account is harmless because it cannot log in.

## Checkpoint

You should now be able to:

- Read UIDs, GIDs and group membership.
- Interpret symbolic and octal modes.
- Change ownership and permissions safely.
- Explain SUID, SGID and the sticky bit.
- Inspect sudo rights and understand why broad rules are dangerous.

Next you will look at the processes and services that use these permissions.
