# Packages, Storage and Boot

A Linux system is more than a kernel and a shell. It has software packages, filesystems, mount points and a boot sequence. This part gives you the working knowledge to install tools, inspect disks and understand what happens between pressing the power button and reaching a login prompt.

## Package managers

A package manager tracks installed software, resolves dependencies, verifies signatures and records file ownership. The main families are:

| Family | Low-level tool | High-level tool | Query examples |
| --- | --- | --- | --- |
| Debian | `dpkg` | `apt` | `apt list --installed`, `dpkg -L package` |
| Red Hat | `rpm` | `dnf` | `dnf list installed`, `rpm -ql package` |
| Arch | `pacman` | `pacman` | `pacman -Q`, `pacman -Ql package` |
| SUSE | `rpm` | `zypper` | `zypper packages --installed-only` |

The high-level tool talks to repositories, downloads packages and resolves dependencies. The low-level tool works with local package files and the package database.

## Debian and Ubuntu workflow

```bash
sudo apt update
apt search nginx
apt show nginx
sudo apt install nginx
sudo apt upgrade
sudo apt remove nginx
sudo apt purge nginx
sudo apt autoremove
```

`apt update` refreshes the repository index. It does not upgrade installed packages. `apt upgrade` installs available updates. `apt full-upgrade` can also remove or add packages to resolve dependencies, so read the plan before confirming.

Useful package queries:

```bash
dpkg -l | head
dpkg -L nginx
dpkg -S /usr/sbin/nginx
apt list --upgradable
```

`dpkg -L` lists files owned by an installed package. `dpkg -S` finds which package owns a path. That is useful when you are deciding whether a file is safe to change.

Ubuntu can install security updates automatically. `unattended-upgrades` is useful on servers, but it does not remove the need to read logs, test services and reboot when a kernel update requires it.

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
systemctl status unattended-upgrades
```

Read the configuration before enabling it:

```bash
cat /etc/apt/apt.conf.d/50unattended-upgrades
```

## Repository trust

A package repository is configured in files under `/etc/apt/sources.list` and `/etc/apt/sources.list.d`. Each repository should have a signing key. Do not add an arbitrary repository or key just because a tutorial says so. A trusted repository can run maintainer scripts as root during installation.

Before adding a third-party repository:

1. Confirm the publisher and the exact URL.
2. Check how the key is fetched and stored.
3. Read the package's maintainer scripts if the source is unfamiliar.
4. Prefer distribution packages when they are sufficient.
5. Remove the repository when you no longer need it.

## Inspect disks and space

```bash
lsblk
lsblk -f
df -h
df -i
du -sh /var/log
du -h --max-depth=1 /var | sort -h
```

`lsblk` shows block devices and their tree. `df -h` shows filesystem usage. `df -i` shows inode usage; a filesystem can be out of inodes even when it has free space. `du` measures directory usage.

A full disk is one of the most common production failures. Check both space and inodes, then find the largest directories. Do not delete random files in `/var` before you know what owns them.

## Mount points and fstab

A filesystem must be mounted before you can access its files. The kernel mounts the root filesystem during boot, then systemd or the init scripts mount the rest according to `/etc/fstab`.

```bash
findmnt
findmnt /
mount
cat /etc/fstab
```

A typical fstab entry uses a UUID:

```text
UUID=1234-abcd /data ext4 defaults,noatime 0 2
```

The fields are: device, mount point, filesystem type, options, dump flag and fsck order. Use `blkid` to find UUIDs. Test fstab changes with `mount -a` before rebooting. A bad fstab entry can prevent the system from booting cleanly.

```bash
sudo blkid
sudo mkdir -p /data
sudo mount /dev/sdb1 /data
sudo umount /data
```

Always unmount a filesystem before removing the device. `umount` fails if files are open; use `lsof` or `fuser` to find the users, then close them properly.

If a filesystem was mounted read-only after an error, remount it read-write only after checking the logs and the disk:

```bash
sudo mount -o remount,rw /data
```

A remount does not repair the underlying problem. It only changes the mount flags.

## Swap

Swap extends memory pressure handling by moving inactive pages to disk. It is not a replacement for enough RAM.

```bash
swapon --show
free -h
cat /proc/swaps
```

Swap can be a partition or a swap file. A swap file is easy to create on an existing filesystem:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
swapon --show
free -h
```

`fallocate` reserves the space, `chmod 600` prevents other users from reading the file, `mkswap` writes the swap signature, and `swapon` activates it. If `fallocate` is not supported on the filesystem, use `dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress`.

Make the swap file persistent by adding a line to `/etc/fstab`:

```text
/swapfile none swap sw 0 0
```

Test the entry before rebooting:

```bash
sudo swapoff /swapfile
sudo swapon -a
swapon --show
```

