## Sudo Misconfigurations for Privilege Escalation

Sudo misconfigurations are a primary vector for local privilege escalation. A single overly permissive rule in `/etc/sudoers` can allow a low-privileged user to gain a root shell. The core vulnerability arises when a user is allowed to run a program that can spawn a shell, read/write any file, or manipulate system files .

### 1. Enumeration: The First Step

An attacker's first action is to enumerate their own permissions.

- **List Sudo Permissions**: The `sudo -l` command is the primary tool used to list all commands a user is allowed to run as other users (including root) . If the `NOPASSWD` tag is set, this command requires no password, providing a complete view of the attack surface .

### 2. Common Misconfigurations & Exploitation

There are several common patterns of insecure `sudoers` rules.

#### A. The "Blank Check" (`ALL`) Rule
This is the most critical misconfiguration, typically seen as `(ALL) NOPASSWD: ALL` .
- **Immediate Root**: This rule grants the user unrestricted power. The simplest way to exploit it is by spawning a root shell:
  ```bash
  sudo /bin/bash
  ```
  or
  ```bash
  sudo -i
  ```
  

#### B. Allowing Shell-Spawnable Binaries
This is a far more common and subtle misconfiguration. Many standard Linux binaries (editors, pagers, file readers) have built-in functionalities that can be used to execute arbitrary system commands. An administrator might grant sudo access to `vim` or `less`, thinking it's safe, but these can trivially be used to get a shell .

- **Exploitation via GTFOBins**: This technique relies on referencing the community-curated list **GTFOBins** . If a sudo-allowed binary is listed, the exact command to get a shell is provided .
- **Examples**:
  - `find`: `sudo find . -exec /bin/bash \; -quit` 
  - `vim/vi`: `sudo vim -c ':!/bin/bash'` 
  - `awk`: `sudo awk 'BEGIN {system("/bin/bash")}'` 
  - `less`: `sudo less /etc/profile` then type `!sh` 
  - `nmap`: For older versions, `sudo nmap --interactive` then `!sh` 
  - `tar`: `sudo tar -cf /dev/null /dev/null --checkpoint=1 --checkpoint-action=exec=/bin/bash` 

#### C. Allowing File Manipulation & Path Hijacking
A rule that allows a binary to edit or write files can be just as dangerous.

- **Example: `sudo mkdir`**: If a user can run `sudo mkdir`, they can create a world-writable directory in a path that is automatically sourced by root. For instance, creating `/etc/bash_completion.d/` as a writable directory allows an attacker to place a script that executes as root the next time a user logs in via bash .
- **Example: `sudo tee`**: A rule like `user ALL=(root) NOPASSWD: /usr/bin/tee /var/lib/vz/*` can be exploited using path traversal (`../`) to overwrite critical files like `/etc/sudoers`, granting full root access .

#### D. Environment Variable Attacks (LD_PRELOAD)
If the `env_keep` option in `sudoers` preserves the `LD_PRELOAD` environment variable, an attacker can compile a shared object (`.so`) containing a malicious `setuid(0)` payload and execute any allowed binary to escalate to root .

### 3. Exploiting Vulnerabilities in Sudo Itself

Even a correctly configured `sudoers` file is not immune to vulnerabilities in the `sudo` binary itself.

- **CVE-2025-32462 (host matching)**: A host-matching flaw in `sudo` before 1.9.17p1. When a sudoers rule names a host that is neither the current host nor `ALL`, listed users can run commands on unintended machines. This is not an `-h` command-line bypass.
- **CVE-2025-32463 (--chroot exploit)**: In `sudo` versions 1.9.14 through 1.9.17, a user-controlled `/etc/nsswitch.conf` can be loaded when `sudo` runs with `--chroot`, allowing a local user to obtain root. This is a chroot path handling flaw, not a general sudoers misconfiguration.

**Mitigation**: Both CVEs were fixed in **sudo version 1.9.17p1**. Check the vendor advisory for your distribution's backported fix and affected version range.