`swapon -a` activates all swap entries in `/etc/fstab`. To remove the file, disable it first:

```bash
sudo swapoff /swapfile
sudo rm /swapfile
```

Then remove the `/etc/fstab` line. Never delete an active swap file.

Check and tune swappiness:

```bash
sysctl vm.swappiness
sudo sysctl -w vm.swappiness=10
```

`vm.swappiness` influences how aggressively the kernel moves anonymous pages to swap. Lower values favor keeping application memory in RAM. The right value depends on the workload. Make persistent changes in `/etc/sysctl.d/`, not only with `-w`. A swap partition uses `mkswap /dev/sdX` and `swapon /dev/sdX` instead of a file.

## The boot sequence

A simplified Linux boot sequence looks like this:

1. Firmware initializes hardware and selects a boot device.
2. The bootloader, often GRUB, loads the kernel and initramfs.
3. The kernel initializes drivers and mounts the initramfs.
4. The initramfs loads the modules needed to mount the real root filesystem.
5. The kernel starts PID 1, usually systemd.
6. systemd starts units until the default target is reached.
7. A login manager or getty presents a login prompt.

Useful inspection commands:

```bash
systemctl get-default
systemctl list-units --type=target
journalctl -b --no-pager | head -n 50
journalctl -b -p err --no-pager
dmesg | head -n 50
```

`journalctl -b` shows the current boot. `-p err` filters to error priority and above. `dmesg` shows the kernel ring buffer, which is useful for hardware and driver messages.

## Boot problems

| Symptom | First checks |
| --- | --- |
| Firmware does not find a boot device | Boot order, disk detection, bootloader entry |
| Kernel starts but root is not found | Kernel command line, initramfs, disk UUID |
| System reaches emergency mode | fstab, failed mounts, filesystem errors |
| Login prompt never appears | Failed units, display manager, getty |
| System boots slowly | `systemd-analyze`, `systemd-analyze blame` |
| Service fails at boot | `systemctl status`, `journalctl -u` |

```bash
systemd-analyze
systemd-analyze blame
systemctl --failed
```

Do not guess at boot repairs on a machine you cannot access physically. Know how to use a recovery shell or a live environment first.

## Beyond apt: other package ecosystems

Debian and Ubuntu are common in labs, but you will meet other systems. The concepts stay the same: repositories, metadata, dependencies, signatures and a local database.

| System | Install | Search | Remove | List files |
| --- | --- | --- | --- | --- |
| Debian, Ubuntu | `apt install pkg` | `apt search pkg` | `apt remove pkg` | `dpkg -L pkg` |
| Fedora, RHEL | `dnf install pkg` | `dnf search pkg` | `dnf remove pkg` | `rpm -ql pkg` |
| Arch | `pacman -S pkg` | `pacman -Ss pkg` | `pacman -R pkg` | `pacman -Ql pkg` |
| openSUSE | `zypper install pkg` | `zypper search pkg` | `zypper remove pkg` | `rpm -ql pkg` |
| Alpine | `apk add pkg` | `apk search pkg` | `apk del pkg` | `apk info -L pkg` |

Refresh, upgrade and clean with the native tools:

```bash
sudo dnf check-update
sudo dnf upgrade
sudo dnf autoremove
sudo pacman -Syu
sudo pacman -Rns package
sudo zypper refresh
sudo zypper update
sudo zypper remove package
```

`dnf upgrade` and `pacman -Syu` refresh metadata and install updates in one step. `apt` separates `update` (refresh metadata) from `upgrade` (install). Read the transaction summary before confirming. A partial upgrade on a rolling distribution can leave the system in a mixed state.

Universal package formats sit beside the distribution manager:

```bash
snap list
snap find firefox
sudo snap install firefox
flatpak list
flatpak search org.example.App
flatpak install flathub org.example.App
```

Snap and Flatpak packages bundle their dependencies and run with their own sandbox rules. They solve some compatibility problems and create new ones: larger downloads, duplicate libraries, different update paths and separate permission models.

AppImage is a single executable file. It does not install system-wide. Treat an AppImage like any other downloaded binary: verify its source and checksum before running it.

Language-specific package managers such as `pip`, `npm`, `gem` and `cargo` are useful for development. They are not a replacement for system packages when the software provides a system service. Mixing them can create duplicate versions and files that the system package manager does not track.

## Build software from source

Sometimes a package is not available, or you need a specific version. Building from source gives control but shifts responsibility for updates, dependencies and security patches to you.

A typical autotools build looks like this:

```bash
tar -xJf project-1.2.3.tar.xz
cd project-1.2.3
./configure --prefix=/usr/local
make
sudo make install
```

Read the project's build instructions first. `./configure --help` lists options. `make -j"$(nproc)"` builds in parallel. `make install` copies files into the prefix.

A safer staging step is:

```bash
make DESTDIR="$PWD/package" install
find package -type f | head
```

This collects the installed files in a temporary tree so you can inspect them before copying to the live system. Packaging tools such as `checkinstall` can turn the result into a distribution package, but they are not a substitute for a proper package recipe.

Record the version, source URL, checksum and build options. Future updates depend on that record.

## Checksums and signatures

A checksum detects accidental corruption and simple tampering. A signature verifies who published a file, assuming you trust the public key.

```bash
sha256sum project-1.2.3.tar.xz
sha256sum -c project-1.2.3.tar.xz.sha256
gpg --verify project-1.2.3.tar.xz.sig project-1.2.3.tar.xz
```

If the checksum does not match, stop. Do not try to fix the file. Download it again from the official source and compare the published checksum through a second channel.

GPG key handling matters:

```bash
gpg --list-keys
gpg --import publisher.asc
gpg --fingerprint publisher@example.org
```

Check the fingerprint against an independent source. A key downloaded from the same page as the file does not prove much if that page was compromised. Key trust is a social and operational problem, not only a command-line one.

Debian and Ubuntu package managers verify repository signatures automatically. Do not disable signature checks to make an installation proceed. Fix the repository configuration or choose a different source.

## Partitions, filesystems and LVM

A disk can be divided into partitions. A partition can hold a filesystem, swap, LVM physical volume or another structure.

```bash
lsblk
sudo fdisk -l
sudo parted -l
sudo blkid
```

`lsblk` shows the device tree. `fdisk -l` and `parted -l` list partition tables. `blkid` shows UUIDs, labels and filesystem types.

Create a filesystem only on the correct device:

```bash
sudo mkfs.ext4 /dev/sdb1
sudo mkfs.xfs /dev/sdc1
```

This destroys existing data. Confirm the device path twice. Disk names can change when hardware is added or removed. UUIDs are more stable in `/etc/fstab`.

### Walk through a new disk

The following sequence is an example for a new, empty disk. Confirm the device name with `lsblk` before every step. On a lab machine, `/dev/sdb` might be the disk you intend to use, or it might be a USB drive with data you need.

```bash
lsblk
sudo fdisk -l /dev/sdb
sudo fdisk /dev/sdb
```

Inside `fdisk`, the usual sequence for one Linux partition on a DOS label is:

```text
n       create a new partition
p       choose a primary partition
1       partition number
Enter   accept the default first sector
Enter   accept the default last sector
w       write the table and exit
```

`q` quits without writing. `d` deletes a partition. `p` prints the table. Read the prompts instead of typing from memory. After writing:

```bash
sudo partprobe /dev/sdb
lsblk -f /dev/sdb
sudo mkfs.ext4 /dev/sdb1
sudo mkdir -p /data
sudo mount /dev/sdb1 /data
df -h /data
```

Make the mount persistent with the filesystem UUID, not the device name:

```bash
sudo blkid /dev/sdb1
sudoedit /etc/fstab
```

Add a line such as:

```text
UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx /data ext4 defaults,nofail 0 2
```

Then test:

```bash
sudo umount /data
sudo mount -a
findmnt /data
```

`nofail` lets the system boot if the disk is missing. That is useful for removable data disks and dangerous for a disk that a required service needs. Use `defaults` only after you understand the mount options you need. For GPT disks, use `parted` or `gdisk`; the concepts are the same.

LVM adds a layer between disks and filesystems. Do not run this sequence on the same disk you just partitioned unless you intend to replace that layout. Use a separate empty disk or an unused partition. Inspect existing objects before you create new ones:

```bash
sudo pvs
sudo vgs
sudo lvs
```

Only run `pvcreate` on a disk or partition you intend to dedicate to LVM. It overwrites existing filesystem signatures:

```bash
sudo pvcreate /dev/sdb
sudo vgcreate vg0 /dev/sdb
sudo lvcreate -L 10G -n data vg0
sudo mkfs.ext4 /dev/vg0/data
sudo mkdir -p /data
sudo mount /dev/vg0/data /data
```

`pvs`, `vgs` and `lvs` show physical volumes, volume groups and logical volumes. Extending a logical volume does not automatically grow the filesystem. Run the filesystem-specific resize command after the volume change:

```bash
sudo lvextend -L +5G /dev/vg0/data
sudo resize2fs /dev/vg0/data
```

Check and repair a filesystem only when it is unmounted, or at boot before it is mounted:

```bash
sudo umount /dev/sdb1
sudo fsck -f /dev/sdb1
```

Running `fsck` on a mounted read-write filesystem can cause damage. Know the filesystem type and read the tool's manual page.

## Disk health and I/O errors

`smartctl` reads drive health data when the drive supports it.

```bash
sudo smartctl -a /dev/sda
sudo smartctl -t short /dev/sda
sudo smartctl -l selftest /dev/sda
```

Look for reallocated sectors, pending sectors, uncorrectable errors and a failing self-test. A single old error may be historical. A growing count is a warning.

Kernel messages record I/O and hardware problems:

```bash
dmesg -T | tail -n 50
dmesg -T --level=err,warn
journalctl -k -p err --no-pager
```

`-T` prints human-readable timestamps when the kernel log supports them. On some systems, `dmesg` access is restricted. Use `journalctl -k` as an alternative.

Do not run destructive surface tests on a disk that holds data you need. Back up first. A failing drive can fail completely during a stress test.

## Bootloader, initramfs and recovery

The boot process depends on a bootloader, a kernel, an initramfs and the init system. Recovery means knowing how to interrupt and repair each stage.

GRUB is the most common bootloader on x86 systems.

```bash
cat /etc/default/grub
sudo update-grub
sudo grub2-mkconfig -o /boot/grub2/grub.cfg
```

The first command is used on Debian and Ubuntu. The second is common on Red Hat family systems. The configuration path varies. Check the distribution documentation before regenerating a bootloader configuration.

The initramfs contains the early userspace needed to mount the real root filesystem. Rebuild it after changing storage drivers, RAID, LVM or encryption configuration.

```bash
sudo update-initramfs -u
sudo dracut -f
```

Use the command that matches your distribution. A missing driver in the initramfs can make the system unbootable even when the kernel and root filesystem are fine.

Recovery options:

- Boot into a rescue or emergency target.
- Add `systemd.unit=rescue.target` to the kernel command line.
- Boot a live USB and mount the installed system.
- Use `chroot` to repair the installed system from the live environment.

A typical chroot repair sequence:

```bash
lsblk
sudo mount /dev/sda2 /mnt
sudo mount /dev/sda1 /mnt/boot
sudo mount --bind /dev /mnt/dev
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo chroot /mnt
```

Inside the chroot, you can reinstall the bootloader, rebuild the initramfs or repair configuration. Exit with `exit`, then unmount in reverse order.

Do not run a chroot repair sequence from memory on a production machine. Read the distribution's recovery guide and confirm every device path.

## Containers and isolated services

Containers package an application with its user-space dependencies and run it in an isolated view of the host. They share the host kernel, so they are lighter than virtual machines and not a complete security boundary.

Docker and Podman are common runtimes. Their basic commands are similar.

```bash
docker ps
docker images
docker run --rm -it alpine sh
docker logs container_name
docker exec -it container_name sh
docker inspect container_name
docker stop container_name
```

Podman uses the same command shape:

```bash
podman ps
podman run --rm -it alpine sh
podman logs container_name
```

`--rm` removes the container when it exits. `-it` attaches an interactive terminal. `docker logs` reads the container's standard output. `docker exec` starts a process inside a running container.

Persistent data should live in a volume or a bind mount, not in the container's writable layer.

```bash
docker volume create appdata
docker run -d --name app -v appdata:/var/lib/app image:tag
docker run --rm -v "$PWD/data:/data:ro" alpine ls /data
```

The `:ro` suffix mounts the host directory read-only. A bind mount gives the container direct access to a host path. Treat that access as a privilege decision.

Inspect the container's isolation:

```bash
docker inspect --format '{{.Config.User}}' container_name
docker inspect --format '{{json .Mounts}}' container_name
docker top container_name
```

Run as a non-root user inside the image when possible. Do not mount the Docker socket into a container unless you intend to give it control over the host's container runtime. A container with the host Docker socket is effectively root on the host.

Docker Compose describes multi-container services in YAML:

```yaml
services:
  web:
    image: nginx:stable
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
```

Use `docker compose up -d` to start and `docker compose down` to stop. Read the compose file before running it. Port mappings, volumes and environment variables define the container's exposure.

## Lab: inspect a safe system

```bash
lsblk -f
df -h
df -i
findmnt /
cat /etc/fstab
systemctl get-default
systemctl --failed
journalctl -b -p err --no-pager | head -n 20
```

Then answer:

1. Which filesystem is mounted at `/`?
2. How much space and how many inodes are free?
3. Which device provides the root filesystem?
4. Are any units failed?
5. What is the default systemd target?

## Common mistakes

- Running `apt upgrade` without reading the proposed changes.
- Adding repositories and keys from untrusted sources.
- Deleting files to free space without finding the owner.
- Editing fstab without testing with `mount -a`.
- Rebooting a broken system before collecting logs.

## Checkpoint

You should now be able to:

- Install, query and remove packages on Debian or Ubuntu.
- Explain the difference between a package and a repository.
- Inspect disks, filesystems, inodes and mounts.
- Read fstab and test a mount change safely.
- Describe the Linux boot sequence and find boot errors.

Next you will connect the system to a network and inspect it from the command line.
